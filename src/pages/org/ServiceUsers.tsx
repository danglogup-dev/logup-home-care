import { useSearchParams } from "react-router-dom";
import { useTerms } from "@/hooks/useTerms";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import { scopedSiteIds } from "@/lib/roleStore";
import { useServiceUsers, useAdmissionDrafts, admissionDraftsStore } from "@/lib/serviceUsersStore";
import { missingDirectoryFields } from "@/lib/residentDirectory";
import { DirectoryIncompleteBadge } from "@/components/DirectoryIncompleteBadge";
import { carePlansStore, useCarePlans, statusLabel } from "@/lib/carePlansStore";
import { useSites, useIsHomeSupportOrg } from "@/lib/sitesStore";
import { STAFF, getStaffName, type SiteId, type StaffId } from "@/lib/demoDataRegistry";

export const STATUS_LABELS: Record<string, string> = {
  active: "Active", temporary_absence: "Temporary absence", discharged: "Discharged", deceased: "Deceased",
};

export function carePlanStatusText(id: string): string {
  const v = carePlansStore.getCurrentVersion(id);
  return v ? `${statusLabel(v.status)} v${v.versionNumber}` : "No care plan";
}

export default function ServiceUsers() {
  const terms = useTerms();
  const role = useRole();
  const navigate = useNavigate();
  const { users } = useServiceUsers();
  useCarePlans();
  const sites = useSites();
  const homeSupportOrg = useIsHomeSupportOrg();
  const canManage = role.role === "admin" || role.role === "manager";
  const scopeIds = useMemo(() => new Set<string>(scopedSiteIds(role)), [role]);
  const inScope = users.filter((u) => scopeIds.has(u.siteId));
  const scopeSites = sites.filter((s) => scopeIds.has(s.id));

  const [q, setQ] = useState("");
  const [params] = useSearchParams();
  const [site, setSite] = useState(params.get("site") ?? "any");
  const [status, setStatus] = useState(params.get("status") ?? "any");
  const rows = inScope.filter((u) =>
    (site === "any" || u.siteId === site) &&
    (status === "any" || u.status === status) &&
    (!q || `${u.name} ${u.preferredName ?? ""} ${u.serviceUserCode}`.toLowerCase().includes(q.toLowerCase())),
  );

  const admissionDrafts = useAdmissionDrafts().filter((d) => !d.siteId || scopeIds.has(d.siteId));

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{terms.Plural}</h1>
            <Badge variant="outline" className="gap-1 bg-secondary/60"><MapPin className="h-3 w-3" /> {inScope.length} in scope</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Everyone supported across the sites in your scope.</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {!homeSupportOrg && <Button variant="outline" onClick={() => window.open(`/print/directory${site !== "any" ? `?site=${site}` : ""}`, "_blank")}>Directory of Residents</Button>}
            <Button onClick={() => navigate("/app/org/service-users/admit")}><Plus className="mr-1 h-4 w-4" /> Admit a {terms.singular}</Button>
          </div>
        )}
      </div>

      {canManage && admissionDrafts.length > 0 && (
        <Card><CardContent className="p-3 md:p-4 space-y-2">
          <div className="text-sm font-medium">Unfinished admissions</div>
          {admissionDrafts.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex-1">{d.label} <span className="text-muted-foreground">· saved {new Date(d.savedAt).toLocaleString()} by {getStaffName(d.savedByStaffId)}</span></span>
              <Button size="sm" variant="outline" onClick={() => navigate(`/app/org/service-users/admit?draft=${d.id}`)}>Continue</Button>
              <Button size="sm" variant="ghost" onClick={() => admissionDraftsStore.remove(d.id)}>Discard</Button>
            </div>
          ))}
        </CardContent></Card>
      )}

      <Card>
        <CardContent className="p-3 md:p-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or code…" className="pl-9 h-9" />
          </div>
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">All sites</SelectItem>{scopeSites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">All statuses</SelectItem>{Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Preferred name</TableHead><TableHead>Code</TableHead><TableHead>Site</TableHead><TableHead>Key worker</TableHead>
                <TableHead>Status</TableHead><TableHead>Care plan</TableHead><TableHead className="text-right">Open review flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => {
                const flags = carePlansStore.getSuggestionsFor(u.id, "open").length;
                return (
                  <TableRow key={u.id} className="cursor-pointer" onClick={() => navigate(`/app/org/service-users/${u.id}`)}>
                    <TableCell className="font-medium">{u.preferredName || u.name}{u.preferredName && <div className="text-xs text-muted-foreground">{u.name}</div>}<DirectoryIncompleteBadge count={missingDirectoryFields(u).length} /></TableCell>
                    <TableCell>{u.serviceUserCode}</TableCell>
                    <TableCell>{sites.find((s) => s.id === u.siteId)?.name}</TableCell>
                    <TableCell>{getStaffName(u.keyWorkerStaffId)}</TableCell>
                    <TableCell><Badge variant={u.status === "active" ? "secondary" : "outline"}>{STATUS_LABELS[u.status]}</Badge></TableCell>
                    <TableCell>{carePlanStatusText(u.id)}</TableCell>
                    <TableCell className="text-right">{flags > 0 ? <Badge variant="outline">{flags}</Badge> : "—"}</TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No {terms.plural} match.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}
