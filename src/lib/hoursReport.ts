// Delivered vs HSE approved hours, per client per week (Monday start).
// Delivered = scheduled length of COMPLETED visits (matches HSE planned call lengths).
import type { Visit } from "./visitsStore";
import type { ServiceUser } from "./serviceUsersStore";

export interface ClientWeekHours {
  clientId: string;
  weekStart: string; // YYYY-MM-DD (Monday, local)
  deliveredHours: number;
  plannedHours: number; // completed + still-to-happen (excludes cancelled/missed)
  approvedHours?: number;
  completedVisits: number;
  missedVisits: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
export function weekStartOf(d: Date): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = m.getDay();
  m.setDate(m.getDate() + (dow === 0 ? -6 : 1 - dow));
  return `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(m.getDate())}`;
}

const hoursOf = (v: Visit) => Math.max(0, (new Date(v.scheduledEnd).getTime() - new Date(v.scheduledStart).getTime()) / 3_600_000);

export function hoursByClientWeek(visits: readonly Visit[], clients: readonly ServiceUser[]): ClientWeekHours[] {
  const byClient = new Map(clients.map((c) => [c.id, c]));
  const rows = new Map<string, ClientWeekHours>();
  for (const v of visits) {
    const client = byClient.get(v.clientId);
    if (!client) continue;
    const weekStart = weekStartOf(new Date(v.scheduledStart));
    const key = `${v.clientId}|${weekStart}`;
    const row = rows.get(key) ?? { clientId: v.clientId, weekStart, deliveredHours: 0, plannedHours: 0, approvedHours: client.hseApprovedHoursPerWeek, completedVisits: 0, missedVisits: 0 };
    if (v.status === "completed") { row.deliveredHours += hoursOf(v); row.completedVisits++; }
    if (v.status === "missed") row.missedVisits++;
    if (v.status !== "cancelled" && v.status !== "missed") row.plannedHours += hoursOf(v);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.clientId.localeCompare(b.clientId));
}
