import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { scopedSiteIds } from "@/lib/roleStore";
import { useRole } from "@/hooks/useRole";
import { siteLabel } from "@/lib/sitesStore";
import { ChronologyList, stamp, useClientTimeline } from "@/components/clients/ClientChronology";
import type { TimelineItem, TimelineKind } from "@/lib/serviceUserTimeline";
import { NoAccessPanel } from "@/components/RoleContextBanner";

export const EVIDENCE_PACK_TITLE = "LogUp Care Assurance Evidence Pack — Fictional Demonstration";
const iso = (d: Date) => d.toISOString().slice(0, 10);

const SECTIONS: { title: string; kinds: TimelineKind[] }[] = [
  { title: "Visit chronology", kinds: ["visit"] },
  { title: "Confirmed care notes", kinds: ["visit_note"] },
  { title: "Medication outcomes and exceptions", kinds: ["medication_outcome", "medication_exception"] },
  { title: "Incidents and concerns", kinds: ["event"] },
  { title: "Manager reviews and decisions", kinds: ["manager_decision"] },
  { title: "Follow-up actions and outcomes", kinds: ["task"] },
  { title: "Care plan versions and review flags", kinds: ["care_plan", "review_flag"] },
];

/** Printable pack built from the records currently in the prototype. Stays in-app so in-memory demo records are included. */
export default function ClientEvidencePack() {
  const { id = "" } = useParams(); const role = useRole(); const u = serviceUsersStore.getById(id);
  const [from, setFrom] = useState(iso(new Date(Date.now() - 7 * 86_400_000))); const [to, setTo] = useState(iso(new Date()));
  const items = useClientTimeline(id, from, to);
  if (!u || !scopedSiteIds(role).includes(u.siteId)) return <div className="p-6"><NoAccessPanel moduleLabel="this evidence pack" /></div>;
  const download = () => {
    const html = `<!doctype html><meta charset="utf-8"><title>${EVIDENCE_PACK_TITLE}</title><style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;color:#111}h2{border-bottom:1px solid #ccc;padding-bottom:4px}li{margin:6px 0}small{color:#555}.b{border:2px solid #b45309;padding:8px;margin:12px 0}</style>${document.getElementById("evidence-pack")?.innerHTML ?? ""}`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html" })); a.download = `logup-evidence-pack-${u.id}-${from}-to-${to}-FICTIONAL.html`; a.click(); URL.revokeObjectURL(a.href);
  };
  return <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
    <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
      <Link to={`/app/org/service-users/${u.id}?tab=timeline`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to client</Link>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label htmlFor="ep-from">From</Label><Input id="ep-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="ep-to">To</Label><Input id="ep-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></div>
        <Button variant="outline" onClick={download}><Download aria-hidden="true" />Download</Button>
        <Button onClick={() => window.print()}><Printer aria-hidden="true" />Print / save PDF</Button>
      </div>
    </div>
    <article id="evidence-pack" className="space-y-5 rounded-lg border bg-card p-6 print:border-0 print:p-0">
      <header>
        <h1 className="text-2xl font-heading font-bold">{EVIDENCE_PACK_TITLE}</h1>
        <p className="b mt-2 rounded-md border-2 border-warning bg-warning/10 p-3 text-sm font-semibold">DEMO INFORMATION ONLY. Every person and record is fictional. This pack collects records held in the prototype; it does not prove legal or regulatory compliance.</p>
        <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          <div><dt className="inline font-semibold">Fictional client: </dt><dd className="inline">{u.name} ({u.id})</dd></div>
          <div><dt className="inline font-semibold">Service area: </dt><dd className="inline">{siteLabel(u.siteId)}</dd></div>
          <div><dt className="inline font-semibold">Date range: </dt><dd className="inline">{from} to {to}</dd></div>
          <div><dt className="inline font-semibold">Generated: </dt><dd className="inline">{stamp(new Date().toISOString())} by {role.displayName}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Each entry shows its source, the person who recorded it, and its record ID. “Original record” = what staff recorded; “Manager decision” = a person’s review; “LogUp suggestion” = a prompt, not a finding.</p>
      </header>
      {SECTIONS.map((s) => { const list = items.filter((i) => s.kinds.includes(i.kind)).sort((a, b) => a.date.localeCompare(b.date)); return <section key={s.title} className="break-inside-avoid-page">
        <h2 className="text-lg font-semibold">{s.title} <small className="text-muted-foreground">({list.length})</small></h2>
        <ChronologyList items={list} links={false} />
        {list.length > 0 && <p className="text-xs text-muted-foreground">Source record IDs: {list.map(idOf).join(", ")}</p>}
      </section>; })}
    </article>
  </div>;
}

const idOf = (i: TimelineItem) => i.id.replace(/^[A-Z]+-/, "");
