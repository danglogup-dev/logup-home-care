// Incident workspace — enrichment + live governance overlay for the shared
// full incident modal.
//
// This file does NOT duplicate incident records. The canonical record stays in
// `incidentRecords.ts` (Events owns it). Here we hold:
//   1. Seeded enrichment for key demo incidents (narrative, immediate action,
//      notifications, manager review, source evidence) so the modal reads like
//      a complete LogUp event record.
//   2. A mutable overlay written by manager actions in the modal (status moves,
//      governance notes, follow-up actions, care plan impact decisions,
//      closures, exports) plus an append-only audit trail.
//
// Site-only geography. No units, wings or floors.

import { useEffect, useState } from "react";
import { SCENARIO_EVENTS, toEnrichment } from "./demoScenario";
import type { IncidentRecord } from "./incidentRecords";
import {
  associatedIncidentsStore, CARE_IMPACT_LABELS,
  type CarePlanImpactStatus,
} from "./associatedIncidentsStore";
import { createTask } from "./tasksStore";
import { picForSiteName } from "./demoDataRegistry";

// ---------------------------------------------------------------- types

export type CaptureMethod = "Voice" | "Text" | "Voice (translated)" | "Guided prompts";

export interface SourceEvidence {
  originalNarrative: string;
  aiSummary: string;
  submittedBy: string;
  submittedAt: string;
  captureMethod: CaptureMethod;
}

export interface NotificationStatuses {
  family?: string;
  gp?: string;
  gardai?: string;
  hiqa?: string;
  other?: string;
}

export interface ManagerReview {
  reviewer?: string;
  reviewerTitle?: string;
  reviewedAt?: string;
  summary?: string;
  learning?: string;
  governanceComments?: string;
  furtherReviewRequired?: boolean;
  flags?: string[];
  severityReviewNotes?: string;
  reviewedSeverity?: string;
}

export interface IncidentEnrichment {
  personSupported?: string;
  site?: string;
  location?: string;
  category?: string;
  subtype?: string;
  status?: string;
  severity?: string;
  reviewStage?: string;
  narrative?: string;
  immediateAction?: string;
  injury?: string;
  peopleInvolved?: string[];
  witnesses?: string[];
  notifications?: NotificationStatuses;
  managerReview?: ManagerReview;
  sourceEvidence?: SourceEvidence;
  extraActions?: { action: string; owner: string; due: string; done: boolean; priority?: string; note?: string }[];
  carePlanRef?: { planId: string; personId: string; sections: string[]; impact: CarePlanImpactStatus };
  auditSeed?: { at: string; action: string; actor: string; role: string; prev?: string; next?: string }[];
}

export interface AuditEntry {
  at: string;
  action: string;
  actor: string;
  role: string;
  prev?: string;
  next?: string;
}

export interface GovernanceNote {
  text: string;
  actor: string;
  role: string;
  at: string;
}

export interface IncidentOverlay {
  status?: string;
  reviewStage?: string;
  reviewer?: string;
  reviewerTitle?: string;
  reviewStartedAt?: string;
  reviewStartedBy?: string;
  reviewedSeverity?: string;
  severityReviewNotes?: string;
  governanceNotes: GovernanceNote[];
  extraActions: { action: string; owner: string; due: string; done: boolean; priority?: string; note?: string }[];
  carePlanImpact?: { decision: CarePlanImpactStatus; reason?: string; sections?: string[]; actor: string; at: string };
  closedAt?: string;
  closedBy?: string;
  closureSummary?: string;
  audit: AuditEntry[];
}

// ---------------------------------------------------------------- seeds

const EV = (
  originalNarrative: string,
  aiSummary: string,
  submittedBy: string,
  submittedAt: string,
  captureMethod: CaptureMethod = "Guided prompts",
): SourceEvidence => ({ originalNarrative, aiSummary, submittedBy, submittedAt, captureMethod });

export const INCIDENT_ENRICHMENT: Record<string, IncidentEnrichment> = Object.fromEntries(
  SCENARIO_EVENTS.map((e) => [e.id, toEnrichment(e) as IncidentEnrichment]),
);

// ---------------------------------------------------------------- overlay store

const overlays = new Map<string, IncidentOverlay>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((fn) => fn());
}

function ensure(id: string): IncidentOverlay {
  let o = overlays.get(id);
  if (!o) {
    o = { governanceNotes: [], extraActions: [], audit: [] };
    overlays.set(id, o);
  }
  return o;
}

function stamp(): string {
  const d = new Date();
  return `${d.getDate().toString().padStart(2, "0")} ${d.toLocaleString("en-IE", { month: "short" })} ${d.getFullYear()} · ${d.toTimeString().slice(0, 5)}`;
}

export const incidentWorkspaceStore = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  getVersion: () => version,
  getOverlay: (id: string): IncidentOverlay | undefined => overlays.get(id),

  logAudit(id: string, entry: Omit<AuditEntry, "at"> & { at?: string }) {
    const o = ensure(id);
    o.audit = [...o.audit, { at: entry.at ?? stamp(), ...entry }];
    emit();
  },

  moveToUnderReview(id: string, actor: string, role: string, prevStatus: string, currentReviewer?: string) {
    const o = ensure(id);
    o.status = "Under Review";
    o.reviewStage = "Investigation";
    if (!currentReviewer || currentReviewer === "Pending" || currentReviewer === "—") o.reviewer = actor;
    o.reviewStartedAt = o.reviewStartedAt ?? stamp();
    o.reviewStartedBy = o.reviewStartedBy ?? actor;
    o.audit = [
      ...o.audit,
      { at: stamp(), action: "Status changed", actor, role, prev: prevStatus, next: "Under Review" },
      { at: stamp(), action: "Manager/PIC review started", actor, role },
      ...(o.reviewer ? [{ at: stamp(), action: "Reviewer assigned", actor, role, next: o.reviewer }] : []),
    ];
    emit();
  },

  /** Assign (or take) the PIC / Manager reviewer for an incident. */
  assignReviewer(id: string, reviewer: string, reviewerTitle: string, actor: string, role: string, prev?: string) {
    const o = ensure(id);
    o.reviewer = reviewer;
    o.reviewerTitle = reviewerTitle;
    o.audit = [
      ...o.audit,
      { at: stamp(), action: "Reviewer assigned", actor, role, prev: prev || undefined, next: reviewer },
    ];
    emit();
  },

  /** Record the reviewed (confirmed) severity decision. */
  confirmSeverity(id: string, severity: string, notes: string | undefined, actor: string, role: string, prev?: string) {
    const o = ensure(id);
    o.reviewedSeverity = severity;
    o.severityReviewNotes = notes;
    o.audit = [
      ...o.audit,
      { at: stamp(), action: "Severity confirmed at review", actor, role, prev, next: severity + (notes ? ` — ${notes}` : "") },
    ];
    emit();
  },


  addGovernanceNote(id: string, text: string, actor: string, role: string) {
    const o = ensure(id);
    const at = stamp();
    o.governanceNotes = [...o.governanceNotes, { text, actor, role, at }];
    o.audit = [...o.audit, { at, action: "Governance note added", actor, role, next: text }];
    emit();
  },

  addFollowUpAction(
    id: string,
    input: { action: string; owner: string; due: string; priority: string },
    actor: string,
    role: string,
  ) {
    const o = ensure(id);
    o.extraActions = [...o.extraActions, { ...input, done: false }];
    o.audit = [
      ...o.audit,
      { at: stamp(), action: "Follow-up action created", actor, role, next: `${input.action} · ${input.owner} · due ${input.due}` },
    ];
    emit();
  },

  recordCarePlanImpact(
    id: string,
    decision: CarePlanImpactStatus,
    opts: { reason?: string; sections?: string[]; actor: string; role: string; prevLabel?: string },
  ) {
    const o = ensure(id);
    o.carePlanImpact = {
      decision, reason: opts.reason, sections: opts.sections,
      actor: opts.actor, at: new Date().toISOString(),
    };
    // Care Planning owns the association layer — write through when linked.
    const assoc = associatedIncidentsStore.getById(id);
    if (assoc) {
      if (decision === "no_review_required" && opts.reason) {
        associatedIncidentsStore.markNoReview(id, opts.actor, opts.reason);
      } else if (decision === "review_required" || decision === "review_suggested") {
        associatedIncidentsStore.markReviewRequired(id, opts.actor, opts.sections ?? assoc.linkedSections);
      } else if (decision === "draft_created") {
        associatedIncidentsStore.markDraftCreated(
          id, opts.actor, (assoc.linkedDraftVersion ?? 3) + 1, opts.sections ?? assoc.linkedSections,
        );
      }
    }
    o.audit = [
      ...o.audit,
      {
        at: stamp(), action: "Care plan impact decision recorded", actor: opts.actor, role: opts.role,
        prev: opts.prevLabel, next: CARE_IMPACT_LABELS[decision] + (opts.reason ? ` — ${opts.reason}` : ""),
      },
    ];
    emit();
  },

  closeIncident(id: string, summary: string, actor: string, role: string, prevStatus: string) {
    const o = ensure(id);
    o.status = "Closed";
    o.reviewStage = "Closed";
    o.closedAt = stamp();
    o.closedBy = actor;
    o.closureSummary = summary;
    o.audit = [
      ...o.audit,
      { at: stamp(), action: "Incident closed", actor, role, prev: prevStatus, next: "Closed" },
    ];
    emit();
  },

  logExport(id: string, actor: string, role: string, detail: string) {
    const o = ensure(id);
    o.audit = [...o.audit, { at: stamp(), action: "Export requested", actor, role, next: detail }];
    emit();
  },
};

// ---------------------------------------------------------------- merged view

export interface IncidentView {
  personSupported: string;
  site: string;
  location: string;
  category: string;
  subtype?: string;
  status: string;
  severity: string;
  initialSeverity: string;
  reviewedSeverity?: string;
  reviewStage?: string;
  /** Assigned reviewer, when one exists. Undefined means "PIC review pending". */
  reviewer?: string;
  reviewerTitle?: string;
  /** Suggested PIC / Manager for the site (used when no reviewer is assigned). */
  defaultPic?: string;
  defaultPicTitle?: string;
  reviewStartedAt?: string;
  /** Person who entered the record into LogUp. */
  capturedBy: string;
  capturedAt: string;
  captureMethod?: CaptureMethod;
  /** Only set when the originating reporter differs from the person who captured it. */
  reportedBy?: string;
  submittedBy: string;
  submittedAt: string;

  narrative: string;
  immediateAction?: string;
  injury?: string;
  peopleInvolved: string[];
  witnesses: string[];
  notifications: NotificationStatuses;
  managerReview?: ManagerReview;
  sourceEvidence?: SourceEvidence;
  governanceNotes: GovernanceNote[];
  actions: { action: string; owner: string; due: string; done: boolean; priority?: string; note?: string }[];
  carePlanRef?: IncidentEnrichment["carePlanRef"];
  audit: AuditEntry[];
  closure?: { at: string; by: string; summary: string };
}

function parseDue(due: string): number {
  const t = new Date(due).getTime();
  return isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/** Merge canonical record + seeded enrichment + live overlay into one view. */
export function buildIncidentView(record: IncidentRecord): IncidentView {
  const e = INCIDENT_ENRICHMENT[record.id] ?? {};
  const o = overlays.get(record.id);

  const status = o?.status ?? e.status ?? record.status;
  const reviewerFromPeople = record.people.find((p) => /review/i.test(p.role));
  const submittedPerson = record.people.find((p) => /submit|report/i.test(p.role));

  const pic = picForSiteName(e.site ?? record.site);

  const reviewer = o?.reviewer
    ?? e.managerReview?.reviewer
    ?? (record.reviewedBy && record.reviewedBy !== "Pending" ? record.reviewedBy : undefined)
    ?? (reviewerFromPeople && reviewerFromPeople.name !== "Pending" ? reviewerFromPeople.name : undefined);

  // Manager review: seeded, else derived from the investigation record for
  // any incident that has progressed past submission.
  const reviewedStatuses = /under review|actions required|completed|closed|overdue/i;
  let managerReview: ManagerReview | undefined = e.managerReview;
  if (!managerReview && reviewedStatuses.test(status)) {
    const inv = record.investigation;
    managerReview = {
      reviewer: reviewer ?? "Assigned reviewer pending",
      reviewerTitle: reviewerFromPeople?.title || "Manager / PIC",
      reviewedAt: inv?.approvedAt ?? inv?.startedAt,
      summary: inv?.findings
        ?? `Account reviewed with the staff involved. The response described was appropriate and proportionate, and the record is consistent with the source evidence captured at the time.`,
      learning: inv?.recommendations
        ?? "Learning shared at handover. No change to practice required beyond the follow-up actions recorded below.",
      governanceComments: inv?.rootCause
        ? `Root cause identified: ${inv.rootCause}`
        : "No safeguarding concern identified. Reviewed against site governance thresholds.",
      furtherReviewRequired: (record.actions ?? []).some((a) => !a.done),
      flags: inv?.contributingFactors,
      reviewedSeverity: record.severity,
    };
  }
  if (managerReview && (o?.severityReviewNotes || o?.reviewedSeverity)) {
    managerReview = {
      ...managerReview,
      severityReviewNotes: o.severityReviewNotes ?? managerReview.severityReviewNotes,
      reviewedSeverity: o.reviewedSeverity ?? managerReview.reviewedSeverity,
    };
  }

  const actions = [
    ...record.actions.map((a) => ({ ...a })),
    ...(e.extraActions ?? []),
    ...(o?.extraActions ?? []),
  ].sort((a, b) => Number(a.done) - Number(b.done) || parseDue(a.due) - parseDue(b.due));

  const seedAudit: AuditEntry[] = e.auditSeed
    ?? record.chronology.map((c) => ({
      at: c.time,
      action: c.event,
      actor: submittedPerson?.name ?? record.submittedBy,
      role: submittedPerson?.title || "Frontline",
    }));

  const assoc = associatedIncidentsStore.getById(record.id);
  const carePlanRef = e.carePlanRef ?? (assoc
    ? { planId: `CP-${assoc.personId.replace("-", "")}`, personId: assoc.personId, sections: assoc.linkedSections ?? [], impact: assoc.careImpact }
    : undefined);

  const closure = o?.closedAt
    ? { at: o.closedAt, by: o.closedBy ?? "—", summary: o.closureSummary ?? "" }
    : record.closure
      ? { at: record.closure.closedAt, by: record.closure.closedBy, summary: record.closure.summary }
      : undefined;

  const capturedBy = e.sourceEvidence?.submittedBy ?? submittedPerson?.name ?? record.submittedBy;
  const reportedByRaw = record.people.find((p) => /report/i.test(p.role))?.name;
  const reportedBy = reportedByRaw && reportedByRaw !== capturedBy ? reportedByRaw : undefined;
  const capturedAt = e.sourceEvidence?.submittedAt ?? record.date;

  return {
    personSupported: e.personSupported ?? record.resident,
    site: e.site ?? record.site,
    location: e.location || record.location || "Not recorded",
    category: e.category ?? record.primaryCategory ?? record.category,
    subtype: e.subtype ?? record.secondaryCategory ?? record.category,
    status,
    severity: e.severity ?? record.severity,
    initialSeverity: record.severity,
    reviewedSeverity: o?.reviewedSeverity ?? e.managerReview?.reviewedSeverity ?? managerReview?.reviewedSeverity,
    reviewStage: o?.reviewStage ?? e.reviewStage ?? record.lifecycleStatus,
    reviewer,
    reviewerTitle: o?.reviewerTitle ?? e.managerReview?.reviewerTitle ?? reviewerFromPeople?.title,
    defaultPic: pic?.name,
    defaultPicTitle: pic?.roleLabel,
    reviewStartedAt: o?.reviewStartedAt,
    capturedBy,
    capturedAt,
    captureMethod: e.sourceEvidence?.captureMethod,
    reportedBy,
    submittedBy: capturedBy,
    submittedAt: capturedAt,

    narrative: e.narrative ?? record.summary,
    immediateAction: e.immediateAction
      ?? (record.chronology.slice(1).map((c) => c.event).join(". ") || undefined),
    injury: e.injury,
    peopleInvolved: e.peopleInvolved
      ?? record.people.filter((p) => !/review/i.test(p.role)).map((p) => `${p.name}${p.title ? ` — ${p.title}` : ""}`),
    witnesses: e.witnesses ?? record.people.filter((p) => /witness/i.test(p.role)).map((p) => p.name),
    notifications: e.notifications ?? {},
    managerReview,
    sourceEvidence: e.sourceEvidence,
    governanceNotes: o?.governanceNotes ?? [],
    actions,
    carePlanRef,
    audit: [...seedAudit, ...(o?.audit ?? [])],
    closure,
  };
}

/** Subscribe to overlay changes; returns the merged view (recomputed per render). */
export function useIncidentView(record: IncidentRecord | null): IncidentView | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubA = incidentWorkspaceStore.subscribe(() => setTick((n) => n + 1));
    const unsubB = associatedIncidentsStore.subscribe(() => setTick((n) => n + 1));
    return () => { unsubA(); unsubB(); };
  }, []);
  return record ? buildIncidentView(record) : null;
}

// ---------------------------------------------------------------- closure gate

export interface ClosureCheck {
  ok: boolean;
  blockers: string[];
}

export function closureBlockers(view: IncidentView, notificationAssessed: boolean): ClosureCheck {
  const blockers: string[] = [];
  if (!view.managerReview?.summary) blockers.push("Manager review incomplete — record a review summary first.");
  if (!view.reviewedSeverity) blockers.push("Severity not confirmed at review.");
  const open = view.actions.filter((a) => !a.done);
  if (open.length > 0) blockers.push(`${open.length} follow-up action${open.length === 1 ? "" : "s"} still open.`);
  if (!view.carePlanRef || view.carePlanRef.impact === "not_checked") blockers.push("Care plan impact not checked.");
  if (!notificationAssessed) blockers.push("Notification status not assessed.");
  return { ok: blockers.length === 0, blockers };
}

// ---------------------------------------------------------------- task bridge

/** Create a linked Tasks-module record for a follow-up action, when possible. */
export function createLinkedTask(input: {
  incidentId: string;
  title: string;
  owner: string;
  dueIso: string;
  priority: "low" | "normal" | "high";
  siteId: string;
  createdById: string;
}) {
  try {
    createTask({
      title: input.title,
      description: `Follow-up action from incident ${input.incidentId}.`,
      taskType: "follow_up",
      sourceType: "incident",
      sourceRef: input.incidentId,
      siteId: input.siteId,
      assigneeId: input.owner,
      assignedById: input.createdById,
      dueAt: input.dueIso,
      priority: input.priority,
      ownership: "person",
    });
  } catch {
    /* Tasks module unavailable in this context — the action is still recorded on the incident. */
  }
}
