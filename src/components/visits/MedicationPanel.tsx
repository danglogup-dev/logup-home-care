import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CareAiSignIn } from "./CareAiSignIn";
import { medicationStore, type MedicationTask, type VisitMedicationData } from "@/lib/medicationStore";
import { CONTROLLED_TEST_NOTICE, currentOutcome, OUTCOME_LABELS, permittedOutcomes, reasonRequired, validateOutcome, type MedicationOutcome } from "@/lib/medicationRules";
import { STAFF_BY_ID } from "@/lib/demoDataRegistry";

const localInput = (iso = new Date().toISOString()) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const displayTime = (iso: string) => new Date(iso).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
type Draft = { outcome?: MedicationOutcome; reason: string; eventAt: string; correctionReason: string; correcting: boolean };

function MedicationRecords({ visitId, expected, editable, onChange }: { visitId: string; expected: boolean; editable: boolean; onChange?: (data: VisitMedicationData) => void }) {
  const [data, setData] = useState<VisitMedicationData>();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const keys = useRef(new Map<string, string>());
  const load = useCallback(async () => {
    try { const next = await medicationStore.loadVisit(visitId); setData(next); onChange?.(next); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load medication records."); }
  }, [visitId, onChange]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener("online", update); window.addEventListener("offline", update); return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); }; }, []);
  if (!data && !error) return <p className="text-base">Loading authorised medication tasks…</p>;
  if (error) return <div role="alert" className="space-y-3 text-base"><p className="text-destructive">{error}</p><Button variant="outline" className="min-h-12" onClick={load}>Try again</Button></div>;
  if (!data?.tasks.length) return expected ? <p className="rounded-md border border-warning bg-warning/10 p-3 text-base">Medication appears in the visit schedule, but no authorised eMAR task is available. Do not use the old visit log as an eMAR; contact a manager.</p> : null;
  const draftFor = (task: MedicationTask): Draft => drafts[task.id] ?? { reason: "", eventAt: localInput(), correctionReason: "", correcting: false };
  const update = (taskId: string, patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [taskId]: { ...(all[taskId] ?? { reason: "", eventAt: localInput(), correctionReason: "", correcting: false }), ...patch } }));
  const submit = async (task: MedicationTask) => {
    const draft = draftFor(task); const record = currentOutcome(data.outcomes, task.id);
    const validation = validateOutcome({ support: task.instruction.support_level, canAdminister: data.access.can_administer, outcome: draft.outcome, reason: draft.reason, eventAt: new Date(draft.eventAt).toISOString() });
    if (validation) { setError(validation); return; }
    if (draft.correcting && !draft.correctionReason.trim()) { setError("Explain why this record needs correction."); return; }
    const key = `${task.id}:${draft.correcting ? record?.id : "original"}`;
    const idempotencyKey = keys.current.get(key) ?? crypto.randomUUID(); keys.current.set(key, idempotencyKey);
    setBusy(task.id); setError("");
    try {
      await medicationStore.submit({ taskId: task.id, visitId, outcome: draft.outcome!, eventAt: new Date(draft.eventAt).toISOString(), reason: draft.reason, idempotencyKey, correctionOf: draft.correcting ? record?.id : undefined, correctionReason: draft.correcting ? draft.correctionReason : undefined });
      await load(); setDrafts((all) => { const next = { ...all }; delete next[task.id]; return next; });
    } catch (e) { setError(e instanceof Error ? e.message : "Not saved. Try again using the same information."); }
    finally { setBusy(""); }
  };
  return <div className="space-y-5">
    <p className="rounded-md border border-warning bg-warning/10 p-3 text-sm">{CONTROLLED_TEST_NOTICE}</p>
    {!online && <p role="alert" className="rounded-md border border-destructive p-3 text-base font-semibold text-destructive">You are offline. Nothing entered here is saved. Use your provider-approved downtime procedure.</p>}
    {data.tasks.map((task) => {
      const record = currentOutcome(data.outcomes, task.id); const draft = draftFor(task); const exceptions = data.exceptions.filter((e) => e.task_id === task.id && e.status !== "resolved");
      return <article key={task.id} className="rounded-lg border bg-card p-4" aria-labelledby={`med-${task.id}`}>
        <div className="flex items-start gap-3"><Pill className="mt-1 h-6 w-6 shrink-0" aria-hidden="true" /><div><h3 id={`med-${task.id}`} className="text-xl font-bold">{task.medication.name} · {task.medication.strength}</h3><p className="mt-1 text-base">{task.instruction.dose} · {task.instruction.route} · {task.instruction.regularity === "prn" ? "PRN" : task.instruction.frequency}</p></div></div>
        <dl className="mt-3 space-y-1 text-base"><div><dt className="inline font-semibold">Authorised support: </dt><dd className="inline capitalize">{task.instruction.support_level}</dd></div><div><dt className="inline font-semibold">Instructions: </dt><dd className="inline">{task.instruction.provider_instructions}</dd></div><div><dt className="inline font-semibold">Source: </dt><dd className="inline">{task.instruction.source_document}</dd></div><div><dt className="inline font-semibold">Instruction version: </dt><dd className="inline">{task.instruction.version_number}</dd></div></dl>
        {record && <div className="mt-4 rounded-md border border-success bg-success/10 p-3"><p className="flex items-center gap-2 text-base font-bold"><Check aria-hidden="true" />Saved to medication record</p><p className="mt-1 text-base">{OUTCOME_LABELS[record.outcome]}</p><p className="mt-1 text-sm">Activity {displayTime(record.event_at)} · submitted {displayTime(record.submitted_at)} by {STAFF_BY_ID[record.staff_id as keyof typeof STAFF_BY_ID]?.name ?? record.staff_id}</p>{record.correction_of && <p className="mt-1 text-sm">Traceable correction · {record.correction_reason}</p>}</div>}
        {exceptions.map((exception) => <div key={exception.id} className="mt-3 rounded-md border border-warning bg-warning/10 p-3"><p className="flex items-start gap-2 text-base font-bold"><AlertTriangle aria-hidden="true" />{exception.kind === "refusal" ? "Refusal exception recorded" : exception.kind === "not_completed" ? "Uncompleted task exception recorded" : exception.kind === "discrepancy" ? "Correction requires review" : "Outcome requires review"}</p><p className="mt-1 text-sm">Follow your provider’s escalation procedure now. This screen is not manager acknowledgement.</p></div>)}
        {editable && <fieldset className="mt-4" disabled={busy === task.id || !online}>
          <legend className="text-base font-semibold">{record ? "Record a traceable correction" : "Manually record the outcome"}</legend>
          {record && <label className="mt-2 flex min-h-12 items-center gap-3 text-base"><input type="checkbox" className="h-6 w-6" checked={draft.correcting} onChange={(e) => update(task.id, { correcting: e.target.checked })} />Correct this record</label>}
          {(!record || draft.correcting) && <>
            <div className="mt-3 grid gap-2" role="group" aria-label={`${task.medication.name} outcome`}>
              {permittedOutcomes(task.instruction.support_level, data.access.can_administer).map((outcome) => <Button key={outcome} type="button" variant={draft.outcome === outcome ? "default" : "outline"} aria-pressed={draft.outcome === outcome} className="min-h-14 whitespace-normal text-left text-base" onClick={() => update(task.id, { outcome })}>{OUTCOME_LABELS[outcome]}</Button>)}
            </div>
            <label className="mt-4 block text-base font-semibold" htmlFor={`event-${task.id}`}>Actual activity time</label>
            <Input id={`event-${task.id}`} type="datetime-local" className="mt-2 min-h-12 text-base" value={draft.eventAt} onChange={(e) => update(task.id, { eventAt: e.target.value })} />
            <label className="mt-4 block text-base font-semibold" htmlFor={`reason-${task.id}`}>Reason / explanatory observation{draft.outcome && reasonRequired(draft.outcome) ? " (required)" : ""}</label>
            <Textarea id={`reason-${task.id}`} className="mt-2 min-h-24 text-base" value={draft.reason} onChange={(e) => update(task.id, { reason: e.target.value })} />
            {draft.correcting && <><label className="mt-4 block text-base font-semibold" htmlFor={`correction-${task.id}`}>Why is this correction needed? (required)</label><Textarea id={`correction-${task.id}`} className="mt-2 min-h-24 text-base" value={draft.correctionReason} onChange={(e) => update(task.id, { correctionReason: e.target.value })} /></>}
            <Button className="mt-4 min-h-14 w-full text-base" disabled={busy === task.id || !online} onClick={() => submit(task)}>{busy === task.id ? "Saving securely…" : record ? "Submit correction" : "Save medication outcome"}</Button>
          </>}
        </fieldset>}
      </article>;
    })}
    {error && <p role="alert" className="text-base font-semibold text-destructive">{error}</p>}
  </div>;
}

export function MedicationPanel(props: { visitId: string; expected: boolean; editable: boolean; onChange?: (data: VisitMedicationData) => void }) {
  if (!props.expected) return null;
  return <section className="space-y-4 border-t pt-5" aria-labelledby="medication-heading"><h2 id="medication-heading" className="text-2xl font-heading font-bold">Medication</h2><CareAiSignIn title="Sign in for authorised medication records"><MedicationRecords {...props} /></CareAiSignIn></section>;
}
