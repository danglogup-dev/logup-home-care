// Demo event records — projected from the connected demo scenario (demoScenario.ts).
// Do not add records here; add them to SCENARIO_EVENTS so every module stays in step.

import type {
  RiskImpact, RiskLikelihood, LifecycleStatus,
  InvestigationRecord, ClosureRecord, EvidenceLink,
  RegulatoryNotificationRecord, PrimaryCategory,
} from "./incidentGovernance";

export type Severity = "Low" | "Moderate" | "High" | "Critical";

export interface IncidentRecord {
  id: string;
  summary: string;
  site: string;
  location: string;
  /** Display label only; prefer serviceUserId. */
  resident: string;
  /** Linked service user id (shared serviceUsersStore). Absent = not linked. */
  serviceUserId?: import("./demoDataRegistry").ServiceUserId;
  severity: Severity;
  category: string;
  /** Optional governance-grade primary category. */
  primaryCategory?: PrimaryCategory;
  secondaryCategory?: PrimaryCategory;
  // Risk
  impact?: RiskImpact;
  likelihood?: RiskLikelihood;
  // Governance lifecycle (independent of `status`).
  lifecycleStatus?: LifecycleStatus;
  date: string;
  dateObj: Date;
  submittedBy: string;
  reviewedBy: string;
  status: string;
  chronology: { time: string; event: string }[];
  people: { role: string; name: string; title: string }[];
  actions: { action: string; owner: string; due: string; done: boolean; priority?: string }[];
  attachments: { name: string; type: string; size: string }[];
  investigation?: InvestigationRecord;
  closure?: ClosureRecord;
  linkedEvidence?: EvidenceLink[];
  regulatoryNotification?: RegulatoryNotificationRecord;
}


import { SCENARIO_EVENTS, toIncidentRecord } from "./demoScenario";

export const incidentRecords: IncidentRecord[] = SCENARIO_EVENTS.map((e) => toIncidentRecord(e) as IncidentRecord);

// Derived aggregates used by the Overview dashboard
export const aggregates = (() => {
  const total = incidentRecords.length;
  const open = incidentRecords.filter(r => r.status !== "Closed").length;
  const now = new Date();
  const closedThisMonth = incidentRecords.filter(r => r.status === "Closed" && r.dateObj.getMonth() === now.getMonth() && r.dateObj.getFullYear() === now.getFullYear()).length;
  const overdueActions = incidentRecords.reduce((n, r) => n + r.actions.filter(a => !a.done && new Date(a.due).getTime() < now.getTime()).length, 0);
  const byCategory: Record<string, number> = {};
  const bySite: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  incidentRecords.forEach(r => {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    bySite[r.site] = (bySite[r.site] || 0) + 1;
    bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
  });
  return { total, open, closedThisMonth, overdueActions, byCategory, bySite, bySeverity };
})();

// ---------------------------------------------------------------------------
// Shared selectors — the ONLY approved way to look up incident detail data
// for the shared IncidentDetailDrawer (used by Events Board, Events Reporting
// and cross-module deep links from Care Planning / Insights / Tasks).
//
// Do not create Board-specific or Reporting-specific projections of this data.
// The incidentId is the single identity key.
// ---------------------------------------------------------------------------

const INCIDENT_INDEX: Map<string, IncidentRecord> = new Map(
  incidentRecords.map((r) => [r.id, r]),
);

export function getIncidentById(id: string | null | undefined): IncidentRecord | null {
  if (!id) return null;
  return INCIDENT_INDEX.get(id) ?? null;
}

// Development-only consistency check. Logs a console warning when a Board
// card and the opened modal record diverge on user-visible key fields.
// No-op in production; never surfaced to end users.
export interface CardLikeIncident {
  id: string;
  resident?: string;
  site?: string;
  location?: string;
  category?: string;
  severity?: string;
  owner?: string;
  dateTime?: string;
}

export function assertIncidentCardMatchesModal(
  card: CardLikeIncident,
  modal: IncidentRecord | null,
): void {
  if (typeof window === "undefined") return;
  const isDev =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.DEV) ||
    process.env.NODE_ENV !== "production";
  if (!isDev) return;
  if (!modal) {
    // eslint-disable-next-line no-console
    console.warn(
      `[incident-consistency] Board card ${card.id} has no matching IncidentRecord. ` +
      `The modal will show a "not found" state.`,
    );
    return;
  }
  if (card.id !== modal.id) {
    // eslint-disable-next-line no-console
    console.warn(
      `Incident modal mismatch: Board card ${card.id} opened different record ${modal.id}.`,
    );
    return;
  }
  const diffs: string[] = [];
  const check = (field: string, a?: string, b?: string) => {
    if (a && b && a !== b) diffs.push(`${field}: card="${a}" vs modal="${b}"`);
  };
  check("resident", card.resident, modal.resident);
  check("site", card.site, modal.site);
  check("location", card.location, modal.location);
  check("category", card.category, modal.category);
  check("severity", card.severity, modal.severity);
  if (diffs.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `Incident modal mismatch on ${card.id}: ${diffs.join(" | ")}`,
    );
  }
}
