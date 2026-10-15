/**
 * Home Care Clients list and client record. Pure views over serviceUsersStore,
 * carePlansStore, visitsStore, visitNotesStore and incidentsStore — no copies.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, MapPin, Plus, Search, User, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CarerPreferenceCard } from "@/components/clients/CarerPreferenceCard";
import { SUPPORT_CATEGORY_LABELS } from "@/lib/visitRequirements";
import { workforceStore as wfStoreForReq } from "@/lib/workforceStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRole } from "@/hooks/useRole";
import { useTerms } from "@/hooks/useTerms";
import { isManagerRole, scopedSiteIds } from "@/lib/roleStore";
import { serviceUsersStore, useServiceUsers, type ServiceUser } from "@/lib/serviceUsersStore";
import { carePlansStore, useCarePlans, formatDate, statusLabel } from "@/lib/carePlansStore";
import { useSites, siteLabel } from "@/lib/sitesStore";
import { useVisits, visitsStore, VISIT_STATUS_LABELS, MEDICATION_SUPPORT_LABELS, type Visit } from "@/lib/visitsStore";
import { useVisitNotes, visitNotesStore } from "@/lib/visitNotesStore";
import { incidentsStore, type IncidentCard } from "@/lib/incidentsStore";
import { canViewFullRecord } from "@/lib/eventVisibility";
import { NOTE_SECTIONS } from "@/lib/visitNoteRules";
import { buildTimeline } from "@/lib/serviceUserTimeline";
import { clientDisplayName, clientTown } from "@/lib/visitPresentation";
import { getStaffName, type StaffId } from "@/lib/demoDataRegistry";
import { NoAccessPanel } from "@/components/RoleContextBanner";
import {
  completedVisits, daysLabel, glanceFromPlan, minutesBetween, plannedWeeklyHours, upcomingVisits,
} from "@/lib/clientRecord";
import { carePlanStatusText } from "./ServiceUsers";

const FUNDING = { hse: "HSE", private: "Private", mixed: "Mixed (HSE and private)" } as const;
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" });
const dayTime = (iso: string) => new Date(iso).toLocaleString("en-IE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const staffNames = (ids: string[]) => ids.length ? ids.map((id) => getStaffName(id as StaffId)).join(", ") : "Not assigned";

function publishedVersion(clientId: string) {
  return carePlansStore.getPlan(clientId)?.versions.find((v) => v.status === "published");
}

function useClientEvents(clientId: string | undefined) {
  const [cards, setCards] = useState<IncidentCard[]>(() => incidentsStore.getPending());
  useEffect(() => { const off = incidentsStore.subscribe(setCards); return () => { off(); }; }, []);
  return cards.filter((c) => clientId && c.serviceUserId === clientId);
}

// ---------------------------------------------------------------- List

export function HomeCareClientList() {
  const terms = useTerms();
  const role = useRole();
  const navigate = useNavigate();
  const { users } = useServiceUsers();
  const { visits, templates } = useVisits();
  useCarePlans();
  const sites = useSites();
  const scope = useMemo(() => new Set<string>(scopedSiteIds(role)), [role]);
  const canManage = role.role === "admin" || isManagerRole(role.role);
  const [q, setQ] = useState("");
  const [site, setSite] = useState("any");
  const [showClosed, setShowClosed] = useState(false);

  const rows = users
    .filter((u) => scope.has(u.siteId))
    .filter((u) => showClosed || u.status === "active" || u.status === "temporary_absence")
    .filter((u) => site === "any" || u.siteId === site)
    .filter((u) => !q || `${u.name} ${u.preferredName ?? ""} ${clientTown(u) ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b)));

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{terms.Plural}</h1>
          <p className="text-sm text-muted-foreground mt-1">Everyone receiving home support in your service areas.</p>
        </div>
        {canManage && <Button onClick={() => navigate("/app/org/service-users/admit")}><Plus className="mr-1 h-4 w-4" /> Add a {terms.singular}</Button>}
      </div>

      <Card><CardContent className="p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or town…" className="pl-9 h-9" />
        </div>
        <Select value={site} onValueChange={setSite}>
          <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All service areas</SelectItem>
            {sites.filter((s) => scope.has(s.id)).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant={showClosed ? "default" : "outline"} onClick={() => setShowClosed(!showClosed)}>Include closed</Button>
      </CardContent></Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((u) => {
          const next = upcomingVisits(visits, u.id)[0];
          const planned = plannedWeeklyHours(templates.filter((t) => t.clientId === u.id && !t.supersededAt));
          return (
            <Link key={u.id} to={`/app/org/service-users/${u.id}`} className="block rounded-lg border bg-card p-4 hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{clientDisplayName(u)}</div>
                  {u.preferredName && <div className="text-xs text-muted-foreground">{u.name}</div>}
                </div>
                <Badge variant={u.risk === "High" ? "destructive" : "outline"}>{u.risk.toLowerCase()} risk</Badge>
              </div>
              <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{clientTown(u) ?? "Town not recorded"} · {siteLabel(u.siteId)}</div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Care plan</dt><dd>{carePlanStatusText(u.id)}</dd>
                <dt className="text-muted-foreground">Next visit</dt><dd>{next ? dayTime(next.scheduledStart) : "None planned"}</dd>
                <dt className="text-muted-foreground">Weekly hours</dt><dd>{planned.toFixed(1)} planned{u.hseApprovedHoursPerWeek != null ? ` / ${u.hseApprovedHoursPerWeek} approved` : ""}</dd>
              </dl>
              {u.primaryFocus && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{u.primaryFocus}</p>}
            </Link>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No {terms.plural} match.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Record

const TABS = [
  ["glance", "At a Glance"], ["plan", "Care Plan"], ["schedule", "Visit Schedule"],
  ["history", "Visit History"], ["events", "Events & Concerns"], ["timeline", "History"],
] as const;

export function HomeCareClientRecord() {
  const terms = useTerms();
  const { id } = useParams();
  const role = useRole();
  const [params, setParams] = useSearchParams();
  useServiceUsers();
  useCarePlans();
  const { visits, templates } = useVisits();
  const u = serviceUsersStore.getById(id);
  const events = useClientEvents(u?.id);

  if (!u || !scopedSiteIds(role).includes(u.siteId)) {
    return <div className="p-6"><NoAccessPanel moduleLabel={`this ${terms.singular}`} /></div>;
  }
  const tab = params.get("tab") ?? "glance";
  const clientTemplates = templates.filter((t) => t.clientId === u.id && !t.supersededAt);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <Link to="/app/org/service-users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {terms.Plural}</Link>
      <Card><CardContent className="p-4 flex flex-wrap items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0"><User className="h-5 w-5" /></div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-lg font-semibold leading-tight">{u.preferredName ? `${u.preferredName} (${u.name})` : u.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{clientTown(u) ?? "—"} · {siteLabel(u.siteId)}</span>
            <Badge variant={u.risk === "High" ? "destructive" : "outline"}>{u.risk.toLowerCase()} risk</Badge>
            <span>Key worker: {getStaffName(u.keyWorkerStaffId)}</span>
          </div>
        </div>
      </CardContent></Card>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <div className="overflow-x-auto"><TabsList>{TABS.map(([k, l]) => <TabsTrigger key={k} value={k}>{l}</TabsTrigger>)}</TabsList></div>
        <TabsContent value="glance"><Glance u={u} planned={plannedWeeklyHours(clientTemplates)} openEvents={events.filter((e) => e.column !== "complete").length} /></TabsContent>
        <TabsContent value="plan"><CarePlanTab u={u} /></TabsContent>
        <TabsContent value="schedule"><ScheduleTab templates={clientTemplates} upcoming={upcomingVisits(visits, u.id).slice(0, 10)} /></TabsContent>
        <TabsContent value="history"><HistoryTab u={u} visits={completedVisits(visits, u.id)} events={events} /></TabsContent>
        <TabsContent value="events"><EventsTab events={events} /></TabsContent>
        <TabsContent value="timeline"><TimelineTab clientId={u.id} /></TabsContent>
      </Tabs>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-sm whitespace-pre-line">{children || "—"}</div></div>
);

function Glance({ u, planned, openEvents }: { u: ServiceUser; planned: number; openEvents: number }) {
  const version = publishedVersion(u.id);
  const topics = glanceFromPlan(version);
  const flags = carePlansStore.getSuggestionsFor(u.id, "open");
  return (
    <div className="grid gap-4 md:grid-cols-3 mt-4">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-base">Key support needs</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {topics.map((t) => <Field key={t.label} label={t.label}>{t.text}</Field>)}
          {topics.length === 0 && <p className="text-sm text-muted-foreground">No published care plan yet. {u.primaryFocus}</p>}
          {version && <p className="sm:col-span-2 text-xs text-muted-foreground">From published care plan v{version.versionNumber}{version.publishedAt ? `, ${formatDate(version.publishedAt)}` : ""}.</p>}
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Home and access</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Address">{[u.homeAddress, u.eircode].filter(Boolean).join(", ")}</Field>
            <Field label="Access notes">{u.accessNotes}</Field>
            <Field label="Lives alone">{u.livesAlone === undefined ? undefined : u.livesAlone ? "Yes" : "No"}</Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Weekly support</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="HSE approved hours">{u.hseApprovedHoursPerWeek != null ? `${u.hseApprovedHoursPerWeek} per week` : "Not recorded"}</Field>
            <Field label="Planned hours">{`${planned.toFixed(1)} per week`}</Field>
            <Field label="Funding">{u.funding && FUNDING[u.funding]}</Field>
          </CardContent>
        </Card>
        <CarerPreferenceCard u={u} />
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Family and emergency contacts</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {u.representatives.map((r) => <div key={r.id}>{r.name}{r.relationship && ` (${r.relationship})`} · {r.phone || "No number"}{r.isPrimary ? " · primary" : ""}</div>)}
            {u.representatives.length === 0 && <div className="text-muted-foreground">None recorded.</div>}
            {u.gp && <div className="text-muted-foreground">GP: {[u.gp.name, u.gp.phone].filter(Boolean).join(" · ")}</div>}
          </CardContent>
        </Card>
        {(flags.length > 0 || openEvents > 0) && (
          <Card className="border-warning/40">
            <CardHeader className="pb-2"><CardTitle className="text-base">Recent changes</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {openEvents > 0 && <div>{openEvents} open event{openEvents === 1 ? "" : "s"}</div>}
              {flags.slice(0, 3).map((f) => <div key={f.id}>Review flag: {f.title} <span className="text-xs text-muted-foreground">· LogUp suggestion</span></div>)}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function CarePlanTab({ u }: { u: ServiceUser }) {
  const plan = carePlansStore.getPlan(u.id);
  const current = carePlansStore.getCurrentVersion(u.id);
  const href = `/app/care-plans/plans/${u.id}`;
  return (
    <Card className="mt-4">
      <CardContent className="p-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Current care plan">{carePlanStatusText(u.id)}</Field>
          <Field label="Next review">{plan ? formatDate(plan.nextReviewDue) : undefined}</Field>
          <Field label="Versions">{plan ? plan.versions.map((v) => `v${v.versionNumber} ${statusLabel(v.status)}`).join(" · ") : undefined}</Field>
        </div>
        <p className="text-sm text-muted-foreground">Edits, approvals and version history use the existing care plan workflow.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link to={href}>{current ? "Open care plan" : "Create care plan"}</Link></Button>
          {current && <Button variant="outline" asChild><Link to={`${href}?tab=drafts`}>Drafts and approvals</Link></Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function ScheduleTab({ templates, upcoming }: { templates: ReturnType<typeof visitsStore.templatesForClient>; upcoming: Visit[] }) {
  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Planned recurring visits</CardTitle></CardHeader>
        <CardContent className="p-0 divide-y">
          {templates.sort((a, b) => a.windowStart.localeCompare(b.windowStart)).map((t) => (
            <div key={t.id} className="p-4 grid gap-1 sm:grid-cols-[180px_1fr]">
              <div>
                <div className="font-medium capitalize">{t.callType} call</div>
                <div className="text-sm text-muted-foreground">{daysLabel(t.daysOfWeek)}</div>
                <div className="text-sm text-muted-foreground">{t.windowStart}–{t.windowEnd} · {t.durationMinutes} min{t.carersRequired > 1 ? ` · ${t.carersRequired} carers` : ""}</div>
              </div>
              <div className="text-sm">
                <div>{t.tasks.join(" · ") || "No tasks listed"}</div>
                {(t.supportCategories?.length || t.requiredQualificationIds?.length) ? <div className="text-muted-foreground mt-1">{[t.supportCategories?.map((c) => SUPPORT_CATEGORY_LABELS[c]).join(", "), t.requiredQualificationIds?.length ? `Requires: ${t.requiredQualificationIds.map((q) => wfStoreForReq.getQualType(q)?.name ?? q).join(", ")}` : ""].filter(Boolean).join(" · ")}</div> : null}
                {t.medications.length > 0 && <div className="text-muted-foreground mt-1">Medication: {t.medications.map((m) => `${m.name} (${MEDICATION_SUPPORT_LABELS[m.supportLevel]})`).join(", ")}</div>}
              </div>
            </div>
          ))}
          {templates.length === 0 && <p className="p-4 text-sm text-muted-foreground">No visits planned. Visits come from the published care plan's visit schedule.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Next scheduled visits</CardTitle></CardHeader>
        <CardContent className="p-0 divide-y">
          {upcoming.map((v) => (
            <div key={v.id} className="p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">{dayTime(v.scheduledStart)}–{time(v.scheduledEnd)}</span>
              <span className="text-muted-foreground">{staffNames(v.staffIds)}</span>
              <Badge variant="outline">{VISIT_STATUS_LABELS[v.status]}</Badge>
            </div>
          ))}
          {upcoming.length === 0 && <p className="p-4 text-sm text-muted-foreground">No upcoming visits.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryTab({ u, visits, events }: { u: ServiceUser; visits: Visit[]; events: IncidentCard[] }) {
  const role = useRole();
  const notes = useVisitNotes();
  const [noteError, setNoteError] = useState("");
  const ids = visits.map((v) => v.id).join();
  useEffect(() => {
    if (!visits.length) return;
    visitNotesStore.loadForClient(u.id, visits.map((v) => v.id), role).then(() => setNoteError(""), () => setNoteError("Visit notes need you to be signed in to LogUp care AI."));
  }, [u.id, ids, role.staffId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card className="mt-4">
      <CardContent className="p-0 divide-y">
        {noteError && <p className="p-3 text-xs text-muted-foreground">{noteError}</p>}
        {visits.map((v) => {
          const actual = minutesBetween(v.checkInAt, v.checkOutAt);
          const scheduled = minutesBetween(v.scheduledStart, v.scheduledEnd);
          const note = notes.find((n) => n.visit_id === v.id);
          const linked = events.filter((e) => e.visitId === v.id || v.sosEventIds?.includes(e.id));
          const refused = (v.log?.tasks ?? []).filter((t) => t.outcome === "refused").length + (v.log?.medications ?? []).filter((m) => m.outcome === "refused").length;
          return (
            <div key={v.id} className="p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{dayTime(v.scheduledStart)}</span>
                <Badge variant={v.status === "missed" ? "destructive" : "secondary"}>{VISIT_STATUS_LABELS[v.status]}</Badge>
                <span className="text-muted-foreground">{staffNames(v.staffIds)}</span>
                <span className="text-muted-foreground">· scheduled {scheduled} min{actual != null ? ` · actual ${actual} min (${time(v.checkInAt!)}–${time(v.checkOutAt!)})` : ""}</span>
                {refused > 0 && <Badge variant="outline">{refused} refused</Badge>}
              </div>
              {note ? (
                <div className="rounded-md bg-secondary/50 p-3 text-sm space-y-1">
                  {NOTE_SECTIONS.map(({ key, label }) => note.final_text[key] ? <div key={key}><span className="font-medium">{label}:</span> {note.final_text[key]}</div> : null)}
                  <div className="text-xs text-muted-foreground">Confirmed by {getStaffName(note.confirmed_by_staff_id as StaffId)} · {dayTime(note.confirmed_at)}</div>
                </div>
              ) : v.status === "completed" && <div className="text-xs text-muted-foreground">No confirmed visit note.</div>}
              {linked.map((e) => <Link key={e.id} to={`/app/incidents/board?eventId=${e.id}`} className="inline-flex items-center gap-1 text-sm text-destructive underline"><AlertTriangle className="h-3.5 w-3.5" />{e.eventType ?? e.category} · {e.id}</Link>)}
            </div>
          );
        })}
        {visits.length === 0 && <p className="p-4 text-sm text-muted-foreground">No completed visits yet.</p>}
      </CardContent>
    </Card>
  );
}

function EventsTab({ events }: { events: IncidentCard[] }) {
  const role = useRole();
  return (
    <Card className="mt-4">
      <CardContent className="p-0 divide-y">
        {events.map((e) => {
          const full = canViewFullRecord({ role: role.role, scope: role.scope, viewerStaffId: role.staffId, recordSite: e.site, submitterStaffId: e.createdByStaffId, visibility: e.visibility });
          return (
            <div key={e.id} className="p-4 flex flex-wrap items-center gap-3 text-sm">
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium">{e.eventType ?? e.category} · {e.id}</div>
                <div className="text-muted-foreground">{e.dateTime} · {e.severity}{e.visitId ? ` · during visit` : ""}</div>
              </div>
              <Badge variant="outline">{e.column === "complete" ? "Closed" : "Open"}</Badge>
              {full ? <Button size="sm" variant="outline" asChild><Link to={`/app/incidents/board?eventId=${e.id}`}>Open event</Link></Button>
                : <span className="text-xs text-muted-foreground">Restricted</span>}
            </div>
          );
        })}
        {events.length === 0 && <p className="p-4 text-sm text-muted-foreground">No events or concerns linked to this client.</p>}
      </CardContent>
    </Card>
  );
}

function TimelineTab({ clientId }: { clientId: string }) {
  const items = buildTimeline(clientId);
  return (
    <Card className="mt-4">
      <CardContent className="p-0 divide-y">
        {items.map((i) => (
          <Link key={i.id} to={i.href} className="block p-3 hover:bg-secondary/50">
            <div className="text-sm font-medium">{i.title}</div>
            {i.detail && <div className="text-xs text-muted-foreground line-clamp-2">{i.detail}</div>}
            <div className="text-xs text-muted-foreground mt-0.5">{formatDate(i.date)}{i.who && ` · ${i.who}`}</div>
          </Link>
        ))}
        {items.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing to show.</p>}
      </CardContent>
    </Card>
  );
}
