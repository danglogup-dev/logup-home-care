/**
 * Chronology for one service user, derived from source records (lifecycle
 * events, events, care plan versions, review flags). Nothing stored here.
 */
import { serviceUsersStore, type LifecycleEventType } from "./serviceUsersStore";
import { incidentRecords } from "./incidentRecords";
import { incidentsStore } from "./incidentsStore";
import { carePlansStore } from "./carePlansStore";
import { getStaffName, type StaffId } from "./demoDataRegistry";
import { siteLabel } from "./sitesStore";
import { getState as visitsState, VISIT_STATUS_LABELS } from "./visitsStore";
import { visitNotesStore } from "./visitNotesStore";
import { loadDemoClientEmar } from "./medicationDemoStore";
import { getTasks } from "./tasksStore";
import { OUTCOME_LABELS } from "./medicationRules";

export type TimelineKind = "lifecycle" | "event" | "care_plan" | "review_flag" | "visit" | "visit_note" | "medication_outcome" | "medication_exception" | "manager_decision" | "task";
/** record = original record; manager = a person's review/decision; suggestion = LogUp/AI prompt. */
export type TimelineOrigin = "record" | "manager" | "suggestion";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  date: string; // ISO
  title: string;
  detail?: string;
  who: string;
  site?: string;
  href: string;
  origin?: TimelineOrigin;
  /** Human-readable source label, e.g. "eMAR", "Visit note". */
  source?: string;
}

export const KIND_SOURCE: Record<TimelineKind, string> = {
  lifecycle: "Client record", event: "Event / concern", care_plan: "Care plan", review_flag: "LogUp suggestion", visit: "Visit", visit_note: "Visit note",
  medication_outcome: "eMAR dose record", medication_exception: "eMAR exception", manager_decision: "Manager decision", task: "Follow-up task",
};

export const LIFECYCLE_LABELS: Record<LifecycleEventType, string> = {
  admitted: "Admitted",
  transferred: "Transferred",
  temporary_absence: "Temporary absence",
  returned: "Returned",
  discharged: "Discharged",
  deceased: "Death recorded",
};

const valid = (d: string) => !Number.isNaN(new Date(d).getTime());

export function buildTimeline(serviceUserId: string): TimelineItem[] {
  const items: TimelineItem[] = [];
  const profile = `/app/org/service-users/${serviceUserId}`;
  const plan = `/app/care-plans/plans/${serviceUserId}`;
  const events = `/app/incidents/reporting?personSupportedId=${serviceUserId}`;

  for (const e of serviceUsersStore.lifecycleEvents(serviceUserId as never)) {
    items.push({
      id: e.id, kind: "lifecycle", date: e.date,
      title: e.type === "transferred" && e.toSiteId
        ? `Transferred from ${siteLabel(e.siteId)} to ${siteLabel(e.toSiteId)}`
        : LIFECYCLE_LABELS[e.type],
      detail: e.note, who: getStaffName(e.recordedByStaffId as StaffId) || e.recordedByStaffId,
      site: siteLabel(e.siteId), href: profile,
    });
  }

  for (const r of incidentRecords.filter((x) => x.serviceUserId === serviceUserId)) {
    items.push({
      id: `EV-${r.id}`, kind: "event", date: r.dateObj.toISOString(),
      title: `${r.category} · ${r.id}`, detail: r.summary, who: r.submittedBy, site: r.site, href: events,
    });
  }
  for (const c of incidentsStore.getPending().filter((x) => x.serviceUserId === serviceUserId)) {
    if (!valid(c.dateTime)) continue;
    items.push({
      id: `EV-${c.id}`, kind: "event", date: new Date(c.dateTime).toISOString(),
      title: `${c.category} · ${c.id}`, who: c.createdByName ?? "", site: c.site, href: events,
    });
  }

  const cp = carePlansStore.getPlan(serviceUserId);
  for (const v of cp?.versions ?? []) {
    if (!v.publishedAt) continue;
    items.push({
      id: `CP-${v.id}`, kind: "care_plan", date: v.publishedAt,
      title: `Care plan v${v.versionNumber} published`, detail: v.reasonForChange,
      who: v.approvedBy ?? v.createdBy, href: plan,
    });
  }

  for (const s of carePlansStore.getSuggestionsFor(serviceUserId)) {
    items.push({
      id: `RF-${s.id}`, kind: "review_flag", date: s.createdAt,
      title: `Review flag raised: ${s.title}`, detail: s.reason, who: "LogUp suggestion", href: plan,
    });
    if (s.status !== "open") {
      const v = s.actionedVersionId ? cp?.versions.find((x) => x.id === s.actionedVersionId) : undefined;
      items.push({
        id: `RFD-${s.id}`, kind: "review_flag", date: v?.createdAt ?? s.createdAt,
        title: `Review flag ${s.status === "actioned" ? "actioned" : "dismissed"}: ${s.title}`,
        who: v?.createdBy ?? "", href: plan,
      });
    }
  }

  // Visits (last 30 days up to now), confirmed notes, eMAR, follow-up tasks.
  const history = `${profile}?tab=history`;
  const name = (id?: string | null) => (id ? getStaffName(id as StaffId) || id : "");
  const now = Date.now();
  for (const v of visitsState().visits.filter((x) => x.clientId === serviceUserId && Date.parse(x.scheduledStart) <= now && now - Date.parse(x.scheduledStart) < 30 * 86_400_000)) {
    items.push({ id: `VI-${v.id}`, kind: "visit", date: v.scheduledStart, title: `Visit ${VISIT_STATUS_LABELS[v.status].toLowerCase()}`, detail: `Scheduled ${new Date(v.scheduledStart).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}${v.checkInAt ? ` · arrived ${new Date(v.checkInAt).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}` : ""}${v.checkOutAt ? ` · left ${new Date(v.checkOutAt).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}` : ""} · ${v.id}`, who: v.staffIds.map(name).join(", "), href: `${history}#visit-${v.id}`, origin: "record" });
  }
  for (const n of visitNotesStore.getState().filter((x) => x.client_id === serviceUserId)) {
    items.push({ id: `VN-${n.id}`, kind: "visit_note", date: n.confirmed_at, title: "Visit note confirmed by carer", detail: [n.final_text.observations, n.final_text.concerns !== "None noted" ? `Concerns: ${n.final_text.concerns}` : ""].filter(Boolean).join(" "), who: name(n.confirmed_by_staff_id), href: `${history}#visit-${n.visit_id}`, origin: "record" });
  }
  const emar = loadDemoClientEmar(serviceUserId);
  const emarHref = `/app/visits/medication/${serviceUserId}`;
  for (const o of emar.outcomes) {
    const t = emar.tasks.find((x) => x.id === o.task_id);
    items.push({ id: `MO-${o.id}`, kind: "medication_outcome", date: o.event_at, title: `${t?.medication.name ?? "Medicine"}: ${OUTCOME_LABELS[o.outcome]}${o.correction_of ? " (correction)" : ""}`, detail: [o.reason, o.correction_reason && `Why corrected: ${o.correction_reason}`].filter(Boolean).join(" · ") || undefined, who: name(o.staff_id), href: emarHref, origin: "record" });
  }
  for (const e of emar.exceptions) {
    const href = `${emarHref}?exception=${e.id}`;
    items.push({ id: `MX-${e.id}`, kind: "medication_exception", date: e.created_at, title: `Medication exception opened: ${e.kind.replace(/_/g, " ")}`, detail: e.notifications?.length ? "Notification simulated — no one was actually notified." : undefined, who: "LogUp (from the dose record)", href, origin: "record" });
    if (e.acknowledged_at) items.push({ id: `MXA-${e.id}`, kind: "manager_decision", date: e.acknowledged_at, title: "Exception acknowledged", who: name(e.acknowledged_by_staff_id), href, origin: "manager" });
    if (e.follow_up_at) items.push({ id: `MXF-${e.id}`, kind: "manager_decision", date: e.follow_up_at, title: "Exception follow-up recorded", detail: e.follow_up ?? undefined, who: name(e.follow_up_by_staff_id), href, origin: "manager" });
    if (e.resolved_at) items.push({ id: `MXR-${e.id}`, kind: "manager_decision", date: e.resolved_at, title: "Exception resolved", detail: e.resolution ?? undefined, who: name(e.resolved_by_staff_id), href, origin: "manager" });
  }
  for (const t of getTasks().filter((x) => x.medicationLinks?.serviceUserId === serviceUserId || x.insightLinks?.serviceUserId === serviceUserId)) {
    const href = `/app/tasks/${t.id}`;
    items.push({ id: `TK-${t.id}`, kind: "task", date: t.createdAt, title: `Follow-up task assigned: ${t.title}`, detail: `${t.insightLinks ? "Prompted by a Care Assurance insight. " : ""}Due ${new Date(t.dueAt).toLocaleDateString("en-IE")}`, who: `${name(t.assignedById)} → ${name(t.assigneeId)}`, href, origin: "manager" });
    for (const a of t.activity.slice(1)) items.push({ id: `TKA-${t.id}-${a.at}`, kind: a.message.startsWith("Marked completed") ? "manager_decision" : "task", date: a.at, title: a.message.startsWith("Marked completed") ? `Task closed: ${t.title}` : `Task update: ${t.title}`, detail: a.message, who: a.by, href, origin: "manager" });
  }

  return items.filter((i) => valid(i.date)).map((i) => ({ ...i, origin: i.origin ?? (i.kind === "review_flag" && i.who === "LogUp suggestion" ? "suggestion" : "record"), source: i.source ?? KIND_SOURCE[i.kind] })).sort((a, b) => b.date.localeCompare(a.date));
}
