import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ExceptionFollowUp, ExceptionSource } from "@/components/emar/ExceptionFollowUp";
import { AlertTriangle, ArrowLeft, History, Pill, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MedicationSourceGate, PROTOTYPE_DATA_NOTE, useMedicationSource } from "@/components/MedicationSourceGate";
import { InstructionForm } from "@/components/emar/InstructionForm";
import { loadDemoClientEmar, type ClientEmar, type ClientEmarMedication } from "@/lib/medicationDemoStore";
import type { MedicationTask } from "@/lib/medicationStore";
import { canResolveException, currentOutcome, OUTCOME_LABELS, permittedOutcomes, reasonRequired, type MedicationOutcome } from "@/lib/medicationRules";
import { AUDIT_LABELS, DOSE_STYLE, doseState, fmt, staffName } from "@/lib/emarPresentation";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { SITE_BY_ID } from "@/lib/demoDataRegistry";
import { useRole } from "@/hooks/useRole";

const STATUS: Record<string, string> = { active: "Active", stopped: "Stopped", draft: "Draft" };
const VERSION_STATUS: Record<string, string> = { draft: "Draft · awaiting verification", active: "Live", verified: "Verified", discontinued: "Stopped", suspended: "Suspended" };
const dayLabel = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-IE", { weekday: "short", day: "numeric" });

function useAct(reload: () => void) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, after?: () => void) => { setBusy(true); setError(""); try { await fn(); reload(); after?.(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); } finally { setBusy(false); } };
  return { error, busy, act, setError };
}

function MedicationDialog({ item, data, reload, onClose }: { item: ClientEmarMedication; data: ClientEmar; reload: () => void; onClose: () => void }) {
  const { store } = useMedicationSource(); const [editing, setEditing] = useState(false); const { error, busy, act } = useAct(reload);
  const canConfigure = data.access.can_configure; const draft = item.versions.find((v) => v.verification_status === "draft");
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
    <DialogHeader><DialogTitle>{item.medication.name} · {item.medication.strength}</DialogTitle><DialogDescription>{STATUS[item.medication.status] ?? item.medication.status} · version {item.current.version_number}</DialogDescription></DialogHeader>
    {editing ? <InstructionForm medication={item.medication} version={item.current} clientId={item.medication.client_id} siteId={item.medication.site_id} onCancel={() => setEditing(false)} onDone={() => { setEditing(false); reload(); }} /> : <>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        {([["Dose", item.current.dose], ["Route", item.current.route], ["When", item.current.regularity === "prn" ? "PRN (as needed)" : item.current.frequency], ["Support level", item.current.support_level], ["Source", item.current.source_document], ["Verified by", `${staffName(item.current.verified_by_staff_id)} · ${fmt(item.current.verified_at)}`]] as const).map(([k, v]) => <div key={k}><dt className="font-semibold">{k}</dt><dd className="first-letter:uppercase">{v}</dd></div>)}
        <div className="sm:col-span-2"><dt className="font-semibold">Instructions for carers</dt><dd>{item.current.provider_instructions || "—"}</dd></div>
      </dl>
      {draft && <div className="rounded-md border border-warning bg-warning/10 p-3 text-sm"><p className="font-semibold">Draft version {draft.version_number} awaiting verification</p><p>Dose {draft.dose} · {draft.frequency} · {draft.support_level}. Created by {staffName(draft.created_by_staff_id)}, {fmt(draft.created_at)}.</p>
        {canConfigure && <Button size="sm" className="mt-2" disabled={busy} onClick={() => act(() => store.setInstructionStatus(item.medication.id, draft.id, "active"))}>Verify and make live</Button>}</div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {canConfigure && item.medication.status !== "stopped" && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditing(true)}>Edit</Button><Button variant="outline" className="text-destructive" disabled={busy} onClick={() => act(() => store.setInstructionStatus(item.medication.id, item.current.id, "discontinued"))}>Stop medicine</Button></div>}
      {!canConfigure && <p className="text-sm text-muted-foreground">Only admins and managers can change medicines.</p>}
      <div><h3 className="mb-2 flex items-center gap-2 font-semibold"><History className="h-4 w-4" aria-hidden="true" />Version history</h3>
        <ol className="space-y-2">{item.versions.map((v) => <li key={v.id} className="rounded-md border p-3 text-sm"><p className="font-medium">Version {v.version_number} · {v.id === item.current.id ? "Current" : VERSION_STATUS[v.verification_status] ?? v.verification_status}</p><p>{v.dose} · {v.frequency} · {v.support_level}</p><p className="text-muted-foreground">Created by {staffName(v.created_by_staff_id)}, {fmt(v.created_at)}{v.verified_at ? ` · verified by ${staffName(v.verified_by_staff_id)}, ${fmt(v.verified_at)}` : ""}</p></li>)}</ol></div>
    </>}
  </DialogContent></Dialog>;
}

function DoseDialog({ task, data, reload, onClose }: { task: MedicationTask; data: ClientEmar; reload: () => void; onClose: () => void }) {
  const { store } = useMedicationSource(); const { error, busy, act, setError } = useAct(reload);
  const history = data.outcomes.filter((o) => o.task_id === task.id).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  const current = currentOutcome(data.outcomes, task.id);
  const [outcome, setOutcome] = useState<MedicationOutcome>(); const [reason, setReason] = useState(""); const [why, setWhy] = useState(""); const [open, setOpen] = useState(false);
  const options = permittedOutcomes(task.instruction.support_level, data.access.can_administer);
  const canRecord = data.access.can_administer && Date.parse(task.scheduled_at) < Date.now() + 2 * 3600_000;
  const save = () => {
    if (!outcome) return setError("Choose an outcome.");
    if (current && !why.trim()) return setError("Explain why this record needs correcting.");
    act(() => store.submit({ taskId: task.id, visitId: task.visit_id!, outcome, reason, eventAt: current?.event_at ?? new Date(Math.min(Date.now(), Date.parse(task.scheduled_at) + 10 * 60_000)).toISOString(), idempotencyKey: crypto.randomUUID(), correctionOf: current?.id, correctionReason: current ? why : undefined }), () => { setOpen(false); setOutcome(undefined); setReason(""); setWhy(""); });
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
    <DialogHeader><DialogTitle>{task.medication.name} · {fmt(task.scheduled_at)}</DialogTitle><DialogDescription>{task.instruction.dose} · {task.instruction.support_level} · visit {task.visit_id}</DialogDescription></DialogHeader>
    {!history.length && <p className="text-sm text-muted-foreground">Nothing recorded for this dose yet.</p>}
    <ol className="space-y-2">{history.map((o) => <li key={o.id} className={`rounded-md border p-3 text-sm ${o.id === current?.id ? "" : "opacity-70"}`}>
      <p className="font-semibold">{OUTCOME_LABELS[o.outcome]}{o.correction_of ? " (correction)" : ""}{o.id !== current?.id ? " · replaced" : ""}</p>
      <p>By {staffName(o.staff_id)} · given {fmt(o.event_at)} · recorded {fmt(o.submitted_at)}</p>
      {o.reason && <p>Reason: {o.reason}</p>}{o.correction_reason && <p>Why corrected: {o.correction_reason}</p>}
    </li>)}</ol>
    {canRecord && !open && <Button variant="outline" onClick={() => setOpen(true)}>{current ? "Add correction" : "Record outcome"}</Button>}
    {open && <div className="space-y-3 rounded-md border p-3">
      <div className="space-y-1"><Label>Outcome</Label><Select value={outcome} onValueChange={(v) => setOutcome(v as MedicationOutcome)}><SelectTrigger><SelectValue placeholder="Choose outcome" /></SelectTrigger><SelectContent>{options.map((o) => <SelectItem key={o} value={o}>{OUTCOME_LABELS[o]}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label htmlFor="dose-reason">Reason / note{outcome && reasonRequired(outcome) ? " (required)" : ""}</Label><Textarea id="dose-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      {current && <div className="space-y-1"><Label htmlFor="dose-why">Why is this being corrected?</Label><Input id="dose-why" value={why} onChange={(e) => setWhy(e.target.value)} /></div>}
      <p className="text-xs text-muted-foreground">The original record is kept. This is added alongside it.</p>
      <div className="flex gap-2"><Button disabled={busy} onClick={save}>Save</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </DialogContent></Dialog>;
}

const EXC_STATUS: Record<string, string> = { open: "Open · not yet acknowledged", acknowledged: "Acknowledged", resolved: "Resolved" };

function ExceptionCard({ e, data, reload, highlight }: { e: ClientEmar["exceptions"][number]; data: ClientEmar; reload: () => void; highlight?: boolean }) {
  const { store } = useMedicationSource(); const { error, busy, act } = useAct(reload); const [text, setText] = useState("");
  const task = data.tasks.find((t) => t.id === e.task_id); const outcome = data.outcomes.find((o) => o.id === e.outcome_id);
  const canAct = data.access.access_role !== "frontline" && data.access.access_role !== "viewonly";
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { if (highlight) ref.current?.scrollIntoView({ block: "center" }); }, [highlight]);
  return <li ref={ref} id={`exception-${e.id}`} className={`rounded-lg border bg-card p-4 text-sm ${highlight ? "ring-2 ring-primary" : ""}`}>
    <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />{e.kind === "refusal" ? "Refused" : e.kind.replace(/_/g, " ")} · {task?.medication.name} · {fmt(task?.scheduled_at)}</p>
    <dl className="mt-2 grid gap-1 sm:grid-cols-2">
      <div><dt className="inline font-semibold">Exception: </dt><dd className="inline">{EXC_STATUS[e.status] ?? e.status}{e.acknowledged_at ? ` · by ${staffName(e.acknowledged_by_staff_id)} ${fmt(e.acknowledged_at)}` : ""}</dd></div>
      <div><dt className="inline font-semibold">Notification: </dt><dd className="inline">{e.notifications?.length ? "Simulated — no one was actually notified" : "None"}</dd></div>
    </dl>
    <ExceptionSource outcome={outcome} task={task} />
    {e.follow_up && <p className="mt-2">Follow-up: {e.follow_up} ({staffName(e.follow_up_by_staff_id)})</p>}
    {e.resolution && <p className="mt-1">Resolved: {e.resolution} ({staffName(e.resolved_by_staff_id)}, {fmt(e.resolved_at)})</p>}
    {canAct && e.status !== "resolved" && <div className="mt-3 space-y-2">
      {!e.acknowledged_at && <Button size="sm" disabled={busy} onClick={() => act(() => store.exception("acknowledge", e.id))}>Acknowledge</Button>}
      {e.acknowledged_at && <><Label htmlFor={`exc-${e.id}`}>{e.follow_up ? "Your review decision (closes the exception)" : "Follow-up taken"}</Label><Textarea id={`exc-${e.id}`} placeholder={e.follow_up ? "e.g. Reviewed with GP; no harm; continue to monitor" : "e.g. Phoned daughter; pharmacist advised"} value={text} onChange={(ev) => setText(ev.target.value)} />
        <Button size="sm" disabled={busy || !text.trim()} onClick={() => act(() => store.exception(e.follow_up && canResolveException(e) ? "resolve" : "followUp", e.id, text), () => setText(""))}>{e.follow_up ? "Resolve exception" : "Save follow-up"}</Button></>}
    </div>}
    <ExceptionFollowUp exception={e} outcome={outcome} task={task} />
    {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
  </li>;
}

function ClientEmarView({ clientId }: { clientId: string }) {
  const role = useRole(); const [tick, setTick] = useState(0); const reload = () => setTick((t) => t + 1);
  const data = useMemo(() => loadDemoClientEmar(clientId), [clientId, tick, role]); // eslint-disable-line react-hooks/exhaustive-deps
  const client = serviceUsersStore.getById(clientId); const [params] = useSearchParams(); const focus = params.get("exception");
  const [medOpen, setMedOpen] = useState<string>(); const [doseOpen, setDoseOpen] = useState<string>(); const [adding, setAdding] = useState(false);
  if (!client) return <p>Client not found.</p>;
  const siteId = client.siteId; const openExc = data.exceptions.filter((e) => e.status !== "resolved");
  const medItem = data.medications.find((m) => m.medication.id === medOpen); const doseTask = data.tasks.find((t) => t.id === doseOpen);
  const todayIso = new Date().toISOString().slice(0, 10);
  return <div className="space-y-8">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-3xl font-heading font-bold">{client.name}</h1><p className="mt-1 text-muted-foreground">{SITE_BY_ID[siteId as keyof typeof SITE_BY_ID]?.name} · {data.medications.length} medicine{data.medications.length === 1 ? "" : "s"}{openExc.length ? ` · ${openExc.length} open exception${openExc.length === 1 ? "" : "s"}` : ""}</p></div>
      {data.access.can_configure && <Button onClick={() => setAdding(true)}><Plus aria-hidden="true" />Add medicine</Button>}
    </div>

    <section aria-labelledby="meds-h"><h2 id="meds-h" className="mb-3 text-xl font-semibold">Medicines</h2>
      {!data.medications.length && <p className="text-muted-foreground">No medicines recorded.</p>}
      <ul className="grid gap-3 md:grid-cols-2">{data.medications.map((m) => { const draft = m.versions.some((v) => v.verification_status === "draft"); return <li key={m.medication.id}>
        <button type="button" onClick={() => setMedOpen(m.medication.id)} className="flex w-full items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Pill className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="flex-1"><p className="font-semibold">{m.medication.name} · {m.medication.strength}</p><p className="text-sm">{m.current.dose} · {m.current.regularity === "prn" ? "PRN" : m.current.frequency}</p><p className="text-sm capitalize text-muted-foreground">{m.current.support_level}</p></div>
          <div className="flex flex-col items-end gap-1"><Badge variant={m.medication.status === "stopped" ? "secondary" : "outline"}>{STATUS[m.medication.status] ?? m.medication.status}</Badge>{draft && <Badge variant="secondary">Change to verify</Badge>}</div>
        </button></li>; })}</ul>
    </section>

    <section aria-labelledby="mar-h"><h2 id="mar-h" className="mb-1 text-xl font-semibold">MAR chart · last 7 days</h2><p className="mb-3 text-sm text-muted-foreground">Tap a dose to see who recorded it and when.</p>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[640px] text-sm">
        <thead><tr className="border-b bg-muted/50"><th className="p-2 text-left font-semibold">Medicine</th>{data.days.map((d) => <th key={d} className={`p-2 text-center font-semibold ${d === todayIso ? "text-primary" : ""}`}>{dayLabel(d)}{d === todayIso ? " (today)" : ""}</th>)}</tr></thead>
        <tbody>{data.medications.map((m) => <tr key={m.medication.id} className="border-b last:border-0"><th scope="row" className="p-2 text-left font-medium">{m.medication.name}<span className="block text-xs font-normal text-muted-foreground">{m.current.scheduled_times.join(", ")}</span></th>
          {data.days.map((d) => { const tasks = data.tasks.filter((t) => t.medication_id === m.medication.id && t.scheduled_at.slice(0, 10) === d); return <td key={d} className="p-1 text-center"><div className="flex flex-wrap justify-center gap-1">{tasks.map((t) => { const s = doseState(currentOutcome(data.outcomes, t.id)?.outcome, t.scheduled_at, t.documentation_due_at); const st = DOSE_STYLE[s]; return <button key={t.id} type="button" onClick={() => setDoseOpen(t.id)} title={`${st.label} · ${fmt(t.scheduled_at)}`} aria-label={`${m.medication.name} ${fmt(t.scheduled_at)}: ${st.label}`} className={`h-9 min-w-9 rounded-md border px-2 font-semibold transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${st.className}`}>{st.short}</button>; })}{!tasks.length && <span className="text-muted-foreground">–</span>}</div></td>; })}
        </tr>)}</tbody>
      </table></div>
      <ul className="mt-3 flex flex-wrap gap-3 text-xs">{Object.values(DOSE_STYLE).map((s) => <li key={s.label} className="flex items-center gap-1"><span className={`inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 font-semibold ${s.className}`}>{s.short}</span>{s.label}</li>)}</ul>
    </section>

    <section aria-labelledby="exc-h"><h2 id="exc-h" className="mb-3 text-xl font-semibold">Exceptions</h2>
      {!data.exceptions.length ? <p className="text-muted-foreground">No refusals or missed doses in the last 7 days.</p> : <ul className="space-y-3">{[...data.exceptions].sort((a, b) => (a.status === "resolved" ? 1 : 0) - (b.status === "resolved" ? 1 : 0) || b.created_at.localeCompare(a.created_at)).map((e) => <ExceptionCard key={e.id} e={e} data={data} reload={reload} highlight={e.id === focus} />)}</ul>}
    </section>

    <section aria-labelledby="hist-h"><h2 id="hist-h" className="mb-3 text-xl font-semibold">Change history</h2>
      <ul className="divide-y rounded-lg border text-sm">{data.audit.slice(0, 15).map((a) => <li key={a.id} className="flex flex-wrap justify-between gap-2 p-3"><span>{AUDIT_LABELS[a.action] ?? a.action.replace(/_/g, " ")}</span><span className="text-muted-foreground">{staffName(a.actor_staff_id)} · {fmt(a.created_at)}</span></li>)}{!data.audit.length && <li className="p-3 text-muted-foreground">No changes yet.</li>}</ul>
    </section>

    {medItem && <MedicationDialog item={medItem} data={data} reload={reload} onClose={() => setMedOpen(undefined)} />}
    {doseTask && <DoseDialog task={doseTask} data={data} reload={reload} onClose={() => setDoseOpen(undefined)} />}
    {adding && <Dialog open onOpenChange={(o) => !o && setAdding(false)}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Add medicine</DialogTitle><DialogDescription>For {client.name}</DialogDescription></DialogHeader><InstructionForm clientId={clientId} siteId={siteId} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} /></DialogContent></Dialog>}
  </div>;
}

export default function EmarClient() {
  const { clientId = "" } = useParams();
  return <section className="space-y-5 p-6 md:p-8">
    <Link to="/app/visits/medication" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" />All clients</Link>
    <MedicationSourceGate><ClientEmarView clientId={clientId} /></MedicationSourceGate>
    <p className="text-xs text-muted-foreground">{PROTOTYPE_DATA_NOTE}</p>
  </section>;
}
