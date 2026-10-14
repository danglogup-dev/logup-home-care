/**
 * Directory of Residents rules — the one place that says which details a
 * designated centre keeps in its Directory of Residents, which are required,
 * and the admission care plan deadline. Pages read from here; they never
 * hold their own list.
 */
import type { CentreType, DemoPersonSupported, AdmissionType, AdmittedFrom, Sex, MaritalStatus } from "./demoDataRegistry";

export const DIRECTORY_SOURCE = {
  sourceReference:
    "S.I. 415/2013, Schedule 3, older persons; confirm the equivalent schedule for disability centres in S.I. 367/2013",
  lastReviewedAt: "2026-10-07",
};

export const ADMISSION_TYPE_LABELS: Record<AdmissionType, string> = {
  long_term: "Long-term", respite: "Respite", short_stay: "Short stay",
};
export const ADMITTED_FROM_LABELS: Record<AdmittedFrom, string> = {
  home: "Home", hospital: "Hospital", another_centre: "Another centre", other: "Other",
};
export const SEX_LABELS: Record<Sex, string> = {
  female: "Female", male: "Male", intersex: "Intersex", not_stated: "Prefer not to say",
};
export const MARITAL_LABELS: Record<MaritalStatus, string> = {
  single: "Single", married: "Married", civil_partnership: "Civil partnership", separated: "Separated",
  divorced: "Divorced", widowed: "Widowed", not_stated: "Not stated",
};
export const REPRESENTATIVE_TYPE_LABELS = {
  next_of_kin: "Next of kin",
  authorised_representative: "Authorised representative",
  decision_supporter: "Decision supporter",
} as const;

/** Step of the Admit flow the field is completed on. */
export type DirectoryStep = "about" | "contacts" | "admission";

export interface DirectoryField {
  key: string;
  label: string;
  required: boolean;
  step: DirectoryStep;
  value: (u: Partial<DemoPersonSupported>) => string;
}

const nok = (u: Partial<DemoPersonSupported>) =>
  (u.representatives ?? []).find((r) => (r.type ?? "next_of_kin") === "next_of_kin" || r.type === "authorised_representative");

export const DIRECTORY_FIELDS: DirectoryField[] = [
  { key: "legalName", label: "Name", required: true, step: "about", value: (u) => [u.legalFirstName, u.legalLastName].filter(Boolean).join(" ") || u.name || "" },
  { key: "dateOfBirth", label: "Date of birth", required: true, step: "about", value: (u) => u.dateOfBirth ?? "" },
  { key: "sex", label: "Sex", required: true, step: "about", value: (u) => (u.sex ? SEX_LABELS[u.sex] : "") },
  { key: "maritalStatus", label: "Marital status", required: true, step: "about", value: (u) => (u.maritalStatus ? MARITAL_LABELS[u.maritalStatus] : "") },
  { key: "previousAddress", label: "Address before admission", required: true, step: "about", value: (u) => u.previousAddress ?? "" },
  { key: "nokName", label: "Next of kin or authorised person", required: true, step: "contacts", value: (u) => nok(u)?.name ?? "" },
  { key: "nokAddress", label: "Next of kin address", required: true, step: "contacts", value: (u) => nok(u)?.address ?? "" },
  { key: "nokPhone", label: "Next of kin phone", required: true, step: "contacts", value: (u) => nok(u)?.phone ?? "" },
  { key: "gpName", label: "GP name", required: true, step: "contacts", value: (u) => u.gp?.name ?? "" },
  { key: "gpPractice", label: "GP practice / address", required: true, step: "contacts", value: (u) => u.gp?.practice ?? "" },
  { key: "gpPhone", label: "GP phone", required: true, step: "contacts", value: (u) => u.gp?.phone ?? "" },
  { key: "admissionDate", label: "Date of admission", required: true, step: "admission", value: (u) => u.admissionDate ?? "" },
  { key: "admittedFrom", label: "Admitted from", required: true, step: "admission", value: (u) => (u.admittedFrom ? `${ADMITTED_FROM_LABELS[u.admittedFrom]}${u.admittedFromName ? ` · ${u.admittedFromName}` : ""}` : "") },
  { key: "arrangedBy", label: "Admission arranged by (name and address)", required: true, step: "admission", value: (u) => u.admissionArrangedBy ?? "" },
  { key: "preferredLanguage", label: "Preferred language", required: false, step: "about", value: (u) => u.preferredLanguage ?? "" },
  { key: "roomOrUnit", label: "Room or unit", required: false, step: "admission", value: (u) => u.roomOrUnit ?? "" },
  { key: "admissionType", label: "Admission type", required: false, step: "admission", value: (u) => (u.admissionType ? ADMISSION_TYPE_LABELS[u.admissionType] : "") },
];

/** Required directory fields that are still empty. */
export function missingDirectoryFields(u: Partial<DemoPersonSupported>): DirectoryField[] {
  return DIRECTORY_FIELDS.filter((f) => f.required && !f.value(u).trim());
}

/** The five details needed to admit. Everything else can follow later. */
export const ESSENTIAL_ADMISSION_FIELDS = ["name", "dateOfBirth", "siteId", "admissionDate", "keyWorkerStaffId"] as const;

// ---------- Admission care plan deadline ----------

export interface AdmissionCarePlanRule {
  hours: number;
  label: string;
  sourceReference: string;
}

const ADMISSION_CARE_PLAN_RULES: Partial<Record<CentreType, AdmissionCarePlanRule>> = {
  older_persons: {
    hours: 48,
    label: "Care plan due within 48 hours of admission",
    sourceReference: "S.I. 415/2013, Regulation 5",
  },
};

/** Fixed deadline for the first care plan, or undefined when the service type has none. */
export function admissionCarePlanDeadline(centreType: CentreType | undefined, admissionDate: string): (AdmissionCarePlanRule & { dueAt: string }) | undefined {
  const rule = centreType ? ADMISSION_CARE_PLAN_RULES[centreType] : undefined;
  if (!rule) return undefined;
  const base = new Date(admissionDate.length <= 10 ? `${admissionDate}T12:00:00` : admissionDate);
  return { ...rule, dueAt: new Date(base.getTime() + rule.hours * 3600_000).toISOString() };
}

export function ageFrom(dob: string | undefined, at = new Date()): number | undefined {
  if (!dob) return undefined;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return undefined;
  let a = at.getFullYear() - d.getFullYear();
  const m = at.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < d.getDate())) a--;
  return a;
}
