import { useRole } from "@/hooks/useRole";
import { useTerms } from "@/hooks/useTerms";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { useVisits } from "@/lib/visitsStore";
import { inScopeSite } from "@/lib/roleStore";
import { hoursByClientWeek } from "@/lib/hoursReport";
import { clientDisplayName } from "@/lib/visitPresentation";
import { SITE_BY_ID } from "@/lib/demoDataRegistry";

const fmt = (h: number) => h.toFixed(1);
const weekLabel = (iso: string) => `w/c ${new Date(`${iso}T00:00:00`).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}`;

export default function HoursReport() {
  const role = useRole();
  const terms = useTerms();
  const { users } = useServiceUsers();
  const { visits } = useVisits();
  const scoped = users.filter((u) => inScopeSite(u.siteId, role) && u.status === "active");
  const rows = hoursByClientWeek(visits, scoped);
  const weeks = [...new Set(rows.map((r) => r.weekStart))];
  return <section className="p-4 md:p-8 space-y-6 max-w-6xl">
    <div>
      <h1 className="text-3xl font-heading font-bold">Delivered vs HSE approved hours</h1>
      <p className="mt-2 text-muted-foreground">Delivered hours are the scheduled length of completed visits, per {terms.singular} per week (Monday to Sunday). Planned includes calls still to happen.</p>
    </div>
    {weeks.map((w) => <div key={w} className="rounded-lg border bg-card overflow-x-auto">
      <h2 className="px-4 pt-4 font-heading text-xl font-semibold">{weekLabel(w)}</h2>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-muted-foreground"><tr className="border-b">
          <th className="p-3">{terms.Singular}</th><th className="p-3">Service area</th><th className="p-3 text-right">Approved</th><th className="p-3 text-right">Delivered</th><th className="p-3 text-right">Planned</th><th className="p-3 text-right">Delivered vs approved</th><th className="p-3 text-right">Missed calls</th>
        </tr></thead>
        <tbody>{rows.filter((r) => r.weekStart === w).map((r) => {
          const c = scoped.find((u) => u.id === r.clientId)!;
          const diff = r.approvedHours == null ? undefined : r.deliveredHours - r.approvedHours;
          const over = r.approvedHours != null && r.plannedHours > r.approvedHours;
          return <tr key={r.clientId} className="border-b last:border-0">
            <td className="p-3 font-medium">{clientDisplayName(c)}</td>
            <td className="p-3">{SITE_BY_ID[c.siteId]?.name}</td>
            <td className="p-3 text-right tabular-nums">{r.approvedHours == null ? "Not recorded" : fmt(r.approvedHours)}</td>
            <td className="p-3 text-right tabular-nums font-semibold">{fmt(r.deliveredHours)}</td>
            <td className={`p-3 text-right tabular-nums ${over ? "text-destructive font-semibold" : ""}`}>{fmt(r.plannedHours)}{over ? " · over approved" : ""}</td>
            <td className="p-3 text-right tabular-nums">{diff == null ? "—" : `${diff >= 0 ? "+" : ""}${fmt(diff)}`}</td>
            <td className={`p-3 text-right tabular-nums ${r.missedVisits ? "text-destructive font-semibold" : ""}`}>{r.missedVisits}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>)}
    {!weeks.length && <p className="text-muted-foreground">No visits in your service areas yet.</p>}
  </section>;
}
