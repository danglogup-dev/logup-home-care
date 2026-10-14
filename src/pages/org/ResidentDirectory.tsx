import { isManagerRole } from "@/lib/roleStore";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTerms } from "@/hooks/useTerms";
import { useRole } from "@/hooks/useRole";
import { scopedSiteIds } from "@/lib/roleStore";
import { useSites, isHomeSupportOrg } from "@/lib/sitesStore";
import { serviceUsersStore, useServiceUsers } from "@/lib/serviceUsersStore";
import { DIRECTORY_FIELDS, DIRECTORY_SOURCE } from "@/lib/residentDirectory";
import { getSiteName, type SiteId } from "@/lib/demoDataRegistry";
import { NoAccessPanel } from "@/components/RoleContextBanner";

const LEAVING: Record<string, string> = { discharged: "Discharged", deceased: "Died", transferred: "Transferred out" };

/** Printable Directory of Residents. Blank cells are details still to be completed. */
export default function ResidentDirectory() {
  const terms = useTerms();
  const role = useRole();
  const sites = useSites();
  const { users, events } = useServiceUsers();
  const [params, setParams] = useSearchParams();
  const scope = useMemo(() => new Set<string>(scopedSiteIds(role)), [role]);
  const site = params.get("site") ?? "any";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(params); if (v && v !== "any") n.set(k, v); else n.delete(k); setParams(n, { replace: true }); };

  if (isHomeSupportOrg(sites)) return <div className="p-6"><NoAccessPanel moduleLabel="Directory of Residents" /></div>;
  if (role.role !== "admin" && !isManagerRole(role.role)) return <div className="p-6"><NoAccessPanel moduleLabel="Directory of Residents" /></div>;

  // A resident belongs to a site's directory if they were ever admitted or transferred there.
  const rows = users.filter((u) => {
    const theirs = events.filter((e) => e.serviceUserId === u.id);
    const siteIds = new Set<string>([u.siteId, ...theirs.map((e) => e.siteId), ...theirs.map((e) => e.toSiteId ?? "")]);
    if (![...siteIds].some((s) => scope.has(s))) return false;
    if (site !== "any" && !siteIds.has(site)) return false;
    const end = theirs.find((e) => e.type === "discharged" || e.type === "deceased")?.date;
    if (to && u.admissionDate > to) return false;
    if (from && end && end < from) return false;
    return true;
  });

  const leaving = (id: string) => {
    const evs = serviceUsersStore.lifecycleEvents(id as never).filter((e) => e.type in LEAVING);
    return evs.map((e) => `${LEAVING[e.type]} ${e.date}${e.toSiteId ? ` to ${getSiteName(e.toSiteId)}` : ""}`).join("; ");
  };

  return (
    <div className="p-6 space-y-4 print:p-0">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Link to="/app/org/service-users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mr-auto"><ArrowLeft className="h-4 w-4" /> {terms.Plural}</Link>
        <div><Label className="text-xs">Site</Label>
          <Select value={site} onValueChange={(v) => setParam("site", v)}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">All sites in scope</SelectItem>{sites.filter((s) => scope.has(s.id)).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">From</Label><Input type="date" className="h-9" value={from} onChange={(e) => setParam("from", e.target.value)} /></div>
        <div><Label className="text-xs">To</Label><Input type="date" className="h-9" value={to} onChange={(e) => setParam("to", e.target.value)} /></div>
        <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />Print</Button>
      </div>
      <div>
        <h1 className="text-xl font-semibold">Directory of Residents{site !== "any" ? ` — ${getSiteName(site as SiteId)}` : ""}</h1>
        <p className="text-xs text-muted-foreground">{DIRECTORY_SOURCE.sourceReference}. Rules last reviewed {DIRECTORY_SOURCE.lastReviewedAt}. {from || to ? `Period: ${from || "start"} to ${to || "today"}.` : ""}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead><tr>
            <th className="border p-1 text-left">Code</th><th className="border p-1 text-left">Site</th>
            {DIRECTORY_FIELDS.map((f) => <th key={f.key} className="border p-1 text-left">{f.label}</th>)}
            <th className="border p-1 text-left">Discharge, transfer or death</th>
          </tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="border p-1">{u.serviceUserCode}</td><td className="border p-1">{getSiteName(u.siteId)}</td>
                {DIRECTORY_FIELDS.map((f) => <td key={f.key} className="border p-1">{f.value(u)}</td>)}
                <td className="border p-1">{leaving(u.id)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={DIRECTORY_FIELDS.length + 3} className="border p-4 text-center text-muted-foreground">No {terms.plural} in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
