/**
 * Read-only views over existing client, care-plan and visit records for the
 * Home Care client record. Nothing here stores data — it derives from the
 * shared stores so there is one source of truth.
 */
import type { Visit, VisitTemplate, Weekday } from "./visitsStore";
import type { CarePlanVersion } from "./carePlansStore";

export const WEEKDAY_SHORT: Record<Weekday, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export function daysLabel(days: Weekday[]): string {
  if (days.length === 7) return "Every day";
  const sorted = WEEK_ORDER.filter((d) => days.includes(d));
  if (sorted.join() === "1,2,3,4,5") return "Mon to Fri";
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

/** Planned weekly hours from current (non-superseded) templates. */
export function plannedWeeklyHours(templates: readonly VisitTemplate[]): number {
  return templates.reduce((sum, t) => sum + (t.daysOfWeek.length * t.durationMinutes * Math.max(1, t.carersRequired)) / 60, 0);
}

export function upcomingVisits(visits: readonly Visit[], clientId: string, now = new Date()): Visit[] {
  return visits
    .filter((v) => v.clientId === clientId && v.status !== "cancelled" && v.status !== "completed" && new Date(v.scheduledEnd) >= now)
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
}

export function completedVisits(visits: readonly Visit[], clientId: string): Visit[] {
  return visits
    .filter((v) => v.clientId === clientId && (v.status === "completed" || v.status === "missed"))
    .sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));
}

export function minutesBetween(a?: string, b?: string): number | undefined {
  if (!a || !b) return undefined;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

/** At a Glance topics, matched to care-plan section keys (Home support and older templates). */
export const GLANCE_TOPICS: { label: string; keys: string[] }[] = [
  { label: "What matters to me", keys: ["about"] },
  { label: "Communication", keys: ["communication"] },
  { label: "Personal care", keys: ["personalCare"] },
  { label: "Moving and falls", keys: ["mobility", "fallsRisk"] },
  { label: "Medication support", keys: ["medication"] },
  { label: "Eating and drinking", keys: ["nutrition"] },
  { label: "Risks in the home", keys: ["risksControls", "safeguarding"] },
];

export function glanceFromPlan(version: CarePlanVersion | undefined): { label: string; text: string }[] {
  if (!version) return [];
  return GLANCE_TOPICS.flatMap(({ label, keys }) => {
    const text = keys.map((k) => version.sections.find((s) => s.key === k)?.body?.trim()).filter(Boolean).join(" ");
    return text ? [{ label, text: text.length > 240 ? `${text.slice(0, 237)}…` : text }] : [];
  });
}
