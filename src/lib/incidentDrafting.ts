// Helpers that turn raw, messy reporter input into a clean, professional
// incident draft — without inventing facts or making clinical judgements.
//
// The original verbatim text is always preserved separately as
// "Source evidence" so reviewers can compare against the polished prose.

import type { DraftDetails } from "./incidentsStore";

// --- Spelling / typo dictionary (case-insensitive whole-word) ---------------
const TYPO_FIXES: Record<string, string> = {
  rrom: "room",
  romm: "room",
  bedrm: "bedroom",
  bedrom: "bedroom",
  partick: "Patrick",
  margret: "Margaret",
  eilene: "Eileen",
  eileeen: "Eileen",
  obrien: "O'Brien",
  recieved: "received",
  recieve: "receive",
  immediatly: "immediately",
  noticied: "noticed",
  alot: "a lot",
  occured: "occurred",
  ocurred: "occurred",
  thier: "their",
  teh: "the",
  pls: "please",
  asap: "as soon as possible",
  approx: "approximately",
  "approx.": "approximately",
  approxiamtely: "approximately",
  approxiamately: "approximately",
  approxinmately: "approximately",
  approximatley: "approximately",
  approxmiately: "approximately",
  approximatly: "approximately",
  approxim: "approximately",
  dr: "Dr",
  gp: "GP",
  pic: "PIC",
  cnm: "CNM",
  hiqa: "HIQA",
  nok: "next of kin",
  bp: "blood pressure",
  pm: "pm",
  am: "am",
  pmm: "pm",
  amm: "am",
  resp: "respiration",
  obs: "observations",
};

const PRESERVE_CASE = new Set(["GP", "PIC", "CNM", "HIQA", "Dr", "Patrick", "Margaret", "Eileen", "O'Brien"]);

const fixToken = (token: string): string => {
  // Preserve a trailing punctuation char if present.
  const m = token.match(/^([\p{L}\p{N}'’.]+)([.,;:!?)]*)$/u);
  if (!m) return token;
  const [, word, tail] = m;
  const lower = word.toLowerCase();
  if (TYPO_FIXES[lower]) {
    const fixed = TYPO_FIXES[lower];
    if (PRESERVE_CASE.has(fixed)) return fixed + tail;
    // Preserve initial capital on first letter if original had one.
    if (/^[A-Z]/.test(word)) return fixed.charAt(0).toUpperCase() + fixed.slice(1) + tail;
    return fixed + tail;
  }
  return token;
};

// Capitalise the first letter of each sentence, normalise whitespace and
// ensure terminal punctuation. Pure cosmetic — never alters meaning.
export const polish = (raw: string | undefined | null): string => {
  if (!raw) return "";
  let text = String(raw).replace(/\r\n?/g, "\n").trim();
  if (!text) return "";

  // Collapse runs of whitespace (but keep paragraph breaks).
  text = text
    .split(/\n{2,}/)
    .map(p => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");

  // Token-level typo fixes.
  text = text
    .split("\n\n")
    .map(p => p.split(/(\s+)/).map(t => (/\s+/.test(t) ? t : fixToken(t))).join(""))
    .join("\n\n");

  // Normalise spaces around punctuation.
  text = text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(?=[^\s.,;:!?)])/g, "$1 ");

  // Sentence-case: capitalise first character of each sentence.
  const capitaliseSentences = (s: string) =>
    s.replace(/(^|[.!?]\s+|\n+)([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase());

  text = text
    .split("\n\n")
    .map(capitaliseSentences)
    .join("\n\n");

  // First character of the whole block.
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // Ensure terminal punctuation.
  if (!/[.!?]$/.test(text)) text = text + ".";

  return text;
};

// --- Manager review summary -------------------------------------------------
// One short narrative paragraph that a manager can read in 10 seconds.
// Only uses information actually captured. Explicitly states what is still
// needed — never makes clinical or regulatory decisions.

export interface SummaryInputs {
  residentName: string;
  what?: string;
  whenDate?: string;
  whenTime?: string;
  whenFree?: string;
  whereDetail?: string;
  staff?: string;
  injurySustained?: boolean;
  injuryNote?: string;
  response?: string;
  notifications?: string;
}

const joinList = (parts: string[]): string => {
  const cleaned = parts.filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")} and ${cleaned[cleaned.length - 1]}`;
};

export const buildManagerSummary = (input: SummaryInputs): string => {
  const resident = input.residentName || "The resident";
  const sentences: string[] = [];

  // Opening: what + when + where, drawn only from captured info.
  const whenBits: string[] = [];
  if (input.whenTime) whenBits.push(`at approximately ${input.whenTime}`);
  if (input.whenDate) whenBits.push(`on ${input.whenDate}`);
  else if (!input.whenTime && input.whenFree) whenBits.push(input.whenFree);
  const whenStr = whenBits.join(" ");
  const whereStr = input.whereDetail ? ` in ${input.whereDetail}` : "";

  if (input.what) {
    const w = polish(input.what).replace(/\.$/, "");
    // Avoid double-naming the resident if they already mentioned them.
    const mentionsResident = new RegExp(resident.split(" ")[0], "i").test(w);
    const lead = mentionsResident ? w : `${resident} — ${w.charAt(0).toLowerCase() + w.slice(1)}`;
    sentences.push(`${lead}${whenStr ? ` ${whenStr}` : ""}${whereStr}.`);
  } else if (whenStr || whereStr) {
    sentences.push(`Incident involving ${resident}${whenStr ? ` ${whenStr}` : ""}${whereStr}.`);
  } else {
    sentences.push(`Incident involving ${resident}.`);
  }

  // Witnesses / others present.
  if (input.staff) {
    const s = polish(input.staff).replace(/\.$/, "");
    if (/no one else|on my own|alone|nobody else/i.test(s)) {
      sentences.push("The reporter stated that no other staff or residents were present.");
    } else {
      sentences.push(`Others present: ${s}.`);
    }
  }

  // Injury — purely factual relay, no clinical judgement.
  if (input.injurySustained === true) {
    sentences.push(
      input.injuryNote
        ? `An injury was reported: ${polish(input.injuryNote).replace(/\.$/, "")}.`
        : "An injury was reported; the nature and severity require reviewer confirmation.",
    );
  } else if (input.injurySustained === false) {
    sentences.push("No injury was reported at the point of capture.");
  }

  // Immediate response.
  if (input.response) {
    sentences.push(`Immediate response: ${polish(input.response).replace(/\.$/, "")}.`);
  }

  // Notifications.
  if (input.notifications && !/not yet|^no\b|^none/i.test(input.notifications)) {
    sentences.push(`Notifications: ${polish(input.notifications).replace(/\.$/, "")}.`);
  }

  // Outstanding items (this is *what is missing*, not a clinical opinion).
  const missing: string[] = [];
  if (!input.response) missing.push("immediate actions taken");
  if (input.injurySustained === undefined) missing.push("injury or impact");
  if (!/\b(vitals|obs|neuro|bp|sats|temperature|pulse)\b/i.test([input.what, input.response].filter(Boolean).join(" ")))
    missing.push("observations completed");
  if (!/\b(refer|review|gp|physio|care plan|risk assess|follow[- ]?up|monitor)\b/i.test([input.response, input.notifications].filter(Boolean).join(" ")))
    missing.push("follow-up actions");

  if (missing.length > 0) {
    sentences.push(`Further details are needed on ${joinList(missing)}.`);
  }

  return sentences.join(" ");
};

// --- Structured incident record sections -----------------------------------
// Clean prose per section. Each is sourced only from captured info; if a
// field is missing, the section says so explicitly rather than fabricating.

export interface SectionBuildInputs extends SummaryInputs {}

export interface DraftedSection { label: string; body: string; missing?: boolean }

export const buildStructuredSections = (input: SectionBuildInputs): DraftedSection[] => {
  const sections: DraftedSection[] = [];

  // What happened
  if (input.what) {
    const w = polish(input.what);
    sections.push({ label: "What happened", body: w });
  } else {
    sections.push({ label: "What happened", body: "Needs reviewer confirmation — narrative not provided at capture.", missing: true });
  }

  // When
  if (input.whenTime || input.whenDate || input.whenFree) {
    const bits: string[] = [];
    if (input.whenDate) bits.push(input.whenDate);
    if (input.whenTime) bits.push(`approximately ${input.whenTime}`);
    if (!bits.length && input.whenFree) bits.push(polish(input.whenFree).replace(/\.$/, ""));
    sections.push({ label: "When", body: `${bits.join(", ")}.` });
  } else {
    sections.push({ label: "When", body: "Needs reviewer confirmation — exact date/time not provided.", missing: true });
  }

  // Where
  if (input.whereDetail) {
    sections.push({ label: "Where", body: polish(input.whereDetail) });
  } else {
    sections.push({ label: "Where", body: "Needs reviewer confirmation — exact location not provided.", missing: true });
  }

  // Others present
  if (input.staff) {
    sections.push({ label: "Others present / witnesses", body: polish(input.staff) });
  } else {
    sections.push({ label: "Others present / witnesses", body: "Needs reviewer confirmation.", missing: true });
  }

  // Injury
  if (input.injurySustained === true) {
    sections.push({
      label: "Injury / impact",
      body: input.injuryNote
        ? polish(input.injuryNote)
        : "Injury reported — type, body area and severity need reviewer confirmation.",
      missing: !input.injuryNote,
    });
  } else if (input.injurySustained === false) {
    sections.push({ label: "Injury / impact", body: "No injury reported at point of capture." });
  } else {
    sections.push({ label: "Injury / impact", body: "Needs reviewer confirmation.", missing: true });
  }

  // Immediate actions
  if (input.response) {
    sections.push({ label: "Immediate actions taken", body: polish(input.response) });
  } else {
    sections.push({ label: "Immediate actions taken", body: "Needs reviewer confirmation — immediate response not described.", missing: true });
  }

  // Notifications
  if (input.notifications && !/not yet|^no\b|^none/i.test(input.notifications)) {
    sections.push({ label: "Notifications made", body: polish(input.notifications) });
  } else if (input.notifications) {
    sections.push({ label: "Notifications made", body: "None recorded at point of capture — reviewer to confirm." , missing: true });
  } else {
    sections.push({ label: "Notifications made", body: "Needs reviewer confirmation.", missing: true });
  }

  return sections;
};
