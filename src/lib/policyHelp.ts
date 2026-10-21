import { useSyncExternalStore } from "react";
import { policiesStore } from "./policiesStore";
import { canAccess, canViewPublishedPolicy, type PolicyLike, type RoleState } from "./roleStore";

/** One section of a current, approved, published policy version. */
export interface PolicySource {
  sourceId: string; // `${versionId}#${index}` — ties every answer to the exact version
  docId: string;
  versionId: string;
  title: string;
  versionNumber: string;
  section: string;
  text: string;
}
export interface PolicyHelpStep { text: string; sourceId: string }
export interface PolicyHelpAnswer {
  found: boolean;
  mode: "ai" | "excerpt";
  primary?: PolicySource;
  steps: PolicyHelpStep[];
  alsoRelevant: PolicySource[];
  possibleConflict: boolean;
  safety: boolean;
}
export const NOT_FOUND_MESSAGE = "I couldn’t find this in your organisation’s approved policies.";
export const SAFETY_MESSAGE = "If there is an immediate risk to anyone’s safety, follow your organisation’s emergency / escalation procedure.";
export const CONFLICT_MESSAGE = "More than one policy may apply. Review the sources or contact your manager.";

const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&rsquo;/g, "’").replace(/&quot;/g, '"');
const strip = (html: string) => decode(html.replace(/<li[^>]*>/gi, "\n- ").replace(/<\/(p|h3|ul|ol)>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

export function splitPolicySections(html: string): { section: string; text: string }[] {
  return html.split(/<h2[^>]*>/i).slice(1).map((part) => {
    const [heading, ...rest] = part.split(/<\/h2>/i);
    return { section: strip(heading), text: strip(rest.join(" ")) };
  }).filter((s) => s.text);
}

/** Only the current live version of each policy, only when it is published, only if this role may read it. */
export function approvedPolicySources(role: RoleState): PolicySource[] {
  if (role.role === "external" || !canAccess("policies.library", role.role)) return [];
  return policiesStore.list().flatMap((doc) => {
    const v = policiesStore.getLiveVersion(doc.id);
    if (!v || v.status !== "published" || v.docId !== doc.id) return [];
    if (!canViewPublishedPolicy(doc as PolicyLike, role)) return [];
    return splitPolicySections(v.bodyHtml).map((s, i) => ({ sourceId: `${v.id}#${i}`, docId: doc.id, versionId: v.id, title: doc.title, versionNumber: v.versionNumber, ...s }));
  });
}

const STOP = new Set("a an the i do what if how should can is are was to of in on for at my me we it and or with when who be have has this that there their they nobody not any".split(" "));
const SYNONYMS: Record<string, string[]> = {
  door: ["access", "answer"], answer: ["access", "door"], answers: ["access", "door"], fell: ["fall"], floor: ["fall"], tablet: ["medication"], tablets: ["medication"], meds: ["medication"], medicine: ["medication"],
  abuse: ["safeguard"], neglect: ["safeguard"], hurt: ["injury"], complain: ["complaint"], complaining: ["complaint"], wash: ["hygiene"], hands: ["hygiene"], missed: ["miss"], late: ["miss"],
};
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");
export function queryTerms(q: string): string[] {
  const words = q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words.flatMap((w) => [w, ...(SYNONYMS[w] ?? [])]).map(stem))];
}
/** Deterministic retrieval over approved sources; returns the best sections, highest first. */
export function retrievePolicySources(question: string, sources: PolicySource[], limit = 6): (PolicySource & { score: number })[] {
  const terms = queryTerms(question);
  if (!terms.length) return [];
  return sources.map((s) => {
    const head = `${s.title} ${s.section}`.toLowerCase(); const body = s.text.toLowerCase();
    const score = terms.reduce((n, t) => n + (head.includes(t) ? 2 : 0) + (body.includes(t) ? 1 : 0), 0);
    return { ...s, score };
  }).filter((s) => s.score >= 2).sort((a, b) => b.score - a.score || a.sourceId.localeCompare(b.sourceId)).slice(0, limit);
}

const SAFETY = /emergenc|unconscious|not breathing|breathing|chest pain|bleed|abuse|assault|threat|unsafe|aggress|danger|suicid|self.?harm|on the floor|found on|fire|smell gas|gas leak|chok|safeguard|attack|violen|stroke|collapse/i;
export const isSafetyQuestion = (q: string) => SAFETY.test(q);

/** Accept an AI result only if every cited source is one we supplied; otherwise treat as no source. */
export function validateAiAnswer(raw: { found: boolean; primarySourceId: string; steps: PolicyHelpStep[]; alsoRelevantSourceIds: string[]; possibleConflict: boolean }, supplied: PolicySource[], question: string): PolicyHelpAnswer {
  const byId = new Map(supplied.map((s) => [s.sourceId, s]));
  const safety = isSafetyQuestion(question);
  const primary = byId.get(raw.primarySourceId);
  const steps = raw.steps.filter((s) => s.text.trim() && byId.has(s.sourceId)).slice(0, 6);
  if (!raw.found || !primary || !steps.length || steps.length !== raw.steps.filter((s) => s.text.trim()).length)
    return { found: false, mode: "ai", steps: [], alsoRelevant: [], possibleConflict: false, safety };
  const seen = new Set([primary.docId]);
  const alsoRelevant = [...raw.alsoRelevantSourceIds, ...steps.map((s) => s.sourceId)].map((id) => byId.get(id)).filter((s): s is PolicySource => !!s && !seen.has(s.docId) && !!seen.add(s.docId));
  return { found: true, mode: "ai", primary, steps, alsoRelevant, possibleConflict: raw.possibleConflict, safety };
}

/** Signed-out fallback: verbatim lines from the best matching section, never generated text. */
export function excerptAnswer(question: string, sources: PolicySource[]): PolicyHelpAnswer {
  const ranked = retrievePolicySources(question, sources);
  const safety = isSafetyQuestion(question);
  const top = ranked[0];
  if (!top) return { found: false, mode: "excerpt", steps: [], alsoRelevant: [], possibleConflict: false, safety };
  const lines = top.text.split("\n").map((l) => l.replace(/^- /, "").trim()).filter(Boolean).slice(0, 5);
  const seen = new Set([top.docId]);
  const alsoRelevant = ranked.slice(1).filter((s) => !seen.has(s.docId) && !!seen.add(s.docId)).slice(0, 3);
  const possibleConflict = !!ranked[1] && ranked[1].docId !== top.docId && ranked[1].score === top.score;
  return { found: true, mode: "excerpt", primary: top, steps: lines.map((text) => ({ text, sourceId: top.sourceId })), alsoRelevant, possibleConflict, safety };
}

// ---------- Basic audit: who asked, when, the question, which source version, found or not. No answers or chat history. ----------
export interface PolicyHelpAuditEntry { id: string; staffId: string; at: string; question: string; sourceDocId?: string; sourceVersionId?: string; sourceVersionNumber?: string; sourceFound: boolean }
let audit: PolicyHelpAuditEntry[] = [];
const listeners = new Set<() => void>();
export const policyHelpAudit = {
  record(entry: Omit<PolicyHelpAuditEntry, "id" | "at">, at = new Date().toISOString()) {
    audit = [{ ...entry, question: entry.question.slice(0, 500), id: `PH-${audit.length + 1}`, at }, ...audit];
    listeners.forEach((l) => l());
  },
  list: () => audit,
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  reset() { audit = []; },
};
export const usePolicyHelpAudit = () => useSyncExternalStore(policyHelpAudit.subscribe, policyHelpAudit.list, policyHelpAudit.list);
export function auditFor(staffId: string, question: string, a: PolicyHelpAnswer) {
  policyHelpAudit.record({ staffId, question, sourceFound: a.found, sourceDocId: a.primary?.docId, sourceVersionId: a.primary?.versionId, sourceVersionNumber: a.primary?.versionNumber });
}
