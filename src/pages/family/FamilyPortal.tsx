import { Navigate } from "react-router-dom";
import { useRole } from "@/hooks/useRole";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { STAFF_BY_ID } from "@/lib/demoDataRegistry";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { useVisits, VISIT_STATUS_LABELS, type Visit } from "@/lib/visitsStore";
import { familySummariesStore, useFamilySummaries } from "@/lib/familySummariesStore";
import { clientDisplayName } from "@/lib/visitPresentation";

const time = (iso?: string) => iso ? new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" });
const firstName = (id: string) => STAFF_BY_ID[id as keyof typeof STAFF_BY_ID]?.name.split(" ")[0];

/** Read-only family page: only the linked client, only approved summaries. */
export default function FamilyPortal() {
  const role = useRole();
  const { users } = useServiceUsers();
  const { visits } = useVisits();
  useFamilySummaries();
  if (role.role !== "family") return <Navigate to="/app" replace />;
  const clientId = role.linkedPersonSupportedIds?.[0];
  const client = users.find((u) => u.id === clientId);
  const now = new Date();
  const mine = client ? visits.filter((v) => v.clientId === client.id && v.status !== "cancelled") : [];
  const upcoming = mine.filter((v) => !v.checkInAt && new Date(v.scheduledEnd) >= now && v.status !== "missed").sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)).slice(0, 10);
  const completed = mine.filter((v) => v.status === "completed").sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart)).slice(0, 14);
  const summaries = client ? familySummariesStore.approvedFor(client.id).slice(0, 3) : [];
  const row = (v: Visit, done: boolean) => <li key={v.id} className="rounded-lg border bg-card p-4">
    <p className="text-base font-semibold">{day(v.scheduledStart)} · {time(v.scheduledStart)}–{time(v.scheduledEnd)}</p>
    {done ? <p className="mt-1 text-base">Arrived {time(v.checkInAt)} · Left {time(v.checkOutAt)}</p> : <p className="mt-1 text-base text-muted-foreground">{VISIT_STATUS_LABELS[v.status]}{v.staffIds.length ? ` · ${v.staffIds.map(firstName).filter(Boolean).join(" & ")}` : ""}</p>}
  </li>;
  return <div className="min-h-dvh bg-background text-foreground">
    <header className="border-b bg-card px-4 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex min-h-16 max-w-xl items-center justify-between gap-3">
        <span className="font-heading text-2xl font-bold text-primary">LogUp</span>
        <RoleSwitcher />
      </div>
    </header>
    <main className="mx-auto max-w-xl space-y-8 p-4 pb-16">
      {!client ? <p className="text-lg">No linked client found. Please contact the office.</p> : <>
        <div><p className="text-sm text-muted-foreground">Read-only view for {role.displayName}</p><h1 className="font-heading text-3xl font-bold break-words">{clientDisplayName(client)}</h1></div>
        <section aria-labelledby="fam-summary" className="space-y-3">
          <h2 id="fam-summary" className="font-heading text-xl font-semibold">Daily update</h2>
          {summaries.length === 0 ? <p className="text-base text-muted-foreground">No update shared yet today. Updates appear once the care coordinator has reviewed them.</p>
            : summaries.map((s) => <article key={s.id} className="rounded-lg border bg-card p-4 space-y-2">
              <p className="text-sm font-semibold">{new Date(s.date).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" })}</p>
              {s.aiDraft.map((l, i) => <p key={i} className="text-base leading-relaxed break-words">{l}</p>)}
              <p className="text-xs text-muted-foreground">AI summary, reviewed and approved by {STAFF_BY_ID[s.decidedByStaffId!]?.name} at {time(s.decidedAt)}</p>
            </article>)}
        </section>
        <section aria-labelledby="fam-upcoming" className="space-y-3">
          <h2 id="fam-upcoming" className="font-heading text-xl font-semibold">Upcoming visits</h2>
          {upcoming.length ? <ul className="space-y-2">{upcoming.map((v) => row(v, false))}</ul> : <p className="text-muted-foreground">No upcoming visits scheduled.</p>}
        </section>
        <section aria-labelledby="fam-done" className="space-y-3">
          <h2 id="fam-done" className="font-heading text-xl font-semibold">Completed visits</h2>
          {completed.length ? <ul className="space-y-2">{completed.map((v) => row(v, true))}</ul> : <p className="text-muted-foreground">No completed visits yet.</p>}
        </section>
      </>}
    </main>
  </div>;
}
