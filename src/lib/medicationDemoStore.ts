/**
 * Fictional, in-memory eMAR for the signed-out "Explore fictional demo" mode.
 * Same shape as medicationStore so screens are shared, but it never calls the
 * backend: every action is simulated and resets on reload.
 */
import type { MedicationAccess, MedicationException, MedicationInstructionVersion, MedicationOutcomeRecord, MedicationOversightData, MedicationTask, Medication, VisitMedicationData, medicationStore } from "./medicationStore";
import { exceptionKind, validateOutcome, type MedicationOutcome } from "./medicationRules";
import { roleStore, scopedSiteIds, type RoleState } from "./roleStore";
import { getState as visitsState, ORGANISATION_ID, type Visit, type VisitTemplate } from "./visitsStore";

export const DEMO_MEDICATION_NOTICE = "Fictional demo · simulated actions. Nothing here is saved to LogUp, and it resets when you reload.";
const ORG = `DEMO-${ORGANISATION_ID}`;
const DAY = 86_400_000;

let outcomes: MedicationOutcomeRecord[] = [];
let exceptions: MedicationException[] = [];
let extraMedications: Medication[] = [];
let extraVersions: MedicationInstructionVersion[] = [];
let statusOverrides: Record<string, MedicationInstructionVersion["verification_status"]> = {};
let audit: MedicationOversightData["audit"] = [];
let seeded = false;
let seeding = false;
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; listeners.forEach((l) => l()); };
/** Live updates for read-only views (Home overview). */
export const subscribeMedicationDemo = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const medicationDemoVersion = () => version;

const id = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const fictionalName = (name: string) => name === "Authorised medication task" ? "Paracetamol (fictional)" : name;

export function demoAccess(role: RoleState = roleStore.get()): MedicationAccess {
  const accessRole = (["admin", "manager", "coordinator", "frontline"] as const).find((r) => r === role.role) ?? "viewonly";
  return { user_id: "demo-user", organisation_id: ORG, staff_id: role.staffId, access_role: accessRole, site_ids: scopedSiteIds(role), can_configure: accessRole === "admin" || accessRole === "manager", can_administer: accessRole !== "viewonly" };
}

function medicationFor(template: VisitTemplate, index: number, siteId: string): { medication: Medication; version: MedicationInstructionVersion } {
  const med = template.medications[index];
  const medicationId = `DEMO-MED-${template.id}-${index}`; const versionId = `${medicationId}-V1`;
  const time = template.windowStart;
  const base = baseMedicationFor(template, index, siteId, medicationId, versionId, time, med);
  const latest = [...extraVersions].reverse().find((v) => v.medication_id === medicationId && ["active", "discontinued", "suspended"].includes(statusOverrides[v.id] ?? v.verification_status));
  const version = latest ? { ...latest, verification_status: statusOverrides[latest.id] ?? latest.verification_status } : base.version;
  const stopped = version.verification_status === "discontinued";
  return { medication: { ...base.medication, current_version_id: version.id, status: stopped ? "stopped" : "active" }, version };
}

function baseMedicationFor(template: VisitTemplate, _index: number, siteId: string, medicationId: string, versionId: string, time: string, med: VisitTemplate["medications"][number]): { medication: Medication; version: MedicationInstructionVersion } {
  return {
    medication: { id: medicationId, organisation_id: ORG, client_id: template.clientId, site_id: siteId, name: fictionalName(med.name), strength: med.dose ?? (med.name === "Authorised medication task" ? "500 mg" : "As labelled"), status: "active", current_version_id: versionId, created_by_staff_id: "STAFF-DANIEL", created_at: new Date(Date.now() - 30 * DAY).toISOString() },
    version: { id: versionId, medication_id: medicationId, version_number: 1, dose: "1 dose as labelled", route: "Oral", frequency: `Daily at ${time}`, scheduled_times: [time], regularity: "regular", support_level: med.supportLevel, start_date: new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10), end_date: null, source_document: "Fictional pharmacy label and GP letter (demo)", provider_instructions: "Fictional demo instruction. Follow the provider's medication policy.", verification_status: statusOverrides[versionId] ?? "active", verified_by_staff_id: "STAFF-DANIEL", verified_at: new Date(Date.now() - 29 * DAY).toISOString(), effective_from: new Date(Date.now() - 29 * DAY).toISOString(), created_by_staff_id: "STAFF-DANIEL", created_at: new Date(Date.now() - 30 * DAY).toISOString() },
  };
}

function tasksForVisit(visit: Visit): MedicationTask[] {
  const template = visitsState().templates.find((t) => t.id === visit.templateId);
  if (!template || visit.status === "cancelled") return [];
  const siteId = visit.serviceAreaId ?? "";
  return template.medications.flatMap((_, index) => {
    const { medication, version } = medicationFor(template, index, siteId);
    if (medication.status === "stopped" && Date.parse(visit.scheduledStart) > Date.parse(version.created_at)) return [];
    return { id: `DEMO-TASK-${visit.id}-${index}`, organisation_id: ORG, client_id: visit.clientId, site_id: siteId, medication_id: medication.id, instruction_version_id: version.id, visit_id: visit.id, scheduled_at: visit.scheduledStart, documentation_due_at: new Date(Date.parse(visit.scheduledEnd) + 60 * 60_000).toISOString(), medication, instruction: version };
  });
}

function windowVisits(siteIds: string[]) {
  const now = Date.now();
  return visitsState().visits.filter((v) => v.rosterStatus === "published" && siteIds.includes(v.serviceAreaId ?? "") && Math.abs(Date.parse(v.scheduledStart) - now) < DAY);
}

function record(task: MedicationTask, outcome: MedicationOutcome, staffId: string, eventAt: string, reason: string, correction?: { of: string; reason: string }) {
  const rec: MedicationOutcomeRecord = { id: id("DEMO-OUT"), organisation_id: ORG, client_id: task.client_id, site_id: task.site_id, task_id: task.id, medication_id: task.medication_id, instruction_version_id: task.instruction_version_id, visit_id: task.visit_id, staff_id: staffId, submitted_by_user_id: "demo-user", outcome, event_at: eventAt, submitted_at: new Date().toISOString(), reason, idempotency_key: id("key"), correction_of: correction?.of ?? null, correction_reason: correction?.reason ?? null };
  outcomes = [...outcomes, rec];
  const kind = exceptionKind(outcome);
  if (kind) exceptions = [...exceptions, { id: id("DEMO-EXC"), organisation_id: ORG, client_id: task.client_id, site_id: task.site_id, task_id: task.id, outcome_id: rec.id, kind, status: "open", created_at: rec.submitted_at, notifications: [{ id: id("n"), status: "simulated", detail: "Demo only: no one was notified." }] }];
  audit = [...audit, { id: id("DEMO-AUD"), client_id: task.client_id, site_id: task.site_id, actor_staff_id: staffId, action: correction ? "outcome_corrected" : "outcome_recorded", entity_type: "medication_outcome", entity_id: rec.id, details: { outcome, simulated: true }, created_at: rec.submitted_at }];
  if (!seeding) emit();
  return rec;
}

/** A week of fictional past outcomes (a few refusals) so every chart is populated. */
function seed() {
  if (seeded) return; seeded = true; seeding = true;
  const now = Date.now();
  const past = visitsState().visits.filter((v) => v.rosterStatus === "published" && v.staffIds.length && Date.parse(v.scheduledEnd) < now && now - Date.parse(v.scheduledEnd) < 7 * DAY).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)).flatMap(tasksForVisit);
  past.forEach((task, i) => {
    const support = task.instruction.support_level;
    const outcome: MedicationOutcome = i % 23 === 2 ? "refused" : i % 41 === 7 ? "not_completed" : support === "prompt" ? "prompted" : support === "assist" ? "assistance_provided" : "administered";
    const visit = visitsState().visits.find((v) => v.id === task.visit_id);
    const at = new Date(Date.parse(task.scheduled_at) + 10 * 60_000).toISOString();
    const rec = record(task, outcome, visit?.staffIds[0] ?? "STAFF-AISLING", at, outcome === "refused" ? "Said they would take it later with their tea. Left in blister pack, not removed." : outcome === "not_completed" ? "Medication not in the home. Pharmacy delivery delayed; office informed." : "");
    const submitted = new Date(Date.parse(at) + 5 * 60_000).toISOString();
    outcomes = outcomes.map((o) => o.id === rec.id ? { ...o, submitted_at: submitted } : o);
    audit = audit.map((a) => a.entity_id === rec.id ? { ...a, created_at: submitted } : a);
  });
  // Older exceptions were already handled by the coordinator.
  exceptions = exceptions.map((e) => {
    const out = outcomes.find((o) => o.id === e.outcome_id); if (!out || now - Date.parse(out.event_at) < 2 * DAY) return e;
    const t = new Date(Date.parse(out.event_at) + 3 * 3600_000).toISOString();
    return { ...e, created_at: out.event_at, status: "resolved", acknowledged_by_staff_id: "STAFF-DANIEL", acknowledged_at: t, follow_up: "Spoke with client and family; GP informed where needed.", follow_up_by_staff_id: "STAFF-DANIEL", follow_up_at: t, resolution: "No harm. Followed medication policy.", resolved_by_staff_id: "STAFF-DANIEL", resolved_at: t };
  });
}

function logAudit(clientId: string, siteId: string, action: string, entityId: string, details: Record<string, unknown>) {
  audit = [...audit, { id: id("DEMO-AUD"), client_id: clientId, site_id: siteId, actor_staff_id: roleStore.get().staffId, action, entity_type: "medication_instruction", entity_id: entityId, details, created_at: new Date().toISOString() }];
  emit();
}

/** Every fictional exception with its original outcome and dose, in the given service areas (read-only). */
export function demoExceptionsInScope(siteIds: readonly string[]): { exception: MedicationException; outcome?: MedicationOutcomeRecord; task?: MedicationTask }[] {
  seed();
  return exceptions.filter((e) => siteIds.includes(e.site_id)).map((e) => {
    const outcome = outcomes.find((o) => o.id === e.outcome_id);
    const visit = outcome?.visit_id ? visitsState().visits.find((v) => v.id === outcome.visit_id) : undefined;
    return { exception: e, outcome, task: visit ? tasksForVisit(visit).find((t) => t.id === e.task_id) : undefined };
  });
}

export interface ClientEmarMedication { medication: Medication; current: MedicationInstructionVersion; versions: MedicationInstructionVersion[] }
export interface ClientEmar { access: MedicationAccess; medications: ClientEmarMedication[]; tasks: MedicationTask[]; outcomes: MedicationOutcomeRecord[]; exceptions: MedicationException[]; audit: MedicationOversightData["audit"]; days: string[] }

/** Everything for one client's eMAR: medicines with version history, last 7 days + tomorrow of doses. */
export function loadDemoClientEmar(clientId: string): ClientEmar {
  seed();
  const access = demoAccess(); const now = Date.now();
  const visits = visitsState().visits.filter((v) => v.clientId === clientId && v.rosterStatus === "published" && access.site_ids.includes(v.serviceAreaId ?? "") && Date.parse(v.scheduledStart) > now - 7 * DAY && Date.parse(v.scheduledStart) < now + DAY);
  const tasks = visits.flatMap(tasksForVisit).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const meds = new Map<string, ClientEmarMedication>();
  const templates = visitsState().templates.filter((t) => t.clientId === clientId && !t.supersededAt);
  const siteId = visits[0]?.serviceAreaId ?? "";
  templates.forEach((t) => t.medications.forEach((med, i) => {
    const { medication, version } = medicationFor(t, i, siteId);
    const base = baseMedicationFor(t, i, siteId, medication.id, `${medication.id}-V1`, t.windowStart, med).version;
    const extras = extraVersions.filter((v) => v.medication_id === medication.id).map((v) => ({ ...v, verification_status: statusOverrides[v.id] ?? v.verification_status }));
    meds.set(medication.id, { medication, current: version, versions: [base, ...extras].sort((a, b) => b.version_number - a.version_number) });
  }));
  extraMedications.filter((m) => m.client_id === clientId).forEach((m) => {
    const versions = extraVersions.filter((v) => v.medication_id === m.id).map((v) => ({ ...v, verification_status: statusOverrides[v.id] ?? v.verification_status })).sort((a, b) => b.version_number - a.version_number);
    const current = versions.find((v) => v.verification_status === "active" || v.verification_status === "discontinued") ?? versions[0];
    meds.set(m.id, { medication: { ...m, status: current.verification_status === "active" ? "active" : current.verification_status === "discontinued" ? "stopped" : "draft" }, current, versions });
  });
  const ids = new Set(tasks.map((t) => t.id)); const medIds = new Set(meds.keys());
  const days = Array.from({ length: 8 }, (_, i) => { const d = new Date(now - (6 - i) * DAY); return d.toISOString().slice(0, 10); });
  return { access, medications: [...meds.values()], tasks, outcomes: outcomes.filter((o) => ids.has(o.task_id)), exceptions: exceptions.filter((e) => ids.has(e.task_id)), audit: audit.filter((a) => a.client_id === clientId || medIds.has(a.entity_id)).sort((a, b) => b.created_at.localeCompare(a.created_at)), days };
}

/** Test helper / overview: which clients have medication support. */
export function demoMedicationClientIds(siteIds: string[]) {
  const ids = new Set<string>();
  visitsState().templates.filter((t) => !t.supersededAt && t.medications.length).forEach((t) => ids.add(t.clientId));
  extraMedications.filter((m) => siteIds.includes(m.site_id)).forEach((m) => ids.add(m.client_id));
  return [...ids];
}

function allTasks(siteIds: string[]) { return windowVisits(siteIds).flatMap(tasksForVisit); }

export const medicationDemoStore: typeof medicationStore = {
  async loadVisit(visitId: string) {
    seed();
    const access = demoAccess(); const visit = visitsState().visits.find((v) => v.id === visitId);
    const tasks = visit && access.site_ids.includes(visit.serviceAreaId ?? "") ? tasksForVisit(visit) : [];
    const ids = new Set(tasks.map((t) => t.id));
    return { access, tasks, outcomes: outcomes.filter((o) => ids.has(o.task_id)), exceptions: exceptions.filter((e) => ids.has(e.task_id)) } satisfies VisitMedicationData;
  },
  async loadOversight(filters = {}) {
    seed();
    const access = demoAccess();
    const sites = filters.siteId ? access.site_ids.filter((s) => s === filters.siteId) : access.site_ids;
    const tasks = allTasks(sites).filter((t) => !filters.clientId || t.client_id === filters.clientId).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).slice(0, 120);
    const ids = new Set(tasks.map((t) => t.id));
    const medications = [...new Map([...tasks.map((t) => [t.medication.id, t.medication] as const), ...extraMedications.filter((m) => sites.includes(m.site_id)).map((m) => [m.id, m] as const)]).values()];
    const versions = [...new Map([...tasks.map((t) => [t.instruction.id, t.instruction] as const), ...extraVersions.map((v) => [v.id, { ...v, verification_status: statusOverrides[v.id] ?? v.verification_status }] as const)]).values()].filter((v) => medications.some((m) => m.id === v.medication_id));
    return { access, tasks, outcomes: outcomes.filter((o) => ids.has(o.task_id)), exceptions: exceptions.filter((e) => ids.has(e.task_id)), medications, versions, audit: audit.filter((a) => sites.includes(a.site_id)) };
  },
  async submit(input) {
    const visit = visitsState().visits.find((v) => v.id === input.visitId);
    const task = visit ? tasksForVisit(visit).find((t) => t.id === input.taskId) : undefined;
    if (!task) throw new Error("This fictional task is not available.");
    const access = demoAccess();
    const problem = validateOutcome({ support: task.instruction.support_level, canAdminister: access.can_administer, outcome: input.outcome, reason: input.reason, eventAt: input.eventAt });
    if (problem) throw new Error(problem);
    return { outcome: record(task, input.outcome, access.staff_id, input.eventAt, input.reason, input.correctionOf ? { of: input.correctionOf, reason: input.correctionReason ?? "" } : undefined), saved: true as const };
  },
  async exception(action, exceptionId, text) {
    const staff = roleStore.get().staffId; const at = new Date().toISOString();
    exceptions = exceptions.map((e) => e.id !== exceptionId ? e : action === "acknowledge" ? { ...e, status: "acknowledged", acknowledged_by_staff_id: staff, acknowledged_at: at } : action === "followUp" ? { ...e, follow_up: text ?? "", follow_up_by_staff_id: staff, follow_up_at: at } : { ...e, status: "resolved", resolution: text ?? "", resolved_by_staff_id: staff, resolved_at: at });
    emit();
    return { saved: true as const };
  },
  async syncVisit() { return { simulated: true }; },
  async createInstruction(input) {
    const medicationId = id("DEMO-MED"); const now = new Date().toISOString(); const staff = roleStore.get().staffId;
    extraMedications = [...extraMedications, { id: medicationId, organisation_id: ORG, client_id: input.clientId, site_id: input.siteId, name: String(input.name ?? ""), strength: String(input.strength ?? ""), status: "draft", created_by_staff_id: staff, created_at: now }];
    const version = draftVersion(medicationId, 1, input, staff, now); extraVersions = [...extraVersions, version];
    logAudit(input.clientId, input.siteId, "medication_added_draft", medicationId, { name: input.name });
    return { medicationId, version };
  },
  async updateInstruction(input) {
    const now = new Date().toISOString(); const staff = roleStore.get().staffId;
    const number = extraVersions.filter((v) => v.medication_id === input.medicationId).length + 2;
    const version = draftVersion(input.medicationId, number, input, staff, now); extraVersions = [...extraVersions, version];
    const owner = ownerOf(input.medicationId); logAudit(owner.clientId, owner.siteId, "instruction_edited_draft", input.medicationId, { version: number });
    return { medicationId: input.medicationId, version };
  },
  async setInstructionStatus(medicationId, versionId, status) {
    const staff = roleStore.get().staffId;
    const extra = extraVersions.find((v) => v.id === versionId);
    if (status === "active" && extra && (statusOverrides[versionId] ?? extra.verification_status) === "draft" && extra.created_by_staff_id === staff) throw new Error("A different person must verify this change. Switch the demo view (e.g. to a Manager) to verify it.");
    if (status === "discontinued" && !extra && !versionId.endsWith("-V1")) throw new Error("Version not found.");
    if (extra && status === "active") extraVersions = extraVersions.map((v) => v.id === versionId ? { ...v, verified_by_staff_id: staff, verified_at: new Date().toISOString(), effective_from: new Date().toISOString() } : v);
    if (status === "discontinued" && !extra) {
      // Stopping the original: record a stop version so history is preserved.
      const owner = ownerOf(medicationId); const base = owner.version!;
      const stop: MedicationInstructionVersion = { ...base, id: id("DEMO-VER"), version_number: extraVersions.filter((v) => v.medication_id === medicationId).length + 2, verification_status: "discontinued", end_date: new Date().toISOString().slice(0, 10), created_by_staff_id: staff, created_at: new Date().toISOString(), verified_by_staff_id: staff, verified_at: new Date().toISOString(), supersedes_id: base.id };
      extraVersions = [...extraVersions, stop];
    } else statusOverrides = { ...statusOverrides, [versionId]: status };
    const owner = ownerOf(medicationId); logAudit(owner.clientId, owner.siteId, status === "active" ? "instruction_verified" : status === "discontinued" ? "medication_stopped" : `instruction_${status}`, medicationId, { versionId });
    return { saved: true as const };
  },
  async createTask() { return { simulated: true }; },
};

function ownerOf(medicationId: string): { clientId: string; siteId: string; version?: MedicationInstructionVersion } {
  const extra = extraMedications.find((m) => m.id === medicationId);
  if (extra) return { clientId: extra.client_id, siteId: extra.site_id };
  for (const t of visitsState().templates) for (let i = 0; i < t.medications.length; i++) {
    const mid = `DEMO-MED-${t.id}-${i}`;
    if (mid === medicationId) {
      const siteId = visitsState().visits.find((v) => v.clientId === t.clientId)?.serviceAreaId ?? "";
      return { clientId: t.clientId, siteId, version: baseMedicationFor(t, i, siteId, mid, `${mid}-V1`, t.windowStart, t.medications[i]).version };
    }
  }
  return { clientId: "", siteId: "" };
}

function draftVersion(medicationId: string, number: number, input: Record<string, unknown>, staff: string, now: string): MedicationInstructionVersion {
  return { id: id("DEMO-VER"), medication_id: medicationId, version_number: number, dose: String(input.dose ?? ""), route: String(input.route ?? ""), frequency: String(input.frequency ?? ""), scheduled_times: (input.scheduledTimes as string[]) ?? [], regularity: (input.regularity as "regular" | "prn") ?? "regular", support_level: (input.supportLevel as MedicationInstructionVersion["support_level"]) ?? "prompt", start_date: String(input.startDate ?? now.slice(0, 10)), end_date: (input.endDate as string | null) ?? null, source_document: String(input.sourceDocument ?? ""), provider_instructions: String(input.providerInstructions ?? ""), verification_status: "draft", created_by_staff_id: staff, created_at: now };
}

/** Test helper. */
export function resetMedicationDemo() { version++; outcomes = []; exceptions = []; extraMedications = []; extraVersions = []; statusOverrides = {}; audit = []; seeded = false; }
