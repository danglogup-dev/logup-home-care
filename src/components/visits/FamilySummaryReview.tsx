import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";
import { STAFF, STAFF_BY_ID } from "@/lib/demoDataRegistry";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { canCoordinateVisit } from "@/lib/roleStore";
import { familySummariesStore, localDate, useFamilySummaries, visitsForDay } from "@/lib/familySummariesStore";
import { useVisits } from "@/lib/visitsStore";
import { clientDisplayName } from "@/lib/visitPresentation";
import { CareAiSignIn } from "./CareAiSignIn";

/** Coordinator review of daily family summaries. Nothing reaches family until approved here. */
export default function FamilySummaryReview() {
  const role = useRole();
  const { users } = useServiceUsers();
  useVisits(); useFamilySummaries();
  const today = localDate(new Date());
  const linked = new Set(STAFF.filter((s) => s.accessRole === "Family").flatMap((s) => s.linkedPersonSupportedIds ?? []));
  const clients = users.filter((u) => linked.has(u.id) && canCoordinateVisit(u.siteId, role));
  const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  if (!clients.length) return null;
  return <section className="rounded-lg border bg-card p-4" aria-labelledby="family-summaries">
    <h2 id="family-summaries" className="font-heading text-xl font-semibold">Family daily summaries</h2>
    <p className="mt-1 text-sm text-muted-foreground">AI suggestion drafted from today's visit times and confirmed notes. Family only see it after you approve.</p>
    <CareAiSignIn>
      <ul className="mt-3 divide-y">
        {clients.map((c) => {
          const s = familySummariesStore.latestFor(c.id, today);
          const done = visitsForDay(c.id, today).filter((v) => v.status === "completed").length;
          return <li key={c.id} className="py-3 space-y-2">
            <p className="font-semibold">{clientDisplayName(c)} <span className="text-sm font-normal text-muted-foreground">· {done} completed call{done === 1 ? "" : "s"} today</span></p>
            {s && <div className="rounded-md border p-3 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI suggestion · {s.status === "pending" ? "awaiting approval" : s.status === "approved" ? `approved by ${STAFF_BY_ID[s.decidedByStaffId!]?.name}` : `rejected by ${STAFF_BY_ID[s.decidedByStaffId!]?.name}`}</p>
              {s.aiDraft.map((l, i) => <p key={i} className="text-sm break-words">{l}</p>)}
            </div>}
            <div className="flex flex-wrap gap-2">
              {s?.status === "pending" ? <>
                <Button className="min-h-11" onClick={() => { try { familySummariesStore.decide(s.id, "approved", role); } catch (e) { setError((e as Error).message); } }}>Approve for family</Button>
                <Button variant="outline" className="min-h-11" onClick={() => { try { familySummariesStore.decide(s.id, "rejected", role); } catch (e) { setError((e as Error).message); } }}>Reject</Button>
              </> : <Button variant="outline" className="min-h-11" disabled={busy === c.id} onClick={async () => { setBusy(c.id); setError(""); try { await familySummariesStore.draft(c.id, today, role); } catch (e) { setError((e as Error).message); } finally { setBusy(""); } }}>{busy === c.id ? "Drafting…" : s ? "Draft again" : "Draft today's summary"}</Button>}
            </div>
          </li>;
        })}
      </ul>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </CareAiSignIn>
  </section>;
}
