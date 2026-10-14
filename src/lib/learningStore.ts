// Learning, Action & Prevention layer for Events.
//
// Additive, AI-assisted, human-controlled. AI may draft severity / review level /
// follow-up suggestions, a learning summary, and surface possible patterns —
// but humans (Managers/Admins) confirm everything. AI never decides
// reportability, closure, legal disclosure, safeguarding outcome, or
// compliance status.

import type { IncidentCard, Severity } from "./incidentsStore";
import type { EventType } from "./eventTypes";

// ===== Proportionate response =====

export type ReviewLevel = "Frontline review" | "Manager review" | "Governance review" | "Executive / Board review";
export type EscalationFlag = "none" | "possible" | "recommended";

export interface ProportionateResponse {
  aiSuggested: {
    severity: Severity;
    reviewLevel: ReviewLevel;
    escalation: EscalationFlag;
    suggestedActions: string[];
    rationale: string;
  };
  human?: {
    severity?: Severity;
    reviewLevel?: ReviewLevel;
    escalation?: EscalationFlag;
    confirmedBy?: string;
    confirmedAt?: string;
    note?: string;
  };
}

// ===== Linked evidence (multi-kind) =====

export type LinkedRefKind =
  | "task"
  | "audit"
  | "policy"
  | "workforce"
  | "complaint"
  | "concern"
  | "related-event"
  | "attachment"
  | "pack"
  | "coverage";

export interface LinkedRef {
  id: string;
  kind: LinkedRefKind;
  label: string;
  detail?: string;
  href?: string;
  addedBy: string;
  addedAt: string;
}

// ===== Learning summary =====

export interface LearningSection {
  body: string;
  aiDraft?: boolean;
}

export interface LearningSummary {
  whatHappened: LearningSection;
  whatWasDone: LearningSection;
  whatChanged: LearningSection;
  stillNeedsAction: LearningSection;
  learningIdentified: LearningSection;
  preventionRecommended: LearningSection;
  draftedBy?: "AI" | string;
  draftedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvedNote?: string;
}

// ===== Pattern insights =====

export type InsightKind =
  | "repeat-type"
  | "repeat-location"
  | "repeat-site"
  | "repeat-person"
  | "overdue-cluster"
  | "complaint-theme"
  | "concern-category"
  | "audit-finding"
  | "time-hotspot";

export interface PatternInsight {
  id: string;
  kind: InsightKind;
  headline: string;     // e.g. "Possible pattern: 4 medication-related Events in last 30 days at East Cork."
  detail?: string;
  count: number;
  windowDays: number;
  matchedIds: string[]; // related Event IDs supporting the insight
}

// ===== AI heuristics (deterministic, explainable) =====

const SEVERITY_RANK: Record<Severity, number> = { Low: 1, Moderate: 2, Severe: 3, Death: 4 };

export function aiDraftProportionate(card: IncidentCard): ProportionateResponse["aiSuggested"] {
  const sub = card.submission;
  let severity: Severity = card.severity;
  let escalation: EscalationFlag = "none";
  let reviewLevel: ReviewLevel = "Frontline review";
  const actions: string[] = [];
  const reasons: string[] = [];

  if (SEVERITY_RANK[severity] >= 3) {
    reviewLevel = "Governance review";
    escalation = "recommended";
    reasons.push("Severe/Death outcome");
  } else if (severity === "Moderate") {
    reviewLevel = "Manager review";
    escalation = "possible";
    reasons.push("Moderate severity");
  }

  if (sub?.notifiable.flagged) {
    reviewLevel = "Governance review";
    escalation = "recommended";
    actions.push("Confirm notifiable assessment with governance lead");
    reasons.push(`Notifiable flag (${sub.notifiable.framework || "framework TBC"})`);
  }
  if (sub?.injury?.sustained) {
    actions.push("Document injury detail and post-incident observations");
  }
  if (card.eventType === "Safeguarding Concern") {
    reviewLevel = "Governance review";
    escalation = "recommended";
    actions.push("Initiate safeguarding pathway per policy — human decision required");
    reasons.push("Safeguarding event type");
  }
  if (card.eventType === "Complaint" || card.eventType === "Concern") {
    actions.push("Acknowledge and assign reviewer within policy window");
  }
  if (card.eventType === "Inspection / Regulatory Visit" || card.eventType === "Regulatory Notification") {
    reviewLevel = "Executive / Board review";
    reasons.push("Regulatory matter");
  }
  if (!actions.length) actions.push("Review with manager and add follow-up actions as required");

  return {
    severity,
    reviewLevel,
    escalation,
    suggestedActions: actions,
    rationale: reasons.length
      ? `AI suggestion based on: ${reasons.join("; ")}. Human confirmation required.`
      : "AI suggestion based on captured detail. Human confirmation required.",
  };
}

const summarise = (s?: string, fallback = "—") => {
  const t = (s || "").trim();
  if (!t) return fallback;
  return t.length > 320 ? t.slice(0, 317) + "…" : t;
};

export function aiDraftLearning(card: IncidentCard): LearningSummary {
  const sub = card.submission;
  const drafted = new Date().toISOString();
  const what = sub?.draftSections.find(d => /happened/i.test(d.label))?.body || card.summary;
  const response = sub?.immediateActions || sub?.draftSections.find(d => /response/i.test(d.label))?.body || "Initial response captured.";
  const completedActions = card.actions.filter(a => a.status === "Complete");
  const openActions = card.actions.filter(a => a.status !== "Complete");

  return {
    whatHappened: { body: summarise(what), aiDraft: true },
    whatWasDone: {
      body: summarise(
        [response, completedActions.length ? `Completed: ${completedActions.map(a => a.title).join("; ")}` : ""]
          .filter(Boolean).join(" "),
      ),
      aiDraft: true,
    },
    whatChanged: {
      body: completedActions.length
        ? `Process / practice updates linked to: ${completedActions.map(a => a.title).join("; ")}.`
        : "No changes recorded yet — pending action completion.",
      aiDraft: true,
    },
    stillNeedsAction: {
      body: openActions.length
        ? openActions.map(a => `${a.title} (owner: ${a.assignee}, due ${a.due}, ${a.status})`).join(" · ")
        : "No outstanding actions.",
      aiDraft: true,
    },
    learningIdentified: {
      body: summarise(
        sub?.contributoryFactors ||
          `Possible learning theme: ${card.eventType || "Event"} — review contributory factors with team.`,
      ),
      aiDraft: true,
    },
    preventionRecommended: {
      body: summarise(
        sub?.prevention ||
          `Suggested prevention focus: targeted review of ${card.location || "the location"} and ${card.category || "category"} practice. Manager to confirm.`,
      ),
      aiDraft: true,
    },
    draftedBy: "AI",
    draftedAt: drafted,
  };
}

// ===== Pattern insights across pending events =====

const daysAgo = (stamp: string): number => {
  // best-effort parse of "DD Mon · HH:mm" using current year
  try {
    const m = stamp.match(/^(\d{1,2})\s+([A-Za-z]+)/);
    if (!m) return 0;
    const d = new Date(`${m[1]} ${m[2]} ${new Date().getFullYear()}`);
    return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
  } catch {
    return 0;
  }
};

export function detectInsights(target: IncidentCard, allCards: IncidentCard[], windowDays = 30): PatternInsight[] {
  const insights: PatternInsight[] = [];
  const others = allCards.filter(c => c.id !== target.id);
  const recent = others.filter(c => daysAgo(c.dateTime) <= windowDays);

  // Repeat event type at same site
  const sameTypeSite = recent.filter(c => c.eventType === target.eventType && c.site === target.site);
  if (sameTypeSite.length >= 2) {
    insights.push({
      id: `ins-type-${target.id}`,
      kind: "repeat-type",
      headline: `Possible pattern: ${sameTypeSite.length + 1} ${target.eventType || "Event"} records in the last ${windowDays} days at ${target.site}. Review suggested.`,
      count: sameTypeSite.length + 1,
      windowDays,
      matchedIds: sameTypeSite.map(c => c.id),
    });
  }

  // Repeat location
  const sameLoc = recent.filter(c => c.location === target.location && c.site === target.site);
  if (sameLoc.length >= 2) {
    insights.push({
      id: `ins-loc-${target.id}`,
      kind: "repeat-location",
      headline: `Possible location hotspot: ${sameLoc.length + 1} Events at ${target.location}, ${target.site} in last ${windowDays} days.`,
      count: sameLoc.length + 1,
      windowDays,
      matchedIds: sameLoc.map(c => c.id),
    });
  }

  // Repeat person (resident)
  if (target.resident && target.resident !== "—") {
    const sameRes = recent.filter(c => c.resident === target.resident);
    if (sameRes.length >= 1) {
      insights.push({
        id: `ins-res-${target.id}`,
        kind: "repeat-person",
        headline: `${target.resident} appears in ${sameRes.length + 1} Events in the last ${windowDays} days. Review with care team suggested.`,
        count: sameRes.length + 1,
        windowDays,
        matchedIds: sameRes.map(c => c.id),
      });
    }
  }

  // Overdue cluster
  const overdueOthers = recent.filter(c => c.overdue || c.actions.some(a => a.status === "Overdue"));
  if (overdueOthers.length >= 3) {
    insights.push({
      id: `ins-overdue-${target.id}`,
      kind: "overdue-cluster",
      headline: `${overdueOthers.length} Events with overdue follow-up in the last ${windowDays} days. Possible capacity issue — review with manager.`,
      count: overdueOthers.length,
      windowDays,
      matchedIds: overdueOthers.map(c => c.id),
    });
  }

  return insights;
}

// ===== Helpers consumed by UI =====

export const REVIEW_LEVELS: ReviewLevel[] = [
  "Frontline review",
  "Manager review",
  "Governance review",
  "Executive / Board review",
];

export const SEVERITY_OPTIONS: Severity[] = ["Low", "Moderate", "Severe", "Death"];

export const ESCALATION_LABELS: Record<EscalationFlag, string> = {
  none: "No escalation suggested",
  possible: "Escalation may be needed",
  recommended: "Escalation recommended",
};

export const LINKED_KIND_LABELS: Record<LinkedRefKind, string> = {
  task: "Follow-up task",
  audit: "Audit",
  policy: "Policy / version",
  workforce: "Workforce compliance",
  complaint: "Related complaint",
  concern: "Related concern",
  "related-event": "Previous related Event",
  attachment: "Evidence attachment",
  pack: "Inspection evidence pack",
  coverage: "Staff present / site coverage",
};
