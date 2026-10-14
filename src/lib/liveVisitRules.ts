import type { Visit, VisitStatus, VisitTemplate } from "./visitsStore";
import type { ServiceUser } from "./serviceUsersStore";
import type { IncidentCard } from "./incidentsStore";
import { canCoordinateVisit, type RoleState } from "./roleStore";
import { timedVisitStatus } from "./visitRules";
import { visitsOnDate } from "./visitPresentation";

export const LIVE_STATUS_ORDER: VisitStatus[] = ["missed", "late", "in_progress", "scheduled", "completed", "cancelled"];

export function liveVisits(visits: readonly Visit[], users: readonly ServiceUser[], templates: readonly VisitTemplate[], role: RoleState, now = new Date()): Visit[] {
  const allowed = new Set(users.filter((u) => canCoordinateVisit(u.siteId, role)).map((u) => u.id));
  const byTemplate = new Map(templates.map((t) => [t.id, t]));
  return visitsOnDate(visits.filter((v) => allowed.has(v.clientId)), now)
    .map((v) => ({ ...v, status: timedVisitStatus(v, v.templateId ? byTemplate.get(v.templateId) : undefined, now) }))
    .sort((a, b) => LIVE_STATUS_ORDER.indexOf(a.status) - LIVE_STATUS_ORDER.indexOf(b.status) || a.scheduledStart.localeCompare(b.scheduledStart) || a.id.localeCompare(b.id));
}

export interface LiveVisitAlert {
  id: string;
  kind: "sos" | "missed" | "late" | "event";
  visitId: string;
  eventId?: string;
  clientId: Visit["clientId"];
  title: string;
  detail: string;
  at: string;
}

/** Timing alerts are derived, never submitted as Events without human confirmation. */
export function liveVisitAlerts(today: readonly Visit[], events: readonly IncidentCard[], allVisits: readonly Visit[], users: readonly ServiceUser[], role: RoleState, now = new Date()): LiveVisitAlert[] {
  const alerts: LiveVisitAlert[] = today.filter((v) => v.status === "late" || v.status === "missed").map((v) => ({
    id: `timing-${v.id}`, kind: v.status as "late" | "missed", visitId: v.id, clientId: v.clientId,
    title: v.status === "missed" ? "Missed visit" : "Late visit", detail: "No check-in recorded", at: v.scheduledStart,
  }));
  const clients = new Map(users.map((u) => [u.id, u]));
  const visits = new Map(allVisits.map((v) => [v.id, v]));
  for (const e of events) {
    const v = e.visitId ? visits.get(e.visitId) : undefined;
    const client = v ? clients.get(v.clientId) : undefined;
    if (!v || !client || !canCoordinateVisit(client.siteId, role) || (e.serviceUserId && e.serviceUserId !== v.clientId)) continue;
    if (e.lifecycleStatus === "Closed" || e.column === "complete") continue;
    const at = e.submission?.capturedAt ?? e.timeline[0]?.ts ?? e.dateTime;
    const stamp = new Date(at);
    const isToday = stamp.getFullYear() === now.getFullYear() && stamp.getMonth() === now.getMonth() && stamp.getDate() === now.getDate();
    if (!e.urgent && (e.column !== "new" || !isToday)) continue;
    alerts.push({ id: `event-${e.id}`, kind: e.urgent ? "sos" : "event", visitId: v.id, eventId: e.id, clientId: v.clientId,
      title: e.urgent ? "SOS" : e.eventType ?? "New visit event", detail: e.summary, at });
  }
  const priority = { sos: 0, missed: 1, late: 2, event: 3 };
  return alerts.sort((a, b) => priority[a.kind] - priority[b.kind] || b.at.localeCompare(a.at));
}

export function telephoneHref(phone: string | undefined): string | undefined {
  const cleaned = phone?.trim().replace(/[\s().-]/g, "");
  return cleaned && /^\+?\d{7,15}$/.test(cleaned) ? `tel:${cleaned}` : undefined;
}