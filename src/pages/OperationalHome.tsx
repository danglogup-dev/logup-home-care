import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, FileWarning, Pill, Sparkles, TimerOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";
import { useVisits, VISIT_STATUS_LABELS } from "@/lib/visitsStore";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { useVisitNotes } from "@/lib/visitNotesStore";
import { incidentsStore, type IncidentCard } from "@/lib/incidentsStore";
import { useTasksStore, staffName } from "@/lib/tasksStore";
import { SCENARIO_EVENTS } from "@/lib/demoScenario";
import { demoExceptionsInScope, medicationDemoVersion, subscribeMedicationDemo } from "@/lib/medicationDemoStore";
import { scopedSiteIds } from "@/lib/roleStore";
import { buildOperationalOverview } from "@/lib/operationalOverview";
import { OUTCOME_LABELS } from "@/lib/medicationRules";
import { fmt } from "@/lib/emarPresentation";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" });

/** Manager Home: live operational overview. Trends and AI summaries stay in Insights. */
export default function OperationalHome() {
  const role = useRole(); const { visits, templates } = useVisits(); const { users } = useServiceUsers(); const notes = useVisitNotes(); const { tasks } = useTasksStore();
  const medVersion = useSyncExternalStore(subscribeMedicationDemo, medicationDemoVersion, medicationDemoVersion);
  const [submitted, setSubmitted] = useState<IncidentCard[]>(() => incidentsStore.getPending());
  useEffect(() => { const off = incidentsStore.subscribe(setSubmitted); return () => { off(); }; }, []);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  const o = useMemo(() => buildOperationalOverview({
    visits, templates, users, role, notes, tasks, submittedEvents: submitted, now,
    exceptions: demoExceptionsInScope(scopedSiteIds(role)),
    scenarioEvents: SCENARIO_EVENTS.filter((e) => e.column !== "complete").map((e) => ({ id: e.id, title: e.category, clientId: e.serviceUserId, siteId: e.siteId, at: e.at.toISOString() })),
  }), [visits, templates, users, role, notes, tasks, submitted, now, medVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = (id?: string) => users.find((u) => u.id === id)?.name ?? "No client linked";

  const tiles = [
    { id: "today", label: "Today's visits", value: o.today.length, icon: CalendarClock, to: "/app/visits/live" },
    { id: "completed", label: "Completed", value: o.completed.length, icon: CheckCircle2, to: "/app/visits/live" },
    { id: "late", label: "Late or not completed", value: o.lateOrUncompleted.length, icon: TimerOff, to: "#late", urgent: true },
    { id: "notes", label: "Visit notes outstanding", value: o.missingNotes.length, icon: FileWarning, to: "#notes", urgent: true },
    { id: "meds", label: "Open medication exceptions", value: o.openExceptions.length, icon: Pill, to: "#meds", urgent: true },
    { id: "events", label: "Open events & concerns", value: o.openEvents.length, icon: AlertTriangle, to: "#events", urgent: true },
    { id: "tasks", label: "Overdue follow-ups", value: o.overdueTasks.length, icon: ClipboardList, to: "#tasks", urgent: true },
  ];

  return <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-8">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-3xl font-heading font-bold">What needs my attention today?</h1><p className="mt-1 text-muted-foreground">{role.scope.join(" + ") || "Your service areas"} · live from today's records</p></div>
      <Button asChild variant="outline"><Link to="/app/insights/overview"><Sparkles aria-hidden="true" />Trends & insights</Link></Button>
    </header>

    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">{tiles.map((t) => { const Icon = t.icon; const hot = t.urgent && t.value > 0; const cls = `flex h-full flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${hot ? "border-destructive/50" : ""}`;
      const body = <><Icon className={`h-5 w-5 ${hot ? "text-destructive" : "text-primary"}`} aria-hidden="true" /><span className="text-3xl font-bold tabular-nums">{t.value}</span><span className="text-sm leading-tight">{t.label}</span></>;
      return <li key={t.id}>{t.to.startsWith("#") ? <a href={t.to} className={cls}>{body}</a> : <Link to={t.to} className={cls}>{body}</Link>}</li>; })}</ul>

    <Section id="late" title="Late or not completed visits" empty="Every visit so far today is on time." items={o.lateOrUncompleted.map((v) => ({ key: v.id, to: "/app/visits/live", main: `${name(v.clientId)} · ${time(v.scheduledStart)}–${time(v.scheduledEnd)}`, sub: v.staffIds.map(staffName).join(", ") || "No carer assigned", badge: VISIT_STATUS_LABELS[v.status], urgent: true }))} />
    <Section id="notes" title="Completed visits without a confirmed note" empty="All completed visits have a confirmed note." items={o.missingNotes.map((v) => ({ key: v.id, to: `/app/org/service-users/${v.clientId}?tab=history`, main: `${name(v.clientId)} · ${time(v.scheduledStart)}`, sub: v.staffIds.map(staffName).join(", ") }))} />
    <Section id="meds" title="Open medication exceptions" empty="No open medication exceptions." items={[...o.openExceptions].sort((a, b) => b.exception.created_at.localeCompare(a.exception.created_at)).map(({ exception: e, outcome, task }) => {
      const fu = tasks.filter((t) => t.medicationLinks?.exceptionId === e.id); const openFu = fu.filter((t) => t.status === "open" || t.status === "in_progress").length;
      return { key: e.id, to: `/app/visits/medication/${e.client_id}?exception=${e.id}`, main: `${name(e.client_id)} · ${task?.medication.name ?? "Medication"} ${outcome ? OUTCOME_LABELS[outcome.outcome].toLowerCase() : ""}`, sub: `${fmt(outcome?.event_at ?? e.created_at)} · ${e.status === "open" ? "not acknowledged" : "acknowledged"} · ${fu.length ? `${openFu} open follow-up${openFu === 1 ? "" : "s"} of ${fu.length}` : "no follow-up task"}`, badge: e.status === "open" ? "Open" : "Acknowledged", urgent: e.status === "open" };
    })} />
    <Section id="events" title="Open events & concerns" empty="No open events." items={o.openEvents.slice(0, 12).map((e) => ({ key: e.id, to: `/app/incidents/board?eventId=${e.id}`, main: `${e.title} · ${name(e.clientId)}`, sub: `${e.id} · ${e.at.includes("T") ? fmt(e.at) : e.at}` }))} more={o.openEvents.length > 12 ? { to: "/app/incidents/board", label: `All ${o.openEvents.length} open events` } : undefined} />
    <Section id="tasks" title="Overdue follow-up tasks" empty="No overdue follow-ups." items={o.overdueTasks.map((t) => ({ key: t.id, to: `/app/tasks/${t.id}`, main: t.title, sub: `${staffName(t.assigneeId) || "Unassigned"} · due ${fmt(t.dueAt)}`, badge: "Overdue", urgent: true }))} more={{ to: "/app/tasks/register", label: `All follow-ups (${o.openFollowUps.length} open)` }} />
    <p className="text-xs text-muted-foreground">Fictional demo records. Counts update as visits, notes, medication records, events and tasks change; nothing here is a fixed example.</p>
  </div>;
}

function Section({ id, title, items, empty, more }: { id: string; title: string; empty: string; items: { key: string; to: string; main: string; sub?: string; badge?: string; urgent?: boolean }[]; more?: { to: string; label: string } }) {
  return <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-4">
    <h2 id={`${id}-h`} className="mb-2 text-xl font-semibold">{title} <span className="text-muted-foreground">({items.length})</span></h2>
    <Card><CardContent className="divide-y p-0">
      {!items.length && <p className="p-4 text-sm text-muted-foreground">{empty}</p>}
      {items.map((i) => <Link key={i.key} to={i.to} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span><span className="font-medium">{i.main}</span>{i.sub && <span className="block text-muted-foreground">{i.sub}</span>}</span>
        {i.badge && <Badge variant={i.urgent ? "destructive" : "outline"}>{i.badge}</Badge>}
      </Link>)}
      {more && <Link to={more.to} className="block p-3 text-sm font-medium text-primary hover:bg-accent">{more.label}</Link>}
    </CardContent></Card>
  </section>;
}
