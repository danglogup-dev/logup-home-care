import { eventId } from "./demoScenario";
/**
 * Cross-module link registry for the LogUp prototype.
 *
 * Shared demo linkage layer on top of `demoDataRegistry.ts`.
 *
 * Every record here references real people, staff and site IDs from the
 * shared registry, and real Events (`INC-*`) IDs from `incidentRecords.ts`.
 * No IDs, names or geography are invented locally.
 *
 * Modules (Events, Care Planning, Audits, Policy Hub, Tasks, Workforce,
 * Team, Insights, Reporting) should consult this file when they need to
 * show cross-module chips, back-links or roll-ups. It is the single source
 * of truth for the demonstrable link graph:
 *
 *   Care Plan  ── associated ──▶ Events
 *   Task       ── from        ──▶ Event | Care Plan | Audit | Workforce
 *   Audit      ── linked      ──▶ Events | Workforce requirement
 *   Policy     ── governs     ──▶ Event subtype | Workforce req. | Module
 *   Insight    ── derived     ──▶ Events | Workforce | Audits
 *
 * Geography rule (whole demo): Organisation → Site → Person.
 * Units / wings / floors are NOT used.
 */

import type {
  PersonSupportedId,
  SiteId,
  StaffId,
} from "./demoDataRegistry";

// ─── Care plans ──────────────────────────────────────────────────────────────

export type CarePlanId =
  | "CP-PS001" | "CP-PS002" | "CP-PS004" | "CP-PS007";

export type DraftStatus =
  | "None"
  | "Draft in progress"
  | "Awaiting approval"
  | "Approved"
  | "Published";

export interface CarePlanLink {
  carePlanId: CarePlanId;
  personSupportedId: PersonSupportedId;
  siteId: SiteId;
  keyWorkerId: StaffId;
  specialistContributorId?: StaffId;
  focus: string;
  currentApprovedVersion: string;
  draftVersion?: string;
  draftStatus: DraftStatus;
  associatedEventIds: string[];
}

export const CARE_PLAN_LINKS: readonly CarePlanLink[] = [
  {
    carePlanId: "CP-PS001",
    personSupportedId: "PS-001",
    siteId: "SITE-OAK",
    keyWorkerId: "STAFF-EMMA",
    specialistContributorId: "STAFF-BRIAN",
    focus: "Falls / Mobility",
    currentApprovedVersion: "v3",
    draftVersion: "CP-PS001-V4",
    draftStatus: "Awaiting approval",
    associatedEventIds: [eventId("paddy-fall-2d"), eventId("paddy-fall-12d"), eventId("paddy-fall-45d"), eventId("paddy-fall-70d")],
  },
  {
    carePlanId: "CP-PS002",
    personSupportedId: "PS-002",
    siteId: "SITE-OAK",
    keyWorkerId: "STAFF-AISLING",
    specialistContributorId: "STAFF-SARAH",
    focus: "Nutrition / Hydration",
    currentApprovedVersion: "v2",
    draftStatus: "None",
    associatedEventIds: [eventId("mary-nutrition-4d"), eventId("mary-nutrition-20d")],
  },
  {
    carePlanId: "CP-PS004",
    personSupportedId: "PS-004",
    siteId: "SITE-RIV",
    keyWorkerId: "STAFF-NIAMH",
    focus: "Behaviour Support / Safeguarding",
    currentApprovedVersion: "v1",
    draftStatus: "None",
    associatedEventIds: [eventId("eileen-safeguarding")],
  },
  {
    carePlanId: "CP-PS007",
    personSupportedId: "PS-007",
    siteId: "SITE-ELM",
    keyWorkerId: "STAFF-ORLA",
    focus: "Epilepsy Support",
    currentApprovedVersion: "v1",
    draftStatus: "None",
    associatedEventIds: [eventId("michael-seizure-fall")],
  },
] as const;

export const CARE_PLAN_BY_ID: Record<CarePlanId, CarePlanLink> =
  CARE_PLAN_LINKS.reduce(
    (acc, cp) => ({ ...acc, [cp.carePlanId]: cp }),
    {} as Record<CarePlanId, CarePlanLink>,
  );

export const carePlanForPerson = (
  personId: PersonSupportedId,
): CarePlanLink | undefined =>
  CARE_PLAN_LINKS.find((cp) => cp.personSupportedId === personId);

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskSourceType = "event" | "care_plan" | "audit" | "workforce";
export type TaskStatus = "Open" | "In progress" | "Due soon" | "Overdue" | "Completed";

export interface TaskLink {
  id: string;
  sourceType: TaskSourceType;
  sourceId: string;              // e.g. INC-1042, CP-PS001-V4, AUD-002, QUAL-FIRSTAID-EMMA
  personSupportedId?: PersonSupportedId;
  siteId: SiteId;
  title: string;
  ownerId: StaffId;
  status: TaskStatus;
}

export const TASK_LINKS: readonly TaskLink[] = [
  {
    id: "TASK-1042-A",
    sourceType: "event", sourceId: eventId("paddy-fall-2d"),
    personSupportedId: "PS-001", siteId: "SITE-OAK",
    title: "Review Patrick’s falls controls",
    ownerId: "STAFF-EMMA", status: "Open",
  },
  {
    id: "TASK-1042-B",
    sourceType: "care_plan", sourceId: "CP-PS001-V4",
    personSupportedId: "PS-001", siteId: "SITE-OAK",
    title: "Confirm mobility aid placement in bedroom",
    ownerId: "STAFF-DANIEL", status: "Open",
  },
  {
    id: "TASK-2051-A",
    sourceType: "event", sourceId: eventId("mary-nutrition-4d"),
    personSupportedId: "PS-002", siteId: "SITE-OAK",
    title: "Record three-day fluid intake summary",
    ownerId: "STAFF-AISLING", status: "Open",
  },
  {
    id: "TASK-3062-A",
    sourceType: "event", sourceId: eventId("eileen-safeguarding"),
    personSupportedId: "PS-004", siteId: "SITE-RIV",
    title: "Complete safeguarding follow-up review",
    ownerId: "STAFF-SIOBHAN", status: "Overdue",
  },
  {
    id: "TASK-WF-001",
    sourceType: "workforce", sourceId: "QUAL-FIRSTAID-STAFF-EMMA",
    siteId: "SITE-OAK",
    title: "Emma Ryan first aid renewal due",
    ownerId: "STAFF-EMMA", status: "Due soon",
  },

] as const;

export const tasksForEvent = (incidentId: string) =>
  TASK_LINKS.filter((t) => t.sourceType === "event" && t.sourceId === incidentId);

export const tasksForPerson = (personId: PersonSupportedId) =>
  TASK_LINKS.filter((t) => t.personSupportedId === personId);

// ─── Audits ──────────────────────────────────────────────────────────────────

export type AuditLinkStatus = "Overdue" | "Due soon" | "In progress" | "Completed";

export interface AuditLink {
  id: string;
  title: string;
  siteId: SiteId;
  siteName: string;
  ownerId: StaffId;
  status: AuditLinkStatus;
  finding?: string;
  linkedEventIds?: string[];
  linkedWorkforceRequirement?: string;
}

export const AUDIT_LINKS: readonly AuditLink[] = [
  {
    id: "AUD-001", title: "Medication management audit",
    siteId: "SITE-OAK", siteName: "Oakfield Manor",
    ownerId: "STAFF-DANIEL", status: "Overdue",
    finding: "Medication competency evidence missing for one staff member.",
    linkedWorkforceRequirement: "Medication Administration",
  },
  {
    id: "AUD-002", title: "Falls and environment audit",
    siteId: "SITE-OAK", siteName: "Oakfield Manor",
    ownerId: "STAFF-SIOBHAN", status: "Due soon",
    finding: "Repeat falls pattern requires environmental review.",
    linkedEventIds: [eventId("paddy-fall-2d"), eventId("paddy-fall-12d"), eventId("paddy-fall-45d"), eventId("paddy-fall-70d")],
  },
  {
    id: "AUD-003", title: "Fire safety checks audit",
    siteId: "SITE-OAK", siteName: "Oakfield Manor",
    ownerId: "STAFF-DANIEL", status: "Completed",
    linkedEventIds: [eventId("riv-fire-alarm")],
  },
  {
    id: "AUD-004", title: "Safeguarding audit",
    siteId: "SITE-RIV", siteName: "Riverside Lodge",
    ownerId: "STAFF-SIOBHAN", status: "Overdue",
    linkedEventIds: [eventId("eileen-safeguarding")],
  },
] as const;

export const AUDIT_BY_ID = AUDIT_LINKS.reduce(
  (acc, a) => ({ ...acc, [a.id]: a }),
  {} as Record<string, AuditLink>,
);

export const auditsForEvent = (incidentId: string) =>
  AUDIT_LINKS.filter((a) => a.linkedEventIds?.includes(incidentId));

// ─── Policies ────────────────────────────────────────────────────────────────

export type PolicyStatus = "Current" | "Due for review" | "Draft" | "Archived";

export interface PolicyLink {
  id: string;
  title: string;
  status: PolicyStatus;
  ownerId: StaffId;
  linkedEventSubtypes?: string[];
  linkedWorkforceRequirements?: string[];
  linkedCarePlanSections?: string[];
  linkedModule?: "Care Planning" | "Events" | "Audits" | "Workforce" | "Tasks";
}

export const POLICY_LINKS: readonly PolicyLink[] = [
  {
    id: "POL-FALLS",
    title: "Falls Prevention and Post-Fall Review Policy",
    status: "Current",
    ownerId: "STAFF-AOIFE",
    linkedEventSubtypes: ["Fall"],
    linkedCarePlanSections: ["Mobility", "Falls Risk"],
  },
  {
    id: "POL-MED",
    title: "Medication Administration Policy",
    status: "Due for review",
    ownerId: "STAFF-AOIFE",
    linkedWorkforceRequirements: [
      "Medication Administration",
      "Epilepsy Medication Administration",
    ],
  },
  {
    id: "POL-SAFE",
    title: "Safeguarding Policy",
    status: "Current",
    ownerId: "STAFF-AOIFE",
    linkedEventSubtypes: ["Safeguarding", "Abuse", "Behaviour support"],
  },
  {
    id: "POL-FIRE",
    title: "Fire Safety and Evacuation Policy",
    status: "Current",
    ownerId: "STAFF-AOIFE",
    linkedEventSubtypes: ["Fire alarm activation", "Fire", "Evacuation"],
  },
  {
    id: "POL-CAREPLAN",
    title: "Care Planning and Review Policy",
    status: "Due for review",
    ownerId: "STAFF-AOIFE",
    linkedModule: "Care Planning",
  },
] as const;

export const POLICY_BY_ID = POLICY_LINKS.reduce(
  (acc, p) => ({ ...acc, [p.id]: p }),
  {} as Record<string, PolicyLink>,
);

export const policiesForEventSubtype = (subtype: string): PolicyLink[] =>
  POLICY_LINKS.filter((p) =>
    p.linkedEventSubtypes?.some((s) => s.toLowerCase() === subtype.toLowerCase()),
  );

// ─── Workforce (site requirements + qualifications) ──────────────────────────

export type QualStatus = "Current" | "Due soon" | "Expired";

export interface SiteRequirement {
  siteId: SiteId;
  required: string[];
  conditional?: string[];
}

export const SITE_REQUIREMENTS: readonly SiteRequirement[] = [
  {
    siteId: "SITE-OAK",
    required: [
      "First Aid", "Manual Handling", "Safeguarding",
      "Fire Safety", "Medication Administration",
    ],
    conditional: ["Nutrition / Dysphagia Awareness", "Falls response awareness"],
  },
  {
    siteId: "SITE-RIV",
    required: [
      "First Aid", "Manual Handling", "Safeguarding",
      "Fire Safety", "Positive Behaviour Support",
    ],
    conditional: ["Medication Administration"],
  },
  {
    siteId: "SITE-ELM",
    required: [
      "First Aid", "Manual Handling", "Safeguarding",
      "Fire Safety", "Epilepsy Awareness",
    ],
    conditional: ["Epilepsy Medication Administration"],
  },
] as const;

export interface StaffQualification {
  staffId: StaffId;
  requirement: string;
  status: QualStatus;
}

export const STAFF_QUALIFICATIONS: readonly StaffQualification[] = [
  // Emma Ryan (Oakfield)
  { staffId: "STAFF-EMMA",    requirement: "First Aid",                          status: "Due soon" },
  { staffId: "STAFF-EMMA",    requirement: "Manual Handling",                    status: "Current"  },
  { staffId: "STAFF-EMMA",    requirement: "Safeguarding",                       status: "Current"  },
  // Aisling Doherty (Oakfield)
  { staffId: "STAFF-AISLING", requirement: "First Aid",                          status: "Current"  },
  { staffId: "STAFF-AISLING", requirement: "Nutrition / Dysphagia Awareness",    status: "Due soon" },
  { staffId: "STAFF-AISLING", requirement: "Safeguarding",                       status: "Current"  },
  // Daniel Walsh (Oakfield)
  { staffId: "STAFF-DANIEL",  requirement: "Medication Administration",          status: "Current"  },
  { staffId: "STAFF-DANIEL",  requirement: "Fire Safety",                        status: "Current"  },
  { staffId: "STAFF-DANIEL",  requirement: "Manual Handling",                    status: "Current"  },
  // Siobhán Kelly (Oakfield + Riverside)
  { staffId: "STAFF-SIOBHAN", requirement: "Safeguarding",                       status: "Current"  },
  { staffId: "STAFF-SIOBHAN", requirement: "Positive Behaviour Support",         status: "Current"  },
  { staffId: "STAFF-SIOBHAN", requirement: "First Aid",                          status: "Expired"  },
  // Orla McCarthy (Elm Grove)
  { staffId: "STAFF-ORLA",    requirement: "Epilepsy Awareness",                 status: "Current"  },
  { staffId: "STAFF-ORLA",    requirement: "Epilepsy Medication Administration", status: "Due soon" },
  { staffId: "STAFF-ORLA",    requirement: "First Aid",                          status: "Current"  },
] as const;

// Convenience id used by TASK-WF-001.
export const QUAL_KEYS = {
  FIRSTAID_EMMA: "QUAL-FIRSTAID-STAFF-EMMA",
  FIRSTAID_SIOBHAN: "QUAL-FIRSTAID-STAFF-SIOBHAN",
  EPILEPSYMEDS_ORLA: "QUAL-EPILEPSYMEDS-STAFF-ORLA",
  DYSPHAGIA_AISLING: "QUAL-DYSPHAGIA-STAFF-AISLING",
} as const;


// ─── Insight cards ───────────────────────────────────────────────────────────

export type InsightSourceKind = "events" | "workforce" | "audits";

export interface InsightCardLink {
  id: string;
  title: string;
  sourceKind: InsightSourceKind;
  sourceRefs: string[];              // INC-*, AUD-*, or workforce keys
  personSupportedId?: PersonSupportedId;
  siteId?: SiteId;
  risk?: string;
  action: string;
}

export const INSIGHT_CARDS: readonly InsightCardLink[] = [
  {
    id: "INS-FALLS-PS001",
    title: "Repeat falls hotspot",
    sourceKind: "events",
    sourceRefs: [eventId("paddy-fall-2d"), eventId("paddy-fall-12d"), eventId("paddy-fall-45d"), eventId("paddy-fall-70d")],
    personSupportedId: "PS-001",
    siteId: "SITE-OAK",
    action: "Review care plan draft v4 and falls/environment audit.",
  },
  {
    id: "INS-NUTR-PS002",
    title: "Nutrition follow-up required",
    sourceKind: "events",
    sourceRefs: [eventId("mary-nutrition-4d"), eventId("mary-nutrition-20d")],
    personSupportedId: "PS-002",
    siteId: "SITE-OAK",
    action: "Review dietitian contribution and fluid intake task.",
  },
  {
    id: "INS-WF-COMPLIANCE",
    title: "Workforce compliance risk",
    sourceKind: "workforce",
    sourceRefs: ["STAFF-SIOBHAN:First Aid", "STAFF-ORLA:Epilepsy Medication Administration"],
    risk: "Siobhán Kelly first aid expired; Orla McCarthy epilepsy medication administration due soon.",
    action: "Open Workforce Compliance matrix.",
  },
  {
    id: "INS-AUD-OVERDUE",
    title: "Audit overdue risk",
    sourceKind: "audits",
    sourceRefs: ["AUD-001", "AUD-004"],
    risk: "Medication audit overdue in Oakfield Manor; Safeguarding audit overdue in Riverside Lodge.",
    action: "Open Audits reporting.",
  },
  {
    id: "INS-FIRE-QTR",
    title: "Fire alarm quarterly return item",
    sourceKind: "events",
    sourceRefs: [eventId("riv-fire-alarm")],
    siteId: "SITE-OAK",
    action: "Review notification/quarterly return status if enabled.",
  },
] as const;
