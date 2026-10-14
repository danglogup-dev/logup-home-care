/**
 * Organisation settings — what the organisation calls the people it supports.
 * Persisted to localStorage. Pages read wording through useTerms(), never
 * from the raw label, so grammar is defined once per preset here.
 */
import { useSyncExternalStore } from "react";

export type ServiceUserLabelPreset =
  | "service_user" | "resident" | "person_supported" | "client" | "individual" | "young_person" | "custom";

export interface ServiceUserLabel {
  preset: ServiceUserLabelPreset;
  singular: string;
  plural: string;
}

export interface PresetDef {
  id: ServiceUserLabelPreset;
  singular: string;
  plural: string;
  /** Phrase for "<label>'s <noun>". Noun is lower-case; result is sentence case. */
  possessive?: (noun: string) => string;
  pluralPossessive?: (noun: string) => string;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export const SERVICE_USER_PRESETS: PresetDef[] = [
  { id: "service_user", singular: "Service user", plural: "Service users" },
  { id: "resident", singular: "Resident", plural: "Residents" },
  {
    id: "person_supported", singular: "Person supported", plural: "People supported",
    possessive: (n) => `${cap(n)} for the person supported`,
    pluralPossessive: (n) => `${cap(n)} for people supported`,
  },
  { id: "client", singular: "Client", plural: "Clients" },
  { id: "individual", singular: "Individual", plural: "Individuals" },
  {
    id: "young_person", singular: "Young person", plural: "Young people",
    pluralPossessive: (n) => `Young people's ${n}`,
  },
];

export const PRESET_LABELS: Record<ServiceUserLabelPreset, string> = {
  service_user: "Service user", resident: "Resident", person_supported: "Person supported",
  client: "Client", individual: "Individual", young_person: "Young person", custom: "Custom",
};

/** Provider-configured rule: after an event of this category, suggest reassessment. Empty by default. */
export interface ReassessmentRule {
  id: string;
  /** Event rule category (IncidentCategory label, e.g. "Falls"). */
  eventCategory: string;
  /** Assessment category (falls, nutrition, skin_integrity, moving_handling, other). */
  assessmentCategory: string;
  note?: string;
}

interface State { serviceUserLabel: ServiceUserLabel; defaultCarePlanReviewDays: number; reassessmentRules: ReassessmentRule[] }

const STORAGE_KEY = "logup.orgSettings.v2";
const DEFAULT: State = { serviceUserLabel: { preset: "client", singular: "Client", plural: "Clients" }, defaultCarePlanReviewDays: 7, reassessmentRules: [] };

function load(): State {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as State;
      if (p?.serviceUserLabel?.singular && p.serviceUserLabel.plural) return { ...DEFAULT, ...p };
    }
  } catch { /* ignore */ }
  return DEFAULT;
}

let state: State = load();
const listeners = new Set<() => void>();
function emit() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export const orgSettingsStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  get(): State { return state; },
  setDefaultCarePlanReviewDays(days: number) {
    const d = Math.round(days);
    if (!Number.isFinite(d) || d < 1 || d > 365) return;
    state = { ...state, defaultCarePlanReviewDays: d };
    emit();
  },
  addReassessmentRule(rule: Omit<ReassessmentRule, "id">) {
    state = { ...state, reassessmentRules: [...state.reassessmentRules, { ...rule, id: `RR-${Date.now().toString(36)}` }] };
    emit();
  },
  removeReassessmentRule(id: string) {
    state = { ...state, reassessmentRules: state.reassessmentRules.filter((r) => r.id !== id) };
    emit();
  },
  setServiceUserLabel(label: ServiceUserLabel) {
    const preset = SERVICE_USER_PRESETS.find((p) => p.id === label.preset);
    const next = preset ? { preset: preset.id, singular: preset.singular, plural: preset.plural } : {
      preset: "custom" as const, singular: label.singular.trim(), plural: label.plural.trim(),
    };
    if (!next.singular || !next.plural) return;
    state = { ...state, serviceUserLabel: next };
    emit();
  },
};

export interface Terms {
  /** Lower-case: "resident", "residents". */
  singular: string;
  plural: string;
  /** Sentence case: "Resident", "Residents". */
  Singular: string;
  Plural: string;
  /** "Resident's plan" / "Plan for the person supported". */
  possessive: (noun: string) => string;
  /** "Residents' plans" / "Plans for people supported". */
  pluralPossessive: (noun: string) => string;
  /** "1 resident", "3 residents". */
  count: (n: number) => string;
}

const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function buildTerms(label: ServiceUserLabel): Terms {
  const def = SERVICE_USER_PRESETS.find((p) => p.id === label.preset);
  const Singular = cap(label.singular);
  const Plural = cap(label.plural);
  const singular = lower(label.singular);
  const plural = lower(label.plural);
  return {
    singular, plural, Singular, Plural,
    possessive: def?.possessive ?? ((n) => `${Singular}'s ${n}`),
    pluralPossessive: def?.pluralPossessive ?? ((n) => (Plural.endsWith("s") ? `${Plural}' ${n}` : `${Plural}'s ${n}`)),
    count: (n) => `${n} ${n === 1 ? singular : plural}`,
  };
}

let cachedFor: ServiceUserLabel | null = null;
let cachedTerms: Terms = buildTerms(state.serviceUserLabel);
/** Non-hook access for code outside components (e.g. helpers called during render). */
export function getTerms(): Terms {
  if (cachedFor !== state.serviceUserLabel) { cachedFor = state.serviceUserLabel; cachedTerms = buildTerms(state.serviceUserLabel); }
  return cachedTerms;
}

export function useOrgSettings(): State {
  return useSyncExternalStore(orgSettingsStore.subscribe, orgSettingsStore.get, orgSettingsStore.get);
}
