// Care Plan Audit Trail store.
//
// Append-only event log for every material action on a care plan version:
// draft creation, section edits/adds/removes, mark-ready, approval decisions,
// rejection, publication, archival, cancellation, export.
//
// Every event captures who, when, what, and the from/to status transition so
// governance reports can reconstruct the full lifecycle of a care plan.

import { useSyncExternalStore } from "react";

export type CarePlanAuditAction =
  | "draft_created"
  | "section_edited"
  | "section_added"
  | "section_removed"
  | "draft_marked_ready"
  | "approval_started"
  | "approval_decision"
  | "draft_rejected"
  | "draft_published"
  | "version_archived"
  | "draft_cancelled"
  | "version_exported"
  | "admin_override_approve"
  | "admin_override_publish"
  | "review_suggestion_dismissed"
  | "review_suggestion_assigned"
  | "section_order_changed"
  | "section_confirmed"
  | "assistant_change_accepted"
  | "assistant_change_rejected"
  | "reassessment_added"
  | "reassessment_completed";

export interface CarePlanAuditEvent {
  id: string;
  organisationId: string;
  personId: string;
  /** The versionId this event pertains to (a.k.a. carePlanVersion id). */
  carePlanId: string;
  versionId: string;
  actor: string;
  actorRole: string;
  timestamp: string;
  action: CarePlanAuditAction;
  fromStatus?: string;
  toStatus?: string;
  /** Free-form metadata reference (section key, decision id, chain id, reason, etc.). */
  metadata?: Record<string, unknown>;
}

interface State {
  events: CarePlanAuditEvent[];
}

const STORAGE_KEY = "logup.carePlanAudit.v1";
const ORG_ID = "org-logup-demo";

function loadInitial(): State {
  if (typeof window === "undefined") return { events: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch { /* ignore */ }
  return { events: [] };
}

let state: State = loadInitial();
const listeners = new Set<() => void>();

function persist() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}
function emit() { persist(); listeners.forEach((l) => l()); }
function subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

function uid() {
  return `EVT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const carePlanAuditStore = {
  getState: (): State => state,
  subscribe,

  log(input: Omit<CarePlanAuditEvent, "id" | "timestamp" | "organisationId"> & { timestamp?: string; organisationId?: string }): CarePlanAuditEvent {
    const ev: CarePlanAuditEvent = {
      id: uid(),
      organisationId: input.organisationId ?? ORG_ID,
      timestamp: input.timestamp ?? new Date().toISOString(),
      personId: input.personId,
      carePlanId: input.carePlanId,
      versionId: input.versionId,
      actor: input.actor,
      actorRole: input.actorRole,
      action: input.action,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      metadata: input.metadata,
    };
    state = { ...state, events: [...state.events, ev] };
    emit();
    return ev;
  },

  forPerson(personId: string): CarePlanAuditEvent[] {
    return state.events.filter((e) => e.personId === personId);
  },
  forVersion(versionId: string): CarePlanAuditEvent[] {
    return state.events.filter((e) => e.versionId === versionId);
  },
};

export function useCarePlanAudit(): CarePlanAuditEvent[] {
  const s = useSyncExternalStore(subscribe, carePlanAuditStore.getState, carePlanAuditStore.getState);
  return s.events;
}

export function auditActionLabel(a: CarePlanAuditAction): string {
  switch (a) {
    case "draft_created": return "Draft created";
    case "section_edited": return "Section edited";
    case "section_added": return "Section added";
    case "section_removed": return "Section removed";
    case "draft_marked_ready": return "Submitted for approval";
    case "approval_started": return "Approval started";
    case "approval_decision": return "Approval recorded";
    case "draft_rejected": return "Draft rejected";
    case "draft_published": return "Draft published";
    case "version_archived": return "Previous version archived";
    case "draft_cancelled": return "Draft cancelled";
    case "version_exported": return "Version exported";
    case "admin_override_approve": return "Admin override — approved";
    case "admin_override_publish": return "Admin override — published";
    case "review_suggestion_dismissed": return "Review suggestion — not required";
    case "review_suggestion_assigned": return "Review suggestion assigned";
    case "section_order_changed": return "Section order changed in draft";
    case "section_confirmed": return "AI draft text confirmed";
    case "assistant_change_accepted": return "Ask LogUp proposal accepted";
    case "assistant_change_rejected": return "Ask LogUp proposal rejected";
    case "reassessment_added": return "Reassessment suggestion added";
    case "reassessment_completed": return "Reassessment recorded";
  }
}
