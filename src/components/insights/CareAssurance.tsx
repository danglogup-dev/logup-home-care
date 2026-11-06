import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ClipboardList, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRole } from "@/hooks/useRole";
import { useVisits } from "@/lib/visitsStore";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { useVisitNotes } from "@/lib/visitNotesStore";
import { incidentsStore, type IncidentCard } from "@/lib/incidentsStore";
import { createTask, staffName, useTasksStore } from "@/lib/tasksStore";
import { SCENARIO_EVENTS } from "@/lib/demoScenario";
import { demoExceptionsInScope, medicationDemoVersion, subscribeMedicationDemo } from "@/lib/medicationDemoStore";
import { carePlansStore, useCarePlans } from "@/lib/carePlansStore";
import { isManagerRole, scopedSiteIds } from "@/lib/roleStore";
import { SITE_BY_ID } from "@/lib/demoDataRegistry";
import { buildCareAssurance, CATEGORY_LABELS, GROUP_LABELS, STATUS_LABELS, type Insight, type InsightCategory, type InsightGroup, type InsightStatus } from "@/lib/careAssurance";

const GROUP_ORDER: InsightGroup[] = ["needs_attention", "emerging_patterns", "documentation", "medication", "care_plan", "follow_up"];
const ALL = "all";

/** Live Care Assurance view inside Insights. Every card traces back to source records. */
export function CareAssurance() {
  const role = useRole(); const { visits } = useVisits(); const { users } = useServiceUsers(); const notes = useVisitNotes(); const { tasks } = useTasksStore(); useCarePlans();
  const medVersion = useSyncExternalStore(subscribeMedicationDemo, medicationDemoVersion, medicationDemoVersion);
  const [submitted, setSubmitted] = useState<IncidentCard[]>(() => incidentsStore.getPending());
  useEffect(() => { const off = incidentsStore.subscribe(setSubmitted); return () => { off(); }; }, []);
  const sites = [...new Set(scopedSiteIds(role))];
  const [site, setSite] = useState(ALL); const [client, setClient] = useState(ALL); const [days, setDays] = useState("14"); const [status, setStatus] = useState<InsightStatus | "open" | typeof ALL>("open"); const [category, setCategory] = useState<InsightCategory | typeof ALL>(ALL);
  const insights = useMemo(() => {
    const siteIds = site === ALL ? sites : [site];
    const userSite = new Map(users.map((u) => [u.id as string, u.siteId as string]));
    const events = [
      ...submitted.filter((c) => c.column !== "complete").map((c) => ({ id: c.id, title: c.eventType ?? c.category, clientId: c.serviceUserId, siteId: c.serviceUserId ? userSite.get(c.serviceUserId) : undefined, at: new Date(c.dateTime).toISOString?.() ?? c.dateTime })),
      ...SCENARIO_EVENTS.filter((e) => e.column !== "complete").map((e) => ({ id: e.id, title: e.category, clientId: e.serviceUserId, siteId: e.siteId, at: e.at.toISOString() })),
    ].filter((e) => !Number.isNaN(Date.parse(e.at)));
    return buildCareAssurance({ visits, users, notes, tasks, events, exceptions: demoExceptionsInScope(siteIds), planFor: (id) => carePlansStore.getCurrentVersion(id), siteIds });
  }, [visits, users, notes, tasks, submitted, site, medVersion, role]); // eslint-disable-line react-hooks/exhaustive-deps
  const since = Date.now() - Number(days) * 86_400_000;
  const shown = insights.filter((i) => (client === ALL || i.clientId === client) && (category === ALL || i.category === category) && Date.parse(i.at) >= since
    && (status === ALL || (status === "open" ? i.status !== "closed" : i.status === status)));
  const clients = [...new Map(insights.filter((i) => i.clientId).map((i) => [i.clientId!, users.find((u) => u.id === i.clientId)?.name ?? i.clientId!])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  return <section aria-labelledby="ca-h" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h2 id="ca-h" className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />Care Assurance</h2>
        <p className="text-sm text-muted-foreground">Live from visits, confirmed notes, eMAR, events and tasks. LogUp rules and simulated AI-assisted observations are labelled; a person makes every decision.</p></div>
    </div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      <Filter label="Location" value={site} onChange={setSite} options={[[ALL, "All my areas"], ...sites.map((s) => [s, SITE_BY_ID[s as keyof typeof SITE_BY_ID]?.name ?? s] as [string, string])]} />
      <Filter label="Client" value={client} onChange={setClient} options={[[ALL, "All clients"], ...clients]} />
      <Filter label="Date" value={days} onChange={setDays} options={[["7", "Last 7 days"], ["14", "Last 14 days"], ["30", "Last 30 days"]]} />
      <Filter label="Status" value={status} onChange={(v) => setStatus(v as never)} options={[["open", "Not closed"], [ALL, "All"], ...Object.entries(STATUS_LABELS)]} />
      <Filter label="Category" value={category} onChange={(v) => setCategory(v as never)} options={[[ALL, "All categories"], ...Object.entries(CATEGORY_LABELS)]} />
    </div>
    {!shown.length && <Card><CardContent className="p-4 text-sm text-muted-foreground">Nothing matches these filters.</CardContent></Card>}
    {GROUP_ORDER.map((g) => { const items = shown.filter((i) => i.group === g); if (!items.length) return null; return <div key={g} className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{GROUP_LABELS[g]} ({items.length})</h3>
      <ul className="space-y-2">{items.slice(0, 6).map((i) => <InsightCard key={i.id} insight={i} />)}</ul>
      {items.length > 6 && <p className="text-xs text-muted-foreground">{items.length - 6} more — narrow the filters to see them.</p>}
    </div>; })}
  </section>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return <label className="space-y-1 text-xs font-medium"><span>{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></label>;
}

function InsightCard({ insight: i }: { insight: Insight }) {
  const role = useRole(); const [open, setOpen] = useState(false);
  const canAct = isManagerRole(role.role) || role.role === "admin";
  const makeTask = (planReview: boolean) => {
    const due = new Date(Date.now() + 2 * 86_400_000); due.setHours(12, 0, 0, 0);
    createTask({ title: planReview ? `Care-plan review · ${i.title.replace(/^.*· /, "")}` : `Follow up: ${i.title}`, description: `${i.observed}\n\nPrompted by Care Assurance (${i.kind === "ai_simulated" ? "simulated AI-assisted observation" : "LogUp rule"}). Sources: ${i.sources.map((s) => s.label).join("; ")}. The reviewer decides what, if anything, changes.`,
      taskType: "follow_up", sourceType: "insight", sourceRef: i.id, siteId: i.siteId ?? scopedSiteIds(role)[0], ownership: "person", assigneeId: i.reviewerStaffId, assignedById: role.staffId, dueAt: due.toISOString(), priority: i.priority <= 1 ? "high" : "normal",
      insightLinks: { insightId: i.id, serviceUserId: i.clientId, sourceIds: i.sources.map((s) => s.id) } });
  };
  return <li><Card><CardContent className="p-4 text-sm">
    <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 text-left">
      <span className="space-y-1">
        <span className="flex flex-wrap gap-1.5">{i.kind === "ai_simulated" ? <Badge variant="secondary"><Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />AI-assisted · simulated</Badge> : <Badge variant="outline">LogUp rule</Badge>}<Badge variant="outline">{CATEGORY_LABELS[i.category]}</Badge><Badge variant={i.status === "needs_review" ? "destructive" : "outline"}>{STATUS_LABELS[i.status]}</Badge></span>
        <span className="block text-base font-semibold">{i.title}</span>
      </span>
      <ChevronDown className={`mt-1 h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
    {open && <dl className="mt-3 space-y-2">
      <Row k="What was observed">{i.observed}</Row>
      <Row k="Why LogUp highlighted it">{i.why}</Row>
      <Row k="Source records"><ul className="space-y-1">{i.sources.map((s) => <li key={s.id}><Link to={s.to} className="text-primary underline">{s.label}</Link>{s.excerpt && <span className="block text-muted-foreground">“{s.excerpt}”</span>}</li>)}</ul></Row>
      <Row k="Who reviews it">{staffName(i.reviewerStaffId)}</Row>
      <Row k="Action taken">{i.actionTaken}{i.linkedTaskIds.map((id) => <Link key={id} to={`/app/tasks/${id}`} className="ml-2 inline-flex items-center gap-1 text-primary underline"><ClipboardList className="h-3 w-3" aria-hidden="true" />Open task</Link>)}</Row>
      <Row k="Current status">{STATUS_LABELS[i.status]}</Row>
      {canAct && i.status !== "closed" && i.category !== "medication_exception" && i.category !== "governance" && <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={() => makeTask(false)}>Create follow-up task</Button>
        {(i.category === "repeated_observation" || i.category === "care_plan_difference") && <Button size="sm" variant="outline" onClick={() => makeTask(true)}>Request care-plan review</Button>}
      </div>}
      {i.category === "medication_exception" && <p className="text-xs text-muted-foreground">Acknowledge, follow up and resolve in eMAR from the source link. No AI can change a medication record.</p>}
    </dl>}
  </CardContent></Card></li>;
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="grid gap-1 sm:grid-cols-[11rem_1fr]"><dt className="font-semibold">{k}</dt><dd>{children}</dd></div>;
}
