// Home visits store — visit templates (the care schedule) and generated visits.
// In-memory store, demo-only. Subscribe pattern matches tasksStore.
// Clients and staff are referenced by ID only; names come from serviceUsersStore / STAFF.
import { useSyncExternalStore } from "react";
import { PEOPLE_SUPPORTED, STAFF, type ServiceUserId, type StaffId, type SiteId } from "./demoDataRegistry";
import { timedVisitStatus } from "./visitRules";
import { serviceUsersStore } from "./serviceUsersStore";
import { assignmentStatus, canEditRoster, isRosterEditable, scheduleConflicts, startOfWeek, RosterConflictError, carersRequiredFor } from "./rosterRules";
import type { RoleState } from "./roleStore";
import { cloneVisitSchedule, validateVisitSchedule, type CarePlanVisitTemplate } from "./carePlanVisitSchedule";

// 0 = Sunday … 6 = Saturday (matches Date.getDay)
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type VisitCallType = "morning" | "lunch" | "tea" | "bed";
export type MedicationSupportLevel = "prompt" | "assist" | "administer";
export type VisitStatus = "scheduled" | "in_progress" | "completed" | "late" | "missed" | "cancelled";

export interface VisitMedication {
  name: string;
  dose?: string;
  supportLevel: MedicationSupportLevel;
}

export interface VisitTemplate {
  id: string;
  carePlanVersionId?: string;
  supersededAt?: string;
  clientId: ServiceUserId;
  callType: VisitCallType;
  daysOfWeek: Weekday[];
  /** Earliest and latest start, "HH:MM". */
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
  carersRequired: number;
  tasks: string[];
  medications: VisitMedication[];
  /** Recurring requirement metadata (roster). Service area derives from the client. */
  name?: string;
  activeFrom?: string;
  activeUntil?: string;
  active?: boolean;
}

export type RosterStatus = "draft" | "published";
export type RosterChangeKind = "created" | "changed" | "assigned" | "removed" | "replaced" | "second_carer_added" | "conflict_overridden" | "cancelled" | "roster_status_changed";
/** Append-only roster audit entry. Actor is a staff ID; names are display labels only. */
export interface RosterChange { id: string; kind: RosterChangeKind; actorStaffId: StaffId; actorRole: string; at: string; previous?: string; next?: string; reason?: string }
export const ORGANISATION_ID = "ORG-LOGUP-HOMECARE";

export interface CheckLocation { lat: number; lng: number; accuracyM?: number }
export type TaskOutcome = "done" | "part_completed" | "refused" | "not_needed" | "concern";
export type MedicationOutcome = "given" | "prompted" | "refused" | "not_available";
export interface VisitTaskRecord { index: number; task: string; outcome: TaskOutcome; recordedByStaffId: StaffId; recordedAt: string }
export interface VisitMedicationRecord { index: number; medication: VisitMedication; outcome: MedicationOutcome; reason: string; recordedByStaffId: StaffId; recordedAt: string }
export interface VisitLog { id: string; recordedByStaffId: StaffId; recordedAt: string; tasks: VisitTaskRecord[]; medications: VisitMedicationRecord[] }

export interface Visit {
  id: string;
  templateId?: string;
  clientId: ServiceUserId;
  staffIds: StaffId[];
  scheduledStart: string; // ISO
  scheduledEnd: string;   // ISO
  checkInAt?: string;
  checkOutAt?: string;
  checkInLocation?: CheckLocation;
  status: VisitStatus;
  checkInByStaffId?: StaffId;
  taskRecords?: VisitTaskRecord[];
  medicationRecords?: VisitMedicationRecord[];
  log?: VisitLog;
  sosEventIds?: string[];
  scheduleChange?: { carePlanVersionId: string; byStaffId: StaffId; at: string; reason: string };
  // Roster (scheduling) fields — separate from delivery status above.
  organisationId?: string;
  serviceAreaId?: SiteId;
  expectedDurationMinutes?: number;
  carersRequired?: number;
  rosterStatus?: RosterStatus;
  notesForScheduler?: string;
  /** One-off visit purpose / expected support. */
  purpose?: string;
  createdBy?: StaffId | "system";
  createdAt?: string;
  lastUpdatedBy?: StaffId | "system";
  lastUpdatedAt?: string;
  rosterHistory?: RosterChange[];
}

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: "Scheduled", in_progress: "In progress", completed: "Completed",
  late: "Late", missed: "Missed", cancelled: "Cancelled",
};
export const MEDICATION_SUPPORT_LABELS: Record<MedicationSupportLevel, string> = {
  prompt: "Prompt", assist: "Assist", administer: "Administer",
};

// ---------- Seed ----------

const ALL_DAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const DAYS_AHEAD = 14;
export const CALL_NAMES: Record<VisitCallType, string> = { morning: "Morning support", lunch: "Lunch call", tea: "Afternoon / tea call", bed: "Evening / bed call" };

const CALLS: Record<VisitCallType, { start: string; end: string; minutes: number; tasks: string[] }> = {
  morning: { start: "07:30", end: "09:00", minutes: 45, tasks: ["Personal care and wash", "Help to dress", "Prepare breakfast", "Empty commode / check continence"] },
  lunch:   { start: "12:00", end: "13:30", minutes: 30, tasks: ["Prepare lunch", "Encourage fluids", "Tidy kitchen"] },
  tea:     { start: "16:30", end: "18:00", minutes: 30, tasks: ["Prepare tea", "Encourage fluids", "Check home is warm and secure"] },
  bed:     { start: "20:00", end: "21:30", minutes: 30, tasks: ["Help to undress", "Personal care", "Settle in bed", "Lock up and use key safe"] },
};

/** Calls a client gets, from their HSE approved hours (or risk when hours are unknown). */
function callsFor(hours: number | undefined, risk: string): VisitCallType[] {
  const h = hours ?? (risk === "High" ? 18 : risk === "Medium" ? 10 : 5);
  if (h >= 16) return ["morning", "lunch", "tea", "bed"];
  if (h >= 10) return ["morning", "tea", "bed"];
  if (h >= 7) return ["morning", "tea"];
  return ["morning"];
}

const MEDS: VisitMedication[][] = [
  [{ name: "Paracetamol", dose: "1 g", supportLevel: "prompt" }],
  [{ name: "Amlodipine", dose: "5 mg", supportLevel: "assist" }, { name: "Atorvastatin", dose: "20 mg", supportLevel: "prompt" }],
  [{ name: "Levothyroxine", dose: "50 mcg", supportLevel: "administer" }],
  [{ name: "Metformin", dose: "500 mg", supportLevel: "assist" }],
];

const hhmm = (base: string, add: number) => { const [h, m] = base.split(":").map(Number); const t = h * 60 + m + add; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };

function seedTemplates(): VisitTemplate[] {
  const out: VisitTemplate[] = [];
  PEOPLE_SUPPORTED.forEach((p, i) => {
    if (p.status === "discharged" || p.status === "deceased") return;
    const calls = callsFor(p.hseApprovedHoursPerWeek, p.risk);
    const lowNeed = calls.length === 1;
    calls.forEach((c) => {
      const def = CALLS[c];
      const meds = c === "morning" ? MEDS[i % MEDS.length] : c === "bed" && p.risk !== "Low" ? [{ name: "Zopiclone", dose: "3.75 mg", supportLevel: "administer" as const }] : [];
      const tasks = [...def.tasks, ...(p.primaryFocus.includes("Falls") ? ["Check walking frame within reach"] : []), ...(p.primaryFocus.includes("Skin") ? ["Check pressure areas"] : [])];
      const offset = (i % 8) * 15;
      const minutes = c === "morning" && p.risk === "High" ? 60 : c === "tea" && p.risk === "Low" ? 15 : def.minutes;
      out.push({
        id: `VT-${p.id}-${c}`, clientId: p.id, callType: c, name: CALL_NAMES[c], active: true,
        daysOfWeek: lowNeed ? WEEKDAYS : ALL_DAYS,
        windowStart: hhmm(def.start, offset), windowEnd: hhmm(def.end, offset), durationMinutes: minutes,
        carersRequired: p.risk === "High" && (c === "morning" || c === "bed") ? 2 : 1,
        tasks, medications: meds,
      });
    });
  });
  return out;
}

const FRONTLINE_BY_SITE = (siteId: SiteId): StaffId[] =>
  STAFF.filter((s) => s.accessRole === "Frontline" && s.scopeSiteIds.includes(siteId)).map((s) => s.id);

const at = (day: Date, hhmm: string, addMin = 0) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day); d.setHours(h, m + addMin, 0, 0); return d;
};

/**
 * Builds visit instances from recurring requirements. Demo carers are assigned greedily
 * only when free, so some visits are left unassigned for coordinators — the real
 * roster never auto-assigns. Past days of the current week are backfilled as delivered.
 */
function generateVisits(templates: VisitTemplate[], from = new Date(), demoOutcomes = true, existing: readonly Visit[] = []): Visit[] {
  const out: Visit[] = [];
  const today = new Date(from); today.setHours(0, 0, 0, 0);
  const first = demoOutcomes ? startOfWeek(today) : today;
  const now = from.getTime();
  const clientSite = new Map(serviceUsersStore.getState().users.map((p) => [p.id, p] as const));
  const nextWeek = new Date(startOfWeek(today)); nextWeek.setDate(nextWeek.getDate() + 7);
  const busy = (staffId: StaffId, s: number, e: number) => [...existing, ...out].some((v) => v.status !== "cancelled" && v.staffIds.includes(staffId) && Date.parse(v.scheduledStart) < e && Date.parse(v.scheduledEnd) > s);
  let n = 0;
  const totalDays = Math.round((today.getTime() - first.getTime()) / 86400000) + DAYS_AHEAD;
  for (let d = 0; d < totalDays; d++) {
    const day = new Date(first); day.setDate(first.getDate() + d);
    const past = day < today;
    const dow = day.getDay() as Weekday;
    const dayKey = day.toISOString().slice(0, 10);
    const ordered = templates.map((t, ti) => ({ t, ti })).sort((a, b) => a.t.windowStart.localeCompare(b.t.windowStart) || b.t.carersRequired - a.t.carersRequired);
    ordered.forEach(({ t, ti }) => {
      if (!t.daysOfWeek.includes(dow) || t.active === false) return;
      if ((t.activeFrom && dayKey < t.activeFrom) || (t.activeUntil && dayKey > t.activeUntil)) return;
      const client = clientSite.get(t.clientId);
      if (!client) return;
      const pool = FRONTLINE_BY_SITE(client.siteId);
      if (!pool.length) return;
      const rotated = [...pool.slice((d + ti) % pool.length), ...pool.slice(0, (d + ti) % pool.length)];
      const preferred = pool.includes(client.keyWorkerStaffId) && (d + ti) % 3 !== 0 ? [client.keyWorkerStaffId, ...rotated.filter((x) => x !== client.keyWorkerStaffId)] : rotated;
      // Try the preferred start, then up to 105 minutes later, for free carers (demo seeding only).
      let start = at(day, t.windowStart), end = at(day, t.windowStart, t.durationMinutes);
      let staffIds: StaffId[] = [];
      for (let shift = 0; shift <= (demoOutcomes ? 105 : 0); shift += 15) {
        const s0 = at(day, t.windowStart, shift), e0 = at(day, t.windowStart, shift + t.durationMinutes);
        const free = preferred.filter((id) => !busy(id, s0.getTime(), e0.getTime())).slice(0, t.carersRequired);
        if (shift === 0 || free.length > staffIds.length) { start = s0; end = e0; staffIds = free; }
        if (free.length >= t.carersRequired) break;
      }
      if (demoOutcomes && (past || start.getTime() <= now) && staffIds.length < t.carersRequired) return;
      const createdAt = new Date(first.getTime() - 86400000).toISOString();
      const v: Visit = {
        id: t.carePlanVersionId ? `VIS-${dayKey}-${t.id}` : `VIS-${dayKey}-${t.clientId}-${t.callType}`, templateId: t.id,
        clientId: t.clientId, staffIds, scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), status: "scheduled",
        organisationId: ORGANISATION_ID, serviceAreaId: client.siteId, expectedDurationMinutes: t.durationMinutes, carersRequired: t.carersRequired,
        rosterStatus: demoOutcomes && day >= nextWeek ? "draft" : "published",
        createdBy: "system", createdAt, lastUpdatedBy: "system", lastUpdatedAt: createdAt, rosterHistory: [],
      };
      if (demoOutcomes && past && staffIds.length) {
        v.checkInAt = start.toISOString(); v.checkInByStaffId = staffIds[0];
        v.checkOutAt = end.toISOString(); v.status = "completed";
      }
      // Today's calls that have already started get a realistic, deterministic outcome.
      else if (demoOutcomes && d === totalDays - DAYS_AHEAD && start.getTime() <= now) {
        n++;
        if (n % 17 === 0 || !staffIds.length) v.status = timedVisitStatus(v, t, from);
        else {
          const inAt = new Date(start.getTime() + ((n % 4) * 5) * 60000);
          v.checkInAt = inAt.toISOString();
          v.checkInByStaffId = staffIds[0];
          v.checkInLocation = { lat: 51.9 + (n % 10) / 100, lng: -8.0 + (n % 10) / 100, accuracyM: 15 };
          if (end.getTime() <= now) { v.checkOutAt = new Date(inAt.getTime() + t.durationMinutes * 60000).toISOString(); v.status = "completed"; }
          else v.status = "in_progress";
        }
      }
      out.push(v);
    });
  }
  return out;
}

/** Demo one-off visits, including one deliberate, audited overlap override. */
function seedOneOffs(visits: Visit[], from = new Date()): Visit[] {
  const users = serviceUsersStore.getState().users;
  const mk = (clientId: ServiceUserId, dayOffset: number, time: string, minutes: number, purpose: string, staffIds: StaffId[], extra: Partial<Visit> = {}): Visit | undefined => {
    const client = users.find((u) => u.id === clientId);
    if (!client) return undefined;
    const day = new Date(from); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + dayOffset);
    const start = at(day, time), end = at(day, time, minutes);
    const created = new Date(from.getTime() - 2 * 86400000).toISOString();
    return { id: `VIS-ONEOFF-${clientId}-${dayOffset}-${time.replace(":", "")}`, clientId, staffIds, scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), status: "scheduled",
      organisationId: ORGANISATION_ID, serviceAreaId: client.siteId, expectedDurationMinutes: minutes, carersRequired: 1, rosterStatus: "published", purpose,
      createdBy: "STAFF-DANIEL", createdAt: created, lastUpdatedBy: "STAFF-DANIEL", lastUpdatedAt: created,
      rosterHistory: [{ id: `RC-${clientId}-${dayOffset}`, kind: "created", actorStaffId: "STAFF-DANIEL", actorRole: "coordinator", at: created, next: purpose }], ...extra };
  };
  const out = [
    mk("PS-001", 1, "14:00", 60, "Accompany to GP appointment", []),
    mk("PS-002", 2, "15:00", 30, "Welfare check after hospital discharge", []),
    mk("PS-004", 3, "14:30", 45, "Shopping support", []),
  ];
  // Deliberate conflict: Emma is given a welfare call overlapping one of her existing visits.
  const emmaVisit = visits.find((v) => v.staffIds.includes("STAFF-EMMA") && v.status === "scheduled" && Date.parse(v.scheduledStart) > from.getTime() + 86400000);
  if (emmaVisit) {
    const day = new Date(emmaVisit.scheduledStart); const offset = Math.round((new Date(day).setHours(0, 0, 0, 0) - new Date(from).setHours(0, 0, 0, 0)) / 86400000);
    const time = `${String(day.getHours()).padStart(2, "0")}:${String(day.getMinutes()).padStart(2, "0")}`;
    const v = mk("PS-003", offset, time, 15, "Medication prompt (short call)", ["STAFF-EMMA"]);
    if (v) {
      v.rosterHistory = [...(v.rosterHistory ?? []),
        { id: `RC-${v.id}-a`, kind: "assigned", actorStaffId: "STAFF-DANIEL", actorRole: "coordinator", at: v.createdAt!, next: "STAFF-EMMA" },
        { id: `RC-${v.id}-o`, kind: "conflict_overridden", actorStaffId: "STAFF-DANIEL", actorRole: "coordinator", at: v.createdAt!, next: `Overlaps ${emmaVisit.id}`, reason: "Operational cover" }];
      out.push(v);
    }
  }
  return out.filter((v): v is Visit => !!v);
}

// ---------- State + subscribe ----------

interface State { templates: VisitTemplate[]; visits: Visit[] }
const initialTemplates = seedTemplates();
const initialVisits = generateVisits(initialTemplates);
let state: State = { templates: initialTemplates, visits: [...initialVisits, ...seedOneOffs(initialVisits)] };
const appliedScheduleVersions = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
export const getState = (): State => state;

const nowIso = () => new Date().toISOString();
const patchVisit = (id: string, patch: Partial<Visit>) => {
  state = { ...state, visits: state.visits.map((v) => (v.id === id ? { ...v, ...patch } : v)) };
  emit();
};

export const visitsStore = {
  subscribe,
  getState,
  templatesForClient: (clientId: ServiceUserId) => state.templates.filter((t) => t.clientId === clientId && !t.supersededAt),
  applyPublishedSchedule(clientId: ServiceUserId, carePlanVersionId: string, templates: CarePlanVisitTemplate[], byStaffId: StaffId, now = new Date()) {
    const error = validateVisitSchedule(templates);
    if (error) throw new Error(error);
    if (!serviceUsersStore.getById(clientId)) throw new Error("Client not found.");
    if (appliedScheduleVersions.has(`${clientId}:${carePlanVersionId}`)) return;
    const at = now.toISOString();
    const versioned: VisitTemplate[] = cloneVisitSchedule(templates).map((t) => ({ ...t, id: `VT-${clientId}-${carePlanVersionId}-${t.id}`, clientId, carePlanVersionId }));
    const visits = state.visits.map((v) => {
      if (v.clientId !== clientId || v.checkInAt || v.checkOutAt || v.log || v.taskRecords?.length || v.medicationRecords?.length || v.sosEventIds?.length || v.status !== "scheduled" || new Date(v.scheduledStart) < now) return v;
      return { ...v, status: "cancelled" as const, scheduleChange: { carePlanVersionId, byStaffId, at, reason: "Replaced by published care plan schedule" } };
    });
    const active = visits.filter((v) => v.clientId === clientId && v.status !== "cancelled");
    const generated = generateVisits(versioned, now, false, visits).filter((v) => new Date(v.scheduledStart) >= now && !active.some((old) => {
      const oldTemplate = state.templates.find((t) => t.id === old.templateId);
      const nextTemplate = versioned.find((t) => t.id === v.templateId);
      return old.scheduledStart.slice(0, 10) === v.scheduledStart.slice(0, 10) && oldTemplate?.callType === nextTemplate?.callType;
    }));
    const ids = new Set(visits.map((v) => v.id));
    state = { templates: [...state.templates.map((t) => t.clientId === clientId && !t.supersededAt ? { ...t, supersededAt: at } : t), ...versioned], visits: [...visits, ...generated.filter((v) => !ids.has(v.id))] };
    appliedScheduleVersions.add(`${clientId}:${carePlanVersionId}`);
    emit();
  },
  visitsForClient: (clientId: ServiceUserId) => state.visits.filter((v) => v.clientId === clientId),
  visitsForStaff: (staffId: StaffId) => state.visits.filter((v) => v.staffIds.includes(staffId)),
  getVisit: (id: string) => state.visits.find((v) => v.id === id),
  refreshStatuses(now = new Date()) {
    let changed = false;
    const visits = state.visits.map((visit) => {
      const status = timedVisitStatus(visit, state.templates.find((t) => t.id === visit.templateId), now);
      if (status === visit.status) return visit;
      changed = true;
      return { ...visit, status };
    });
    if (changed) { state = { ...state, visits }; emit(); }
  },
  checkIn(id: string, location: CheckLocation, staffId: StaffId) {
    const visit = this.getVisit(id);
    if (!visit || !visit.staffIds.includes(staffId) || visit.checkInAt || visit.status === "completed" || visit.status === "cancelled") throw new Error("This visit cannot be checked in.");
    patchVisit(id, { checkInAt: nowIso(), checkInLocation: location, checkInByStaffId: staffId, status: "in_progress" });
  },
  recordTask(id: string, index: number, outcome: TaskOutcome, staffId: StaffId) {
    const visit = this.getVisit(id);
    const template = state.templates.find((t) => t.id === visit?.templateId);
    if (!visit || !visit.staffIds.includes(staffId) || visit.status !== "in_progress" || !template?.tasks[index]) throw new Error("Check in before recording tasks.");
    const record: VisitTaskRecord = { index, task: template.tasks[index], outcome, recordedByStaffId: staffId, recordedAt: nowIso() };
    patchVisit(id, { taskRecords: [...(visit.taskRecords ?? []), record] });
  },
  recordMedication(id: string, index: number, outcome: MedicationOutcome, reason: string, staffId: StaffId) {
    const visit = this.getVisit(id);
    const medication = state.templates.find((t) => t.id === visit?.templateId)?.medications[index];
    if (!visit || !visit.staffIds.includes(staffId) || visit.status !== "in_progress" || !medication || !reason.trim()) throw new Error("Record an outcome and reason after check-in.");
    patchVisit(id, { medicationRecords: [...(visit.medicationRecords ?? []), { index, medication: { ...medication }, outcome, reason: reason.trim(), recordedByStaffId: staffId, recordedAt: nowIso() }] });
  },
  checkOut(id: string, staffId: StaffId) {
    const visit = this.getVisit(id);
    const template = state.templates.find((t) => t.id === visit?.templateId);
    if (!visit || !visit.staffIds.includes(staffId) || !visit.checkInAt || visit.status !== "in_progress") throw new Error("This visit cannot be checked out.");
    if (template?.tasks.some((_, i) => !visit.taskRecords?.some((r) => r.index === i)) || template?.medications.some((_, i) => !visit.medicationRecords?.some((r) => r.index === i))) throw new Error("Record every task and medication before checking out.");
    const recordedAt = nowIso();
    patchVisit(id, { checkOutAt: recordedAt, status: "completed", log: { id: crypto.randomUUID(), recordedByStaffId: staffId, recordedAt, tasks: [...(visit.taskRecords ?? [])], medications: [...(visit.medicationRecords ?? [])] } });
  },
  linkSos(id: string, eventId: string) {
    const visit = this.getVisit(id);
    if (visit && !visit.sosEventIds?.includes(eventId)) patchVisit(id, { sosEventIds: [...(visit.sosEventIds ?? []), eventId] });
  },
  setStatus(id: string, status: VisitStatus) { patchVisit(id, { status }); },
  reassign(id: string, staffIds: StaffId[]) { patchVisit(id, { staffIds }); },

  // ---------- Roster (human-only scheduling; nothing here auto-assigns) ----------
  /** Replace a visit's carers. Published visits need a reason; overlaps need acknowledgement. */
  assignCarers(id: string, staffIds: StaffId[], actor: RoleState, opts: { reason?: string; acknowledgeConflict?: boolean } = {}) {
    const visit = this.getVisit(id);
    if (!visit) throw new Error("Visit not found.");
    guardEdit(visit, actor);
    const next = [...new Set(staffIds)];
    if (next.length > carersRequiredFor(visit)) throw new Error(`This visit needs ${carersRequiredFor(visit)} carer(s).`);
    const pool = FRONTLINE_BY_SITE(visit.serviceAreaId ?? siteOf(visit.clientId)!);
    if (next.some((s) => !pool.includes(s))) throw new Error("Carers must belong to the client's service area.");
    const added = next.filter((s) => !visit.staffIds.includes(s));
    const removed = visit.staffIds.filter((s) => !next.includes(s));
    if (!added.length && !removed.length) return;
    if (visit.rosterStatus !== "draft" && !opts.reason?.trim()) throw new Error("Give a reason for changing a published visit.");
    const conflicts = scheduleConflicts(state.visits, added, visit.scheduledStart, visit.scheduledEnd, visit.id);
    if (conflicts.length && !opts.acknowledgeConflict) throw new RosterConflictError(conflicts);
    const at = nowIso();
    const entry = (kind: RosterChangeKind, previous?: string, nextValue?: string): RosterChange => ({ id: crypto.randomUUID(), kind, actorStaffId: actor.staffId, actorRole: actor.role, at, previous, next: nextValue, reason: opts.reason?.trim() || undefined });
    const history: RosterChange[] = [];
    if (added.length === 1 && removed.length === 1) history.push(entry("replaced", removed[0], added[0]));
    else {
      removed.forEach((s) => history.push(entry("removed", s, undefined)));
      added.forEach((s) => history.push(entry(visit.staffIds.length - removed.length >= 1 ? "second_carer_added" : "assigned", undefined, s)));
    }
    conflicts.forEach((c) => history.push(entry("conflict_overridden", undefined, `${c.staffId} overlaps ${c.visit.id}`)));
    patchVisit(id, { staffIds: next, lastUpdatedBy: actor.staffId, lastUpdatedAt: at, rosterHistory: [...(visit.rosterHistory ?? []), ...history] });
  },
  /** Reschedule an unstarted visit. Started/completed visits are never rewritten. */
  editVisit(id: string, patch: { start?: string; durationMinutes?: number; carersRequired?: number; notesForScheduler?: string }, actor: RoleState, opts: { reason?: string; acknowledgeConflict?: boolean } = {}) {
    const visit = this.getVisit(id);
    if (!visit) throw new Error("Visit not found.");
    guardEdit(visit, actor);
    const start = patch.start ?? visit.scheduledStart;
    const minutes = patch.durationMinutes ?? (visit.expectedDurationMinutes ?? Math.round((Date.parse(visit.scheduledEnd) - Date.parse(visit.scheduledStart)) / 60000));
    if (!(minutes >= 5 && minutes <= 240)) throw new Error("Duration must be between 5 and 240 minutes.");
    const carers = patch.carersRequired ?? carersRequiredFor(visit);
    if (carers < 1 || carers > 2) throw new Error("Carers required must be 1 or 2.");
    if (carers < visit.staffIds.length) throw new Error("Remove a carer before reducing carers required.");
    const end = new Date(Date.parse(start) + minutes * 60000).toISOString();
    const changes: string[] = [];
    if (start !== visit.scheduledStart) changes.push(`start ${visit.scheduledStart} → ${start}`);
    if (end !== visit.scheduledEnd) changes.push(`end ${visit.scheduledEnd} → ${end}`);
    if (carers !== carersRequiredFor(visit)) changes.push(`carers required ${carersRequiredFor(visit)} → ${carers}`);
    const note = patch.notesForScheduler ?? visit.notesForScheduler;
    if ((note ?? "") !== (visit.notesForScheduler ?? "")) changes.push("scheduler note updated");
    if (!changes.length) return;
    const timing = start !== visit.scheduledStart || end !== visit.scheduledEnd;
    if (timing && visit.rosterStatus !== "draft" && !opts.reason?.trim()) throw new Error("Give a reason for changing a published visit.");
    const conflicts = timing ? scheduleConflicts(state.visits, visit.staffIds, start, end, visit.id) : [];
    if (conflicts.length && !opts.acknowledgeConflict) throw new RosterConflictError(conflicts);
    const at = nowIso();
    const history: RosterChange[] = [{ id: crypto.randomUUID(), kind: "changed", actorStaffId: actor.staffId, actorRole: actor.role, at, previous: undefined, next: changes.join("; "), reason: opts.reason?.trim() || undefined },
      ...conflicts.map((c): RosterChange => ({ id: crypto.randomUUID(), kind: "conflict_overridden", actorStaffId: actor.staffId, actorRole: actor.role, at, next: `${c.staffId} overlaps ${c.visit.id}`, reason: opts.reason?.trim() || undefined }))];
    patchVisit(id, { scheduledStart: start, scheduledEnd: end, expectedDurationMinutes: minutes, carersRequired: carers, notesForScheduler: note?.trim() || undefined, lastUpdatedBy: actor.staffId, lastUpdatedAt: at, rosterHistory: [...(visit.rosterHistory ?? []), ...history] });
  },
  cancelVisit(id: string, reason: string, actor: RoleState) {
    const visit = this.getVisit(id);
    if (!visit) throw new Error("Visit not found.");
    guardEdit(visit, actor);
    if (!reason.trim()) throw new Error("Give a reason for cancelling.");
    const at = nowIso();
    patchVisit(id, { status: "cancelled", lastUpdatedBy: actor.staffId, lastUpdatedAt: at, rosterHistory: [...(visit.rosterHistory ?? []), { id: crypto.randomUUID(), kind: "cancelled", actorStaffId: actor.staffId, actorRole: actor.role, at, previous: visit.status, next: "cancelled", reason: reason.trim() }] });
  },
  /** Publish draft visits in the given area IDs and week. */
  publishVisits(ids: string[], actor: RoleState) {
    const at = nowIso();
    const set = new Set(ids);
    let changed = false;
    const visits = state.visits.map((v) => {
      if (!set.has(v.id) || v.rosterStatus !== "draft" || !canEditRoster(v.serviceAreaId ?? siteOf(v.clientId), actor)) return v;
      changed = true;
      return { ...v, rosterStatus: "published" as const, lastUpdatedBy: actor.staffId, lastUpdatedAt: at, rosterHistory: [...(v.rosterHistory ?? []), { id: crypto.randomUUID(), kind: "roster_status_changed" as const, actorStaffId: actor.staffId, actorRole: actor.role, at, previous: "draft", next: "published" }] };
    });
    if (changed) { state = { ...state, visits }; emit(); }
  },
  createOneOff(input: { clientId: ServiceUserId; start: string; durationMinutes: number; carersRequired: number; purpose: string; staffIds?: StaffId[]; notesForScheduler?: string }, actor: RoleState, opts: { acknowledgeConflict?: boolean } = {}): Visit {
    const client = serviceUsersStore.getById(input.clientId);
    if (!client) throw new Error("Client not found.");
    if (!canEditRoster(client.siteId, actor)) throw new Error("You cannot schedule visits for this service area.");
    if (!input.purpose.trim()) throw new Error("Add the visit purpose.");
    if (!(input.durationMinutes >= 5 && input.durationMinutes <= 240)) throw new Error("Duration must be between 5 and 240 minutes.");
    if (input.carersRequired < 1 || input.carersRequired > 2) throw new Error("Carers required must be 1 or 2.");
    if (Number.isNaN(Date.parse(input.start))) throw new Error("Choose a date and start time.");
    const staffIds = [...new Set(input.staffIds ?? [])];
    if (staffIds.length > input.carersRequired) throw new Error("Too many carers for this visit.");
    const pool = FRONTLINE_BY_SITE(client.siteId);
    if (staffIds.some((s) => !pool.includes(s))) throw new Error("Carers must belong to the client's service area.");
    const end = new Date(Date.parse(input.start) + input.durationMinutes * 60000).toISOString();
    const conflicts = scheduleConflicts(state.visits, staffIds, input.start, end);
    if (conflicts.length && !opts.acknowledgeConflict) throw new RosterConflictError(conflicts);
    const at = nowIso();
    const e = (kind: RosterChangeKind, next?: string): RosterChange => ({ id: crypto.randomUUID(), kind, actorStaffId: actor.staffId, actorRole: actor.role, at, next });
    const visit: Visit = {
      id: `VIS-ONEOFF-${crypto.randomUUID().slice(0, 8)}`, clientId: client.id, staffIds, scheduledStart: new Date(input.start).toISOString(), scheduledEnd: end, status: "scheduled",
      organisationId: ORGANISATION_ID, serviceAreaId: client.siteId, expectedDurationMinutes: input.durationMinutes, carersRequired: input.carersRequired,
      rosterStatus: "draft", purpose: input.purpose.trim(), notesForScheduler: input.notesForScheduler?.trim() || undefined,
      createdBy: actor.staffId, createdAt: at, lastUpdatedBy: actor.staffId, lastUpdatedAt: at,
      rosterHistory: [e("created", input.purpose.trim()), ...staffIds.map((s) => e("assigned", s)), ...conflicts.map((c) => e("conflict_overridden", `${c.staffId} overlaps ${c.visit.id}`))],
    };
    state = { ...state, visits: [...state.visits, visit] };
    emit();
    return visit;
  },
};

function siteOf(clientId: ServiceUserId): SiteId | undefined { return serviceUsersStore.getById(clientId)?.siteId; }
function guardEdit(visit: Visit, actor: RoleState) {
  if (!canEditRoster(visit.serviceAreaId ?? siteOf(visit.clientId), actor)) throw new Error("You cannot change visits in this service area.");
  if (!isRosterEditable(visit)) throw new Error("This visit has started, finished or been cancelled, so its schedule is locked.");
}
export { assignmentStatus };

export function useVisits(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}
