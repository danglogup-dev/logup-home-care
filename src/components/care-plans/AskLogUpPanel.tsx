import { useMemo, useRef, useState } from "react";
import { Sparkles, Mic, MicOff, Check, X, Pencil, ArrowRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { carePlansStore, sectionLabel, sectionKeysForCategories, templateSectionName, type CarePlanVersion } from "@/lib/carePlansStore";
import { proposeCarePlanChanges, type ChangeSet, type ProposedChange } from "@/lib/carePlanAssistant";
import { useAssociatedIncidents } from "@/lib/associatedIncidentsStore";

export const ASK_EXAMPLES = [
  "Use these notes to update Mobility",
  "Rewrite this section in plain language",
  "Summarise changes since last review",
  "Which sections may need review after this event?",
  "Move Communication above Mobility",
];

type CardState = { status: "pending" | "accepted" | "rejected"; editing?: boolean; text?: string };

interface Props {
  personId: string;
  current: CarePlanVersion;
  draft?: CarePlanVersion;
  actor: string;
  actorRole: string;
  focusSectionKey?: string;
  /** Pre-built change set (e.g. Reset to template order). */
  initialChangeSet?: ChangeSet | null;
  compact?: boolean;
}

type SR = { start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; lang: string; interimResults: boolean };

export function buildAssistantInput(personId: string, current: CarePlanVersion, draft: CarePlanVersion | undefined, events: { incidentId: string; eventType: string; subtype: string; occurredAt: string; category: string }[], prompt: string, extra?: { focusSectionKey?: string; resetToTemplate?: boolean }) {
  const label = (s: { key: string; label?: string }) => s.label ?? templateSectionName(personId, s.key) ?? sectionLabel(s);
  const working = draft ?? current;
  const sections = working.sections.map((s) => ({ key: s.key, label: label(s), body: s.body }));
  return {
    prompt,
    sections,
    approvedSections: current.sections.map((s) => ({ key: s.key, label: label(s), body: s.body })),
    approvedVersionNumber: current.versionNumber,
    templateOrder: carePlansStore.templateOrderFor(personId, sections.map((s) => s.key)),
    events: events.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((e) => ({ incidentId: e.incidentId, label: `${e.eventType} — ${e.subtype}`, occurredAt: e.occurredAt, category: e.category })),
    keysForCategories: (c: Parameters<typeof sectionKeysForCategories>[1]) => sectionKeysForCategories(personId, c),
    ...extra,
  };
}

export default function AskLogUpPanel({ personId, current, draft, actor, actorRole, focusSectionKey, initialChangeSet, compact }: Props) {
  const events = useAssociatedIncidents(personId);
  const [prompt, setPrompt] = useState("");
  const [changeSet, setChangeSet] = useState<ChangeSet | null>(initialChangeSet ?? null);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [listening, setListening] = useState(false);
  const recRef = useRef<SR | null>(null);
  const [lastInitial, setLastInitial] = useState(initialChangeSet);
  if (initialChangeSet !== lastInitial) { setLastInitial(initialChangeSet); setChangeSet(initialChangeSet ?? null); setCards({}); }

  const working = draft ?? current;
  const labelOf = useMemo(() => {
    const m = new Map(working.sections.map((s) => [s.key, s.label ?? templateSectionName(personId, s.key)]));
    return (k: string) => m.get(k) ?? k;
  }, [working, personId]);

  const ask = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const cs = proposeCarePlanChanges(buildAssistantInput(personId, current, draft, events, t, { focusSectionKey }));
    setChangeSet(cs);
    setCards({});
  };

  const toggleVoice = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) { toast({ title: "Voice input isn't available in this browser", description: "Type your request instead." }); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = "en-IE"; rec.interimResults = false;
    rec.onresult = (e) => { const said = Array.from(e.results).map((r) => r[0].transcript).join(" "); setPrompt((p) => (p ? `${p} ${said}` : said)); };
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };

  const accept = (c: ProposedChange, edited?: string) => {
    carePlansStore.acceptAssistantChange(personId, c, actor, actorRole, edited);
    setCards((s) => ({ ...s, [c.id]: { status: "accepted" } }));
  };
  const reject = (c: ProposedChange) => {
    carePlansStore.rejectAssistantChange(personId, c, actor, actorRole);
    setCards((s) => ({ ...s, [c.id]: { status: "rejected" } }));
  };
  const pending = changeSet?.changes.filter((c) => (cards[c.id]?.status ?? "pending") === "pending" && !cards[c.id]?.editing) ?? [];

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Ask LogUp</CardTitle>
        <div className="text-xs text-muted-foreground">Proposes changes for you to accept or reject. It never edits the draft by itself.</div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!compact && (
          <div className="flex flex-wrap gap-1.5">
            {ASK_EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setPrompt(ex.startsWith("Use these notes") ? `${ex}: ` : ex)}
                className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent text-left">{ex}</button>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-start">
          <Textarea aria-label="Ask LogUp" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="text-sm min-w-0"
            placeholder="e.g. Use these notes to update Mobility: now uses a walking frame…"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(prompt); } }} />
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button size="icon" variant="outline" aria-label={listening ? "Stop voice input" : "Speak"} onClick={toggleVoice}>{listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</Button>
            <Button size="icon" aria-label="Ask" onClick={() => ask(prompt)} disabled={!prompt.trim()}><Send className="h-4 w-4" /></Button>
          </div>
        </div>

        {changeSet && (
          <div className="space-y-2" aria-label="Proposed changes">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">Proposed changes{changeSet.changes.length ? ` (${changeSet.changes.length})` : ""}</div>
              {pending.length > 1 && <Button size="sm" variant="outline" onClick={() => pending.forEach((c) => accept(c))}><Check className="h-3.5 w-3.5 mr-1" /> Accept all</Button>}
            </div>
            {changeSet.message && <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">{changeSet.message}</div>}
            {changeSet.changes.map((c) => {
              const st = cards[c.id] ?? { status: "pending" as const };
              const isOrder = c.kind === "section_moved";
              return (
                <div key={c.id} className={`rounded-md border p-3 space-y-2 ${st.status === "accepted" ? "border-emerald-300 bg-emerald-50/40" : st.status === "rejected" ? "opacity-60" : "bg-card"}`}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">{c.origin === "ai" ? "AI draft" : "LogUp suggestion"}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{c.kind === "section_updated" ? "Section updated" : c.kind === "section_moved" ? "Section moved" : c.kind === "section_added" ? "Section added" : "Note added"}</Badge>
                    <span className="text-sm font-medium min-w-0">{c.title}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">Source: {c.source.label}{c.source.refId ? ` (${c.source.refId})` : ""}{c.source.excerpt ? ` — “${c.source.excerpt}”` : ""}</div>
                  {isOrder ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-muted px-2 py-1">{c.before}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                      <span className="rounded bg-primary/10 px-2 py-1">{c.after}</span>
                    </div>
                  ) : st.editing ? (
                    <Textarea aria-label="Edit proposed text" value={st.text ?? c.after ?? ""} rows={5} className="text-sm"
                      onChange={(e) => setCards((s) => ({ ...s, [c.id]: { ...st, text: e.target.value } }))} />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="rounded bg-muted/50 p-2"><div className="text-[10px] uppercase text-muted-foreground mb-1">Before</div><div className="whitespace-pre-wrap">{c.before || "—"}</div></div>
                      <div className="rounded bg-primary/5 p-2"><div className="text-[10px] uppercase text-muted-foreground mb-1">After</div><div className="whitespace-pre-wrap">{c.after}</div></div>
                    </div>
                  )}
                  {st.status === "pending" ? (
                    <div className="flex flex-wrap gap-2">
                      {st.editing ? (
                        <>
                          <Button size="sm" onClick={() => accept(c, st.text ?? c.after)}><Check className="h-3.5 w-3.5 mr-1" /> Accept edited text</Button>
                          <Button size="sm" variant="ghost" onClick={() => setCards((s) => ({ ...s, [c.id]: { status: "pending" } }))}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => accept(c)}><Check className="h-3.5 w-3.5 mr-1" /> Accept</Button>
                          {!isOrder && <Button size="sm" variant="outline" onClick={() => setCards((s) => ({ ...s, [c.id]: { status: "pending", editing: true, text: c.after } }))}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>}
                          <Button size="sm" variant="ghost" onClick={() => reject(c)}><X className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs font-medium">{st.status === "accepted" ? `Accepted by ${actor} — added to the draft` : `Rejected by ${actor} — draft unchanged`}</div>
                  )}
                </div>
              );
            })}
            {changeSet.unchanged.length > 0 && changeSet.changes.length > 0 && (
              <div className="text-xs text-muted-foreground"><span className="font-medium">No change:</span> {changeSet.unchanged.map(labelOf).join(", ")}</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
