import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, Pill, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MedicationSourceGate, PROTOTYPE_DATA_NOTE } from "@/components/MedicationSourceGate";
import { demoAccess, demoMedicationClientIds, loadDemoClientEmar } from "@/lib/medicationDemoStore";
import { currentOutcome } from "@/lib/medicationRules";
import { doseState } from "@/lib/emarPresentation";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { SITE_BY_ID } from "@/lib/demoDataRegistry";
import { useRole } from "@/hooks/useRole";

const today = () => new Date().toISOString().slice(0, 10);

function Overview() {
  const role = useRole();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const access = demoAccess(role);
    return demoMedicationClientIds(access.site_ids).map((id) => {
      const client = serviceUsersStore.getById(id);
      if (!client || !access.site_ids.includes(client.siteId)) return null;
      const emar = loadDemoClientEmar(id);
      const todays = emar.tasks.filter((t) => t.scheduled_at.slice(0, 10) === today());
      const states = todays.map((t) => doseState(currentOutcome(emar.outcomes, t.id)?.outcome, t.scheduled_at, t.documentation_due_at));
      return {
        id, name: client.name, area: SITE_BY_ID[client.siteId as keyof typeof SITE_BY_ID]?.name ?? "",
        meds: emar.medications.filter((m) => m.medication.status !== "stopped").length,
        due: todays.length, done: states.filter((s) => s !== "due" && s !== "outstanding").length,
        refused: states.filter((s) => s === "refused" || s === "not_done").length,
        openExceptions: emar.exceptions.filter((e) => e.status !== "resolved"),
        drafts: emar.medications.filter((m) => m.versions.some((v) => v.verification_status === "draft")).length,
      };
    }).filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => b.openExceptions.length - a.openExceptions.length || a.name.localeCompare(b.name));
  }, [role]);
  const shown = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
  const totals = rows.reduce((t, r) => ({ due: t.due + r.due, done: t.done + r.done, refused: t.refused + r.refused, exc: t.exc + r.openExceptions.length, drafts: t.drafts + r.drafts }), { due: 0, done: 0, refused: 0, exc: 0, drafts: 0 });
  const tiles = [["Doses due today", totals.due], ["Recorded", totals.done], ["Refused / not done", totals.refused], ["Open exceptions", totals.exc], ["Awaiting verification", totals.drafts]] as const;

  return <div className="space-y-6">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{tiles.map(([label, n]) => <div key={label} className="rounded-lg border bg-card p-4"><p className="text-2xl font-bold">{n}</p><p className="text-sm text-muted-foreground">{label}</p></div>)}</div>
    <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input aria-label="Search clients" placeholder="Search clients" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
    {!shown.length && <p className="text-muted-foreground">No clients with medication support in your service areas.</p>}
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{shown.map((r) => <li key={r.id}>
      <Link to={`/app/visits/medication/${r.id}`} className="group flex h-full items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Pill className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{r.name}</p>
          <p className="text-sm text-muted-foreground">{r.area} · {r.meds} medicine{r.meds === 1 ? "" : "s"}</p>
          <p className="mt-2 text-sm">Today: {r.done} of {r.due} recorded{r.refused ? <span className="text-destructive"> · {r.refused} refused/not done</span> : null}</p>
          {r.openExceptions.length > 0 && <p className="mt-1 flex items-center gap-1 text-sm font-medium text-destructive"><AlertTriangle className="h-4 w-4" aria-hidden="true" />{r.openExceptions.length} open exception{r.openExceptions.length === 1 ? "" : "s"}</p>}
          {r.drafts > 0 && <p className="mt-1 text-sm text-muted-foreground">{r.drafts} change{r.drafts === 1 ? "" : "s"} awaiting verification</p>}
        </div>
        <ChevronRight className="mt-1 h-5 w-5 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
      </Link>
    </li>)}</ul>
  </div>;
}

export default function MedicationOversight() {
  return <section className="space-y-5 p-6 md:p-8">
    <div><h1 className="text-3xl font-heading font-bold">eMAR</h1><p className="mt-2 text-muted-foreground">Choose a client to see their medicines, what was given, when and by whom.</p></div>
    <MedicationSourceGate><Overview /></MedicationSourceGate>
    <p className="text-xs text-muted-foreground">{PROTOTYPE_DATA_NOTE}</p>
  </section>;
}
