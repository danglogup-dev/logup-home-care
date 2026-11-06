import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/hooks/useRole";
import { NOTE_SECTIONS, noteText, type StructuredVisitNote } from "@/lib/visitNoteRules";
import { CareVoiceRecorder } from "@/components/visits/CareVoiceRecorder";
import { draftVisitNote } from "@/lib/careNoteAi";
import { visitNotesStore, type VisitNote } from "@/lib/visitNotesStore";
import { useLogUpSession } from "@/hooks/useLogUpSession";
import { simulateDemoNoteDraft, demoMissingQuestions } from "@/lib/demoVisitNote";

export function VisitNoteEditor({ visitId, clientId, onSaved, onCancel }: { visitId: string; clientId: string; onSaved: (note: VisitNote) => void; onCancel: () => void }) {
  const role = useRole(); const [source, setSource] = useState<"voice" | "text" | null>(null); const [audio, setAudio] = useState<File>(); const [transcript, setTranscript] = useState("");
  const [note, setNote] = useState<StructuredVisitNote>(); const [questions, setQuestions] = useState<string[]>([]); const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draftId, setDraftId] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const { session } = useLogUpSession(); const demo = !session; const [demoDraft, setDemoDraft] = useState<StructuredVisitNote>();
  const draft = async (text: string, kind: "voice" | "text") => {
    setBusy(true); setError("");
    if (demo) { const simulated = simulateDemoNoteDraft(text); setNote(simulated); setDemoDraft(simulated); setQuestions(demoMissingQuestions(text)); setAnswers({}); setBusy(false); return; }
    try { const result = await draftVisitNote({ visitId, clientId, transcript: text, sourceKind: kind }); setNote(result.note); setQuestions(result.note.questions ?? []); setAnswers({}); setDraftId(result.draftId); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not draft note."); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!note) return;
    const answerLines = questions.flatMap((question) => { const answer = answers[question]?.trim(); return answer ? [`${question} ${answer}`] : []; });
    setBusy(true); setError("");
    const withAnswers = { ...note, followUp: [note.followUp === "Not recorded" && answerLines.length ? "" : note.followUp, answerLines.length ? `Missing-information answers:\n${answerLines.join("\n")}` : ""].filter(Boolean).join("\n\n") };
    if (demo) { try { onSaved(visitNotesStore.confirmDemo(visitId, transcript, demoDraft ?? note, withAnswers, role)); } catch (e) { setError(e instanceof Error ? e.message : "Could not save note."); } finally { setBusy(false); } return; }
    try { onSaved(await visitNotesStore.confirm(visitId, draftId, { ...note, followUp: [note.followUp === "Not recorded" && answerLines.length ? "" : note.followUp, answerLines.length ? `Missing-information answers:\n${answerLines.join("\n")}` : ""].filter(Boolean).join("\n\n") }, true, role)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save note."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4" aria-labelledby="visit-note-heading"><h3 id="visit-note-heading" className="text-xl font-bold">Record the visit</h3>
    {demo && <p className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm"><strong>Fictional demo · simulated draft.</strong> No AI is used: your own words are sorted into sections, and questions are suggested for anything not mentioned. Nothing is saved until you confirm. The confirmed note is shown to managers in this demo session and is cleared when the page reloads.</p>}
    {!note && <div className="grid grid-cols-2 gap-2"><Button variant={source === "voice" ? "default" : "outline"} className="min-h-12" onClick={() => { setSource("voice"); setNote(undefined); }}>Speak</Button><Button variant={source === "text" ? "default" : "outline"} className="min-h-12" onClick={() => { setSource("text"); setNote(undefined); }}>Type</Button></div>}
    {source === "voice" && !note && <CareVoiceRecorder onRecorded={setAudio} onTranscript={async (text) => { setTranscript(text); await draft(text, "voice"); }} />}
    {source === "text" && !note && <><Label className="text-base">What happened?<Textarea className="mt-2 min-h-32 text-base" value={transcript} onChange={(e) => setTranscript(e.target.value)} /></Label><Button disabled={busy || !transcript.trim()} onClick={() => draft(transcript, "text")}>{demo ? "Draft note (simulated demo)" : "Draft note with AI"}</Button></>}
    {error && <div className="space-y-2"><p role="alert" className="text-base text-destructive">{error}</p>{source === "voice" && audio && <Button variant="outline" onClick={async () => { const { transcribeCareAudio } = await import("@/lib/careNoteAi"); try { setError(""); const text = await transcribeCareAudio(audio); setTranscript(text); await draft(text, "voice"); } catch (e) { setError(e instanceof Error ? e.message : "Retry failed."); } }}>Retry saved audio</Button>}</div>}
    {note && <><p className="text-sm font-semibold">{demo ? "Simulated draft · review every section; only you can confirm care." : "AI draft · review every section; the AI cannot confirm care."}</p><Label className="text-base">Source transcript<Textarea className="mt-2 text-base" value={transcript} readOnly /></Label>{NOTE_SECTIONS.map(({ key, label }) => <Label key={key} className="text-base">{label}<Textarea className="mt-2 min-h-24 text-base" value={note[key]} onChange={(e) => setNote({ ...note, [key]: e.target.value })} /></Label>)}
      {questions.length > 0 && <div data-testid="missing-info" className="space-y-3 rounded-md border p-3"><h4 className="font-bold">Missing information to consider</h4><p className="text-sm">These are questions, not answers or evidence. Add only what you actually observed or were told.</p>{questions.map((question) => <Label key={question} className="text-base">{question}<Textarea className="mt-2 text-base" value={answers[question] ?? ""} onChange={(e) => setAnswers((all) => ({ ...all, [question]: e.target.value }))} /></Label>)}</div>}
      <p className="whitespace-pre-wrap break-words text-sm">Confirmed note preview: {noteText(note)}</p><div className="grid gap-2"><Button className="min-h-12 text-base" disabled={busy || NOTE_SECTIONS.some(({ key }) => !note[key].trim())} onClick={save}>{busy ? "Saving…" : demo ? "Confirm note (demo only)" : "Confirm & save note"}</Button><Button variant="outline" onClick={onCancel}>Cancel</Button></div></>}
  </section>;
}
