import { useEffect, useState } from "react";
import { createParser } from "eventsource-parser";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CareAiSignIn } from "./CareAiSignIn";
import { useRole } from "@/hooks/useRole";
import { careFunction } from "@/lib/careNoteAi";
import { visitBriefSources } from "@/lib/visitBriefSources";
import { carePlansStore } from "@/lib/carePlansStore";
import { incidentsStore } from "@/lib/incidentsStore";
import { visitNotesStore } from "@/lib/visitNotesStore";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { streamSpeech } from "@/lib/audio/streamSpeech";
const cache = new Map<string, string[]>();
const pending = new Map<string, Promise<string[]>>();
async function generate(key: string): Promise<string[]> {
  const saved = cache.get(key); if (saved) return saved;
  const existing = pending.get(key); if (existing) return existing;
  const job = (async () => {
    const response = await careFunction("visit-brief", key, "application/json");
    let lines: string[] | undefined;
    const parser = createParser({ onEvent(event) { const data = JSON.parse(event.data); if (data.type === "error") throw new Error(data.message); if (data.type === "brief.done") lines = data.lines; } });
    const reader = response.body?.getReader(); if (!reader) throw new Error("No summary received.");
    const decoder = new TextDecoder();
    try { while (true) { const { done, value } = await reader.read(); if (done) break; parser.feed(decoder.decode(value, { stream: true })); } parser.feed(decoder.decode()); } finally { reader.releaseLock(); }
    if (!lines || lines.length < 3 || lines.length > 5) throw new Error("No complete summary returned.");
    cache.set(key, lines); return lines;
  })();
  pending.set(key, job); try { return await job; } finally { pending.delete(key); }
}
function SignedInBrief({ visitId }: { visitId: string }) {
  const role = useRole();
  const [key, setKey] = useState(""); const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    let active = true, loaded = false;
    const refresh = () => { if (active && loaded) { try { setKey(JSON.stringify(visitBriefSources(visitId, role))); } catch (e) { setError(e instanceof Error ? e.message : "Sources unavailable."); } } };
    const load = () => visitNotesStore.loadClient(visitId, role).then(() => { loaded = true; refresh(); }).catch((e) => { if (active) { setLoading(false); setError(e.message); } });
    void load();
    const subscriptions = [carePlansStore.subscribe(refresh), incidentsStore.subscribe(refresh), visitNotesStore.subscribe(refresh), serviceUsersStore.subscribe(refresh)];
    const focus = () => { void load(); }; window.addEventListener("focus", focus);
    return () => { active = false; subscriptions.forEach((unsubscribe) => { unsubscribe(); }); window.removeEventListener("focus", focus); };
  }, [visitId, role]);
  useEffect(() => {
    if (!key) return;
    let active = true; setLoading(true); setLines([]); setError("");
    generate(key).then((result) => { if (active) setLines(result); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [key]);
  return <div className="mt-3 space-y-3" aria-busy={loading}>
    {loading && <p role="status" className="text-base">Updating summary…</p>}
    {error && <p role="alert" className="break-words text-base text-destructive">{error}</p>}
    {lines.length > 0 && <><ul className="space-y-2 text-base leading-relaxed">{lines.map((line, i) => <li className="break-words" key={i}>{line}</li>)}</ul><Button variant="outline" className="min-h-12 text-base" disabled={speaking} onClick={async () => { setSpeaking(true); setError(""); try { await streamSpeech("read-visit-brief", lines.join("\n")); } catch (e) { setError(e instanceof Error ? e.message : "Read aloud failed."); } finally { setSpeaking(false); } }}><Volume2 aria-hidden="true" />{speaking ? "Reading aloud…" : "Read aloud"}</Button></>}
  </div>;
}
export function VisitBrief({ visitId }: { visitId: string }) {
  return <div className="mt-4 border-t pt-4"><h2 className="text-lg font-bold">AI summary, check the care plan if unsure</h2><CareAiSignIn><SignedInBrief visitId={visitId} /></CareAiSignIn></div>;
}
