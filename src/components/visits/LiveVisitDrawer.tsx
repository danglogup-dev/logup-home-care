import { useState } from "react";
import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/hooks/useRole";
import { isManagerRole } from "@/lib/roleStore";
import { useVisits, VISIT_STATUS_LABELS, type Visit } from "@/lib/visitsStore";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { useVisitNotes } from "@/lib/visitNotesStore";
import { incidentsStore } from "@/lib/incidentsStore";
import { createTask, useTasksStore, statusLabel, effectiveStatus } from "@/lib/tasksStore";
import { STAFF_BY_ID, SITE_BY_ID } from "@/lib/demoDataRegistry";
import { carePlansStore } from "@/lib/carePlansStore";
import { clientDisplayName } from "@/lib/visitPresentation";
import { followUpAssignees } from "@/components/emar/ExceptionFollowUp";
import { visitAlertReviewStore, useAlertReviews, reviewsForVisit, type AlertReviewKind } from "@/lib/visitAlertReviewStore";
import type { LiveVisitAlert } from "@/lib/liveVisitRules";

const t = (iso?: string) => iso ? new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
const d = (iso: string) => new Date(iso).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" });
const REVIEW_LABEL: Record<AlertReviewKind, string> = { acknowledged: "Alert acknowledged", investigation_note: "Investigation note", confirmed_missed: "Manager confirmed visit was missed" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{children}</dd></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-1 border-t pt-3"><h3 className="font-heading font-semibold">{title}</h3>{children}</section>;
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

/** Attendance wording kept deliberately distinct: no check-in ≠ not delivered ≠ confirmed missed. */
export function attendanceSummary(v: Visit, managerConfirmedMissed: boolean) {
  return {
    checkIn: v.checkInAt ? `Checked in ${t(v.checkInAt)}` : "No check-in recorded",
    delivery: v.checkOutAt ? `Confirmed delivered — checked out ${t(v.checkOutAt)}` : v.status === "in_progress" ? "In progress — not yet confirmed as delivered" : "Not confirmed as delivered",
    missed: managerConfirmedMissed ? "Confirmed missed by a manager" : v.status === "missed" ? "Not confirmed — flagged by timing only" : "Not applicable",
  };
}

export default function LiveVisitDrawer({ visitId, alert, onClose }: { visitId: string | null; alert?: LiveVisitAlert; onClose: () => void }) {
  return <Sheet open={!!visitId} onOpenChange={(o) => !o && onClose()}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-lg">{visitId && <Body visitId={visitId} alert={alert} onClose={onClose} />}</SheetContent>
  </Sheet>;
}

function Body({ visitId, alert, onClose }: { visitId: string; alert?: LiveVisitAlert; onClose: () => void }) {
  const role = useRole();
  const { visits, templates } = useVisits();
  const { users } = useServiceUsers();
  const notes = useVisitNotes();
  const { tasks } = useTasksStore();
  const reviews = reviewsForVisit(useAlertReviews(), visitId);
  const [note, setNote] = useState(""); const [msg, setMsg] = useState("");
  const v = visits.find((x) => x.id === visitId);
  const client = v ? users.find((u) => u.id === v.clientId) : undefined;
  if (!v || !client) return <SheetHeader><SheetTitle>Visit not found</SheetTitle><SheetDescription>This visit is not in the current demo records. Nothing has been created.</SheetDescription><Button onClick={onClose} className="mt-4 min-h-11">Back to Live visits</Button></SheetHeader>;

  const template = templates.find((x) => x.id === v.templateId);
  const canAct = role.role === "admin" || (isManagerRole(role.role) && role.scopeSiteIds.includes(client.siteId as never));
  const confirmedMissed = reviews.some((r) => r.kind === "confirmed_missed");
  const att = attendanceSummary(v, confirmedMissed);
  const visitNotes = (Array.isArray(notes) ? notes : []).filter((n) => n.visit_id === v.id);
  const events = incidentsStore.getPending().filter((e) => e.visitId === v.id);
  const linkedTasks = tasks.filter((x) => x.sourceRef === v.id);
  const published = carePlansStore.getPlan(client.id)?.versions.find((x) => x.status === "published");
  const expected = template?.tasks ?? [];
  const meds = template?.medications ?? [];
  const acknowledged = reviews.some((r) => r.kind === "acknowledged");

  const review = (kind: AlertReviewKind) => {
    try { visitAlertReviewStore.add({ visitId: v.id, alertId: alert?.id ?? `visit-${v.id}`, kind, note, byStaffId: role.staffId }); setNote(""); setMsg(REVIEW_LABEL[kind] + " recorded."); }
    catch (e) { setMsg((e as Error).message); }
  };
  const followUp = () => {
    if (linkedTasks.some((x) => x.status === "open" || x.status === "in_progress")) return setMsg("An open follow-up task already exists for this visit.");
    const owner = followUpAssignees(client.siteId).find((p) => p.id === role.staffId) ?? followUpAssignees(client.siteId)[0];
    const due = new Date(Date.now() + 86_400_000); due.setHours(12, 0, 0, 0);
    createTask({ title: `Visit follow-up · ${clientDisplayName(client)} ${t(v.scheduledStart)} ${VISIT_STATUS_LABELS[v.status].toLowerCase()}`,
      description: (note.trim() || `Review ${alert?.title.toLowerCase() ?? "visit"} for ${clientDisplayName(client)} on ${d(v.scheduledStart)}.`) + " Closing this task does not change the visit or its attendance record.",
      taskType: "follow_up", sourceType: "manual", sourceRef: v.id, siteId: client.siteId, ownership: "person",
      assigneeId: owner?.id ?? role.staffId, assignedById: role.staffId, dueAt: due.toISOString(), priority: v.status === "missed" ? "high" : "normal" });
    setNote(""); setMsg("Follow-up task created.");
  };

  return <div className="space-y-4">
    <SheetHeader className="text-left"><SheetTitle className="text-2xl">{clientDisplayName(client)}</SheetTitle>
      <SheetDescription>{d(v.scheduledStart)} · {SITE_BY_ID[client.siteId]?.name} · Visit {v.id}</SheetDescription></SheetHeader>

    {alert && <section className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1" aria-label="Alert">
      <p className="font-semibold text-destructive">{alert.title}</p>
      <dl>
        <Row label="Why generated">{alert.kind === "missed" ? "No check-in recorded 60 minutes after the scheduled start." : alert.kind === "late" ? "No check-in recorded 15 minutes after the scheduled start." : alert.detail}</Row>
        <Row label="Scheduled">{t(v.scheduledStart)}–{t(v.scheduledEnd)}</Row>
        <Row label="Actual">{v.checkInAt ? `${t(v.checkInAt)}–${t(v.checkOutAt)}` : "No attendance recorded"}</Row>
        <Row label="Acknowledged">{acknowledged ? "Yes" : "Not yet"}</Row>
      </dl>
    </section>}

    <dl>
      <Row label="Carer">{v.staffIds.map((id) => STAFF_BY_ID[id]?.name ?? id).join(", ") || "No carer assigned"}</Row>
      <Row label="Scheduled">{t(v.scheduledStart)}–{t(v.scheduledEnd)}</Row>
      <Row label="Status">{VISIT_STATUS_LABELS[v.status]}</Row>
      <Row label="Check-in">{att.checkIn}</Row>
      <Row label="Delivery">{att.delivery}</Row>
      <Row label="Missed visit">{att.missed}</Row>
    </dl>

    <Section title="Expected care">{expected.length ? <ul className="list-disc pl-5 text-sm">{expected.map((x, i) => { const r = v.taskRecords?.find((tr) => tr.index === i); return <li key={i}>{x}{r ? ` — ${r.outcome.replace("_", " ")}` : ""}</li>; })}</ul> : <Empty>No care tasks listed for this visit.</Empty>}
      {published ? <Link className="text-sm underline" to={`/app/org/service-users/${client.id}`}>Open approved care plan</Link> : <Empty>No approved care plan published.</Empty>}</Section>

    <Section title="Medication support">{meds.length ? <ul className="text-sm space-y-1">{meds.map((m, i) => { const r = v.medicationRecords?.find((mr) => mr.index === i); return <li key={i}>{m.name} ({m.supportLevel}) — {r ? r.outcome.replace("_", " ") : "Not recorded"}</li>; })}</ul> : <Empty>No medication support on this visit.</Empty>}</Section>

    <Section title="Visit note">{visitNotes.length ? visitNotes.map((n) => <p key={n.id} className="text-sm">Confirmed by {(STAFF_BY_ID as Record<string, { name: string } | undefined>)[n.confirmed_by_staff_id]?.name ?? n.confirmed_by_staff_id} at {t(n.confirmed_at)}. <Link className="underline" to={`/app/org/service-users/${client.id}#visit-${v.id}`}>View note</Link></p>) : <Empty>No visit note recorded.</Empty>}</Section>

    <Section title="Events and concerns">{events.length ? events.map((e) => <Link key={e.id} className="block text-sm underline" to={`/app/incidents/board?eventId=${encodeURIComponent(e.id)}`}>{e.eventType ?? "Event"} — {e.summary}</Link>) : <Empty>No events linked to this visit.</Empty>}</Section>

    <Section title="Follow-up tasks">{linkedTasks.length ? linkedTasks.map((x) => <Link key={x.id} className="block text-sm underline" to={`/app/tasks/${x.id}`}>{x.title} · {statusLabel(effectiveStatus(x))}</Link>) : <Empty>No follow-up tasks.</Empty>}</Section>

    <Section title="Manager review">{reviews.length ? <ul className="text-sm space-y-1">{reviews.map((r) => <li key={r.id}><span className="font-medium">{REVIEW_LABEL[r.kind]}</span> · {(STAFF_BY_ID as Record<string, { name: string } | undefined>)[r.byStaffId]?.name ?? r.byStaffId} · {t(r.at)}{r.note && <span className="block text-muted-foreground">{r.note}</span>}</li>)}</ul> : <Empty>No manager review yet.</Empty>}
      {canAct ? <div className="space-y-2 pt-2">
        <Textarea aria-label="Investigation note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Phoned carer — car broke down; client's daughter visited instead" />
        <div className="flex flex-wrap gap-2">
          {alert && !acknowledged && <Button size="sm" className="min-h-11" onClick={() => review("acknowledged")}>Acknowledge alert</Button>}
          <Button size="sm" variant="outline" className="min-h-11" onClick={() => review("investigation_note")}>Add investigation note</Button>
          {v.status === "missed" && !confirmedMissed && <Button size="sm" variant="outline" className="min-h-11" onClick={() => review("confirmed_missed")}>Confirm visit was missed</Button>}
          <Button size="sm" variant="outline" className="min-h-11" onClick={followUp}>Create follow-up task</Button>
        </div>
        <p className="text-xs text-muted-foreground">Reviews are added to the record. They never change the visit status or attendance times.</p>
        {msg && <p role="status" className="text-sm">{msg}</p>}
      </div> : <Empty>Only a manager or admin for this service area can review.</Empty>}
    </Section>

    <Button variant="secondary" className="min-h-11 w-full" onClick={onClose}>Back to Live visits</Button>
  </div>;
}
