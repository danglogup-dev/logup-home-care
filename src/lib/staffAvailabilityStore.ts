// Staff availability — recurring weekly hours, unavailable periods and service-area coverage,
// keyed by staffId and extending the shared STAFF records (no second staff list).
import { useSyncExternalStore } from "react";
import { STAFF, type SiteId, type StaffId } from "./demoDataRegistry";

export interface WeeklyAvailability { staffId: StaffId; dayOfWeek: number; /** 0=Sun..6=Sat */ availableFrom: string; availableUntil: string; serviceAreaIds: SiteId[]; active: boolean }
export const UNAVAILABLE_REASONS = ["Annual leave", "Sick leave", "Training", "Unavailable", "Other"] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];
export interface UnavailablePeriod { id: string; staffId: StaffId; startDateTime: string; endDateTime: string; reason: UnavailableReason; status: "approved" | "cancelled" }
export interface ServiceAreaCoverage { staffId: StaffId; primaryServiceAreaId: SiteId; permittedServiceAreaIds: SiteId[] }

interface State { weekly: WeeklyAvailability[]; periods: UnavailablePeriod[]; coverage: ServiceAreaCoverage[] }

const FRONTLINE = STAFF.filter((s) => s.accessRole === "Frontline");
// Demo patterns (fictional): most carers work weekdays; some part-time or weekend.
const PATTERNS: Partial<Record<StaffId, { days: number[]; from: string; until: string }>> = {
  "STAFF-AISLING": { days: [1, 2, 3, 4, 5], from: "07:30", until: "14:00" },
  "STAFF-LIAM": { days: [1, 2, 3, 4, 5, 6], from: "07:00", until: "17:00" },
  "STAFF-PEADAR": { days: [0, 3, 4, 5, 6], from: "08:00", until: "20:00" },
  "STAFF-KEVIN": { days: [1, 2, 3, 4, 5], from: "12:00", until: "21:00" },
  "STAFF-MAEVE": { days: [0, 1, 2, 5, 6], from: "07:30", until: "15:30" },
  "STAFF-AINE": { days: [1, 2, 3, 4], from: "09:00", until: "17:00" },
};
const DEFAULT_PATTERN = { days: [0, 1, 2, 3, 4, 5, 6], from: "07:00", until: "21:00" };
// Cross-area cover (fictional): Kevin may also cover West Waterford; Darragh may cover East Cork.
const EXTRA_AREAS: Partial<Record<StaffId, SiteId[]>> = { "STAFF-KEVIN": ["SITE-WWD"], "STAFF-DARRAGH": ["SITE-ECK"] };

function seed(now = new Date()): State {
  const coverage = FRONTLINE.map((s) => ({ staffId: s.id, primaryServiceAreaId: s.scopeSiteIds[0], permittedServiceAreaIds: [s.scopeSiteIds[0], ...(EXTRA_AREAS[s.id] ?? [])] }));
  const weekly = FRONTLINE.flatMap((s) => {
    const p = PATTERNS[s.id] ?? DEFAULT_PATTERN;
    const areas = coverage.find((c) => c.staffId === s.id)!.permittedServiceAreaIds;
    return p.days.map((d) => ({ staffId: s.id, dayOfWeek: d, availableFrom: p.from, availableUntil: p.until, serviceAreaIds: areas, active: true }));
  });
  const day = (offset: number, h = 0, m = 0) => { const d = new Date(now); d.setHours(h, m, 0, 0); d.setDate(d.getDate() + offset); return d.toISOString(); };
  const periods: UnavailablePeriod[] = [
    { id: "UP-1", staffId: "STAFF-SINEAD", startDateTime: day(1), endDateTime: day(5), reason: "Annual leave", status: "approved" },
    { id: "UP-2", staffId: "STAFF-ROISIN", startDateTime: day(2, 13), endDateTime: day(2, 17), reason: "Training", status: "approved" },
    { id: "UP-3", staffId: "STAFF-FIONA", startDateTime: day(0), endDateTime: day(2), reason: "Sick leave", status: "approved" },
    { id: "UP-4", staffId: "STAFF-ORLA", startDateTime: day(3, 9), endDateTime: day(3, 12), reason: "Unavailable", status: "approved" },
  ];
  return { weekly, periods, coverage };
}

let state = seed();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const staffAvailabilityStore = {
  getState: () => state,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  coverageFor: (staffId: StaffId) => state.coverage.find((c) => c.staffId === staffId),
  addPeriod(p: Omit<UnavailablePeriod, "id" | "status">) { state = { ...state, periods: [...state.periods, { ...p, id: crypto.randomUUID(), status: "approved" }] }; emit(); },
  /** Test hook. */
  reset(now?: Date) { state = seed(now); emit(); },
};
export const useStaffAvailability = () => useSyncExternalStore(staffAvailabilityStore.subscribe, staffAvailabilityStore.getState);

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Exact reasons a carer can't work start–end (local time). Empty = available. Overlaps are checked separately. */
export function availabilityReasons(s: State, staffId: StaffId, start: string, end: string): string[] {
  const a = new Date(start), b = new Date(end);
  const reasons: string[] = [];
  const leave = s.periods.find((p) => p.staffId === staffId && p.status === "approved" && Date.parse(p.startDateTime) < b.getTime() && Date.parse(p.endDateTime) > a.getTime());
  if (leave) reasons.push(leave.reason.toLowerCase());
  const rows = s.weekly.filter((w) => w.staffId === staffId && w.active && w.dayOfWeek === a.getDay());
  const sameDay = a.toDateString() === b.toDateString();
  const from = hhmm(a), until = sameDay ? hhmm(b) : "24:00";
  if (!rows.length) reasons.push("not working this day");
  else if (!rows.some((w) => w.availableFrom <= from && until <= w.availableUntil)) {
    const r = rows[0];
    reasons.push(from < r.availableFrom ? `working hours start at ${r.availableFrom}` : `working hours end at ${r.availableUntil}`);
  }
  return reasons;
}
export const isPermittedArea = (s: State, staffId: StaffId, siteId: SiteId) => !!s.coverage.find((c) => c.staffId === staffId)?.permittedServiceAreaIds.includes(siteId);
export const FRONTLINE_IDS = FRONTLINE.map((s) => s.id);
