/**
 * Connected demo scenario — the one source for demo events and the records
 * that hang off them (event workspace detail, linked care-plan impact,
 * review suggestions, notifications, assessments and lifecycle movements).
 *
 * People, sites and staff live in demoDataRegistry.ts; everything here
 * references them by id. Dates are relative to today with fixed offsets and
 * every value is fixed, so a reset always produces the same dataset.
 */
import {
  PERSON_BY_ID, SITE_BY_ID, STAFF_BY_ID,
  type PersonSupportedId, type SiteId, type StaffId,
} from "./demoDataRegistry";
import type { IncidentCategory, CarePlanImpactStatus, IncidentStatus, ReviewStage } from "./associatedIncidentsStore";
import type { PrimaryCategory, LifecycleStatus, RegulatoryNotificationRecord } from "./incidentGovernance";

// ---------------------------------------------------------------- version + reset

/** Bump when the dataset changes; stored demo data from an older version is reseeded. */
export const DEMO_DATA_VERSION = "2026.10-homecare-1";
const VERSION_KEY = "logup.demoDataVersion";
const DEMO_KEY_PREFIX = "logup.";

/** Clears every stored LogUp demo record (role/session and settings are kept). */
export function clearDemoStorage() {
  if (typeof window === "undefined") return;
  const keep = new Set(["logup.role.v1", "logup.role", "logup.orgSettings.v1", "logup.featureFlags", VERSION_KEY]);
  const ls = window.localStorage;
  const keys: string[] = [];
  for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(DEMO_KEY_PREFIX) && !keep.has(k) && !/role|session|orgSettings/i.test(k)) keys.push(k); }
  keys.forEach((k) => ls.removeItem(k));
}

/** Runs before any store loads: reseeds stored data saved by an older dataset version. */
export function ensureDemoDataVersion() {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(VERSION_KEY) !== DEMO_DATA_VERSION) {
      clearDemoStorage();
      window.localStorage.setItem(VERSION_KEY, DEMO_DATA_VERSION);
    }
  } catch { /* ignore */ }
}

/** Admin "Reset demo data": clear stored records and reload so every store reseeds. */
export function resetDemoData() {
  clearDemoStorage();
  try { window.localStorage.setItem(VERSION_KEY, DEMO_DATA_VERSION); } catch { /* ignore */ }
  window.location.reload();
}

// ---------------------------------------------------------------- date helpers

export const DEMO_YEAR = new Date().getFullYear();
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Date n days before today at hh:mm local time. */
export function daysAgo(n: number, hh = 10, mm = 0): Date {
  const d = new Date(); d.setHours(hh, mm, 0, 0); d.setDate(d.getDate() - n); return d;
}
export const daysFromNow = (n: number, hh = 10, mm = 0) => daysAgo(-n, hh, mm);

/** Moves n working days (Mon–Fri) from a date; negative goes back. */
export function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(from); const step = n < 0 ? -1 : 1; let left = Math.abs(n);
  while (left > 0) { d.setDate(d.getDate() + step); const w = d.getDay(); if (w !== 0 && w !== 6) left--; }
  return d;
}
export const workingDaysAgo = (n: number, hh = 10, mm = 0) => { const d = addWorkingDays(daysAgo(0, hh, mm), -n); return d; };

const pad = (n: number) => String(n).padStart(2, "0");
export const fmtDate = (d: Date) => `${pad(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`;
export const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtBoard = (d: Date) => `${pad(d.getDate())} ${MON[d.getMonth()]} · ${fmtTime(d)}`;
export const fmtStamp = (d: Date) => `${fmtDate(d)} · ${fmtTime(d)}`;
const plusMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

// ---------------------------------------------------------------- event specs

export type Column = "new" | "review" | "actions" | "complete";

export interface ScenarioAction { action: string; ownerStaffId: StaffId; due: Date; done: boolean; priority?: "High" | "Medium" | "Low" }

export interface ScenarioNotification {
  formCode: string; formTitle: string;
  outcome: NonNullable<RegulatoryNotificationRecord["outcome"]>;
  dueAt?: Date; submittedAt?: Date; reference?: string; quarter?: string;
}

export interface ScenarioEvent {
  key: string;
  siteId: SiteId;
  serviceUserId?: PersonSupportedId;
  category: string;               // record / board category
  primaryCategory: PrimaryCategory;
  linkCategory: IncidentCategory; // care-plan link category
  incidentType: string;
  at: Date;
  location: string;
  severity: "Low" | "Moderate" | "High" | "Critical";
  column: Column;
  reporterStaffId: StaffId;
  reviewerStaffId?: StaffId;
  summary: string;
  narrative: string;
  immediateAction: string;
  injury?: string;
  actions: ScenarioAction[];
  notification?: ScenarioNotification;
  careImpact?: CarePlanImpactStatus;
  impactReason?: string;
  sections?: string[];
  draftVersion?: number;
  restricted?: boolean;
  featured?: boolean;
}

const quarterLabel = (d: Date) => `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;

// Featured event times (fixed offsets).
const T = {
  paddy70: daysAgo(70, 6, 40), paddy45: daysAgo(45, 21, 15), paddy12: daysAgo(12, 7, 5), paddy2: daysAgo(2, 22, 30),
  mary20: daysAgo(20, 13, 10), mary4: daysAgo(4, 12, 50),
  eileen: workingDaysAgo(2, 15, 20), tomas: daysAgo(15, 9, 30), bridget: daysAgo(9, 8, 15),
  michael: workingDaysAgo(1, 16, 45), fire: daysAgo(6, 11, 5), john: daysAgo(1, 14, 10),
};

const FEATURED: ScenarioEvent[] = [
  {
    key: "paddy-fall-70d", featured: true, siteId: "SITE-ECK", serviceUserId: "PS-001", category: "Fall", primaryCategory: "Fall", linkCategory: "Falls", incidentType: "Fall",
    at: T.paddy70, location: "Bedroom", severity: "Low", column: "complete", reporterStaffId: "STAFF-LIAM", reviewerStaffId: "STAFF-DANIEL",
    summary: "Paddy found sitting on the floor beside his bed early morning; no injury.",
    narrative: "Paddy was found sitting on the floor beside his bed at the start of the morning round. He said he slid off the edge while reaching for his slippers. He was alert and reported no pain.",
    immediateAction: "Checked for injury, observations recorded, assisted back to bed with two staff using the hoist.",
    injury: "No injury found.",
    actions: [{ action: "Move slippers within reach at night", ownerStaffId: "STAFF-EMMA", due: daysAgo(68), done: true }],
    careImpact: "no_review_required", impactReason: "Current falls plan already covers night-time supports; slippers moved within reach.",
  },
  {
    key: "paddy-fall-45d", featured: true, siteId: "SITE-ECK", serviceUserId: "PS-001", category: "Fall", primaryCategory: "Fall", linkCategory: "Falls", incidentType: "Fall",
    at: T.paddy45, location: "Bathroom", severity: "Low", column: "complete", reporterStaffId: "STAFF-PEADAR", reviewerStaffId: "STAFF-DANIEL",
    summary: "Paddy lost balance in the en-suite and was lowered to the floor by staff.",
    narrative: "While Paddy was standing at the sink, he lost his balance. The staff member with him lowered him gently to the floor. No knock to the head.",
    immediateAction: "Observations recorded, assisted up with two staff, family informed next morning.",
    injury: "No injury found.",
    actions: [{ action: "Check grab rail position in en-suite", ownerStaffId: "STAFF-DANIEL", due: daysAgo(40), done: true }],
    careImpact: "no_review_required", impactReason: "Assisted lowering, no injury; existing plan followed correctly.",
  },
  {
    key: "paddy-fall-12d", featured: true, siteId: "SITE-ECK", serviceUserId: "PS-001", category: "Fall", primaryCategory: "Fall", linkCategory: "Falls", incidentType: "Fall",
    at: T.paddy12, location: "Corridor", severity: "High", column: "complete", reporterStaffId: "STAFF-EMMA", reviewerStaffId: "STAFF-DANIEL",
    summary: "Paddy fell in the corridor and was transferred to hospital with a suspected hip fracture.",
    narrative: "Paddy was walking to breakfast with his frame when he fell in the corridor outside the day room. He reported severe pain in his left hip and could not bear weight.",
    immediateAction: "Not moved; ambulance called; GP and daughter informed; transferred to Naas General Hospital.",
    injury: "Left hip fracture confirmed at hospital.",
    actions: [
      { action: "Arrange physiotherapy review on return", ownerStaffId: "STAFF-DANIEL", due: daysAgo(5), done: true },
      { action: "Update falls and mobility sections of the care plan", ownerStaffId: "STAFF-EMMA", due: daysAgo(4), done: true },
    ],
    notification: { formCode: "NF03", formTitle: "Serious injury requiring medical or hospital treatment", outcome: "exported", submittedAt: daysAgo(11, 15, 0), reference: "NF03-OAK-0412" },
    careImpact: "care_plan_updated", sections: ["fallsRisk", "mobility"], draftVersion: 3,
  },
  {
    key: "paddy-fall-2d", featured: true, siteId: "SITE-ECK", serviceUserId: "PS-001", category: "Fall", primaryCategory: "Fall", linkCategory: "Falls", incidentType: "Fall",
    at: T.paddy2, location: "Bedroom", severity: "Moderate", column: "review", reporterStaffId: "STAFF-KEVIN", reviewerStaffId: "STAFF-DANIEL",
    summary: "Paddy found on his bedroom floor at night; bruising to right forearm.",
    narrative: "During the night check Paddy was found on the floor beside his chair. He said he tried to walk to the bathroom without his frame. Bruise on his right forearm.",
    immediateAction: "Observations recorded, assisted up with hoist, sensor mat checked and switched back on.",
    injury: "Bruise to right forearm.",
    actions: [{ action: "Check sensor mat alerts are reaching night staff", ownerStaffId: "STAFF-DANIEL", due: daysFromNow(3), done: false }],
    careImpact: "review_suggested", sections: ["fallsRisk", "mobility"],
  },
  {
    key: "mary-nutrition-20d", featured: true, siteId: "SITE-ECK", serviceUserId: "PS-002", category: "Nutrition / Hydration", primaryCategory: "Other", linkCategory: "Nutrition / hydration", incidentType: "Other",
    at: T.mary20, location: "Dining room", severity: "Low", column: "complete", reporterStaffId: "STAFF-AISLING", reviewerStaffId: "STAFF-DANIEL",
    summary: "Mary ate less than a quarter of meals for two days; weight recorded.",
    narrative: "Mary ate less than a quarter of her lunch and dinner for two days running. She said food had no taste. Weight recorded as 1.2 kg down on last month.",
    immediateAction: "Food and fluid chart started, preferred snacks offered, GP informed.",
    actions: [{ action: "Start food and fluid chart for 7 days", ownerStaffId: "STAFF-AISLING", due: daysAgo(13), done: true }],
    careImpact: "no_review_required", impactReason: "Monitoring started under the existing nutrition plan; review if intake stays low.",
  },
  {
    key: "mary-nutrition-4d", featured: true, siteId: "SITE-ECK", serviceUserId: "PS-002", category: "Nutrition / Hydration", primaryCategory: "Other", linkCategory: "Nutrition / hydration", incidentType: "Other",
    at: T.mary4, location: "Dining room", severity: "Moderate", column: "review", reporterStaffId: "STAFF-GRAINNE", reviewerStaffId: "STAFF-DANIEL",
    summary: "Mary's intake low again; further 1 kg weight loss.",
    narrative: "Mary's food and fluid chart shows low intake on four of the last seven days. Weight down a further 1 kg. She said she feels full quickly.",
    immediateAction: "Dietitian referral requested, fortified drinks offered between meals.",
    actions: [{ action: "Request dietitian review", ownerStaffId: "STAFF-DANIEL", due: daysFromNow(2), done: false }],
    careImpact: "review_suggested", sections: ["nutrition"],
  },
  {
    key: "eileen-safeguarding", featured: true, siteId: "SITE-WWD", serviceUserId: "PS-004", category: "Safeguarding", primaryCategory: "Safeguarding", linkCategory: "Safeguarding", incidentType: "Suspected abuse / neglect",
    at: T.eileen, location: "Lounge", severity: "High", column: "review", reporterStaffId: "STAFF-FIONA", reviewerStaffId: "STAFF-SIOBHAN", restricted: true,
    summary: "Eileen disclosed that a visitor took money from her purse.",
    narrative: "Eileen told a staff member that a visitor took money from her purse during a visit on Sunday. She was upset but calm when talking about it.",
    immediateAction: "Disclosure recorded in Eileen's words, person in charge informed, safeguarding plan started.",
    actions: [{ action: "Complete preliminary screening", ownerStaffId: "STAFF-SIOBHAN", due: daysFromNow(2), done: false, priority: "High" }],
    notification: { formCode: "NF06", formTitle: "Allegation, suspected or confirmed abuse", outcome: "likely_notifiable", dueAt: addWorkingDays(T.eileen, 3) },
    careImpact: "review_required", sections: ["safeguarding"],
  },
  {
    key: "tomas-pressure-ulcer", featured: true, siteId: "SITE-WWD", serviceUserId: "PS-005", category: "Skin integrity", primaryCategory: "Injury", linkCategory: "Pressure ulcer / skin integrity", incidentType: "Skin integrity",
    at: T.tomas, location: "Bedroom", severity: "High", column: "actions", reporterStaffId: "STAFF-MAEVE", reviewerStaffId: "STAFF-SIOBHAN",
    summary: "Category 3 pressure ulcer found on Tomás's sacrum.",
    narrative: "During personal care a category 3 pressure ulcer was found on Tomás's sacrum. He had been spending more time in bed over the previous week.",
    immediateAction: "Wound photographed and dressed, repositioning every two hours started, pressure-relieving mattress ordered.",
    injury: "Category 3 pressure ulcer, sacrum.",
    actions: [
      { action: "Tissue viability nurse review", ownerStaffId: "STAFF-FIONA", due: daysFromNow(4), done: false, priority: "High" },
      { action: "Confirm pressure-relieving mattress in use", ownerStaffId: "STAFF-SIOBHAN", due: daysAgo(12), done: true },
    ],
    careImpact: "draft_awaiting_approval", sections: ["health", "personalCare"], draftVersion: 2,
  },
  {
    key: "bridget-medication", featured: true, siteId: "SITE-WWD", serviceUserId: "PS-006", category: "Restrictive practice", primaryCategory: "Restrictive Practice", linkCategory: "Restrictive practice / restraint", incidentType: "Restrictive practice",
    at: T.bridget, location: "Kitchen", severity: "Moderate", column: "actions", reporterStaffId: "STAFF-CONOR", reviewerStaffId: "STAFF-CLAIRE",
    summary: "Kitchen door locked for a period while Bridget was nearby, without a recorded restrictive practice plan.",
    narrative: "The kitchen door was locked for about two hours during the morning while Bridget was in the area. There is no restrictive practice plan in place for this. Bridget asked staff why she could not get in. No harm observed.",
    immediateAction: "Door unlocked, Bridget supported to make her tea, PIC informed, family informed.",
    actions: [
      { action: "Review use of kitchen door lock with the team", ownerStaffId: "STAFF-CLAIRE", due: daysAgo(2), done: false, priority: "High" },
      { action: "Discuss with staff at team meeting", ownerStaffId: "STAFF-CLAIRE", due: daysFromNow(6), done: false },
    ],
    notification: { formCode: "NF39A", formTitle: "Quarterly report (restrictive practice)", outcome: "quarterly", quarter: quarterLabel(T.bridget) },
    careImpact: "review_required", sections: ["medication"],
  },
  {
    key: "michael-seizure-fall", featured: true, siteId: "SITE-WWD", serviceUserId: "PS-007", category: "Fall", primaryCategory: "Fall", linkCategory: "Falls", incidentType: "Fall",
    at: T.michael, location: "Garden", severity: "Moderate", column: "review", reporterStaffId: "STAFF-AINE", reviewerStaffId: "STAFF-CLAIRE",
    summary: "Michael had a seizure in the garden and fell; cut to his chin needing stitches.",
    narrative: "Michael had a tonic-clonic seizure while walking in the garden and fell onto the path. Seizure lasted about two minutes. He had a cut to his chin.",
    immediateAction: "Seizure timed, recovery position, first aid to chin, taken to GP out-of-hours for stitches.",
    injury: "Cut to chin, three stitches.",
    actions: [{ action: "Review garden supervision during walks", ownerStaffId: "STAFF-CLAIRE", due: daysFromNow(5), done: false }],
    notification: { formCode: "NF03", formTitle: "Serious injury requiring medical or hospital treatment", outcome: "likely_notifiable", dueAt: addWorkingDays(T.michael, 3) },
    careImpact: "review_suggested", sections: ["mobility", "fallsRisk"],
  },
  {
    key: "riv-fire-alarm", featured: true, siteId: "SITE-WWD", category: "Fire alarm / environmental", primaryCategory: "Other", linkCategory: "Fire alarm / environmental", incidentType: "Other",
    at: T.fire, location: "Kitchen", severity: "Low", column: "complete", reporterStaffId: "STAFF-DARRAGH", reviewerStaffId: "STAFF-SIOBHAN",
    summary: "Fire alarm activated by kitchen toaster; building cleared, no fire.",
    narrative: "The fire alarm went off at 11:05 after a toaster in the kitchen produced smoke. The building was cleared in four minutes. No fire and no one was hurt.",
    immediateAction: "Evacuation completed, alarm reset by the fire panel engineer, toaster removed.",
    actions: [{ action: "Record on quarterly return", ownerStaffId: "STAFF-SIOBHAN", due: daysAgo(3), done: true }],
    notification: { formCode: "NF39", formTitle: "Quarterly report (fire alarm activations)", outcome: "quarterly", quarter: quarterLabel(T.fire) },
  },
  {
    key: "oak-corridor-unlinked", featured: true, siteId: "SITE-ECK", category: "Behavioural", primaryCategory: "Behavioural", linkCategory: "Other", incidentType: "Behavioural",
    at: T.john, location: "Corridor", severity: "Low", column: "new", reporterStaffId: "STAFF-ROISIN",
    summary: "Raised voices between two residents in the first-floor corridor.",
    narrative: "John and another resident raised their voices at each other in the first-floor corridor over a chair. Staff stepped in and both settled within a few minutes. No contact.",
    immediateAction: "Staff separated them calmly and offered tea in the day room.",
    actions: [],
  },
];

// Background events: one per resident, so no same-category repeats within 30 days.
type Bg = [key: string, id: PersonSupportedId, cat: "fall" | "med" | "skin" | "behaviour" | "nutrition" | "infection", days: number, sev: ScenarioEvent["severity"], column: Column, reporter: StaffId, impact: CarePlanImpactStatus, summary: string];
const BG: Bg[] = [
  ["bg-01", "PS-008", "fall", 84, "Low", "complete", "STAFF-GRAINNE", "no_review_required", "Kitty slipped from her chair onto the floor; no injury."],
  ["bg-02", "PS-012", "med", 79, "Low", "complete", "STAFF-SINEAD", "no_review_required", "Evening paracetamol signed for but not given; GP advised no harm."],
  ["bg-03", "PS-045", "behaviour", 76, "Low", "complete", "STAFF-FIONA", "no_review_required", "Hannah became distressed at teatime; settled with reassurance."],
  ["bg-04", "PS-016", "skin", 71, "Moderate", "complete", "STAFF-ROISIN", "care_plan_updated", "Category 2 pressure area noted on Francis's heel."],
  ["bg-05", "PS-020", "fall", 66, "Low", "complete", "STAFF-KEVIN", "no_review_required", "Jim found sitting on bathroom floor; no injury."],
  ["bg-06", "PS-049", "nutrition", 63, "Low", "complete", "STAFF-MAEVE", "no_review_required", "Nellie refused meals for one day; ate well the next day."],
  ["bg-07", "PS-024", "infection", 58, "Moderate", "complete", "STAFF-SINEAD", "no_review_required", "Agnes developed a urinary tract infection; antibiotics started."],
  ["bg-08", "PS-063", "behaviour", 55, "Low", "complete", "STAFF-CONOR", "no_review_required", "Darren upset when his routine changed; settled with his visual schedule."],
  ["bg-09", "PS-028", "fall", 50, "Moderate", "complete", "STAFF-PEADAR", "care_plan_updated", "Des fell in the garden; graze to his knee."],
  ["bg-10", "PS-053", "med", 47, "Low", "complete", "STAFF-DARRAGH", "no_review_required", "Julia's eye drops missed at lunchtime; given when noticed."],
  ["bg-11", "PS-032", "skin", 41, "Low", "complete", "STAFF-GRAINNE", "no_review_required", "Skin tear on Larry's forearm during transfer."],
  ["bg-12", "PS-057", "fall", 37, "Low", "complete", "STAFF-FIONA", "no_review_required", "Dolly lowered to the floor by staff after legs gave way."],
  ["bg-13", "PS-036", "behaviour", 33, "Low", "complete", "STAFF-ROISIN", "no_review_required", "Noel shouted at staff during personal care; calmed when given time."],
  ["bg-14", "PS-040", "nutrition", 28, "Low", "complete", "STAFF-KEVIN", "no_review_required", "Con coughing at meals; speech and language referral made."],
  ["bg-15", "PS-061", "infection", 24, "Low", "complete", "STAFF-MAEVE", "no_review_required", "Esther had diarrhoea for 24 hours; isolated as a precaution."],
  ["bg-16", "PS-014", "fall", 21, "Low", "complete", "STAFF-SINEAD", "no_review_required", "Denis tripped on a rug in the lounge; no injury."],
  ["bg-17", "PS-064", "med", 17, "Low", "complete", "STAFF-AINE", "no_review_required", "Louise's evening medication given 45 minutes late."],
  ["bg-18", "PS-043", "skin", 13, "Moderate", "actions", "STAFF-PEADAR", "review_suggested", "Category 2 pressure area on Dermot's sacrum."],
  ["bg-19", "PS-058", "behaviour", 8, "Low", "complete", "STAFF-DARRAGH", "no_review_required", "Timmy wandered into another resident's room; redirected calmly."],
  ["bg-20", "PS-026", "fall", 5, "Low", "review", "STAFF-GRAINNE", "review_suggested", "Sheila found on the floor beside her bed; no injury."],
];

const BG_CAT: Record<Bg[2], Pick<ScenarioEvent, "category" | "primaryCategory" | "linkCategory" | "incidentType" | "location"> & { sections: string[] }> = {
  fall: { category: "Fall", primaryCategory: "Fall", linkCategory: "Falls", incidentType: "Fall", location: "Bedroom", sections: ["fallsRisk"] },
  med: { category: "Medication", primaryCategory: "Medication", linkCategory: "Medication", incidentType: "Medication error", location: "Medication room", sections: ["medication"] },
  skin: { category: "Skin integrity", primaryCategory: "Injury", linkCategory: "Pressure ulcer / skin integrity", incidentType: "Skin integrity", location: "Bedroom", sections: ["health"] },
  behaviour: { category: "Behavioural", primaryCategory: "Behavioural", linkCategory: "Other", incidentType: "Behavioural", location: "Lounge", sections: ["communication"] },
  nutrition: { category: "Nutrition / Hydration", primaryCategory: "Other", linkCategory: "Nutrition / hydration", incidentType: "Other", location: "Dining room", sections: ["nutrition"] },
  infection: { category: "Infection", primaryCategory: "Infection Prevention", linkCategory: "Other", incidentType: "Other", location: "Bedroom", sections: ["personalCare"] },
};

const BACKGROUND: ScenarioEvent[] = BG.map(([key, id, cat, days, severity, column, reporter, impact, summary], i) => {
  const p = PERSON_BY_ID[id];
  const c = BG_CAT[cat];
  const at = daysAgo(days, 8 + (i % 12), (i * 7) % 60);
  const site = p.siteId;
  const reviewer: StaffId = site === "SITE-ECK" ? "STAFF-DANIEL" : site === "SITE-WWD" ? "STAFF-SIOBHAN" : "STAFF-CLAIRE";
  const open = column !== "complete";
  return {
    key, siteId: site, serviceUserId: id, ...c, at, severity, column, reporterStaffId: reporter, reviewerStaffId: reviewer, summary,
    narrative: `${summary} Staff responded straight away and recorded what they saw.`,
    immediateAction: "Checked for injury or harm, observations recorded, next of kin informed.",
    actions: [{ action: open ? "Review supports with key worker" : "Follow-up check completed", ownerStaffId: reviewer, due: open ? daysFromNow(4 + (i % 3)) : daysAgo(Math.max(days - 3, 1)), done: !open }],
    careImpact: impact,
    impactReason: impact === "no_review_required" ? "Existing care plan supports were followed; no change needed." : undefined,
    sections: impact === "no_review_required" ? undefined : c.sections,
  };
});

/** All scenario events, oldest first, numbered INC-<year>-<nnn> in date order. */
export const SCENARIO_EVENTS: (ScenarioEvent & { id: string })[] = [...FEATURED, ...BACKGROUND]
  .sort((a, b) => a.at.getTime() - b.at.getTime())
  .map((e, i) => ({ ...e, id: `INC-${DEMO_YEAR}-${String(i + 1).padStart(3, "0")}` }));

const BY_KEY = new Map(SCENARIO_EVENTS.map((e) => [e.key, e]));
/** Stable event id for a scenario key, e.g. eventId("paddy-fall-2d"). */
export function eventId(key: string): string { return BY_KEY.get(key)?.id ?? key; }
export function scenarioEvent(key: string) { return BY_KEY.get(key); }
/** Next free event number for newly logged events. */
export const NEXT_EVENT_NUMBER = SCENARIO_EVENTS.length + 1;

// ---------------------------------------------------------------- projections

const staffName = (id?: StaffId) => (id ? STAFF_BY_ID[id]?.name ?? "" : "");
const staffTitle = (id?: StaffId) => (id ? STAFF_BY_ID[id]?.roleLabel ?? "" : "");
const residentName = (id?: PersonSupportedId) => (id ? PERSON_BY_ID[id]?.name ?? "" : "No service user linked");

const RECORD_STATUS: Record<Column, string> = { new: "New Event", review: "Under Review", actions: "Actions Required", complete: "Closed" };
const LIFECYCLE: Record<Column, LifecycleStatus> = { new: "Submitted", review: "Under Review", actions: "Actions In Progress", complete: "Closed" };
const LINK_STATUS: Record<Column, IncidentStatus> = { new: "New event", review: "Under review", actions: "Actions required", complete: "Completed" };
const LINK_STAGE: Record<Column, ReviewStage> = { new: "Awaiting triage", review: "Investigation", actions: "Actions in progress", complete: "Closed" };

function regulatory(e: ScenarioEvent): RegulatoryNotificationRecord | undefined {
  const n = e.notification;
  if (!n) return undefined;
  return {
    required: n.outcome !== "not_required", authority: "HIQA",
    formCode: n.formCode, formTitle: n.formTitle, outcome: n.outcome,
    dueAt: n.dueAt?.toISOString(), quarter: n.quarter,
    submittedAt: n.submittedAt?.toISOString(), reference: n.reference,
    notes: n.outcome === "likely_notifiable" ? `LogUp suggestion: likely notifiable (${n.formCode}). A person decides.` :
      n.outcome === "quarterly" ? `Included on the ${n.quarter} quarterly return.` :
      n.outcome === "exported" ? `${n.formCode} prepared and exported for the HIQA portal.` : undefined,
  };
}

/** Projection used by incidentRecords (Reporting, Insights, deep links). */
export function toIncidentRecord(e: ScenarioEvent & { id: string }) {
  const reviewed = e.column !== "new" && e.reviewerStaffId;
  return {
    id: e.id, summary: e.summary, site: SITE_BY_ID[e.siteId].name, location: e.location,
    resident: residentName(e.serviceUserId), ...(e.serviceUserId ? { serviceUserId: e.serviceUserId } : {}),
    severity: e.severity, category: e.category, primaryCategory: e.primaryCategory,
    lifecycleStatus: LIFECYCLE[e.column],
    date: fmtDate(e.at), dateObj: e.at,
    submittedBy: staffName(e.reporterStaffId), reviewedBy: reviewed ? staffName(e.reviewerStaffId) : "Pending",
    status: RECORD_STATUS[e.column],
    chronology: [
      { time: fmtTime(e.at), event: e.narrative.split(". ")[0] },
      { time: fmtTime(plusMinutes(e.at, 5)), event: e.immediateAction },
      { time: fmtTime(plusMinutes(e.at, 25)), event: "Event submitted in LogUp" },
    ],
    people: [
      ...(e.serviceUserId ? [{ role: "Person Supported", name: residentName(e.serviceUserId), title: "" }] : []),
      { role: "Submitted by", name: staffName(e.reporterStaffId), title: staffTitle(e.reporterStaffId) },
      { role: "Reviewed by", name: reviewed ? staffName(e.reviewerStaffId) : "Pending", title: reviewed ? staffTitle(e.reviewerStaffId) : "Awaiting PIC review" },
    ],
    actions: e.actions.map((a) => ({ action: a.action, owner: staffName(a.ownerStaffId), due: fmtDate(a.due), done: a.done, ...(a.priority ? { priority: a.priority } : {}) })),
    attachments: [],
    ...(regulatory(e) ? { regulatoryNotification: regulatory(e) } : {}),
  };
}

/** Projection used by the Events board. */
export function toBoardCard(e: ScenarioEvent & { id: string }) {
  const reviewer = e.column !== "new" ? staffName(e.reviewerStaffId) : undefined;
  return {
    id: e.id, resident: residentName(e.serviceUserId), ...(e.serviceUserId ? { serviceUserId: e.serviceUserId } : {}),
    category: e.category, primaryCategory: e.primaryCategory, severity: e.severity, initialSeverity: e.severity,
    site: SITE_BY_ID[e.siteId].name, location: e.location, dateTime: fmtBoard(e.at), column: e.column,
    summary: e.summary, owner: reviewer, lifecycleStatus: LIFECYCLE[e.column],
    ...(regulatory(e) ? { regulatoryNotification: regulatory(e) } : {}),
    ...(e.restricted ? { visibility: "manager_only" as const } : {}),
    overdue: e.actions.some((a) => !a.done && a.due.getTime() < Date.now()),
    actions: e.actions.map((a, i) => ({
      id: `${e.id}-A${i + 1}`, title: a.action, assignee: staffName(a.ownerStaffId), due: a.due.toISOString().slice(0, 10),
      status: a.done ? "Complete" as const : a.due.getTime() < Date.now() ? "Overdue" as const : "Open" as const,
      createdBy: staffName(e.reviewerStaffId ?? e.reporterStaffId), createdAt: fmtBoard(plusMinutes(e.at, 60)),
      ...(a.done ? { completedBy: staffName(a.ownerStaffId), completedAt: fmtBoard(a.due) } : {}),
    })),
    timeline: [
      { id: "t1", ts: fmtBoard(plusMinutes(e.at, 20)), who: staffName(e.reporterStaffId), what: "Event submitted" },
      ...(reviewer ? [{ id: "t2", ts: fmtBoard(plusMinutes(e.at, 180)), who: reviewer, what: "Review started" }] : []),
      ...(e.column === "complete" ? [{ id: "t3", ts: fmtBoard(plusMinutes(e.at, 60 * 24 * 3)), who: reviewer ?? "", what: "Event closed" }] : []),
    ],
  };
}

/** Projection used by the event detail modal (incidentWorkspaceStore). */
export function toEnrichment(e: ScenarioEvent & { id: string }) {
  const n = e.notification;
  return {
    personSupported: residentName(e.serviceUserId), site: SITE_BY_ID[e.siteId].name, location: e.location,
    category: e.category, status: RECORD_STATUS[e.column], severity: e.severity, reviewStage: LINK_STAGE[e.column],
    narrative: e.narrative, immediateAction: e.immediateAction, injury: e.injury ?? "No injury recorded.",
    peopleInvolved: [residentName(e.serviceUserId), staffName(e.reporterStaffId)].filter((x) => x && x !== "No service user linked"),
    witnesses: [staffName(e.reporterStaffId)],
    notifications: {
      family: e.serviceUserId ? `Informed ${fmtStamp(plusMinutes(e.at, 90))}` : "Not applicable",
      gp: e.serviceUserId ? `Informed ${fmtStamp(plusMinutes(e.at, 60))}` : "Not applicable",
      hiqa: n ? (n.outcome === "exported" ? `${n.formCode} exported ${fmtStamp(n.submittedAt!)}` : n.outcome === "quarterly" ? `Quarterly return (${n.quarter})` : `${n.formCode} likely notifiable — due ${fmtStamp(n.dueAt!)}`) : "Not required",
    },
    ...(e.column !== "new" && e.reviewerStaffId ? { managerReview: {
      reviewer: staffName(e.reviewerStaffId), reviewerTitle: staffTitle(e.reviewerStaffId), reviewedAt: fmtStamp(plusMinutes(e.at, 180)),
      summary: e.column === "complete" ? "Review complete; actions finished." : "Review in progress.",
    } } : {}),
    sourceEvidence: { originalNarrative: e.narrative, aiSummary: e.summary, submittedBy: staffName(e.reporterStaffId), submittedAt: fmtStamp(plusMinutes(e.at, 20)), captureMethod: "Guided prompts" as const },
    ...(e.serviceUserId && e.careImpact ? { carePlanRef: { planId: `CP-${e.serviceUserId}`, personId: e.serviceUserId, sections: e.sections ?? [], impact: e.careImpact } } : {}),
    auditSeed: [
      { at: fmtStamp(plusMinutes(e.at, 20)), action: "Event submitted", actor: staffName(e.reporterStaffId), role: "Frontline" },
      ...(e.column !== "new" && e.reviewerStaffId ? [{ at: fmtStamp(plusMinutes(e.at, 180)), action: "Status changed", actor: staffName(e.reviewerStaffId), role: "Manager / PIC", prev: "New Event", next: "Under Review" }] : []),
    ],
  };
}

/** Care-plan link (associatedIncidentsStore) — references the event by id only. */
export function toAssociatedIncident(e: ScenarioEvent & { id: string }) {
  if (!e.serviceUserId) return undefined;
  const p = PERSON_BY_ID[e.serviceUserId];
  return {
    incidentId: e.id, personId: e.serviceUserId, organisationId: "ORG-001", siteId: p.siteId,
    eventType: e.category, category: e.linkCategory, subtype: e.summary, occurredAt: e.at.toISOString(),
    site: SITE_BY_ID[p.siteId].name, severity: e.severity, status: LINK_STATUS[e.column], reviewStage: LINK_STAGE[e.column],
    assignedReviewer: staffName(e.reviewerStaffId) || undefined,
    openActions: e.actions.filter((a) => !a.done).length,
    notificationFormSuggested: !!e.notification && e.notification.outcome !== "not_required",
    careImpact: e.careImpact ?? "not_checked",
    ...(e.sections ? { linkedSections: e.sections } : {}),
    ...(e.impactReason ? { impactReason: e.impactReason } : {}),
    ...(e.careImpact && e.careImpact !== "not_checked" && e.careImpact !== "review_suggested" ? { impactCheckedBy: staffName(e.reviewerStaffId), impactCheckedAt: plusMinutes(e.at, 240).toISOString() } : {}),
    ...(e.draftVersion ? { linkedDraftVersion: e.draftVersion } : {}),
  };
}

// ---------------------------------------------------------------- lifecycle movements

export interface ScenarioLifecycle { id: string; serviceUserId: PersonSupportedId; type: "temporary_absence" | "returned"; date: string; siteId: SiteId; recordedByStaffId: StaffId; note: string }

export const SCENARIO_LIFECYCLE: ScenarioLifecycle[] = [
  { id: "LCE-PS-001-ABS", serviceUserId: "PS-001", type: "temporary_absence", date: fmtIso(daysAgo(12, 7, 40)), siteId: "SITE-ECK", recordedByStaffId: "STAFF-DANIEL", note: "Hospital admission — Naas General Hospital (left hip fracture)." },
  { id: "LCE-PS-001-RET", serviceUserId: "PS-001", type: "returned", date: fmtIso(daysAgo(7, 14, 0)), siteId: "SITE-ECK", recordedByStaffId: "STAFF-DANIEL", note: "Returned from Naas General Hospital." },
  { id: "LCE-PS-005-ABS", serviceUserId: "PS-005", type: "temporary_absence", date: fmtIso(daysAgo(3, 11, 0)), siteId: "SITE-WWD", recordedByStaffId: "STAFF-SIOBHAN", note: `Hospital admission — St Luke’s General Hospital, Kilkenny. Expected back ${fmtDate(daysFromNow(4))}.` },
];
function fmtIso(d: Date) { return d.toISOString().slice(0, 10); }

// ---------------------------------------------------------------- care plan timing

/**
 * Published plan timing per resident: number of versions and days since the
 * current version was published. Review is due 6 months (older persons) or
 * 12 months (disability) after publishing; exactly three plans are overdue
 * (two at Oakfield, one at Riverside).
 */
export const OVERDUE_PLAN_IDS: PersonSupportedId[] = ["PS-011", "PS-030", "PS-050"];
export function planTiming(id: PersonSupportedId, index: number): { versions: number; publishedDaysAgo: number } {
  if (OVERDUE_PLAN_IDS.includes(id)) return { versions: 2 + (index % 2), publishedDaysAgo: id === "PS-050" ? 200 : 190 + index % 7 };
  const p = PERSON_BY_ID[id];
  const admittedDays = Math.round((Date.now() - new Date(p.admissionDate).getTime()) / 86400000);
  const window = p.siteId === "SITE-WWD" ? 330 : 160;
  return { versions: 1 + (index % 4), publishedDaysAgo: Math.max(1, Math.min(admittedDays - 1, 5 + ((index * 17) % window))) };
}

// ---------------------------------------------------------------- assessments

export const SCENARIO_ASSESSMENTS = (): {
  id: string; serviceUserId: PersonSupportedId; category: "falls" | "nutrition" | "skin_integrity" | "moving_handling" | "other";
  toolName: string; score?: string; riskLevel?: "low" | "medium" | "high" | "not_applicable"; resultSummary: string;
  assessedAt: string; assessedByStaffId: StaffId; nextDueAt: string; notes: string;
}[] => {
  const iso = (d: Date) => d.toISOString();
  const featured = [
    { id: "ASM-0001", serviceUserId: "PS-001" as const, category: "falls" as const, toolName: "Morse Fall Scale", score: "65", riskLevel: "high" as const, resultSummary: "High falls risk after hip fracture. Two staff and frame for all transfers.", assessedAt: iso(daysAgo(6)), assessedByStaffId: "STAFF-DANIEL" as StaffId, nextDueAt: iso(daysFromNow(84)), notes: "Sensor mat in place." },
    { id: "ASM-0002", serviceUserId: "PS-001" as const, category: "nutrition" as const, toolName: "MUST", score: "0", riskLevel: "low" as const, resultSummary: "Low nutritional risk. Weight stable.", assessedAt: iso(daysAgo(35)), assessedByStaffId: "STAFF-EMMA" as StaffId, nextDueAt: iso(daysFromNow(55)), notes: "" },
    { id: "ASM-0003", serviceUserId: "PS-002" as const, category: "nutrition" as const, toolName: "MUST", score: "1", riskLevel: "medium" as const, resultSummary: "Medium nutritional risk. Weight down 1.5 kg over 3 months.", assessedAt: iso(daysAgo(100)), assessedByStaffId: "STAFF-AISLING" as StaffId, nextDueAt: iso(daysAgo(10)), notes: "Reassessment overdue." },
    { id: "ASM-0004", serviceUserId: "PS-002" as const, category: "skin_integrity" as const, toolName: "Waterlow", score: "12", riskLevel: "medium" as const, resultSummary: "At risk. Daily skin checks.", assessedAt: iso(daysAgo(30)), assessedByStaffId: "STAFF-AISLING" as StaffId, nextDueAt: iso(daysFromNow(60)), notes: "" },
    { id: "ASM-0005", serviceUserId: "PS-005" as const, category: "skin_integrity" as const, toolName: "Waterlow", score: "21", riskLevel: "high" as const, resultSummary: "Very high risk. Category 3 pressure ulcer on sacrum.", assessedAt: iso(daysAgo(14)), assessedByStaffId: "STAFF-FIONA" as StaffId, nextDueAt: iso(daysFromNow(16)), notes: "Repositioning every two hours." },
    { id: "ASM-0006", serviceUserId: "PS-007" as const, category: "moving_handling" as const, toolName: "Moving and handling risk assessment", riskLevel: "medium" as const, resultSummary: "Walks independently; one staff during and after seizures.", assessedAt: iso(daysAgo(60)), assessedByStaffId: "STAFF-ORLA" as StaffId, nextDueAt: iso(daysFromNow(120)), notes: "" },
    { id: "ASM-0007", serviceUserId: "PS-007" as const, category: "falls" as const, toolName: "Provider falls screening", riskLevel: "medium" as const, resultSummary: "Falls linked to seizures only.", assessedAt: iso(daysAgo(60)), assessedByStaffId: "STAFF-ORLA" as StaffId, nextDueAt: iso(daysFromNow(120)), notes: "" },
  ];
  const bgIds = Object.keys(PERSON_BY_ID).filter((id) => Number(id.slice(3)) >= 8) as PersonSupportedId[];
  const bg = bgIds.filter((_, i) => i % 3 === 0).map((id, i) => {
    const p = PERSON_BY_ID[id];
    const falls = i % 2 === 0;
    return {
      id: `ASM-B${String(i + 1).padStart(3, "0")}`, serviceUserId: id,
      category: falls ? "falls" as const : "nutrition" as const,
      toolName: falls ? "Morse Fall Scale" : "MUST", score: falls ? String(25 + (i * 5) % 40) : String(i % 2),
      riskLevel: (["low", "medium", "low"] as const)[i % 3],
      resultSummary: falls ? "Falls risk reviewed; current supports suitable." : "Nutritional risk reviewed; weight stable.",
      assessedAt: iso(daysAgo(10 + (i * 4) % 50)), assessedByStaffId: p.keyWorkerStaffId, nextDueAt: iso(daysFromNow(40 + (i * 4) % 50)), notes: "",
    };
  });
  return [...featured, ...bg];
};
