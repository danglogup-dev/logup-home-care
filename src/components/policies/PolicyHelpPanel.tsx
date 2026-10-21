import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, Phone, Search, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/hooks/useRole";
import { supabase } from "@/integrations/supabase/client";
import { policiesStore } from "@/lib/policiesStore";
import { askPolicyHelp } from "@/lib/careNoteAi";
import {
  approvedPolicySources, auditFor, excerptAnswer, retrievePolicySources, validateAiAnswer, isSafetyQuestion,
  CONFLICT_MESSAGE, NOT_FOUND_MESSAGE, SAFETY_MESSAGE, type PolicyHelpAnswer, type PolicySource,
} from "@/lib/policyHelp";

function usePolicyRevision() {
  const [rev, setRev] = useState(0);
  useEffect(() => policiesStore.subscribe(() => setRev((r) => r + 1)), []);
  return rev;
}

export function PolicyHelpPanel({ onSearch }: { onSearch?: (q: string) => void }) {
  const role = useRole();
  const rev = usePolicyRevision();
  // Recomputed whenever a policy is published or archived, so superseded versions drop out automatically.
  const sources = useMemo(() => approvedPolicySources(role), [role, rev]);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState<PolicyHelpAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);
  // A displayed answer whose source version is no longer live is withdrawn.
  const stale = !!answer?.primary && !sources.some((s) => s.versionId === answer.primary?.versionId);

  const ask = async () => {
    const q = question.trim(); if (q.length < 2 || busy) return;
    setBusy(true); setError(""); setAnswer(null); setAsked(q);
    try {
      let result: PolicyHelpAnswer;
      if (signedIn) {
        const supplied: PolicySource[] = retrievePolicySources(q, sources, 8).map(({ score: _s, ...s }) => s);
        result = supplied.length ? validateAiAnswer(await askPolicyHelp(q, supplied), supplied, q)
          : { found: false, mode: "ai", steps: [], alsoRelevant: [], possibleConflict: false, safety: isSafetyQuestion(q) };
      } else result = excerptAnswer(q, sources);
      auditFor(role.staffId, q, result);
      setAnswer(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Policy Help failed."); }
    finally { setBusy(false); }
  };

  return (
    <section aria-labelledby="policy-help-heading" className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <h2 id="policy-help-heading" className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Ask Policy Help</h2>
        <p className="text-sm text-muted-foreground">Answers come only from your organisation’s current approved policies.</p>
      </div>
      <div className="flex gap-2 items-start">
        <Textarea aria-label="Your question" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} className="min-w-0 text-base"
          placeholder="e.g. What do I do if nobody answers the door?"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
        <Button size="icon" className="h-12 w-12 shrink-0" aria-label="Ask" disabled={busy || question.trim().length < 2} onClick={ask}><Send className="h-5 w-5" /></Button>
      </div>
      {!signedIn && <p className="text-xs text-muted-foreground">Sign in for an AI summary. Until then you’ll see the matching wording from the policy.</p>}
      {busy && <p className="text-sm" role="status">Checking approved policies…</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {answer && (
        <div className="space-y-3 border-t pt-3" aria-live="polite">
          {answer.safety && (
            <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" aria-hidden="true" />{SAFETY_MESSAGE}
            </div>
          )}
          {!answer.found || !answer.primary || stale ? (
            <div className="space-y-3">
              <p className="text-base font-medium">{stale ? "This policy has been updated. Ask again to use the current version." : NOT_FOUND_MESSAGE}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {onSearch ? <Button variant="outline" className="min-h-12" onClick={() => onSearch(asked)}><Search className="h-4 w-4" /> Search policies</Button>
                  : <Button asChild variant="outline" className="min-h-12"><Link to="/app/policies/library"><Search className="h-4 w-4" /> Search policies</Link></Button>}
                <p className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 shrink-0" aria-hidden="true" /> Contact your manager or on-call person.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">{answer.mode === "ai" ? "AI summary from approved policy" : "Wording from approved policy"}</div>
              <p className="text-base">According to your {answer.primary.title}:</p>
              <ol className="list-decimal space-y-1.5 pl-5 text-base leading-relaxed">
                {answer.steps.map((s, i) => <li key={i} className="break-words">{s.text}</li>)}
              </ol>
              {answer.possibleConflict && <p className="rounded-md border bg-muted/50 p-2 text-sm font-medium">{CONFLICT_MESSAGE}</p>}
              <SourceLine source={answer.primary} />
              <p className="text-xs text-muted-foreground">Check the source policy if unsure. This is not a formal policy decision.</p>
              {answer.alsoRelevant.length > 0 && (
                <div className="space-y-1">
                  <div className="text-sm font-semibold">Also relevant</div>
                  <ul className="space-y-1">{answer.alsoRelevant.map((s) => <li key={s.sourceId}><Link className="text-sm underline underline-offset-2" to={`/app/policies/${s.docId}`}>{s.title} · Version {s.versionNumber}{s.section ? ` · ${s.section}` : ""}</Link></li>)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SourceLine({ source }: { source: PolicySource }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
      <div className="text-xs uppercase text-muted-foreground">Source</div>
      <div className="font-medium">{source.title}</div>
      <div>Version {source.versionNumber}{source.section ? ` · ${source.section}` : ""}</div>
      <Button asChild variant="link" className="h-auto p-0"><Link to={`/app/policies/${source.docId}`}><BookOpen className="h-4 w-4" /> Open policy</Link></Button>
    </div>
  );
}
