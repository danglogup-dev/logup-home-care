import { z } from "npm:zod@3";
import { authenticate, corsHeaders, json } from "../_shared/note-auth.ts";

const ID = z.string().min(1).max(160).regex(/^[\w-]+$/);
const UUID = z.string().uuid();
const Text = z.string().trim().min(1).max(4000);
const Load = z.object({ action: z.literal("load"), visitId: ID.optional(), clientId: ID.optional(), siteId: ID.optional(), from: z.string().datetime().optional(), to: z.string().datetime().optional() });
const Submit = z.object({ action: z.literal("submit"), taskId: UUID, visitId: ID, outcome: z.enum(["administered","assistance_provided","prompted","person_reports_taken","intake_observed","refused","not_completed","not_observed"]), eventAt: z.string().datetime(), reason: z.string().max(4000), idempotencyKey: UUID, correctionOf: UUID.optional(), correctionReason: z.string().max(4000).optional() });
const Exception = z.object({ action: z.enum(["acknowledge","followUp","resolve"]), exceptionId: UUID, text: z.string().trim().max(4000).optional() });
const InstructionFields = z.object({ name: z.string().trim().min(1).max(200), strength: z.string().trim().min(1).max(200), dose: z.string().trim().min(1).max(300), route: z.string().trim().min(1).max(120), frequency: z.string().trim().min(1).max(500), scheduledTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(24), regularity: z.enum(["regular","prn"]), supportLevel: z.enum(["prompt","assist","administer"]), startDate: z.string().date(), endDate: z.string().date().nullable().optional(), sourceDocument: z.string().trim().min(1).max(1000), providerInstructions: z.string().trim().min(1).max(4000) });
const CreateInstruction = InstructionFields.extend({ action: z.literal("createInstruction"), clientId: ID, siteId: ID });
const UpdateInstruction = InstructionFields.extend({ action: z.literal("updateInstruction"), medicationId: UUID });
const Status = z.object({ action: z.literal("setInstructionStatus"), medicationId: UUID, versionId: UUID, status: z.enum(["verified","active","suspended","discontinued"]) });
const Visit = z.object({ action: z.literal("syncVisit"), visitId: ID, clientId: ID, siteId: ID, assignedStaffIds: z.array(ID).min(1).max(20), scheduledStart: z.string().datetime(), scheduledEnd: z.string().datetime() });
const Task = z.object({ action: z.literal("createTask"), medicationId: UUID, versionId: UUID, visitId: ID, scheduledAt: z.string().datetime(), documentationDueAt: z.string().datetime() });
const Body = z.discriminatedUnion("action", [Load, Submit, Exception, CreateInstruction, UpdateInstruction, Status, Visit, Task]);
type Access = { user_id: string; organisation_id: string; staff_id: string; access_role: string; site_ids: string[]; can_configure: boolean; can_administer: boolean };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "Use POST." }, 405);
  try {
    const auth = await authenticate(req);
    if (!auth) return json({ message: "Sign in to access medication records." }, 401);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ message: "Check the medication information and try again.", fields: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;
    const { data: access, error: accessError } = await auth.db.from("medication_staff_access").select("*").eq("user_id", auth.userId).maybeSingle();
    if (accessError) throw accessError;
    if (!access) return json({ message: "This signed-in account is not linked to an authorised staff member. Ask an administrator to configure controlled-test access." }, 403);
    const a = access as Access;
    const manager = ["admin","manager","coordinator"].includes(a.access_role);
    const inScope = (siteId: string) => a.site_ids.includes(siteId);
    const requireManager = () => { if (!manager) throw Object.assign(new Error("Manager authorisation is required."), { status: 403 }); };
    const requireConfig = () => { requireManager(); if (!a.can_configure) throw Object.assign(new Error("You are not authorised to change medication instructions."), { status: 403 }); };
    const requireScope = (siteId: string) => { if (!inScope(siteId)) throw Object.assign(new Error("This record is outside your assigned service areas."), { status: 403 }); };
    const audit = async (siteId: string, clientId: string | null, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) => {
      const { error } = await auth.db.from("medication_audit").insert({ organisation_id: a.organisation_id, client_id: clientId, site_id: siteId, actor_user_id: a.user_id, actor_staff_id: a.staff_id, action, entity_type: entityType, entity_id: entityId, details });
      if (error) throw error;
    };
    const loadVisit = async (visitId: string) => {
      const { data: visit, error } = await auth.db.from("medication_visits").select("*").eq("visit_id", visitId).maybeSingle();
      if (error) throw error;
      if (!visit || visit.organisation_id !== a.organisation_id) throw Object.assign(new Error("Visit unavailable."), { status: 404 });
      requireScope(visit.site_id);
      if (!manager && !visit.assigned_staff_ids.includes(a.staff_id)) throw Object.assign(new Error("You are not assigned to this visit."), { status: 403 });
      return visit;
    };

    if (body.action === "submit") {
      const { data, error } = await auth.db.rpc("submit_medication_outcome", { p_user_id: auth.userId, p_task_id: body.taskId, p_visit_id: body.visitId, p_outcome: body.outcome, p_event_at: body.eventAt, p_reason: body.reason, p_idempotency_key: body.idempotencyKey, p_correction_of: body.correctionOf ?? null, p_correction_reason: body.correctionReason ?? null });
      if (error) return json({ message: error.message }, error.code === "23505" ? 409 : error.code === "42501" ? 403 : 400);
      return json({ outcome: data, saved: true });
    }

    if (body.action === "syncVisit") {
      requireManager(); requireScope(body.siteId);
      if (Date.parse(body.scheduledEnd) <= Date.parse(body.scheduledStart)) return json({ message: "The visit end must be after its start." }, 400);
      const { data, error } = await auth.db.from("medication_visits").upsert({ visit_id: body.visitId, organisation_id: a.organisation_id, client_id: body.clientId, site_id: body.siteId, assigned_staff_ids: body.assignedStaffIds, scheduled_start: body.scheduledStart, scheduled_end: body.scheduledEnd }).select().single();
      if (error) throw error;
      await audit(body.siteId, body.clientId, "visit_reference_synced", "visit", body.visitId, { assignedStaffIds: body.assignedStaffIds });
      return json({ visit: data });
    }

    if (body.action === "createTask") {
      requireConfig();
      const visit = await loadVisit(body.visitId);
      const { data: med, error: me } = await auth.db.from("medications").select("*").eq("id", body.medicationId).single();
      if (me) throw me;
      requireScope(med.site_id);
      if (med.client_id !== visit.client_id || med.site_id !== visit.site_id) return json({ message: "The medication and visit belong to different people or service areas." }, 400);
      const { data: version, error: ve } = await auth.db.from("medication_instruction_versions").select("*").eq("id", body.versionId).eq("medication_id", body.medicationId).single();
      if (ve) throw ve;
      if (!["verified","active"].includes(version.verification_status)) return json({ message: "Verify the instruction before scheduling it." }, 400);
      if (Date.parse(body.documentationDueAt) <= Date.parse(body.scheduledAt)) return json({ message: "The documentation deadline must be after the scheduled task." }, 400);
      const { data, error } = await auth.db.from("medication_tasks").insert({ organisation_id: a.organisation_id, client_id: med.client_id, site_id: med.site_id, medication_id: med.id, instruction_version_id: version.id, visit_id: visit.visit_id, scheduled_at: body.scheduledAt, documentation_due_at: body.documentationDueAt }).select().single();
      if (error) return json({ message: error.code === "23505" ? "This medication task already exists." : error.message }, error.code === "23505" ? 409 : 400);
      await audit(med.site_id, med.client_id, "task_created", "medication_task", data.id, { visitId: visit.visit_id, instructionVersionId: version.id });
      return json({ task: data });
    }

    if (body.action === "createInstruction" || body.action === "updateInstruction") {
      requireConfig();
      let medicationId = body.action === "updateInstruction" ? body.medicationId : undefined;
      let clientId = body.action === "createInstruction" ? body.clientId : "";
      let siteId = body.action === "createInstruction" ? body.siteId : "";
      let previous: any = null;
      if (body.action === "createInstruction") {
        requireScope(siteId);
        const { data, error } = await auth.db.from("medications").insert({ organisation_id: a.organisation_id, client_id: clientId, site_id: siteId, name: body.name, strength: body.strength, status: "draft", created_by_staff_id: a.staff_id }).select().single();
        if (error) throw error;
        medicationId = data.id;
      } else {
        const { data: med, error } = await auth.db.from("medications").select("*").eq("id", medicationId).single();
        if (error) throw error;
        requireScope(med.site_id); clientId = med.client_id; siteId = med.site_id;
        const { data: old, error: oe } = await auth.db.from("medication_instruction_versions").select("*").eq("id", med.current_version_id).single();
        if (oe) throw oe;
        previous = old;
      }
      const { count } = await auth.db.from("medication_instruction_versions").select("id", { count: "exact", head: true }).eq("medication_id", medicationId);
      const { data: version, error } = await auth.db.from("medication_instruction_versions").insert({ medication_id: medicationId, version_number: (count ?? 0) + 1, dose: body.dose, route: body.route, frequency: body.frequency, scheduled_times: body.scheduledTimes, regularity: body.regularity, support_level: body.supportLevel, start_date: body.startDate, end_date: body.endDate ?? null, source_document: body.sourceDocument, provider_instructions: body.providerInstructions, verification_status: "draft", created_by_staff_id: a.staff_id, supersedes_id: previous?.id ?? null }).select().single();
      if (error) throw error;
      if (!previous) {
        const { error: ue } = await auth.db.from("medications").update({ current_version_id: version.id }).eq("id", medicationId);
        if (ue) throw ue;
      }
      await audit(siteId, clientId, previous ? "instruction_draft_created" : "medication_created", "medication", medicationId!, { versionId: version.id, versionNumber: version.version_number });
      return json({ medicationId, version });
    }

    if (body.action === "setInstructionStatus") {
      requireConfig();
      const { data: med, error: me } = await auth.db.from("medications").select("*").eq("id", body.medicationId).single();
      if (me) throw me;
      requireScope(med.site_id);
      const { data: version, error: ve } = await auth.db.from("medication_instruction_versions").select("*").eq("id", body.versionId).eq("medication_id", med.id).single();
      if (ve) throw ve;
      if (body.status === "verified" && version.verification_status !== "draft") return json({ message: "Only a draft instruction can be verified." }, 400);
      if (body.status === "active" && version.verification_status !== "verified") return json({ message: "Verify this version before activation." }, 400);
      if (["suspended","discontinued"].includes(body.status) && med.current_version_id !== version.id) return json({ message: "Only the current version can be suspended or discontinued." }, 400);
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { verification_status: body.status };
      if (body.status === "verified") { patch.verified_by_staff_id = a.staff_id; patch.verified_at = now; }
      if (body.status === "active") { patch.effective_from = now; patch.verified_by_staff_id = version.verified_by_staff_id ?? a.staff_id; patch.verified_at = version.verified_at ?? now; }
      const { error } = await auth.db.from("medication_instruction_versions").update(patch).eq("id", version.id);
      if (error) throw error;
      if (["active","suspended","discontinued"].includes(body.status)) {
        if (body.status === "active" && med.current_version_id && med.current_version_id !== version.id) {
          const { error: pe } = await auth.db.from("medication_instruction_versions").update({ verification_status: "suspended" }).eq("id", med.current_version_id);
          if (pe) throw pe;
        }
        const { error: ue } = await auth.db.from("medications").update({ current_version_id: version.id, status: body.status === "active" ? "active" : body.status }).eq("id", med.id);
        if (ue) throw ue;
      }
      await audit(med.site_id, med.client_id, `instruction_${body.status}`, "medication_instruction_version", version.id, { medicationId: med.id, previousVersionId: med.current_version_id });
      return json({ saved: true });
    }

    if (["acknowledge","followUp","resolve"].includes(body.action)) {
      const b = body as z.infer<typeof Exception>; requireManager();
      const { data: exception, error } = await auth.db.from("medication_exceptions").select("*").eq("id", b.exceptionId).single();
      if (error) throw error;
      requireScope(exception.site_id);
      const now = new Date().toISOString(); let patch: Record<string, unknown>;
      if (b.action === "acknowledge") {
        if (exception.status !== "open") return json({ message: "This exception has already been acknowledged." }, 409);
        patch = { status: "acknowledged", acknowledged_by_staff_id: a.staff_id, acknowledged_at: now };
      } else if (b.action === "followUp") {
        if (exception.status === "open") return json({ message: "Acknowledge the exception before recording follow-up." }, 400);
        if (!b.text) return json({ message: "Record the follow-up taken." }, 400);
        patch = { follow_up: b.text, follow_up_by_staff_id: a.staff_id, follow_up_at: now };
      } else {
        if (!b.text || !exception.follow_up) return json({ message: "Record follow-up before resolving the exception." }, 400);
        patch = { status: "resolved", resolution: b.text, resolved_by_staff_id: a.staff_id, resolved_at: now };
      }
      const { error: ue } = await auth.db.from("medication_exceptions").update(patch).eq("id", exception.id);
      if (ue) throw ue;
      await audit(exception.site_id, exception.client_id, `exception_${b.action}`, "medication_exception", exception.id, { text: b.text ?? "" });
      return json({ saved: true });
    }

    if (body.visitId) {
      const visit = await loadVisit(body.visitId);
      const [{ data: tasks, error: te }, { data: outcomes, error: oe }] = await Promise.all([
        auth.db.from("medication_tasks").select("*, medication:medications(*), instruction:medication_instruction_versions(*)").eq("visit_id", visit.visit_id).order("scheduled_at"),
        auth.db.from("medication_outcomes").select("*").eq("visit_id", visit.visit_id).order("submitted_at"),
      ]);
      if (te) throw te; if (oe) throw oe;
      const taskIds = (tasks ?? []).map((t) => t.id);
      const { data: exceptions, error: ee } = taskIds.length ? await auth.db.from("medication_exceptions").select("*").in("task_id", taskIds) : { data: [], error: null };
      if (ee) throw ee;
      return json({ access: a, visit, tasks: tasks ?? [], outcomes: outcomes ?? [], exceptions: exceptions ?? [] });
    }

    requireManager();
    const { error: sweepError } = await auth.db.rpc("sweep_medication_documentation", { p_user_id: auth.userId });
    if (sweepError) throw sweepError;
    let taskQuery = auth.db.from("medication_tasks").select("*, medication:medications(*), instruction:medication_instruction_versions(*)").eq("organisation_id", a.organisation_id).in("site_id", a.site_ids).order("scheduled_at", { ascending: false }).limit(300);
    if (body.siteId) { requireScope(body.siteId); taskQuery = taskQuery.eq("site_id", body.siteId); }
    if (body.clientId) taskQuery = taskQuery.eq("client_id", body.clientId);
    if (body.from) taskQuery = taskQuery.gte("scheduled_at", body.from);
    if (body.to) taskQuery = taskQuery.lte("scheduled_at", body.to);
    const [{ data: tasks, error: te }, { data: outcomes, error: oe }, { data: exceptions, error: ee }, { data: medications, error: me }, { data: versions, error: ve }, { data: auditRows, error: ae }] = await Promise.all([
      taskQuery,
      auth.db.from("medication_outcomes").select("*").eq("organisation_id", a.organisation_id).in("site_id", a.site_ids).order("submitted_at", { ascending: false }).limit(500),
      auth.db.from("medication_exceptions").select("*, notifications:medication_notifications(*)").eq("organisation_id", a.organisation_id).in("site_id", a.site_ids).order("created_at", { ascending: false }).limit(300),
      auth.db.from("medications").select("*").eq("organisation_id", a.organisation_id).in("site_id", a.site_ids).order("name"),
      auth.db.from("medication_instruction_versions").select("*").order("created_at", { ascending: false }).limit(500),
      auth.db.from("medication_audit").select("*").eq("organisation_id", a.organisation_id).in("site_id", a.site_ids).order("created_at", { ascending: false }).limit(150),
    ]);
    for (const error of [te,oe,ee,me,ve,ae]) if (error) throw error;
    const medIds = new Set((medications ?? []).map((m) => m.id));
    return json({ access: a, tasks: tasks ?? [], outcomes: outcomes ?? [], exceptions: exceptions ?? [], medications: medications ?? [], versions: (versions ?? []).filter((v) => medIds.has(v.medication_id)), audit: auditRows ?? [] });
  } catch (error) {
    const e = error as { message?: string; status?: number };
    return json({ message: e.message ?? "Medication request failed." }, e.status ?? 500);
  }
});
