import type { VisitTemplate } from "./visitsStore";

export type CarePlanVisitTemplate = Omit<VisitTemplate, "clientId" | "carePlanVersionId" | "supersededAt">;

export function validateVisitSchedule(templates: CarePlanVisitTemplate[]): string | undefined {
  const ids = new Set<string>();
  for (const t of templates) {
    if (!t.id || ids.has(t.id)) return "Each call must have a unique ID.";
    ids.add(t.id);
    if (!["morning", "lunch", "tea", "bed"].includes(t.callType)) return "Choose a call type.";
    if (!t.daysOfWeek.length || t.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "Choose at least one day for each call.";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.windowStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.windowEnd) || t.windowEnd < t.windowStart) return "Enter a valid start window for each call.";
    if (!Number.isInteger(t.durationMinutes) || t.durationMinutes < 5 || t.durationMinutes > 240) return "Duration must be between 5 and 240 minutes.";
    if (!Number.isInteger(t.carersRequired) || t.carersRequired < 1 || t.carersRequired > 4) return "Choose between 1 and 4 carers.";
    if (!t.tasks.length || t.tasks.some((task) => !task.trim())) return "Add at least one task to each call.";
    if (t.medications.some((m) => !m.name.trim() || !["prompt", "assist", "administer"].includes(m.supportLevel))) return "Enter each medication name and support level.";
  }
}

export function cloneVisitSchedule(templates: CarePlanVisitTemplate[]): CarePlanVisitTemplate[] {
  return templates.map((t) => ({ ...t, daysOfWeek: [...t.daysOfWeek], tasks: [...t.tasks], medications: t.medications.map((m) => ({ ...m })) }));
}

export function visitScheduleText(templates: CarePlanVisitTemplate[]): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return templates.map((t) => `${t.callType}: ${t.daysOfWeek.map((d) => days[d]).join(", ")} · ${t.windowStart}–${t.windowEnd} · ${t.durationMinutes} minutes · ${t.carersRequired} carer(s)\nTasks: ${t.tasks.join("; ")}${t.medications.length ? `\nMedication support: ${t.medications.map((m) => `${m.name}${m.dose ? ` (${m.dose})` : ""} — ${m.supportLevel}`).join("; ")}` : ""}`).join("\n\n");
}