import { careFunction } from "./careNoteAi";
import type { MedicationOutcome, MedicationSupport } from "./medicationRules";

export interface MedicationAccess { user_id: string; organisation_id: string; staff_id: string; access_role: "admin" | "manager" | "coordinator" | "frontline" | "viewonly"; site_ids: string[]; can_configure: boolean; can_administer: boolean }
export interface MedicationInstructionVersion { id: string; medication_id: string; version_number: number; dose: string; route: string; frequency: string; scheduled_times: string[]; regularity: "regular" | "prn"; support_level: MedicationSupport; start_date: string; end_date?: string | null; source_document: string; provider_instructions: string; verification_status: "draft" | "verified" | "active" | "suspended" | "discontinued"; verified_by_staff_id?: string | null; verified_at?: string | null; effective_from?: string | null; created_by_staff_id: string; created_at: string; supersedes_id?: string | null }
export interface Medication { id: string; organisation_id: string; client_id: string; site_id: string; name: string; strength: string; status: string; current_version_id?: string | null; created_by_staff_id: string; created_at: string }
export interface MedicationTask { id: string; organisation_id: string; client_id: string; site_id: string; medication_id: string; instruction_version_id: string; visit_id?: string | null; scheduled_at: string; documentation_due_at: string; medication: Medication; instruction: MedicationInstructionVersion }
export interface MedicationOutcomeRecord { id: string; organisation_id: string; client_id: string; site_id: string; task_id: string; medication_id: string; instruction_version_id: string; visit_id?: string | null; staff_id: string; submitted_by_user_id: string; outcome: MedicationOutcome; event_at: string; submitted_at: string; reason: string; idempotency_key: string; correction_of?: string | null; correction_reason?: string | null }
export interface MedicationException { id: string; organisation_id: string; client_id: string; site_id: string; task_id: string; outcome_id?: string | null; kind: "refusal" | "not_completed" | "documentation_missing" | "outcome_unknown" | "discrepancy"; status: "open" | "acknowledged" | "resolved"; created_at: string; acknowledged_by_staff_id?: string | null; acknowledged_at?: string | null; follow_up?: string | null; follow_up_by_staff_id?: string | null; follow_up_at?: string | null; resolution?: string | null; resolved_by_staff_id?: string | null; resolved_at?: string | null; notifications?: { id: string; status: string; detail: string }[] }
export interface VisitMedicationData { access: MedicationAccess; tasks: MedicationTask[]; outcomes: MedicationOutcomeRecord[]; exceptions: MedicationException[] }
export interface MedicationOversightData extends VisitMedicationData { medications: Medication[]; versions: MedicationInstructionVersion[]; audit: { id: string; client_id?: string; site_id: string; actor_staff_id: string; action: string; entity_type: string; entity_id: string; details: Record<string, unknown>; created_at: string }[] }
async function call<T>(body: unknown): Promise<T> {
  const response = await careFunction("medication-workspace", JSON.stringify(body), "application/json");
  return await response.json() as T;
}
export const medicationStore = {
  loadVisit: (visitId: string) => call<VisitMedicationData>({ action: "load", visitId }),
  loadOversight: (filters: { clientId?: string; siteId?: string; from?: string; to?: string } = {}) => call<MedicationOversightData>({ action: "load", ...filters }),
  submit(input: { taskId: string; visitId: string; outcome: MedicationOutcome; eventAt: string; reason: string; idempotencyKey: string; correctionOf?: string; correctionReason?: string }) {
    if (typeof navigator !== "undefined" && !navigator.onLine) return Promise.reject(new Error("You are offline. Use the approved downtime procedure; this entry has not been saved."));
    return call<{ outcome: MedicationOutcomeRecord; saved: true }>({ action: "submit", ...input });
  },
  exception: (action: "acknowledge" | "followUp" | "resolve", exceptionId: string, text?: string) => call<{ saved: true }>({ action, exceptionId, text }),
  syncVisit: (input: { visitId: string; clientId: string; siteId: string; assignedStaffIds: string[]; scheduledStart: string; scheduledEnd: string }) => call({ action: "syncVisit", ...input }),
  createInstruction: (input: Record<string, unknown> & { clientId: string; siteId: string }) => call<{ medicationId: string; version: MedicationInstructionVersion }>({ action: "createInstruction", ...input }),
  updateInstruction: (input: Record<string, unknown> & { medicationId: string }) => call<{ medicationId: string; version: MedicationInstructionVersion }>({ action: "updateInstruction", ...input }),
  setInstructionStatus: (medicationId: string, versionId: string, status: "verified" | "active" | "suspended" | "discontinued") => call<{ saved: true }>({ action: "setInstructionStatus", medicationId, versionId, status }),
  createTask: (input: { medicationId: string; versionId: string; visitId: string; scheduledAt: string; documentationDueAt: string }) => call({ action: "createTask", ...input }),
};
