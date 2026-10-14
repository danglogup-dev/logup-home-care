// Workforce Compliance & Coverage — local in-memory store + helpers.
//
// Identity source of truth = StaffId (STAFF-*) from demoDataRegistry.
// Geography source of truth = SiteId (SITE-OAK / SITE-RIV / SITE-ELM).
// External specialists (external === true) are NOT workforce staff.

import {
  SITES,
  STAFF,
  STAFF_BY_ID,
  getSiteName,
  type SiteId,
  type StaffId,
} from "./demoDataRegistry";

export type RagStatus = "green" | "amber" | "red";
export type CoverageStatus = "covered" | "at_risk" | "uncovered";
export type ShiftType = "day" | "night";
export type AppliesTo = "day" | "night" | "both";

/**
 * Operational profile drives the Workforce compliance denominator and skills-
 * matrix visibility.
 *  - frontline: expected to meet site care/support requirements
 *  - leadership: managers who hold some clinical rails, counted only for rails
 *    listed in `expectedQualificationIds`
 *  - governance_view_only: NOT counted; never shown as missing frontline quals
 */
export type OperationalProfile = "frontline" | "leadership" | "governance_view_only";

export interface Site {
  id: SiteId;
  name: string;
  unit?: string;
  notes?: string;
}

export interface QualificationType {
  id: string;
  name: string;
  critical: boolean;
  defaultValidityMonths: number;
}

export interface StaffQualification {
  qualificationId: string;
  issuedOn: string;
  expiresOn: string;
  certificateName?: string;
  notes?: string;
}

export type RotaPattern = "A" | "B";

export interface StaffMember {
  id: StaffId;
  name: string;
  role: string;
  primarySiteId: SiteId;
  assignedSiteIds: SiteId[];
  qualifications: StaffQualification[];
  rotaPattern: RotaPattern;
  shiftPreference?: ShiftType;
  operationalProfile: OperationalProfile;
  /** Rails this staff member is expected to hold. Empty = no expectations. */
  expectedQualificationIds: string[];
}

export interface SiteRequirement {
  id: string;
  siteId: SiteId;
  qualificationId: string;
  minimumPerShift: number;
  appliesTo: AppliesTo;
  notes?: string;
}

export interface DemoIssue {
  kind: "attention" | "uncovered";
  staffId: string;
  staffName: string;
  qualificationId: string;
  qualificationName: string;
  detail: string;
  gapReason: string;
  suggestedAction: string;
}

export interface ShiftAssignment {
  id: string;
  siteId: SiteId;
  date: string;
  shift: ShiftType;
  staffIds: StaffId[];
  demoIssue?: DemoIssue;
}

// ---------- Date helpers ----------

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

export function formatDate(s: string): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

// ---------- RAG ----------

export const AMBER_DAYS = 30;
export const SHIFT_AT_RISK_DAYS = 14;

export function qualificationStatus(q: StaffQualification, asOf: Date = TODAY): RagStatus {
  if (!q || !q.expiresOn) return "red";
  const days = daysBetween(q.expiresOn, iso(asOf));
  if (days < 0) return "red";
  if (days <= AMBER_DAYS) return "amber";
  return "green";
}

export function daysToExpiry(q: StaffQualification, asOf: Date = TODAY): number {
  return daysBetween(q.expiresOn, iso(asOf));
}

// ---------- Qualification rails (9 canonical) ----------

const qualificationTypes: QualificationType[] = [
  { id: "q-firstaid",        name: "First Aid",                          critical: true,  defaultValidityMonths: 36 },
  { id: "q-handling",        name: "Manual Handling",                    critical: true,  defaultValidityMonths: 12 },
  { id: "q-safeguarding",    name: "Safeguarding",                       critical: true,  defaultValidityMonths: 24 },
  { id: "q-fire",            name: "Fire Safety",                        critical: true,  defaultValidityMonths: 12 },
  { id: "q-meds",            name: "Medication Administration",          critical: true,  defaultValidityMonths: 24 },
  { id: "q-epilepsy-aware",  name: "Epilepsy Awareness",                 critical: false, defaultValidityMonths: 24 },
  { id: "q-epilepsy-meds",   name: "Epilepsy Medication Administration", critical: true,  defaultValidityMonths: 12 },
  { id: "q-pbs",             name: "Positive Behaviour Support",         critical: false, defaultValidityMonths: 24 },
  { id: "q-dysphagia",       name: "Nutrition / Dysphagia Awareness",    critical: false, defaultValidityMonths: 24 },
];

// ---------- Sites ----------

const sites: Site[] = SITES.map((s) => ({ id: s.id, name: s.name }));

// ---------- Site requirements ----------

const siteRequirements: SiteRequirement[] = [
  // Oakfield Manor
  { id: "r-oak-fa",   siteId: "SITE-OAK", qualificationId: "q-firstaid",     minimumPerShift: 1, appliesTo: "both" },
  { id: "r-oak-mh",   siteId: "SITE-OAK", qualificationId: "q-handling",     minimumPerShift: 1, appliesTo: "both" },
  { id: "r-oak-sg",   siteId: "SITE-OAK", qualificationId: "q-safeguarding", minimumPerShift: 1, appliesTo: "both" },
  { id: "r-oak-fire", siteId: "SITE-OAK", qualificationId: "q-fire",         minimumPerShift: 1, appliesTo: "both" },
  { id: "r-oak-med",  siteId: "SITE-OAK", qualificationId: "q-meds",         minimumPerShift: 1, appliesTo: "day",  notes: "Medication round requires registered competency." },
  { id: "r-oak-dys",  siteId: "SITE-OAK", qualificationId: "q-dysphagia",    minimumPerShift: 1, appliesTo: "both", notes: "Conditional — resident with dysphagia risk." },

  // Riverside Lodge
  { id: "r-riv-fa",   siteId: "SITE-RIV", qualificationId: "q-firstaid",     minimumPerShift: 1, appliesTo: "both" },
  { id: "r-riv-mh",   siteId: "SITE-RIV", qualificationId: "q-handling",     minimumPerShift: 1, appliesTo: "both" },
  { id: "r-riv-sg",   siteId: "SITE-RIV", qualificationId: "q-safeguarding", minimumPerShift: 1, appliesTo: "both" },
  { id: "r-riv-fire", siteId: "SITE-RIV", qualificationId: "q-fire",         minimumPerShift: 1, appliesTo: "both" },
  { id: "r-riv-pbs",  siteId: "SITE-RIV", qualificationId: "q-pbs",          minimumPerShift: 1, appliesTo: "both" },
  { id: "r-riv-med",  siteId: "SITE-RIV", qualificationId: "q-meds",         minimumPerShift: 1, appliesTo: "day",  notes: "Conditional — resident on medication support." },

  // Elm Grove House
  { id: "r-elm-fa",   siteId: "SITE-ELM", qualificationId: "q-firstaid",     minimumPerShift: 1, appliesTo: "both" },
  { id: "r-elm-mh",   siteId: "SITE-ELM", qualificationId: "q-handling",     minimumPerShift: 1, appliesTo: "both" },
  { id: "r-elm-sg",   siteId: "SITE-ELM", qualificationId: "q-safeguarding", minimumPerShift: 1, appliesTo: "both" },
  { id: "r-elm-fire", siteId: "SITE-ELM", qualificationId: "q-fire",         minimumPerShift: 1, appliesTo: "both" },
  { id: "r-elm-ea",   siteId: "SITE-ELM", qualificationId: "q-epilepsy-aware", minimumPerShift: 1, appliesTo: "both" },
  { id: "r-elm-em",   siteId: "SITE-ELM", qualificationId: "q-epilepsy-meds", minimumPerShift: 1, appliesTo: "day",  notes: "Conditional — resident on anti-epileptic medication." },
];

// ---------- Staff seed (from registry, excluding externals) ----------

function qual(qid: string, expiryOffsetDays: number, validityMonths = 12): StaffQualification {
  const expiresOn = iso(addDays(TODAY, expiryOffsetDays));
  const issuedOn = iso(addMonths(addDays(TODAY, expiryOffsetDays), -validityMonths));
  return { qualificationId: qid, issuedOn, expiresOn, certificateName: `${qid}-cert.pdf` };
}

interface StaffSeed {
  id: StaffId;
  profile: OperationalProfile;
  expected: string[];
  quals: StaffQualification[];
  rota: RotaPattern;
  shiftPreference?: ShiftType;
}

// Frontline & leadership rails (leadership excludes care-delivery rails
// unless explicitly assigned).
const LEADERSHIP_EXPECTED = ["q-firstaid", "q-handling", "q-safeguarding", "q-fire"];

const OAK_FRONTLINE = ["q-firstaid", "q-handling", "q-safeguarding", "q-fire", "q-meds"];
const OAK_FRONTLINE_DYS = [...OAK_FRONTLINE, "q-dysphagia"];
const RIV_FRONTLINE = ["q-firstaid", "q-handling", "q-safeguarding", "q-fire", "q-pbs"];
const ELM_FRONTLINE = ["q-firstaid", "q-handling", "q-safeguarding", "q-fire", "q-epilepsy-aware", "q-epilepsy-meds"];

const staffSeeds: StaffSeed[] = [
  // Aoife — Regional Operations Lead (admin). Treated as leadership.
  {
    id: "STAFF-AOIFE", profile: "leadership", expected: LEADERSHIP_EXPECTED, rota: "A",
    quals: [qual("q-firstaid", 300, 36), qual("q-handling", 260, 12), qual("q-safeguarding", 380, 24), qual("q-fire", 320, 12)],
  },
  // Siobhán — Multi-site Manager. First Aid EXPIRED (-20d).
  {
    id: "STAFF-SIOBHAN", profile: "leadership", expected: LEADERSHIP_EXPECTED, rota: "A",
    quals: [qual("q-firstaid", -20, 36), qual("q-handling", 200, 12), qual("q-safeguarding", 340, 24), qual("q-fire", 260, 12)],
  },
  // Daniel — Site Manager Oakfield. Holds Meds for admin cover.
  {
    id: "STAFF-DANIEL", profile: "leadership", expected: [...LEADERSHIP_EXPECTED, "q-meds"], rota: "B", shiftPreference: "day",
    quals: [qual("q-firstaid", 420, 36), qual("q-handling", 240, 12), qual("q-safeguarding", 300, 24), qual("q-fire", 280, 12), qual("q-meds", 340, 24)],
  },
  // Claire — Site Manager Elm Grove.
  {
    id: "STAFF-CLAIRE", profile: "leadership", expected: LEADERSHIP_EXPECTED, rota: "A", shiftPreference: "day",
    quals: [qual("q-firstaid", 380, 36), qual("q-handling", 220, 12), qual("q-safeguarding", 320, 24), qual("q-fire", 270, 12)],
  },
  // Emma — Frontline Oakfield. First Aid DUE SOON (+20d).
  {
    id: "STAFF-EMMA", profile: "frontline", expected: OAK_FRONTLINE, rota: "A",
    quals: [qual("q-firstaid", 20, 36), qual("q-handling", 200, 12), qual("q-safeguarding", 300, 24), qual("q-fire", 250, 12), qual("q-meds", 320, 24)],
  },
  // Aisling — Frontline Oakfield. Dysphagia DUE SOON.
  {
    id: "STAFF-AISLING", profile: "frontline", expected: OAK_FRONTLINE_DYS, rota: "B",
    quals: [qual("q-firstaid", 400, 36), qual("q-handling", 220, 12), qual("q-safeguarding", 310, 24), qual("q-fire", 260, 12), qual("q-meds", 300, 24), qual("q-dysphagia", 20, 24)],
  },
  // Liam — Frontline Oakfield (support worker).
  {
    id: "STAFF-LIAM", profile: "frontline", expected: OAK_FRONTLINE, rota: "B", shiftPreference: "night",
    quals: [qual("q-firstaid", 380, 36), qual("q-handling", 240, 12), qual("q-safeguarding", 290, 24), qual("q-fire", 240, 12), qual("q-meds", 280, 24)],
  },
  // Niamh — Frontline Riverside key worker.
  {
    id: "STAFF-NIAMH", profile: "frontline", expected: RIV_FRONTLINE, rota: "A",
    quals: [qual("q-firstaid", 360, 36), qual("q-handling", 220, 12), qual("q-safeguarding", 300, 24), qual("q-fire", 260, 12), qual("q-pbs", 320, 24)],
  },
  // Orla — Frontline Elm Grove. Epilepsy Meds DUE SOON.
  {
    id: "STAFF-ORLA", profile: "frontline", expected: ELM_FRONTLINE, rota: "B",
    quals: [qual("q-firstaid", 380, 36), qual("q-handling", 220, 12), qual("q-safeguarding", 300, 24), qual("q-fire", 260, 12), qual("q-epilepsy-aware", 400, 24), qual("q-epilepsy-meds", 20, 12)],
  },
  // Additional frontline staff (connected demo dataset).
  { id: "STAFF-GRAINNE", profile: "frontline", expected: OAK_FRONTLINE, rota: "A", quals: OAK_FRONTLINE.map((q, i) => qual(q, 120 + i * 40, 24)) },
  { id: "STAFF-PEADAR", profile: "frontline", expected: OAK_FRONTLINE, rota: "B", quals: OAK_FRONTLINE.map((q, i) => qual(q, 120 + i * 40, 24)) },
  { id: "STAFF-SINEAD", profile: "frontline", expected: OAK_FRONTLINE_DYS, rota: "A", quals: OAK_FRONTLINE_DYS.map((q, i) => qual(q, 120 + i * 40, 24)) },
  { id: "STAFF-ROISIN", profile: "frontline", expected: OAK_FRONTLINE, rota: "B", quals: OAK_FRONTLINE.map((q, i) => qual(q, 120 + i * 40, 24)) },
  { id: "STAFF-KEVIN", profile: "frontline", expected: OAK_FRONTLINE, rota: "B", quals: OAK_FRONTLINE.map((q, i) => qual(q, 120 + i * 40, 24)) },
  { id: "STAFF-FIONA", profile: "frontline", expected: RIV_FRONTLINE, rota: "A", quals: RIV_FRONTLINE.map((q, i) => qual(q, 120 + i * 40, 24)) },
  { id: "STAFF-MAEVE", profile: "frontline", expected: RIV_FRONTLINE, rota: "B", quals: RIV_FRONTLINE.map((q, i) => qual(q, 120 + i * 40, 24)) },
  { id: "STAFF-DARRAGH", profile: "frontline", expected: RIV_FRONTLINE, rota: "B", quals: RIV_FRONTLINE.map((q, i) => qual(q, 120 + i * 40, 24)) },
  { id: "STAFF-CONOR", profile: "frontline", expected: ELM_FRONTLINE, rota: "A", quals: ELM_FRONTLINE.map((q, i) => qual(q, 120 + i * 40, 24)) },
  { id: "STAFF-AINE", profile: "frontline", expected: ELM_FRONTLINE, rota: "B", quals: ELM_FRONTLINE.map((q, i) => qual(q, 120 + i * 40, 24)) },
  // Ciarán — Governance viewer. Not counted anywhere in compliance.
  {
    id: "STAFF-CIARAN", profile: "governance_view_only", expected: [], rota: "A", shiftPreference: "day",
    quals: [],
  },
];

const staff: StaffMember[] = staffSeeds
  .filter((seed) => {
    const s = STAFF_BY_ID[seed.id];
    return s && !s.external;
  })
  .map((seed) => {
    const s = STAFF_BY_ID[seed.id];
    const scope = s.scopeSiteIds.length ? s.scopeSiteIds : (["SITE-OAK"] as SiteId[]);
    return {
      id: seed.id,
      name: s.name,
      role: s.roleLabel,
      primarySiteId: scope[0],
      assignedSiteIds: [...scope],
      qualifications: seed.quals,
      rotaPattern: seed.rota,
      shiftPreference: seed.shiftPreference,
      operationalProfile: seed.profile,
      expectedQualificationIds: [...seed.expected],
    };
  });

// ---------- Rota ----------

function mondayOf(d: Date): Date {
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(d, offset);
}

const ROTA_ANCHOR = mondayOf(TODAY);

export function rotaIndexFor(date: string): { week: 0 | 1; dow: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - ROTA_ANCHOR.getTime()) / 86400000);
  const cycle = ((diffDays % 14) + 14) % 14;
  return { week: (cycle < 7 ? 0 : 1) as 0 | 1, dow: cycle % 7 };
}

export function staffWorksOn(member: StaffMember, date: string): boolean {
  const { week, dow } = rotaIndexFor(date);
  if (member.rotaPattern === "A") {
    if (week === 0) return dow <= 2;
    return dow <= 3;
  }
  if (week === 0) return dow >= 3;
  return dow >= 4;
}

export function rotaLabel(member: StaffMember): string {
  return member.rotaPattern === "A" ? "Rota A · 3-on / 4-on" : "Rota B · 4-on / 3-on";
}

// ---------- Shift seed (Oakfield only for the demo) ----------

function seedShifts(): ShiftAssignment[] {
  const list: ShiftAssignment[] = [];
  const monday = ROTA_ANCHOR;
  // Use only registry Oakfield staff (frontline + leadership).
  const dayBase: StaffId[][] = [
    ["STAFF-DANIEL", "STAFF-EMMA", "STAFF-AISLING", "STAFF-LIAM"], // Mon
    ["STAFF-DANIEL", "STAFF-EMMA", "STAFF-AISLING", "STAFF-LIAM"], // Tue
    ["STAFF-SIOBHAN", "STAFF-EMMA", "STAFF-AISLING", "STAFF-LIAM"], // Wed
    ["STAFF-DANIEL", "STAFF-EMMA", "STAFF-AISLING", "STAFF-LIAM"], // Thu
    ["STAFF-DANIEL", "STAFF-EMMA", "STAFF-AISLING", "STAFF-LIAM"], // Fri
    ["STAFF-DANIEL", "STAFF-EMMA", "STAFF-AISLING", "STAFF-LIAM"], // Sat
    ["STAFF-SIOBHAN", "STAFF-EMMA", "STAFF-AISLING", "STAFF-LIAM"], // Sun
  ];
  const nightBase: StaffId[][] = [
    ["STAFF-EMMA", "STAFF-LIAM"],
    ["STAFF-AISLING", "STAFF-LIAM"],
    ["STAFF-EMMA", "STAFF-LIAM"],
    ["STAFF-AISLING", "STAFF-LIAM"],
    ["STAFF-EMMA", "STAFF-LIAM"],
    ["STAFF-AISLING", "STAFF-LIAM"],
    ["STAFF-EMMA", "STAFF-LIAM"],
  ];
  for (let w = 0; w < 4; w++) {
    for (let dow = 0; dow < 7; dow++) {
      const date = iso(addDays(monday, w * 7 + dow));
      list.push({ id: `sh-SITE-OAK-${date}-day`,   siteId: "SITE-OAK", date, shift: "day",   staffIds: [...dayBase[dow]] });
      list.push({ id: `sh-SITE-OAK-${date}-night`, siteId: "SITE-OAK", date, shift: "night", staffIds: [...nightBase[dow]] });
    }
  }
  return list;
}

// ---------- State + pub/sub ----------

let state = {
  sites,
  qualificationTypes,
  staff,
  requirements: siteRequirements,
  shifts: seedShifts(),
};

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() { listeners.forEach((l) => l()); }

export const workforceStore = {
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
  getSites(): Site[] { return state.sites; },
  getStaff(): StaffMember[] { return state.staff; },
  getQualificationTypes(): QualificationType[] { return state.qualificationTypes; },
  getRequirements(): SiteRequirement[] { return state.requirements; },
  getShifts(): ShiftAssignment[] { return state.shifts; },
  getSite(id: string) { return state.sites.find((s) => s.id === id); },
  getStaffMember(id: string) { return state.staff.find((s) => s.id === id); },
  getQualType(id: string) { return state.qualificationTypes.find((q) => q.id === id); },

  addQualificationType(input: { name: string; critical?: boolean; defaultValidityMonths?: number }) {
    const id = `q-${Date.now().toString(36)}`;
    const newType: QualificationType = {
      id,
      name: input.name.trim() || "Untitled qualification",
      critical: !!input.critical,
      defaultValidityMonths: Math.max(1, input.defaultValidityMonths ?? 12),
    };
    state.qualificationTypes = [...state.qualificationTypes, newType];
    emit();
    return newType;
  },
  updateQualificationType(id: string, patch: Partial<Omit<QualificationType, "id">>) {
    state.qualificationTypes = state.qualificationTypes.map((t) => t.id === id ? { ...t, ...patch } : t);
    emit();
  },
  removeQualificationType(id: string) {
    state.qualificationTypes = state.qualificationTypes.filter((t) => t.id !== id);
    state.staff = state.staff.map((s) => ({ ...s, qualifications: s.qualifications.filter((q) => q.qualificationId !== id) }));
    state.requirements = state.requirements.filter((r) => r.qualificationId !== id);
    emit();
  },
  addQualification(staffId: string, q: StaffQualification) {
    const m = state.staff.find((s) => s.id === staffId);
    if (!m) return;
    m.qualifications = m.qualifications.filter((x) => x.qualificationId !== q.qualificationId).concat(q);
    emit();
  },
  removeQualification(staffId: string, qualificationId: string) {
    const m = state.staff.find((s) => s.id === staffId);
    if (!m) return;
    m.qualifications = m.qualifications.filter((x) => x.qualificationId !== qualificationId);
    emit();
  },
  addRequirement(req: Omit<SiteRequirement, "id">) {
    state.requirements = [...state.requirements, { ...req, id: `r-${Date.now().toString(36)}` }];
    emit();
  },
  updateRequirement(id: string, patch: Partial<SiteRequirement>) {
    state.requirements = state.requirements.map((r) => r.id === id ? { ...r, ...patch } : r);
    emit();
  },
  removeRequirement(id: string) {
    state.requirements = state.requirements.filter((r) => r.id !== id);
    emit();
  },
  assignStaff(shiftId: string, staffId: StaffId) {
    const sh = state.shifts.find((s) => s.id === shiftId);
    if (!sh) return;
    if (!sh.staffIds.includes(staffId)) sh.staffIds = [...sh.staffIds, staffId];
    emit();
  },
  removeStaffFromShift(shiftId: string, staffId: StaffId) {
    const sh = state.shifts.find((s) => s.id === shiftId);
    if (!sh) return;
    sh.staffIds = sh.staffIds.filter((id) => id !== staffId);
    emit();
  },
  replaceStaff(shiftId: string, outId: StaffId, inId: StaffId) {
    const sh = state.shifts.find((s) => s.id === shiftId);
    if (!sh) return;
    sh.staffIds = sh.staffIds.map((id) => (id === outId ? inId : id));
    emit();
  },
};

// ---------- Stable qualification source ids ----------

export function qualificationSourceId(staffId: StaffId, qualificationId: string): string {
  const railKey = qualificationId.replace(/^q-/, "").replace(/-/g, "").toUpperCase();
  return `QUAL-${railKey}-${staffId}`;
}

export function resolveQualificationSource(id: string): { staff?: StaffMember; qualification?: QualificationType } {
  if (!id.startsWith("QUAL-")) return {};
  const rest = id.slice("QUAL-".length);
  const staffIdx = rest.indexOf("-STAFF-");
  if (staffIdx < 0) return {};
  const railKey = rest.slice(0, staffIdx);
  const staffId = rest.slice(staffIdx + 1) as StaffId;
  const staff = state.staff.find((s) => s.id === staffId);
  const qualification = state.qualificationTypes.find(
    (t) => t.id.replace(/^q-/, "").replace(/-/g, "").toUpperCase() === railKey,
  );
  return { staff, qualification };
}

// ---------- Aggregations ----------

export interface PerQualBreakdown {
  qualification: QualificationType;
  status: RagStatus | "missing" | "not_required";
  expiresOn?: string;
  daysLeft?: number;
}

export function staffStatus(member: StaffMember, asOf: Date = TODAY): {
  overall: RagStatus;
  perQual: PerQualBreakdown[];
  missingCritical: QualificationType[];
} {
  const types = state.qualificationTypes;
  const expected = new Set(member.expectedQualificationIds);
  const perQual: PerQualBreakdown[] = types.map((t) => {
    const q = member.qualifications.find((x) => x.qualificationId === t.id);
    if (!expected.has(t.id)) {
      // Not required for this staff — never flagged as missing.
      if (q) return { qualification: t, status: qualificationStatus(q, asOf), expiresOn: q.expiresOn, daysLeft: daysToExpiry(q, asOf) };
      return { qualification: t, status: "not_required" };
    }
    if (!q) return { qualification: t, status: "missing" };
    return { qualification: t, status: qualificationStatus(q, asOf), expiresOn: q.expiresOn, daysLeft: daysToExpiry(q, asOf) };
  });
  const missingCritical = perQual
    .filter((p) => p.status === "missing" && p.qualification.critical)
    .map((p) => p.qualification);

  let overall: RagStatus = "green";
  const relevant = perQual.filter((p) => expected.has(p.qualification.id));
  if (relevant.some((p) => p.status === "red" || (p.status === "missing" && p.qualification.critical))) overall = "red";
  else if (relevant.some((p) => p.status === "amber")) overall = "amber";
  return { overall, perQual, missingCritical };
}

// ---------- Guardrail-aware compliance ----------

/** Staff counted in the compliance denominator (excludes governance_view_only). */
export function countedStaff(): StaffMember[] {
  return state.staff.filter((s) => s.operationalProfile !== "governance_view_only");
}

interface ComplianceRecord {
  staff: StaffMember;
  qualificationId: string;
  compliant: boolean;
  critical: boolean;
}

/**
 * Requirement-based population: (staff × their expected requirements at
 * assigned sites). Governance/view-only staff contribute 0.
 */
export function complianceRecords(scopedSiteIds?: SiteId[]): ComplianceRecord[] {
  const scope = scopedSiteIds ? new Set(scopedSiteIds) : null;
  const records: ComplianceRecord[] = [];
  for (const s of countedStaff()) {
    const staffSites = scope ? s.assignedSiteIds.filter((id) => scope.has(id)) : s.assignedSiteIds;
    if (staffSites.length === 0) continue;
    // Union of required rails at their assigned in-scope sites.
    const siteReqRails = new Set<string>();
    for (const siteId of staffSites) {
      for (const r of state.requirements) if (r.siteId === siteId) siteReqRails.add(r.qualificationId);
    }
    for (const qid of s.expectedQualificationIds) {
      if (!siteReqRails.has(qid)) continue;
      const type = state.qualificationTypes.find((t) => t.id === qid);
      const q = s.qualifications.find((x) => x.qualificationId === qid);
      const status = q ? qualificationStatus(q) : "red";
      const compliant = status === "green" || status === "amber";
      records.push({ staff: s, qualificationId: qid, compliant, critical: !!type?.critical });
    }
  }
  return records;
}

export function overallCompliancePct(scopedSiteIds?: SiteId[]): number {
  const recs = complianceRecords(scopedSiteIds);
  if (recs.length === 0) return 100;
  const ok = recs.filter((r) => r.compliant).length;
  return Math.round((ok / recs.length) * 100);
}

export function highRiskGapCount(scopedSiteIds?: SiteId[]): number {
  return complianceRecords(scopedSiteIds).filter((r) => r.critical && !r.compliant).length;
}

export function siteRequirementsNotMet(scopedSiteIds?: SiteId[]): { siteId: SiteId; qualificationId: string; qualificationName: string }[] {
  const scope = scopedSiteIds ? new Set(scopedSiteIds) : null;
  const out: { siteId: SiteId; qualificationId: string; qualificationName: string }[] = [];
  for (const r of state.requirements) {
    if (scope && !scope.has(r.siteId)) continue;
    const eligible = countedStaff().filter((s) => s.assignedSiteIds.includes(r.siteId) && s.expectedQualificationIds.includes(r.qualificationId));
    const anyCompliant = eligible.some((s) => {
      const q = s.qualifications.find((x) => x.qualificationId === r.qualificationId);
      if (!q) return false;
      const st = qualificationStatus(q);
      return st === "green" || st === "amber";
    });
    if (!anyCompliant) {
      const type = state.qualificationTypes.find((t) => t.id === r.qualificationId);
      out.push({ siteId: r.siteId, qualificationId: r.qualificationId, qualificationName: type?.name ?? r.qualificationId });
    }
  }
  return out;
}

// ---------- Coverage ----------

export interface CoverageGap { qualificationId: string; qualificationName: string; required: number; current: number; }
export interface CoverageWarning { level: "red" | "amber"; message: string; }
export interface CoverageResult {
  status: CoverageStatus;
  metRequirements: { qualificationId: string; required: number; current: number }[];
  gaps: CoverageGap[];
  warnings: CoverageWarning[];
}

export function shiftCoverage(shift: ShiftAssignment, asOf: Date = TODAY): CoverageResult {
  const reqs = state.requirements.filter(
    (r) => r.siteId === shift.siteId && (r.appliesTo === "both" || r.appliesTo === shift.shift),
  );
  const assignedStaff = shift.staffIds
    .map((id) => state.staff.find((s) => s.id === id))
    .filter(Boolean) as StaffMember[];

  const gaps: CoverageGap[] = [];
  const met: { qualificationId: string; required: number; current: number }[] = [];
  const warnings: CoverageWarning[] = [];

  for (const r of reqs) {
    const type = state.qualificationTypes.find((t) => t.id === r.qualificationId);
    const name = type?.name ?? r.qualificationId;
    let current = 0;
    let expiringSoon = 0;
    const expiredAssigned: StaffMember[] = [];
    for (const s of assignedStaff) {
      const q = s.qualifications.find((x) => x.qualificationId === r.qualificationId);
      if (!q) continue;
      const status = qualificationStatus(q, asOf);
      if (status === "red") { expiredAssigned.push(s); continue; }
      current++;
      if (status === "amber") expiringSoon++;
    }
    if (current < r.minimumPerShift) {
      gaps.push({ qualificationId: r.qualificationId, qualificationName: name, required: r.minimumPerShift, current });
      warnings.push({
        level: "red",
        message: expiredAssigned[0]
          ? `${expiredAssigned[0].name}'s ${name} certification has expired and no other assigned staff covers this requirement.`
          : `${name} coverage not met (${current}/${r.minimumPerShift}).`,
      });
    } else {
      met.push({ qualificationId: r.qualificationId, required: r.minimumPerShift, current });
      if (expiredAssigned.length > 0) warnings.push({ level: "amber", message: `${expiredAssigned[0].name}'s ${name} has expired. Another assigned staff member is covering this requirement.` });
      if (expiringSoon > 0) warnings.push({ level: "amber", message: `${name} expires soon for an assigned staff member.` });
    }
  }

  let status: CoverageStatus;
  if (assignedStaff.length === 0 && reqs.length > 0) status = "uncovered";
  else if (gaps.length > 0) status = "uncovered";
  else if (warnings.some((w) => w.level === "red")) status = "uncovered";
  else if (warnings.some((w) => w.level === "amber")) status = "at_risk";
  else status = "covered";

  const seen = new Set<string>();
  const dedup: CoverageWarning[] = [];
  for (const w of warnings) {
    const k = `${w.level}|${w.message}`;
    if (!seen.has(k)) { seen.add(k); dedup.push(w); }
  }
  return { status, metRequirements: met, gaps, warnings: dedup };
}

export type ShiftIssue = DemoIssue;

export function getShiftIssue(shift: ShiftAssignment, asOf: Date = new Date(shift.date)): ShiftIssue | undefined {
  const cov = shiftCoverage(shift, asOf);
  if (cov.status === "covered") return undefined;
  const reqs = state.requirements.filter(
    (r) => r.siteId === shift.siteId && (r.appliesTo === "both" || r.appliesTo === shift.shift),
  );
  const assigned = shift.staffIds
    .map((id) => state.staff.find((s) => s.id === id))
    .filter(Boolean) as StaffMember[];

  if (cov.status === "uncovered" && cov.gaps.length > 0) {
    const gap = cov.gaps[0];
    const expiredStaff = assigned.find((s) => {
      const q = s.qualifications.find((x) => x.qualificationId === gap.qualificationId);
      return q && qualificationStatus(q, asOf) === "red";
    });
    if (expiredStaff) {
      const q = expiredStaff.qualifications.find((x) => x.qualificationId === gap.qualificationId)!;
      const dleft = daysToExpiry(q, asOf);
      return {
        kind: "uncovered",
        staffId: expiredStaff.id, staffName: expiredStaff.name,
        qualificationId: gap.qualificationId, qualificationName: gap.qualificationName,
        detail: `expired ${Math.abs(dleft)} day${Math.abs(dleft) === 1 ? "" : "s"} ago`,
        gapReason: `${expiredStaff.name}'s ${gap.qualificationName} has expired and no other assigned staff member covers this requirement.`,
        suggestedAction: `Assign a staff member with valid ${gap.qualificationName}, or upload renewed certification evidence for ${expiredStaff.name}.`,
      };
    }
    return {
      kind: "uncovered", staffId: "", staffName: "—",
      qualificationId: gap.qualificationId, qualificationName: gap.qualificationName,
      detail: `not covered (${gap.current}/${gap.required})`,
      gapReason: `${gap.qualificationName} requirement is not met (${gap.current}/${gap.required}).`,
      suggestedAction: `Assign a staff member with valid ${gap.qualificationName} to this shift.`,
    };
  }
  for (const r of reqs) {
    const type = state.qualificationTypes.find((t) => t.id === r.qualificationId);
    for (const s of assigned) {
      const q = s.qualifications.find((x) => x.qualificationId === r.qualificationId);
      if (!q) continue;
      const st = qualificationStatus(q, asOf);
      const days = daysToExpiry(q, asOf);
      if (st === "amber") {
        return {
          kind: "attention", staffId: s.id, staffName: s.name,
          qualificationId: r.qualificationId, qualificationName: type?.name ?? r.qualificationId,
          detail: `expires in ${days} day${days === 1 ? "" : "s"}`,
          gapReason: `${s.name}'s ${type?.name} expires in ${days} day${days === 1 ? "" : "s"}. Coverage is still met for this shift, but the certificate must be renewed before it lapses.`,
          suggestedAction: `Request updated ${type?.name} certificate from ${s.name} before it expires.`,
        };
      }
      if (st === "red") {
        return {
          kind: "attention", staffId: s.id, staffName: s.name,
          qualificationId: r.qualificationId, qualificationName: type?.name ?? r.qualificationId,
          detail: `expired ${-days} day${-days === 1 ? "" : "s"} ago`,
          gapReason: `${s.name}'s ${type?.name} has expired. Another assigned staff member is currently covering this requirement.`,
          suggestedAction: `Upload renewed ${type?.name} certificate for ${s.name}, or replace on shift.`,
        };
      }
    }
  }
  return undefined;
}

// ---------- Reporting ----------

export interface ReportFilters {
  siteId?: string;
  staffId?: string;
  qualificationId?: string;
  shift?: ShiftType | "all";
  status?: CoverageStatus | "all";
  fromDate?: string;
  toDate?: string;
}

export interface ReportRow {
  shiftId: string;
  date: string;
  shift: ShiftType;
  siteName: string;
  unit?: string;
  staff: { id: string; name: string; role: string; relevantQuals: { name: string; status: RagStatus | "missing"; expiresOn?: string }[] }[];
  requirements: { name: string; required: number; current: number }[];
  status: CoverageStatus;
  warnings: CoverageWarning[];
}

export function runReport(filters: ReportFilters): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const sh of state.shifts) {
    if (filters.siteId && sh.siteId !== filters.siteId) continue;
    if (filters.shift && filters.shift !== "all" && sh.shift !== filters.shift) continue;
    if (filters.fromDate && sh.date < filters.fromDate) continue;
    if (filters.toDate && sh.date > filters.toDate) continue;
    if (filters.staffId && !sh.staffIds.includes(filters.staffId as StaffId)) continue;
    const asOf = new Date(sh.date);
    const cov = shiftCoverage(sh, asOf);
    if (filters.status && filters.status !== "all" && cov.status !== filters.status) continue;
    const site = state.sites.find((s) => s.id === sh.siteId);
    const reqs = state.requirements.filter(
      (r) => r.siteId === sh.siteId && (r.appliesTo === "both" || r.appliesTo === sh.shift),
    );
    if (filters.qualificationId && !reqs.some((r) => r.qualificationId === filters.qualificationId)) continue;
    const staffRows = sh.staffIds.map((id) => {
      const m = state.staff.find((s) => s.id === id);
      if (!m) return null;
      const relevantQuals = reqs.map((r) => {
        const q = m.qualifications.find((x) => x.qualificationId === r.qualificationId);
        const t = state.qualificationTypes.find((tt) => tt.id === r.qualificationId);
        if (!q) return { name: t?.name ?? r.qualificationId, status: "missing" as const };
        return { name: t?.name ?? r.qualificationId, status: qualificationStatus(q, asOf), expiresOn: q.expiresOn };
      });
      return { id: m.id, name: m.name, role: m.role, relevantQuals };
    }).filter(Boolean) as ReportRow["staff"];

    rows.push({
      shiftId: sh.id, date: sh.date, shift: sh.shift,
      siteName: site?.name ?? sh.siteId, unit: site?.unit,
      staff: staffRows,
      requirements: reqs.map((r) => {
        const t = state.qualificationTypes.find((tt) => tt.id === r.qualificationId);
        const current = staffRows.reduce((n, s) => {
          const rq = s.relevantQuals.find((q) => q.name === t?.name);
          return n + (rq && rq.status !== "missing" && rq.status !== "red" ? 1 : 0);
        }, 0);
        return { name: t?.name ?? r.qualificationId, required: r.minimumPerShift, current };
      }),
      status: cov.status, warnings: cov.warnings,
    });
  }
  rows.sort((a, b) => (a.date === b.date ? a.shift.localeCompare(b.shift) : a.date.localeCompare(b.date)));
  return rows;
}

export function exportReportCsv(rows: ReportRow[]): string {
  const header = ["Date", "Shift", "Site", "Unit", "Coverage status", "Staff on duty", "Roles", "Required competencies", "Met / Required", "Warnings"];
  const lines = [header.join(",")];
  for (const r of rows) {
    const staffStr = r.staff.map((s) => s.name).join("; ");
    const roles = r.staff.map((s) => s.role).join("; ");
    const reqs = r.requirements.map((q) => q.name).join("; ");
    const met = r.requirements.map((q) => `${q.current}/${q.required}`).join("; ");
    const warn = r.warnings.map((w) => `[${w.level.toUpperCase()}] ${w.message}`).join(" | ");
    const cells = [r.date, r.shift, r.siteName, r.unit ?? "", r.status, staffStr, roles, reqs, met, warn];
    lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Overview aggregations (used by legacy KPI tiles) ----------

export function todayString(): string { return iso(TODAY); }

/** Only counted staff (excludes governance_view_only). */
export function expiringSoonCount(): number {
  let n = 0;
  for (const s of countedStaff()) for (const q of s.qualifications) {
    if (s.expectedQualificationIds.includes(q.qualificationId) && qualificationStatus(q) === "amber") n++;
  }
  return n;
}
export function expiredCount(): number {
  let n = 0;
  for (const s of countedStaff()) for (const q of s.qualifications) {
    if (s.expectedQualificationIds.includes(q.qualificationId) && qualificationStatus(q) === "red") n++;
  }
  return n;
}
export function missingCriticalCount(): number {
  let n = 0;
  for (const s of countedStaff()) n += staffStatus(s).missingCritical.length;
  return n;
}

export function todaysCoverageBreakdown(): { covered: number; at_risk: number; uncovered: number } {
  const today = todayString();
  const out = { covered: 0, at_risk: 0, uncovered: 0 };
  for (const sh of state.shifts.filter((s) => s.date === today)) {
    const cov = shiftCoverage(sh);
    out[cov.status]++;
  }
  return out;
}

export function ragColorClasses(status: RagStatus | CoverageStatus | "missing" | "not_required"): { bg: string; text: string; border: string; dot: string; label: string } {
  switch (status) {
    case "green":
    case "covered":
      return { bg: "bg-success/10", text: "text-success", border: "border-success/20", dot: "bg-success", label: status === "covered" ? "Covered" : "Current" };
    case "amber":
    case "at_risk":
      return { bg: "bg-warning/10", text: "text-warning", border: "border-warning/20", dot: "bg-warning", label: status === "at_risk" ? "Attention needed" : "Expiring" };
    case "red":
    case "uncovered":
      return { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/20", dot: "bg-destructive", label: status === "uncovered" ? "Uncovered" : "Expired" };
    case "missing":
      return { bg: "bg-muted", text: "text-muted-foreground", border: "border-border", dot: "bg-muted-foreground", label: "Missing" };
    case "not_required":
      return { bg: "bg-muted/50", text: "text-muted-foreground", border: "border-border", dot: "bg-muted-foreground/40", label: "Not required" };
  }
}

// ---------- Future risk projection ----------

export interface CoverageRiskRow {
  shiftId: string;
  date: string;
  shift: ShiftType;
  siteName: string;
  unit?: string;
  staffName: string;
  qualificationName: string;
  impact: "Uncovered" | "Attention needed";
  detail: string;
  suggestedAction: string;
}
export interface OngoingCoverageGap {
  staffName: string;
  qualificationName: string;
  affectedShifts: number;
  firstDate: string;
  impact: "Uncovered" | "Attention needed";
  suggestedAction: string;
}
export interface FutureRisksResult { rows: CoverageRiskRow[]; ongoing: OngoingCoverageGap[]; }

export function futureCoverageRisks(filters: { siteId?: string; fromDate?: string; toDate?: string } = {}): FutureRisksResult {
  const today = iso(TODAY);
  const from = filters.fromDate ?? today;
  const to = filters.toDate;
  const rows: CoverageRiskRow[] = [];
  for (const sh of state.shifts) {
    if (filters.siteId && sh.siteId !== filters.siteId) continue;
    if (sh.date < from) continue;
    if (to && sh.date > to) continue;
    const issue = getShiftIssue(sh);
    if (!issue) continue;
    const site = state.sites.find((s) => s.id === sh.siteId);
    rows.push({
      shiftId: sh.id, date: sh.date, shift: sh.shift,
      siteName: site?.name ?? sh.siteId, unit: site?.unit,
      staffName: issue.staffName, qualificationName: issue.qualificationName,
      impact: issue.kind === "uncovered" ? "Uncovered" : "Attention needed",
      detail: issue.detail, suggestedAction: issue.suggestedAction,
    });
  }
  rows.sort((a, b) => (a.date === b.date ? a.shift.localeCompare(b.shift) : a.date.localeCompare(b.date)));
  const groups = new Map<string, CoverageRiskRow[]>();
  for (const r of rows) {
    const k = `${r.staffName}|${r.qualificationName}`;
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }
  const ongoing: OngoingCoverageGap[] = [];
  for (const [, arr] of groups) {
    if (arr.length < 2) continue;
    const worst: "Uncovered" | "Attention needed" = arr.some((r) => r.impact === "Uncovered") ? "Uncovered" : "Attention needed";
    ongoing.push({
      staffName: arr[0].staffName,
      qualificationName: arr[0].qualificationName,
      affectedShifts: arr.length,
      firstDate: arr[0].date,
      impact: worst,
      suggestedAction: arr[0].suggestedAction,
    });
  }
  ongoing.sort((a, b) => b.affectedShifts - a.affectedShifts);
  return { rows, ongoing };
}

// Re-export site name helper for consumers that still need string labels.
export { getSiteName };
