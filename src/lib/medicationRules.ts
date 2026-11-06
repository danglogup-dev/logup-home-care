export type MedicationSupport = "prompt" | "assist" | "administer";
export type MedicationOutcome = "administered" | "assistance_provided" | "prompted" | "person_reports_taken" | "intake_observed" | "refused" | "not_completed" | "not_observed";
export const OUTCOME_LABELS: Record<MedicationOutcome, string> = {
  administered: "Administered by authorised professional",
  assistance_provided: "Medication assistance provided",
  prompted: "Medication prompting provided",
  person_reports_taken: "Person reports taking medication",
  intake_observed: "Medication intake directly observed",
  refused: "Medication refused",
  not_completed: "Task not completed",
  not_observed: "Outcome not observed or unknown",
};
const COMMON: MedicationOutcome[] = ["refused", "not_completed", "not_observed"];
export function permittedOutcomes(support: MedicationSupport, canAdminister: boolean): MedicationOutcome[] {
  if (support === "prompt") return ["prompted", "person_reports_taken", ...COMMON];
  if (support === "assist") return ["assistance_provided", "intake_observed", ...COMMON];
  return [...(canAdminister ? ["administered" as const, "intake_observed" as const] : []), ...COMMON];
}
export function reasonRequired(outcome: MedicationOutcome) { return ["refused", "not_completed", "not_observed"].includes(outcome); }
export function validateOutcome(input: { support: MedicationSupport; canAdminister: boolean; outcome?: MedicationOutcome; reason: string; eventAt: string; now?: Date }) {
  if (!input.outcome) return "Select the outcome you observed or recorded.";
  if (!permittedOutcomes(input.support, input.canAdminister).includes(input.outcome)) return "This outcome is not permitted for the authorised task and your role.";
  if (reasonRequired(input.outcome) && !input.reason.trim()) return "Record a reason or observation for this outcome.";
  const event = Date.parse(input.eventAt);
  if (!Number.isFinite(event)) return "Record the actual activity time.";
  if (event > (input.now?.getTime() ?? Date.now()) + 5 * 60_000) return "The activity time cannot be in the future.";
  return "";
}
export function exceptionKind(outcome: MedicationOutcome) {
  if (outcome === "refused") return "refusal" as const;
  if (outcome === "not_completed") return "not_completed" as const;
  if (outcome === "not_observed") return "outcome_unknown" as const;
  return undefined;
}
export function currentOutcome<T extends { id: string; task_id: string; correction_of?: string | null; submitted_at: string }>(records: T[], taskId: string) {
  const chain = records.filter((r) => r.task_id === taskId).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  const original = chain.find((r) => !r.correction_of);
  if (!original) return undefined;
  let current = original;
  while (true) {
    const next = chain.find((r) => r.correction_of === current.id);
    if (!next) return current;
    current = next;
  }
}
export function documentationProgress<T extends { id: string }>(tasks: T[], outcomes: { task_id: string }[]) {
  const recorded = tasks.filter((task) => outcomes.some((outcome) => outcome.task_id === task.id)).length;
  return { recorded, total: tasks.length, outstanding: tasks.length - recorded };
}
export function canResolveException(exception: { status: string; acknowledged_at?: string | null; follow_up?: string | null }) {
  return exception.status !== "resolved" && !!exception.acknowledged_at && !!exception.follow_up?.trim();
}
export const CONTROLLED_TEST_NOTICE = "Controlled testing with fictional records only. Not approved for live medication use. Qualified medication-safety, Irish regulatory/EU medical-device, provider-policy, privacy, security, failure and usability reviews are still required.";
