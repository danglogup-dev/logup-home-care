/**
 * Care plan review rules — the ONLY place that decides which care plan
 * sections an event may affect. Components never contain this logic.
 *
 * Output is always a suggestion for a person to consider. Nothing here
 * changes care plan text. Fixed-rule output is labelled
 * "LogUp review suggestion"; extra sections proposed by the (simulated)
 * assistant reading the narrative are labelled "AI suggestion".
 */
import type { Assessment, AssessmentCategory } from "./assessmentsStore";
import type { SectionCategory } from "./carePlanTemplateModel";
import type { IncidentCategory } from "./associatedIncidentsStore";

export const LOGUP_REVIEW_LABEL = "LogUp review suggestion";
export const AI_SUGGESTION_LABEL = "AI suggestion";
export const REPEAT_WINDOW_DAYS = 30;

export interface CategoryRule {
  category: IncidentCategory;
  /** Standard section categories — never display names. */
  sections: SectionCategory[];
  reassessment?: string;
  /** Only applies when a service user is linked (e.g. environmental events). */
  onlyWithServiceUser?: boolean;
  /** Plural noun for repeat wording, e.g. "falls". */
  plural: string;
}

export const CATEGORY_RULES: CategoryRule[] = [
  { category: "Falls", sections: ["falls", "mobility"], reassessment: "Consider falls risk reassessment.", plural: "falls" },
  { category: "Medication", sections: ["medication", "health"], reassessment: "Consider medication review.", plural: "medication events" },
  { category: "Safeguarding", sections: ["safeguarding", "communication"], reassessment: "Consider safeguarding plan review.", plural: "safeguarding events" },
  { category: "Restrictive practice / restraint", sections: ["restrictive_practice", "risks"], reassessment: "Consider restrictive practice review.", plural: "restrictive practice events" },
  { category: "Pressure ulcer / skin integrity", sections: ["skin_integrity"], reassessment: "Consider pressure ulcer risk assessment.", plural: "skin integrity events" },
  { category: "Missing person / unexplained absence", sections: ["safeguarding", "risks"], reassessment: "Consider absence risk assessment.", plural: "absences" },
  { category: "Nutrition / hydration", sections: ["nutrition"], reassessment: "Consider nutritional screening.", plural: "nutrition events" },
  { category: "Fire alarm / environmental", sections: ["risks"], reassessment: "Consider personal evacuation plan review.", onlyWithServiceUser: true, plural: "environmental events" },
];

/** Map an Events record (category / type / narrative) onto a rule category. */
export function ruleCategoryForEvent(input: { category?: string; eventType?: string; incidentType?: string; narrative?: string }): IncidentCategory {
  const hay = `${input.category ?? ""} ${input.eventType ?? ""} ${input.incidentType ?? ""}`.toLowerCase();
  if (/fall/.test(hay)) return "Falls";
  if (/medic/.test(hay)) return "Medication";
  if (/restrain|restrictive/.test(hay)) return "Restrictive practice / restraint";
  if (/skin|pressure/.test(hay)) return "Pressure ulcer / skin integrity";
  if (/missing|absence|abscond/.test(hay)) return "Missing person / unexplained absence";
  if (/safeguard|abuse|neglect/.test(hay)) return "Safeguarding";
  if (/nutrition|hydration|choking|weight/.test(hay)) return "Nutrition / hydration";
  if (/fire|environment/.test(hay)) return "Fire alarm / environmental";
  const n = (input.narrative ?? "").toLowerCase();
  if (/\bfell\b|\bfall\b|on the floor/.test(n)) return "Falls";
  if (/not eating|refus\w* (food|meal|drink)|dehydrat/.test(n)) return "Nutrition / hydration";
  return "Other";
}

export interface AiSectionSuggestion { category: SectionCategory; reason: string }

/** Simulated assistant reading the narrative — proposes extra sections with reasons. */
export function aiExtraSections(narrative: string, exclude: SectionCategory[]): AiSectionSuggestion[] {
  const n = narrative.toLowerCase();
  const out: AiSectionSuggestion[] = [];
  const add = (category: SectionCategory, reason: string) => { if (!exclude.includes(category) && !out.some((o) => o.category === category)) out.push({ category, reason }); };
  if (/pain/.test(n) && /(communicat|couldn'?t say|unable to say|non-?verbal|grimac)/.test(n))
    add("communication", "The account mentions difficulty communicating pain, so Communication may also be relevant.");
  if (/confus|disorient|agitat/.test(n)) add("health", "The account mentions confusion or agitation, so Health Conditions may also be relevant.");
  if (/(not eat|didn'?t eat|refus\w* (food|meal|drink)|thirst|dehydrat)/.test(n)) add("nutrition", "The account mentions eating or drinking concerns, so Nutrition and Hydration may also be relevant.");
  if (/(night|toilet|bathroom)/.test(n)) add("personal_care", "The account mentions night-time or toileting, so Personal Care may also be relevant.");
  if (/(bruis|skin tear|red area|pressure)/.test(n)) add("skin_integrity", "The account mentions marks on the skin, so Skin Integrity may also be relevant.");
  return out;
}

export interface RuleEvaluation {
  category: IncidentCategory;
  sections: SectionCategory[];
  reassessment?: string;
  /** Plain-English reason for the LogUp review suggestion. */
  reason: string;
  repeat?: { count: number; reason: string };
  ai: AiSectionSuggestion[];
}

/**
 * Evaluate an event for care plan impact. `priorSameCategory` are occurredAt
 * ISO strings of earlier linked events of the same category for the same
 * service user. Returns null when no suggestion should be raised.
 */
export function evaluateEvent(input: {
  category: IncidentCategory;
  occurredAt: string;
  narrative: string;
  hasServiceUser: boolean;
  eventLabel: string;
  priorSameCategory: string[];
}): RuleEvaluation | null {
  const rule = CATEGORY_RULES.find((r) => r.category === input.category);
  if (!rule || (rule.onlyWithServiceUser && !input.hasServiceUser)) return null;
  const at = new Date(input.occurredAt).getTime();
  const windowMs = REPEAT_WINDOW_DAYS * 864e5;
  const inWindow = input.priorSameCategory.filter((iso) => {
    const t = new Date(iso).getTime();
    return !isNaN(t) && Math.abs(at - t) <= windowMs;
  });
  const count = inWindow.length + 1;
  const repeat = count >= 2
    ? { count, reason: `${count} ${rule.plural} recorded for this service user within ${REPEAT_WINDOW_DAYS} days.` }
    : undefined;
  return {
    category: rule.category,
    sections: rule.sections,
    reassessment: rule.reassessment,
    reason: `${input.eventLabel} may relate to the current care plan. ${rule.reassessment ?? ""}`.trim(),
    repeat,
    ai: aiExtraSections(input.narrative, rule.sections),
  };
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 864e5).toISOString();
}

// ---------- Reassessment suggestions ----------
// "Consider reassessment" is only ever a suggestion. It is added for exactly four
// reasons, and every line records which one(s) produced it. An assessment that
// simply pre-dates the event is NOT a reason.

export type ReassessmentTrigger = "overdue" | "event_rule" | "provider_rule" | "person";
export const REASSESSMENT_TRIGGER_LABELS: Record<ReassessmentTrigger, string> = {
  overdue: "Assessment overdue",
  event_rule: "LogUp event rule",
  provider_rule: "Provider rule",
  person: "Added by a person",
};

/** Event rule category → the assessment it names. Only these name a reassessment. */
export const EVENT_RULE_ASSESSMENT: Partial<Record<IncidentCategory, AssessmentCategory>> = {
  Falls: "falls",
  "Nutrition / hydration": "nutrition",
  "Pressure ulcer / skin integrity": "skin_integrity",
};

/** Plan section category → related assessment category (for the overdue check). */
export const SECTION_ASSESSMENT: Partial<Record<SectionCategory, AssessmentCategory>> = {
  falls: "falls", mobility: "moving_handling", nutrition: "nutrition", skin_integrity: "skin_integrity",
};

export interface ReassessmentSuggestion {
  category: AssessmentCategory;
  triggers: ReassessmentTrigger[];
  reason: string;
  addedBy?: string;
  addedAt?: string;
  completedAssessmentId?: string;
  completedAt?: string;
  completedBy?: string;
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "long" });

export function reassessmentReason(input: {
  category: AssessmentCategory; categoryLabel: string; eventNoun: string; occurredAt: string;
  latest?: Pick<Assessment, "assessedAt" | "nextDueAt">; overdue?: boolean;
}): string {
  const ev = `${input.eventNoun.toLowerCase()} recorded ${longDate(input.occurredAt)}`;
  const name = `${input.categoryLabel} assessment`;
  if (!input.latest) return `No ${name.toLowerCase()} on record; ${ev}. Consider reassessment.`;
  const done = `${name} completed ${longDate(input.latest.assessedAt)}`;
  return input.overdue
    ? `${done}, due ${longDate(input.latest.nextDueAt)} (overdue); ${ev}. Consider reassessment.`
    : `${done}; ${ev}. Consider reassessment.`;
}

/** Decide reassessment lines for an event. Pure — callers supply the records. */
export function reassessmentsForEvent(input: {
  eventCategory: IncidentCategory;
  sectionCategories: SectionCategory[];
  eventNoun: string;
  occurredAt: string;
  latest: (c: AssessmentCategory) => Pick<Assessment, "assessedAt" | "nextDueAt"> | undefined;
  providerRules: { eventCategory: string; assessmentCategory: string }[];
  categoryLabel: (c: AssessmentCategory) => string;
}): ReassessmentSuggestion[] {
  const at = new Date(input.occurredAt).getTime();
  const map = new Map<AssessmentCategory, Set<ReassessmentTrigger>>();
  const add = (c: AssessmentCategory, t: ReassessmentTrigger) => { if (!map.has(c)) map.set(c, new Set()); map.get(c)!.add(t); };
  for (const sc of input.sectionCategories) {
    const c = SECTION_ASSESSMENT[sc];
    const l = c ? input.latest(c) : undefined;
    if (c && l && new Date(l.nextDueAt).getTime() < at) add(c, "overdue");
  }
  const ruleCat = EVENT_RULE_ASSESSMENT[input.eventCategory];
  if (ruleCat) add(ruleCat, "event_rule");
  for (const r of input.providerRules) if (r.eventCategory === input.eventCategory) add(r.assessmentCategory as AssessmentCategory, "provider_rule");
  return Array.from(map.entries()).map(([c, t]) => {
    const l = input.latest(c);
    return {
      category: c,
      triggers: Array.from(t),
      reason: reassessmentReason({ category: c, categoryLabel: input.categoryLabel(c), eventNoun: input.eventNoun, occurredAt: input.occurredAt, latest: l, overdue: t.has("overdue") }),
    };
  });
}
