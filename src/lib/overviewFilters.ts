// Shared filtering helper for Events Overview.
// Every card, table, and drill-through on Events Overview must derive its
// numbers from this single filtered dataset.

import { incidentRecords, type IncidentRecord } from "./incidentRecords";
import { SITES, SITE_BY_ID, type SiteId } from "./demoDataRegistry";

export type OverviewDateRange =
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "year_to_date";

export const DATE_RANGE_LABELS: Record<OverviewDateRange, string> = {
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  year_to_date: "Year to date",
};

/** Site name → SiteId (records store site name). */
const SITE_ID_BY_NAME: Record<string, SiteId> = SITES.reduce((m, s) => {
  m[s.name] = s.id;
  return m;
}, {} as Record<string, SiteId>);

export const siteIdForRecord = (r: IncidentRecord): SiteId | undefined =>
  SITE_ID_BY_NAME[r.site];

/** Reference "today" — latest incident date in the dataset (demo is historical). */
export const referenceNow = (): Date =>
  new Date(
    incidentRecords.reduce((mx, r) => Math.max(mx, r.dateObj.getTime()), 0),
  );

export function dateRangeCutoff(range: OverviewDateRange, now: Date = referenceNow()): Date {
  if (range === "year_to_date") {
    return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  }
  const days = range === "last_7_days" ? 7 : range === "last_30_days" ? 30 : 90;
  return new Date(now.getTime() - days * 86400000);
}

export interface OverviewFilters {
  selectedSiteIds: SiteId[];   // must be non-empty; caller enforces scope
  dateRange: OverviewDateRange;
}

/** Core shared filter — every overview metric uses this exact dataset. */
export function getFilteredEventsForOverview(
  filters: OverviewFilters,
  events: IncidentRecord[] = incidentRecords,
): IncidentRecord[] {
  const allowed = new Set(filters.selectedSiteIds);
  const now = referenceNow();
  const cutoff = dateRangeCutoff(filters.dateRange, now);
  return events.filter((r) => {
    const sid = siteIdForRecord(r);
    if (!sid || !allowed.has(sid)) return false;
    if (r.dateObj.getTime() < cutoff.getTime()) return false;
    if (r.dateObj.getTime() > now.getTime()) return false;
    return true;
  });
}

const isOpen = (r: IncidentRecord) => r.status !== "Closed";
const isHighCrit = (r: IncidentRecord) =>
  r.severity === "High" || r.severity === "Critical";
const isAwaitingReview = (r: IncidentRecord) => r.status === "Awaiting Review";

/** Parse an action `due` string ("30 Mar 2026") → Date | null. */
function parseDue(due: string): Date | null {
  const d = new Date(due);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface OverviewMetrics {
  awaitingReview: number;
  highCriticalOpen: number;
  overdueActions: number;
  openCount: number;
  closedThisPeriod: number;
}

export function computeOverviewMetrics(filtered: IncidentRecord[]): OverviewMetrics {
  const now = referenceNow();
  return {
    awaitingReview: filtered.filter(isAwaitingReview).length,
    highCriticalOpen: filtered.filter((r) => isHighCrit(r) && isOpen(r)).length,
    overdueActions: filtered.reduce((acc, r) => {
      return (
        acc +
        r.actions.filter((a) => {
          if (a.done) return false;
          const d = parseDue(a.due);
          return d ? d.getTime() < now.getTime() : false;
        }).length
      );
    }, 0),
    openCount: filtered.filter(isOpen).length,
    closedThisPeriod: filtered.filter((r) => r.status === "Closed").length,
  };
}

export interface SiteRiskRow {
  siteId: SiteId;
  siteName: string;
  reported: number;
  open: number;
  highCriticalOpen: number;
  overdueActions: number;
  hotspots: number;
}

export function computeSiteRiskRows(
  filters: OverviewFilters,
  events: IncidentRecord[] = incidentRecords,
): SiteRiskRow[] {
  return filters.selectedSiteIds.map((siteId) => {
    const forSite = getFilteredEventsForOverview(
      { ...filters, selectedSiteIds: [siteId] },
      events,
    );
    const m = computeOverviewMetrics(forSite);
    return {
      siteId,
      siteName: SITE_BY_ID[siteId]?.name ?? siteId,
      reported: forSite.length,
      open: m.openCount,
      highCriticalOpen: m.highCriticalOpen,
      overdueActions: m.overdueActions,
      hotspots: computeHotspots(forSite).length,
    };
  });
}

export interface HotspotRow {
  siteId: SiteId;
  siteName: string;
  location: string;
  category: string;
  count: number;
}

/** A hotspot = 2+ events at the same site + location + category within the period. */
export function computeHotspots(filtered: IncidentRecord[]): HotspotRow[] {
  const bucket = new Map<string, HotspotRow>();
  for (const r of filtered) {
    const sid = siteIdForRecord(r);
    if (!sid) continue;
    const key = `${sid}|${r.location}|${r.category}`;
    const existing = bucket.get(key);
    if (existing) existing.count += 1;
    else
      bucket.set(key, {
        siteId: sid,
        siteName: r.site,
        location: r.location,
        category: r.category,
        count: 1,
      });
  }
  return Array.from(bucket.values())
    .filter((h) => h.count >= 2)
    .sort((a, b) => b.count - a.count);
}

export interface OverdueActionRow {
  incidentId: string;
  action: string;
  owner: string;
  due: string;
  dueDate: Date;
  resident: string;
  siteId: SiteId;
  siteName: string;
  severity: IncidentRecord["severity"];
}

export function computeOverdueActionRows(
  filtered: IncidentRecord[],
): OverdueActionRow[] {
  const now = referenceNow();
  const rows: OverdueActionRow[] = [];
  for (const r of filtered) {
    const sid = siteIdForRecord(r);
    if (!sid) continue;
    for (const a of r.actions) {
      if (a.done) continue;
      const d = parseDue(a.due);
      if (!d || d.getTime() >= now.getTime()) continue;
      rows.push({
        incidentId: r.id,
        action: a.action,
        owner: a.owner,
        due: a.due,
        dueDate: d,
        resident: r.resident,
        siteId: sid,
        siteName: r.site,
        severity: r.severity,
      });
    }
  }
  return rows.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

export function computeCategoryRows(filtered: IncidentRecord[]) {
  const m = new Map<string, number>();
  for (const r of filtered) m.set(r.category, (m.get(r.category) ?? 0) + 1);
  return Array.from(m.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export function computeSeverityRows(filtered: IncidentRecord[]) {
  const highCrit = filtered.filter(isHighCrit).length;
  const moderate = filtered.filter((r) => r.severity === "Moderate").length;
  const low = filtered.filter((r) => r.severity === "Low").length;
  return [
    { label: "High / Critical", key: "High,Critical" as const, count: highCrit, color: "bg-destructive" },
    { label: "Moderate",        key: "Moderate" as const,      count: moderate, color: "bg-warning" },
    { label: "Low",             key: "Low" as const,           count: low,      color: "bg-success" },
  ];
}

/** URL-param map for drill-through into Events Reporting. */
export function reportingSearchParams(
  filters: OverviewFilters,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    siteIds: filters.selectedSiteIds.join(","),
    dateRange: filters.dateRange,
    ...extra,
  };
}
