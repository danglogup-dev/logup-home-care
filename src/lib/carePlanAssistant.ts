// Ask LogUp — care plan assistant.
//
// The assistant never edits a care plan. It returns a ChangeSet of proposals;
// a person accepts, edits or rejects each one, and only accepted changes enter
// the draft (see carePlansStore.acceptAssistantChange).
//
// For the prototype the "AI" is simulated with rule-based text, in the same
// spirit as incidentDrafting.ts. Everything goes through proposeCarePlanChanges
// so a real model can replace it later without touching the UI.

import { CATEGORY_RULES } from "./carePlanReviewRules";
import type { SectionCategory } from "./carePlanTemplateModel";

export type ChangeKind = "section_updated" | "section_moved" | "section_added" | "note_added";

export interface ChangeSource {
  kind: "notes" | "event" | "assessment" | "plan" | "template";
  label: string;
  excerpt?: string;
  refId?: string;
}

export interface ProposedChange {
  id: string;
  prompt: string;
  kind: ChangeKind;
  /** "ai" = simulated model output (labelled AI draft); "rules" = fixed LogUp rules (labelled LogUp suggestion). */
  origin: "ai" | "rules";
  title: string;
  sectionKey?: string;
  sectionLabel?: string;
  before?: string;
  after?: string;
  previousOrder?: string[];
  proposedOrder?: string[];
  resetToTemplate?: boolean;
  source: ChangeSource;
  sourceLabel: string;
}

export interface ChangeSet {
  id: string;
  prompt: string;
  createdAt: string;
  changes: ProposedChange[];
  /** Section keys the assistant did not touch. */
  unchanged: string[];
  /** Shown when nothing could be proposed. */
  message?: string;
}

export interface AssistantSection { key: string; label: string; body: string }

export interface AssistantEvent { incidentId: string; label: string; occurredAt: string; category: string }

export interface AssistantInput {
  prompt: string;
  /** Sections of the working draft (or the approved plan when no draft exists), in order. */
  sections: AssistantSection[];
  /** Sections of the current approved version. */
  approvedSections: AssistantSection[];
  approvedVersionNumber: number;
  /** Template order of the section keys. */
  templateOrder: string[];
  events: AssistantEvent[];
  /** Map standard categories onto this person's section keys. */
  keysForCategories: (cats: SectionCategory[]) => string[];
  /** Section the user is currently editing, if any. */
  focusSectionKey?: string;
  /** Ask for "reset to template order" without a typed prompt. */
  resetToTemplate?: boolean;
}

let seq = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const ALIASES: Record<string, string[]> = {
  about: ["about me", "what matters"],
  communication: ["communication", "communicate"],
  personalCare: ["personal care", "washing", "shower"],
  mobility: ["mobility", "walking", "moving"],
  fallsRisk: ["falls", "fall risk"],
  nutrition: ["nutrition", "hydration", "eating", "drinking"],
  medication: ["medication", "medicine"],
  health: ["health"],
  skinIntegrity: ["skin", "pressure"],
  safeguarding: ["safeguarding"],
  restrictivePractice: ["restrictive"],
  risksControls: ["risks", "controls"],
  goals: ["goals", "outcomes"],
  family: ["family", "advocate"],
  decisionSupport: ["decision"],
  reviewNotes: ["review notes"],
};

/** Find sections named in the prompt, in the order they are mentioned. */
function mentionedSections(prompt: string, sections: AssistantSection[]): AssistantSection[] {
  const p = prompt.toLowerCase();
  const hits: { idx: number; sec: AssistantSection }[] = [];
  for (const sec of sections) {
    const names = [sec.label.toLowerCase(), ...(ALIASES[sec.key] ?? [])];
    let best = -1;
    for (const n of names) {
      const i = p.indexOf(n);
      if (i >= 0 && (best < 0 || i < best)) best = i;
    }
    if (best >= 0) hits.push({ idx: best, sec });
  }
  // Prefer the more specific match when two sections hit the same position.
  hits.sort((a, b) => a.idx - b.idx || b.sec.label.length - a.sec.label.length);
  const seen = new Set<number>();
  return hits.filter((h) => (seen.has(h.idx) ? false : (seen.add(h.idx), true))).map((h) => h.sec);
}

const PLAIN: [RegExp, string][] = [
  [/\bmobilises\b/gi, "walks"], [/\bmobilise\b/gi, "walk"], [/\bambulates?\b/gi, "walks"],
  [/\bindependently\b/gi, "on their own"], [/\brequires\b/gi, "needs"], [/\brequire\b/gi, "need"],
  [/\bassistance\b/gi, "help"], [/\bsupervision\b/gi, "someone nearby"], [/\badministered\b/gi, "given"],
  [/\bapproximately\b/gi, "about"], [/\bcommence\b/gi, "start"], [/\butilise\b/gi, "use"],
  [/\bprior to\b/gi, "before"], [/\badequate\b/gi, "enough"], [/\bnutritional intake\b/gi, "eating and drinking"],
  [/\banti-hypertensive medication\b/gi, "blood pressure tablets"], [/\bin situ\b/gi, "in place"],
  [/\bsubsequently\b/gi, "then"], [/\bin order to\b/gi, "to"],
];

function plainLanguage(text: string): string {
  let t = text;
  for (const [re, rep] of PLAIN) t = t.replace(re, rep);
  // Short sentences: split on semicolons.
  t = t.replace(/;\s*/g, ". ").replace(/\.\s+([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`);
  return t.trim();
}

function sentence(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return t;
  const c = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(c) ? c : `${c}.`;
}

const today = () => new Date().toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });

function labelFor(key: string, sections: AssistantSection[]) {
  return sections.find((x) => x.key === key)?.label ?? key;
}

function orderList(keys: string[], sections: AssistantSection[]): string {
  return keys.map((k, i) => `${i + 1}. ${labelFor(k, sections)}`).join(", ");
}

/** The single entry point. Returns proposals only — never changes anything. */
export function proposeCarePlanChanges(input: AssistantInput): ChangeSet {
  const prompt = input.resetToTemplate ? "Reset to template order" : input.prompt.trim();
  const p = prompt.toLowerCase();
  const changes: ProposedChange[] = [];
  const secs = input.sections;
  const reviewNotes = secs.find((x) => x.key === "reviewNotes");
  let message: string | undefined;

  const base = (c: Omit<ProposedChange, "id" | "prompt">): ProposedChange => ({ id: nid("prop"), prompt, ...c });

  if (input.resetToTemplate || /reset .*template order/.test(p)) {
    const prev = secs.map((x) => x.key);
    const next = input.templateOrder.filter((k) => prev.includes(k)).concat(prev.filter((k) => !input.templateOrder.includes(k)));
    if (prev.join("|") === next.join("|")) message = "The sections already follow the template order.";
    else changes.push(base({
      kind: "section_moved", origin: "rules", title: "Reset to template order", previousOrder: prev, proposedOrder: next, resetToTemplate: true,
      before: orderList(prev, secs), after: orderList(next, secs),
      source: { kind: "template", label: "Organisation template order" }, sourceLabel: "Template order",
    }));
  } else if (/\bmove\b/.test(p) && /\b(above|before|below|after)\b/.test(p)) {
    const m = mentionedSections(prompt, secs);
    if (m.length >= 2) {
      const [a, b] = m;
      const prev = secs.map((x) => x.key);
      const without = prev.filter((k) => k !== a.key);
      const bi = without.indexOf(b.key);
      const after = /\b(below|after)\b/.test(p);
      without.splice(after ? bi + 1 : bi, 0, a.key);
      const alreadyThere = after ? prev.indexOf(a.key) > prev.indexOf(b.key) : prev.indexOf(a.key) < prev.indexOf(b.key);
      if (alreadyThere || without.join("|") === prev.join("|")) message = `${a.label} is already ${after ? "below" : "above"} ${b.label}.`;
      else {
        const shown = Array.from(new Set([a.key, b.key])).sort((x, y) => prev.indexOf(x) - prev.indexOf(y));
        const shownNext = shown.slice().sort((x, y) => without.indexOf(x) - without.indexOf(y));
        changes.push(base({
          kind: "section_moved", origin: "ai", title: `Move ${a.label} ${after ? "below" : "above"} ${b.label}`,
          previousOrder: prev, proposedOrder: without,
          before: shown.map((k) => `${prev.indexOf(k) + 1}. ${labelFor(k, secs)}`).join(", "),
          after: shownNext.map((k) => `${without.indexOf(k) + 1}. ${labelFor(k, secs)}`).join(", "),
          source: { kind: "notes", label: "Your request", excerpt: prompt }, sourceLabel: "Request",
        }));
      }
    } else message = "Name two sections, for example “Move Communication above Mobility”.";
  } else if (/summari[sz]e/.test(p)) {
    const approved = new Map(input.approvedSections.map((x) => [x.key, x]));
    const lines: string[] = [];
    for (const s of secs) {
      const a = approved.get(s.key);
      if (!a) lines.push(`${s.label}: added.`);
      else if (a.body.trim() !== s.body.trim()) lines.push(`${s.label}: updated.`);
    }
    for (const a of input.approvedSections) if (!secs.some((s) => s.key === a.key)) lines.push(`${a.label}: removed.`);
    const ao = input.approvedSections.map((x) => x.key).filter((k) => secs.some((s) => s.key === k));
    const dn = secs.map((x) => x.key).filter((k) => ao.includes(k));
    if (ao.join("|") !== dn.join("|")) lines.push("Section order changed.");
    for (const e of input.events) lines.push(`Event since last review: ${e.label} (${new Date(e.occurredAt).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}).`);
    const note = `Changes since approved plan v${input.approvedVersionNumber} (${today()}): ${lines.length ? lines.join(" ") : "no changes recorded."}`;
    const before = reviewNotes?.body ?? "";
    changes.push(base({
      kind: reviewNotes ? "note_added" : "section_added", origin: "ai", title: "Add summary to Review Notes",
      sectionKey: "reviewNotes", sectionLabel: reviewNotes?.label ?? "Review Notes",
      before, after: before ? `${before}\n\n${note}` : note,
      source: { kind: "plan", label: `Draft compared with approved v${input.approvedVersionNumber}` }, sourceLabel: "Plan comparison",
    }));
  } else if (/which sections|need review|needs review/.test(p) && /event|incident|fall/.test(p)) {
    const ev = input.events[0];
    if (!ev) message = "No events are linked to this care plan.";
    else {
      const rule = CATEGORY_RULES.find((r) => r.category === ev.category);
      const keys = rule ? input.keysForCategories(rule.sections) : [];
      if (!keys.length) message = `LogUp has no review rule for ${ev.label}.`;
      else {
        const names = keys.map((k) => labelFor(k, secs)).join(", ");
        const note = `${ev.label} on ${new Date(ev.occurredAt).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}: review ${names}. ${rule?.reassessment ?? ""}`.trim();
        const before = reviewNotes?.body ?? "";
        changes.push(base({
          kind: reviewNotes ? "note_added" : "section_added", origin: "rules", title: `Sections to review: ${names}`,
          sectionKey: "reviewNotes", sectionLabel: reviewNotes?.label ?? "Review Notes",
          before, after: before ? `${before}\n\n${note}` : note,
          source: { kind: "event", label: ev.label, refId: ev.incidentId }, sourceLabel: `Event ${ev.incidentId}`,
        }));
      }
    }
  } else if (/plain language|plain english|simpler|rewrite/.test(p)) {
    const m = mentionedSections(prompt, secs);
    const targets = m.length ? m : secs.filter((x) => x.key === input.focusSectionKey);
    if (!targets.length) message = "Name the section to rewrite, for example “Rewrite Mobility in plain language”.";
    for (const t of targets) {
      const after = plainLanguage(t.body);
      if (after === t.body.trim()) continue;
      changes.push(base({
        kind: "section_updated", origin: "ai", title: `Rewrite ${t.label} in plain language`,
        sectionKey: t.key, sectionLabel: t.label, before: t.body, after,
        source: { kind: "plan", label: `Current ${t.label} text` }, sourceLabel: "Existing section",
      }));
    }
    if (targets.length && !changes.length) message = "That section already reads plainly.";
  } else {
    // "Use these notes to update X: …" (or any prompt naming a section with notes after a colon)
    const colon = prompt.indexOf(":");
    const notes = colon >= 0 ? prompt.slice(colon + 1).trim() : "";
    const head = colon >= 0 ? prompt.slice(0, colon) : prompt;
    const m = mentionedSections(head, secs);
    const target = m[0] ?? secs.find((x) => x.key === input.focusSectionKey);
    if (target && notes) {
      const update = notes.split(/(?<=[.!?])\s+|\s+and\s+(?=needs|uses|has|is|requires|prefers)/i).map(sentence).join(" ");
      const after = `${target.body.trim()}\n\nUpdated ${today()}: ${update}`.trim();
      changes.push(base({
        kind: "section_updated", origin: "ai", title: `Update ${target.label}`,
        sectionKey: target.key, sectionLabel: target.label, before: target.body, after,
        source: { kind: "notes", label: "Notes given to Ask LogUp", excerpt: notes }, sourceLabel: "Notes",
      }));
    } else if (/^add (a )?section/.test(p) && notes) {
      const name = head.replace(/^add (a )?section( for| called)?/i, "").trim() || "New section";
      changes.push(base({
        kind: "section_added", origin: "ai", title: `Add section “${name}”`,
        sectionKey: `custom_ai_${Date.now().toString(36)}`, sectionLabel: name, before: "", after: sentence(notes),
        source: { kind: "notes", label: "Notes given to Ask LogUp", excerpt: notes }, sourceLabel: "Notes",
      }));
    } else {
      message = target
        ? `Add the notes after a colon, for example “Use these notes to update ${target.label}: …”.`
        : "Try one of the examples, or name a section and add notes after a colon.";
    }
  }

  const touched = new Set(changes.flatMap((c) => (c.kind === "section_moved" ? [] : c.sectionKey ? [c.sectionKey] : [])));
  return {
    id: nid("cs"), prompt, createdAt: new Date().toISOString(), changes, message,
    unchanged: secs.map((x) => x.key).filter((k) => !touched.has(k)),
  };
}

// ---------- Priority right now (summary of the approved plan) ----------

const PRIORITY_KEYS = ["fallsRisk", "mobility", "risksControls", "nutrition", "medication", "skinIntegrity", "communication", "safeguarding", "health"];

/**
 * 3–5 points drawn only from the approved plan and open review flags.
 * A summary — it never changes the plan or its order. `variant` lets Regenerate
 * pick different sentences (simulated model).
 */
export function summariseApprovedPlan(input: {
  approvedSections: AssistantSection[];
  openFlags: { title: string; overdue?: boolean }[];
  variant?: number;
}): string[] {
  const v = input.variant ?? 0;
  const out: string[] = [];
  for (const f of input.openFlags.slice(0, 2)) out.push(`${f.overdue ? "Overdue review: " : "Open review: "}${f.title}`);
  const ranked = PRIORITY_KEYS.map((k) => input.approvedSections.find((s) => s.key === k)).filter((s): s is AssistantSection => !!s && !!s.body.trim());
  for (const s of ranked) {
    if (out.length >= 5) break;
    const sentences = s.body.split(/(?<=[.!?])\s+/).filter(Boolean);
    const pick = sentences[v % sentences.length] ?? sentences[0];
    out.push(`${s.label}: ${pick}`);
  }
  return out.slice(0, Math.max(3, Math.min(5, out.length)));
}
