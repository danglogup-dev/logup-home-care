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

export type TimelineKind = "lifecycle" | "event" | "care_plan" | "review_flag";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  date: string; // ISO
  title: string;
  detail?: string;
  who: string;
  site?: string;
  href: string;
}

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

  return items.filter((i) => valid(i.date)).sort((a, b) => b.date.localeCompare(a.date));
}
