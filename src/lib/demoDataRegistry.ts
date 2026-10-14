/**
 * Shared master demo data registry for the LogUp prototype.
 *
 * SINGLE SOURCE OF TRUTH for organisation, sites, people supported and staff
 * identifiers used across every module (Events, Care Planning, Audits,
 * Policy Hub, Workforce Compliance, Insights, Tasks & Follow-up, Team,
 * Reporting).
 *
 * Geography rule (current demo):
 *   Organisation → Site / House → Person Supported
 *
 * Units / wings / floors are intentionally NOT modelled in the demo data.
 * Future support for units is preserved in individual store types, but no
 * demo record should reference a unit, wing or floor label.
 *
 * Canonical service area names (use these exact strings everywhere):
 *   - East Cork (home support, office in Midleton)
 *   - West Waterford (home support, office in Dungarvan)
 */

// ─── Organisation ────────────────────────────────────────────────────────────

export const ORGANISATION = {
  id: "ORG-001",
  name: "Oakfield Care Group",
} as const;

// ─── Sites ───────────────────────────────────────────────────────────────────

export type SiteId = "SITE-ECK" | "SITE-WWD";

export type CentreType =
  | "older_persons" | "disability" | "childrens_residential" | "home_support" | "supported_living";

export interface DemoSite {
  id: SiteId;
  name: string;
  centreType: CentreType;
  /** HIQA OSV number (optional). */
  hiqaCentreId?: string;
  address: string;
  personInChargeStaffId: StaffId;
  /** Default care plan reviewer (optional). */
  carePlanReviewLeadStaffId?: StaffId;
  status: "active" | "inactive";
  registeredProvider?: string;
  /** Number of registered places. */
  registeredCapacity?: number;
  /** Person participating in management (optional). */
  ppimStaffId?: StaffId;
  phone?: string;
  registrationRenewalDate?: string;
  lastInspectionDate?: string;
  lastInspectionReportUrl?: string;
  /** Home support: towns the service area covers. */
  coverageTowns?: string[];
}

/** Home support service areas have no HIQA OSV ID, registered capacity or rooms. */
export const isHomeSupport = (s: { centreType: CentreType } | undefined): boolean => s?.centreType === "home_support";

// Demo values — addresses and OSV numbers are placeholders.
export const SITES: readonly DemoSite[] = [
  { id: "SITE-ECK", name: "East Cork",      centreType: "home_support", address: "Office: Main Street, Midleton, Co. Cork",      coverageTowns: ["Youghal", "Midleton", "Cobh", "Carrigtwohill"], personInChargeStaffId: "STAFF-DANIEL",  carePlanReviewLeadStaffId: "STAFF-DANIEL",  status: "active", registeredProvider: "Oakfield Care Group CLG", ppimStaffId: "STAFF-SIOBHAN", phone: "021 463 1100" },
  { id: "SITE-WWD", name: "West Waterford", centreType: "home_support", address: "Office: Grattan Square, Dungarvan, Co. Waterford", coverageTowns: ["Dungarvan", "Lismore", "Cappoquin"], personInChargeStaffId: "STAFF-SIOBHAN", carePlanReviewLeadStaffId: "STAFF-SIOBHAN", status: "active", registeredProvider: "Oakfield Care Group CLG", ppimStaffId: "STAFF-AOIFE", phone: "058 412 00" },
] as const;

export const SITE_BY_ID: Record<SiteId, DemoSite> = SITES.reduce(
  (acc, s) => ({ ...acc, [s.id]: s }),
  {} as Record<SiteId, DemoSite>,
);

export const SITE_NAMES: readonly string[] = SITES.map((s) => s.name);

// ─── People Supported ────────────────────────────────────────────────────────
// The connected demo dataset (see demoScenario.ts for events, plans and
// assessments that reference these ids). PS-001–PS-007 are the featured
// residents; PS-008 onward are deterministic background residents.

export type PersonSupportedId = `PS-${string}`;

export type RiskLevel = "High" | "Medium" | "Low";

/** Immutable internal service user id. Never changes. */
export type ServiceUserId = PersonSupportedId;

export type ServiceUserStatus = "active" | "temporary_absence" | "discharged" | "deceased";

export interface ServiceUserRepresentative {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  isPrimary: boolean;
  /** Directory of Residents role. Absent on older records = next of kin. */
  type?: "next_of_kin" | "authorised_representative" | "decision_supporter";
  address?: string;
}

export type AdmissionType = "long_term" | "respite" | "short_stay";
export type AdmittedFrom = "home" | "hospital" | "another_centre" | "other";
export type Sex = "female" | "male" | "intersex" | "not_stated";
export type MaritalStatus = "single" | "married" | "civil_partnership" | "separated" | "divorced" | "widowed" | "not_stated";
export type FieldState = "source" | "ai_draft" | "human_confirmed";
export interface FieldProvenance {
  state: FieldState;
  /** Text the AI draft came from. */
  sourceText?: string;
  confirmedByStaffId?: StaffId;
  confirmedAt?: string;
}

export interface DemoPersonSupported {
  id: PersonSupportedId;
  /** Direct client number only; never substitute a representative's number. */
  phone?: string;
  name: string;
  siteId: SiteId;
  siteName: string;
  /** Future support; not populated in current demo. */
  unitId?: null;
  keyWorkerId: StaffId;
  risk: RiskLevel;
  primaryFocus: string;
  preferredName?: string;
  dateOfBirth: string;
  /** Customer-facing code used on regulator forms instead of the name. */
  serviceUserCode: string;
  admissionDate: string;
  status: ServiceUserStatus;
  keyWorkerStaffId: StaffId;
  representatives: ServiceUserRepresentative[];
  /** Short summary only; detail belongs in the care plan. */
  decisionSupportSummary: string;
  // Directory of Residents details (all optional; completed over time)
  legalFirstName?: string;
  legalLastName?: string;
  sex?: Sex;
  maritalStatus?: MaritalStatus;
  previousAddress?: string;
  preferredLanguage?: string;
  interpreterNeeded?: boolean;
  /** Data URL of the photo; only kept when photoConsent is true. */
  photo?: string;
  photoConsent?: boolean;
  admissionType?: AdmissionType;
  admittedFrom?: AdmittedFrom;
  admittedFromName?: string;
  /** Name and address of the authority or organisation that arranged the admission. */
  admissionArrangedBy?: string;
  roomOrUnit?: string;
  // Home support details
  homeAddress?: string;
  eircode?: string;
  /** Key safe, pets, parking. */
  accessNotes?: string;
  livesAlone?: boolean;
  funding?: "hse" | "private" | "mixed";
  hseApprovedHoursPerWeek?: number;
  gp?: { name?: string; practice?: string; phone?: string };
  /** Field provenance from admission (Source / AI draft / Human confirmed). */
  fieldProvenance?: Record<string, FieldProvenance>;
  createdAt: string;
  createdByStaffId: StaffId;
  updatedAt: string;
  updatedByStaffId: StaffId;
}

// Deterministic date helpers (relative to today, fixed offsets — no randomness).
const DEMO_YEAR = new Date().getFullYear();
const isoDaysAgo = (n: number) => { const d = new Date(); d.setHours(9, 0, 0, 0); d.setDate(d.getDate() - n); return d.toISOString(); };
const dateDaysAgo = (n: number) => isoDaysAgo(n).slice(0, 10);
const dob = (age: number, mmdd: string) => `${DEMO_YEAR - age}-${mmdd}`;

const ARRANGED_BY: Record<SiteId, string> = {
  "SITE-ECK": "HSE Cork Kerry Community Healthcare, Home Support Office, Midleton, Co. Cork",
  "SITE-WWD": "HSE South East Community Healthcare, Home Support Office, Dungarvan, Co. Waterford",
};
const GP: Record<SiteId, { name: string; practice: string; phone: string }> = {
  "SITE-ECK": { name: "Dr Fergal Nolan", practice: "Midleton Medical Centre, Main Street, Midleton", phone: "021 463 1200" },
  "SITE-WWD": { name: "Dr Úna Kehoe", practice: "Dungarvan Family Practice, Mitchel Street, Dungarvan", phone: "058 412 34" },
};
const SITE_NAME_BY_ID: Record<SiteId, string> = { "SITE-ECK": "East Cork", "SITE-WWD": "West Waterford" };

/** Directory details for the featured residents (complete). */
function featuredDirectory(siteId: SiteId, room: string, sex: Sex, marital: MaritalStatus, previousAddress: string, admittedFrom: AdmittedFrom, admittedFromName: string, nokAddress: string) {
  return {
    sex, maritalStatus: marital, previousAddress, preferredLanguage: "English", interpreterNeeded: false,
    admissionType: "long_term" as AdmissionType, admittedFrom, admittedFromName, admissionArrangedBy: ARRANGED_BY[siteId],
    ...(room ? { roomOrUnit: room } : {}), gp: GP[siteId], nokAddress,
  };
}

type FeaturedSeed = Omit<DemoPersonSupported, "siteName" | "keyWorkerId" | "createdAt" | "createdByStaffId" | "updatedAt" | "updatedByStaffId" | "representatives"> & {
  rep: Omit<ServiceUserRepresentative, "id" | "isPrimary" | "address">; dir: ReturnType<typeof featuredDirectory>;
  home: Required<Pick<DemoPersonSupported, "homeAddress" | "eircode" | "accessNotes" | "livesAlone" | "funding" | "hseApprovedHoursPerWeek">>;
};

const FEATURED: FeaturedSeed[] = [
  { id: "PS-001", name: "Patrick Murphy", legalFirstName: "Patrick", legalLastName: "Murphy", preferredName: "Paddy", siteId: "SITE-ECK", keyWorkerStaffId: "STAFF-EMMA", risk: "High", primaryFocus: "Falls / Mobility", dateOfBirth: dob(78, "03-12"), serviceUserCode: "ECK-0001", admissionDate: dateDaysAgo(1240), status: "active", decisionSupportSummary: "Makes everyday decisions independently; daughter supports with financial decisions.", rep: { name: "Mary Murphy", relationship: "Daughter", phone: "087 111 2233" }, dir: featuredDirectory("SITE-ECK", "", "male", "widowed", "14 Strand Street, Youghal, Co. Cork", "home", "", "2 Friar Street, Youghal, Co. Cork"), home: { homeAddress: "14 Strand Street, Youghal, Co. Cork", eircode: "P36 X2K7", accessNotes: "Key safe by back door (code from office). Small terrier, friendly. Park on street.", livesAlone: true, funding: "hse", hseApprovedHoursPerWeek: 14 } },
  { id: "PS-002", name: "Mary O’Sullivan", legalFirstName: "Mary", legalLastName: "O’Sullivan", siteId: "SITE-ECK", keyWorkerStaffId: "STAFF-AISLING", risk: "Medium", primaryFocus: "Nutrition / Hydration", dateOfBirth: dob(85, "09-02"), serviceUserCode: "ECK-0002", admissionDate: dateDaysAgo(990), status: "active", decisionSupportSummary: "Benefits from extra time and written prompts for health decisions.", rep: { name: "Seán O’Sullivan", relationship: "Son", phone: "086 222 3344" }, dir: featuredDirectory("SITE-ECK", "", "female", "widowed", "3 Rosebank, Midleton, Co. Cork", "hospital", "Mercy University Hospital, Cork", "Ballinacurra, Midleton, Co. Cork"), home: { homeAddress: "3 Rosebank, Midleton, Co. Cork", eircode: "P25 Y6C4", accessNotes: "Son lets carers in mornings; key safe for evening calls. No pets. Driveway parking.", livesAlone: true, funding: "mixed", hseApprovedHoursPerWeek: 10 } },
  { id: "PS-003", name: "John Byrne", legalFirstName: "John", legalLastName: "Byrne", siteId: "SITE-ECK", keyWorkerStaffId: "STAFF-LIAM", risk: "Low", primaryFocus: "Stable support plan", dateOfBirth: dob(81, "06-20"), serviceUserCode: "ECK-0003", admissionDate: dateDaysAgo(1430), status: "active", decisionSupportSummary: "Makes own decisions.", rep: { name: "Anne Byrne", relationship: "Wife", phone: "085 333 4455" }, dir: featuredDirectory("SITE-ECK", "", "male", "married", "22 Harbour Row, Cobh, Co. Cork", "home", "", "22 Harbour Row, Cobh, Co. Cork"), home: { homeAddress: "22 Harbour Row, Cobh, Co. Cork", eircode: "P24 T3H9", accessNotes: "Wife answers door. Steep hill; park at the church car park.", livesAlone: false, funding: "private", hseApprovedHoursPerWeek: 5 } },
  { id: "PS-004", name: "Eileen Fitzgerald", legalFirstName: "Eileen", legalLastName: "Fitzgerald", siteId: "SITE-WWD", keyWorkerStaffId: "STAFF-NIAMH", risk: "High", primaryFocus: "Safeguarding / Behaviour support", dateOfBirth: dob(86, "12-08"), serviceUserCode: "WWD-0004", admissionDate: dateDaysAgo(1140), status: "active", decisionSupportSummary: "Decision-making assistant appointed; see care plan.", rep: { name: "Declan Fitzgerald", relationship: "Nephew", phone: "087 444 5566" }, dir: featuredDirectory("SITE-WWD", "", "female", "single", "Abbeyside, Dungarvan, Co. Waterford", "another_centre", "St Joseph’s Community Hospital", "Ballinroad, Dungarvan, Co. Waterford"), home: { homeAddress: "Abbeyside, Dungarvan, Co. Waterford", eircode: "X35 P4D8", accessNotes: "Key safe at front porch. Cat indoors — keep doors closed. Parking in estate.", livesAlone: true, funding: "hse", hseApprovedHoursPerWeek: 21 } },
  { id: "PS-005", name: "Tomás Ryan", legalFirstName: "Tomás", legalLastName: "Ryan", siteId: "SITE-WWD", keyWorkerStaffId: "STAFF-NIAMH", risk: "Medium", primaryFocus: "Skin integrity / Medication support", dateOfBirth: dob(76, "04-15"), serviceUserCode: "WWD-0001", admissionDate: dateDaysAgo(860), status: "active", decisionSupportSummary: "Makes own decisions with support for medication choices.", rep: { name: "Niall Ryan", relationship: "Brother", phone: "083 555 6677" }, dir: featuredDirectory("SITE-WWD", "", "male", "single", "5 Davitt's Quay, Dungarvan, Co. Waterford", "hospital", "University Hospital Waterford", "Abbeyside, Dungarvan, Co. Waterford"), home: { homeAddress: "5 Davitt's Quay, Dungarvan, Co. Waterford", eircode: "X35 E1F6", accessNotes: "Ring bell; brother may be visiting. Pay-and-display on the quay.", livesAlone: true, funding: "hse", hseApprovedHoursPerWeek: 12 } },
  { id: "PS-006", name: "Bridget Walsh", legalFirstName: "Bridget", legalLastName: "Walsh", siteId: "SITE-WWD", keyWorkerStaffId: "STAFF-ORLA", risk: "Low", primaryFocus: "Personal care / Medication", dateOfBirth: dob(54, "02-27"), serviceUserCode: "WWD-0002", admissionDate: dateDaysAgo(2210), status: "active", decisionSupportSummary: "Supported decision-making using pictures and familiar staff.", rep: { name: "Kathleen Walsh", relationship: "Mother", phone: "089 666 7788" }, dir: featuredDirectory("SITE-WWD", "", "female", "single", "Main Street, Lismore, Co. Waterford", "home", "", "Main Street, Lismore, Co. Waterford"), home: { homeAddress: "Main Street, Lismore, Co. Waterford", eircode: "P51 W8N3", accessNotes: "Mother at home. Two dogs — ask for them to be put out back. Park in square.", livesAlone: false, funding: "mixed", hseApprovedHoursPerWeek: 8 } },
  { id: "PS-007", name: "Michael Doyle", legalFirstName: "Michael", legalLastName: "Doyle", siteId: "SITE-WWD", keyWorkerStaffId: "STAFF-ORLA", risk: "Medium", primaryFocus: "Epilepsy support", dateOfBirth: dob(41, "07-30"), serviceUserCode: "WWD-0003", admissionDate: dateDaysAgo(2050), status: "active", decisionSupportSummary: "Supported decision-making; sister involved in significant decisions.", rep: { name: "Joan Doyle", relationship: "Sister", phone: "087 777 8899" }, dir: featuredDirectory("SITE-WWD", "", "male", "single", "2 Mill Lane, Cappoquin, Co. Waterford", "another_centre", "Cheshire Home, Waterford", "Ballyduff, Co. Waterford"), home: { homeAddress: "2 Mill Lane, Cappoquin, Co. Waterford", eircode: "P51 C9R2", accessNotes: "Key safe beside garage. No pets. Driveway parking.", livesAlone: true, funding: "hse", hseApprovedHoursPerWeek: 18 } },
];

/**
 * Background residents: [legalFirst, last, preferred, sex, age, admittedDaysAgo, flags]
 * flags: "r" respite · "gp" missing GP phone · "addr" missing previous address ·
 * "nok" missing next-of-kin address and marital status · "arr" missing arranged-by.
 */
type BgTuple = [string, string, string, "f" | "m", number, number, string?];

const OAK_BG: BgTuple[] = [
  ["Kathleen", "Doyle", "Kitty", "f", 88, 1510], ["Bernadette", "Quinn", "Bernie", "f", 84, 1320], ["Thomas", "Gallagher", "Tom", "m", 86, 1105],
  ["Nora", "Kavanagh", "", "f", 91, 980, "gp"], ["Christopher", "Hayes", "Christy", "m", 79, 902], ["Josephine", "Farrell", "Josie", "f", 93, 12, "r"],
  ["Joseph", "Moran", "Joe", "m", 82, 860], ["Teresa", "Lynch", "", "f", 87, 811], ["Francis", "Carroll", "Frank", "m", 77, 760],
  ["Brigid", "Hennessy", "Bridie", "f", 95, 702], ["Denis", "O’Connor", "", "m", 74, 655], ["Helen", "Murray", "", "f", 81, 610],
  ["James", "Brennan", "Jim", "m", 89, 588], ["Philomena", "Walsh", "Phil", "f", 90, 540], ["Seamus", "Keane", "", "m", 83, 512],
  ["Agnes", "Duggan", "", "f", 97, 470], ["Martin", "Foley", "", "m", 76, 431], ["Sheila", "Ryan", "", "f", 85, 404, "addr"],
  ["Gerard", "Byrne", "Gerry", "m", 80, 380], ["Maureen", "Dunphy", "", "f", 92, 9, "r"], ["Desmond", "Whelan", "Des", "m", 87, 344],
  ["Catherine", "Power", "Kay", "f", 78, 320], ["Brendan", "Hennelly", "", "m", 71, 297], ["Eithne", "Mulligan", "", "f", 89, 270],
  ["Laurence", "Fitzpatrick", "Larry", "m", 84, 248], ["Rita", "Costello", "", "f", 94, 226], ["Anthony", "Sheridan", "Tony", "m", 73, 205],
  ["Breda", "Kinsella", "", "f", 86, 188], ["Noel", "Dempsey", "", "m", 81, 166, "nok"], ["Ann", "Cullen", "", "f", 99, 150],
  ["Eamon", "Tierney", "", "m", 79, 18, "r"], ["Patricia", "Molloy", "Pat", "f", 83, 121], ["Cornelius", "Healy", "Con", "m", 88, 99],
  ["Lily", "Redmond", "", "f", 96, 77], ["Dermot", "Phelan", "", "m", 75, 61], ["Imelda", "Conway", "", "f", 82, 44],
  ["Owen", "Gormley", "", "m", 90, 30],
];
const RIV_BG: BgTuple[] = [
  ["Hannah", "Brophy", "", "f", 89, 1205], ["Bartholomew", "Twomey", "Batt", "m", 85, 1090], ["Monica", "Furlong", "", "f", 92, 970],
  ["Richard", "Doran", "", "m", 80, 880], ["Ellen", "Kehoe", "Nellie", "f", 94, 790], ["Jeremiah", "O’Leary", "Jerry", "m", 78, 702],
  ["Frances", "Delaney", "", "f", 86, 640], ["Matthew", "Coady", "Matt", "m", 83, 14, "r"], ["Julia", "Fenlon", "", "f", 88, 530],
  ["Edward", "Bolger", "Ned", "m", 91, 470, "arr"], ["Alice", "Murphy", "", "f", 76, 415], ["Kieran", "Lawlor", "", "m", 72, 362],
  ["Dolores", "Byrne", "Dolly", "f", 85, 300], ["Timothy", "Kelleher", "Timmy", "m", 87, 244], ["Carmel", "Hickey", "", "f", 81, 190],
  ["Peter", "Nevin", "", "m", 79, 133], ["Esther", "Kealy", "", "f", 98, 82], ["Leo", "Doherty", "", "m", 84, 40],
];
const ELM_BG: BgTuple[] = [
  ["Darren", "Moloney", "", "m", 34, 1460], ["Louise", "Gorman", "", "f", 52, 1100],
];

const OAK_KEY_WORKERS: StaffId[] = ["STAFF-EMMA", "STAFF-AISLING", "STAFF-LIAM", "STAFF-GRAINNE", "STAFF-PEADAR", "STAFF-SINEAD", "STAFF-ROISIN", "STAFF-KEVIN"];
const RIV_KEY_WORKERS: StaffId[] = ["STAFF-FIONA", "STAFF-MAEVE", "STAFF-DARRAGH", "STAFF-NIAMH"];
const ELM_KEY_WORKERS: StaffId[] = ["STAFF-CONOR", "STAFF-AINE"];

const TOWNS: Record<SiteId, string[]> = {
  "SITE-ECK": ["Youghal", "Midleton", "Cobh", "Carrigtwohill"],
  "SITE-WWD": ["Dungarvan", "Lismore", "Cappoquin"],
};
const STREETS = ["Main Street", "Church Road", "Chapel Lane", "Bridge Street", "Green Road", "Mill Lane", "Abbey Road"];
const FOCUS_OLDER = ["Mobility support", "Dementia support", "Nutrition / Hydration", "Skin integrity", "Continence support", "Social engagement", "Diabetes support", "Stable support plan"];
const FOCUS_DIS = ["Communication support", "Positive behaviour support"];
const REL_F = ["Son", "Daughter", "Niece", "Nephew"];

function buildBackground(siteId: SiteId, prefix: string, startCode: number, startId: number, tuples: BgTuple[], kws: StaffId[], kwOffset: number): DemoPersonSupported[] {
  return tuples.map(([first, last, preferred, s, age, days, flags = ""], i) => {
    const n = startId + i;
    const id = `PS-${String(n).padStart(3, "0")}` as PersonSupportedId;
    const town = TOWNS[siteId][i % TOWNS[siteId].length];
    const street = STREETS[i % STREETS.length];
    const respite = flags.includes("r");
    const kw = kws[(i + kwOffset) % kws.length];
    const created = isoDaysAgo(days);
    const relName = ["Siobhán", "Brian", "Deirdre", "Colm", "Gráinne", "Pádraig", "Aoife", "Eoin"][i % 8];
    const relLast = i % 3 === 0 ? last : ["Doran", "Keogh", "Brady"][i % 3];
    const marital: MaritalStatus = siteId === "SITE-WWD" ? "single" : (["widowed", "married", "widowed", "single", "widowed"] as MaritalStatus[])[i % 5];
    const focus = siteId === "SITE-WWD" ? FOCUS_DIS[i % FOCUS_DIS.length] : FOCUS_OLDER[i % FOCUS_OLDER.length];
    return {
      id, name: `${first} ${last}`, legalFirstName: first, legalLastName: last,
      ...(preferred ? { preferredName: preferred } : {}),
      siteId, siteName: SITE_NAME_BY_ID[siteId], unitId: null,
      keyWorkerId: kw, keyWorkerStaffId: kw,
      risk: (["Low", "Medium", "Low", "High", "Low", "Medium"] as RiskLevel[])[i % 6],
      primaryFocus: focus,
      dateOfBirth: dob(age, `${String((i % 12) + 1).padStart(2, "0")}-${String((i * 7) % 27 + 1).padStart(2, "0")}`),
      serviceUserCode: `${prefix}-${String(startCode + i).padStart(4, "0")}`,
      admissionDate: dateDaysAgo(days),
      status: "active",
      representatives: [{
        id: `REP-${id}-1`, name: `${relName} ${relLast}`, relationship: REL_F[i % REL_F.length],
        phone: `08${(i % 7) + 3} ${String(400 + i * 13).slice(-3)} ${String(1000 + i * 271).slice(-4)}`,
        isPrimary: true, type: "next_of_kin",
        ...(flags.includes("nok") ? {} : { address: `${(i % 30) + 2} ${STREETS[(i + 3) % STREETS.length]}, ${TOWNS[siteId][(i + 1) % TOWNS[siteId].length]}` }),
      }],
      decisionSupportSummary: siteId === "SITE-WWD" ? "Supported decision-making with familiar staff and easy-read information." : (i % 4 === 0 ? "Family supports with significant decisions." : "Makes own decisions."),
      sex: s === "f" ? "female" : "male",
      ...(flags.includes("nok") ? {} : { maritalStatus: marital }),
      ...(flags.includes("addr") ? {} : { previousAddress: `${(i % 40) + 1} ${street}, ${town}` }),
      preferredLanguage: "English", interpreterNeeded: false,
      admissionType: respite ? "respite" : "long_term",
      admittedFrom: (["home", "hospital", "home", "another_centre"] as AdmittedFrom[])[i % 4],
      admittedFromName: (["", "Cork University Hospital", "", "Community nursing unit"])[i % 4],
      ...(flags.includes("arr") ? {} : { admissionArrangedBy: ARRANGED_BY[siteId] }),
      homeAddress: `${10 + i} ${street}, ${town}`,
      gp: flags.includes("gp") ? { name: GP[siteId].name, practice: GP[siteId].practice } : GP[siteId],
      createdAt: created, createdByStaffId: "STAFF-AOIFE", updatedAt: created, updatedByStaffId: "STAFF-AOIFE",
    };
  });
}

const FEATURED_PEOPLE: DemoPersonSupported[] = FEATURED.map(({ rep, dir, home, ...p }) => {
  const { nokAddress, ...directory } = dir;
  const created = `${p.admissionDate}T09:00:00Z`;
  return {
    ...p, ...directory, ...home, previousAddress: home.homeAddress, siteName: SITE_NAME_BY_ID[p.siteId], unitId: null, keyWorkerId: p.keyWorkerStaffId,
    representatives: [{ id: `REP-${p.id}-1`, ...rep, isPrimary: true, type: "next_of_kin", address: nokAddress }],
    createdAt: created, createdByStaffId: "STAFF-AOIFE", updatedAt: created, updatedByStaffId: "STAFF-AOIFE",
  };
});

export const PEOPLE_SUPPORTED: readonly DemoPersonSupported[] = [
  ...FEATURED_PEOPLE,
  ...buildBackground("SITE-ECK", "OAK", 4, 8, OAK_BG, OAK_KEY_WORKERS, 3),
  ...buildBackground("SITE-WWD", "RIV", 3, 45, RIV_BG, RIV_KEY_WORKERS, 0),
  ...buildBackground("SITE-WWD", "ELM", 3, 63, ELM_BG, ELM_KEY_WORKERS, 0),
];

export const PERSON_BY_ID: Record<PersonSupportedId, DemoPersonSupported> =
  PEOPLE_SUPPORTED.reduce(
    (acc, p) => ({ ...acc, [p.id]: p }),
    {} as Record<PersonSupportedId, DemoPersonSupported>,
  );

// ─── Staff ───────────────────────────────────────────────────────────────────

export type StaffId =
  | "STAFF-AOIFE" | "STAFF-SIOBHAN" | "STAFF-DANIEL" | "STAFF-CLAIRE"
  | "STAFF-EMMA" | "STAFF-AISLING" | "STAFF-LIAM" | "STAFF-NIAMH" | "STAFF-ORLA"
  | "STAFF-GRAINNE" | "STAFF-PEADAR" | "STAFF-SINEAD" | "STAFF-ROISIN" | "STAFF-KEVIN"
  | "STAFF-FIONA" | "STAFF-MAEVE" | "STAFF-DARRAGH"
  | "STAFF-CONOR" | "STAFF-AINE"
  | "STAFF-CIARAN"
  | "STAFF-SARAH" | "STAFF-BRIAN";

export type AccessRole = "Admin" | "Manager" | "Frontline" | "View Only" | "External";

export interface DemoStaff {
  id: StaffId;
  /** Optional direct carer contact; missing numbers must not be invented. */
  phone?: string;
  name: string;
  roleLabel: string;
  accessRole: AccessRole;
  scopeSiteIds: SiteId[];
  keyWorkerFor?: PersonSupportedId[];
  readOnly?: boolean;
  external?: boolean;
  registrationBody?: string;
  registrationNumber?: string;
  linkedPersonSupportedIds?: PersonSupportedId[];
}

const kwFor = (id: StaffId): PersonSupportedId[] => PEOPLE_SUPPORTED.filter((p) => p.keyWorkerStaffId === id).map((p) => p.id);
const frontline = (id: StaffId, name: string, site: SiteId, roleLabel = "Key Worker"): DemoStaff =>
  ({ id, name, roleLabel, accessRole: "Frontline", scopeSiteIds: [site], keyWorkerFor: kwFor(id) });

export const STAFF: readonly DemoStaff[] = [
  // Admin / Leadership
  { id: "STAFF-AOIFE",   name: "Aoife Brennan",   roleLabel: "Regional Operations Lead",    accessRole: "Admin",     scopeSiteIds: ["SITE-ECK", "SITE-WWD"] },
  // Multi-site Manager
  { id: "STAFF-SIOBHAN", name: "Siobhán Kelly",   roleLabel: "Multi-site Manager / PIC",    accessRole: "Manager",   scopeSiteIds: ["SITE-ECK", "SITE-WWD"] },
  // Single-site Managers
  { id: "STAFF-DANIEL",  name: "Daniel Walsh",    roleLabel: "Site Manager / Deputy PIC",   accessRole: "Manager",   scopeSiteIds: ["SITE-ECK"] },
  { id: "STAFF-CLAIRE",  name: "Claire Nolan",    roleLabel: "Site Manager / PIC",          accessRole: "Manager",   scopeSiteIds: ["SITE-WWD"] },
  // Frontline / Key Workers (each covers at most six residents)
  frontline("STAFF-EMMA", "Emma Ryan", "SITE-ECK"),
  frontline("STAFF-AISLING", "Aisling Doherty", "SITE-ECK"),
  frontline("STAFF-LIAM", "Liam Murphy", "SITE-ECK", "Frontline Support Worker"),
  frontline("STAFF-GRAINNE", "Gráinne Lynch", "SITE-ECK", "Staff Nurse"),
  frontline("STAFF-PEADAR", "Peadar Hogan", "SITE-ECK", "Healthcare Assistant"),
  frontline("STAFF-SINEAD", "Sinéad Kirwan", "SITE-ECK", "Staff Nurse"),
  frontline("STAFF-ROISIN", "Róisín Daly", "SITE-ECK", "Healthcare Assistant"),
  frontline("STAFF-KEVIN", "Kevin Mahon", "SITE-ECK", "Healthcare Assistant"),
  frontline("STAFF-NIAMH", "Niamh Connolly", "SITE-WWD"),
  frontline("STAFF-FIONA", "Fiona Healy", "SITE-WWD", "Staff Nurse"),
  frontline("STAFF-MAEVE", "Maeve Corcoran", "SITE-WWD", "Healthcare Assistant"),
  frontline("STAFF-DARRAGH", "Darragh Quinlan", "SITE-WWD", "Healthcare Assistant"),
  frontline("STAFF-ORLA", "Orla McCarthy", "SITE-WWD"),
  frontline("STAFF-CONOR", "Conor Fahy", "SITE-WWD", "Social Care Worker"),
  frontline("STAFF-AINE", "Áine Murphy", "SITE-WWD", "Social Care Worker"),
  // View Only
  { id: "STAFF-CIARAN",  name: "Ciarán Walsh",    roleLabel: "Governance Viewer",           accessRole: "View Only", scopeSiteIds: ["SITE-ECK", "SITE-WWD"], readOnly: true },
  // External specialists
  { id: "STAFF-SARAH",   name: "Sarah Keane",       roleLabel: "Dietitian",       accessRole: "External", scopeSiteIds: [], external: true, registrationBody: "CORU", registrationNumber: "DT12345", linkedPersonSupportedIds: ["PS-002"] },
  { id: "STAFF-BRIAN",   name: "Brian O’Donnell",   roleLabel: "Physiotherapist", accessRole: "External", scopeSiteIds: [], external: true, registrationBody: "CORU", registrationNumber: "PT67890", linkedPersonSupportedIds: ["PS-001"] },
];

export const STAFF_BY_ID: Record<StaffId, DemoStaff> = STAFF.reduce(
  (acc, s) => ({ ...acc, [s.id]: s }),
  {} as Record<StaffId, DemoStaff>,
);

// ─── Lookup helpers ──────────────────────────────────────────────────────────

export const getSiteName = (id: SiteId): string => SITE_BY_ID[id]?.name ?? "";
export const getPersonName = (id: PersonSupportedId): string => PERSON_BY_ID[id]?.name ?? "";
export const getStaffName = (id: StaffId): string => STAFF_BY_ID[id]?.name ?? "";

export const peopleAtSite = (siteId: SiteId): DemoPersonSupported[] =>
  PEOPLE_SUPPORTED.filter((p) => p.siteId === siteId);

export const staffAtSite = (siteId: SiteId): DemoStaff[] =>
  STAFF.filter((s) => s.scopeSiteIds.includes(siteId));

export const keyWorkerFor = (personId: PersonSupportedId): DemoStaff | undefined =>
  STAFF.find((s) => s.keyWorkerFor?.includes(personId));

/**
 * Forbidden legacy geography labels. Any visible demo text matching one of
 * these should be treated as a data-integrity issue.
 */
export const FORBIDDEN_LOCATION_LABELS = [
  "Rose Wing", "Iris Wing", "Ground Floor",
  "Oakfield House", "Oakfield Care Centre",
  "Elmgrove Manor", "Elmgrove House", "Elm Grove Manor",
] as const;

// ─── Site reviewer / PIC defaults ────────────────────────────────────────────
// Governance rule: the default reviewer for an event is the PIC / Manager for
// the site where it happened. Used by the Events module when no reviewer has
// been assigned yet.

export const SITE_PIC: Record<SiteId, StaffId> = {
  "SITE-ECK": "STAFF-DANIEL",   // Service Area Manager / PIC
  "SITE-WWD": "STAFF-SIOBHAN",  // Multi-area Manager / PIC
};

export const siteIdByName = (name: string): SiteId | undefined =>
  SITES.find((s) => s.name === name)?.id;

/** Default PIC / Manager reviewer for a site name. */
export function picForSiteName(name: string): DemoStaff | undefined {
  const id = siteIdByName(name);
  return id ? STAFF_BY_ID[SITE_PIC[id]] : undefined;
}

/** Managers / PICs who can be assigned as reviewer for a site name. */
export function reviewerCandidatesForSiteName(name: string): DemoStaff[] {
  const id = siteIdByName(name);
  if (!id) return STAFF.filter((s) => s.accessRole === "Manager" || s.accessRole === "Admin");
  return STAFF.filter(
    (s) => (s.accessRole === "Manager" || s.accessRole === "Admin") && s.scopeSiteIds.includes(id),
  );
}
