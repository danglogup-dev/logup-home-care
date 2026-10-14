import { eventId } from "./demoScenario";
// Insights seed data for the LogUp prototype.
//
// Every insight here references a real shared demo record (Events INC-*,
// Care Plans CP-*, Audits AUD-*, Policies POL-*, Tasks TASK-*, Workforce
// QUAL-*) so links back to source modules resolve to genuine screens.
//
// Geography is site-only (Organisation → Site → Person). No units, wings
// or floors are used.
//
// AI rule: insights only surface possible attention. They never make
// final compliance judgements or assign statutory obligations.

export type InsightType =
  | "Resident"
  | "Location"
  | "Time"
  | "Incident Type"
  | "Governance"
  | "Audit"
  | "Workforce"
  | "Policy"
  | "Task";

export type InsightCategory =
  | "Immediate attention"
  | "Care plan risks"
  | "Event / incident risks"
  | "Workforce compliance risks"
  | "Audit and governance risks"
  | "Policy review risks"
  | "Follow-up and task risks";

export type Confidence = "Low" | "Medium" | "High";

export type InsightStatus =
  | "New"
  | "Under Review"
  | "Action Needed"
  | "Confirmed"
  | "Dismissed";

export interface AuditTrailEntry {
  at: string;
  by: string;
  event: string;
}

export interface Insight {
  id: string;
  title: string;
  category: InsightCategory;
  type: InsightType;
  confidence: Confidence;
  site: string;                         // display name; use "Multiple" for cross-site
  unit?: string;                        // legacy — always empty (site-only geography)
  resident?: string;
  location?: string;
  /** Canonical site IDs the insight relates to (e.g. ["SITE-OAK","SITE-RIV"]). */
  relatedSiteIds?: string[];
  dateRangeStart: string;
  dateRangeEnd: string;
  relatedCount: number;
  /** Real record IDs — INC-*, CP-*, AUD-*, POL-*, TASK-*, QUAL-*. */
  relatedRecordIds: string[];
  /** Primary source to open first (matches one of relatedRecordIds). */
  primarySourceId?: string;

  summary: string;
  whyItMatters: string;
  suggestedReview: string[];
  suggestedActions: string[];
  status: InsightStatus;
  assignedOwner?: string;
  dueDate?: string;
  managerNotes?: string;
  dismissedReason?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
  auditTrail: AuditTrailEntry[];
  trend?: "up" | "down" | "flat";
  isNewThisWeek?: boolean;
}

// ---------- Helpers ----------

const NOW = "2026-07-24T09:00:00Z";
const aiTrail = (event: string): AuditTrailEntry => ({ at: NOW, by: "LogUp AI", event });

// ---------- Seeded insights ----------

export const seedInsights: Insight[] = [
  // ========== 1. Immediate attention ==========
  {
    id: "INS-IA-001",
    title: "High severity incident under review — Riverside Lodge",
    category: "Immediate attention",
    type: "Incident Type",
    confidence: "High",
    site: "Riverside Lodge",
    relatedSiteIds: ["SITE-RIV"],
    dateRangeStart: "2026-07-18", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: [eventId("eileen-safeguarding")],
    primarySourceId: eventId("eileen-safeguarding"),
    summary: `A safeguarding-linked behavioural incident (${eventId("eileen-safeguarding")}) is open and awaiting senior review at Riverside Lodge.`,
    whyItMatters: "High severity events require prompt leadership oversight and evidence of review.",
    suggestedReview: ["Confirm review stage and named reviewer", "Check whether a safeguarding follow-up task is open"],
    suggestedActions: ["Open the record in Events Board / Reporting"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from open high-severity Events record")],
    trend: "flat",
    isNewThisWeek: true,
  },
  {
    id: "INS-IA-002",
    title: "High severity incident under review — Oakfield Manor",
    category: "Immediate attention",
    type: "Incident Type",
    confidence: "High",
    site: "Oakfield Manor",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-07-15", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: [eventId("paddy-fall-2d")],
    primarySourceId: eventId("paddy-fall-2d"),
    summary: `Patrick Murphy's most recent fall (${eventId("paddy-fall-2d")}) is still under review.`,
    whyItMatters: "The latest fall in a repeat-falls pattern should be closed with recorded learning.",
    suggestedReview: ["Confirm reviewer and closure evidence"],
    suggestedActions: ["Open the record in Events Board / Reporting"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from open high-severity Events record")],
    trend: "flat",
    isNewThisWeek: true,
  },
  {
    id: "INS-IA-003",
    title: "Draft care plan awaiting approval — Patrick Murphy",
    category: "Immediate attention",
    type: "Governance",
    confidence: "High",
    site: "Oakfield Manor",
    resident: "Patrick Murphy",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-07-20", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: ["CP-PS001-V4"],
    primarySourceId: "CP-PS001-V4",
    summary: "Care plan draft CP-PS001-V4 for Patrick Murphy is awaiting manager approval.",
    whyItMatters: "The published plan remains live until the draft is approved. Delay increases risk on an active falls pattern.",
    suggestedReview: ["Open Drafts, Approvals & History for Patrick", "Confirm proposed section changes"],
    suggestedActions: ["Open Patrick Murphy's care plan"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Care Planning draft awaiting approval")],
    trend: "flat",
    isNewThisWeek: true,
  },
  {
    id: "INS-IA-004",
    title: "Workforce qualification expired — Siobhán Kelly First Aid",
    category: "Immediate attention",
    type: "Workforce",
    confidence: "High",
    site: "Multiple",
    relatedSiteIds: ["SITE-OAK", "SITE-RIV"],
    dateRangeStart: "2026-06-01", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: ["QUAL-FIRSTAID-STAFF-SIOBHAN"],
    primarySourceId: "QUAL-FIRSTAID-STAFF-SIOBHAN",
    summary: "Siobhán Kelly's First Aid certificate has expired. She provides First Aid cover across Oakfield and Riverside.",
    whyItMatters: "Two sites are relying on an expired competency for on-call cover.",
    suggestedReview: ["Confirm alternative First Aid holders per site"],
    suggestedActions: ["Open Workforce Compliance"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from expired workforce qualification")],
    trend: "flat",
    isNewThisWeek: true,
  },
  {
    id: "INS-IA-005",
    title: "Audit overdue — Medication management (Oakfield Manor)",
    category: "Immediate attention",
    type: "Audit",
    confidence: "High",
    site: "Oakfield Manor",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-06-15", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: ["AUD-001"],
    primarySourceId: "AUD-001",
    summary: "AUD-001 (Medication management) is overdue at Oakfield Manor.",
    whyItMatters: "Overdue medication audits weaken assurance on a high-risk workflow.",
    suggestedReview: ["Reassign named owner", "Confirm gap in medication competency evidence"],
    suggestedActions: ["Open the audit"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Audits register — overdue status")],
    trend: "flat",
    isNewThisWeek: true,
  },
  {
    id: "INS-IA-006",
    title: "Audit overdue — Safeguarding (Riverside Lodge)",
    category: "Immediate attention",
    type: "Audit",
    confidence: "High",
    site: "Riverside Lodge",
    relatedSiteIds: ["SITE-RIV"],
    dateRangeStart: "2026-06-15", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: ["AUD-004"],
    primarySourceId: "AUD-004",
    summary: "AUD-004 (Safeguarding audit) is overdue at Riverside Lodge.",
    whyItMatters: `A safeguarding-linked incident (${eventId("eileen-safeguarding")}) is open on the same site.`,
    suggestedReview: ["Confirm audit owner is on shift this week"],
    suggestedActions: ["Open the audit"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Audits register — overdue status")],
    trend: "flat",
    isNewThisWeek: true,
  },

  // ========== 2. Care plan risks ==========
  {
    id: "INS-CP-001",
    title: "Repeat falls pattern — Patrick Murphy",
    category: "Care plan risks",
    type: "Resident",
    confidence: "High",
    site: "Oakfield Manor",
    resident: "Patrick Murphy",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-05-20", dateRangeEnd: "2026-07-20",
    relatedCount: 5,
    relatedRecordIds: ["CP-PS001-V4", eventId("paddy-fall-2d"), eventId("paddy-fall-12d"), eventId("paddy-fall-45d"), eventId("paddy-fall-70d"), "AUD-002"],
    primarySourceId: "CP-PS001-V4",
    summary: `Four falls (${eventId("paddy-fall-2d")}, ${eventId("paddy-fall-12d")}, ${eventId("paddy-fall-45d")}, ${eventId("paddy-fall-70d")}) linked to Patrick Murphy. Draft CP-PS001-V4 is awaiting approval and AUD-002 (falls / environment) is due soon.`,
    whyItMatters: "The clinical picture, plan draft and environment audit are all pointing at the same risk.",
    suggestedReview: ["Review care plan draft v4", "Cross-check with falls/environment audit findings"],
    suggestedActions: ["Open Patrick's care plan", "Open AUD-002"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Events + Care Planning + Audits linkage")],
    trend: "up",
    isNewThisWeek: true,
  },
  {
    id: "INS-CP-002",
    title: "Nutrition / hydration concerns — Mary O'Sullivan",
    category: "Care plan risks",
    type: "Resident",
    confidence: "High",
    site: "Oakfield Manor",
    resident: "Mary O'Sullivan",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-06-01", dateRangeEnd: "2026-07-22",
    relatedCount: 3,
    relatedRecordIds: [eventId("mary-nutrition-4d"), eventId("mary-nutrition-20d"), "TASK-2051-A"],
    primarySourceId: eventId("mary-nutrition-4d"),
    summary: `Two nutrition/hydration events (${eventId("mary-nutrition-4d")}, ${eventId("mary-nutrition-20d")}) plus specialist input from Sarah Keane, Dietitian. Fluid intake summary task TASK-2051-A is open.`,
    whyItMatters: "Continued concerns without a completed follow-up task suggests the plan needs a review.",
    suggestedReview: ["Review dietitian's contribution", "Confirm fluid intake task progress"],
    suggestedActions: ["Open Mary's care plan", "Open TASK-2051-A"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Events + specialist contribution + open task")],
    trend: "flat",
    isNewThisWeek: true,
  },
  {
    id: "INS-CP-003",
    title: "Epilepsy plan linked to workforce competency — Michael Doyle",
    category: "Care plan risks",
    type: "Resident",
    confidence: "High",
    site: "Elm Grove House",
    resident: "Michael Doyle",
    relatedSiteIds: ["SITE-ELM"],
    dateRangeStart: "2026-06-10", dateRangeEnd: "2026-07-24",
    relatedCount: 3,
    relatedRecordIds: [eventId("michael-seizure-fall"), "QUAL-EPILEPSYMEDS-STAFF-ORLA"],
    primarySourceId: eventId("michael-seizure-fall"),
    summary: `Michael's epilepsy support plan is linked to a live event (${eventId("michael-seizure-fall")}) and Orla McCarthy's epilepsy medication administration competency is due for reassessment.`,
    whyItMatters: "Michael's care depends on a competency that may lapse.",
    suggestedReview: ["Confirm reassessment date for Orla", "Review care plan support arrangements"],
    suggestedActions: ["Open Michael's care plan", "Open Workforce Compliance"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Care Planning + Workforce linkage")],
    trend: "flat",
    isNewThisWeek: true,
  },

  // ========== 3. Event / incident risks ==========
  {
    id: "INS-EV-001",
    title: "Repeat falls hotspot — Oakfield Manor",
    category: "Event / incident risks",
    type: "Location",
    confidence: "High",
    site: "Oakfield Manor",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-05-20", dateRangeEnd: "2026-07-20",
    relatedCount: 4,
    relatedRecordIds: [eventId("paddy-fall-2d"), eventId("paddy-fall-12d"), eventId("paddy-fall-45d"), eventId("paddy-fall-70d")],
    primarySourceId: eventId("paddy-fall-2d"),
    summary: "Four falls recorded at Oakfield Manor over the last 8 weeks, all linked to Patrick Murphy.",
    whyItMatters: "A concentration of falls on one site warrants an environmental and mobility review.",
    suggestedReview: ["Open Events Reporting filtered to these records", "Consider environmental checks"],
    suggestedActions: ["Open filtered Events Reporting"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from 4 linked Events records at same site")],
    trend: "up",
    isNewThisWeek: true,
  },
  {
    id: "INS-EV-002",
    title: "Behaviour / safeguarding escalation — Riverside Lodge",
    category: "Event / incident risks",
    type: "Incident Type",
    confidence: "High",
    site: "Riverside Lodge",
    relatedSiteIds: ["SITE-RIV"],
    dateRangeStart: "2026-07-01", dateRangeEnd: "2026-07-24",
    relatedCount: 2,
    relatedRecordIds: [eventId("eileen-safeguarding"), "TASK-3062-A"],
    primarySourceId: eventId("eileen-safeguarding"),
    summary: `Safeguarding follow-up task TASK-3062-A is overdue against event ${eventId("eileen-safeguarding")}.`,
    whyItMatters: "Open safeguarding events with overdue follow-up erode assurance quickly.",
    suggestedReview: ["Reassign or escalate the follow-up", "Confirm safeguarding lead is aware"],
    suggestedActions: ["Open the Events record"],
    status: "Under Review",
    assignedOwner: "Siobhán Kelly",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Events + overdue linked task")],
    trend: "up",
    isNewThisWeek: true,
  },
  {
    id: "INS-EV-003",
    title: "Fire alarm activation — quarterly return item",
    category: "Event / incident risks",
    type: "Governance",
    confidence: "Medium",
    site: "Oakfield Manor",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-06-01", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: [eventId("riv-fire-alarm"), "AUD-003"],
    primarySourceId: eventId("riv-fire-alarm"),
    summary: `Site-level fire alarm activation ${eventId("riv-fire-alarm")} is on file. AUD-003 (fire safety checks) is complete.`,
    whyItMatters: "Fire alarm activations typically feature on quarterly regulator returns.",
    suggestedReview: ["Confirm return inclusion", "Check whether any follow-up is outstanding"],
    suggestedActions: ["Open the Events record"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from site-level Events record")],
    trend: "flat",
  },

  // ========== 4. Workforce compliance risks ==========
  {
    id: "INS-WF-001",
    title: "First Aid expired — Siobhán Kelly",
    category: "Workforce compliance risks",
    type: "Workforce",
    confidence: "High",
    site: "Multiple",
    relatedSiteIds: ["SITE-OAK", "SITE-RIV"],
    dateRangeStart: "2026-06-01", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: ["QUAL-FIRSTAID-STAFF-SIOBHAN"],
    primarySourceId: "QUAL-FIRSTAID-STAFF-SIOBHAN",
    summary: "Multi-site manager cover is relying on an expired First Aid competency.",
    whyItMatters: "Cross-site cover is affected until renewal.",
    suggestedReview: ["Confirm alternative First Aid holders on each site"],
    suggestedActions: ["Open Workforce Compliance"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Workforce risk surfaced from expired qualification")],
    trend: "flat",
  },
  {
    id: "INS-WF-002",
    title: "First Aid due soon — Emma Ryan",
    category: "Workforce compliance risks",
    type: "Workforce",
    confidence: "High",
    site: "Oakfield Manor",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-07-01", dateRangeEnd: "2026-08-24",
    relatedCount: 1,
    relatedRecordIds: ["QUAL-FIRSTAID-STAFF-EMMA", "TASK-WF-001"],
    primarySourceId: "QUAL-FIRSTAID-STAFF-EMMA",
    summary: "Emma Ryan (key worker for Patrick Murphy) has First Aid expiring within 30 days. Renewal task TASK-WF-001 is open.",
    whyItMatters: "Losing First Aid cover on Patrick's care team would create a coverage gap.",
    suggestedReview: ["Confirm renewal booking"],
    suggestedActions: ["Open the renewal task"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Workforce risk surfaced from expiring qualification")],
    trend: "flat",
  },
  {
    id: "INS-WF-003",
    title: "Epilepsy medication administration due — Orla McCarthy",
    category: "Workforce compliance risks",
    type: "Workforce",
    confidence: "High",
    site: "Elm Grove House",
    relatedSiteIds: ["SITE-ELM"],
    dateRangeStart: "2026-07-01", dateRangeEnd: "2026-08-31",
    relatedCount: 1,
    relatedRecordIds: ["QUAL-EPILEPSYMEDS-STAFF-ORLA"],
    primarySourceId: "QUAL-EPILEPSYMEDS-STAFF-ORLA",
    summary: "Orla McCarthy's epilepsy medication competency is due for reassessment. Orla is key worker for Michael Doyle.",
    whyItMatters: "Michael's live epilepsy plan depends on this competency staying current.",
    suggestedReview: ["Book reassessment with clinical lead"],
    suggestedActions: ["Open Skills Matrix"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Workforce risk surfaced from expiring qualification")],
    trend: "flat",
  },
  {
    id: "INS-WF-004",
    title: "Nutrition / dysphagia awareness due — Aisling Doherty",
    category: "Workforce compliance risks",
    type: "Workforce",
    confidence: "Medium",
    site: "Oakfield Manor",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-07-01", dateRangeEnd: "2026-08-31",
    relatedCount: 1,
    relatedRecordIds: ["QUAL-DYSPHAGIA-STAFF-AISLING"],
    primarySourceId: "QUAL-DYSPHAGIA-STAFF-AISLING",
    summary: "Aisling Doherty's dysphagia awareness is due for reassessment. Aisling is key worker for Mary O'Sullivan.",
    whyItMatters: "Mary's nutrition plan relies on trained key-worker oversight.",
    suggestedReview: ["Confirm reassessment date"],
    suggestedActions: ["Open Skills Matrix"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Workforce risk surfaced from expiring qualification")],
    trend: "flat",
  },
  {
    id: "INS-WF-005",
    title: "Site requirements not fully met",
    category: "Workforce compliance risks",
    type: "Workforce",
    confidence: "Medium",
    site: "Multiple",
    relatedSiteIds: ["SITE-OAK", "SITE-RIV", "SITE-ELM"],
    dateRangeStart: "2026-07-01", dateRangeEnd: "2026-07-24",
    relatedCount: 4,
    relatedRecordIds: [
      "QUAL-FIRSTAID-STAFF-SIOBHAN",
      "QUAL-FIRSTAID-STAFF-EMMA",
      "QUAL-EPILEPSYMEDS-STAFF-ORLA",
      "QUAL-DYSPHAGIA-STAFF-AISLING",
    ],
    summary: "One or more required qualifications are expired or due soon across all three sites.",
    whyItMatters: "Site-level requirements are the basis for compliance %.",
    suggestedReview: ["Open the Site Requirements matrix per site"],
    suggestedActions: ["Open Workforce Overview"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Workforce risk surfaced from site requirement matrix")],
    trend: "flat",
  },

  // ========== 5. Audit and governance risks ==========
  {
    id: "INS-AUD-001",
    title: "Medication management audit overdue — Oakfield Manor",
    category: "Audit and governance risks",
    type: "Audit",
    confidence: "High",
    site: "Oakfield Manor",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-06-15", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: ["AUD-001", "QUAL-EPILEPSYMEDS-STAFF-ORLA"],
    primarySourceId: "AUD-001",
    summary: "AUD-001 is overdue. Finding references missing medication competency evidence for one staff member.",
    whyItMatters: "Medication is a high-risk workflow and requires current audit assurance.",
    suggestedReview: ["Reassign named owner", "Cross-check competency register"],
    suggestedActions: ["Open the audit"],
    status: "Action Needed",
    assignedOwner: "Daniel Walsh",
    dueDate: "2026-07-31",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Audits register — overdue status")],
    trend: "flat",
  },
  {
    id: "INS-AUD-002",
    title: "Safeguarding audit overdue — Riverside Lodge",
    category: "Audit and governance risks",
    type: "Audit",
    confidence: "High",
    site: "Riverside Lodge",
    relatedSiteIds: ["SITE-RIV"],
    dateRangeStart: "2026-06-15", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: ["AUD-004", eventId("eileen-safeguarding")],
    primarySourceId: "AUD-004",
    summary: `AUD-004 is overdue while a safeguarding-linked event ${eventId("eileen-safeguarding")} is open on the same site.`,
    whyItMatters: "Open safeguarding events without current audit assurance is a red flag.",
    suggestedReview: ["Confirm audit owner", "Align audit closure with event review"],
    suggestedActions: ["Open the audit"],
    status: "Action Needed",
    assignedOwner: "Siobhán Kelly",
    dueDate: "2026-07-31",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Audits register — overdue status")],
    trend: "flat",
  },
  {
    id: "INS-AUD-003",
    title: "Falls / environment audit due soon — Oakfield Manor",
    category: "Audit and governance risks",
    type: "Audit",
    confidence: "Medium",
    site: "Oakfield Manor",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-07-01", dateRangeEnd: "2026-08-15",
    relatedCount: 1,
    relatedRecordIds: ["AUD-002", eventId("paddy-fall-2d"), eventId("paddy-fall-12d"), eventId("paddy-fall-45d"), eventId("paddy-fall-70d")],
    primarySourceId: "AUD-002",
    summary: "AUD-002 is due soon and linked directly to Patrick Murphy's repeat falls pattern.",
    whyItMatters: "Completing this audit will support the care plan draft review.",
    suggestedReview: ["Schedule the walk-round"],
    suggestedActions: ["Open the audit"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Audits register — due soon")],
    trend: "flat",
  },

  // ========== 6. Policy review risks ==========
  {
    id: "INS-POL-001",
    title: "Medication Administration Policy due for review",
    category: "Policy review risks",
    type: "Policy",
    confidence: "High",
    site: "Multiple",
    relatedSiteIds: ["SITE-OAK", "SITE-RIV", "SITE-ELM"],
    dateRangeStart: "2026-06-01", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: ["POL-MED", "AUD-001", "QUAL-EPILEPSYMEDS-STAFF-ORLA"],
    primarySourceId: "POL-MED",
    summary: "POL-MED is flagged 'Due for review'. It governs medication administration and epilepsy medication administration.",
    whyItMatters: "Policy currency underpins related audit and workforce competency evidence.",
    suggestedReview: ["Open the policy detail and confirm review owner"],
    suggestedActions: ["Open Policy Hub"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Policy Hub — due for review")],
    trend: "flat",
  },
  {
    id: "INS-POL-002",
    title: "Care Planning and Review Policy due for review",
    category: "Policy review risks",
    type: "Policy",
    confidence: "High",
    site: "Multiple",
    relatedSiteIds: ["SITE-OAK", "SITE-RIV", "SITE-ELM"],
    dateRangeStart: "2026-06-01", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: ["POL-CAREPLAN"],
    primarySourceId: "POL-CAREPLAN",
    summary: "POL-CAREPLAN is flagged 'Due for review' and governs care planning approvals.",
    whyItMatters: "Care plan governance depends on a current policy baseline.",
    suggestedReview: ["Open the policy detail"],
    suggestedActions: ["Open Policy Hub"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Policy Hub — due for review")],
    trend: "flat",
  },

  // ========== 7. Follow-up and task risks ==========
  {
    id: "INS-TASK-001",
    title: "Overdue safeguarding follow-up task",
    category: "Follow-up and task risks",
    type: "Task",
    confidence: "High",
    site: "Riverside Lodge",
    relatedSiteIds: ["SITE-RIV"],
    dateRangeStart: "2026-07-05", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: ["TASK-3062-A", eventId("eileen-safeguarding")],
    primarySourceId: "TASK-3062-A",
    summary: `TASK-3062-A (safeguarding follow-up review) is overdue against event ${eventId("eileen-safeguarding")}.`,
    whyItMatters: "Overdue safeguarding tasks weaken the closure trail.",
    suggestedReview: ["Reassign or escalate"],
    suggestedActions: ["Open the task"],
    status: "Action Needed",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Tasks register — overdue")],
    trend: "up",
    isNewThisWeek: true,
  },
  {
    id: "INS-TASK-002",
    title: "Open falls-related care plan task — Patrick Murphy",
    category: "Follow-up and task risks",
    type: "Task",
    confidence: "Medium",
    site: "Oakfield Manor",
    resident: "Patrick Murphy",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-07-10", dateRangeEnd: "2026-07-24",
    relatedCount: 2,
    relatedRecordIds: ["TASK-1042-A", "TASK-1042-B", "CP-PS001-V4"],
    primarySourceId: "TASK-1042-A",
    summary: "Two falls-linked tasks (TASK-1042-A, TASK-1042-B) are still open while draft CP-PS001-V4 awaits approval.",
    whyItMatters: "Open tasks and an open draft on the same person compound the falls risk.",
    suggestedReview: ["Confirm owners are in this week"],
    suggestedActions: ["Open the task list"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Tasks + Care Planning linkage")],
    trend: "flat",
  },
  {
    id: "INS-TASK-003",
    title: "Open fluid intake summary task — Mary O'Sullivan",
    category: "Follow-up and task risks",
    type: "Task",
    confidence: "Medium",
    site: "Oakfield Manor",
    resident: "Mary O'Sullivan",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-07-10", dateRangeEnd: "2026-07-24",
    relatedCount: 1,
    relatedRecordIds: ["TASK-2051-A", eventId("mary-nutrition-4d")],
    primarySourceId: "TASK-2051-A",
    summary: `TASK-2051-A (three-day fluid intake summary) is open following event ${eventId("mary-nutrition-4d")}.`,
    whyItMatters: "Completion supports the specialist dietitian review.",
    suggestedReview: ["Confirm progress with the key worker"],
    suggestedActions: ["Open the task"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Tasks + Events linkage")],
    trend: "flat",
  },
  {
    id: "INS-TASK-004",
    title: "Workforce renewal task due soon — Emma Ryan",
    category: "Follow-up and task risks",
    type: "Task",
    confidence: "Medium",
    site: "Oakfield Manor",
    relatedSiteIds: ["SITE-OAK"],
    dateRangeStart: "2026-07-10", dateRangeEnd: "2026-08-15",
    relatedCount: 1,
    relatedRecordIds: ["TASK-WF-001", "QUAL-FIRSTAID-STAFF-EMMA"],
    primarySourceId: "TASK-WF-001",
    summary: "TASK-WF-001 (First Aid renewal) is due soon for Emma Ryan.",
    whyItMatters: "Completion protects Patrick's care team coverage.",
    suggestedReview: ["Confirm booking date"],
    suggestedActions: ["Open the task"],
    status: "New",
    createdAt: NOW, updatedAt: NOW,
    auditTrail: [aiTrail("Surfaced from Tasks register — due soon")],
    trend: "flat",
  },
];

// ---------- UI helpers ----------

export const CATEGORY_ORDER: InsightCategory[] = [
  "Immediate attention",
  "Care plan risks",
  "Event / incident risks",
  "Workforce compliance risks",
  "Audit and governance risks",
  "Policy review risks",
  "Follow-up and task risks",
];

export const statusBadgeClasses: Record<InsightStatus, string> = {
  "New": "bg-blue-50 text-blue-700 border-blue-200",
  "Under Review": "bg-violet-50 text-violet-700 border-violet-200",
  "Action Needed": "bg-orange-50 text-orange-700 border-orange-200",
  "Confirmed": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Dismissed": "bg-muted text-muted-foreground border-border",
};

export const confidenceClasses: Record<Confidence, string> = {
  "Low": "bg-muted text-muted-foreground border-border",
  "Medium": "bg-amber-50 text-amber-700 border-amber-200",
  "High": "bg-primary/10 text-primary border-primary/20",
};
