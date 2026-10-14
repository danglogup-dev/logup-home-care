import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordWav } from "@/lib/audio/recordWav";
import { transcribeCareAudio } from "@/lib/careNoteAi";
import { CareAiSignIn } from "./CareAiSignIn";
export function CareVoiceRecorder({ onTranscript, disabled = false }: { onTranscript: (text: string) => void; disabled?: boolean }) {
  const recorder = useRef<Awaited<ReturnType<typeof recordWav>>>(); const timer = useRef<ReturnType<typeof setInterval>>(); const mounted = useRef(true);
  const [recording, setRecording] = useState(false); const [seconds, setSeconds] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearInterval(timer.current); const current = recorder.current; recorder.current = undefined; current?.stop().catch(() => {}); }; }, []);
  async function stop() {
    const current = recorder.current; if (!current) return; recorder.current = undefined; clearInterval(timer.current); setRecording(false); setBusy(true);
    try { const text = await transcribeCareAudio(await current.stop()); if (mounted.current) onTranscript(text); } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Could not transcribe."); } finally { if (mounted.current) setBusy(false); }
  }
  async function start() {
    setBusy(true); setError("");
    try { const current = await recordWav(); if (!mounted.current) { await current.stop(); return; } recorder.current = current; setSeconds(0); setRecording(true); let elapsed = 0; timer.current = setInterval(() => { elapsed++; setSeconds(elapsed); if (elapsed >= 90) void stop(); }, 1000); } catch (e) { setError(e instanceof Error ? e.message : "Microphone unavailable. Type instead."); } finally { setBusy(false); }
  }
  return <CareAiSignIn><div className="space-y-2"><Button type="button" variant={recording ? "destructive" : "outline"} disabled={busy || disabled} className="min-h-12 w-full whitespace-normal" onClick={() => recording ? void stop() : void start()}>{recording ? <Square /> : <Mic />}{recording ? `Stop · ${seconds}s / 90s` : busy ? "Transcribing…" : "Record voice"}</Button>{error && <p role="alert" className="break-words text-destructive">{error}</p>}</div></CareAiSignIn>;
}