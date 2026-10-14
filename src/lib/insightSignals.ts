/**
 * Live Events and Care Planning signals for Insights — calculated from the
 * stores, never seeded. All signal logic lives here; the Insights page only
 * renders what this returns.
 *
 * Wording rules: titles start with "Potential pattern", "Overdue" or
 * "Needs attention". Signals never state a cause and never judge a plan.
 * Output is fixed-rule ("LogUp suggestion"), not AI.
 */
import { useEffect, useState } from "react";
import type { Insight } from "./insightsData";
import { incidentRecords } from "./incidentRecords";
import { incidentsStore, type IncidentCard } from "./incidentsStore";
import { carePlansStore } from "./carePlansStore";
import { assessmentsStore, isAssessmentOverdue, ASSESSMENT_CATEGORY_LABELS } from "./assessmentsStore";
import { serviceUsersStore } from "./serviceUsersStore";
import { sitesStore } from "./sitesStore";
import { scopedSiteIds, type RoleState } from "./roleStore";
import type { SiteId } from "./demoDataRegistry";

export type SignalKind =
  | "repeat_events" | "review_flag_overdue" | "care_plan_review_overdue"
  | "assessment_overdue" | "missing_service_user_link"
  | "notification_deadline" | "action_overdue";

export interface SignalLink { path: string; kind: "incident" | "care_plan" }

/** Insight plus the extra fields a live signal carries. */
export interface SignalInsight extends Insight {
  signalKind: SignalKind;
  origin: "logup_rule";
  /** "Based on" line: the records counted. */
  basedOn: string;
  recordLinks: Record<string, SignalLink>;
  /** For missing-link signals: the event and the site's service users. */
  eventId?: string;
}

// ─── Unified event view (read-only) ─────────────────────────────────────────

export interface EventView {
  id: string;
  siteName: string;
  siteId?: SiteId;
  serviceUserId?: string;
  category: string;
  severity: string;
  date: Date;
  narrative: string;
  closed: boolean;
  submitted: boolean; // from the capture flow (opens on the Board)
}

const siteIdFor = (name: string) => sitesStore.all().find((s) => s.name === name)?.id;

function cardDate(c: IncidentCard): Date {
  const d = c.submission?.dateOfIncident;
  const parsed = d ? new Date(d) : null;
  return parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
}

/** All events (records + submitted), shared with the site page. */
export function allEvents(): EventView[] {
  const fromRecords: EventView[] = incidentRecords.map((i) => ({
    id: i.id, siteName: i.site, siteId: siteIdFor(i.site), serviceUserId: i.serviceUserId,
    category: i.primaryCategory ?? i.category, severity: i.severity, date: i.dateObj,
    narrative: [i.summary, ...i.chronology.map((c) => c.event)].join(" "),
    closed: i.lifecycleStatus === "Closed",
    submitted: false,
  }));
  const fromCards: EventView[] = incidentsStore.getPending().map((c) => ({
    id: c.id, siteName: c.site, siteId: siteIdFor(c.site),
    serviceUserId: c.serviceUserId ?? linkResolutionFor(c.id)?.serviceUserId,
    category: c.primaryCategory ?? c.category, severity: c.severity, date: cardDate(c),
    narrative: [c.summary, c.submission?.originalText ?? ""].join(" "),
    closed: c.column === "complete",
    submitted: true,
  }));
  const ids = new Set(fromCards.map((c) => c.id));
  return [...fromCards, ...fromRecords.filter((r) => !ids.has(r.id)).map((r) => ({
    ...r, serviceUserId: r.serviceUserId ?? linkResolutionFor(r.id)?.serviceUserId,
  }))];
}

const eventLink = (e: EventView): SignalLink => ({
  kind: "incident",
  path: e.submitted ? `/app/incidents/board?eventId=${e.id}` : `/app/incidents/reporting?incidentId=${e.id}`,
});
const planLink = (personId: string): SignalLink => ({ kind: "care_plan", path: `/app/care-plans/plans/${personId}` });

// ─── Resolutions and dismissals (append-only, persisted) ────────────────────

export interface LinkResolution {
  eventId: string;
  outcome: "linked" | "not_applicable";
  serviceUserId?: string;
  reason?: string;
  by: string;
  byStaffId?: string;
  at: string;
}

export interface SignalDismissal {
  signalId: string;
  /** Records the card was based on; new records bring the card back. */
  basisKey: string;
  reason: string;
  by: string;
  byStaffId?: string;
  at: string;
}

const KEY = "logup.insightSignals.v1";
interface Persisted { resolutions: LinkResolution[]; dismissals: SignalDismissal[] }
function load(): Persisted {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch { /* ignore */ }
  return { resolutions: [], dismissals: [] };
}
let persisted: Persisted = typeof window === "undefined" ? { resolutions: [], dismissals: [] } : load();
const listeners = new Set<() => void>();
function emit() {
  try { localStorage.setItem(KEY, JSON.stringify(persisted)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

function linkResolutionFor(eventId: string): LinkResolution | undefined {
  const all = persisted.resolutions.filter((r) => r.eventId === eventId);
  return all[all.length - 1];
}

/** Service user a person linked to this event (latest link resolution), if any. */
export function linkedServiceUserIdFor(eventId: string): string | undefined {
  const r = linkResolutionFor(eventId);
  return r?.outcome === "linked" ? r.serviceUserId : undefined;
}

export const insightSignalsStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  dismissals: () => persisted.dismissals,
  resolutions: () => persisted.resolutions,

  dismiss(signal: SignalInsight, reason: string, by: string, byStaffId?: string): boolean {
    if (!reason.trim()) return false;
    persisted = {
      ...persisted,
      dismissals: [...persisted.dismissals, {
        signalId: signal.id, basisKey: signal.relatedRecordIds.join("|"), reason: reason.trim(), by, byStaffId, at: new Date().toISOString(),
      }],
    };
    emit();
    return true;
  },

  /** A person links the service user. Never called from narrative matching. */
  linkServiceUser(eventId: string, serviceUserId: string, by: string, byStaffId?: string) {
    persisted = { ...persisted, resolutions: [...persisted.resolutions, { eventId, outcome: "linked", serviceUserId, by, byStaffId, at: new Date().toISOString() }] };
    emit();
  },

  markNotApplicable(eventId: string, reason: string, by: string, byStaffId?: string): boolean {
    if (!reason.trim()) return false;
    persisted = { ...persisted, resolutions: [...persisted.resolutions, { eventId, outcome: "not_applicable", reason: reason.trim(), by, byStaffId, at: new Date().toISOString() }] };
    emit();
    return true;
  },
};

// ─── Signal calculations ────────────────────────────────────────────────────

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const nameFor = (id?: string) => serviceUsersStore.getById(id)?.name ?? "";
const codeFor = (id?: string) => serviceUsersStore.getById(id)?.serviceUserCode ?? id ?? "";

function base(p: {
  id: string; kind: SignalKind; title: string; category: Insight["category"]; type: Insight["type"];
  siteName: string; siteId?: string; resident?: string; start: Date; end: Date;
  ids: string[]; links: Record<string, SignalLink>; summary: string; why: string;
  review: string[]; actions: string[]; basedOn: string; eventId?: string; due?: string;
}): SignalInsight {
  const now = new Date().toISOString();
  return {
    id: p.id, title: p.title, category: p.category, type: p.type, confidence: "High",
    site: p.siteName, relatedSiteIds: p.siteId ? [p.siteId] : [], resident: p.resident,
    dateRangeStart: iso(p.start), dateRangeEnd: iso(p.end),
    relatedCount: p.ids.length, relatedRecordIds: p.ids, primarySourceId: p.ids[0],
    summary: p.summary, whyItMatters: p.why, suggestedReview: p.review, suggestedActions: p.actions,
    status: "New", dueDate: p.due, createdAt: now, updatedAt: now,
    auditTrail: [{ at: now, by: "LogUp", event: "Calculated from live records (LogUp suggestion)" }],
    signalKind: p.kind, origin: "logup_rule", basedOn: p.basedOn, recordLinks: p.links, eventId: p.eventId,
  };
}

function repeatEvents(events: EventView[]): SignalInsight[] {
  const groups = new Map<string, EventView[]>();
  events.filter((e) => e.serviceUserId).forEach((e) => {
    const k = `${e.serviceUserId}|${e.category}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  });
  const out: SignalInsight[] = [];
  groups.forEach((list, k) => {
    const sorted = [...list].sort((a, b) => a.date.getTime() - b.date.getTime());
    // Largest cluster within any 30-day window.
    let best: EventView[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const win = sorted.filter((e) => e.date.getTime() >= sorted[i].date.getTime() && e.date.getTime() - sorted[i].date.getTime() <= 30 * DAY);
      if (win.length >= best.length) best = win; // ties: most recent cluster
    }
    if (best.length < 2) return;
    const [suId, category] = k.split("|");
    const e0 = best[0];
    out.push(base({
      id: `SIG-REPEAT-${suId}-${category}`, kind: "repeat_events", category: "Event / incident risks", type: "Resident",
      title: `Potential pattern: ${best.length} ${category.toLowerCase()} events for ${nameFor(suId)} within 30 days`,
      siteName: e0.siteName, siteId: e0.siteId, resident: nameFor(suId),
      start: best[0].date, end: best[best.length - 1].date,
      ids: best.map((e) => e.id), links: Object.fromEntries(best.map((e) => [e.id, eventLink(e)])),
      summary: `${best.length} events in the "${category}" category are recorded for ${nameFor(suId)} (${codeFor(suId)}) within 30 days.`,
      why: "Two or more events of the same category for one person within 30 days.",
      review: ["Open each event and compare circumstances", "Check whether the care plan review suggestion has a decision"],
      actions: ["Open the linked events"],
      basedOn: `${best.length} events: ${best.map((e) => e.id).join(", ")}`,
    }));
  });
  return out;
}

function siteOfPerson(personId: string) {
  const su = serviceUsersStore.getById(personId);
  const site = su ? sitesStore.getById(su.siteId) : undefined;
  return { siteName: site?.name ?? su?.siteName ?? "", siteId: su?.siteId };
}

function bySite<T>(items: T[], siteIdOf: (t: T) => string | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>();
  items.forEach((t) => { const s = siteIdOf(t) ?? ""; m.set(s, [...(m.get(s) ?? []), t]); });
  return m;
}

function reviewFlagsOverdue(): SignalInsight[] {
  const now = Date.now();
  const st = carePlansStore.getState();
  const late = st.suggestions.filter((s) => s.status === "open" && s.dueAt && new Date(s.dueAt).getTime() < now);
  const out: SignalInsight[] = [];
  bySite(late, (s) => siteOfPerson(s.personId).siteId).forEach((list, siteId) => {
    const site = sitesStore.getById(siteId);
    const people = Array.from(new Set(list.map((s) => s.personId)));
    out.push(base({
      id: `SIG-REVIEWFLAG-${siteId}`, kind: "review_flag_overdue", category: "Care plan risks", type: "Governance",
      title: `Overdue: ${list.length} care plan review flag${list.length === 1 ? "" : "s"} with no decision after the due date`,
      siteName: site?.name ?? "", siteId,
      start: new Date(Math.min(...list.map((s) => new Date(s.dueAt!).getTime()))), end: new Date(),
      ids: people.map((p) => `CP-${p}`), links: Object.fromEntries(people.map((p) => [`CP-${p}`, planLink(p)])),
      summary: `Review flags for ${people.map(nameFor).join(", ")} are past their due date without a decision.`,
      why: "A review flag stays open until a person starts a review, assigns it or records that it isn't required.",
      review: ["Open each care plan and record a decision on the review flag"],
      actions: ["Open the linked care plans"],
      basedOn: `${list.length} review flag${list.length === 1 ? "" : "s"}: ${list.map((s) => `${s.eventLabel ?? s.title} (due ${s.dueAt!.slice(0, 10)})`).join("; ")}`,
    }));
  });
  return out;
}

function carePlansPastReview(): SignalInsight[] {
  const now = new Date();
  const st = carePlansStore.getState();
  const late: { personId: string; due: Date; months: number }[] = [];
  st.plans.forEach((p) => {
    const current = p.versions.find((v) => v.id === p.currentVersionId);
    const tpl = st.templates.find((t) => t.id === (current?.templateId ?? p.templateId));
    const tv = tpl?.versions.find((v) => v.status === "published") ?? tpl?.versions[tpl.versions.length - 1];
    const months = tv?.reviewFrequencyMonths ?? p.reviewFrequencyMonths;
    const from = current?.publishedAt ?? current?.createdAt;
    if (!from) return;
    const due = new Date(from);
    due.setMonth(due.getMonth() + months);
    if (due < now) late.push({ personId: p.personId, due, months });
  });
  const out: SignalInsight[] = [];
  bySite(late, (x) => siteOfPerson(x.personId).siteId).forEach((list, siteId) => {
    const site = sitesStore.getById(siteId);
    out.push(base({
      id: `SIG-PLANREVIEW-${siteId}`, kind: "care_plan_review_overdue", category: "Care plan risks", type: "Governance",
      title: `Overdue: ${list.length} care plan${list.length === 1 ? "" : "s"} past the review date`,
      siteName: site?.name ?? "", siteId,
      start: new Date(Math.min(...list.map((x) => x.due.getTime()))), end: now,
      ids: list.map((x) => `CP-${x.personId}`), links: Object.fromEntries(list.map((x) => [`CP-${x.personId}`, planLink(x.personId)])),
      summary: `The review date, set by the template's review frequency, has passed for ${list.map((x) => nameFor(x.personId)).join(", ")}.`,
      why: "Review date = last published version + the template's review frequency.",
      review: ["Open each care plan and schedule its review"],
      actions: ["Open the linked care plans"],
      basedOn: list.map((x) => `${codeFor(x.personId)}: review due ${iso(x.due)} (every ${x.months} months)`).join("; "),
    }));
  });
  return out;
}

function assessmentsOverdue(): SignalInsight[] {
  const all = assessmentsStore.getAll();
  // Only the latest assessment per person + category counts.
  const latest = new Map<string, (typeof all)[number]>();
  all.forEach((a) => {
    const k = `${a.serviceUserId}|${a.category}`;
    const cur = latest.get(k);
    if (!cur || a.assessedAt > cur.assessedAt) latest.set(k, a);
  });
  const late = Array.from(latest.values()).filter((a) => isAssessmentOverdue(a));
  const out: SignalInsight[] = [];
  bySite(late, (a) => siteOfPerson(a.serviceUserId).siteId).forEach((list, siteId) => {
    const site = sitesStore.getById(siteId);
    const people = Array.from(new Set(list.map((a) => a.serviceUserId)));
    out.push(base({
      id: `SIG-ASSESS-${siteId}`, kind: "assessment_overdue", category: "Care plan risks", type: "Governance",
      title: `Overdue: ${list.length} assessment${list.length === 1 ? "" : "s"} past the next due date`,
      siteName: site?.name ?? "", siteId,
      start: new Date(Math.min(...list.map((a) => new Date(a.nextDueAt).getTime()))), end: new Date(),
      ids: people.map((p) => `CP-${p}`), links: Object.fromEntries(people.map((p) => [`CP-${p}`, planLink(p)])),
      summary: `Assessments past their next due date: ${list.map((a) => `${nameFor(a.serviceUserId)} — ${ASSESSMENT_CATEGORY_LABELS[a.category]}`).join("; ")}.`,
      why: "The latest assessment of this kind has passed its next due date.",
      review: ["Open the care plan's Assessments tab"],
      actions: ["Record the assessment if staff decide to reassess"],
      basedOn: list.map((a) => `${a.id} (${codeFor(a.serviceUserId)}, due ${a.nextDueAt.slice(0, 10)})`).join("; "),
    }));
  });
  return out;
}

const MISSING_LINK_TEXT = "The event narrative appears to mention a person supported, but no service user is linked.";

function missingLinks(events: EventView[]): SignalInsight[] {
  const out: SignalInsight[] = [];
  events.forEach((e) => {
    if (e.serviceUserId || !e.siteId) return;
    if (linkResolutionFor(e.id)) return;
    const candidates = serviceUsersStore.all().filter((u) => u.siteId === e.siteId && u.status === "active");
    const mentioned = candidates.filter((u) => {
      const names = [u.name.split(" ")[0], u.preferredName].filter(Boolean) as string[];
      return names.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(e.narrative));
    });
    if (mentioned.length === 0) return;
    out.push(base({
      id: `SIG-LINK-${e.id}`, kind: "missing_service_user_link", category: "Event / incident risks", type: "Governance",
      title: `Needs attention: possible missing service-user link on ${e.id}`,
      siteName: e.siteName, siteId: e.siteId, start: e.date, end: e.date,
      ids: [e.id], links: { [e.id]: eventLink(e) },
      summary: MISSING_LINK_TEXT,
      why: "Names in the narrative are never linked automatically. A person links a service user or marks it as not applicable.",
      review: ["Read the narrative and decide whether a service user should be linked"],
      actions: ["Link a service user, or mark as not applicable with a reason"],
      basedOn: `1 event: ${e.id}`,
      eventId: e.id,
    }));
  });
  return out;
}

/** Working days from now until a date (negative when missed). */
function workingDaysUntil(due: Date, now = new Date()): number {
  const a = new Date(now); a.setHours(0, 0, 0, 0);
  const b = new Date(due); b.setHours(0, 0, 0, 0);
  const step = b >= a ? 1 : -1; let n = 0; const d = new Date(a);
  while (d.getTime() !== b.getTime()) { d.setDate(d.getDate() + step); const w = d.getDay(); if (w !== 0 && w !== 6) n += step; }
  return n;
}

function notificationDeadlines(sites: Set<string>): SignalInsight[] {
  const out: SignalInsight[] = [];
  incidentRecords.forEach((r) => {
    const n = r.regulatoryNotification;
    if (!n?.dueAt || n.submittedAt || n.outcome !== "likely_notifiable") return;
    const siteId = siteIdFor(r.site);
    if (!siteId || !sites.has(siteId)) return;
    const due = new Date(n.dueAt);
    const left = workingDaysUntil(due);
    if (left > 1) return;
    const missed = due.getTime() < Date.now();
    const e: EventView = { id: r.id, siteName: r.site, siteId, category: r.category, severity: r.severity, date: r.dateObj, narrative: "", closed: false, submitted: false };
    out.push(base({
      id: `SIG-NOTIFY-${r.id}`, kind: "notification_deadline", category: "Event / incident risks", type: "Governance",
      title: missed ? `Overdue: ${n.formCode} notification deadline missed for ${r.id}` : `Needs attention: ${n.formCode} notification due within 1 working day for ${r.id}`,
      siteName: r.site, siteId, start: r.dateObj, end: due,
      ids: [r.id], links: { [r.id]: eventLink(e) },
      summary: `${n.formTitle ?? n.formCode}. LogUp suggestion: likely notifiable. Deadline ${due.toLocaleString()}.`,
      why: "The deadline comes from the notification form's time limit, counted from the event date. A person decides whether to notify.",
      review: ["Open the event and confirm whether the notification is required"],
      actions: ["Prepare the notification form, or record why it is not required"],
      basedOn: `1 event: ${r.id} (${n.formCode}, due ${n.dueAt.slice(0, 10)})`,
      eventId: r.id,
    }));
  });
  return out;
}

function actionsOverdue(sites: Set<string>): SignalInsight[] {
  const now = Date.now();
  const late = incidentRecords.flatMap((r) => r.actions.filter((a) => !a.done && new Date(a.due).getTime() < now).map((a) => ({ r, a })));
  const out: SignalInsight[] = [];
  bySite(late, (x) => siteIdFor(x.r.site) as SiteId).forEach((list, siteId) => {
    if (!sites.has(siteId)) return;
    const site = sitesStore.getById(siteId);
    const ids = Array.from(new Set(list.map((x) => x.r.id)));
    out.push(base({
      id: `SIG-ACTIONS-${siteId}`, kind: "action_overdue", category: "Event / incident risks", type: "Governance",
      title: `Overdue: ${list.length} event follow-up action${list.length === 1 ? "" : "s"} past the due date`,
      siteName: site?.name ?? "", siteId,
      start: new Date(Math.min(...list.map((x) => new Date(x.a.due).getTime()))), end: new Date(),
      ids, links: Object.fromEntries(list.map((x) => [x.r.id, eventLink({ id: x.r.id, siteName: x.r.site, siteId: siteId as SiteId, category: "", severity: "", date: x.r.dateObj, narrative: "", closed: false, submitted: false })])),
      summary: `Follow-up actions not completed by their due date: ${list.map((x) => `${x.a.action} (${x.a.owner})`).join("; ")}.`,
      why: "An action is overdue when it is not marked done by its due date.",
      review: ["Open the event and check the action with its owner"],
      actions: ["Complete the action or agree a new due date"],
      basedOn: list.map((x) => `${x.r.id}: ${x.a.action}, due ${x.a.due}`).join("; "),
    }));
  });
  return out;
}

/** Every live signal visible to this role, minus dismissed ones. */
export function computeInsightSignals(role: RoleState): SignalInsight[] {
  const sites = new Set<string>(scopedSiteIds(role));
  const events = allEvents().filter((e) => e.siteId && sites.has(e.siteId));
  const all = [
    ...repeatEvents(events),
    ...missingLinks(events),
    ...reviewFlagsOverdue(),
    ...carePlansPastReview(),
    ...assessmentsOverdue(),
    ...notificationDeadlines(sites),
    ...actionsOverdue(sites),
  ].filter((s) => (s.relatedSiteIds ?? []).some((id) => sites.has(id)));
  const dismissed = persisted.dismissals;
  return all.filter((s) => !dismissed.some((d) => d.signalId === s.id && d.basisKey === s.relatedRecordIds.join("|")));
}

export function isSignal(i: Insight): i is SignalInsight {
  return (i as SignalInsight).origin === "logup_rule";
}

/** Recomputes when any source store changes. */
export function useInsightSignals(role: RoleState): SignalInsight[] {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const unsubs = [
      insightSignalsStore.subscribe(bump),
      carePlansStore.subscribe(bump),
      assessmentsStore.subscribe(bump),
      serviceUsersStore.subscribe(bump),
    ];
    const unInc = incidentsStore.subscribe(() => bump());
    return () => { unsubs.forEach((u) => u()); unInc(); };
  }, []);
  const [signals, setSignals] = useState<SignalInsight[]>(() => computeInsightSignals(role));
  useEffect(() => { setSignals(computeInsightSignals(role)); }, [tick, role]);
  return signals;
}
