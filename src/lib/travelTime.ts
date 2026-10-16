// Travel-time service for roster feasibility. Interface is provider-agnostic so a real
// Google Routes call can replace the fallback estimator later; results are deterministic
// (same inputs → same minutes), never random per render.
import { TOWN_CENTRES } from "./demoDataRegistry";
import { serviceUsersStore, type ServiceUser } from "./serviceUsersStore";
import type { StaffId } from "./demoDataRegistry";
import type { Visit } from "./visitsStore";

export interface TravelLocation { lat: number; lng: number }
export type TravelStatus = "available" | "unavailable" | "fallback_estimate";
export interface TravelEstimate { minutes?: number; distanceKm?: number; status: TravelStatus }
export interface TravelProvider { estimate(origin: TravelLocation, destination: TravelLocation, departAt?: string): TravelEstimate }

export const TRAVEL_BUFFER_MINUTES = 5;
const ROAD_FACTOR = 1.35, AVG_KMH = 50, PARK_MINUTES = 3;

/** Straight-line distance × road factor at rural average speed, plus parking. */
export const fallbackProvider: TravelProvider = {
  estimate(o, d) {
    const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
    const a = Math.sin(rad(d.lat - o.lat) / 2) ** 2 + Math.cos(rad(o.lat)) * Math.cos(rad(d.lat)) * Math.sin(rad(d.lng - o.lng) / 2) ** 2;
    const km = 2 * R * Math.asin(Math.sqrt(a)) * ROAD_FACTOR;
    return { distanceKm: Math.round(km * 10) / 10, minutes: km < 0.05 ? 0 : Math.round((km / AVG_KMH) * 60 + PARK_MINUTES), status: "fallback_estimate" };
  },
};
let provider: TravelProvider = fallbackProvider;
/** Swap in a real routing provider (e.g. Google Routes via a backend function). */
export function setTravelProvider(p: TravelProvider) { provider = p; }

/** Stored coordinates first; otherwise the town named in the address. Undefined when unknown. */
export function clientLocation(c: Pick<ServiceUser, "latitude" | "longitude" | "homeAddress"> | undefined): TravelLocation | undefined {
  if (!c) return undefined;
  if (typeof c.latitude === "number" && typeof c.longitude === "number") return { lat: c.latitude, lng: c.longitude };
  const town = Object.keys(TOWN_CENTRES).find((t) => c.homeAddress?.includes(t));
  return town ? TOWN_CENTRES[town] : undefined;
}

export type ClientLocator = (clientId: string) => TravelLocation | undefined;
export const defaultLocator: ClientLocator = (id) => clientLocation(serviceUsersStore.getById(id));

export function travelBetween(fromClientId: string, toClientId: string, departAt?: string, locate: ClientLocator = defaultLocator): TravelEstimate {
  if (fromClientId === toClientId) return { minutes: 0, distanceKm: 0, status: "available" };
  const o = locate(fromClientId), d = locate(toClientId);
  if (!o || !d) return { status: "unavailable" };
  return provider.estimate(o, d, departAt);
}

export type TravelLevel = "feasible" | "tight" | "conflict";
export interface TravelLeg { level: TravelLevel; other: Visit; minutes?: number; gapMinutes: number; arrival: string }
export interface TravelCheck { level: TravelLevel; previous?: TravelLeg; next?: TravelLeg }

const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false });
const dayKey = (iso: string) => new Date(iso).toDateString();

/** gap ≥ travel + buffer → feasible; gap ≥ travel → tight (buffer eaten, still on time); else conflict. Unknown travel → feasible (no invented conflict). */
export function legLevel(gapMinutes: number, minutes: number | undefined, buffer = TRAVEL_BUFFER_MINUTES): TravelLevel {
  if (minutes === undefined) return "feasible";
  if (gapMinutes >= minutes + buffer) return "feasible";
  return gapMinutes >= minutes ? "tight" : "conflict";
}

/** Carer's previous/next non-overlapping visits that day vs this proposed window. No home-start legs. */
export function travelCheck(visits: readonly Visit[], staffId: StaffId, clientId: string, start: string, end: string, excludeId?: string, locate: ClientLocator = defaultLocator): TravelCheck {
  const s = Date.parse(start), e = Date.parse(end);
  const mine = visits.filter((v) => v.id !== excludeId && v.status !== "cancelled" && v.staffIds.includes(staffId) && dayKey(v.scheduledStart) === dayKey(start));
  const prevV = mine.filter((v) => Date.parse(v.scheduledEnd) <= s).sort((a, b) => b.scheduledEnd.localeCompare(a.scheduledEnd))[0];
  const nextV = mine.filter((v) => Date.parse(v.scheduledStart) >= e).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))[0];
  const leg = (other: Visit, from: string, to: string, leaveAt: number, arriveBy: number): TravelLeg => {
    const t = travelBetween(from, to, new Date(leaveAt).toISOString(), locate);
    const gap = Math.round((arriveBy - leaveAt) / 60000);
    return { level: legLevel(gap, t.minutes), other, minutes: t.minutes, gapMinutes: gap, arrival: new Date(leaveAt + ((t.minutes ?? 0) + TRAVEL_BUFFER_MINUTES) * 60000).toISOString() };
  };
  const previous = prevV ? leg(prevV, prevV.clientId, clientId, Date.parse(prevV.scheduledEnd), s) : undefined;
  const next = nextV ? leg(nextV, clientId, nextV.clientId, e, Date.parse(nextV.scheduledStart)) : undefined;
  const levels = [previous?.level, next?.level];
  return { level: levels.includes("conflict") ? "conflict" : levels.includes("tight") ? "tight" : "feasible", previous, next };
}

/** Plain-English lines for conflicts (exclusion) and tight legs (warning). */
export function travelLines(c: TravelCheck, start: string): { conflict: string[]; tight: string[] } {
  const conflict: string[] = [], tight: string[] = [];
  if (c.previous) {
    const p = c.previous;
    if (p.level === "conflict") conflict.push(`Travel conflict — earliest estimated arrival ${hm(p.arrival)}. Previous visit ends ${hm(p.other.scheduledEnd)}, estimated journey ${p.minutes} mins, this visit starts ${hm(start)}.`);
    if (p.level === "tight") tight.push(`Tight travel window — approximately ${p.gapMinutes - (p.minutes ?? 0)} minutes buffer after the previous visit.`);
  }
  if (c.next) {
    const n = c.next;
    if (n.level === "conflict") conflict.push(`Travel conflict — approximately ${n.minutes} minutes travel required before next visit at ${hm(n.other.scheduledStart)}.`);
    if (n.level === "tight") tight.push(`Tight travel window — approximately ${n.gapMinutes - (n.minutes ?? 0)} minutes buffer before the next visit.`);
  }
  return { conflict, tight };
}
