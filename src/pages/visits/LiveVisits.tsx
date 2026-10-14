import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Phone, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";
import { useTerms } from "@/hooks/useTerms";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { useVisits, VISIT_STATUS_LABELS } from "@/lib/visitsStore";
import { incidentsStore } from "@/lib/incidentsStore";
import { STAFF_BY_ID, SITE_BY_ID } from "@/lib/demoDataRegistry";
import { liveVisits, liveVisitAlerts, LIVE_STATUS_ORDER, telephoneHref } from "@/lib/liveVisitRules";
import { clientDisplayName, clientTown } from "@/lib/visitPresentation";
import FamilySummaryReview from "@/components/visits/FamilySummaryReview";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false });

function CallContact({ label, phone, name }: { label: string; phone?: string; name: string }) {
  const href = telephoneHref(phone);
  return href ? <Button asChild variant="outline" className="min-h-11 whitespace-normal"><a href={href} aria-label={`${label}: ${name}`}><Phone className="h-4 w-4 shrink-0" />{label}</a></Button>
    : <Button variant="outline" disabled title={`No direct number recorded for ${name}`} aria-label={`${label}: ${name} — number not recorded`} className="min-h-11 whitespace-normal"><Phone className="h-4 w-4 shrink-0" />{label} · No number</Button>;
}

export default function LiveVisits() {
  const role = useRole();
  const terms = useTerms();
  const { visits, templates } = useVisits();
  const { users } = useServiceUsers();
  const [events, setEvents] = useState(() => incidentsStore.getPending());
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const unsubscribe = incidentsStore.subscribe(setEvents); return () => { unsubscribe(); }; }, []);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const today = liveVisits(visits, users, templates, role, now);
  const alerts = liveVisitAlerts(today, events, visits, users, role, now);
  const byClient = new Map(users.map((u) => [u.id, u]));
  const [area, setArea] = useState("all");
  const visible = today.filter((v) => area === "all" || byClient.get(v.clientId)?.siteId === area);
  const visibleAlerts = alerts.filter((a) => area === "all" || byClient.get(a.clientId)?.siteId === area);
  useEffect(() => setArea("all"), [role.presetId]);

  return <section className="p-4 md:p-8 space-y-6" aria-labelledby="live-heading">
    <header className="flex flex-wrap justify-between items-start gap-4">
      <div><h1 id="live-heading" className="text-3xl font-heading font-bold">Live visits</h1><p className="mt-2 text-muted-foreground">{now.toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long" })} · {visible.length} visits</p></div>
      <label className="text-sm font-medium space-y-1"><span className="block">Service area</span><select className="min-h-11 max-w-full rounded-md border bg-background px-3 text-foreground" value={area} onChange={(e) => setArea(e.target.value)}><option value="all">All assigned areas</option>{role.scopeSiteIds.map((id) => <option key={id} value={id}>{SITE_BY_ID[id]?.name}</option>)}</select></label>
    </header>
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <aside className="min-w-0 xl:order-2" aria-labelledby="alerts-heading">
        <h2 id="alerts-heading" className="text-xl font-heading font-semibold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Alerts <span className="text-muted-foreground">({visibleAlerts.length})</span></h2>
        {visibleAlerts.length === 0 ? <p className="py-5 text-muted-foreground">No active alerts.</p> : <ul className="mt-4 divide-y border-y" aria-live="polite">{visibleAlerts.map((alert) => {
          const client = byClient.get(alert.clientId);
          return <li key={alert.id} className="py-4 space-y-2"><p className={`font-semibold ${alert.kind !== "event" ? "text-destructive" : "text-foreground"}`}>{alert.title} · {client ? clientDisplayName(client) : terms.Singular}</p><p className="text-sm break-words">{alert.detail}</p><p className="text-xs text-muted-foreground">{time(alert.at)}</p><Button asChild size="sm" variant="outline" className="min-h-11"><Link to={alert.eventId ? `/app/incidents/board?eventId=${encodeURIComponent(alert.eventId)}` : `#visit-${alert.visitId}`}>{alert.eventId ? "Open event" : "View visit"}</Link></Button></li>;
        })}</ul>}
      </aside>
      <div className="min-w-0 space-y-6">
        {visible.length === 0 && <p className="py-8 border-t text-muted-foreground">No visits in your service areas today.</p>}
        {LIVE_STATUS_ORDER.map((status) => {
          const group = visible.filter((v) => v.status === status);
          if (!group.length) return null;
          return <section key={status} aria-label={`${VISIT_STATUS_LABELS[status]} visits`}><h2 className={`font-heading text-xl font-semibold mb-3 ${status === "late" || status === "missed" ? "text-destructive" : "text-foreground"}`}>{VISIT_STATUS_LABELS[status]} <span className="text-muted-foreground">({group.length})</span></h2><ul className="space-y-3">{group.map((v) => {
            const client = byClient.get(v.clientId);
            if (!client) return null;
            const template = templates.find((t) => t.id === v.templateId);
            const carers = v.staffIds.map((id) => STAFF_BY_ID[id]).filter(Boolean);
            return <li id={`visit-${v.id}`} key={v.id} className="scroll-mt-6 rounded-lg border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-semibold break-words">{clientDisplayName(client)}</h3><p className="text-sm text-muted-foreground">{clientTown(client) ?? client.homeAddress ?? "Town not recorded"} · {SITE_BY_ID[client.siteId]?.name}</p></div><p className="flex items-center gap-1 text-sm font-semibold tabular-nums"><Clock3 className="h-4 w-4" />{template ? `${template.windowStart}–${template.windowEnd}` : `${time(v.scheduledStart)}–${time(v.scheduledEnd)}`}</p></div>
              <p className="text-sm">{carers.map((c) => c.name).join(" · ") || "No carer assigned"}{v.checkInAt ? ` · Checked in ${time(v.checkInAt)}` : ""}{v.checkOutAt ? ` · Checked out ${time(v.checkOutAt)}` : ""}</p>
              <div className="flex flex-wrap gap-2">{carers.map((carer) => <CallContact key={carer.id} name={carer.name} label={carers.length > 1 ? `Call carer · ${carer.name}` : "Call carer"} phone={carer.phone} />)}{!carers.length && <CallContact name="Unassigned carer" label="Call carer" />}<CallContact name={clientDisplayName(client)} label={`Call ${terms.singular}`} phone={client.phone} /></div>
            </li>;
          })}</ul></section>;
        })}
      </div>
    </div>
    <FamilySummaryReview />
  </section>;
}