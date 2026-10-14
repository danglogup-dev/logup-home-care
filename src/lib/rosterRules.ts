// Roster rules — pure helpers over the existing Visit records (no second visit store).
// Assignment status is derived from staffIds vs carersRequired; delivery status stays separate.
import type { Visit, VisitStatus } from "./visitsStore";
import type { SiteId, StaffId } from "./demoDataRegistry";
import { inScopeSite, type RoleState } from "./roleStore";

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
