import { isManagerRole } from "@/lib/roleStore";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";
import { scopedSiteIds } from "@/lib/roleStore";
import { serviceUsersStore, useServiceUsers } from "@/lib/serviceUsersStore";
import { buildTimeline } from "@/lib/serviceUserTimeline";
import { siteLabel } from "@/lib/sitesStore";
import { NoAccessPanel } from "@/components/RoleContextBanner";

const KIND: Record<string, string> = { lifecycle: "Movement", event: "Event", care_plan: "Care plan", review_flag: "Review flag" };

export default function Chronology() {
  const { id } = useParams();
  const role = useRole();
  useServiceUsers();
  const u = serviceUsersStore.getById(id);
  const allowed = (role.role === "admin" || isManagerRole(role.role)) && u && scopedSiteIds(role).includes(u.siteId);
  if (!u || !allowed) return <div className="p-8"><NoAccessPanel moduleLabel="Chronology export" /></div>;
  const items = buildTimeline(u.id);
  return (
    <div className="mx-auto max-w-3xl p-8 space-y-6 bg-background text-foreground">
      <div className="flex justify-between items-start print:hidden">
        <Button variant="outline" asChild><Link to={`/app/org/service-users/${u.id}?tab=timeline`}>Back</Link></Button>
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Chronology — {u.serviceUserCode}</h1>
        <p className="text-sm text-muted-foreground">{u.name} · {siteLabel(u.siteId)} · Exported {new Date().toLocaleString("en-IE")} by {role.displayName}</p>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead><tr className="border-b text-left"><th className="py-2 pr-3">Date</th><th className="pr-3">Type</th><th className="pr-3">Entry</th><th className="pr-3">Site</th><th>Who</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b align-top">
              <td className="py-2 pr-3 whitespace-nowrap">{new Date(i.date).toLocaleDateString("en-IE")}</td>
              <td className="pr-3">{KIND[i.kind]}</td>
              <td className="pr-3">{i.title}{i.detail && <div className="text-muted-foreground">{i.detail}</div>}</td>
              <td className="pr-3">{i.site ?? "—"}</td>
              <td>{i.who || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
