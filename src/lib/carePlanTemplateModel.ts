/**
 * Care plan template data model — part of the care plan data model
 * (re-exported from carePlansStore). Holds the standard section categories,
 * the protected-section constant and the default templates.
 *
 * The category is a hidden standard type. Event rules, insights and reporting
 * use the category, never the display name customers choose.
 */
import type { CentreType } from "./demoDataRegistry";

export type SectionCategory =
  | "about" | "communication" | "personal_care" | "mobility" | "falls" | "nutrition"
  | "medication" | "health" | "skin_integrity" | "safeguarding" | "restrictive_practice"
  | "risks" | "goals" | "family" | "decision_support" | "review_notes" | "other";

export const SECTION_CATEGORIES: SectionCategory[] = [
  "about", "communication", "personal_care", "mobility", "falls", "nutrition", "medication", "health",
  "skin_integrity", "safeguarding", "restrictive_practice", "risks", "goals", "family", "decision_support",
  "review_notes", "other",
];

export const CATEGORY_LABELS: Record<SectionCategory, string> = {
  about: "About me", communication: "Communication", personal_care: "Personal care", mobility: "Mobility",
  falls: "Falls", nutrition: "Nutrition and hydration", medication: "Medication", health: "Health",
  skin_integrity: "Skin integrity", safeguarding: "Safeguarding", restrictive_practice: "Restrictive practice",
  risks: "Risks", goals: "Goals", family: "Family / advocate", decision_support: "Decision support",
  review_notes: "Review notes", other: "Other",
};

/** Standard plan-section keys (stored on care plan versions) and their category. */
export const STANDARD_SECTION_KEYS = {
  about: "about", communication: "communication", personal_care: "personalCare", mobility: "mobility",
  falls: "fallsRisk", nutrition: "nutrition", medication: "medication", health: "health",
  skin_integrity: "skinIntegrity", safeguarding: "safeguarding", restrictive_practice: "restrictivePractice",
  risks: "risksControls", goals: "goals", family: "family", decision_support: "decisionSupport",
  review_notes: "reviewNotes",
} as const satisfies Partial<Record<SectionCategory, string>>;

/** Category for an existing plan-section key, so current plans keep working. */
export function categoryForSectionKey(key: string): SectionCategory {
  if (key === "homeAccess") return "risks";
  if (key === "visitSchedule") return "personal_care";
  const hit = (Object.entries(STANDARD_SECTION_KEYS) as [SectionCategory, string][]).find(([, k]) => k === key);
  return hit ? hit[0] : "other";
}

export type TemplateFieldType = "text" | "long_text" | "date" | "select" | "checkbox" | "number";
export const FIELD_TYPE_LABELS: Record<TemplateFieldType, string> = {
  text: "Short text", long_text: "Long text", date: "Date", select: "Choice list", checkbox: "Tick box", number: "Number",
};

export interface TemplateField {
  id: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  options?: string[];
}

export interface TemplateSection {
  id: string;
  /** Key used for this section on care plan versions (standard key or custom_<id>). */
  sectionKey: string;
  displayName: string;
  category: SectionCategory;
  additionalCategories?: SectionCategory[];
  guidance: string;
  fields: TemplateField[];
  required: boolean;
  systemRequired: boolean;
  recommendedCore: boolean;
}

export interface TemplateRemoval {
  sectionId: string;
  displayName: string;
  category: SectionCategory;
  recommendedCore: boolean;
  reason?: string;
  by: string;
  at: string;
}

export interface TemplateVersion {
  versionNumber: number;
  status: "draft" | "published" | "superseded";
  /** Section order here is the default order for care plans. */
  sections: TemplateSection[];
  reviewFrequencyMonths: number;
  approvalRequired: boolean;
  createdAt: string;
  createdBy: string;
  publishedAt?: string;
  publishedBy?: string;
  /** Sections removed in this version, with the reason where one was required. */
  removals: TemplateRemoval[];
}

export interface CarePlanTemplate {
  id: string;
  name: string;
  serviceType: CentreType;
  versions: TemplateVersion[];
}

/**
 * Protected sections — the single constant for both kinds.
 * systemRequired: LogUp features depend on it; cannot be removed. Keep short.
 * recommendedCore: may be removed with a warning and a reason. These are LogUp
 * recommendations only; they make no claim about regulation or inspection.
 */
export const PROTECTED_SECTIONS: {
  systemRequired: SectionCategory[];
  recommendedCore: Partial<Record<CentreType, SectionCategory[]>>;
} = {
  systemRequired: ["about", "review_notes"],
  recommendedCore: {
    older_persons: ["communication", "health", "falls", "nutrition", "skin_integrity", "safeguarding"],
    disability: ["about", "communication", "goals", "safeguarding", "decision_support"],
  },
};

export const RECOMMENDED_CORE_WARNING =
  "This is a LogUp recommended core section for this service type. Removing it may affect related review prompts and reporting.";

/** Care plan fields that belong to LogUp and are never editable in a template. */
export const SYSTEM_FIELDS = [
  "Service user", "Version", "Status", "Review date", "Created by", "Approved by", "Timestamps", "History",
];

export const CENTRE_TYPE_TEMPLATE_LABEL: Record<CentreType, string> = {
  older_persons: "Older persons", disability: "Disability", childrens_residential: "Children's residential",
  home_support: "Home support", supported_living: "Supported living",
};

const DEFAULT_NAMES: Partial<Record<SectionCategory, string>> = {
  about: "About Me / What Matters to Me", communication: "Communication", personal_care: "Personal Care",
  mobility: "Mobility", falls: "Falls Risk", nutrition: "Nutrition and Hydration", medication: "Medication Support",
  health: "Health Conditions", skin_integrity: "Skin Integrity", safeguarding: "Safeguarding",
  restrictive_practice: "Restrictive Practices", risks: "Risks and Controls", goals: "Goals and Outcomes",
  family: "Family / Advocate Involvement", decision_support: "Decision Support", review_notes: "Review Notes",
};

const DEFAULT_GUIDANCE: Partial<Record<SectionCategory, string>> = {
  about: "Who the person is, what matters to them and how they like to be supported.",
  communication: "How the person communicates, including aids, language and how they show pain or distress.",
  falls: "Falls history, current risk and the measures in place.",
  skin_integrity: "Skin condition, pressure area risk and repositioning or equipment needs.",
  restrictive_practice: "Any restrictive practice in use, why, how it is reviewed and less restrictive alternatives.",
  nutrition: "Diet, fluids, swallowing and any screening results.",
  review_notes: "Notes from each review of this plan.",
};

export function defaultSection(category: SectionCategory, centreType: CentreType, overrides: Partial<TemplateSection> = {}): TemplateSection {
  const key = (STANDARD_SECTION_KEYS as Record<string, string>)[category] ?? `custom_${Date.now().toString(36)}`;
  return {
    id: `SEC-${key}`,
    sectionKey: key,
    displayName: DEFAULT_NAMES[category] ?? CATEGORY_LABELS[category],
    category,
    guidance: DEFAULT_GUIDANCE[category] ?? "",
    fields: [{ id: "F-summary", label: "Summary", type: "long_text", required: true }],
    required: PROTECTED_SECTIONS.systemRequired.includes(category),
    systemRequired: PROTECTED_SECTIONS.systemRequired.includes(category),
    recommendedCore: (PROTECTED_SECTIONS.recommendedCore[centreType] ?? []).includes(category),
    ...overrides,
  };
}

const OLDER: SectionCategory[] = ["about", "communication", "personal_care", "mobility", "falls", "nutrition", "medication", "health", "skin_integrity", "safeguarding", "restrictive_practice", "risks", "goals", "family", "review_notes"];
const DISABILITY: SectionCategory[] = ["about", "communication", "decision_support", "personal_care", "mobility", "health", "skin_integrity", "safeguarding", "restrictive_practice", "risks", "goals", "family", "review_notes"];
export const VISIT_SCHEDULE_KEY = "visitSchedule";
const HOME_SECTIONS: Array<[SectionCategory, string, string]> = [
  ["about", "about", "About me and what matters to me"],
  ["risks", "homeAccess", "My home and access"],
  ["personal_care", VISIT_SCHEDULE_KEY, "My visit schedule"],
  ["personal_care", "personalCare", "Personal care"],
  ["nutrition", "nutrition", "Eating and drinking"],
  ["medication", "medication", "Medication support"],
  ["mobility", "mobility", "Moving and falls"],
  ["skin_integrity", "skinIntegrity", "Skin"],
  ["communication", "communication", "Communication"],
  ["family", "family", "My family and circle of care"],
  ["risks", "risksControls", "Risks in the home"],
  // Keep the protected LogUp review trail alongside the requested care sections.
  ["review_notes", "reviewNotes", "Review notes"],
];
const CHILDREN: SectionCategory[] = ["about", "communication", "personal_care", "health", "safeguarding", "restrictive_practice", "goals", "family", "review_notes"];
const SUPPORTED: SectionCategory[] = ["about", "communication", "personal_care", "mobility", "nutrition", "medication", "health", "skin_integrity", "safeguarding", "restrictive_practice", "risks", "goals", "family", "review_notes"];

function seedTemplate(id: string, name: string, serviceType: CentreType, cats: SectionCategory[], months: number): CarePlanTemplate {
  const at = "2025-01-15T09:00:00.000Z";
  return {
    id, name, serviceType,
    versions: [{
      versionNumber: 1, status: "published", sections: cats.map((c) => defaultSection(c, serviceType)),
      reviewFrequencyMonths: months, approvalRequired: true, createdAt: at, createdBy: "LogUp", publishedAt: at, publishedBy: "LogUp", removals: [],
    }],
  };
}

export function seedTemplates(): CarePlanTemplate[] {
  return [
    seedTemplate("TPL-NH", "Older Persons / Nursing Home Plan", "older_persons", OLDER, 6),
    seedTemplate("TPL-DIS", "Disability / Personal Plan", "disability", DISABILITY, 12),
    homeSupportTemplate(),
    seedTemplate("TPL-CR", "Children's Residential Placement Plan", "childrens_residential", CHILDREN, 3),
    seedTemplate("TPL-CORE", "Supported Living Plan", "supported_living", SUPPORTED, 6),
  ];
}

function homeSupportTemplate(): CarePlanTemplate {
  const template = seedTemplate("TPL-HS", "Home support plan", "home_support", [], 6);
  template.versions[0].versionNumber = 2;
  template.versions[0].sections = HOME_SECTIONS.map(([category, sectionKey, displayName]) =>
    defaultSection(category, "home_support", { id: `SEC-${sectionKey}`, sectionKey, displayName, ...(sectionKey === "mobility" ? { additionalCategories: ["falls" as const] } : {}) }));
  return template;
}

/** Append the new built-in template; never rewrite a published version or customer draft. */
export function upgradeHomeSupportTemplate(templates: CarePlanTemplate[]): CarePlanTemplate[] {
  const seed = homeSupportTemplate();
  if (!templates.some((t) => t.id === seed.id)) return [...templates, seed];
  return templates.map((t) => {
    if (t.id !== seed.id || t.versions.some((v) => v.sections.some((s) => s.sectionKey === VISIT_SCHEDULE_KEY))) return t;
    const versionNumber = Math.max(...t.versions.map((v) => v.versionNumber)) + 1;
    return { ...t, name: seed.name, versions: [
      ...t.versions.map((v) => v.status === "published" ? { ...v, status: "superseded" as const } : v),
      { ...seed.versions[0], versionNumber },
    ] };
  });
}

export const publishedVersion = (t: CarePlanTemplate): TemplateVersion | undefined =>
  t.versions.find((v) => v.status === "published");
export const draftVersion = (t: CarePlanTemplate): TemplateVersion | undefined =>
  t.versions.find((v) => v.status === "draft");
