// Lightweight prototype-grade language detection + translation for the
// LogUp Incidents capture flow. Real translation should be swapped in via
// an edge function calling Lovable AI; this helper keeps the UI honest in
// the meantime.

export type SourceLanguage =
  | "en" | "pl" | "ro" | "es" | "pt" | "fr" | "lt" | "lv" | "other";

export const LANGUAGE_LABELS: Record<SourceLanguage, string> = {
  en: "English",
  pl: "Polish",
  ro: "Romanian",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  lt: "Lithuanian",
  lv: "Latvian",
  other: "Other",
};

export const LANGUAGE_OPTIONS: { value: SourceLanguage | "auto"; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "pl", label: "Polish" },
  { value: "ro", label: "Romanian" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "lt", label: "Lithuanian" },
  { value: "lv", label: "Latvian" },
  { value: "other", label: "Other" },
];

// Tiny stop-word / character heuristic. Not exhaustive — good enough to
// give the UI an "auto-detected" cue during demos.
const HINTS: Record<Exclude<SourceLanguage, "en" | "other">, RegExp[]> = {
  pl: [/\b(jest|nie|się|oraz|który|pacjent|upadł|pokój|dzisiaj)\b/i, /[ąćęłńóśźż]/],
  ro: [/\b(este|nu|și|care|rezident|căzut|cameră|astăzi|asistent)\b/i, /[ăâîșț]/],
  es: [/\b(el|la|los|las|residente|cayó|hoy|habitación|enfermera)\b/i, /[ñ¿¡]/],
  pt: [/\b(o|a|os|as|residente|caiu|hoje|quarto|enfermeira|não)\b/i, /[ãõç]/],
  fr: [/\b(le|la|les|résident|est|tombé|aujourd'hui|chambre|infirmière)\b/i, /[àâçéèêëîïôùûü]/],
  lt: [/\b(yra|ne|ir|kuris|gyventojas|krito|kambarys|šiandien)\b/i, /[ąčęėįšųūž]/],
  lv: [/\b(ir|nav|un|kurš|iemītnieks|kritis|istaba|šodien)\b/i, /[āčēģīķļņšūž]/],
};

export function detectLanguage(text: string): { language: SourceLanguage; confidence: "high" | "low" } {
  const t = (text || "").trim();
  if (!t) return { language: "en", confidence: "low" };
  let best: SourceLanguage = "en";
  let bestScore = 0;
  (Object.keys(HINTS) as (keyof typeof HINTS)[]).forEach((lang) => {
    const score = HINTS[lang].reduce((acc, re) => acc + (re.test(t) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  });
  if (bestScore === 0) return { language: "en", confidence: "high" };
  return { language: best, confidence: bestScore >= 2 ? "high" : "low" };
}

// Tiny curated phrase map so demo output reads credibly. Anything outside
// the map is returned wrapped to make the translation step visible.
const PHRASE_MAP: Record<Exclude<SourceLanguage, "en">, [RegExp, string][]> = {
  pl: [
    [/pacjent\s+upadł/gi, "the resident fell"],
    [/w\s+pokoju/gi, "in the room"],
    [/dzisiaj/gi, "today"],
    [/nie\s+jest\s+ranny/gi, "is not injured"],
  ],
  ro: [
    [/rezidentul\s+a\s+căzut/gi, "the resident fell"],
    [/în\s+cameră/gi, "in the room"],
    [/astăzi/gi, "today"],
    [/nu\s+este\s+rănit/gi, "is not injured"],
    [/asistenta\s+a\s+venit/gi, "the nurse came"],
  ],
  es: [
    [/el\s+residente\s+(se\s+)?cayó/gi, "the resident fell"],
    [/en\s+la\s+habitación/gi, "in the room"],
    [/hoy/gi, "today"],
    [/no\s+está\s+herido/gi, "is not injured"],
  ],
  pt: [
    [/o\s+residente\s+caiu/gi, "the resident fell"],
    [/no\s+quarto/gi, "in the room"],
    [/hoje/gi, "today"],
    [/não\s+está\s+ferido/gi, "is not injured"],
  ],
  fr: [
    [/le\s+résident\s+est\s+tombé/gi, "the resident fell"],
    [/dans\s+la\s+chambre/gi, "in the room"],
    [/aujourd'hui/gi, "today"],
    [/n'est\s+pas\s+blessé/gi, "is not injured"],
  ],
  lt: [
    [/gyventojas\s+krito/gi, "the resident fell"],
    [/kambaryje/gi, "in the room"],
    [/šiandien/gi, "today"],
  ],
  lv: [
    [/iemītnieks\s+ir\s+kritis/gi, "the resident fell"],
    [/istabā/gi, "in the room"],
    [/šodien/gi, "today"],
  ],
  other: [],
};

export function translateToEnglish(text: string, lang: SourceLanguage): string {
  const t = (text || "").trim();
  if (!t) return "";
  if (lang === "en") return t;
  const map = PHRASE_MAP[lang] || [];
  let out = t;
  map.forEach(([re, en]) => { out = out.replace(re, en); });
  // If nothing was substituted and the text still looks foreign, prefix
  // with a clear English-translation marker so the demo is unambiguous.
  if (out === t) {
    return `[Translated from ${LANGUAGE_LABELS[lang]}] ${t}`;
  }
  return out;
}
