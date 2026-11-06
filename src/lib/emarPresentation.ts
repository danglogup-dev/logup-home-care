import type { MedicationOutcome } from "./medicationRules";
import { STAFF_BY_ID } from "./demoDataRegistry";

export type DoseState = "given" | "prompted" | "refused" | "not_done" | "due" | "outstanding";

export function doseState(outcome: MedicationOutcome | undefined, scheduledAt: string, dueAt: string, now = Date.now()): DoseState {
  if (!outcome) return Date.parse(dueAt) < now ? "outstanding" : "due";
  if (outcome === "refused") return "refused";
  if (outcome === "not_completed" || outcome === "not_observed") return "not_done";
  if (outcome === "prompted" || outcome === "person_reports_taken") return "prompted";
  void scheduledAt; return "given";
}

export const DOSE_STYLE: Record<DoseState, { label: string; short: string; className: string }> = {
  given: { label: "Given / assisted", short: "✓", className: "bg-success/15 text-success border-success/40" },
  prompted: { label: "Prompted", short: "P", className: "bg-primary/10 text-primary border-primary/40" },
  refused: { label: "Refused", short: "R", className: "bg-destructive/15 text-destructive border-destructive/40" },
  not_done: { label: "Not available / not done", short: "N", className: "bg-warning/20 text-foreground border-warning" },
  outstanding: { label: "Not yet recorded", short: "?", className: "bg-muted text-muted-foreground border-dashed border-muted-foreground/50" },
  due: { label: "Due", short: "·", className: "bg-background text-muted-foreground border-border" },
};

export const fmt = (iso?: string | null) => iso ? new Date(iso).toLocaleString("en-IE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export const staffName = (id?: string | null) => id ? STAFF_BY_ID[id as keyof typeof STAFF_BY_ID]?.name ?? id : "—";

export const AUDIT_LABELS: Record<string, string> = {
  outcome_recorded: "Dose recorded", outcome_corrected: "Dose corrected", medication_added_draft: "Medicine added (draft)",
  instruction_edited_draft: "Instruction edited (draft)", instruction_verified: "Change verified and live", medication_stopped: "Medicine stopped",
};
