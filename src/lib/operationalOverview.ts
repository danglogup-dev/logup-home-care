/**
 * "What needs my attention today?" — every figure is derived live from the shared
 * demo stores (visits, visit notes, eMAR exceptions, Events, Tasks). Nothing is
 * seeded or cached here, and nothing is written.
 */
import type { Visit, VisitTemplate } from "./visitsStore";
import type { ServiceUser } from "./serviceUsersStore";
import type { VisitNote } from "./visitNotesStore";
import type { MedicationException, MedicationOutcomeRecord, MedicationTask } from "./medicationStore";
import type { IncidentCard } from "./incidentsStore";
import type { TaskRecord } from "./tasksStore";
import { isOverdue } from "./tasksStore";
import { liveVisits } from "./liveVisitRules";
import { scopedSiteIds, type RoleState } from "./roleStore";
import { SITES } from "./demoDataRegistry";

export interface OverviewEvent { id: string; title: string; clientId?: string; siteId?: string; at: string }
export interface OverviewException { exception: MedicationException; outcome?: MedicationOutcomeRecord; task?: MedicationTask }

export interface OperationalOverview {
  today: Visit[];
  completed: Visit[];
  lateOrUncompleted: Visit[];
  missingNotes: Visit[];
  openExceptions: OverviewException[];
  openEvents: OverviewEvent[];
  overdueTasks: TaskRecord[];
  openFollowUps: TaskRecord[];
}

/** Legacy residential task sites map to the two home support service areas. */
const LEGACY_TASK_SITES: Record<string, string> = { "site-oak": "SITE-ECK", "site-rose": "SITE-WWD", "site-elm": "SITE-WWD" };
export const taskServiceArea = (t: Pick<TaskRecord, "siteId">) => LEGACY_TASK_SITES[t.siteId] ?? t.siteId;

export function buildOperationalOverview(input: {
  visits: readonly Visit[]; templates: readonly VisitTemplate[]; users: readonly ServiceUser[]; role: RoleState;
  notes: readonly VisitNote[]; exceptions: readonly OverviewException[]; scenarioEvents: readonly OverviewEvent[]; submittedEvents: readonly IncidentCard[];
  tasks: readonly TaskRecord[]; now?: Date;
}): OperationalOverview {
  const now = input.now ?? new Date();
  const scope = new Set<string>(scopedSiteIds(input.role));
  const today = liveVisits(input.visits.filter((v) => v.rosterStatus !== "draft"), input.users, input.templates, input.role, now).filter((v) => v.status !== "cancelled");
  const completed = today.filter((v) => v.status === "completed");
  const lateOrUncompleted = today.filter((v) => v.status === "late" || v.status === "missed" || (v.status !== "completed" && Date.parse(v.scheduledEnd) < now.getTime()));
  const noted = new Set(input.notes.map((n) => n.visit_id));
  const missingNotes = completed.filter((v) => !noted.has(v.id));
  const openExceptions = input.exceptions.filter((e) => e.exception.status !== "resolved" && scope.has(e.exception.site_id));
  const userSite = new Map(input.users.map((u) => [u.id, u.siteId as string]));
  const siteByName = new Map(SITES.map((s) => [s.name, s.id as string]));
  const submitted: OverviewEvent[] = input.submittedEvents.filter((c) => c.column !== "complete").map((c) => ({
    id: c.id, title: c.eventType ?? c.category ?? "Event", clientId: c.serviceUserId, at: c.dateTime,
    siteId: (c.serviceUserId && userSite.get(c.serviceUserId)) || siteByName.get(c.site),
  }));
  const seen = new Set(submitted.map((e) => e.id));
  const openEvents = [...submitted, ...input.scenarioEvents.filter((e) => !seen.has(e.id))].filter((e) => e.siteId && scope.has(e.siteId));
  const followUps = input.tasks.filter((t) => t.taskType === "follow_up" && scope.has(taskServiceArea(t)));
  const overdueTasks = followUps.filter((t) => isOverdue(t));
  const openFollowUps = followUps.filter((t) => t.status === "open" || t.status === "in_progress");
  return { today, completed, lateOrUncompleted, missingNotes, openExceptions, openEvents, overdueTasks, openFollowUps };
}
