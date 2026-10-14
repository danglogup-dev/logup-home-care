import { useTerms } from "@/hooks/useTerms";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, User, MapPin, AlertTriangle, HeartPulse, Flag, Move, Printer } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import { scopedSiteIds } from "@/lib/roleStore";
import { serviceUsersStore, useServiceUsers, getSiteHistory, type LifecycleEventType } from "@/lib/serviceUsersStore";
import { carePlansStore, useCarePlans, formatDate } from "@/lib/carePlansStore";
import { useSites, siteLabel } from "@/lib/sitesStore";
import { buildTimeline, type TimelineKind } from "@/lib/serviceUserTimeline";
import { STAFF, getStaffName, type SiteId, type StaffId } from "@/lib/demoDataRegistry";
import { NoAccessPanel } from "@/components/RoleContextBanner";
import { DirectoryIncompleteBadge } from "@/components/DirectoryIncompleteBadge";
import {
  missingDirectoryFields, ageFrom, SEX_LABELS, MARITAL_LABELS, ADMISSION_TYPE_LABELS, ADMITTED_FROM_LABELS, REPRESENTATIVE_TYPE_LABELS,
} from "@/lib/residentDirectory";
import { STATUS_LABELS, carePlanStatusText } from "./ServiceUsers";

const KIND_META: Record<TimelineKind, { label: string; icon: typeof User }> = {
  lifecycle: { label: "Movements", icon: Move },
  event: { label: "Events", icon: AlertTriangle },
  care_plan: { label: "Care plan", icon: HeartPulse },
  review_flag: { label: "Review flags", icon: Flag },
};

const ACTION_TITLES: Record<LifecycleEventType, string> = {
  admitted: "Admit", transferred: "Transfer site", temporary_absence: "Temporary absence",
  returned: "Return from absence", discharged: "Discharge", deceased: "Record death",
};

export default function ServiceUserProfile() {
  const terms = useTerms();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const role = useRole();
  useServiceUsers();
  useCarePlans();
  const sites = useSites();
  const u = serviceUsersStore.getById(id);
  const [kinds, setKinds] = useState<TimelineKind[]>([]);
  const [action, setAction] = useState<LifecycleEventType | null>(null);
  const [act, setAct] = useState({ date: new Date().toISOString().slice(0, 10), note: "", toSiteId: "" });
  const [editing, setEditing] = useState(false);
  const [ed, setEd] = useState({ name: "", preferredName: "", dateOfBirth: "", keyWorkerStaffId: "", decisionSupportSummary: "" });

  if (!u || !scopedSiteIds(role).includes(u.siteId)) {
    return <div className="p-6 md:p-8"><NoAccessPanel moduleLabel={`this ${terms.singular}`} /></div>;
  }
  const canManage = role.role === "admin" || role.role === "manager";
  const closed = u.status === "discharged" || u.status === "deceased";
  const plan = carePlansStore.getPlan(u.id);
  const openFlags = carePlansStore.getSuggestionsFor(u.id, "open").length;
  const planHref = `/app/care-plans/plans/${u.id}`;
  const eventsHref = `/app/incidents/reporting?personSupportedId=${u.id}`;
  const timeline = buildTimeline(u.id).filter((i) => kinds.length === 0 || kinds.includes(i.kind));
  const history = getSiteHistory(u.id);
  const missing = missingDirectoryFields(u);
  const planDraft = plan?.versions.find((v) => v.dueBy && v.status !== "published" && v.status !== "archived");

  const submitAction = () => {
    if (!action || !act.date) return;
    if (action === "transferred" && !act.toSiteId) { toast.error("Choose the site to transfer to"); return; }
    serviceUsersStore.recordLifecycleEvent({
      serviceUserId: u.id, type: action, date: act.date, siteId: u.siteId,
      toSiteId: action === "transferred" ? act.toSiteId as SiteId : undefined,
      recordedByStaffId: role.staffId, note: act.note,
    });
    toast.success(`${ACTION_TITLES[action]} recorded`);
    setAction(null);
  };
  const startEdit = () => {
    setEd({ name: u.name, preferredName: u.preferredName ?? "", dateOfBirth: u.dateOfBirth, keyWorkerStaffId: u.keyWorkerStaffId, decisionSupportSummary: u.decisionSupportSummary });
    setEditing(true);
  };
  const saveEdit = () => {
    if (!ed.name.trim() || !ed.dateOfBirth || !ed.keyWorkerStaffId) { toast.error("Name, date of birth and key worker are required"); return; }
    serviceUsersStore.update(u.id, {
      name: ed.name.trim(), preferredName: ed.preferredName || undefined, dateOfBirth: ed.dateOfBirth,
      keyWorkerStaffId: ed.keyWorkerStaffId as StaffId, keyWorkerId: ed.keyWorkerStaffId as StaffId,
      decisionSupportSummary: ed.decisionSupportSummary,
    }, role.staffId);
    toast.success("Profile updated");
    setEditing(false);
  };

  const field = (label: string, value: React.ReactNode) => (
    <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-sm">{value || "—"}</div></div>
  );

  return (
    <div className="p-6 space-y-5">
      <Link to="/app/org/service-users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {terms.Plural}</Link>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0"><User className="h-6 w-6" /></div>
          <div className="flex-1 min-w-[200px]">
            <h1 className="text-lg font-semibold leading-tight">{u.preferredName ? `${u.preferredName} (${u.name})` : u.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{u.serviceUserCode}</span>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{siteLabel(u.siteId)}</span>
              <Badge variant={u.status === "active" ? "secondary" : "outline"}>{STATUS_LABELS[u.status]}</Badge>
              <span>Key worker: {getStaffName(u.keyWorkerStaffId)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild><Link to={planHref}>Care plan</Link></Button>
            <Button variant="outline" size="sm" asChild><Link to={eventsHref}>Events</Link></Button>
          </div>
        </CardContent>
        {canManage && !closed && (
          <div className="border-t px-4 py-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setAct({ date: new Date().toISOString().slice(0, 10), note: "", toSiteId: "" }); setAction("transferred"); }}>Transfer site</Button>
            {u.status === "temporary_absence"
              ? <Button size="sm" variant="outline" onClick={() => setAction("returned")}>Return from absence</Button>
              : <Button size="sm" variant="outline" onClick={() => setAction("temporary_absence")}>Temporary absence</Button>}
            <Button size="sm" variant="outline" onClick={() => setAction("discharged")}>Discharge</Button>
            <Button size="sm" variant="outline" onClick={() => setAction("deceased")}>Record death</Button>
          </div>
        )}
      </Card>

      <Tabs value={params.get("tab") ?? "overview"} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="timeline">Timeline</TabsTrigger></TabsList>

        <TabsContent value="overview" className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            {missing.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                <DirectoryIncompleteBadge count={missing.length} className="" />
                <span className="basis-full sm:basis-auto sm:flex-1 text-muted-foreground">{missing.map((m) => m.label).join(" · ")}</span>
                {canManage && !closed && <Button size="sm" asChild><Link to={`/app/org/service-users/admit?edit=${u.id}&step=${missing[0].step}`}>Complete now</Link></Button>}
              </div>
            )}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Personal details</CardTitle>
                {canManage && !closed && <Button size="sm" variant="ghost" asChild><Link to={`/app/org/service-users/admit?edit=${u.id}&step=about`}>Edit</Link></Button>}
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                {u.photo && u.photoConsent && <div className="col-span-2"><img src={u.photo} alt="" className="h-16 w-16 rounded-full object-cover" /></div>}
                {field("Legal name", [u.legalFirstName, u.legalLastName].filter(Boolean).join(" ") || u.name)}
                {field("Preferred name", u.preferredName)}
                {field("Date of birth", u.dateOfBirth && `${formatDate(u.dateOfBirth)} (age ${ageFrom(u.dateOfBirth)})`)}
                {field("Sex", u.sex && SEX_LABELS[u.sex])}
                {field("Marital status", u.maritalStatus && MARITAL_LABELS[u.maritalStatus])}
                {field("Preferred language", u.preferredLanguage && `${u.preferredLanguage}${u.interpreterNeeded ? " · interpreter needed" : ""}`)}
                <div className="col-span-2">{field("Address before admission", u.previousAddress)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Contacts and support</CardTitle>
                {canManage && !closed && <Button size="sm" variant="ghost" asChild><Link to={`/app/org/service-users/admit?edit=${u.id}&step=contacts`}>Edit</Link></Button>}
              </CardHeader>
              <CardContent className="grid gap-3">
                {u.representatives.length === 0 && <div className="text-sm text-muted-foreground">No next of kin or representatives recorded.</div>}
                {u.representatives.map((r) => (
                  <div key={r.id} className="text-sm">
                    <div className="text-xs text-muted-foreground">{REPRESENTATIVE_TYPE_LABELS[r.type ?? "next_of_kin"]}{r.isPrimary ? " · primary" : ""}</div>
                    <div>{r.name}{r.relationship && ` (${r.relationship})`} · {r.phone || "—"}</div>
                    {r.address && <div className="text-muted-foreground">{r.address}</div>}
                  </div>
                ))}
                {field("GP", u.gp && [u.gp.name, u.gp.practice, u.gp.phone].filter(Boolean).join(" · "))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Admission</CardTitle>
                {canManage && !closed && <Button size="sm" variant="ghost" asChild><Link to={`/app/org/service-users/admit?edit=${u.id}&step=admission`}>Edit</Link></Button>}
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                {field("Admission date", formatDate(u.admissionDate))}
                {field("Admission type", u.admissionType && ADMISSION_TYPE_LABELS[u.admissionType])}
                {field("Admitted from", u.admittedFrom && `${ADMITTED_FROM_LABELS[u.admittedFrom]}${u.admittedFromName ? ` · ${u.admittedFromName}` : ""}`)}
                {field("Room or unit", u.roomOrUnit)}
                <div className="col-span-2">{field("Arranged by", u.admissionArrangedBy)}</div>
                {field("Key worker", getStaffName(u.keyWorkerStaffId))}
                <div className="col-span-2">{field("Site history", history.map((h) => `${h.siteName} (${formatDate(h.from)} – ${h.to ? formatDate(h.to) : "now"})`).join(" → "))}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Decision support summary</CardTitle>
                {canManage && !closed && <Button size="sm" variant="ghost" onClick={startEdit}>Edit</Button>}
              </CardHeader>
              <CardContent className="text-sm">{u.decisionSupportSummary || <span className="text-muted-foreground">Not recorded yet.</span>}</CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Care planning status</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Link to={planHref} className="block hover:underline">{field("Current care plan", carePlanStatusText(u.id))}</Link>
              <Link to={planHref} className="block hover:underline">{field("Next review", plan ? formatDate(plan.nextReviewDue) : undefined)}</Link>
              <Link to={`${planHref}?tab=drafts`} className="block hover:underline">{field("Open review flags", String(openFlags))}</Link>
              {planDraft?.dueBy && <div className="text-sm text-warning">{planDraft.dueRuleLabel}: due {new Date(planDraft.dueBy).toLocaleString()}<div className="text-xs text-muted-foreground">LogUp suggestion · {planDraft.dueRuleSource}</div></div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(KIND_META) as TimelineKind[]).map((k) => {
              const on = kinds.includes(k);
              return (
                <Button key={k} size="sm" variant={on ? "default" : "outline"} className="h-8 rounded-full"
                  onClick={() => setKinds(on ? kinds.filter((x) => x !== k) : [...kinds, k])}>{KIND_META[k].label}</Button>
              );
            })}
            {canManage && (
              <Button size="sm" variant="outline" className="ml-auto" asChild>
                <Link to={`/print/service-users/${u.id}/chronology`}><Printer className="mr-1 h-4 w-4" /> Export chronology</Link>
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="p-0 divide-y">
              {timeline.map((i) => {
                const Icon = KIND_META[i.kind].icon;
                return (
                  <Link key={i.id} to={i.href} className="flex gap-3 p-3 hover:bg-secondary/50">
                    <div className="h-8 w-8 rounded-full bg-secondary grid place-items-center shrink-0"><Icon className="h-4 w-4 text-muted-foreground" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{i.title}</div>
                      {i.detail && <div className="text-xs text-muted-foreground line-clamp-2">{i.detail}</div>}
                      <div className="text-xs text-muted-foreground mt-0.5">{formatDate(i.date)}{i.who && ` · ${i.who}`}{i.site && ` · ${i.site}`}</div>
                    </div>
                  </Link>
                );
              })}
              {timeline.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nothing to show.</div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!action} onOpenChange={(v) => !v && setAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{action && ACTION_TITLES[action]}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            {action === "transferred" && (
              <div><Label>Transfer to</Label>
                <Select value={act.toSiteId} onValueChange={(v) => setAct({ ...act, toSiteId: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose site" /></SelectTrigger>
                  <SelectContent>{sites.filter((s) => s.status === "active" && s.id !== u.siteId).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Date</Label><Input type="date" value={act.date} onChange={(e) => setAct({ ...act, date: e.target.value })} /></div>
            <div><Label>Note</Label><Textarea rows={3} value={act.note} onChange={(e) => setAct({ ...act, note: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAction(null)}>Cancel</Button><Button onClick={submitAction}>Record</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit profile</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Full name</Label><Input value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></div>
            <div><Label>Preferred name</Label><Input value={ed.preferredName} onChange={(e) => setEd({ ...ed, preferredName: e.target.value })} /></div>
            <div><Label>Date of birth</Label><Input type="date" value={ed.dateOfBirth} onChange={(e) => setEd({ ...ed, dateOfBirth: e.target.value })} /></div>
            <div><Label>Key worker</Label>
              <Select value={ed.keyWorkerStaffId} onValueChange={(v) => setEd({ ...ed, keyWorkerStaffId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STAFF.filter((s) => !s.external && s.scopeSiteIds.includes(u.siteId)).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Decision support summary</Label><Textarea rows={3} value={ed.decisionSupportSummary} onChange={(e) => setEd({ ...ed, decisionSupportSummary: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button onClick={saveEdit}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
