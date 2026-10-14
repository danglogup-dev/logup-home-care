import type { Visit, VisitTemplate, VisitStatus } from "./visitsStore";

export function timedVisitStatus(visit: Visit, template?: VisitTemplate, now = new Date()): VisitStatus {
  if (visit.checkInAt || visit.status === "completed" || visit.status === "cancelled") return visit.status;
  const start = new Date(visit.scheduledStart);
  if (template) {
    const [hours, minutes] = template.windowStart.split(":").map(Number);
    start.setHours(hours, minutes, 0, 0);
  }
  const elapsed = now.getTime() - start.getTime();
  if (elapsed >= 60 * 60000) return "missed";
  if (elapsed >= 15 * 60000) return "late";
  return "scheduled";
}