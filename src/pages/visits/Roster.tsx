import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, AlertTriangle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useRole } from "@/hooks/useRole";
import { useTerms } from "@/hooks/useTerms";
import { useServiceUsers, type ServiceUser } from "@/lib/serviceUsersStore";
import { useVisits, visitsStore, VISIT_STATUS_LABELS, CALL_NAMES, type Visit } from "@/lib/visitsStore";
import { inScopeSite } from "@/lib/roleStore";
import { STAFF, STAFF_BY_ID, SITE_BY_ID, type StaffId } from "@/lib/demoDataRegistry";
import { clientDisplayName, clientTown } from "@/lib/visitPresentation";
import { assignmentStatus, ASSIGNMENT_LABELS, canEditRoster, durationMinutes, sameDay, scheduleConflicts, startOfWeek, weekDays, carersRequiredFor } from "@/lib/rosterRules";
import { travelBetween, legLevel } from "@/lib/travelTime";
import { RosterVisitDialog } from "@/components/roster/RosterVisitDialog";
import { AddVisitDialog } from "@/components/roster/AddVisitDialog";

export const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false });
export const staffName = (id: StaffId) => STAFF_BY_ID[id]?.name ?? id;
const dayLabel = (d: Date) => d.toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "short" });

export default function Roster() {
  const role = useRole();
  const terms = useTerms();
  const { users } = useServiceUsers();
  const { visits, templates } = useVisits();
  const [monday, setMonday] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState<"visits" | "carers">("visits");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [openId, setOpenId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const days = weekDays(monday);
  const sunday = new Date(days[6]); sunday.setHours(23, 59, 59, 999);
  const clientsById = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);
  const canEditAny = role.scopeSiteIds.some((s) => canEditRoster(s, role)) || role.role === "admin";

  const week = visits.filter((v) => {
    const t = Date.parse(v.scheduledStart);
    const c = clientsById.get(v.clientId);
    return t >= monday.getTime() && t <= sunday.getTime() && c && inScopeSite(c.siteId, role);
  }).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));
  const active = week.filter((v) => v.status !== "cancelled");
  const unassigned = active.filter((v) => assignmentStatus(v) === "unassigned").length;
  const partial = active.filter((v) => assignmentStatus(v) === "partial").length;
  const conflicted = new Set(active.filter((v) => v.staffIds.some((s) => scheduleConflicts(active, [s], v.scheduledStart, v.scheduledEnd, v.id).length)).map((v) => v.id));
  const drafts = active.filter((v) => v.rosterStatus === "draft");
  const shown = unassignedOnly ? active.filter((v) => assignmentStatus(v) !== "assigned") : week;
  const visitName = (v: Visit) => v.purpose ?? (() => { const t = templates.find((x) => x.id === v.templateId); return t ? t.name ?? CALL_NAMES[t.callType] : "Visit"; })();

  const thisWeek = startOfWeek(new Date()).getTime();
  const shift = (n: number) => setMonday((m) => { const d = new Date(m); d.setDate(d.getDate() + n * 7); return d; });

  return (
    <section className="max-w-6xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold">Roster</h1>
          <p className="mt-1 text-muted-foreground">Who is delivering each {terms.singular} visit this week?</p>
        </div>
        {canEditAny && <Button onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" /> Add visit</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /> Previous week</Button>
        <Button variant={monday.getTime() === thisWeek ? "default" : "outline"} size="sm" onClick={() => setMonday(startOfWeek(new Date()))}>This week</Button>
        <Button variant="outline" size="sm" onClick={() => shift(1)}>Next week <ChevronRight className="h-4 w-4" /></Button>
        <span className="ml-2 font-semibold">{days[0].toLocaleDateString("en-IE", { day: "numeric", month: "short" })} – {days[6].toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card p-4">
        <span><strong className="text-xl tabular-nums">{active.length}</strong> visits</span>
        <span className={unassigned ? "text-destructive" : ""}><strong className="text-xl tabular-nums">{unassigned}</strong> unassigned</span>
        <span className={partial ? "text-warning" : ""}><strong className="text-xl tabular-nums">{partial}</strong> partially assigned</span>
        {conflicted.size > 0 && <span className="text-destructive"><strong className="text-xl tabular-nums">{conflicted.size}</strong> with schedule conflicts</span>}
        {drafts.length > 0 && <span><strong className="text-xl tabular-nums">{drafts.length}</strong> draft</span>}
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2"><Checkbox id="unassigned-only" checked={unassignedOnly} onCheckedChange={(c) => setUnassignedOnly(!!c)} /><Label htmlFor="unassigned-only">Show unassigned only</Label></div>
          {canEditAny && drafts.length > 0 && <Button size="sm" variant="secondary" onClick={() => visitsStore.publishVisits(drafts.map((v) => v.id), role)}>Publish {drafts.length} draft visits</Button>}
        </div>
      </div>

      <div className="inline-flex rounded-md border p-1" role="tablist" aria-label="Roster view">
        <Button role="tab" aria-selected={view === "visits"} size="sm" variant={view === "visits" ? "default" : "ghost"} onClick={() => setView("visits")}>By visit</Button>
        <Button role="tab" aria-selected={view === "carers"} size="sm" variant={view === "carers" ? "default" : "ghost"} onClick={() => setView("carers")}><Users className="mr-1 h-4 w-4" /> By carer</Button>
      </div>

      {view === "visits" ? days.map((day) => {
        const list = shown.filter((v) => sameDay(v.scheduledStart, day));
        return (
          <div key={day.toISOString()} className="rounded-lg border bg-card">
            <h2 className="border-b px-4 py-3 font-heading text-lg font-semibold">{dayLabel(day)} <span className="text-sm font-normal text-muted-foreground">· {list.length} visits</span></h2>
            {list.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">{unassignedOnly ? "Every visit is assigned." : "No visits scheduled."}</p> : (
              <ul className="divide-y">
                {list.map((v) => {
                  const c = clientsById.get(v.clientId)!;
                  return <RosterRow key={v.id} visit={v} client={c} name={visitName(v)} conflict={conflicted.has(v.id)} onOpen={() => setOpenId(v.id)} />;
                })}
              </ul>
            )}
          </div>
        );
      }) : <CarerView visits={active} days={days} clientsById={clientsById} siteIds={role.role === "admin" ? Object.keys(SITE_BY_ID) : role.scopeSiteIds} conflicted={conflicted} onOpen={setOpenId} />}

      {openId && <RosterVisitDialog visitId={openId} onClose={() => setOpenId(undefined)} />}
      {adding && <AddVisitDialog onClose={() => setAdding(false)} />}
    </section>
  );
}

function RosterRow({ visit, client, name, conflict, onOpen }: { visit: Visit; client: ServiceUser; name: string; conflict: boolean; onOpen: () => void }) {
  const status = assignmentStatus(visit);
  const cancelled = visit.status === "cancelled";
  return (
    <li className={`grid gap-2 px-4 py-3 sm:grid-cols-[7rem_1fr_14rem] sm:items-center ${cancelled ? "opacity-60" : ""} ${status === "unassigned" && !cancelled ? "border-l-4 border-l-destructive" : status === "partial" && !cancelled ? "border-l-4 border-l-warning" : ""}`}>
      <button onClick={onOpen} className="text-left font-semibold tabular-nums hover:underline">{hm(visit.scheduledStart)}–{hm(visit.scheduledEnd)}</button>
      <div className="min-w-0">
        <Link to={`/app/org/service-users/${client.id}`} className="font-semibold hover:underline">{clientDisplayName(client)}</Link>
        <p className="text-sm text-muted-foreground">{[clientTown(client), SITE_BY_ID[client.siteId]?.name].filter(Boolean).join(" · ")} · {durationMinutes(visit)} mins · {name}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {visit.rosterStatus === "draft" && <Badge variant="outline">Draft</Badge>}
          {visit.status !== "scheduled" && <Badge variant="secondary">{VISIT_STATUS_LABELS[visit.status]}</Badge>}
          {carersRequiredFor(visit) > 1 && <Badge variant="outline">{carersRequiredFor(visit)} carers</Badge>}
          {conflict && <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Schedule conflict</Badge>}
        </div>
      </div>
      <button onClick={onOpen} className="rounded-md border px-3 py-2 text-left text-sm hover:bg-accent">
        {status === "unassigned" && !cancelled ? <span className="font-bold text-destructive">UNASSIGNED</span> : visit.staffIds.map((s) => <span key={s} className="block font-medium">{staffName(s)}</span>)}
        {status === "partial" && !cancelled && <span className="block font-semibold text-warning">{ASSIGNMENT_LABELS.partial}</span>}
      </button>
    </li>
  );
}

function CarerView({ visits, days, clientsById, siteIds, conflicted, onOpen }: { visits: Visit[]; days: Date[]; clientsById: Map<string, ServiceUser>; siteIds: string[]; conflicted: Set<string>; onOpen: (id: string) => void }) {
  const [day, setDay] = useState(() => days.find((d) => sameDay(new Date().toISOString(), d)) ?? days[0]);
  const carers = STAFF.filter((s) => s.accessRole === "Frontline" && s.scopeSiteIds.some((x) => siteIds.includes(x)));
  const dayVisits = visits.filter((v) => sameDay(v.scheduledStart, day));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">{days.map((d) => <Button key={d.toISOString()} size="sm" variant={d.getTime() === day.getTime() ? "default" : "outline"} onClick={() => setDay(d)}>{d.toLocaleDateString("en-IE", { weekday: "short", day: "numeric" })}</Button>)}</div>
      <div className="grid gap-3 md:grid-cols-2">
        {carers.map((s) => {
          const mine = dayVisits.filter((v) => v.staffIds.includes(s.id));
          return (
            <div key={s.id} className="rounded-lg border bg-card p-4">
              <h3 className="font-heading font-semibold">{s.name}</h3>
              <p className="text-sm text-muted-foreground">{s.roleLabel} · {s.scopeSiteIds.map((x) => SITE_BY_ID[x]?.name).join(", ")} · {mine.length} visits</p>
              {mine.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No visits.</p> : <ul className="mt-2 space-y-1">{mine.map((v, i) => {
                const c = clientsById.get(v.clientId);
                const prev = i > 0 ? mine[i - 1] : undefined;
                const t = prev ? travelBetween(prev.clientId, v.clientId, prev.scheduledEnd) : undefined;
                const gap = prev ? Math.round((Date.parse(v.scheduledStart) - Date.parse(prev.scheduledEnd)) / 60000) : 0;
                const level = prev && gap >= 0 ? legLevel(gap, t?.minutes) : undefined;
                return <li key={v.id}>{prev && t?.minutes !== undefined && level && <p className={`ml-12 text-xs ${level === "conflict" ? "font-semibold text-destructive" : level === "tight" ? "text-warning" : "text-muted-foreground"}`}>↓ {t.minutes} min travel{level === "conflict" ? ` · ⚠ Travel conflict (${gap} min gap)` : level === "tight" ? ` · Tight (${gap} min gap)` : ""}</p>}<button onClick={() => onOpen(v.id)} className="flex w-full gap-3 text-left text-sm hover:underline"><span className="w-12 font-semibold tabular-nums">{hm(v.scheduledStart)}</span><span>{c ? clientDisplayName(c) : v.clientId}</span>{conflicted.has(v.id) && <span className="ml-auto font-semibold text-destructive">Schedule conflict</span>}</button></li>;
              })}</ul>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
