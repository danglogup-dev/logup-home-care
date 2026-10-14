// Associated Incidents — care-plan-scoped view over Events/Incidents.
//
// This store DOES NOT duplicate incident records. It holds only the association
// layer (which incident is linked to which Person Supported) plus the
// care-plan-impact review state.
//
// In production the display metadata (event type, severity, site, unit, etc.)
// is read from the Events/Incidents service by `incidentId`. For the LogUp
// prototype we cache lightweight display fields alongside the association so
// the demo works without wiring a cross-module fetch. Treat the extra fields
// as a projection, not the source of truth.
//
// Care plan impact state IS owned here — it's a care-planning concern.

import { useSyncExternalStore } from "react";
import { SCENARIO_EVENTS, toAssociatedIncident } from "./demoScenario";
import { isManagerRole, type Role } from "./roleStore";

export type IncidentCategory =
  | "Falls"
  | "Medication"
  | "Nutrition / hydration"
  | "Safeguarding"
  | "Restrictive practice / restraint"
  | "Fire alarm / environmental"
  | "Pressure ulcer / skin integrity"
  | "Missing person / unexplained absence"
  | "Other";

export const INCIDENT_CATEGORIES: IncidentCategory[] = [
  "Falls",
  "Medication",
  "Nutrition / hydration",
  "Safeguarding",
  "Restrictive practice / restraint",
  "Fire alarm / environmental",
  "Pressure ulcer / skin integrity",
  "Missing person / unexplained absence",
  "Other",
];

export type IncidentSeverity = "Low" | "Moderate" | "High" | "Critical";
export const SEVERITIES: IncidentSeverity[] = ["Low", "Moderate", "High", "Critical"];

export type IncidentStatus =
  | "New event"
  | "Under review"
  | "Actions required"
  | "Completed";

export const INCIDENT_STATUSES: IncidentStatus[] = [
  "New event",
  "Under review",
  "Actions required",
  "Completed",
];

export type ReviewStage =
  | "Awaiting triage"
  | "Investigation"
  | "Actions in progress"
  | "Awaiting closure"
  | "Closed";

export type CarePlanImpactStatus =
  | "not_checked"
  | "review_suggested"
  | "review_required"
  | "no_review_required"
  | "draft_created"
  | "draft_awaiting_approval"
  | "care_plan_updated";

export const CARE_IMPACT_LABELS: Record<CarePlanImpactStatus, string> = {
  not_checked: "Not checked",
  review_suggested: "Review suggested",
  review_required: "Review required",
  no_review_required: "No review required",
  draft_created: "Draft update created",
  draft_awaiting_approval: "Draft awaiting approval",
  care_plan_updated: "Care plan updated",
};

export interface AssociatedIncident {
  /** Reference to the canonical incident record in the Events module. */
  incidentId: string;
  /** Person Supported this incident is associated with. */
  personId: string;
  organisationId: string;
  siteId: string;
  unitId?: string;

  // ---- cached display fields (projection from Events service) ----
  eventType: string;               // e.g. "Fall", "Medication event"
  category: IncidentCategory;
  subtype: string;                 // e.g. "Fall in bedroom during evening routine"
  occurredAt: string;              // ISO
  site: string;
  unit?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reviewStage: ReviewStage;
  assignedReviewer?: string;
  openActions: number;
  notificationFormSuggested?: boolean;

  // ---- care plan impact (owned by Care Planning) ----
  careImpact: CarePlanImpactStatus;
  linkedSections?: string[];        // SectionKey values (or custom keys)
  impactReason?: string;            // required when careImpact === "no_review_required"
  impactCheckedBy?: string;
  impactCheckedAt?: string;         // ISO
  linkedDraftVersion?: number;      // e.g. 4 → "Draft update v4"
}

// -------- Demo data ---------------------------------------------------------
// Care Planning references Events records by ID only — no duplication.
// Patrick Murphy  (PS-001, East Cork)  — 4 falls-related events.
// Mary O'Sullivan (PS-002, East Cork)  — 2 nutrition/hydration events.
// Eileen Fitzgerald (PS-004, West Waterford) — 1 behaviour/safeguarding event.
// Michael Doyle   (PS-007, West Waterford) — 1 epilepsy support event.
// The fire alarm activation (INC-5012) is site-only and NOT associated to a Person Supported.

const now = new Date();
const daysAgo = (n: number) =>
  new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

const INITIAL: AssociatedIncident[] = SCENARIO_EVENTS
  .map((e) => toAssociatedIncident(e) as AssociatedIncident | undefined)
  .filter((x): x is AssociatedIncident => !!x)
  .reverse();

// -------- Store -------------------------------------------------------------

const STORAGE_KEY = "logup.associatedIncidents.v1";
function load(): AssociatedIncident[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p; }
  } catch { /* ignore */ }
  return INITIAL;
}
let state: AssociatedIncident[] = load();
const listeners = new Set<() => void>();
const emit = () => {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
};

function update(incidentId: string, patch: Partial<AssociatedIncident>) {
  state = state.map((x) => (x.incidentId === incidentId ? { ...x, ...patch } : x));
  emit();
}

export const associatedIncidentsStore = {
  get: () => state,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },

  /** Link an Events record to a service user. References the event by ID only; never duplicates it. */
  create(link: AssociatedIncident) {
    if (state.some((x) => x.incidentId === link.incidentId)) return;
    state = [link, ...state];
    emit();
  },

  forPerson(personId: string) {
    return state.filter((x) => x.personId === personId);
  },

  markNoReview(incidentId: string, actor: string, reason: string) {
    if (!reason.trim()) return;
    update(incidentId, {
      careImpact: "no_review_required",
      impactReason: reason.trim(),
      impactCheckedBy: actor,
      impactCheckedAt: new Date().toISOString(),
    });
  },

  /** LogUp has suggested a review; no person has decided yet. */
  markReviewSuggested(incidentId: string, sections?: string[]) {
    update(incidentId, { careImpact: "review_suggested", linkedSections: sections });
  },

  markReviewRequired(incidentId: string, actor: string, sections?: string[]) {
    update(incidentId, {
      careImpact: "review_required",
      linkedSections: sections,
      impactCheckedBy: actor,
      impactCheckedAt: new Date().toISOString(),
    });
  },

  linkDraft(incidentId: string, actor: string, draftVersion: number, sections?: string[]) {
    update(incidentId, {
      careImpact: "draft_awaiting_approval",
      linkedDraftVersion: draftVersion,
      linkedSections: sections,
      impactCheckedBy: actor,
      impactCheckedAt: new Date().toISOString(),
    });
  },

  markDraftCreated(incidentId: string, actor: string, draftVersion: number, sections?: string[]) {
    update(incidentId, {
      careImpact: "draft_created",
      linkedDraftVersion: draftVersion,
      linkedSections: sections,
      impactCheckedBy: actor,
      impactCheckedAt: new Date().toISOString(),
    });
  },

  markCarePlanUpdated(incidentId: string, actor: string, publishedVersion: number) {
    update(incidentId, {
      careImpact: "care_plan_updated",
      linkedDraftVersion: publishedVersion,
      impactCheckedBy: actor,
      impactCheckedAt: new Date().toISOString(),
    });
  },

  getById(incidentId: string): AssociatedIncident | undefined {
    return state.find((x) => x.incidentId === incidentId);
  },
};

// -------- React hook --------------------------------------------------------

export function useAssociatedIncidents(personId?: string): AssociatedIncident[] {
  const all = useSyncExternalStore(
    associatedIncidentsStore.subscribe,
    associatedIncidentsStore.get,
    associatedIncidentsStore.get,
  );
  return personId ? all.filter((x) => x.personId === personId) : all;
}

// -------- Summary helper ----------------------------------------------------

export interface AssociatedIncidentSummary {
  total: number;
  fallsRelated: number;
  openOrUnderReview: number;
  completed: number;
  reviewSuggested: number;
}

export function summarize(rows: AssociatedIncident[]): AssociatedIncidentSummary {
  return {
    total: rows.length,
    fallsRelated: rows.filter((r) => r.category === "Falls").length,
    openOrUnderReview: rows.filter(
      (r) => r.status === "New event" || r.status === "Under review" || r.status === "Actions required",
    ).length,
    completed: rows.filter((r) => r.status === "Completed").length,
    reviewSuggested: rows.filter(
      (r) => r.careImpact === "review_suggested" || r.careImpact === "review_required",
    ).length,
  };
}

// -------- Permissions -------------------------------------------------------

export type ImpactActor = Role;

export function canCompleteImpactReview(role: ImpactActor): boolean {
  return role === "admin" || isManagerRole(role);
}
