// Admin-configurable settings per Event Type.
// In-memory store with localStorage persistence and pub/sub, matching the
// pattern of incidentsStore / roleStore. AI-first principle: settings define
// recommended information for the AI follow-up prompts — never long forms.

import { EVENT_TYPES, type EventType } from "./eventTypes";
import type { VisibilityMode } from "./eventVisibility";

export interface EventTypeSettings {
  type: EventType;
  description: string;
  active: boolean;
  order: number;
  restrictedByDefault: boolean;
  submitterCanViewOwn: boolean;
  submitterCanSeeStatus: boolean;
  requiresManagerReview: boolean;
  requiresClosureApproval: boolean;
  /** Short prompts AI will ask the submitter for if missing from capture. */
  missingInfoPrompts: string[];
  defaultSeverity?: "Low" | "Moderate" | "High" | "Critical";
  defaultVisibility?: VisibilityMode;
}

const DEFAULTS: EventTypeSettings[] = EVENT_TYPES.map((type, i) => {
  const restricted = ["Complaint","Concern","Safeguarding Concern","Information Request / Records Request","Regulatory Notification","Inspection / Regulatory Visit"].includes(type);
  const closure = ["Complaint","Safeguarding Concern","Regulatory Notification","Medication Event","Incident / Accident"].includes(type);
  const prompts: Record<string, string[]> = {
    "Complaint": ["Who raised the complaint?", "What is their desired outcome?", "Is anyone named in the complaint?"],
    "Concern": ["What is the concern about?", "Is there an immediate risk?"],
    "Compliment": ["Who is the compliment about?", "Can we share it internally?"],
    "Information Request / Records Request": ["Who is making the request?", "What records or information are requested?", "Is there a deadline?"],
    "Safeguarding Concern": ["Who is the person at risk?", "What is the immediate risk?", "Has anyone been notified yet?"],
    "Medication Event": ["Which medication?", "Was the resident affected?", "Has the GP been notified?"],
    "Behavioural Event": ["What triggered the behaviour?", "Was anyone hurt?", "What helped settle the situation?"],
    "Infection / Outbreak": ["How many people are affected?", "Has IPC been notified?"],
    "Regulatory Notification": ["Which framework (HIQA, MHC, HSA)?", "What is the notification reference?"],
    "Inspection / Regulatory Visit": ["Which regulator?", "Was the visit announced?"],
    "Incident / Accident": ["Was there an injury?", "Has family / NOK been informed?", "Has the GP been informed?"],
    "Other": ["What kind of event is this?"],
  };
  return {
    type,
    description: defaultDescription(type),
    active: true,
    order: i,
    restrictedByDefault: restricted,
    submitterCanViewOwn: type !== "Safeguarding Concern" && type !== "Regulatory Notification" && type !== "Inspection / Regulatory Visit",
    submitterCanSeeStatus: true,
    requiresManagerReview: true,
    requiresClosureApproval: closure,
    missingInfoPrompts: prompts[type] || [],
    defaultSeverity: type === "Safeguarding Concern" ? "High" : undefined,
  };
});

function defaultDescription(t: EventType): string {
  switch (t) {
    case "Incident / Accident": return "Accidents, falls, near-misses and other care incidents.";
    case "Complaint": return "Formal or informal complaints from residents, family or visitors.";
    case "Concern": return "Concerns raised about care, staffing or environment.";
    case "Compliment": return "Positive feedback about a person, team or service.";
    case "Information Request / Records Request": return "Subject access requests, FOI and records requests.";
    case "Safeguarding Concern": return "Concerns about abuse, neglect or exploitation. Restricted by default.";
    case "Medication Event": return "Medication errors, missed doses and PRN events.";
    case "Behavioural Event": return "Distressed reactions, agitation or behavioural incidents.";
    case "Infection / Outbreak": return "Suspected or confirmed infection clusters or outbreaks.";
    case "Regulatory Notification": return "Notifiable events for HIQA, MHC, HSA and similar.";
    case "Inspection / Regulatory Visit": return "Announced or unannounced inspections and regulator visits.";
    case "Other": return "Anything that does not fit another type.";
  }
}

const STORAGE_KEY = "logup.eventTypeSettings.v1";

function load(): EventTypeSettings[] {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: EventTypeSettings[] = JSON.parse(raw);
      // Merge with defaults so newly added Event Types appear.
      const byType = new Map(parsed.map(p => [p.type, p]));
      return DEFAULTS.map(d => byType.get(d.type) || d);
    }
  } catch { /* ignore */ }
  return DEFAULTS;
}

let state: EventTypeSettings[] = load();
let sortedSnapshot: EventTypeSettings[] = [...state].sort((a, b) => a.order - b.order);
const listeners = new Set<(s: EventTypeSettings[]) => void>();
function persist() {
  sortedSnapshot = [...state].sort((a, b) => a.order - b.order);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach(l => l(sortedSnapshot));
}

export const eventTypeSettingsStore = {
  get(): EventTypeSettings[] { return sortedSnapshot; },
  getActive(): EventTypeSettings[] { return this.get().filter(s => s.active); },
  getFor(type: EventType): EventTypeSettings | undefined { return state.find(s => s.type === type); },
  update(type: EventType, patch: Partial<EventTypeSettings>) {
    state = state.map(s => s.type === type ? { ...s, ...patch } : s);
    persist();
  },
  reorder(type: EventType, direction: "up" | "down") {
    const sorted = [...state].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(s => s.type === type);
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swap < 0 || swap >= sorted.length) return;
    [sorted[idx].order, sorted[swap].order] = [sorted[swap].order, sorted[idx].order];
    state = sorted;
    persist();
  },
  reset() { state = DEFAULTS.map(d => ({ ...d })); persist(); },
  subscribe(fn: (s: EventTypeSettings[]) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};

import { useSyncExternalStore } from "react";
export function useEventTypeSettings(): EventTypeSettings[] {
  return useSyncExternalStore(
    (cb) => eventTypeSettingsStore.subscribe(() => cb()),
    eventTypeSettingsStore.get,
    eventTypeSettingsStore.get,
  );
}
