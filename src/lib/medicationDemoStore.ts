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
  return {
    medication: { id: medicationId, organisation_id: ORG, client_id: template.clientId, site_id: siteId, name: fictionalName(med.name), strength: med.dose ?? (med.name === "Authorised medication task" ? "500 mg" : "As labelled"), status: "active", current_version_id: versionId, created_by_staff_id: "STAFF-DANIEL", created_at: new Date(Date.now() - 30 * DAY).toISOString() },
    version: { id: versionId, medication_id: medicationId, version_number: 1, dose: "1 dose as labelled", route: "Oral", frequency: `Daily at ${time}`, scheduled_times: [time], regularity: "regular", support_level: med.supportLevel, start_date: new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10), end_date: null, source_document: "Fictional pharmacy label and GP letter (demo)", provider_instructions: "Fictional demo instruction. Follow the provider's medication policy.", verification_status: statusOverrides[versionId] ?? "active", verified_by_staff_id: "STAFF-DANIEL", verified_at: new Date(Date.now() - 29 * DAY).toISOString(), effective_from: new Date(Date.now() - 29 * DAY).toISOString(), created_by_staff_id: "STAFF-DANIEL", created_at: new Date(Date.now() - 30 * DAY).toISOString() },
  };
}

function tasksForVisit(visit: Visit): MedicationTask[] {
  const template = visitsState().templates.find((t) => t.id === visit.templateId);
  if (!template || visit.status === "cancelled") return [];
  const siteId = visit.serviceAreaId ?? "";
  return template.medications.map((_, index) => {
    const { medication, version } = medicationFor(template, index, siteId);
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
  return rec;
}

/** A few fictional past outcomes (one refusal) so oversight is populated. */
function seed() {
  if (seeded) return; seeded = true;
  const now = Date.now();
  const past = visitsState().visits.filter((v) => v.rosterStatus === "published" && v.staffIds.length && Date.parse(v.scheduledEnd) < now && now - Date.parse(v.scheduledEnd) < DAY).flatMap(tasksForVisit).slice(0, 8);
  past.forEach((task, i) => {
    const support = task.instruction.support_level;
    const outcome: MedicationOutcome = i === 2 ? "refused" : support === "prompt" ? "prompted" : support === "assist" ? "assistance_provided" : "administered";
    const visit = visitsState().visits.find((v) => v.id === task.visit_id);
    record(task, outcome, visit?.staffIds[0] ?? "STAFF-AISLING", task.scheduled_at, outcome === "refused" ? "Said she would take it later with her tea. Left in blister pack, not removed." : "");
  });
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
    return { saved: true as const };
  },
  async syncVisit() { return { simulated: true }; },
  async createInstruction(input) {
    const medicationId = id("DEMO-MED"); const now = new Date().toISOString(); const staff = roleStore.get().staffId;
    extraMedications = [...extraMedications, { id: medicationId, organisation_id: ORG, client_id: input.clientId, site_id: input.siteId, name: String(input.name ?? ""), strength: String(input.strength ?? ""), status: "draft", created_by_staff_id: staff, created_at: now }];
    const version = draftVersion(medicationId, 1, input, staff, now); extraVersions = [...extraVersions, version];
    return { medicationId, version };
  },
  async updateInstruction(input) {
    const now = new Date().toISOString(); const staff = roleStore.get().staffId;
    const number = extraVersions.filter((v) => v.medication_id === input.medicationId).length + 2;
    const version = draftVersion(input.medicationId, number, input, staff, now); extraVersions = [...extraVersions, version];
    return { medicationId: input.medicationId, version };
  },
  async setInstructionStatus(_medicationId, versionId, status) { statusOverrides = { ...statusOverrides, [versionId]: status }; return { saved: true as const }; },
  async createTask() { return { simulated: true }; },
};

function draftVersion(medicationId: string, number: number, input: Record<string, unknown>, staff: string, now: string): MedicationInstructionVersion {
  return { id: id("DEMO-VER"), medication_id: medicationId, version_number: number, dose: String(input.dose ?? ""), route: String(input.route ?? ""), frequency: String(input.frequency ?? ""), scheduled_times: (input.scheduledTimes as string[]) ?? [], regularity: (input.regularity as "regular" | "prn") ?? "regular", support_level: (input.supportLevel as MedicationInstructionVersion["support_level"]) ?? "prompt", start_date: String(input.startDate ?? now.slice(0, 10)), end_date: (input.endDate as string | null) ?? null, source_document: String(input.sourceDocument ?? ""), provider_instructions: String(input.providerInstructions ?? ""), verification_status: "draft", created_by_staff_id: staff, created_at: now };
}

/** Test helper. */
export function resetMedicationDemo() { outcomes = []; exceptions = []; extraMedications = []; extraVersions = []; statusOverrides = {}; audit = []; seeded = false; }
