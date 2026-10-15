// Visit competency + client carer-preference rules. Pure helpers over the existing
// workforce qualification records, visit templates and client record — no second store.
import { STAFF_BY_ID, type StaffId } from "./demoDataRegistry";
import { qualificationStatus, workforceStore } from "./workforceStore";

export const SUPPORT_CATEGORIES = ["personal_care", "intimate_care", "medication_support", "meal_support", "mobility_support", "companionship", "domestic_support", "community_support"] as const;
export type SupportCategory = typeof SUPPORT_CATEGORIES[number];
export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  personal_care: "Personal care", intimate_care: "Intimate care", medication_support: "Medication support", meal_support: "Meal support",
  mobility_support: "Mobility support", companionship: "Companionship", domestic_support: "Domestic support", community_support: "Community support",
};

export type CarerPreferenceType = "no_preference" | "female_preferred" | "male_preferred" | "female_required" | "male_required" | "other";
export type PreferenceAppliesTo = "all_visits" | "intimate_care_visits";
/** Structured, documented carer preference on the client record. Recorded by staff ID. */
export interface CarerPreference {
  type: CarerPreferenceType;
  appliesTo: PreferenceAppliesTo;
  reasonContext?: string;
  recordedByStaffId?: StaffId;
  recordedAt?: string;
  reviewDate?: string;
}
export const CARER_PREFERENCE_LABELS: Record<CarerPreferenceType, string> = {
  no_preference: "No preference", female_preferred: "Female preferred", male_preferred: "Male preferred",
  female_required: "Female required", male_required: "Male required", other: "Other documented preference",
};
export const APPLIES_TO_LABELS: Record<PreferenceAppliesTo, string> = { all_visits: "All visits", intimate_care_visits: "Intimate care visits only" };

export const isRequiredPreference = (t: CarerPreferenceType) => t === "female_required" || t === "male_required";

/** Returns user-facing problems; empty = can be saved. Required (and Other) needs context, recorder and date. */
export function validateCarerPreference(p: CarerPreference): string[] {
  const errs: string[] = [];
  if (isRequiredPreference(p.type) || p.type === "other") {
    if (!p.reasonContext?.trim()) errs.push("Add the reason or context for this preference.");
    if (!p.recordedByStaffId) errs.push("Record who documented this preference.");
    if (!p.recordedAt || Number.isNaN(Date.parse(p.recordedAt))) errs.push("Add the date this preference was recorded.");
  }
  return errs;
}

/** Does the preference apply to a visit with these support categories? */
export function preferenceApplies(p: CarerPreference | undefined, categories: readonly SupportCategory[] = []): boolean {
  if (!p || p.type === "no_preference" || p.type === "other") return false;
  return p.appliesTo === "all_visits" || categories.includes("intimate_care");
}
const wanted = (t: CarerPreferenceType) => t.startsWith("female") ? "female" : t.startsWith("male") ? "male" : undefined;
/** true = matches, false = does not, undefined = no applicable gender preference or unknown carer gender. */
export function matchesPreference(p: CarerPreference | undefined, categories: readonly SupportCategory[], staffId: StaffId): boolean | undefined {
  if (!preferenceApplies(p, categories)) return undefined;
  const g = STAFF_BY_ID[staffId]?.gender;
  const w = wanted(p!.type);
  return g && w ? g === w : undefined;
}
/** Exclusion reason when a *required* preference applies and the carer doesn't match. */
export function preferenceExclusion(p: CarerPreference | undefined, categories: readonly SupportCategory[], staffId: StaffId): string | undefined {
  if (!p || !isRequiredPreference(p.type)) return undefined;
  return matchesPreference(p, categories, staffId) === false ? `${CARER_PREFERENCE_LABELS[p.type]} by client${p.appliesTo === "intimate_care_visits" ? " for intimate care" : ""}` : undefined;
}

export interface CompetencyResult { excluded: string[]; warnings: string[] }
/** Uses the existing workforce qualification records. Green = ok, amber = warning, red/missing = excluded. */
export function competencyCheck(staffId: StaffId, qualificationIds: readonly string[], asOf: Date): CompetencyResult {
  const member = workforceStore.getStaffMember(staffId);
  const excluded: string[] = [], warnings: string[] = [];
  for (const qid of qualificationIds) {
    const label = workforceStore.getQualType(qid)?.name ?? qid;
    const q = member?.qualifications.find((x) => x.qualificationId === qid);
    if (!q) { excluded.push(`${label} competency missing`); continue; }
    const s = qualificationStatus(q, asOf);
    if (s === "red") excluded.push(`${label} expired`);
    else if (s === "amber") warnings.push(`${label} due soon (expires ${q.expiresOn})`);
  }
  return { excluded, warnings };
}

export interface VisitRequirement { requiredQualificationIds: string[]; supportCategories: SupportCategory[] }
/** A visit's own requirement wins; otherwise the recurring template's — always read live, never copied. */
export function requirementFor(visit: { requiredQualificationIds?: string[]; supportCategories?: SupportCategory[]; templateId?: string }, templates: readonly { id: string; requiredQualificationIds?: string[]; supportCategories?: SupportCategory[] }[]): VisitRequirement {
  const t = visit.templateId ? templates.find((x) => x.id === visit.templateId) : undefined;
  return {
    requiredQualificationIds: visit.requiredQualificationIds ?? t?.requiredQualificationIds ?? [],
    supportCategories: visit.supportCategories ?? t?.supportCategories ?? [],
  };
}
