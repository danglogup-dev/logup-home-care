// Roster rules — pure helpers over the existing Visit records (no second visit store).
// Assignment status is derived from staffIds vs carersRequired; delivery status stays separate.
import type { Visit, VisitStatus } from "./visitsStore";
import type { SiteId, StaffId } from "./demoDataRegistry";
import { inScopeSite, type RoleState } from "./roleStore";
import { availabilityReasons, isPermittedArea, staffAvailabilityStore } from "./staffAvailabilityStore";
import { competencyCheck, matchesPreference, preferenceExclusion, type CarerPreference, type VisitRequirement } from "./visitRequirements";
type AvailabilityState = ReturnType<typeof staffAvailabilityStore.getState>;

export type AssignmentStatus = "unassigned" | "partial" | "assigned";
export const ASSIGNMENT_LABELS: Record<AssignmentStatus, string> = { unassigned: "Unassigned", partial: "Partially assigned", assigned: "Assigned" };
export const ROSTER_REASONS = ["Sickness", "Leave", "Client preference", "Operational cover", "Continuity", "Other"] as const;
/** Delivery statuses that can still be rescheduled or reassigned without rewriting care evidence. */
const OPEN_STATUSES: VisitStatus[] = ["scheduled", "late"];

export const carersRequiredFor = (v: Visit) => Math.max(1, v.carersRequired ?? 1);
export function assignmentStatus(v: Visit): AssignmentStatus {
  const n = v.staffIds.length;
  return n === 0 ? "unassigned" : n < carersRequiredFor(v) ? "partial" : "assigned";
}
export const durationMinutes = (v: Visit) => v.expectedDurationMinutes ?? Math.round((Date.parse(v.scheduledEnd) - Date.parse(v.scheduledStart)) / 60000);

/** Admin, manager and coordinator may change the roster inside their service-area IDs. */
/** Outside-area assignment override: admins and managers only (coordinators excluded). */
export const canOverrideServiceArea = (role: RoleState) => role.role === "admin" || role.role === "manager";

export function canEditRoster(siteId: SiteId | undefined, role: RoleState): boolean {
  if (!siteId) return false;
  if (!(role.role === "admin" || role.role === "manager" || role.role === "coordinator")) return false;
  return inScopeSite(siteId, role);
}

/** Visits that have started, finished or been cancelled keep their schedule as recorded. */
export const isRosterEditable = (v: Visit) => !v.checkInAt && !v.checkOutAt && !v.log && OPEN_STATUSES.includes(v.status);

export interface ScheduleConflict { staffId: StaffId; visit: Visit }
/** Same carer on overlapping, non-cancelled visits. No travel time is considered. */
export function scheduleConflicts(visits: readonly Visit[], staffIds: readonly StaffId[], start: string, end: string, excludeId?: string): ScheduleConflict[] {
  const s = Date.parse(start), e = Date.parse(end);
  return staffIds.flatMap((staffId) => visits
    .filter((v) => v.id !== excludeId && v.status !== "cancelled" && v.staffIds.includes(staffId) && Date.parse(v.scheduledStart) < e && Date.parse(v.scheduledEnd) > s)
    .map((visit) => ({ staffId, visit })));
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
}
export const sameDay = (iso: string, day: Date) => {
  const d = new Date(iso);
  return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
};

export class RosterConflictError extends Error {
  constructor(public conflicts: ScheduleConflict[]) { super("Schedule conflict"); }
}

// ---- Phase 4A: eligibility and time selection (derived from current form values, never cached) ----
export interface CarerUnavailable { staffId: StaffId; conflicts: Visit[]; /** Working-hours / leave reasons. */ reasons?: string[]; outsideArea?: boolean; /** Missing / expired required competencies. */ competency?: string[]; /** Required client preference not met. */ preference?: string }
export interface CarerEligibility { eligible: StaffId[]; unavailable: CarerUnavailable[]; /** Amber (due soon) competency warnings for eligible carers. */ warnings?: Partial<Record<StaffId, string[]>>; /** Eligible carers matching a soft/required client preference (ranked first). */ preferred?: StaffId[] }
export interface EligibilityContext { siteId: SiteId; availability: AvailabilityState; requirement?: VisitRequirement; preference?: CarerPreference }
/** Eligible = not already on this visit, no overlapping non-cancelled visit, inside working hours, not on leave,
 *  permitted in the visit's service area, holding required competencies (amber = warning) and meeting any
 *  applicable *required* client preference. Preferred carers are ranked first, never excluded. No travel logic. */
export function carerEligibility(visits: readonly Visit[], pool: readonly StaffId[], assigned: readonly StaffId[], start: string, end: string, excludeId?: string, ctx?: EligibilityContext): CarerEligibility {
  const eligible: StaffId[] = [], unavailable: CarerUnavailable[] = [];
  const warnings: Partial<Record<StaffId, string[]>> = {};
  const quals = ctx?.requirement?.requiredQualificationIds ?? [], cats = ctx?.requirement?.supportCategories ?? [];
  for (const id of pool) {
    if (assigned.includes(id)) continue;
    const c = scheduleConflicts(visits, [id], start, end, excludeId).map((x) => x.visit);
    const reasons = ctx ? availabilityReasons(ctx.availability, id, start, end) : [];
    const outsideArea = ctx ? !isPermittedArea(ctx.availability, id, ctx.siteId) : false;
    const comp = competencyCheck(id, quals, new Date(start));
    const preference = preferenceExclusion(ctx?.preference, cats, id);
    if (c.length || reasons.length || outsideArea || comp.excluded.length || preference) unavailable.push({ staffId: id, conflicts: c, reasons, outsideArea, competency: comp.excluded, preference });
    else { eligible.push(id); if (comp.warnings.length) warnings[id] = comp.warnings; }
  }
  const preferred = eligible.filter((id) => matchesPreference(ctx?.preference, cats, id) === true);
  const ranked = [...preferred, ...eligible.filter((id) => !preferred.includes(id))];
  return { eligible: ranked, unavailable, warnings, preferred };
}

const pad2 = (n: number) => String(n).padStart(2, "0");
export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** Accepts "9:22", "0922", "09:22"; returns "HH:MM" or undefined. Never rounds. */
export function parseTypedTime(raw: string): string | undefined {
  const s = raw.trim().replace(/\./g, ":");
  const m = /^(\d{1,2}):?(\d{2})$/.exec(s);
  if (!m) return undefined;
  const t = `${pad2(Number(m[1]))}:${m[2]}`;
  return TIME_RE.test(t) ? t : undefined;
}
/** 15-minute options for the day, starting at (or after) `from` when given. */
export function quarterHourOptions(from?: string): string[] {
  const all = Array.from({ length: 96 }, (_, i) => `${pad2(Math.floor(i / 4))}:${pad2((i % 4) * 15)}`);
  if (!from || !TIME_RE.test(from)) return all;
  return all.filter((t) => t >= from);
}
/** Combines local date + time + minutes into ISO start/end; undefined when incomplete. */
export function formWindow(date: string, time: string, minutes: number): { start: string; end: string } | undefined {
  if (!date || !TIME_RE.test(time) || !(minutes > 0)) return undefined;
  const s = new Date(`${date}T${time}`);
  if (isNaN(s.getTime())) return undefined;
  return { start: s.toISOString(), end: new Date(s.getTime() + minutes * 60000).toISOString() };
}
