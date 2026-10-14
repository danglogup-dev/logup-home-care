/**
 * Home Care Workforce hub: Team, Qualifications & Competencies, Coverage.
 * Reads shared staff identities (demoDataRegistry STAFF) and workforceStore;
 * creates no staff records and makes no staffing decisions.
 */
import { useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRole } from "@/hooks/useRole";
import { scopedSiteIds } from "@/lib/roleStore";
import { useSites } from "@/lib/sitesStore";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { STAFF } from "@/lib/demoDataRegistry";
import { workforceStore, staffStatus, type RagStatus } from "@/lib/workforceStore";
import StaffQualifications from "./StaffQualifications";

const RAG: Record<RagStatus, { label: string; cls: string }> = {
  green: { label: "Compliant", cls: "bg-success/10 text-success border-success/30" },
  amber: { label: "Expiring soon", cls: "bg-warning/10 text-warning border-warning/30" },
  red: { label: "Action needed", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};
const HOME_RAILS = ["q-qqi5-care", "q-garda-vetting", "q-lone-working", "q-driving-licence", "q-business-insurance", "q-handling", "q-meds"];

function useWorkforce() {
  return useSyncExternalStore(workforceStore.subscribe, workforceStore.getStaff, workforceStore.getStaff);
}

export default function HomeCareWorkforce() {
  const [params, setParams] = useSearchParams();
  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workforce</h1>
        <p className="text-sm text-muted-foreground mt-1">Your team, their qualifications and cover across service areas. Managers make all staffing decisions.</p>
      </div>
      <Tabs value={params.get("tab") ?? "team"} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="quals">Qualifications & Competencies</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
        </TabsList>
        <TabsContent value="team"><TeamTab /></TabsContent>
        <TabsContent value="quals" className="-mx-4 md:-mx-6"><StaffQualifications /></TabsContent>
        <TabsContent value="coverage"><CoverageTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function useScope() {
  const role = useRole();
  return new Set<string>(scopedSiteIds(role));
}

function TeamTab() {
  useWorkforce();
  const scope = useScope();
  const sites = useSites();
  const people = STAFF.filter((s) => !s.external && s.accessRole !== "Family" && s.scopeSiteIds.some((id) => scope.has(id)));
  return (
    <Card className="mt-4">
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground"><tr className="border-b">
            <th className="p-3">Staff member</th><th className="p-3">Role</th><th className="p-3">Service areas</th><th className="p-3">Contact</th><th className="p-3">Profile</th><th className="p-3">Qualifications</th>
          </tr></thead>
          <tbody>
            {people.map((s) => {
              const w = workforceStore.getStaffMember(s.id);
              const status = w && w.expectedQualificationIds.length ? staffStatus(w).overall : undefined;
              return (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3">{s.roleLabel}</td>
                  <td className="p-3">{s.scopeSiteIds.map((id) => sites.find((x) => x.id === id)?.name).filter(Boolean).join(", ")}</td>
                  <td className="p-3">{s.phone ? <a className="underline" href={`tel:${s.phone.replace(/\s/g, "")}`}>{s.phone}</a> : <span className="text-muted-foreground">Not recorded</span>}</td>
                  <td className="p-3">{s.accessRole === "Frontline" ? "Frontline" : s.readOnly ? "View only" : "Management"}</td>
                  <td className="p-3">{status ? <Badge variant="outline" className={RAG[status].cls}>{RAG[status].label}</Badge> : <span className="text-muted-foreground">None expected</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CoverageTab() {
  const staff = useWorkforce();
  const scope = useScope();
  const sites = useSites().filter((s) => s.status === "active" && scope.has(s.id));
  const { users } = useServiceUsers();
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {sites.map((site) => {
        const carers = STAFF.filter((s) => s.accessRole === "Frontline" && s.scopeSiteIds.includes(site.id));
        const clients = users.filter((u) => u.siteId === site.id && u.status === "active").length;
        const risks = carers.flatMap((c) => {
          const w = staff.find((x) => x.id === c.id);
          if (!w) return [];
          return staffStatus(w).perQual
            .filter((p) => HOME_RAILS.includes(p.qualification.id) && w.expectedQualificationIds.includes(p.qualification.id) && (p.status === "red" || p.status === "amber" || p.status === "missing"))
            .map((p) => ({ who: c.name, what: p.qualification.name, status: p.status }));
        });
        const gaps: string[] = [];
        if (carers.length === 0) gaps.push("No carers linked to this service area.");
        else if (clients / carers.length > 4) gaps.push(`${clients} clients for ${carers.length} carers — check capacity.`);
        if (risks.some((r) => r.status !== "amber")) gaps.push("Some carers are missing or overdue on required qualifications.");
        return (
          <Card key={site.id}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{site.name}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-4"><span><strong>{carers.length}</strong> carers</span><span><strong>{clients}</strong> clients</span></div>
              <div><div className="text-xs text-muted-foreground">Carers</div>{carers.map((c) => c.name).join(", ") || "—"}</div>
              <div>
                <div className="text-xs text-muted-foreground">Qualification risks</div>
                {risks.length === 0 ? "None" : risks.map((r, i) => <div key={i}>{r.who}: {r.what} <Badge variant="outline" className={RAG[r.status === "amber" ? "amber" : "red"].cls}>{r.status === "missing" ? "Missing" : r.status === "amber" ? "Expiring" : "Expired"}</Badge></div>)}
              </div>
              {gaps.length > 0 && <div className="rounded-md border border-warning/40 bg-warning/5 p-2">{gaps.map((g) => <div key={g}>{g} <span className="text-xs text-muted-foreground">· LogUp suggestion</span></div>)}</div>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
