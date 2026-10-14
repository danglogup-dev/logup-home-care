import type { Visit, VisitTemplate, VisitStatus } from "./visitsStore";

/** Timing runs from the visit's own scheduled start, so roster reschedules are respected. */
export function timedVisitStatus(visit: Visit, _template?: VisitTemplate, now = new Date()): VisitStatus {
  if (visit.checkInAt || visit.status === "completed" || visit.status === "cancelled") return visit.status;
  const start = new Date(visit.scheduledStart);
  const elapsed = now.getTime() - start.getTime();
  if (elapsed >= 60 * 60000) return "missed";
  if (elapsed >= 15 * 60000) return "late";
  return "scheduled";
}