import { isManagerRole } from "@/lib/roleStore";
import { useMemo, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NoAccessPanel } from "@/components/RoleContextBanner";
import { DirectoryIncompleteBadge } from "@/components/DirectoryIncompleteBadge";
import { missingDirectoryFields } from "@/lib/residentDirectory";
import { useRole } from "@/hooks/useRole";
import { useTerms } from "@/hooks/useTerms";
import { scopedSiteIds } from "@/lib/roleStore";
import { isModuleKeyReleased } from "@/lib/featureFlags";
import { sitesStore, useSites, useIsHomeSupportOrg, CENTRE_TYPE_LABELS } from "@/lib/sitesStore";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { useCarePlans, formatDate } from "@/lib/carePlansStore";
import { allEvents } from "@/lib/insightSignals";
import { incidentsStore } from "@/lib/incidentsStore";
import { useEffect, useReducer } from "react";
import { STAFF, getStaffName, type DemoSite, type StaffId, type CentreType } from "@/lib/demoDataRegistry";

const STATUS_LABELS: Record<string, string> = { active: "In", temporary_absence: "Away", discharged: "Discharged", deceased: "Deceased" };
const LIFECYCLE_LABELS: Record<string, string> = { admitted: "Admission", transferred: "Transfer", temporary_absence: "Temporary absence", returned: "Returned", discharged: "Discharge", deceased: "Death" };
const MANAGERS = STAFF.filter((s) => s.accessRole === "Manager" || s.accessRole === "Admin");
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
type ResFilter = "all" | "in" | "away" | "overdue";

function useIncidentsStoreVersion() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => { const off = incidentsStore.subscribe(() => bump()); return () => { off(); }; }, []);
}

export default function SitePage() {
  const { siteId } = useParams();
  const role = useRole();
  const terms = useTerms();
  const navigate = useNavigate();
  const sites = useSites();
  const homeSupportOrg = useIsHomeSupportOrg();
  const { users, events: lifecycle } = useServiceUsers();
  const cp = useCarePlans();
  useIncidentsStoreVersion();
  const [tab, setTab] = useState("residents");
  const [resFilter, setResFilter] = useState<ResFilter>("all");

  const site = sites.find((s) => s.id === siteId);
  const inScope = !!site && (role.role === "admin" || scopedSiteIds(role).includes(site.id));
  const isAdmin = role.role === "admin";

  const residents = useMemo(() => users.filter((u) => u.siteId === siteId), [users, siteId]);
  const current = residents.filter((u) => u.status === "active" || u.status === "temporary_absence");
  const away = residents.filter((u) => u.status === "temporary_absence");
  const residentIds = new Set(residents.map((u) => u.id));
  const now = Date.now();
  const openSuggestions = cp.suggestions.filter((s) => s.status === "open" && residentIds.has(s.personId as never));
  const overdueSuggestions = openSuggestions.filter((s) => s.dueAt && new Date(s.dueAt).getTime() < now);
  const overduePeople = new Set(overdueSuggestions.map((s) => s.personId));
  const siteEvents = allEvents().filter((e) => e.siteId === siteId);
  const openEvents = siteEvents.filter((e) => !e.closed);

  if (!site || !inScope) {
    return <div className="p-6 md:p-8"><NoAccessPanel moduleLabel="this site" /></div>;
  }

  const homeSupport = site.centreType === "home_support";
  const capacity = site.registeredCapacity ?? 0;
  const occupied = residents.filter((u) => u.status === "active" || u.status === "temporary_absence").length;
  const shownResidents = residents.filter((u) =>
    resFilter === "all" ? true
    : resFilter === "in" ? u.status === "active"
    : resFilter === "away" ? u.status === "temporary_absence"
    : overduePeople.has(u.id));

  const openResidents = (f: ResFilter) => { setResFilter(f); setTab("residents"); };

  const tiles: { label: string; value: string; note?: string; onClick?: () => void; to?: string }[] = [
    { label: `${cap(terms.plural)} in`, value: String(residents.filter((u) => u.status === "active").length), onClick: () => openResidents("in") },
    { label: "Away (temporary absence)", value: String(away.length), onClick: () => openResidents("away") },
    { label: "Open events", value: String(openEvents.length), to: `/app/incidents/reporting?site=${encodeURIComponent(site.name)}` },
    { label: "Care plan reviews overdue", value: String(overdueSuggestions.length), note: `${openSuggestions.length} open`, onClick: () => openResidents("overdue") },
    { label: "Notifications due", value: "—", note: "Notification deadline rules aren't in this build yet" },
  ];

  const staff = STAFF.filter((s) => !s.external && s.scopeSiteIds.includes(site.id));
  const workforceLink = isModuleKeyReleased("workforce.qualifications");

  const activity = [
    ...lifecycle.filter((e) => e.siteId === site.id || e.toSiteId === site.id).map((e) => ({
      id: e.id, date: e.date, kind: LIFECYCLE_LABELS[e.type] ?? e.type,
      text: `${users.find((u) => u.id === e.serviceUserId)?.name ?? ""}${e.type === "transferred" && e.toSiteId ? ` → ${sitesStore.getById(e.toSiteId)?.name ?? ""}` : ""}`,
      to: `/app/org/service-users/${e.serviceUserId}`,
    })),
    ...siteEvents.map((e) => ({
      id: e.id, date: e.date.toISOString(), kind: `Event · ${e.category}`,
      text: `${e.id}${e.serviceUserId ? ` · ${users.find((u) => u.id === e.serviceUserId)?.name ?? ""}` : ""}`,
      to: e.submitted ? `/app/incidents/board?eventId=${e.id}` : `/app/incidents/reporting?incidentId=${e.id}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const rowKey = (e: KeyboardEvent, to: string) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(to); } };

  return (
    <div className="p-6 space-y-5">
      <Link to="/app/org/sites" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Sites</Link>

      <Card>
        <CardContent className="p-5 grid gap-4 md:grid-cols-[1fr_280px]">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{site.name}</h1>
              <Badge variant="outline">{CENTRE_TYPE_LABELS[site.centreType]}</Badge>
              {site.status !== "active" && <Badge variant="outline" className="capitalize">{site.status}</Badge>}
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
              {!homeSupport && <span>HIQA centre ID: {site.hiqaCentreId || "—"}</span>}
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{site.address}</span>
              {homeSupport && site.coverageTowns?.length ? <span>Covers {site.coverageTowns.join(", ")}</span> : null}
              {site.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{site.phone}</span>}
            </div>
            <dl className="grid sm:grid-cols-3 gap-2 text-sm pt-1">
              <div><dt className="text-xs text-muted-foreground">Registered provider</dt><dd>{site.registeredProvider || "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Person in charge</dt><dd>{getStaffName(site.personInChargeStaffId)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Person participating in management</dt><dd>{site.ppimStaffId ? getStaffName(site.ppimStaffId) : "—"}</dd></div>
            </dl>
          </div>
          <div className="space-y-3 text-sm">
            {!homeSupport && <div>
              <p className="font-medium">{capacity ? `${occupied} of ${capacity} registered places` : `${occupied} — registered places not recorded`}</p>
              {capacity > 0 && <Progress value={Math.min(100, (occupied / capacity) * 100)} className="h-2 mt-1" />}
            </div>}
            <p><span className="text-muted-foreground">Registration renewal:</span> {site.registrationRenewalDate ? formatDate(site.registrationRenewalDate) : "—"}</p>
            <p><span className="text-muted-foreground">Last inspection:</span> {site.lastInspectionDate ? formatDate(site.lastInspectionDate) : "—"}
              {site.lastInspectionReportUrl && <a href={site.lastInspectionReportUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">Report <ExternalLink className="h-3 w-3" /></a>}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {tiles.map((t) => {
          const body = (
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className="text-2xl font-semibold mt-1">{t.value}</p>
              {t.note && <p className="text-[11px] text-muted-foreground mt-1">{t.note}</p>}
            </CardContent>
          );
          if (t.to) return <Link key={t.label} to={t.to}><Card className="h-full hover:bg-secondary/40 transition-colors">{body}</Card></Link>;
          if (t.onClick) return <button key={t.label} type="button" onClick={t.onClick} className="text-left"><Card className="h-full hover:bg-secondary/40 transition-colors">{body}</Card></button>;
          return <Card key={t.label} className="h-full">{body}</Card>;
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="residents">{cap(terms.plural)}</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        {(role.role === "admin" || isManagerRole(role.role)) && !homeSupportOrg && (
          <Button variant="outline" size="sm" className="ml-2" onClick={() => window.open(`/print/directory?site=${site.id}`, "_blank")}>Directory of Residents</Button>
        )}

        <TabsContent value="residents" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["all", "in", "away", "overdue"] as ResFilter[]).map((f) => (
              <Button key={f} size="sm" variant={resFilter === f ? "default" : "outline"} onClick={() => setResFilter(f)}>
                {f === "all" ? "All" : f === "in" ? "In" : f === "away" ? "Away" : "Review overdue"}
              </Button>
            ))}
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Key worker</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {shownResidents.length === 0 && <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">None</TableCell></TableRow>}
                {shownResidents.map((u) => {
                  const to = `/app/org/service-users/${u.id}`;
                  return (
                    <TableRow key={u.id} tabIndex={0} role="link" className="cursor-pointer" onClick={() => navigate(to)} onKeyDown={(e) => rowKey(e, to)}>
                      <TableCell className="font-medium">{u.name}{u.preferredName && <span className="text-xs text-muted-foreground"> ({u.preferredName})</span>}<DirectoryIncompleteBadge count={missingDirectoryFields(u).length} /></TableCell>
                      <TableCell>{u.serviceUserCode}</TableCell>
                      <TableCell>{u.keyWorkerStaffId ? getStaffName(u.keyWorkerStaffId) : "—"}</TableCell>
                      <TableCell><Badge variant={u.status === "active" ? "secondary" : "outline"}>{STATUS_LABELS[u.status]}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="staff">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead /><TableHead className="text-right">Key worker for</TableHead></TableRow></TableHeader>
              <TableBody>
                {staff.map((s) => {
                  const kw = current.filter((u) => u.keyWorkerStaffId === s.id).length;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{workforceLink ? <Link to="/app/workforce/qualifications" className="hover:underline">{s.name}</Link> : s.name}</TableCell>
                      <TableCell>{s.roleLabel}</TableCell>
                      <TableCell className="space-x-1">
                        {site.personInChargeStaffId === s.id && <Badge variant="secondary">Person in charge</Badge>}
                        {kw > 0 && <Badge variant="outline">Key worker</Badge>}
                      </TableCell>
                      <TableCell className="text-right">{kw > 0 ? terms.count(kw) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card><CardContent className="p-0 divide-y">
            {activity.length === 0 && <p className="p-4 text-sm text-muted-foreground">No activity recorded.</p>}
            {activity.map((a) => (
              <Link key={a.id} to={a.to} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-secondary/40">
                <span className="w-24 shrink-0 text-muted-foreground">{formatDate(a.date)}</span>
                <Badge variant="outline" className="shrink-0">{a.kind}</Badge>
                <span className="truncate">{a.text}</span>
              </Link>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="details">
          <SiteDetails site={site} editable={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SiteDetails({ site, editable }: { site: DemoSite; editable: boolean }) {
  const [f, setF] = useState<DemoSite>(site);
  const set = <K extends keyof DemoSite>(k: K, v: DemoSite[K]) => setF((p) => ({ ...p, [k]: v }));
  const text = (k: keyof DemoSite, label: string, type = "text") => (
    <div><Label>{label}</Label><Input type={type} disabled={!editable} value={(f[k] as string | number | undefined) ?? ""}
      onChange={(e) => set(k, (type === "number" ? (e.target.value ? Number(e.target.value) : undefined) : e.target.value) as never)} /></div>
  );
  const staffSelect = (k: "personInChargeStaffId" | "ppimStaffId", label: string, optional: boolean) => (
    <div><Label>{label}</Label>
      <Select disabled={!editable} value={(f[k] as string | undefined) ?? "none"} onValueChange={(v) => set(k, (v === "none" ? undefined : v) as StaffId)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{optional && <SelectItem value="none">None</SelectItem>}{MANAGERS.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  const save = () => {
    if (!f.name.trim()) { toast.error("Site name is required"); return; }
    const { id, ...patch } = f;
    sitesStore.update(id, patch);
    toast.success("Site updated");
  };
  return (
    <Card><CardContent className="p-5 space-y-4">
      {!editable && <p className="text-xs text-muted-foreground">Read only.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {text("name", "Name")}
        <div><Label>Centre type</Label>
          <Select disabled={!editable} value={f.centreType} onValueChange={(v) => set("centreType", v as CentreType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(CENTRE_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {f.centreType !== "home_support" && text("hiqaCentreId", "HIQA centre ID")}
        {text("address", "Address")}
        {text("phone", "Phone")}
        {text("registeredProvider", "Registered provider")}
        {f.centreType !== "home_support" && text("registeredCapacity", "Registered places", "number")}
        {staffSelect("personInChargeStaffId", "Person in charge", false)}
        {staffSelect("ppimStaffId", "Person participating in management", true)}
        {text("registrationRenewalDate", "Registration renewal date", "date")}
        {text("lastInspectionDate", "Last inspection date", "date")}
        {text("lastInspectionReportUrl", "Last inspection report link")}
      </div>
      {editable && <div className="flex justify-end"><Button onClick={save}>Save</Button></div>}
    </CardContent></Card>
  );
}
