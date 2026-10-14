import type { ReassessmentSuggestion } from "./carePlanReviewRules";
// In-memory Care Planning store. Mirrors the pub/sub pattern used by
// incidentsStore/learningStore. Persists to localStorage for demo continuity.
//
// AI outputs surfaced here are always presented as drafts and never applied
// automatically. Humans review, edit, approve and publish.

import { useSyncExternalStore } from "react";
import { carePlanAuditStore, type CarePlanAuditEvent } from "./carePlanAuditStore";
import { serviceUsersStore, type ServiceUser } from "./serviceUsersStore";
import { getStaffName, type StaffId } from "./demoDataRegistry";
import { scenarioEvent, planTiming } from "./demoScenario";
import type { PersonSupportedId } from "./demoDataRegistry";
import { LOGUP_REVIEW_LABEL, REPEAT_WINDOW_DAYS } from "./carePlanReviewRules";
import { associatedIncidentsStore } from "./associatedIncidentsStore";
import { sitesStore } from "./sitesStore";
import {
  seedTemplates, publishedVersion as tplPublished, draftVersion as tplDraft, categoryForSectionKey as catForKey,
  PROTECTED_SECTIONS as PROTECTED, STANDARD_SECTION_KEYS as STANDARD_KEYS, type CarePlanTemplate, type TemplateVersion, type TemplateSection, type SectionCategory as SecCat,
} from "./carePlanTemplateModel";
import type { CentreType } from "./demoDataRegistry";

// Local alias so the many call sites below stay compact. carePlanId defaults
// to versionId (the two are conceptually the same in this frontend model).
const audit = (input: Omit<Parameters<typeof carePlanAuditStore.log>[0], "carePlanId"> & { carePlanId?: string }): CarePlanAuditEvent =>
  carePlanAuditStore.log({ ...input, carePlanId: input.carePlanId ?? input.versionId });

export type CarePlanStatus =
  | "published"
  | "review_suggested"
  | "draft_in_progress"
  | "ready_for_approval"
  | "approved"
  | "rejected"
  | "archived";

export type RiskLevel = "low" | "medium" | "high";

export type SectionKey =
  | "about"
  | "communication"
  | "personalCare"
  | "mobility"
  | "fallsRisk"
  | "nutrition"
  | "medication"
  | "health"
  | "safeguarding"
  | "risksControls"
  | "goals"
  | "family"
  | "skinIntegrity"
  | "restrictivePractice"
  | "decisionSupport"
  | "reviewNotes";

export const SECTION_LABELS: Record<SectionKey, string> = {
  about: "About Me / What Matters to Me",
  communication: "Communication",
  personalCare: "Personal Care",
  mobility: "Mobility",
  fallsRisk: "Falls Risk",
  nutrition: "Nutrition and Hydration",
  medication: "Medication Support",
  health: "Health Conditions",
  safeguarding: "Safeguarding",
  risksControls: "Risks and Controls",
  goals: "Goals and Outcomes",
  family: "Family / Advocate Involvement",
  skinIntegrity: "Skin Integrity",
  restrictivePractice: "Restrictive Practices",
  decisionSupport: "Decision Support",
  reviewNotes: "Review Notes",
};

export const SECTION_ORDER: SectionKey[] = [
  "about","communication","personalCare","mobility","fallsRisk","nutrition",
  "medication","health","skinIntegrity","safeguarding","restrictivePractice","risksControls","goals","family","decisionSupport","reviewNotes",
];

export interface PersonSupported {
  id: string;
  name: string;
  initials: string;
  site: string;
  unit?: string;
  dob?: string;
  riskLevel: RiskLevel;
  tags: string[];
  setting: "nursing_home" | "disability" | "home_support" | "childrens_residential";
  /** Display label of the assigned key worker. Not used for permissions. */
  keyWorker?: string;
  /** Assigned key worker id — used for permission checks. */
  keyWorkerStaffId?: StaffId;
}

export type SectionVisibility = "all_staff" | "managers_only" | "restricted";

export interface CarePlanSection {
  /** Canonical SectionKey values for template sections, or `custom_<id>` for custom sections. */
  key: string;
  body: string;
  lastReviewed?: string;
  humanEdited?: boolean;
  sourceContributionIds?: string[];
  // Optional metadata for custom / added sections
  label?: string;
  isCustom?: boolean;
  /** id of the draft version that first introduced this section (marks it as "added, awaiting approval"). */
  addedInVersionId?: string;
  purpose?: string;
  riskLevel?: RiskLevel;
  reviewFrequencyMonths?: number;
  evidenceRequired?: boolean;
  visibility?: SectionVisibility;
  owner?: string;
  reason?: string;
  linkedTaskNote?: string;
  /** Source / AI draft / Human confirmed / Approved. Absent = written by a person before this was tracked. */
  contentState?: ContentState;
  /** Kept on every later version: this text started as an AI draft. */
  aiOrigin?: AiOrigin;
}

export type ContentState = "source" | "ai_draft" | "human_confirmed" | "approved";
export const CONTENT_STATE_LABELS: Record<ContentState, string> = {
  source: "Source", ai_draft: "AI draft", human_confirmed: "Human confirmed", approved: "Approved",
};
export interface AiOrigin {
  proposalId: string;
  originalText: string;
  acceptedBy: string;
  acceptedAt: string;
  editedBeforeAccept?: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
}

export type ConsultedWho = "service_user" | "representative" | "family" | "advocate" | "not_possible";
export type ConsultMethod = "meeting" | "conversation" | "phone";
export const CONSULTED_WHO_LABELS: Record<ConsultedWho, string> = {
  service_user: "Service user", representative: "Representative", family: "Family", advocate: "Advocate", not_possible: "Not possible",
};
export const CONSULT_METHOD_LABELS: Record<ConsultMethod, string> = { meeting: "Meeting", conversation: "Conversation", phone: "Phone" };
export interface Consultation {
  who: ConsultedWho[];
  notPossibleReason?: string;
  how: ConsultMethod[];
  recordedBy: string;
  recordedAt: string;
}

/** One decision on an Ask LogUp proposal — the original proposal is always kept. */
export interface AssistantDecision {
  proposalId: string;
  prompt: string;
  kind: "section_updated" | "section_moved" | "section_added" | "note_added";
  origin: "ai" | "rules";
  sectionKey?: string;
  proposedText?: string;
  finalText?: string;
  proposedOrder?: string[];
  previousOrder?: string[];
  sourceLabel: string;
  decision: "accepted" | "accepted_with_edits" | "rejected";
  by: string;
  at: string;
}

export type DraftSourceType = "manual" | "incident" | "specialist" | "AI" | "review" | "audit";

/** Per-section change record captured on a draft version. */
export interface SectionChangeRecord {
  key: string;
  kind: "edited" | "added" | "removed" | "reordered";
  previousOrder?: string[];
  proposedOrder?: string[];
  previousContent?: string;
  proposedContent?: string;
  editedBy: string;
  editedAt: string;
  reason?: string;
  source?: DraftSourceType;
  // For added sections
  sectionType?: "template" | "custom";
  sectionTitle?: string;
  riskLevel?: RiskLevel;
  reviewFrequencyMonths?: number;
}

export interface CarePlanVersion {
  id: string;
  versionNumber: number;
  status: CarePlanStatus;
  sections: CarePlanSection[];
  createdAt: string;
  createdBy: string;
  approvedBy?: string;
  publishedAt?: string;
  archivedAt?: string;
  reviewNotes?: string;
  sourceSuggestionId?: string;
  aiAssisted?: boolean;
  // Governed change metadata
  reasonForChange?: string;
  sourceType?: DraftSourceType;
  currentApprovedVersionId?: string;
  sectionChanges?: SectionChangeRecord[];
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionNote?: string;
  cancelledAt?: string;
  approvalInstanceId?: string;
  /** Template and template version this care plan version follows. */
  templateId?: string;
  templateVersion?: number;
  /** Person-specific section order. Only set through a draft; absent = template order. */
  sectionOrderOverride?: string[];
  consultation?: Consultation;
  assistantDecisions?: AssistantDecision[];
  /** Fixed first-plan deadline from admission (rule lives in residentDirectory.ts). */
  dueBy?: string;
  dueRuleLabel?: string;
  dueRuleSource?: string;
}

export interface CarePlan {
  personId: string;
  templateId: string;
  currentVersionId: string;
  versions: CarePlanVersion[];
  nextReviewDue: string;
  reviewFrequencyMonths: number;
}

export interface EvidenceLink {
  id: string;
  kind: "incident" | "audit" | "task" | "note";
  refId: string;
  label: string;
  date?: string;
  severity?: string;
}

export interface ReviewSuggestion {
  id: string;
  personId: string;
  status: "open" | "actioned" | "dismissed";
  title: string;
  reason: string;
  suggestedSections: SectionKey[];
  sourceIncidentId?: string;
  sources: EvidenceLink[];
  createdAt: string;
  aiLabel: string;
  draftSectionKey: SectionKey;
  draftText: string;
  actionedVersionId?: string;
  // ---- Event-triggered review suggestions (carePlanReviewRules) ----
  /** "LogUp review suggestion" for fixed-rule output. Absent on legacy AI suggestions. */
  label?: string;
  eventLabel?: string;
  occurredAt?: string;
  reassessment?: string;
  repeatReason?: string;
  aiSections?: { key: SectionKey; reason: string }[];
  dueAt?: string;
  reviewerStaffId?: StaffId;
  assignedBy?: string;
  assignedAt?: string;
  dismissedBy?: string;
  dismissedReason?: string;
  dismissedAt?: string;
  /** "Consider reassessment" lines, each with the trigger(s) that produced it. */
  reassessments?: ReassessmentSuggestion[];
}

export interface FollowUpTaskSuggestion {
  id: string;
  personId: string;
  text: string;
  status: "suggested" | "created" | "dismissed";
  linkedVersionId?: string;
  linkedSuggestionId?: string;
}

export type { CarePlanTemplate, TemplateSection, TemplateVersion, TemplateField, TemplateFieldType, SectionCategory, TemplateRemoval } from "./carePlanTemplateModel";
export {
  SECTION_CATEGORIES, CATEGORY_LABELS, PROTECTED_SECTIONS, RECOMMENDED_CORE_WARNING, SYSTEM_FIELDS, FIELD_TYPE_LABELS,
  CENTRE_TYPE_TEMPLATE_LABEL, categoryForSectionKey, publishedVersion, draftVersion, defaultSection, STANDARD_SECTION_KEYS,
} from "./carePlanTemplateModel";

interface State {
  people: PersonSupported[];
  plans: CarePlan[];
  suggestions: ReviewSuggestion[];
  followUps: FollowUpTaskSuggestion[];
  templates: CarePlanTemplate[];
}

const AI_LABEL = "AI suggestion only. Human review required.";

// ---------- seed ----------

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function makeSection(key: SectionKey, body: string, lastReviewed?: string): CarePlanSection {
  return { key, body, lastReviewed };
}

// Per-person section builder. Ensures every person's care plan text refers
// only to that person — no cross-person mixing (Patrick's data must never
// appear on Mary's plan, etc.).
interface PersonSeed {
  id: string;
  name: string;
  first: string;
  initials: string;
  site: string;
  unit?: string;
  age: number;
  riskLevel: RiskLevel;
  tags: string[];
  about: string;
  communication: string;
  personalCare: string;
  mobility: string;
  fallsRisk: string;
  nutrition: string;
  medication: string;
  health: string;
  safeguarding: string;
  risksControls: string;
  goals: string;
  family: string;
  reviewNotes: string;
}

function sectionsFor(p: PersonSeed): CarePlanSection[] {
  return [
    makeSection("about", p.about),
    makeSection("communication", p.communication),
    makeSection("personalCare", p.personalCare),
    makeSection("mobility", p.mobility),
    makeSection("fallsRisk", p.fallsRisk),
    makeSection("nutrition", p.nutrition),
    makeSection("medication", p.medication),
    makeSection("health", p.health),
    makeSection("safeguarding", p.safeguarding),
    makeSection("risksControls", p.risksControls),
    makeSection("goals", p.goals),
    makeSection("family", p.family),
    makeSection("reviewNotes", p.reviewNotes),
  ];
}

const PERSON_SEEDS: PersonSeed[] = [
  {
    id: "PS-001", name: "Patrick Murphy", first: "Patrick", initials: "PM",
    // keyWorker attached via seed() so demo persona "Emma Ryan" can edit.
    site: "East Cork", unit: "", age: 78, riskLevel: "high",
    tags: ["Falls risk", "Mobility"],
    about: "Patrick is a 78-year-old man who enjoys reading the paper each morning and listening to traditional music. He values his independence and prefers to be addressed as 'Paddy' by staff he knows well.",
    communication: "Patrick communicates verbally in English. Wears glasses for reading and a hearing aid in the right ear. Prefers face-to-face conversation, particularly in the morning when most alert.",
    personalCare: "Patrick prefers a shower in the morning with the assistance of one staff member. Manages oral care independently with prompts.",
    mobility: "Patrick mobilises independently short distances using a four-wheeled walking frame. Requires supervision on stairs and when moving between rooms at night. Occasional unsteadiness when standing quickly.",
    fallsRisk: "Assessed as high falls risk. Two prior falls in the last 12 months, both without serious injury. Bed and chair sensor mats in place. Call bell placed within reach at all times.",
    nutrition: "Normal diet, thin fluids. Enjoys porridge for breakfast and a light supper. No swallowing difficulties recorded.",
    medication: "Supported administration by nursing staff. Includes anti-hypertensive and vitamin D. See MAR chart for full list.",
    health: "Hypertension (controlled). Mild osteoarthritis in both knees. No cognitive impairment recorded at last review.",
    safeguarding: "No active safeguarding concerns. Next of kin: daughter (Mary Murphy).",
    risksControls: "Falls risk (high) — sensor mats, call bell, hourly night checks. Skin integrity risk (low) — repositioning encouraged.",
    goals: "Patrick would like to continue attending the Thursday music session in the day room and to maintain his walking distance to the garden.",
    family: "Daughter Mary visits weekly on Sundays and is the nominated advocate for care plan discussions.",
    reviewNotes: "Reviewed at 6-monthly interval by PIC. No changes required at last review.",
  },
  {
    id: "PS-002", name: "Mary O'Sullivan", first: "Mary", initials: "MO",
    site: "East Cork", unit: "", age: 82, riskLevel: "medium",
    tags: ["Nutrition"],
    about: "Mary is an 82-year-old woman who enjoys knitting, watching Fair City in the evenings, and having a cup of tea with visitors. She likes to be addressed as 'Mary'.",
    communication: "Mary communicates verbally in English and Irish. No sensory impairment recorded. Prefers a quiet environment for meaningful conversations.",
    personalCare: "Mary manages most personal care with prompting and standby assistance from one staff member. Prefers a bath twice weekly.",
    mobility: "Mary mobilises independently indoors and uses a walking stick outdoors. No recent history of falls.",
    fallsRisk: "Assessed as low-to-medium falls risk. No falls in the last 12 months. Standard environmental checks in place.",
    nutrition: "Reduced appetite over the last 3 months. On a fortified diet with mid-morning and mid-afternoon snacks. Weekly weights. Dietitian review requested. Prefers small portions and dislikes strong flavours.",
    medication: "Self-medicates paracetamol PRN with nurse oversight. Regular calcium and vitamin D supplement.",
    health: "Type 2 diabetes (diet-controlled). Mild anaemia under GP review.",
    safeguarding: "No active safeguarding concerns. Next of kin: son (Seán O'Sullivan).",
    risksControls: "Nutritional risk (medium) — fortified diet, weekly weights, dietitian input. Falls risk (low).",
    goals: "Mary would like to regain 2kg over the next 3 months and continue her weekly hairdressing appointment.",
    family: "Son Seán visits fortnightly and is the nominated advocate for care plan discussions.",
    reviewNotes: "Reviewed at 6-monthly interval by PIC. Nutritional support plan added at last review.",
  },
  {
    id: "PS-003", name: "John Byrne", first: "John", initials: "JB",
    site: "East Cork", unit: "", age: 74, riskLevel: "low",
    tags: [],
    about: "John is a 74-year-old man, retired schoolteacher, who enjoys crosswords, gardening, and a walk each morning. He likes to be addressed as 'John'.",
    communication: "John communicates verbally in English. No sensory impairment. Confident and clear communicator.",
    personalCare: "John is fully independent with all personal care.",
    mobility: "John mobilises independently indoors and outdoors without aids. No recent falls.",
    fallsRisk: "Low falls risk. No falls in the last 24 months.",
    nutrition: "Normal diet and fluids. Good appetite. No dietary restrictions.",
    medication: "Self-medicates from a locked bedside cabinet under quarterly review by nursing staff.",
    health: "Well-controlled hypertension. Otherwise fit and well.",
    safeguarding: "No active safeguarding concerns. Next of kin: wife (Anne Byrne).",
    risksControls: "No active risks. Standard monitoring only.",
    goals: "John would like to continue leading the resident-led gardening group each Saturday.",
    family: "Wife Anne visits most days. Nominated advocate for care plan discussions.",
    reviewNotes: "Reviewed at 6-monthly interval by PIC. No changes required.",
  },
  {
    id: "PS-004", name: "Eileen Fitzgerald", first: "Eileen", initials: "EF",
    site: "West Waterford", unit: "", age: 86, riskLevel: "high",
    tags: ["Safeguarding review"],
    about: "Eileen is an 86-year-old woman who enjoys the piano, family photographs, and quiet time in the day room. She prefers to be addressed as 'Mrs. Fitzgerald'.",
    communication: "Eileen communicates verbally in English. Wears bilateral hearing aids. Benefits from short, clear sentences and eye contact.",
    personalCare: "Eileen requires the assistance of two staff members for all personal care using safe moving and handling techniques.",
    mobility: "Eileen mobilises using a wheelchair with assistance of one staff member. Uses a hoist for transfers.",
    fallsRisk: "Assessed as medium falls risk. Chair sensor mat in day room. Regular repositioning schedule.",
    nutrition: "Modified diet (soft, bite-sized) with thickened fluids following SALT assessment. Prefers sweet foods.",
    medication: "Full nurse-administered medication. See MAR chart. Includes analgesia and thyroid replacement.",
    health: "Vascular dementia (mild-to-moderate). Osteoporosis. Hypothyroidism.",
    safeguarding: "Safeguarding plan in place following a disclosure about a visitor and money. Visits supervised; personal finances held securely by the centre.",
    risksControls: "Safeguarding review (open). Skin integrity risk (medium) — 2-hourly repositioning. Falls risk (medium).",
    goals: "Eileen would like to continue receiving weekly music therapy and to attend the Sunday family visits in the family room.",
    family: "Nephew Declan visits weekly and is the nominated advocate. Visits from other relatives are supervised while the safeguarding plan is in place.",
    reviewNotes: "Reviewed at 6-monthly interval by PIC. Safeguarding review appended out-of-cycle.",
  },
  {
    id: "PS-005", name: "Tomás Ryan", first: "Tomás", initials: "TR",
    site: "West Waterford", unit: "", age: 76, riskLevel: "medium",
    tags: ["Skin integrity", "Medication"],
    about: "Tomás is a 76-year-old man, a former GAA coach, who enjoys watching hurling matches and telling stories about his club. He likes to be addressed as 'Tomás'.",
    communication: "Tomás communicates verbally in English and Irish. No sensory impairment.",
    personalCare: "Tomás requires prompting and standby assistance for showering. Independent with oral care and dressing.",
    mobility: "Tomás mobilises independently with a walking stick. No recent falls.",
    fallsRisk: "Low-to-medium falls risk. Reviewed after starting a new anti-hypertensive last month — no adverse effects to date.",
    nutrition: "Normal diet, normal fluids. Enjoys hearty meals. Weekly weights during medication adjustment period.",
    medication: "Complex medication regimen following recent adjustments — includes anti-hypertensives, anticoagulant, and diabetes medication. Nurse-administered. Pharmacist review scheduled for next month.",
    health: "Type 2 diabetes (medication-controlled). Atrial fibrillation. Recently adjusted anti-hypertensive.",
    safeguarding: "No active safeguarding concerns. Next of kin: brother (Niall Ryan).",
    risksControls: "Skin integrity risk (high) — category 3 pressure ulcer on sacrum, two-hourly repositioning, pressure-relieving mattress. Medication risk (medium).",
    goals: "Tomás would like to continue attending the weekly hurling match viewings in the day room.",
    family: "Brother Niall visits monthly and is the nominated advocate for care plan discussions.",
    reviewNotes: "Reviewed at 6-monthly interval by PIC. Medication changes logged.",
  },
  {
    id: "PS-006", name: "Bridget Walsh", first: "Bridget", initials: "BW",
    site: "West Waterford", age: 54, riskLevel: "low",
    tags: ["Medication"],
    about: "Bridget is a 54-year-old woman who loves baking, country music and her weekly trip to the shops in Portlaoise. She likes to be called 'Bridget'.",
    communication: "Bridget uses short spoken phrases and pictures. Give one choice at a time and allow time to answer.",
    personalCare: "Bridget needs prompting and support from one staff member with showering. Chooses her own clothes.",
    mobility: "Bridget walks independently indoors and outdoors.",
    fallsRisk: "Low falls risk. No falls in the last 24 months.",
    nutrition: "Normal diet and fluids. Enjoys helping to bake on Fridays.",
    medication: "Staff administer all medication from the locked press at set times. Morning medication is time-sensitive — give by 08:30.",
    health: "Hypothyroidism. Mild learning disability. Annual health check with GP.",
    safeguarding: "No active safeguarding concerns. Next of kin: mother (Kathleen Walsh).",
    risksControls: "Medication timing risk — round handover sheet in use.",
    goals: "Bridget would like to keep baking on Fridays and start a weekly art class.",
    family: "Mother Kathleen visits weekly and supports significant decisions alongside Bridget.",
    reviewNotes: "Reviewed annually with Bridget and her mother.",
  },
  {
    id: "PS-007", name: "Michael Doyle", first: "Michael", initials: "MD",
    site: "West Waterford", age: 41, riskLevel: "medium",
    tags: ["Epilepsy", "Falls risk"],
    about: "Michael is a 41-year-old man who enjoys gardening, football on TV and walks in the local park. He likes to be called 'Michael'.",
    communication: "Michael communicates verbally. Prefers clear, short explanations and time to decide.",
    personalCare: "Michael is independent with personal care; staff stay nearby when he showers because of seizure risk.",
    mobility: "Michael walks independently. One staff member stays with him outdoors.",
    fallsRisk: "Falls are linked to seizures only. Staff accompany him on walks and in the garden.",
    nutrition: "Normal diet and fluids.",
    medication: "Anti-seizure medication given by trained staff at set times. Emergency medication protocol in place.",
    health: "Epilepsy (tonic-clonic seizures). Moderate learning disability.",
    safeguarding: "No active safeguarding concerns. Next of kin: sister (Joan Doyle).",
    risksControls: "Seizure risk — seizure protocol, trained staff on every shift, supervision outdoors.",
    goals: "Michael would like to keep looking after the vegetable beds and go to a match this season.",
    family: "Sister Joan visits fortnightly and is involved in significant decisions.",
    reviewNotes: "Reviewed annually with Michael and his sister.",
  },
];

function personFromServiceUser(su: ServiceUser, base?: Partial<PersonSupported> & { riskLevel?: RiskLevel; tags?: string[] }): PersonSupported {
  return {
    id: su.id,
    name: su.name,
    initials: base?.initials ?? su.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(),
    site: su.siteName,
    unit: "",
    dob: su.dateOfBirth,
    riskLevel: base?.riskLevel ?? (su.risk.toLowerCase() as RiskLevel),
    tags: base?.tags ?? [su.primaryFocus],
    setting: base?.setting ?? "nursing_home",
    keyWorker: getStaffName(su.keyWorkerStaffId),
    keyWorkerStaffId: su.keyWorkerStaffId,
  };
}

function seedFromServiceUser(su: ServiceUser): PersonSeed {
  const first = su.preferredName || su.legalFirstName || su.name.split(" ")[0];
  const age = new Date().getFullYear() - Number(su.dateOfBirth.slice(0, 4));
  const disability = su.siteId === "SITE-WWD";
  const rep = su.representatives[0];
  const focus = su.primaryFocus;
  return {
    id: su.id, name: su.name, first, initials: su.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(),
    site: su.siteName, unit: "", age, riskLevel: su.risk.toLowerCase() as RiskLevel, tags: [focus],
    about: `${first} is ${age} and has lived at ${su.siteName} since ${new Date(su.admissionDate).getFullYear()}. Main support focus: ${focus.toLowerCase()}.`,
    communication: `${first} communicates verbally in English. Speak clearly and allow time to answer.`,
    personalCare: disability ? `${first} needs prompting with personal care and chooses their own clothes.` : `${first} needs the support of one staff member with washing and dressing.`,
    mobility: focus === "Mobility support" ? `${first} walks short distances with a frame and one staff member nearby.` : `${first} walks independently indoors.`,
    fallsRisk: focus === "Mobility support" ? "Medium falls risk. Frame within reach, call bell checked each round." : "Low falls risk. Standard environmental checks.",
    nutrition: focus === "Nutrition / Hydration" ? "Fortified diet with snacks between meals. Weekly weights." : "Normal diet and fluids.",
    medication: "Medication administered by nursing staff. See medication record.",
    health: focus === "Diabetes support" ? "Type 2 diabetes, monitored by GP." : focus === "Dementia support" ? "Dementia (moderate). Familiar routine helps." : "No major health changes recorded.",
    safeguarding: `No active safeguarding concerns. Next of kin: ${rep ? `${rep.relationship.toLowerCase()} (${rep.name})` : "not recorded"}.`,
    risksControls: `${focus} — supports as described in the relevant sections.`,
    goals: `${first} would like to keep taking part in activities they enjoy at ${su.siteName}.`,
    family: rep ? `${rep.relationship} ${rep.name} is the main contact for care plan discussions.` : "No family contact recorded.",
    reviewNotes: disability ? "Reviewed annually with the person and their family." : "Reviewed six-monthly by the person in charge.",
  };
}

function seed(): State {
  // People are a view over the shared serviceUsersStore record.
  const featuredIds = new Set(PERSON_SEEDS.map((s) => s.id));
  const allSeeds: PersonSeed[] = [
    ...PERSON_SEEDS,
    ...serviceUsersStore.all().filter((su) => !featuredIds.has(su.id)).map(seedFromServiceUser),
  ];
  const people: PersonSupported[] = allSeeds.map((s) => {
    const su = serviceUsersStore.getById(s.id);
    return su ? personFromServiceUser(su, { ...s, setting: su.siteId === "SITE-WWD" ? "disability" as PersonSupported["setting"] : "nursing_home" }) : {
      id: s.id, name: s.name, initials: s.initials, site: s.site, unit: s.unit,
      riskLevel: s.riskLevel, tags: s.tags, setting: "nursing_home",
    };
  });
  const templateFor = (id: string) => (serviceUsersStore.getById(id)?.siteId === "SITE-WWD" ? "TPL-DIS" : "TPL-NH");
  const freqFor = (id: string) => (templateFor(id) === "TPL-DIS" ? 12 : 6);
  const reviewDue = (publishedDaysAgo: number, months: number) => { const d = new Date(daysFromNow(-publishedDaysAgo)); d.setMonth(d.getMonth() + months); return d.toISOString(); };
  const managerFor = (id: string) => { const site = serviceUsersStore.getById(id)?.siteId; return site === "SITE-ECK" ? "Daniel Walsh" : site === "SITE-WWD" ? "Claire Nolan" : "Siobhán Kelly"; };

  // Patrick (PS-001): v1, v2 archived; v3 published after the hip fracture (connected scenario).
  const patrick = PERSON_SEEDS[0];
  const patrickBaseSections = sectionsFor(patrick);
  const patrickCustomSections: CarePlanSection[] = [
    { key: "custom_showering", label: "Showering requirements", isCustom: true,
      body: "Patrick prefers a shower in the morning after breakfast. Requires the assistance of one staff member for balance while stepping in and out. Non-slip mat in place. Encourage Patrick to use the grab rail. Water temperature to be checked before Patrick enters the shower.",
      purpose: "Consistent, safe personal-hygiene routine.", visibility: "all_staff",
      owner: "Key worker (Emma Ryan)", reviewFrequencyMonths: 6 },
    { key: "custom_oralcare", label: "Oral care plan", isCustom: true,
      body: "Patrick manages tooth-brushing independently morning and evening with a prompt from staff. Denture care nightly — clean with denture tablets and store in a labelled container by the sink. Report any oral discomfort to the nurse on duty.",
      purpose: "Prevent oral-health decline and discomfort.", visibility: "all_staff",
      owner: "Key worker (Emma Ryan)", reviewFrequencyMonths: 6 },
    { key: "custom_toileting", label: "Toileting support", isCustom: true,
      body: "Patrick uses the toilet independently during the day. At night, staff must ensure the call bell is within reach and the walking frame is positioned beside the bed. Continence pad worn at night as a precaution. Offer prompted toileting during evening and night rounds.",
      purpose: "Maintain continence and reduce night-time falls risk.", visibility: "all_staff",
      owner: "Key worker (Emma Ryan)", reviewFrequencyMonths: 6, riskLevel: "medium" },
  ];
  const v3FallsText = "Following a fall with a left hip fracture, Paddy needs two staff and his frame for all transfers. Sensor mat on at night. Call bell and frame within reach at all times. Physiotherapy twice weekly. Remind Paddy to ask for help before standing.";
  const patrickSections = [...patrickBaseSections, ...patrickCustomSections];
  const v1: CarePlanVersion = {
    id: "CP-PS001-V1", versionNumber: 1, status: "archived",
    sections: patrickBaseSections, createdAt: daysFromNow(-540), createdBy: "Daniel Walsh",
    approvedBy: "Daniel Walsh", publishedAt: daysFromNow(-540), archivedAt: daysFromNow(-175),
  };
  const v2: CarePlanVersion = {
    id: "CP-PS001-V2", versionNumber: 2, status: "archived",
    sections: patrickSections, createdAt: daysFromNow(-175), createdBy: "Daniel Walsh",
    approvedBy: "Daniel Walsh", publishedAt: daysFromNow(-175), archivedAt: daysFromNow(-5),
  };
  const v3: CarePlanVersion = {
    id: "CP-PS001-V3", versionNumber: 3, status: "published",
    sections: patrickSections.map((s) => s.key === "fallsRisk" || s.key === "mobility" ? { ...s, body: s.key === "fallsRisk" ? v3FallsText : "Paddy walks short distances with his frame and one staff member while recovering from a hip fracture.", lastReviewed: daysFromNow(-5) } : s),
    createdAt: daysFromNow(-6), createdBy: "Emma Ryan",
    approvedBy: "Daniel Walsh", publishedAt: daysFromNow(-5),
  };

  // Person-specific extras (e.g. Mary's optional Mealtime support plan).
  const EXTRA_SECTIONS: Record<string, CarePlanSection[]> = {
    "PS-002": [
      { key: "custom_mealtime", label: "Mealtime support plan", isCustom: true,
        body: "Mary prefers small, fortified portions offered every 2–3 hours. Sit with Mary during the main meal, offer gentle encouragement without pressure. Record intake in the daily food chart. Escalate any two consecutive missed meals to the nurse on duty.",
        purpose: "Support Mary's nutritional goals in line with dietitian input.",
        visibility: "all_staff", owner: "Key worker (Aisling Doherty)", reviewFrequencyMonths: 3 },
    ],
  };

  const FEATURED_TIMING: Record<string, number> = { "PS-002": 120, "PS-003": 150, "PS-004": 90, "PS-005": 100, "PS-006": 200, "PS-007": 240 };

  const plans: CarePlan[] = allSeeds.map((s, i): CarePlan => {
    const months = freqFor(s.id);
    if (s.id === "PS-001") return { personId: "PS-001", templateId: "TPL-NH", currentVersionId: v3.id, versions: [v1, v2, v3], nextReviewDue: reviewDue(5, months), reviewFrequencyMonths: months };
    const featured = featuredIds.has(s.id);
    const timing = featured ? { versions: s.id === "PS-002" ? 2 : 1, publishedDaysAgo: FEATURED_TIMING[s.id] } : planTiming(s.id as PersonSupportedId, i);
    const sections = [...sectionsFor(s), ...(EXTRA_SECTIONS[s.id] ?? [])];
    const by = managerFor(s.id);
    const versions: CarePlanVersion[] = [];
    for (let n = 1; n <= timing.versions; n++) {
      const isCurrent = n === timing.versions;
      const published = isCurrent ? timing.publishedDaysAgo : timing.publishedDaysAgo + (timing.versions - n) * months * 30;
      versions.push({
        id: `CP-${s.id}-V${n}`, versionNumber: n, status: isCurrent ? "published" : "archived", sections,
        createdAt: daysFromNow(-published - 2), createdBy: by, approvedBy: by, publishedAt: daysFromNow(-published),
        ...(isCurrent ? {} : { archivedAt: daysFromNow(-(published - months * 30)) }),
      });
    }
    if (s.id === "PS-005") {
      versions.push({
        id: "CP-PS-005-V2", versionNumber: 2, status: "ready_for_approval",
        sections: sections.map((x) => x.key === "personalCare" ? { ...x, body: "Tomás needs two staff for personal care while his pressure ulcer heals. Reposition every two hours, day and night, and record on the repositioning chart. Check the pressure-relieving mattress setting each shift.", humanEdited: true } : x),
        createdAt: daysFromNow(-10), createdBy: "Niamh Connolly", sourceSuggestionId: "RS-TOMAS",
      });
    }
    return {
      personId: s.id, templateId: templateFor(s.id), currentVersionId: `CP-${s.id}-V${timing.versions}`, versions,
      nextReviewDue: reviewDue(timing.publishedDaysAgo, months), reviewFrequencyMonths: months,
    };
  });

  // Review suggestions from the connected scenario (LogUp rules; never edit plan text).
  const ev = (key: string) => scenarioEvent(key)!;
  const sug = (id: string, key: string, personId: string, sections: SectionKey[], extra: Partial<ReviewSuggestion>): ReviewSuggestion => {
    const e = ev(key);
    return {
      id, personId, status: "open", title: "Care plan review suggested",
      reason: `${e.category} event recorded. Check whether the care plan still reflects ${e.summary.split(" ")[0]}'s needs.`,
      suggestedSections: sections, sourceIncidentId: e.id,
      sources: [{ id: `${id}-E1`, kind: "incident", refId: e.id, label: e.summary, date: e.at.toISOString(), severity: e.severity }],
      createdAt: new Date(e.at.getTime() + 3600000).toISOString(), aiLabel: AI_LABEL, label: LOGUP_REVIEW_LABEL,
      draftSectionKey: sections[0], draftText: "",
      eventLabel: e.summary, occurredAt: e.at.toISOString(),
      dueAt: new Date(e.at.getTime() + 7 * 86400000).toISOString(),
      ...extra,
    };
  };
  const suggestions: ReviewSuggestion[] = [
    sug("RS-PADDY", "paddy-fall-2d", "PS-001", ["fallsRisk", "mobility"], {
      title: "Potential pattern — care plan review suggested",
      repeatReason: `2 falls recorded for this person within ${REPEAT_WINDOW_DAYS} days.`,
      reassessment: "Consider falls risk reassessment",
      reassessments: [{ category: "falls", triggers: ["event_rule"], reason: "Falls event (LogUp event rule)." }],
      sources: [ev("paddy-fall-2d"), ev("paddy-fall-12d")].map((e, i) => ({ id: `RS-PADDY-E${i + 1}`, kind: "incident" as const, refId: e.id, label: e.summary, date: e.at.toISOString(), severity: e.severity })),
      reviewerStaffId: "STAFF-DANIEL", assignedBy: "Daniel Walsh", assignedAt: daysFromNow(-1),
    }),
    sug("RS-MARY", "mary-nutrition-4d", "PS-002", ["nutrition"], {
      repeatReason: `2 nutrition events recorded for this person within ${REPEAT_WINDOW_DAYS} days.`,
      reassessment: "Consider nutrition reassessment",
      reassessments: [{ category: "nutrition", triggers: ["event_rule", "overdue"], reason: "Nutrition event and MUST reassessment overdue." }],
    }),
    sug("RS-EILEEN", "eileen-safeguarding", "PS-004", ["safeguarding"], {
      title: "Care plan review required", reviewerStaffId: "STAFF-SIOBHAN", assignedBy: "Siobhán Kelly", assignedAt: daysFromNow(-1),
    }),
    sug("RS-TOMAS", "tomas-pressure-ulcer", "PS-005", ["personalCare", "health"], { status: "actioned", actionedVersionId: "CP-PS-005-V2" }),
    sug("RS-BRIDGET", "bridget-medication", "PS-006", ["safeguarding"], {
      title: "Care plan review in progress", reviewerStaffId: "STAFF-CLAIRE", assignedBy: "Claire Nolan", assignedAt: daysFromNow(-8),
      dueAt: daysFromNow(3),
    }),
    sug("RS-MICHAEL", "michael-seizure-fall", "PS-007", ["fallsRisk", "mobility"], {
      reassessment: "Consider falls risk reassessment",
      reassessments: [{ category: "falls", triggers: ["event_rule"], reason: "Falls event (LogUp event rule)." }],
    }),
    sug("RS-BG-18", "bg-18", "PS-043", ["health"], {}),
    sug("RS-BG-20", "bg-20", "PS-026", ["fallsRisk"], {}),
  ];

  const followUps: FollowUpTaskSuggestion[] = [
    { id: "FT-1", personId: "PS-001", text: "Check Paddy's call bell is within reach before evening and night rounds", status: "suggested", linkedSuggestionId: "RS-PADDY" },
    { id: "FT-2", personId: "PS-001", text: "Check Paddy's frame is beside his bed or chair before night rounds", status: "suggested", linkedSuggestionId: "RS-PADDY" },
    { id: "FT-3", personId: "PS-001", text: "Confirm the sensor mat alert reaches night staff", status: "suggested", linkedSuggestionId: "RS-PADDY" },
  ];

  const templates: CarePlanTemplate[] = seedTemplates();

  return { people, plans, suggestions, followUps, templates };
}


// ---------- store plumbing ----------

const STORAGE_KEY = "logup.carePlans.v5";

function loadInitial(): State {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      // Older saved data used the flat template shape — replace with versioned templates.
      if (!Array.isArray(parsed.templates) || !parsed.templates.every((t) => Array.isArray((t as CarePlanTemplate).versions))) {
        parsed.templates = seedTemplates();
      }
      return parsed;
    }
  } catch { /* ignore */ }
  return seed();
}

/** Refresh people from the shared service users record (identity, site, key worker). */
function syncPeopleFromServiceUsers(s: State): State {
  const people = s.people.map((p) => {
    const su = serviceUsersStore.getById(p.id);
    return su ? { ...personFromServiceUser(su, p), unit: p.unit } : p;
  });
  return { ...s, people };
}


// ---------- Templates: lookup helpers ----------

function centreTypeForPerson(s: State, personId: string): CentreType | undefined {
  const su = serviceUsersStore.getById(personId);
  const site = su ? sitesStore.getById(su.siteId) : sitesStore.all().find((x) => x.name === s.people.find((p) => p.id === personId)?.site);
  return site?.centreType;
}

function templateForPersonIn(s: State, personId: string): CarePlanTemplate | undefined {
  const ct = centreTypeForPerson(s, personId);
  const byType = ct ? s.templates.find((t) => t.serviceType === ct && tplPublished(t)) : undefined;
  if (byType) return byType;
  const plan = s.plans.find((p) => p.personId === personId);
  return s.templates.find((t) => t.id === plan?.templateId);
}

/** Record templateVersion on every care plan version (legacy versions are v0; drafts inherit the live version's). */
function stampTemplateVersions(s: State): State {
  let changed = false;
  const plans = s.plans.map((plan) => {
    if (plan.versions.every((v) => v.templateVersion !== undefined)) return plan;
    const tpl = templateForPersonIn(s, plan.personId);
    const live = plan.versions.find((v) => v.id === plan.currentVersionId);
    changed = true;
    return {
      ...plan,
      // Plans written before versioned templates are recorded as template v0,
      // so they show "New template available" and can adopt the new sections.
      versions: plan.versions.map((v) => v.templateVersion !== undefined ? v : {
        ...v, templateId: v.templateId ?? live?.templateId ?? tpl?.id ?? plan.templateId, templateVersion: live?.templateVersion ?? 0,
      }),
    };
  });
  return changed ? { ...s, plans } : s;
}

let state: State = stampTemplateVersions(syncPeopleFromServiceUsers(loadInitial()));
const listeners = new Set<() => void>();
serviceUsersStore.subscribe(() => {
  state = syncPeopleFromServiceUsers(state);
  emit();
});

function persist() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

function emit() {
  state = stampTemplateVersions(state);
  persist();
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export const carePlansStore = {
  getState: (): State => state,
  subscribe,

  reset() { state = seed(); emit(); },

  getPerson(id: string): PersonSupported | undefined {
    return state.people.find((p) => p.id === id);
  },
  getPlan(personId: string): CarePlan | undefined {
    return state.plans.find((p) => p.personId === personId);
  },
  getCurrentVersion(personId: string): CarePlanVersion | undefined {
    const plan = state.plans.find((p) => p.personId === personId);
    return plan?.versions.find((v) => v.id === plan.currentVersionId);
  },
  getSuggestionsFor(personId: string, status?: ReviewSuggestion["status"]): ReviewSuggestion[] {
    return state.suggestions.filter((s) => s.personId === personId && (!status || s.status === status));
  },
  getFollowUpsFor(personId: string): FollowUpTaskSuggestion[] {
    return state.followUps.filter((f) => f.personId === personId);
  },

  /** A person adds "Consider reassessment" while handling a suggestion. */
  addReassessment(suggestionId: string, category: ReassessmentSuggestion["category"], reason: string, actor: string, actorRole = "manager"): boolean {
    const sug = state.suggestions.find((s) => s.id === suggestionId);
    const r = reason.trim();
    if (!sug || r.length < 10) return false;
    const now = new Date().toISOString();
    const existing = (sug.reassessments ?? []).find((x) => x.category === category && !x.completedAssessmentId);
    const reassessments = existing
      ? (sug.reassessments ?? []).map((x) => x === existing ? { ...x, triggers: Array.from(new Set([...x.triggers, "person" as const])), addedBy: actor, addedAt: now, reason: `${x.reason} ${actor}: ${r}` } : x)
      : [...(sug.reassessments ?? []), { category, triggers: ["person" as const], reason: `${r} Consider reassessment.`, addedBy: actor, addedAt: now }];
    state = { ...state, suggestions: state.suggestions.map((s) => s.id === suggestionId ? { ...s, reassessments } : s) };
    emit();
    audit({ personId: sug.personId, versionId: state.plans.find((p) => p.personId === sug.personId)?.currentVersionId ?? sug.id, actor, actorRole, action: "reassessment_added", metadata: { suggestionId, category, reason: r } });
    return true;
  },

  /** Recording an assessment linked to a suggestion ticks the matching reassessment off. */
  completeReassessment(suggestionId: string, category: ReassessmentSuggestion["category"], assessmentId: string, actor: string, actorRole = "staff") {
    const sug = state.suggestions.find((s) => s.id === suggestionId);
    if (!sug) return;
    const now = new Date().toISOString();
    const has = (sug.reassessments ?? []).some((x) => x.category === category && !x.completedAssessmentId);
    if (!has) return;
    state = { ...state, suggestions: state.suggestions.map((s) => s.id !== suggestionId ? s : { ...s, reassessments: (s.reassessments ?? []).map((x) => x.category === category && !x.completedAssessmentId ? { ...x, completedAssessmentId: assessmentId, completedAt: now, completedBy: actor } : x) }) };
    emit();
    audit({ personId: sug.personId, versionId: state.plans.find((p) => p.personId === sug.personId)?.currentVersionId ?? sug.id, actor, actorRole, action: "reassessment_completed", metadata: { suggestionId, category, assessmentId } });
  },

  /** Add an open review suggestion. Never changes care plan text. */
  createReviewSuggestion(sug: ReviewSuggestion) {
    state = { ...state, suggestions: [sug, ...state.suggestions] };
    emit();
  },

  assignSuggestion(id: string, reviewerStaffId: StaffId, dueAt: string, actor: string, actorRole = "manager") {
    const sug = state.suggestions.find((s) => s.id === id);
    if (!sug) return;
    const now = new Date().toISOString();
    state = { ...state, suggestions: state.suggestions.map((s) => s.id === id ? { ...s, reviewerStaffId, dueAt, assignedBy: actor, assignedAt: now } : s) };
    emit();
    const plan = state.plans.find((p) => p.personId === sug.personId);
    audit({
      personId: sug.personId, versionId: plan?.currentVersionId ?? sug.id, actor, actorRole,
      action: "review_suggestion_assigned",
      metadata: { suggestionId: id, sourceIncidentId: sug.sourceIncidentId, reviewer: getStaffName(reviewerStaffId), reviewerStaffId, dueAt, previousReviewerStaffId: sug.reviewerStaffId, previousDueAt: sug.dueAt },
    });
  },

  /** Mark a suggestion "Not required". Actor and a reason (10+ characters) are mandatory and audited. */
  dismissSuggestion(id: string, actor: string, reason: string, actorRole = "manager"): boolean {
    const sug = state.suggestions.find((s) => s.id === id);
    const r = reason.trim();
    if (!sug || !actor || r.length < 10) return false;
    const now = new Date().toISOString();
    state = { ...state, suggestions: state.suggestions.map((s) => s.id === id ? { ...s, status: "dismissed", dismissedBy: actor, dismissedReason: r, dismissedAt: now } : s) };
    emit();
    const plan = state.plans.find((p) => p.personId === sug.personId);
    audit({
      personId: sug.personId, versionId: plan?.currentVersionId ?? sug.id, actor, actorRole,
      action: "review_suggestion_dismissed",
      metadata: { suggestionId: id, sourceIncidentId: sug.sourceIncidentId, reason: r },
    });
    if (sug.sourceIncidentId) associatedIncidentsStore.markNoReview(sug.sourceIncidentId, actor, r);
    return true;
  },

  /** Clone current version → new draft (v+1) with the AI draft text applied to the target section. */
  startDraftFromSuggestion(suggestionId: string, createdBy: string, actorRole = "manager"): string | undefined {
    const sug = state.suggestions.find((s) => s.id === suggestionId);
    if (!sug) return;
    const plan = state.plans.find((p) => p.personId === sug.personId);
    if (!plan) return;
    // Reuse existing in-progress draft if any
    // Reuse any in-progress draft so there is only ever one draft update at a time.
    const existingDraft = plan.versions.find((v) => v.sourceSuggestionId === suggestionId && (v.status === "draft_in_progress" || v.status === "ready_for_approval"))
      ?? plan.versions.find((v) => v.status === "draft_in_progress" || v.status === "ready_for_approval");
    if (existingDraft) {
      state = { ...state, suggestions: state.suggestions.map((s) => s.id === suggestionId ? { ...s, status: "actioned", actionedVersionId: existingDraft.id } : s) };
      emit();
      if (sug.sourceIncidentId) associatedIncidentsStore.markDraftCreated(sug.sourceIncidentId, createdBy, existingDraft.versionNumber, [...sug.suggestedSections, ...(sug.aiSections ?? []).map((a) => a.key)]);
      return existingDraft.id;
    }
    const current = plan.versions.find((v) => v.id === plan.currentVersionId);
    if (!current) return;
    const nextNumber = Math.max(...plan.versions.map((v) => v.versionNumber)) + 1;
    const newId = `CP-${sug.personId}-V${nextNumber}`;
    const now = new Date().toISOString();
    const previousSec = current.sections.find((s) => s.key === sug.draftSectionKey);
    // Event-triggered suggestions carry no proposed text: the draft starts as an
    // unchanged copy and a person writes any changes.
    const hasText = !!sug.draftText;
    const newVersion: CarePlanVersion = {
      id: newId,
      versionNumber: nextNumber,
      status: "draft_in_progress",
      sections: current.sections.map((sec) =>
        hasText && sec.key === sug.draftSectionKey
          ? { ...sec, body: sug.draftText, humanEdited: false }
          : { ...sec }
      ),
      createdAt: now,
      createdBy,
      sourceSuggestionId: suggestionId,
      aiAssisted: hasText,
      sourceType: sug.sourceIncidentId ? "incident" : "AI",
      currentApprovedVersionId: current.id,
      reasonForChange: sug.reason,
      sectionChanges: !hasText ? [] : [{
        key: sug.draftSectionKey,
        kind: "edited",
        previousContent: previousSec?.body,
        proposedContent: sug.draftText,
        editedBy: createdBy,
        editedAt: now,
        reason: sug.reason,
        source: sug.sourceIncidentId ? "incident" : "AI",
      }],
    };
    const updatedPlan: CarePlan = { ...plan, versions: [...plan.versions, newVersion] };
    state = {
      ...state,
      plans: state.plans.map((p) => p.personId === plan.personId ? updatedPlan : p),
      suggestions: state.suggestions.map((s) => s.id === suggestionId ? { ...s, status: "actioned", actionedVersionId: newId } : s),
    };
    emit();
    audit({
      personId: sug.personId, versionId: newId, actor: createdBy, actorRole,
      action: "draft_created", toStatus: "draft_in_progress",
      metadata: { source: newVersion.sourceType, suggestionId, versionNumber: nextNumber },
    });
    if (sug.sourceIncidentId) associatedIncidentsStore.markDraftCreated(sug.sourceIncidentId, createdBy, nextNumber, [...sug.suggestedSections, ...(sug.aiSections ?? []).map((a) => a.key)]);
    return newId;
  },

  updateDraftSection(
    personId: string,
    versionId: string,
    key: string,
    body: string,
    options?: { actor?: string; actorRole?: string; reason?: string; source?: DraftSourceType },
  ) {
    const plan = state.plans.find((p) => p.personId === personId);
    if (!plan) return;
    const version = plan.versions.find((v) => v.id === versionId);
    if (!version) return;
    const previousSec = version.sections.find((s) => s.key === key);
    if (previousSec?.body === body) return; // no-op
    const now = new Date().toISOString();
    // Track section change: if the section was added in this draft, keep it as "added"
    // and just update the proposedContent; otherwise upsert an "edited" record.
    const existingChanges = version.sectionChanges ?? [];
    const addedRecordIdx = existingChanges.findIndex((c) => c.key === key && c.kind === "added");
    let nextChanges: SectionChangeRecord[];
    if (addedRecordIdx >= 0) {
      nextChanges = existingChanges.map((c, i) => i === addedRecordIdx
        ? { ...c, proposedContent: body, editedBy: options?.actor ?? c.editedBy, editedAt: now, reason: options?.reason ?? c.reason }
        : c);
    } else {
      const editedIdx = existingChanges.findIndex((c) => c.key === key && c.kind === "edited");
      const rec: SectionChangeRecord = {
        key,
        kind: "edited",
        previousContent: editedIdx >= 0 ? existingChanges[editedIdx].previousContent : previousSec?.body,
        proposedContent: body,
        editedBy: options?.actor ?? version.createdBy,
        editedAt: now,
        reason: options?.reason,
        source: options?.source ?? version.sourceType ?? "manual",
      };
      nextChanges = editedIdx >= 0
        ? existingChanges.map((c, i) => i === editedIdx ? { ...rec, previousContent: c.previousContent } : c)
        : [...existingChanges, rec];
    }
    const updated: CarePlan = {
      ...plan,
      versions: plan.versions.map((v) =>
        v.id === versionId
          ? {
              ...v,
              sections: v.sections.map((s) => s.key === key ? { ...s, body, humanEdited: true } : s),
              sectionChanges: nextChanges,
            }
          : v
      ),
    };
    state = { ...state, plans: state.plans.map((p) => p.personId === personId ? updated : p) };
    emit();
    audit({
      personId, versionId, actor: options?.actor ?? version.createdBy, actorRole: options?.actorRole ?? "staff",
      action: "section_edited", fromStatus: version.status, toStatus: version.status,
      metadata: { sectionKey: key, reason: options?.reason },
    });
  },

  /**
   * Return an editable draft version for this person, creating one cloned from the current
   * published version if none exists. The published/current version is never mutated.
   */
  ensureDraft(personId: string, actor: string, actorRole = "staff", source: DraftSourceType = "manual", reason?: string): CarePlanVersion | undefined {
    const plan = state.plans.find((p) => p.personId === personId);
    if (!plan) return;
    const existing = plan.versions.find((v) => v.status === "draft_in_progress" || v.status === "ready_for_approval");
    if (existing) return existing;
    const current = plan.versions.find((v) => v.id === plan.currentVersionId);
    if (!current) return;
    const nextNumber = Math.max(...plan.versions.map((v) => v.versionNumber)) + 1;
    const newVersion: CarePlanVersion = {
      id: `CP-${personId}-V${nextNumber}`,
      versionNumber: nextNumber,
      status: "draft_in_progress",
      sections: current.sections.map((s) => ({ ...s })),
      createdAt: new Date().toISOString(),
      createdBy: actor,
      aiAssisted: false,
      sourceType: source,
      currentApprovedVersionId: current.id,
      reasonForChange: reason,
      sectionChanges: [],
    };
    const updatedPlan: CarePlan = { ...plan, versions: [...plan.versions, newVersion] };
    state = { ...state, plans: state.plans.map((p) => p.personId === personId ? updatedPlan : p) };
    emit();
    audit({
      personId, versionId: newVersion.id, actor, actorRole,
      action: "draft_created", toStatus: "draft_in_progress",
      metadata: { source, versionNumber: nextNumber, currentApprovedVersionId: current.id },
    });
    return newVersion;
  },

  /** Append a brand-new section to the draft (creating a draft if needed). Person-specific — never modifies templates. */
  addDraftSection(personId: string, actor: string, section: Omit<CarePlanSection, "addedInVersionId">, options?: { actorRole?: string; reason?: string; source?: DraftSourceType; sectionType?: "template" | "custom" }): CarePlanVersion | undefined {
    const draft = this.ensureDraft(personId, actor, options?.actorRole ?? "staff", options?.source ?? "manual");
    if (!draft) return;
    const plan = state.plans.find((p) => p.personId === personId)!;
    const withMarker: CarePlanSection = { ...section, addedInVersionId: draft.id, humanEdited: true };
    const now = new Date().toISOString();
    const change: SectionChangeRecord = {
      key: section.key,
      kind: "added",
      proposedContent: section.body,
      editedBy: actor,
      editedAt: now,
      reason: options?.reason ?? section.reason,
      source: options?.source ?? "manual",
      sectionType: options?.sectionType ?? (section.isCustom ? "custom" : "template"),
      sectionTitle: section.label ?? section.key,
      riskLevel: section.riskLevel,
      reviewFrequencyMonths: section.reviewFrequencyMonths,
    };
    const updated: CarePlan = {
      ...plan,
      versions: plan.versions.map((v) => v.id === draft.id
        ? { ...v, sections: [...v.sections, withMarker], sectionChanges: [...(v.sectionChanges ?? []), change] }
        : v),
    };
    state = { ...state, plans: state.plans.map((p) => p.personId === personId ? updated : p) };
    emit();
    audit({
      personId, versionId: draft.id, actor, actorRole: options?.actorRole ?? "staff",
      action: "section_added", fromStatus: draft.status, toStatus: draft.status,
      metadata: { sectionKey: section.key, sectionType: change.sectionType, sectionTitle: change.sectionTitle, reason: change.reason },
    });
    return updated.versions.find((v) => v.id === draft.id);
  },

  /** Remove a section from the draft. Only sections not present in the current approved version can be dropped entirely; otherwise a "removed" change record is stored (section flagged, kept for approval). */
  removeDraftSection(personId: string, versionId: string, key: string, options?: { actor?: string; actorRole?: string; reason?: string }) {
    const plan = state.plans.find((p) => p.personId === personId);
    if (!plan) return;
    const version = plan.versions.find((v) => v.id === versionId);
    if (!version) return;
    const currentSec = plan.versions.find((v) => v.id === plan.currentVersionId)?.sections.find((s) => s.key === key);
    const now = new Date().toISOString();
    const addedInThisDraft = (version.sectionChanges ?? []).some((c) => c.key === key && c.kind === "added");
    let nextChanges = (version.sectionChanges ?? []).filter((c) => !(c.key === key && addedInThisDraft));
    if (!addedInThisDraft) {
      nextChanges = [...nextChanges, {
        key, kind: "removed",
        previousContent: currentSec?.body,
        editedBy: options?.actor ?? version.createdBy,
        editedAt: now,
        reason: options?.reason,
        source: "manual",
      }];
    }
    const updated: CarePlan = {
      ...plan,
      versions: plan.versions.map((v) => v.id === versionId
        ? { ...v, sections: v.sections.filter((s) => s.key !== key), sectionChanges: nextChanges }
        : v),
    };
    state = { ...state, plans: state.plans.map((p) => p.personId === personId ? updated : p) };
    emit();
    audit({
      personId, versionId, actor: options?.actor ?? version.createdBy, actorRole: options?.actorRole ?? "staff",
      action: "section_removed", fromStatus: version.status, toStatus: version.status,
      metadata: { sectionKey: key, reason: options?.reason },
    });
  },

  /** Discard an in-progress draft. Never touches the published/current version. */
  discardDraft(personId: string, versionId: string, options?: { actor?: string; actorRole?: string; reason?: string }) {
    const plan = state.plans.find((p) => p.personId === personId);
    if (!plan) return;
    if (plan.currentVersionId === versionId) return; // safety — never remove the current published version
    const version = plan.versions.find((v) => v.id === versionId);
    const updated: CarePlan = { ...plan, versions: plan.versions.filter((v) => v.id !== versionId) };
    state = { ...state, plans: state.plans.map((p) => p.personId === personId ? updated : p) };
    emit();
    if (version) {
      audit({
        personId, versionId, actor: options?.actor ?? version.createdBy, actorRole: options?.actorRole ?? "staff",
        action: "draft_cancelled", fromStatus: version.status, toStatus: "cancelled",
        metadata: { reason: options?.reason },
      });
    }
  },

  setDraftStatus(personId: string, versionId: string, status: CarePlanStatus, extras: Partial<CarePlanVersion> = {}) {
    const plan = state.plans.find((p) => p.personId === personId);
    if (!plan) return;
    const updated: CarePlan = {
      ...plan,
      versions: plan.versions.map((v) => v.id === versionId ? { ...v, status, ...extras } : v),
    };
    state = { ...state, plans: state.plans.map((p) => p.personId === personId ? updated : p) };
    emit();
  },

  markReadyForApproval(personId: string, versionId: string, options?: { actor?: string; actorRole?: string; reasonForChange?: string; consultation?: Consultation }) {
    const plan = state.plans.find((p) => p.personId === personId);
    const version = plan?.versions.find((v) => v.id === versionId);
    if (!plan || !version) return;
    const fromStatus = version.status;
    const extras: Partial<CarePlanVersion> = {};
    if (options?.reasonForChange && !version.reasonForChange) extras.reasonForChange = options.reasonForChange;
    if (options?.consultation) extras.consultation = options.consultation;
    this.setDraftStatus(personId, versionId, "ready_for_approval", extras);
    audit({
      personId, versionId, actor: options?.actor ?? version.createdBy, actorRole: options?.actorRole ?? "manager",
      action: "draft_marked_ready", fromStatus, toStatus: "ready_for_approval",
      metadata: { reasonForChange: options?.reasonForChange ?? version.reasonForChange, consultation: options?.consultation },
    });
    const person = state.people.find((p) => p.id === personId);
    if (person) {
      import("./carePlanApprovalChainsStore").then(({ carePlanApprovalChainsStore }) => {
        const instance = carePlanApprovalChainsStore.startApprovalForDraft({
          personId, versionId, versionNumber: version.versionNumber,
          person: { site: person.site, unit: person.unit },
        });
        if (instance) {
          // Persist approval instance id back on the version for cross-referencing.
          const p = state.plans.find((pp) => pp.personId === personId);
          if (p) {
            const upd: CarePlan = { ...p, versions: p.versions.map((v) => v.id === versionId ? { ...v, approvalInstanceId: instance.id } : v) };
            state = { ...state, plans: state.plans.map((pp) => pp.personId === personId ? upd : pp) };
            emit();
          }
          audit({
            personId, versionId, actor: options?.actor ?? version.createdBy, actorRole: options?.actorRole ?? "manager",
            action: "approval_started", fromStatus: "ready_for_approval", toStatus: "ready_for_approval",
            metadata: { approvalInstanceId: instance.id, chainId: instance.chainId, chainName: instance.chainName },
          });
        }
      });
    }
  },

  rejectDraft(personId: string, versionId: string, note?: string, options?: { actor?: string; actorRole?: string }) {
    const plan = state.plans.find((p) => p.personId === personId);
    const version = plan?.versions.find((v) => v.id === versionId);
    if (!plan || !version) return;
    const now = new Date().toISOString();
    this.setDraftStatus(personId, versionId, "rejected", {
      reviewNotes: note,
      rejectionNote: note,
      rejectedAt: now,
      rejectedBy: options?.actor,
    });
    audit({
      personId, versionId, actor: options?.actor ?? version.createdBy, actorRole: options?.actorRole ?? "manager",
      action: "draft_rejected", fromStatus: version.status, toStatus: "rejected",
      metadata: { rejectionNote: note },
    });
  },

  approveAndPublish(personId: string, versionId: string, approver: string, note?: string, options?: { actorRole?: string }) {
    const plan = state.plans.find((p) => p.personId === personId);
    if (!plan) return;
    const version = plan.versions.find((v) => v.id === versionId);
    const previousCurrent = plan.versions.find((v) => v.id === plan.currentVersionId);
    if (!version) return;
    const fromStatus = version.status;
    const nowIso = new Date().toISOString();
    const nextReview = new Date();
    nextReview.setMonth(nextReview.getMonth() + plan.reviewFrequencyMonths);
    const updated: CarePlan = {
      ...plan,
      currentVersionId: versionId,
      nextReviewDue: nextReview.toISOString(),
      versions: plan.versions.map((v) => {
        if (v.id === versionId) {
          // Approved text keeps its AI origin on record.
          return { ...v, status: "published", approvedBy: approver, publishedAt: nowIso, reviewNotes: note ?? v.reviewNotes,
            sections: v.sections.map((x) => x.contentState ? { ...x, contentState: "approved" as const } : x) };
        }
        if (v.id === plan.currentVersionId) {
          return { ...v, status: "archived", archivedAt: nowIso };
        }
        return v;
      }),
    };
    state = { ...state, plans: state.plans.map((p) => p.personId === personId ? updated : p) };
    emit();
    audit({
      personId, versionId, actor: approver, actorRole: options?.actorRole ?? "manager",
      action: "draft_published", fromStatus, toStatus: "published",
      metadata: { versionNumber: version.versionNumber, note, approvedBy: approver, previousVersionId: previousCurrent?.id },
    });
    // Events whose suggestion led to this version now read "Care plan updated vN".
    state.suggestions
      .filter((s) => s.sourceIncidentId && (s.id === version.sourceSuggestionId || s.actionedVersionId === versionId))
      .forEach((s) => associatedIncidentsStore.markCarePlanUpdated(s.sourceIncidentId!, approver, version.versionNumber));
    if (previousCurrent && previousCurrent.id !== versionId) {
      audit({
        personId, versionId: previousCurrent.id, actor: approver, actorRole: options?.actorRole ?? "manager",
        action: "version_archived", fromStatus: "published", toStatus: "archived",
        metadata: { supersededByVersionId: versionId, supersededByVersionNumber: version.versionNumber },
      });
    }
  },




  // ---------- Section order & Ask LogUp ----------

  /** Reorder sections in the draft only (creates a draft if needed). Never touches the template. */
  reorderDraftSections(personId: string, order: string[], actor: string, actorRole = "staff", options?: { source?: DraftSourceType; reason?: string; resetToTemplate?: boolean }): boolean {
    const draft = this.ensureDraft(personId, actor, actorRole, options?.source ?? "manual");
    const plan = state.plans.find((p) => p.personId === personId);
    if (!draft || !plan) return false;
    const previousOrder = draft.sections.map((x) => x.key);
    const byKey = new Map(draft.sections.map((x) => [x.key, x]));
    const ordered = [...order.filter((k) => byKey.has(k)), ...previousOrder.filter((k) => !order.includes(k))];
    if (ordered.join("|") === previousOrder.join("|") && !options?.resetToTemplate) return false;
    const now = new Date().toISOString();
    const rec: SectionChangeRecord = {
      key: "__order", kind: "reordered", previousOrder, proposedOrder: ordered,
      editedBy: actor, editedAt: now, reason: options?.reason ?? (options?.resetToTemplate ? "Reset to template order" : undefined),
      source: options?.source ?? "manual",
    };
    const updated: CarePlanVersion = {
      ...draft,
      sections: ordered.map((k) => byKey.get(k)!),
      sectionOrderOverride: options?.resetToTemplate ? undefined : ordered,
      sectionChanges: [...(draft.sectionChanges ?? []).filter((c) => c.kind !== "reordered"), rec],
    };
    state = { ...state, plans: state.plans.map((p) => p.personId !== personId ? p : { ...p, versions: p.versions.map((v) => v.id === draft.id ? updated : v) }) };
    emit();
    audit({ personId, versionId: draft.id, actor, actorRole, action: "section_order_changed", metadata: { previousOrder, proposedOrder: ordered, resetToTemplate: !!options?.resetToTemplate, source: rec.source } });
    return true;
  },

  /** Template order for this person's sections (keys present in the version first, in template order). */
  templateOrderFor(personId: string, keys: string[]): string[] {
    const tpl = templateForPersonIn(state, personId);
    const pub = tpl ? tplPublished(tpl) : undefined;
    const tplKeys = pub ? pub.sections.map((x) => x.sectionKey) : SECTION_ORDER;
    return [...tplKeys.filter((k) => keys.includes(k)), ...keys.filter((k) => !tplKeys.includes(k))];
  },

  /** True when this version carries an order that differs from its template. */
  hasCustomOrder(personId: string, version?: CarePlanVersion): boolean {
    if (!version?.sectionOrderOverride) return false;
    const keys = version.sections.map((x) => x.key);
    return this.templateOrderFor(personId, keys).join("|") !== keys.join("|");
  },

  /** Apply one accepted Ask LogUp change to the draft. Records who accepted, when and the original proposal. */
  acceptAssistantChange(personId: string, change: {
    id: string; prompt: string; kind: AssistantDecision["kind"]; origin: "ai" | "rules"; sectionKey?: string; sectionLabel?: string;
    after?: string; proposedOrder?: string[]; sourceLabel: string; resetToTemplate?: boolean;
  }, actor: string, actorRole = "staff", editedText?: string): boolean {
    const draft = this.ensureDraft(personId, actor, actorRole, "AI");
    if (!draft) return false;
    const now = new Date().toISOString();
    const edited = editedText !== undefined && editedText !== change.after;
    const finalText = editedText ?? change.after;
    let previousOrder: string[] | undefined;
    if (change.kind === "section_moved" && change.proposedOrder) {
      previousOrder = draft.sections.map((x) => x.key);
      this.reorderDraftSections(personId, change.proposedOrder, actor, actorRole, { source: change.origin === "ai" ? "AI" : "manual", reason: `Ask LogUp: ${change.prompt}`, resetToTemplate: change.resetToTemplate });
    } else if (change.sectionKey && finalText !== undefined) {
      const exists = draft.sections.some((x) => x.key === change.sectionKey);
      if (exists) {
        this.updateDraftSection(personId, draft.id, change.sectionKey, finalText, { actor, actorRole, reason: `Ask LogUp: ${change.prompt}`, source: "AI" });
      } else {
        this.addDraftSection(personId, actor, { key: change.sectionKey, body: finalText, label: change.sectionLabel, isCustom: change.sectionKey.startsWith("custom_") || undefined }, { actorRole, source: "AI", reason: `Ask LogUp: ${change.prompt}` });
      }
      const marker: Partial<CarePlanSection> = {
        contentState: edited ? "human_confirmed" : "ai_draft",
        humanEdited: edited,
        aiOrigin: { proposalId: change.id, originalText: change.after ?? "", acceptedBy: actor, acceptedAt: now, editedBeforeAccept: edited || undefined, ...(edited ? { confirmedBy: actor, confirmedAt: now } : {}) },
      };
      this.patchDraftSection(personId, change.sectionKey, marker);
    }
    this.recordAssistantDecision(personId, {
      proposalId: change.id, prompt: change.prompt, kind: change.kind, origin: change.origin, sectionKey: change.sectionKey,
      proposedText: change.after, finalText, proposedOrder: change.proposedOrder, previousOrder, sourceLabel: change.sourceLabel,
      decision: edited ? "accepted_with_edits" : "accepted", by: actor, at: now,
    }, actorRole);
    return true;
  },

  /** A rejected proposal never changes the draft; the decision is still recorded when a draft exists. */
  rejectAssistantChange(personId: string, change: { id: string; prompt: string; kind: AssistantDecision["kind"]; origin: "ai" | "rules"; sectionKey?: string; after?: string; proposedOrder?: string[]; sourceLabel: string }, actor: string, actorRole = "staff") {
    this.recordAssistantDecision(personId, {
      proposalId: change.id, prompt: change.prompt, kind: change.kind, origin: change.origin, sectionKey: change.sectionKey,
      proposedText: change.after, proposedOrder: change.proposedOrder, sourceLabel: change.sourceLabel,
      decision: "rejected", by: actor, at: new Date().toISOString(),
    }, actorRole);
  },

  recordAssistantDecision(personId: string, d: AssistantDecision, actorRole = "staff") {
    const plan = state.plans.find((p) => p.personId === personId);
    const draft = plan?.versions.find((v) => v.status === "draft_in_progress" || v.status === "ready_for_approval");
    const versionId = draft?.id ?? plan?.currentVersionId ?? personId;
    if (draft) {
      state = { ...state, plans: state.plans.map((p) => p.personId !== personId ? p : { ...p, versions: p.versions.map((v) => v.id === draft.id ? { ...v, aiAssisted: v.aiAssisted || d.decision !== "rejected", assistantDecisions: [...(v.assistantDecisions ?? []), d] } : v) }) };
      emit();
    }
    audit({ personId, versionId, actor: d.by, actorRole, action: d.decision === "rejected" ? "assistant_change_rejected" : "assistant_change_accepted", metadata: { ...d } as Record<string, unknown> });
  },

  /** Merge fields onto a draft section (no text change). */
  patchDraftSection(personId: string, key: string, patch: Partial<CarePlanSection>) {
    const plan = state.plans.find((p) => p.personId === personId);
    const draft = plan?.versions.find((v) => v.status === "draft_in_progress" || v.status === "ready_for_approval");
    if (!draft) return;
    state = { ...state, plans: state.plans.map((p) => p.personId !== personId ? p : { ...p, versions: p.versions.map((v) => v.id !== draft.id ? v : { ...v, sections: v.sections.map((x) => x.key === key ? { ...x, ...patch } : x) }) }) };
    emit();
  },

  /** A person confirms AI-drafted text in the draft. The AI origin stays on record. */
  confirmDraftSection(personId: string, key: string, actor: string, actorRole = "staff") {
    const plan = state.plans.find((p) => p.personId === personId);
    const draft = plan?.versions.find((v) => v.status === "draft_in_progress" || v.status === "ready_for_approval");
    const sec = draft?.sections.find((x) => x.key === key);
    if (!draft || !sec || sec.contentState !== "ai_draft") return;
    const now = new Date().toISOString();
    this.patchDraftSection(personId, key, { contentState: "human_confirmed", aiOrigin: sec.aiOrigin ? { ...sec.aiOrigin, confirmedBy: actor, confirmedAt: now } : undefined });
    audit({ personId, versionId: draft.id, actor, actorRole, action: "section_confirmed", metadata: { sectionKey: key, proposalId: sec.aiOrigin?.proposalId } });
  },

  // ---------- Templates ----------

  /** Published template a person's site uses (by site centreType). */
  templateForPerson(personId: string): CarePlanTemplate | undefined {
    return templateForPersonIn(state, personId);
  },
  templateForCentreType(ct: CentreType): CarePlanTemplate | undefined {
    return state.templates.find((t) => t.serviceType === ct);
  },

  /** Editing a published template always works on a draft version. */
  ensureTemplateDraft(templateId: string, actor: string): TemplateVersion | undefined {
    const t = state.templates.find((x) => x.id === templateId);
    if (!t) return;
    const existing = tplDraft(t);
    if (existing) return existing;
    const pub = tplPublished(t);
    if (!pub) return;
    const draft: TemplateVersion = {
      ...pub, versionNumber: Math.max(...t.versions.map((v) => v.versionNumber)) + 1, status: "draft",
      sections: pub.sections.map((sec) => ({ ...sec, fields: sec.fields.map((f) => ({ ...f })) })),
      createdAt: new Date().toISOString(), createdBy: actor, publishedAt: undefined, publishedBy: undefined, removals: [],
    };
    state = { ...state, templates: state.templates.map((x) => x.id === templateId ? { ...x, versions: [...x.versions, draft] } : x) };
    emit();
    return draft;
  },

  /** Apply a change to the template's draft (created from published if needed). */
  editTemplateDraft(templateId: string, actor: string, change: (d: TemplateVersion) => TemplateVersion) {
    const d = this.ensureTemplateDraft(templateId, actor);
    if (!d) return;
    state = {
      ...state,
      templates: state.templates.map((x) => x.id !== templateId ? x : {
        ...x, versions: x.versions.map((v) => v.status === "draft" ? change(v) : v),
      }),
    };
    emit();
  },

  /**
   * Remove a section from the template draft. System-required sections cannot
   * be removed; recommended core sections need a reason, stored on the version.
   * Returns an error message, or undefined on success.
   */
  removeTemplateSection(templateId: string, sectionId: string, actor: string, reason?: string): string | undefined {
    const t = state.templates.find((x) => x.id === templateId);
    const d = t ? (tplDraft(t) ?? tplPublished(t)) : undefined;
    const sec = d?.sections.find((x) => x.id === sectionId);
    if (!t || !sec) return "Section not found.";
    if (sec.systemRequired || PROTECTED.systemRequired.includes(sec.category)) return "This section is required by LogUp and cannot be removed.";
    if (sec.recommendedCore && (reason ?? "").trim().length < 10) return "Give a reason of at least 10 characters.";
    this.editTemplateDraft(templateId, actor, (v) => ({
      ...v,
      sections: v.sections.filter((x) => x.id !== sectionId),
      removals: [...v.removals, {
        sectionId, displayName: sec.displayName, category: sec.category, recommendedCore: sec.recommendedCore,
        reason: reason?.trim() || undefined, by: actor, at: new Date().toISOString(),
      }],
    }));
    return undefined;
  },

  discardTemplateDraft(templateId: string) {
    state = { ...state, templates: state.templates.map((x) => x.id === templateId ? { ...x, versions: x.versions.filter((v) => v.status !== "draft") } : x) };
    emit();
  },

  /** Publish the draft. Existing care plans are never changed automatically. */
  publishTemplate(templateId: string, actor: string) {
    const now = new Date().toISOString();
    state = {
      ...state,
      templates: state.templates.map((x) => x.id !== templateId ? x : {
        ...x,
        versions: x.versions.map((v) =>
          v.status === "draft" ? { ...v, status: "published", publishedAt: now, publishedBy: actor }
          : v.status === "published" ? { ...v, status: "superseded" } : v),
      }),
    };
    emit();
  },

  /**
   * "Use latest template": add, remove and reorder sections in the draft only.
   * Sections the person has that are not in the template and are custom are kept.
   * Removed standard sections are recorded as section changes with their content.
   */
  applyLatestTemplateToDraft(personId: string, actor: string, actorRole = "manager"): boolean {
    const tpl = templateForPersonIn(state, personId);
    const latest = tpl ? tplPublished(tpl) : undefined;
    const plan = state.plans.find((p) => p.personId === personId);
    const draft = plan?.versions.find((v) => v.status === "draft_in_progress" || v.status === "ready_for_approval");
    if (!tpl || !latest || !plan || !draft) return false;
    const now = new Date().toISOString();
    const byKey = new Map(draft.sections.map((x) => [x.key, x]));
    const tplKeys = new Set(latest.sections.map((x) => x.sectionKey));
    const ordered: CarePlanSection[] = latest.sections.map((ts) => byKey.get(ts.sectionKey) ?? {
      key: ts.sectionKey, body: "", label: ts.sectionKey.startsWith("custom_") ? ts.displayName : undefined,
      isCustom: ts.sectionKey.startsWith("custom_") || undefined, addedInVersionId: draft.id,
    });
    const keptCustom = draft.sections.filter((x) => !tplKeys.has(x.key) && x.isCustom && !x.key.startsWith("custom_SEC"));
    const removed = draft.sections.filter((x) => !tplKeys.has(x.key) && !keptCustom.includes(x));
    const added = latest.sections.filter((ts) => !byKey.has(ts.sectionKey));
    const changes: SectionChangeRecord[] = [
      ...added.map((ts) => ({ key: ts.sectionKey, kind: "added" as const, editedBy: actor, editedAt: now, reason: `Template v${latest.versionNumber}`, sectionType: "template" as const, sectionTitle: ts.displayName })),
      ...removed.map((x) => ({ key: x.key, kind: "removed" as const, previousContent: x.body, editedBy: actor, editedAt: now, reason: `Not in template v${latest.versionNumber}` })),
    ];
    const updated: CarePlanVersion = {
      ...draft, sections: [...ordered, ...keptCustom], templateId: tpl.id, templateVersion: latest.versionNumber, sectionOrderOverride: undefined,
      sectionChanges: [...(draft.sectionChanges ?? []), ...changes],
    };
    state = { ...state, plans: state.plans.map((p) => p.personId !== personId ? p : { ...p, versions: p.versions.map((v) => v.id === draft.id ? updated : v) }) };
    emit();
    audit({
      personId, versionId: draft.id, actor, actorRole, action: "section_edited",
      metadata: { templateUpdate: true, templateId: tpl.id, templateVersion: latest.versionNumber, added: added.map((a) => a.sectionKey), removed: removed.map((r) => r.key) },
    });
    return true;
  },

  setFollowUpStatus(id: string, status: FollowUpTaskSuggestion["status"]) {
    state = { ...state, followUps: state.followUps.map((f) => f.id === id ? { ...f, status } : f) };
    emit();
  },

  /** Add a new person supported (used by the New Care Plan wizard). */
  addPersonSupported(input: Omit<PersonSupported, "initials"> & { initials?: string }): PersonSupported {
    const initials = input.initials ?? input.name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
    const person: PersonSupported = { ...input, initials };
    state = { ...state, people: [...state.people, person] };
    emit();
    return person;
  },

  /**
   * Create the first version of a care plan for a person supported.
   * The version is created as a draft; sections come from the caller
   * (typically the AI drafting helper). Nothing is auto-published.
   */
  createInitialCarePlan(input: {
    personId: string;
    templateId: string;
    sections: CarePlanSection[];
    createdBy: string;
    aiAssisted?: boolean;
    reviewFrequencyMonths?: number;
  }): { plan: CarePlan; version: CarePlanVersion } {
    const others = state.plans.filter((p) => p.personId !== input.personId);
    const versionId = `CP-${input.personId}-V1`;
    const version: CarePlanVersion = {
      id: versionId, versionNumber: 1, status: "draft_in_progress",
      sections: input.sections, createdAt: new Date().toISOString(),
      createdBy: input.createdBy, aiAssisted: input.aiAssisted,
      templateId: input.templateId,
      templateVersion: (() => { const t = state.templates.find((x) => x.id === input.templateId); return t ? tplPublished(t)?.versionNumber : undefined; })(),
    };
    const freq = input.reviewFrequencyMonths ?? 6;
    const next = new Date(); next.setMonth(next.getMonth() + freq);
    const plan: CarePlan = {
      personId: input.personId, templateId: input.templateId,
      currentVersionId: versionId, versions: [version],
      nextReviewDue: next.toISOString(), reviewFrequencyMonths: freq,
    };
    state = { ...state, plans: [...others, plan] };
    emit();
    return { plan, version };
  },

  /**
   * Draft first care plan on admission, built from the published template for
   * the site's service type. Never published; follows the normal approval chain.
   */
  createAdmissionDraft(input: {
    personId: string; name: string; siteName: string; dob?: string;
    centreType: CentreType; keyWorkerStaffId?: StaffId; keyWorkerName?: string; createdBy: string;
    deadline?: { dueAt: string; label: string; sourceReference: string };
  }): CarePlanVersion | undefined {
    const template = state.templates.find((t) => t.serviceType === input.centreType && tplPublished(t));
    const published = template ? tplPublished(template) : undefined;
    if (!template || !published) return undefined;
    if (!state.people.some((p) => p.id === input.personId)) {
      this.addPersonSupported({
        id: input.personId, name: input.name, site: input.siteName, dob: input.dob, riskLevel: "low", tags: [],
        setting: input.centreType === "older_persons" ? "nursing_home" : input.centreType === "disability" ? "disability" : input.centreType === "childrens_residential" ? "childrens_residential" : "home_support",
        keyWorker: input.keyWorkerName, keyWorkerStaffId: input.keyWorkerStaffId,
      });
    }
    const sections: CarePlanSection[] = published.sections.map((sec) => ({ key: sec.sectionKey, label: sec.displayName, body: "" }));
    const { version } = this.createInitialCarePlan({
      personId: input.personId, templateId: template.id, sections, createdBy: input.createdBy,
      reviewFrequencyMonths: published.reviewFrequencyMonths,
    });
    const v: CarePlanVersion = {
      ...version, sourceType: "manual", reasonForChange: "First care plan on admission",
      ...(input.deadline ? { dueBy: input.deadline.dueAt, dueRuleLabel: input.deadline.label, dueRuleSource: input.deadline.sourceReference } : {}),
    };
    state = { ...state, plans: state.plans.map((p) => (p.personId === input.personId ? { ...p, versions: [v] } : p)) };
    emit();
    return v;
  },

  /**
   * Apply an accepted specialist proposed section update into a draft.
   * If no draft exists, clone current published into new draft v(n+1).
   * Never touches the published plan. Returns the target versionId/number.
   */
  applySpecialistUpdateToDraft(input: {
    personId: string;
    sectionKey: SectionKey;
    body: string;
    contributionId: string;
    actor: string;
  }): { versionId: string; versionNumber: number } | undefined {
    const plan = state.plans.find((p) => p.personId === input.personId);
    if (!plan) return;
    let target = plan.versions.find((v) => v.status === "draft_in_progress" || v.status === "ready_for_approval");
    let versions = plan.versions;
    if (!target) {
      const current = plan.versions.find((v) => v.id === plan.currentVersionId);
      if (!current) return;
      const nextNumber = Math.max(...plan.versions.map((v) => v.versionNumber)) + 1;
      const newId = `CP-${input.personId}-V${nextNumber}`;
      target = {
        id: newId,
        versionNumber: nextNumber,
        status: "draft_in_progress",
        sections: current.sections.map((s) => ({ ...s })),
        createdAt: new Date().toISOString(),
        createdBy: input.actor,
        aiAssisted: false,
      };
      versions = [...plan.versions, target];
    }
    const updatedVersions = versions.map((v) => v.id === target!.id
      ? {
          ...v,
          sections: v.sections.map((s) => s.key === input.sectionKey
            ? {
                ...s,
                body: input.body,
                humanEdited: true,
                sourceContributionIds: Array.from(new Set([...(s.sourceContributionIds ?? []), input.contributionId])),
              }
            : s),
        }
      : v,
    );
    state = { ...state, plans: state.plans.map((p) => p.personId === input.personId ? { ...plan, versions: updatedVersions } : p) };
    emit();
    return { versionId: target.id, versionNumber: target.versionNumber };
  },
};

/**
 * Mock AI drafting helper. Given free-form intake notes or a voice transcript,
 * returns a full set of care-plan sections plus a "missing information" list.
 * Deterministic keyword matching only — always labelled as AI draft.
 */
export function generateAiDraftSections(
  notes: string,
  personName: string,
): { sections: CarePlanSection[]; missing: string[] } {
  const t = notes.toLowerCase();
  const has = (...k: string[]) => k.some((x) => t.includes(x));
  const first = personName.split(" ")[0] || personName || "The person";

  const pick = (fallback: string, ...clauses: [boolean, string][]): string => {
    const hits = clauses.filter(([b]) => b).map(([, s]) => s);
    return hits.length ? hits.join(" ") : fallback;
  };

  const sections: CarePlanSection[] = [
    { key: "about", body: pick(
      `${first}'s preferences, interests and life history should be captured with the person and their family/advocate.`,
      [has("enjoys", "likes", "prefers", "hobby"), `${first} has preferences and interests noted in the intake notes that should be reflected in daily support.`],
      [has("newspaper", "reading", "music", "gardening", "hurling"), `${first} enjoys familiar daily routines including reading and music.`],
    )},
    { key: "communication", body: pick(
      `Communication preferences to be confirmed with ${first} and family/advocate.`,
      [has("glasses", "hearing aid", "hard of hearing"), `${first} uses sensory aids (glasses/hearing aid) — ensure they are worn and functioning.`],
      [has("english", "irish", "gaeilge"), `${first} communicates verbally. Preferred language noted in intake.`],
    )},
    { key: "personalCare", body: pick(
      `Personal care preferences to be confirmed. Assume standby assistance until assessed.`,
      [has("shower"), `${first} prefers a shower — timing and level of assistance to be confirmed.`],
      [has("bath"), `${first} prefers a bath — assistance needs to be confirmed.`],
    )},
    { key: "mobility", body: pick(
      `Mobility to be assessed on admission. Assume supervision until assessed.`,
      [has("walking frame", "zimmer", "four-wheeled"), `${first} uses a walking frame. Ensure it is within reach at all times.`],
      [has("walking stick"), `${first} uses a walking stick.`],
      [has("wheelchair"), `${first} mobilises with a wheelchair.`],
      [has("supervision", "unsteady", "at night"), `Supervision required when tired or at night.`],
    )},
    { key: "fallsRisk", body: pick(
      `Falls risk assessment to be completed on admission.`,
      [has("fall", "falls"), `History of falls noted in intake. Assess as at least medium falls risk pending formal assessment. Ensure call bell and mobility aid are within reach.`],
    )},
    { key: "nutrition", body: pick(
      `Nutritional needs and preferences to be confirmed with ${first} and dietitian if needed.`,
      [has("diabet"), `${first} has diabetes — dietary considerations apply.`],
      [has("soft diet", "thickened", "salt", "swallow"), `Modified diet may be required — refer to SALT.`],
    )},
    { key: "medication", body: pick(
      `Full medication reconciliation required on admission. Verify against GP list and MAR.`,
      [has("anti-hypertensive", "blood pressure"), `Anti-hypertensive medication noted.`],
      [has("vitamin d"), `Vitamin D supplement noted.`],
      [has("anticoagulant", "warfarin"), `Anticoagulant therapy noted — bleeding/falls precautions apply.`],
    )},
    { key: "health", body: pick(
      `Current health conditions to be verified with GP.`,
      [has("hypertension", "blood pressure"), `Hypertension noted.`],
      [has("dementia", "cognitive"), `Cognitive impairment noted — support accordingly.`],
      [has("diabet"), `Diabetes noted.`],
    )},
    { key: "safeguarding", body: `No active safeguarding concerns identified in intake notes. To be confirmed by PIC on admission.` },
    { key: "risksControls", body: pick(
      `Risk register to be completed on admission.`,
      [has("fall", "falls"), `Falls risk — controls: call bell, mobility aid within reach, environmental checks.`],
    )},
    { key: "goals", body: pick(
      `Goals and outcomes to be agreed with ${first} and family/advocate.`,
      [has("music", "garden", "walk", "attend", "keep"), `${first} has expressed preferences to maintain current activities — capture as agreed goals.`],
    )},
    { key: "family", body: pick(
      `Family/advocate contact to be confirmed.`,
      [has("daughter"), `Daughter identified as main family contact in intake notes.`],
      [has("son"), `Son identified as main family contact in intake notes.`],
      [has("wife", "husband", "spouse"), `Spouse identified as main family contact in intake notes.`],
      [has("advocate"), `Nominated advocate captured in intake notes.`],
    )},
    { key: "reviewNotes", body: `Initial care plan — AI-drafted from intake notes on ${new Date().toLocaleDateString()}. Requires human review and PIC sign-off before publication.` },
  ];

  const missing: string[] = [];
  if (!has("diet", "eat", "nutrition", "meal", "swallow")) missing.push("Nutrition and hydration details are limited");
  if (!has("safeguard", "concern", "safe")) missing.push("Safeguarding status should be confirmed");
  if (!has("medic", "tablet", "prescri", "mar")) missing.push("Medication list should be verified against MAR");
  if (has("fall", "falls") || !has("mobil", "walk", "steady")) missing.push("Falls risk assessment should be completed");
  if (!has("family", "daughter", "son", "wife", "husband", "advocate", "next of kin")) missing.push("Family/advocate involvement should be confirmed");
  return { sections, missing };
}

export const DEMO_VOICE_TRANSCRIPT = `Patrick Murphy is a 78-year-old man admitted to East Cork. He prefers to be called Paddy. He enjoys reading the newspaper each morning and listening to traditional music. He uses a four-wheeled walking frame and has had two falls at home before admission. He can mobilise short distances but needs supervision when tired or at night. His daughter Margaret is his main family contact and advocate. He wears glasses and a hearing aid in his right ear. He prefers showers in the morning. He is on anti-hypertensive medication and vitamin D. He wants to keep attending music sessions and walking to the garden.`;

// React hook
export function useCarePlans(): State {
  return useSyncExternalStore(subscribe, carePlansStore.getState, carePlansStore.getState);
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function statusLabel(s: CarePlanStatus): string {
  switch (s) {
    case "published": return "Published";
    case "review_suggested": return "Review suggested";
    case "draft_in_progress": return "Draft in progress";
    case "ready_for_approval": return "Ready for approval";
    case "approved": return "Approved";
    case "rejected": return "Rejected";
    case "archived": return "Archived";
  }
}

export const AI_DISCLAIMER = AI_LABEL;

/** Resolve a display label for any section — canonical or custom. */
export function sectionLabel(sec: Pick<CarePlanSection, "key" | "label">): string {
  if (sec.label) return sec.label;
  return SECTION_LABELS[sec.key as SectionKey] ?? sec.key;
}

/** Sections in the template registry that a person may not yet have — offered by "Add section from template". */
export function availableTemplateSectionsForPerson(personId: string): { key: SectionKey; label: string }[] {
  const plan = carePlansStore.getPlan(personId);
  const current = plan?.versions.find((v) => v.id === plan.currentVersionId);
  const draft = plan?.versions.find((v) => v.status === "draft_in_progress" || v.status === "ready_for_approval");
  const existing = new Set<string>([
    ...(current?.sections.map((s) => s.key) ?? []),
    ...(draft?.sections.map((s) => s.key) ?? []),
  ]);
  return SECTION_ORDER.filter((k) => !existing.has(k)).map((k) => ({ key: k, label: SECTION_LABELS[k] }));
}

// ---------- Role-based scoping helpers ----------
// A single source of truth used by every Care Planning page so filtering
// stays consistent across Overview, People, Reviews Due, Reporting, and the
// Person detail page.

import { can, isManagerRole, type Role } from "./roleStore";

export interface ScopeInput {
  role: Role;
  scope: string[];
  unit?: string;
}

/** True when the given person supported is visible to the current role/scope. */
export function isPersonInScope(person: Pick<PersonSupported, "site" | "unit">, s: ScopeInput): boolean {
  if (s.role === "admin") return true;
  if (!s.scope.includes(person.site)) return false;
  // Frontline is additionally narrowed to their current unit/wing when set.
  if (s.role === "frontline" && s.unit) {
    return !person.unit || person.unit === s.unit;
  }
  return true;
}

export function getVisiblePeople(people: PersonSupported[], s: ScopeInput): PersonSupported[] {
  return people.filter((p) => isPersonInScope(p, s));
}

export function canViewPersonCarePlan(personId: string, s: ScopeInput): boolean {
  const p = state.people.find((x) => x.id === personId);
  if (!p) return false;
  return isPersonInScope(p, s);
}

/** Human-readable scope indicator for badges/subtitles. */
export function scopeLabel(s: ScopeInput): string {
  if (s.role === "admin") return "All sites";
  const site = s.scope[0] ?? "—";
  if (s.role === "frontline" && s.unit) return `${site} · ${s.unit}`;
  if (s.scope.length > 1) return s.scope.join(" + ");
  return site;
}

/** True when the role can approve/publish care plan drafts (within scope).
 * Note: actual approve action still requires being listed in the approval chain
 * for the current level — this only gates visibility of the approve/publish UI. */
export function canApproveCarePlan(role: Role): boolean {
  return role === "admin" || isManagerRole(role);
}

/** True when the role can edit templates. */
export function canEditCarePlanTemplates(role: Role): boolean {
  return can("carePlan.editTemplates", role);
}

/** True when `staffId` is the assigned key worker for this person. */
export function isKeyWorkerFor(person: Pick<PersonSupported, "keyWorkerStaffId">, staffId: string | undefined): boolean {
  return !!person.keyWorkerStaffId && !!staffId && person.keyWorkerStaffId === staffId;
}

/** True when the current user may create/edit draft edits & add sections for this person. */
export function canEditCarePlanFor(person: Pick<PersonSupported, "site" | "unit" | "keyWorkerStaffId">, s: ScopeInput & { staffId?: string }): boolean {
  if (s.role === "viewonly" || s.role === "external") return false;
  if (!isPersonInScope(person, s)) return false;
  if (s.role === "admin" || isManagerRole(s.role)) return true;
  if (s.role === "frontline") return isKeyWorkerFor(person, s.staffId);
  return false;
}

// ---------- Approval-chain aware helpers ----------
// Care plan approve/publish decisions are gated by the approval chain instance,
// NOT by broad role. Managers/Admins can *see* the UI (see canApproveCarePlan
// above for legacy UI-visibility gating), but the action itself is only
// permitted when the caller is the current approver at the current level, or
// when an Admin explicitly invokes an override with a mandatory reason.

import { carePlanApprovalChainsStore, canDecideAtCurrentLevel } from "./carePlanApprovalChainsStore";

export interface CarePlanActor {
  role: Role;
  staffName: string;
  staffEmail?: string;
  staffId?: string;
}

/** True iff the caller may submit this draft for approval. */
export function canSubmitCarePlanDraftForApproval(
  personId: string,
  versionId: string,
  actor: CarePlanActor & { scope: string[]; unit?: string; staffId?: string },
): boolean {
  if (actor.role === "viewonly" || actor.role === "external") return false;
  const plan = state.plans.find((p) => p.personId === personId);
  const version = plan?.versions.find((v) => v.id === versionId);
  if (!plan || !version) return false;
  if (version.status !== "draft_in_progress" && version.status !== "ready_for_approval") return false;
  const person = state.people.find((p) => p.id === personId);
  if (!person) return false;
  return canEditCarePlanFor(person, { role: actor.role, scope: actor.scope, unit: actor.unit, staffId: actor.staffId });
}

/** True iff the caller is the current approver at the draft's current chain level. */
export function canApproveCarePlanDraft(
  versionId: string,
  actor: CarePlanActor,
): boolean {
  if (actor.role === "viewonly" || actor.role === "external" || actor.role === "frontline") return false;
  const plan = state.plans.find((p) => p.versions.some((v) => v.id === versionId));
  const version = plan?.versions.find((v) => v.id === versionId);
  if (!plan || !version) return false;
  if (!version.approvalInstanceId) return false;
  const instances = carePlanApprovalChainsStore.getState().instances;
  const inst = instances.find((i) => i.id === version.approvalInstanceId);
  if (!inst) return false;
  if (inst.status !== "awaiting_approval") return false;
  return canDecideAtCurrentLevel(inst, actor.staffId);
}

/**
 * True iff the draft is fully approved and ready to be published.
 * Publishing NEVER silently bypasses the chain. Admins may invoke an override,
 * but that must go through {@link recordAdminOverride}.
 */
export function canPublishApprovedCarePlanDraft(
  versionId: string,
  actor: CarePlanActor,
): boolean {
  if (actor.role === "viewonly" || actor.role === "external" || actor.role === "frontline") return false;
  const plan = state.plans.find((p) => p.versions.some((v) => v.id === versionId));
  const version = plan?.versions.find((v) => v.id === versionId);
  if (!plan || !version) return false;
  if (version.status !== "approved") return false;
  if (!version.approvalInstanceId) return actor.role === "admin"; // no chain → admin only
  const inst = carePlanApprovalChainsStore
    .getState()
    .instances.find((i) => i.id === version.approvalInstanceId);
  if (!inst) return false;
  return inst.status === "approved";
}

/**
 * Admin override for approve/publish. Requires a mandatory reason. Records the
 * actor, timestamp, and reason to the audit trail and to the approval instance.
 * Preserves the previously approved version (does not delete it).
 */
export function recordAdminOverride(input: {
  personId: string;
  versionId: string;
  action: "approve" | "publish";
  reason: string;
  actor: { name: string; email: string };
}): boolean {
  const reason = input.reason?.trim();
  if (!reason) return false;
  const plan = state.plans.find((p) => p.personId === input.personId);
  const version = plan?.versions.find((v) => v.id === input.versionId);
  if (!plan || !version) return false;

  // Log override on approval instance if present
  if (version.approvalInstanceId) {
    carePlanApprovalChainsStore.adminOverride(version.approvalInstanceId, input.actor, reason);
  }
  // Append to care plan audit trail
  carePlanAuditStore.log({
    personId: input.personId,
    versionId: input.versionId,
    carePlanId: input.versionId,
    actor: input.actor.name,
    actorRole: "admin",
    action: input.action === "publish" ? "admin_override_publish" : "admin_override_approve",
    fromStatus: version.status,
    toStatus: input.action === "publish" ? "published" : "approved",
    metadata: { overrideReason: reason, overrideActorEmail: input.actor.email },
  });
  return true;
}



// ---------- Template display helpers ----------

/** Display name a person's template uses for a plan section (by key, then by category). */
export function templateSectionName(personId: string, sectionKey: string): string {
  const tpl = templateForPersonIn(state, personId);
  const v = tpl ? tplPublished(tpl) : undefined;
  const hit = v?.sections.find((x) => x.sectionKey === sectionKey)
    ?? v?.sections.find((x) => x.category === catForKey(sectionKey) && catForKey(sectionKey) !== "other");
  return hit?.displayName ?? SECTION_LABELS[sectionKey as SectionKey] ?? sectionKey;
}

/** Plan-section keys for given categories, using the person's template (falls back to standard keys). */
export function sectionKeysForCategories(personId: string, categories: SecCat[]): SectionKey[] {
  const tpl = templateForPersonIn(state, personId);
  const v = tpl ? tplPublished(tpl) : undefined;
  const out: string[] = [];
  categories.forEach((c) => {
    const fromTpl = v?.sections.filter((x) => x.category === c).map((x) => x.sectionKey) ?? [];
    const keys = fromTpl.length ? fromTpl : (Object.entries(STANDARD_KEYS) as [SecCat, string][]).filter(([k]) => k === c).map(([, k]) => k);
    keys.forEach((k) => { if (!out.includes(k)) out.push(k); });
  });
  return out as SectionKey[];
}

/** Default section order for a template (its published version). */
export function templateSectionOrder(templateId: string): TemplateSection[] {
  const t = state.templates.find((x) => x.id === templateId);
  return (t ? tplPublished(t)?.sections : undefined) ?? [];
}

export function useTemplates(): CarePlanTemplate[] {
  return useCarePlans().templates;
}
