// Deterministic, explainable pattern detection over incidentRecords.
// This is intentionally NOT a black-box AI engine — every signal is derived
// from clear rules so managers can trust what they're seeing. Tone of summaries
// uses "possible repeat pattern", "emerging theme", etc. (never declarative).

import { incidentRecords, type IncidentRecord, type Severity } from "./incidentRecords";

export type PatternKind = "location" | "shift" | "category" | "theme" | "followup";

export interface IncidentPattern {
  id: string;
  kind: PatternKind;
  /** Compact label used as the primary headline of the card. */
  title: string;
  /** Soft governance-friendly description (one sentence). */
  description: string;
  /** Number of related incidents underpinning the signal. */
  count: number;
  /** Days the pattern looks back over (for the chip e.g. "30 days"). */
  windowDays: number;
  /** Highest severity present in the cluster, or undefined if not relevant. */
  topSeverity?: Severity;
  /** Site if the pattern is site-bound (most are). */
  site?: string;
  /** Drill-down URL params to apply when the row is clicked. */
  drillParams: Record<string, string>;
  /** IDs of incidents that triggered the signal (used by Similar incidents). */
  matchedIds: string[];
}

// ----- Window helpers -------------------------------------------------------

/** Anchor "today" to the latest record in the dataset so the prototype always
 * surfaces signals (real time-of-day would zero out a static seed dataset). */
const dataAnchor: Date = (() => {
  let max = 0;
  for (const r of incidentRecords) {
    const t = r.dateObj.getTime();
    if (t > max) max = t;
  }
  return new Date(max);
})();

const withinDays = (r: IncidentRecord, days: number): boolean => {
  const ms = days * 24 * 60 * 60 * 1000;
  return dataAnchor.getTime() - r.dateObj.getTime() <= ms;
};

const topSeverity = (rows: IncidentRecord[]): Severity | undefined => {
  const order: Severity[] = ["Critical", "High", "Moderate", "Low"];
  for (const sev of order) if (rows.some(r => r.severity === sev)) return sev;
  return undefined;
};

// ----- Themes (narrative keyword clusters) ----------------------------------

export interface ThemeDef {
  id: string;
  label: string;          // governance phrasing
  shortLabel: string;     // for chips
  // Words/phrases scanned across summary + chronology + actions.
  keywords: RegExp;
}

export const THEMES: ThemeDef[] = [
  {
    id: "handover",
    label: "handover or communication issues",
    shortLabel: "Handover / communication",
    keywords: /handover|hand-over|communicat|not informed|missed update|unclear instruction/i,
  },
  {
    id: "med-round",
    label: "morning or evening medication round timing",
    shortLabel: "Medication round timing",
    keywords: /medication round|round started|round commenced|am round|pm round|morning round|evening round/i,
  },
  {
    id: "transfer",
    label: "transfers and moving & handling",
    shortLabel: "Transfer / moving & handling",
    keywords: /transfer|hoist|sling|repositioning|reposition|moving and handling/i,
  },
  {
    id: "environment",
    label: "environmental clutter or shared-area hazards",
    shortLabel: "Environmental / clutter",
    keywords: /clutter|wet floor|spill|trip hazard|obstruct|loose mat|cable|wire/i,
  },
  {
    id: "delayed-response",
    label: "delayed response or call-bell delays",
    shortLabel: "Delayed response",
    keywords: /call bell|call-bell|delayed|response time|waited|left waiting/i,
  },
  {
    id: "equipment",
    label: "equipment faults or missing equipment",
    shortLabel: "Equipment faults",
    keywords: /equipment|fault|malfunction|broken|battery|out of service|missing/i,
  },
];

const incidentText = (r: IncidentRecord): string =>
  [
    r.summary,
    ...r.chronology.map(e => e.event),
    ...r.actions.map(a => a.action),
  ].join(" \n ");

// ----- Shift buckets --------------------------------------------------------

type Shift = "Night (22:00–06:00)" | "Morning (06:00–14:00)" | "Evening (14:00–22:00)";
const shiftOf = (r: IncidentRecord): Shift => {
  const h = r.dateObj.getHours();
  if (h >= 22 || h < 6) return "Night (22:00–06:00)";
  if (h < 14) return "Morning (06:00–14:00)";
  return "Evening (14:00–22:00)";
};

// ----- Detectors ------------------------------------------------------------

const slugFor = (s: string) => s.toLowerCase().split(" ")[0];

function detectLocationHotspots(records: IncidentRecord[]): IncidentPattern[] {
  const window = 30;
  const recent = records.filter(r => withinDays(r, window));
  const buckets = new Map<string, IncidentRecord[]>();
  for (const r of recent) {
    const key = `${r.site}|${r.location}|${r.category}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }
  const out: IncidentPattern[] = [];
  for (const [key, rows] of buckets) {
    if (rows.length < 3) continue; // need at least 3 to call it a pattern
    const [site, location, category] = key.split("|");
    const catWord = category === "Fall" ? "falls"
      : category === "Medication" ? "medication incidents"
      : category === "Behavioural" ? "behavioural incidents"
      : category === "Skin Integrity" ? "skin-integrity incidents"
      : `${category.toLowerCase()} incidents`;
    out.push({
      id: `loc-${slugFor(site)}-${location.toLowerCase().replace(/\s+/g,"")}-${category.toLowerCase()}`,
      kind: "location",
      title: `${site} · ${location} · ${rows.length} ${catWord} in ${window} days`,
      description: `Possible repeat pattern at this location — ${rows.length} ${catWord} recorded in the last ${window} days.`,
      count: rows.length,
      windowDays: window,
      topSeverity: topSeverity(rows),
      site,
      drillParams: { site, location, category },
      matchedIds: rows.map(r => r.id),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

function detectShiftPatterns(records: IncidentRecord[]): IncidentPattern[] {
  const window = 30;
  const recent = records.filter(r => withinDays(r, window));
  const buckets = new Map<string, IncidentRecord[]>();
  for (const r of recent) {
    const key = `${r.site}|${shiftOf(r)}|${r.category}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }
  const out: IncidentPattern[] = [];
  for (const [key, rows] of buckets) {
    if (rows.length < 3) continue;
    const [site, shift, category] = key.split("|");
    out.push({
      id: `shift-${slugFor(site)}-${shift.split(" ")[0].toLowerCase()}-${category.toLowerCase()}`,
      kind: "shift",
      title: `${site} · ${shift.split(" ")[0]} shift · ${rows.length} ${category.toLowerCase()} incidents`,
      description: `Emerging cluster on the ${shift.toLowerCase()} — ${rows.length} ${category.toLowerCase()} incidents recorded in the last ${window} days.`,
      count: rows.length,
      windowDays: window,
      topSeverity: topSeverity(rows),
      site,
      drillParams: { site, category, shift: shift.split(" ")[0].toLowerCase() },
      matchedIds: rows.map(r => r.id),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

function detectThemePatterns(records: IncidentRecord[]): IncidentPattern[] {
  const window = 30;
  const recent = records.filter(r => withinDays(r, window));
  const out: IncidentPattern[] = [];
  for (const t of THEMES) {
    const matched = recent.filter(r => t.keywords.test(incidentText(r)));
    if (matched.length < 3) continue;
    out.push({
      id: `theme-${t.id}`,
      kind: "theme",
      title: `${matched.length} recent incidents reference ${t.shortLabel.toLowerCase()}`,
      description: `Emerging theme noted across ${matched.length} incidents in the last ${window} days — ${t.label}.`,
      count: matched.length,
      windowDays: window,
      topSeverity: topSeverity(matched),
      drillParams: { theme: t.id },
      matchedIds: matched.map(r => r.id),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

function detectFollowupPatterns(records: IncidentRecord[]): IncidentPattern[] {
  const window = 30;
  const recent = records.filter(r => withinDays(r, window));
  // Repeated overdue actions for the same category at the same site.
  const buckets = new Map<string, IncidentRecord[]>();
  for (const r of recent) {
    if (r.status !== "Overdue") continue;
    const key = `${r.site}|${r.category}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }
  const out: IncidentPattern[] = [];
  for (const [key, rows] of buckets) {
    if (rows.length < 2) continue;
    const [site, category] = key.split("|");
    out.push({
      id: `fu-${slugFor(site)}-${category.toLowerCase()}`,
      kind: "followup",
      title: `${site} · repeated overdue follow-up on ${category.toLowerCase()} incidents`,
      description: `Recurring follow-up delay noted — ${rows.length} ${category.toLowerCase()} incidents at ${site} have overdue actions.`,
      count: rows.length,
      windowDays: window,
      topSeverity: topSeverity(rows),
      site,
      drillParams: { site, category, actions: "overdue" },
      matchedIds: rows.map(r => r.id),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

// ----- Public API -----------------------------------------------------------

/** All detected patterns, scoped to the records you pass in (so role-scope is respected). */
export function detectPatterns(records: IncidentRecord[]): IncidentPattern[] {
  return [
    ...detectLocationHotspots(records),
    ...detectShiftPatterns(records),
    ...detectThemePatterns(records),
    ...detectFollowupPatterns(records),
  ];
}

/** Short governance summary (1–2 sentences) describing the headline patterns. */
export function patternSummary(patterns: IncidentPattern[]): string {
  if (patterns.length === 0) {
    return "No repeat patterns detected in the current scope. Continue routine monitoring.";
  }
  const top = patterns.slice(0, 3);
  const fragments = top.map(p => {
    if (p.kind === "location") return `${p.count} ${p.title.split("·").pop()?.trim() ?? "incidents"} at ${p.site}`;
    if (p.kind === "shift") return `${p.count} incidents clustered on ${p.title.split("·")[1]?.trim() ?? "a shift"}`;
    if (p.kind === "theme") return `${p.count} incidents referencing ${p.title.split("reference ").pop()}`;
    if (p.kind === "followup") return `repeated follow-up delays at ${p.site}`;
    return "";
  }).filter(Boolean);
  return `Possible attention areas: ${fragments.join("; ")}. These are suggested patterns, not conclusions — review with site PIC.`;
}

// ----- Similar incidents (for incident detail view) -------------------------

export interface SimilarIncident {
  id: string;
  reason: string;        // why it's considered similar
  record: IncidentRecord;
}

/** Lightweight similarity: same site+location, same category, or shared theme. */
export function findSimilar(target: IncidentRecord, pool: IncidentRecord[], limit = 5): SimilarIncident[] {
  const out: SimilarIncident[] = [];
  const seen = new Set<string>([target.id]);
  const targetText = incidentText(target);
  const targetThemes = THEMES.filter(t => t.keywords.test(targetText));

  // 1. Same site + location (strongest signal)
  for (const r of pool) {
    if (seen.has(r.id)) continue;
    if (r.site === target.site && r.location === target.location) {
      out.push({ id: r.id, reason: `Same location · ${r.location}`, record: r });
      seen.add(r.id);
    }
  }
  // 2. Same site + category
  for (const r of pool) {
    if (seen.has(r.id)) continue;
    if (r.site === target.site && r.category === target.category) {
      out.push({ id: r.id, reason: `Same site · ${target.category.toLowerCase()} incident`, record: r });
      seen.add(r.id);
    }
  }
  // 3. Shared theme across sites
  if (targetThemes.length > 0) {
    for (const r of pool) {
      if (seen.has(r.id)) continue;
      const rText = incidentText(r);
      const shared = targetThemes.find(t => t.keywords.test(rText));
      if (shared) {
        out.push({ id: r.id, reason: `Shared theme · ${shared.shortLabel.toLowerCase()}`, record: r });
        seen.add(r.id);
      }
    }
  }
  // Recency: prefer most recent first within reason groups
  return out
    .sort((a, b) => b.record.dateObj.getTime() - a.record.dateObj.getTime())
    .slice(0, limit);
}
