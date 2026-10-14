import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, LogIn, LogOut, Check, FileText, AlertTriangle, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/hooks/useRole";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { useVisits, visitsStore, VISIT_STATUS_LABELS, MEDICATION_SUPPORT_LABELS, type MedicationOutcome, type TaskOutcome } from "@/lib/visitsStore";
import { accessibleVisit } from "@/lib/visitActions";
import { clientDisplayName, directionsUrl } from "@/lib/visitPresentation";
import { carePlansStore, canViewPersonCarePlan, useCarePlans } from "@/lib/carePlansStore";
import { glanceFromPlan } from "@/lib/clientRecord";
import { browserLocation } from "@/lib/visitLocation";
import { VisitNoteEditor } from "@/components/visits/VisitNoteEditor";
import { visitNotesStore, useVisitNotes, type VisitNote } from "@/lib/visitNotesStore";
import { NOTE_SECTIONS, noteRiskMentions, noteText } from "@/lib/visitNoteRules";
import { STAFF_BY_ID } from "@/lib/demoDataRegistry";
import { VisitBrief } from "@/components/visits/VisitBrief";

const taskOptions: { value: TaskOutcome; label: string }[] = [{ value: "done", label: "Done" }, { value: "part_completed", label: "Part completed" }, { value: "refused", label: "Declined" }, { value: "not_needed", label: "Not required" }, { value: "concern", label: "Concern" }];
const medicationOptions: { value: MedicationOutcome; label: string }[] = [{ value: "given", label: "Given" }, { value: "prompted", label: "Prompted" }, { value: "refused", label: "Refused" }, { value: "not_available", label: "Not available" }];
const timestamp = (iso: string) => new Date(iso).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function VisitDetail() {
  const { id } = useParams();
  const role = useRole();
  const navigate = useNavigate();
  const notes = useVisitNotes();
  const [noteOpen, setNoteOpen] = useState(false);
  const [savedNote, setSavedNote] = useState<VisitNote>();
  useEffect(() => { if (id) visitNotesStore.load(id, role).catch(() => {}); }, [id, role.staffId]);
  useCarePlans();
  const { templates } = useVisits();
  const { users } = useServiceUsers();
  const visit = id ? accessibleVisit(id, role) : undefined;
  const client = users.find((u) => u.id === visit?.clientId);
  const template = templates.find((t) => t.id === visit?.templateId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [medDrafts, setMedDrafts] = useState<Record<number, { outcome?: MedicationOutcome; reason: string }>>({});
  if (!visit || !client) return <section className="px-4 py-6"><h1 className="text-2xl font-bold">Visit unavailable</h1><p className="mt-3">This visit was not found or is not assigned to you.</p><Button asChild variant="outline" className="mt-5 min-h-12"><Link to="/app/visits/today">Back to Today</Link></Button></section>;
  const mapUrl = directionsUrl(client);
  const canViewPlan = canViewPersonCarePlan(client.id, role);
  const plan = canViewPlan ? carePlansStore.getCurrentVersion(client.id) : undefined;
  const keyInfo = glanceFromPlan(plan?.status === "published" ? plan : undefined).filter((g) => /communicat|risk/i.test(g.label));
  const raiseConcern = () => navigate("/app/visits/log-event", { state: { visitNotePrefill: { visitId: visit.id, clientId: visit.clientId, text: `Visit ${template ? `${template.windowStart}–${template.windowEnd}` : timestamp(visit.scheduledStart)} with ${clientDisplayName(client)}. ` } } });
  const editable = visit.status === "in_progress";
  const completed = visit.status === "completed";
  const cancelled = visit.status === "cancelled";
  const tasks = visit.log?.tasks ?? visit.taskRecords ?? [];
  const medications = visit.log?.medications ?? visit.medicationRecords ?? [];
  const unsavedMedication = Object.values(medDrafts).some((d) => d.outcome || d.reason);
  const act = (action: () => void) => { setError(""); try { action(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); } };
  async function contextAction() {
    if (!visit) return;
    setBusy(true); setError("");
    try {
      if (!visit.checkInAt) visitsStore.checkIn(visit.id, await browserLocation(), role.staffId);
      else {
        if (unsavedMedication) throw new Error("Save each medication outcome before checking out.");
        if (template?.tasks.some((_, i) => !visit.taskRecords?.some((r) => r.index === i)) || template?.medications.some((_, i) => !visit.medicationRecords?.some((r) => r.index === i))) throw new Error("Record every task and medication before checking out.");
        setNoteOpen(true);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not record this visit."); }
    finally { setBusy(false); }
  }
  return (
    <section className="space-y-6 px-4 py-5" aria-labelledby="visit-heading">
      <Button asChild variant="ghost" className="min-h-12 px-0 text-base"><Link to="/app/visits/today"><ArrowLeft aria-hidden="true" /> Today</Link></Button>
      <div>
        <div className="flex flex-wrap items-center gap-2 text-base font-semibold"><span>{VISIT_STATUS_LABELS[visit.status]}</span><span>·</span><span>{template ? `${template.windowStart}–${template.windowEnd}` : timestamp(visit.scheduledStart)}</span></div>
        <h1 id="visit-heading" className="mt-2 break-words text-3xl font-heading font-bold">{clientDisplayName(client)}</h1>
        {client.preferredName && client.preferredName !== client.name && <p className="mt-1 text-base">{client.name}</p>}
        <p className="mt-3 flex items-start gap-2 text-base leading-relaxed"><MapPin className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />{[client.homeAddress, client.eircode].filter(Boolean).join(" · ") || "Address not recorded"}</p>
        {mapUrl && <Button asChild variant="outline" className="mt-3 min-h-12 w-full border-primary text-base font-semibold text-primary"><a href={mapUrl} target="_blank" rel="noopener noreferrer"><Navigation aria-hidden="true" /> Directions</a></Button>}
        <h3 className="mt-4 text-lg font-bold">Access notes</h3>
        <p className="mt-1 text-base leading-relaxed">{client.accessNotes || "No access notes recorded."}</p>
        {keyInfo.map((item) => <div key={item.label} className="mt-4 flex gap-2 rounded-md border border-warning bg-warning/10 p-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><div><h3 className="text-base font-bold">{item.label}</h3><p className="text-base leading-relaxed">{item.text}</p></div></div>)}
      </div>
      <div className="border-t pt-5">
        <h2 className="text-2xl font-heading font-bold">Before this visit</h2>
        <VisitBrief visitId={visit.id} />
        {canViewPlan && <Button asChild variant="outline" className="mt-3 min-h-12 w-full text-base"><Link to={`/app/care-plans/people/${client.id}`}><FileText aria-hidden="true" /> View care plan</Link></Button>}
      </div>
      <div className="border-t pt-5">
        <h2 className="text-2xl font-heading font-bold">Today’s care</h2>
        {!template?.tasks.length && <p className="mt-3 text-base">No tasks listed for this visit.</p>}
        {template?.tasks.map((task, index) => {
          const record = tasks.filter((r) => r.index === index).at(-1);
          return <fieldset key={index} disabled={!editable} className="mt-5 min-w-0 border-b pb-5">
            <legend className="mb-3 text-lg font-semibold">{task}</legend>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={task}>
              {taskOptions.map((option) => <Button key={option.value} variant={record?.outcome === option.value ? "default" : "outline"} aria-pressed={record?.outcome === option.value} className={`min-h-12 px-1 text-sm whitespace-normal ${completed ? "disabled:opacity-100" : ""}`} onClick={() => act(() => visitsStore.recordTask(visit.id, index, option.value, role.staffId))}>{option.label}</Button>)}
            </div>
          </fieldset>;
        })}
      </div>
      <div className="border-t pt-5">
        <h3 className="text-xl font-heading font-bold">Medication support</h3>
        {!template?.medications.length && <p className="mt-3 text-base">No medications listed for this visit.</p>}
        {template?.medications.map((medication, index) => {
          const record = medications.filter((r) => r.index === index).at(-1);
          const draft = medDrafts[index] ?? { outcome: record?.outcome, reason: record?.reason ?? "" };
          return <fieldset key={index} disabled={!editable} className="mt-5 min-w-0 border-b pb-5">
            <legend className="text-lg font-bold">{medication.name} {medication.dose}</legend>
            <p className="mb-3 mt-1 text-base font-medium">Support: {MEDICATION_SUPPORT_LABELS[medication.supportLevel]}</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={`${medication.name} outcome`}>
              {medicationOptions.map((option) => <Button key={option.value} variant={draft.outcome === option.value ? "default" : "outline"} aria-pressed={draft.outcome === option.value} className={`min-h-12 whitespace-normal text-base ${completed ? "disabled:opacity-100" : ""}`} onClick={() => setMedDrafts((current) => ({ ...current, [index]: { ...draft, outcome: option.value } }))}>{option.label}</Button>)}
            </div>
            <label htmlFor={`med-reason-${index}`} className="mt-4 block text-base font-semibold">Reason / note</label>
            <Textarea id={`med-reason-${index}`} value={draft.reason} className={`mt-2 min-h-24 text-base ${completed ? "disabled:opacity-100" : ""}`} onChange={(e) => setMedDrafts((current) => ({ ...current, [index]: { ...draft, reason: e.target.value } }))} />
            {editable && <Button variant="secondary" className="mt-3 min-h-12 w-full text-base" disabled={!draft.outcome || !draft.reason.trim()} onClick={() => act(() => {
              if (!draft.outcome) return;
              visitsStore.recordMedication(visit.id, index, draft.outcome, draft.reason, role.staffId);
              setMedDrafts((current) => { const next = { ...current }; delete next[index]; return next; });
            })}>Save medication outcome</Button>}
            {record && <p className="mt-2 text-sm">Recorded {timestamp(record.recordedAt)}</p>}
          </fieldset>;
        })}
      </div>
      <div className="space-y-3 border-t pt-5">
        <h2 className="text-2xl font-heading font-bold">Record the visit</h2>
        {error && <p role="alert" className="text-base font-medium text-emergency">{error}</p>}
        {completed ? <p role="status" className="flex items-center gap-2 text-lg font-bold"><Check aria-hidden="true" />{visit.log ? "Visit completed & log recorded" : "Visit completed"}</p> : <Button className="min-h-16 w-full whitespace-normal text-lg font-bold" disabled={busy || cancelled || noteOpen} onClick={contextAction}>{visit.checkInAt ? <LogOut aria-hidden="true" /> : <LogIn aria-hidden="true" />}{busy ? "Recording…" : cancelled ? "Visit cancelled" : visit.checkInAt ? "Finish & log visit" : "Check in"}</Button>}
        {visit.checkInAt && <p className="text-base">Checked in {timestamp(visit.checkInAt)}{visit.checkInLocation ? " · Location recorded" : ""}</p>}
        {visit.checkOutAt && <p className="text-base">Checked out {timestamp(visit.checkOutAt)}</p>}
        {visit.sosEventIds?.map((eventId) => <p key={eventId} className="break-words text-base font-semibold text-emergency">Urgent SOS recorded · {eventId}</p>)}
      </div>
      {noteOpen && <VisitNoteEditor visitId={visit.id} clientId={visit.clientId} onCancel={() => setNoteOpen(false)} onSaved={(note) => { setSavedNote(note); act(() => { visitsStore.checkOut(visit.id, role.staffId); setNoteOpen(false); }); }} />}
      {notes.filter((note) => note.visit_id === visit.id).map((note) => <div key={note.id} className="space-y-3 border-t pt-5"><h2 className="text-2xl font-bold">Human confirmed</h2><p className="text-sm">{STAFF_BY_ID[note.confirmed_by_staff_id]?.name ?? note.confirmed_by_staff_id} · {timestamp(note.confirmed_at)}</p>{NOTE_SECTIONS.map(({ key, label }) => <div key={key}><h3 className="text-lg font-semibold">{label}</h3><p className="whitespace-pre-wrap break-words text-base">{note.final_text[key]}</p></div>)}<details><summary className="min-h-12 cursor-pointer font-semibold">Source / AI draft</summary><p className="whitespace-pre-wrap break-words">{note.transcript}</p><h3 className="mt-4 font-semibold">AI draft</h3><p className="whitespace-pre-wrap break-words">{noteText(note.ai_draft)}</p></details></div>)}
      {savedNote && noteRiskMentions(savedNote.final_text).length > 0 && <div className="space-y-3 border-t pt-5"><h2 className="text-xl font-bold">LogUp suggestion</h2><p className="text-base">This may need follow-up. The note mentions: {noteRiskMentions(savedNote.final_text).join(", ")}. You decide.</p><Button className="min-h-12 w-full" onClick={() => navigate("/app/visits/log-event", { state: { visitNotePrefill: { visitId: visit.id, clientId: visit.clientId, noteId: savedNote.id, text: noteText(savedNote.final_text) } } })}>Raise event or concern</Button><Button variant="ghost" className="min-h-12 w-full" onClick={() => setSavedNote(undefined)}>Not now</Button></div>}
      <div className="border-t pt-5">
        <h2 className="text-2xl font-heading font-bold">Raise event or concern</h2>
        <p className="mt-2 text-base">Something worrying? Open the event form with this visit filled in. You review and submit it.</p>
        <Button variant="destructive" className="mt-3 min-h-14 w-full text-lg font-bold" onClick={raiseConcern}><AlertTriangle aria-hidden="true" /> Raise event or concern</Button>
      </div>
    </section>
  );
}
