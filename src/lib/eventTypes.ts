// Event Types — user-facing classification for the Events module
// (formerly the Incidents module). Existing records default to
// "Incident / Accident" so historical data stays consistent.

export type EventType =
  | "Incident / Accident"
  | "Complaint"
  | "Concern"
  | "Compliment"
  | "Information Request / Records Request"
  | "Safeguarding Concern"
  | "Medication Event"
  | "Behavioural Event"
  | "Infection / Outbreak"
  | "Regulatory Notification"
  | "Inspection / Regulatory Visit"
  | "Other";

export const EVENT_TYPES: EventType[] = [
  "Incident / Accident",
  "Complaint",
  "Concern",
  "Compliment",
  "Information Request / Records Request",
  "Safeguarding Concern",
  "Medication Event",
  "Behavioural Event",
  "Infection / Outbreak",
  "Regulatory Notification",
  "Inspection / Regulatory Visit",
  "Other",
];

export const DEFAULT_EVENT_TYPE: EventType = "Incident / Accident";

/**
 * Lightweight heuristic to suggest the most likely Event Type from
 * the user's natural-language description. The AI never decides — the
 * suggestion is always confirmable / changeable by the human.
 */
export function inferEventType(text: string | undefined | null): EventType {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return DEFAULT_EVENT_TYPE;

  if (/\b(safeguard|abuse|neglect|exploit|assault|disclos)/.test(t)) return "Safeguarding Concern";
  if (/\b(complain|complaint|unhappy|dissatisf|angry with)/.test(t)) return "Complaint";
  if (/\b(thank you|grateful|compliment|praise|kind word|well done)/.test(t)) return "Compliment";
  if (/\b(outbreak|infection|covid|norovirus|flu|d&v|diarrhoea|vomiting|cluster)/.test(t)) return "Infection / Outbreak";
  if (/\b(med|medication|dose|tablet|warfarin|insulin|mar chart|missed dose|prn)/.test(t)) return "Medication Event";
  if (/\b(behaviou?r|agitat|aggress|verbal abuse|hit|kick|wander|absconded)/.test(t)) return "Behavioural Event";
  if (/\b(hiqa|mhc|notifiable|nf0?\d|regulatory notification|notify the regulator)/.test(t)) return "Regulatory Notification";
  if (/\b(inspection|inspector visit|regulatory visit|unannounced visit)/.test(t)) return "Inspection / Regulatory Visit";
  if (/\b(records request|subject access|sar|foi|information request|data request)/.test(t)) return "Information Request / Records Request";
  if (/\b(concern|worried about|worried that|raised a concern)/.test(t)) return "Concern";
  if (/\b(fall|fell|slip|trip|injur|bruis|cut|laceration|skin tear|wound|hurt|accident|burn|choke|near miss)/.test(t))
    return "Incident / Accident";

  return DEFAULT_EVENT_TYPE;
}
