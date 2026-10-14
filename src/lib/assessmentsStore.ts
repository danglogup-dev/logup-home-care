/**
 * Assessments as records. LogUp does not score anything — it records the
 * result of whatever tool the provider uses (tool name, optional score,
 * optional risk level, or a descriptive result summary).
 * Persisted to localStorage; records are never deleted or overwritten.
 */
import { useSyncExternalStore } from "react";
import { SCENARIO_ASSESSMENTS } from "./demoScenario";
import type { ServiceUserId, StaffId } from "./demoDataRegistry";

export type AssessmentCategory = "falls" | "nutrition" | "skin_integrity" | "moving_handling" | "other";
export const ASSESSMENT_CATEGORIES: AssessmentCategory[] = ["falls", "nutrition", "skin_integrity", "moving_handling", "other"];
export const ASSESSMENT_CATEGORY_LABELS: Record<AssessmentCategory, string> = {
  falls: "Falls", nutrition: "Nutrition", skin_integrity: "Skin integrity", moving_handling: "Moving and handling", other: "Other",
};
/** Chip wording, e.g. "Falls risk: High". */
export const ASSESSMENT_CHIP_LABELS: Record<AssessmentCategory, string> = {
  falls: "Falls risk", nutrition: "Nutrition risk", skin_integrity: "Skin integrity risk", moving_handling: "Moving and handling", other: "Assessment",
};

export type AssessmentRisk = "low" | "medium" | "high" | "not_applicable";
export const RISK_LABELS: Record<AssessmentRisk, string> = { low: "Low", medium: "Medium", high: "High", not_applicable: "Not applicable" };

export interface Assessment {
  id: string;
  serviceUserId: ServiceUserId;
  category: AssessmentCategory;
  toolName: string;
  score?: string;
  riskLevel?: AssessmentRisk;
  resultSummary: string;
  assessedAt: string;
  assessedByStaffId: StaffId;
  nextDueAt: string;
  notes: string;
  linkedEventId?: string;
  /** Review suggestion this assessment answered, if any. */
  linkedSuggestionId?: string;
  recordedAt?: string;
}

const KEY = "logup.assessments.v1";

const SEED: Assessment[] = SCENARIO_ASSESSMENTS();

function load(): Assessment[] {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw) as Assessment[]; } catch { /* ignore */ }
  return SEED;
}
let state: Assessment[] = load();
const listeners = new Set<() => void>();
function emit() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function isAssessmentOverdue(a: Pick<Assessment, "nextDueAt">, now = Date.now()): boolean {
  return new Date(a.nextDueAt).getTime() < now;
}

export const assessmentsStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  getAll: () => state,
  forServiceUser(id: string): Assessment[] {
    return state.filter((a) => a.serviceUserId === id).sort((a, b) => b.assessedAt.localeCompare(a.assessedAt));
  },
  latest(id: string, category: AssessmentCategory): Assessment | undefined {
    return this.forServiceUser(id).find((a) => a.category === category);
  },
  record(input: Omit<Assessment, "id" | "recordedAt">): Assessment {
    const rec: Assessment = { ...input, id: `ASM-${Date.now().toString(36).toUpperCase()}`, recordedAt: new Date().toISOString() };
    state = [rec, ...state];
    emit();
    return rec;
  },
};

export function useAssessments(): Assessment[] {
  return useSyncExternalStore(assessmentsStore.subscribe, assessmentsStore.getAll, assessmentsStore.getAll);
}
