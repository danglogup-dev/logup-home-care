/**
 * Care Assurance insights, derived live from source records. Two kinds:
 *  - "rule": deterministic LogUp alerts (counts and dates, no interpretation).
 *  - "ai_simulated": AI-assisted pattern spotting, simulated here by keyword
 *    rules over human-confirmed visit notes. It only points at the notes; a
 *    manager interprets them. Nothing here edits a record.
 */
import type { Visit } from "./visitsStore";
import type { ServiceUser } from "./serviceUsersStore";
import type { VisitNote } from "./visitNotesStore";
import type { TaskRecord } from "./tasksStore";
import { isOverdue } from "./tasksStore";
import type { CarePlanVersion } from "./carePlansStore";
import type { OverviewEvent, OverviewException } from "./operationalOverview";
import { taskServiceArea } from "./operationalOverview";
import { STAFF } from "./demoDataRegistry";

export type InsightGroup = "needs_attention" | "emerging_patterns" | "documentation" | "medication" | "care_plan" | "follow_up";
export type InsightCategory = "missing_documentation" | "repeated_observation" | "medication_exception" | "care_plan_difference" | "governance";
export type InsightStatus = "needs_review" | "follow_up_assigned" | "closed";

export const GROUP_LABELS: Record<InsightGroup, string> = {
  needs_attention: "Needs attention", emerging_patterns: "Emerging patterns", documentation: "Documentation quality",
  medication: "Medication exceptions", care_plan: "Care-plan reviews", follow_up: "Follow-up and outcomes",
};
export const CATEGORY_LABELS: Record<InsightCategory, string> = {
  missing_documentation: "Missing documentation", repeated_observation: "Repeated observations", medication_exception: "Medication exceptions",
  care_plan_difference: "Care-plan differences", governance: "Unresolved governance actions",
};
export const STATUS_LABELS: Record<InsightStatus, string> = { needs_review: "Needs review", follow_up_assigned: "Follow-up assigned", closed: "Follow-up closed" };

export interface InsightSource { id: string; label: string; to: string; excerpt?: string; at?: string }
export interface Insight {
  id: string; kind: "rule" | "ai_simulated"; category: InsightCategory; group: InsightGroup; priority: number;
  title: string; observed: string; why: string; sources: InsightSource[];
  reviewerStaffId: string; clientId?: string; siteId?: string; at: string;
  actionTaken: string; status: InsightStatus; linkedTaskIds: string[];
}

/** Repeated-observation themes. Phrases must appear in confirmed note text. */
export const THEMES: { key: string; label: string; re: RegExp; planKey: string; planSaysOtherwise: RegExp }[] = [
  { key: "mobility", label: "unsteadiness or reduced mobility", re: /\b(unsteady|wobbly|held on to furniture|needed more help to (stand|walk)|stopped twice to rest|nearly fell)\b/i, planKey: "mobility", planSaysOtherwise: /\bindependent\w*/i },
  { key: "appetite", label: "reduced appetite", re: /\b(ate (very )?little|left most of|poor appetite|not hungry|did not eat)\b/i, planKey: "nutrition", planSaysOtherwise: /\b(normal diet|good appetite)\b/i },
  { key: "mood", label: "low mood or a change in wellbeing", re: /\b(low in mood|tearful|withdrawn|flat in mood|not (her|him)self)\b/i, planKey: "about", planSaysOtherwise: /$^/ },
  { key: "skin", label: "a skin concern", re: /\b(redness on|red area|sore heel|broken skin|pressure area)\b/i, planKey: "skinIntegrity", planSaysOtherwise: /\bno (concerns|issues)\b/i },
];
const REPEAT_MIN = 3;
const DAY = 86_400_000;

export const reviewerFor = (siteId?: string) => STAFF.find((s) => s.accessRole === "Manager" && s.scopeSiteIds.length === 1 && s.scopeSiteIds[0] === siteId)?.id ?? "STAFF-SIOBHAN";
const firstSentence = (text: string, re: RegExp) => text.split(/(?<=[.!?])\s+/).find((s) => re.test(s)) ?? text.split(/(?<=[.!?])\s+/)[0];
const noteText = (n: VisitNote) => Object.values(n.final_text).join(" ");

export interface CareAssuranceInput {
  visits: readonly Visit[]; users: readonly ServiceUser[]; notes: readonly VisitNote[]; exceptions: readonly OverviewException[];
  events: readonly OverviewEvent[]; tasks: readonly TaskRecord[]; planFor: (clientId: string) => CarePlanVersion | undefined;
  siteIds: readonly string[]; now?: Date;
}

export function buildCareAssurance(input: CareAssuranceInput): Insight[] {
  const now = input.now ?? new Date(); const scope = new Set(input.siteIds);
  const users = new Map(input.users.filter((u) => scope.has(u.siteId)).map((u) => [u.id, u] as const));
  const name = (id: string) => users.get(id as never)?.name ?? id;
  const record = `/app/org/service-users`;
  const out: Insight[] = [];
  const tasksFor = (insightId: string) => input.tasks.filter((t) => t.insightLinks?.insightId === insightId);
  const status = (ids: TaskRecord[]): Pick<Insight, "status" | "actionTaken" | "linkedTaskIds"> => {
    if (!ids.length) return { status: "needs_review", actionTaken: "No action recorded yet.", linkedTaskIds: [] };
    const open = ids.filter((t) => t.status === "open" || t.status === "in_progress");
    return { status: open.length ? "follow_up_assigned" : "closed", actionTaken: ids.map((t) => `${t.title} (${t.status.replace("_", " ")})`).join("; "), linkedTaskIds: ids.map((t) => t.id) };
  };

  // A. Missing documentation — completed visits in the last 7 days without a confirmed note, one card per client.
  const noted = new Set(input.notes.map((n) => n.visit_id));
  const missing = input.visits.filter((v) => users.has(v.clientId) && v.status === "completed" && !noted.has(v.id) && now.getTime() - Date.parse(v.scheduledStart) < 7 * DAY);
  for (const [clientId, vs] of groupBy(missing, (v) => v.clientId)) {
    const id = `INS-DOC-${clientId}`; const u = users.get(clientId as never)!;
    out.push({ id, kind: "rule", category: "missing_documentation", group: "documentation", priority: 3, clientId, siteId: u.siteId, at: vs.at(-1)!.scheduledStart, reviewerStaffId: reviewerFor(u.siteId),
      title: `${vs.length} completed visit${vs.length === 1 ? "" : "s"} without a confirmed note · ${name(clientId)}`,
      observed: `Visits were checked out but no human-confirmed visit note is recorded.`,
      why: "Every completed visit should have a confirmed note. LogUp counts completed visits with no note (rule, not AI).",
      sources: vs.map((v) => ({ id: v.id, label: `Visit ${new Date(v.scheduledStart).toLocaleString("en-IE", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`, to: `${record}/${clientId}?tab=history#visit-${v.id}`, at: v.scheduledStart })),
      ...status(tasksFor(id)) });
  }

  // B. Repeated observations (simulated AI) and D. care-plan differences.
  const recentNotes = input.notes.filter((n) => users.has(n.client_id as never) && now.getTime() - Date.parse(n.confirmed_at) < 14 * DAY);
  for (const [clientId, ns] of groupBy(recentNotes, (n) => n.client_id)) {
    const u = users.get(clientId as never)!;
    for (const theme of THEMES) {
      const hits = ns.filter((n) => theme.re.test(noteText(n))).sort((a, b) => a.confirmed_at.localeCompare(b.confirmed_at));
      if (hits.length < REPEAT_MIN) continue;
      const sources = hits.map((n) => ({ id: n.id, label: `Visit note ${new Date(n.confirmed_at).toLocaleString("en-IE", { weekday: "short", day: "numeric", month: "short" })}`, to: `${record}/${clientId}?tab=history#visit-${n.visit_id}`, excerpt: firstSentence(noteText(n), theme.re), at: n.confirmed_at }));
      const id = `INS-REPEAT-${clientId}-${theme.key}`;
      out.push({ id, kind: "ai_simulated", category: "repeated_observation", group: "emerging_patterns", priority: 1, clientId, siteId: u.siteId, at: hits.at(-1)!.confirmed_at, reviewerStaffId: reviewerFor(u.siteId),
        title: `Possible pattern: ${theme.label} · ${name(clientId)}`,
        observed: `${hits.length} confirmed visit notes in the last 14 days mention ${theme.label}.`,
        why: `Simulated AI-assisted observation: the same kind of observation appeared in ${hits.length} separate notes (threshold ${REPEAT_MIN}). This is a prompt to read the notes, not a conclusion.`,
        sources, ...status(tasksFor(id)) });
      const plan = input.planFor(clientId);
      const section = plan?.status === "published" ? plan.sections.find((s) => s.key === theme.planKey) : undefined;
      if (section && theme.planSaysOtherwise.test(section.body)) {
        const pid = `INS-PLAN-${clientId}-${theme.key}`;
        out.push({ id: pid, kind: "rule", category: "care_plan_difference", group: "care_plan", priority: 2, clientId, siteId: u.siteId, at: hits.at(-1)!.confirmed_at, reviewerStaffId: reviewerFor(u.siteId),
          title: `Notes may differ from the care plan · ${name(clientId)}`,
          observed: `Plan (v${plan!.versionNumber}) says: “${firstSentence(section.body, theme.planSaysOtherwise)}” Recent notes describe ${theme.label}.`,
          why: "LogUp suggestion: approved plan wording and recent confirmed notes point in different directions. This does not mean the plan is wrong — a person should review it.",
          sources: [{ id: plan!.id, label: `Care plan v${plan!.versionNumber} · ${section.label ?? section.key}`, to: `/app/care-plans/people/${clientId}`, excerpt: firstSentence(section.body, theme.planSaysOtherwise) }, ...sources],
          ...status(tasksFor(pid)) });
      }
    }
  }

  // C. Medication exceptions (structured eMAR records only).
  for (const { exception: e, outcome, task } of input.exceptions) {
    if (!users.has(e.client_id as never)) continue;
    const linked = input.tasks.filter((t) => t.medicationLinks?.exceptionId === e.id);
    const resolved = e.status === "resolved";
    if (resolved && now.getTime() - Date.parse(e.resolved_at ?? e.created_at) > 2 * DAY) continue;
    const id = `INS-MED-${e.id}`;
    out.push({ id, kind: "rule", category: "medication_exception", group: e.status === "open" ? "needs_attention" : "medication", priority: e.status === "open" ? 0 : 2, clientId: e.client_id, siteId: e.site_id, at: e.created_at, reviewerStaffId: reviewerFor(e.site_id),
      title: `${e.kind === "refusal" ? "Medication refused" : e.kind.replace(/_/g, " ")} · ${task?.medication.name ?? "medicine"} · ${name(e.client_id)}`,
      observed: outcome ? `Recorded by hand: ${outcome.outcome.replace(/_/g, " ")}${outcome.reason ? ` — “${outcome.reason}”` : ""}.` : "Exception recorded.",
      why: e.status === "open" ? "Rule: a medication exception has not yet been acknowledged by a manager." : resolved ? "Rule: recently resolved — shown so the outcome can be checked." : "Rule: acknowledged but not yet resolved.",
      sources: [{ id: e.id, label: "Exception and original dose record (eMAR)", to: `/app/visits/medication/${e.client_id}?exception=${e.id}`, at: e.created_at }],
      status: resolved ? "closed" : linked.some((t) => t.status === "open" || t.status === "in_progress") ? "follow_up_assigned" : "needs_review",
      actionTaken: [e.acknowledged_at && "Acknowledged", e.follow_up && `Follow-up: ${e.follow_up}`, ...linked.map((t) => `Task: ${t.title} (${t.status.replace("_", " ")})`), e.resolution && `Resolved: ${e.resolution}`].filter(Boolean).join(" · ") || "No action recorded yet.",
      linkedTaskIds: linked.map((t) => t.id) });
  }

  // E. Unresolved governance actions.
  const overdue = input.tasks.filter((t) => isOverdue(t) && scope.has(taskServiceArea(t)));
  if (overdue.length) out.push({ id: "INS-GOV-OVERDUE", kind: "rule", category: "governance", group: "needs_attention", priority: 1, at: overdue[0].dueAt, reviewerStaffId: reviewerFor(input.siteIds.length === 1 ? input.siteIds[0] : undefined),
    title: `${overdue.length} overdue follow-up task${overdue.length === 1 ? "" : "s"}`, observed: "Tasks past their due date and not completed.", why: "Rule: due date has passed.",
    sources: overdue.slice(0, 8).map((t) => ({ id: t.id, label: t.title, to: `/app/tasks/${t.id}`, at: t.dueAt })), status: "needs_review", actionTaken: "—", linkedTaskIds: [] });
  const ackNoTask = input.exceptions.filter(({ exception: e }) => users.has(e.client_id as never) && e.status === "acknowledged" && !e.follow_up && !input.tasks.some((t) => t.medicationLinks?.exceptionId === e.id));
  if (ackNoTask.length) out.push({ id: "INS-GOV-NOFOLLOWUP", kind: "rule", category: "governance", group: "follow_up", priority: 2, at: ackNoTask[0].exception.acknowledged_at ?? ackNoTask[0].exception.created_at, reviewerStaffId: reviewerFor(undefined),
    title: `${ackNoTask.length} acknowledged medication exception${ackNoTask.length === 1 ? "" : "s"} with no follow-up recorded`, observed: "Acknowledged, but no follow-up note or task.", why: "Rule: acknowledgement alone is not a documented outcome.",
    sources: ackNoTask.map(({ exception: e }) => ({ id: e.id, label: `${name(e.client_id)} exception`, to: `/app/visits/medication/${e.client_id}?exception=${e.id}` })), status: "needs_review", actionTaken: "—", linkedTaskIds: [] });
  const oldEvents = input.events.filter((e) => e.siteId && scope.has(e.siteId) && now.getTime() - Date.parse(e.at) > 7 * DAY);
  if (oldEvents.length) out.push({ id: "INS-GOV-EVENTS", kind: "rule", category: "governance", group: "follow_up", priority: 3, at: oldEvents[0].at, reviewerStaffId: reviewerFor(undefined),
    title: `${oldEvents.length} event${oldEvents.length === 1 ? "" : "s"} open for more than 7 days`, observed: "Events and concerns not yet closed.", why: "Rule: open longer than 7 days.",
    sources: oldEvents.slice(0, 8).map((e) => ({ id: e.id, label: `${e.title} · ${e.id}`, to: `/app/incidents/board?eventId=${e.id}`, at: e.at })), status: "needs_review", actionTaken: "—", linkedTaskIds: [] });

  return out.sort((a, b) => (a.status === "closed" ? 1 : 0) - (b.status === "closed" ? 1 : 0) || a.priority - b.priority || b.at.localeCompare(a.at));
}

function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>(); for (const i of items) m.set(key(i), [...(m.get(key(i)) ?? []), i]); return m;
}
