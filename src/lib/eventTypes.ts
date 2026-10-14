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
  | "Missed visit"
  | "Late visit"
  | "No answer at door"
  | "Unable to access home"
  | "Found on floor"
  | "Environmental hazard"
  | "Lone worker concern"
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
  "Missed visit",
  "Late visit",
  "No answer at door",
  "Unable to access home",
  "Found on floor",
  "Environmental hazard",
  "Lone worker concern",
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
  if (/\b(lone[- ]work(er|ing)|working alone|worker safety|carer safety|unsafe (alone|to work)|felt unsafe)\b/.test(t)) return "Lone worker concern";
  if (/\b(found|lying|discovered)\b.{0,50}\b(on (the )?floor|on (the )?ground)\b/.test(t)) return "Found on floor";
  if (/\b(no answer( at (the )?door)?|not answering (the )?door|nobody answered|no response at (the )?door)\b/.test(t)) return "No answer at door";
  if (/\b(unable to (access|enter)|cannot (access|enter)|could not (access|enter)|couldn't (access|enter)|locked out|key[- ]?safe|access code|door locked)\b/.test(t)) return "Unable to access home";
  if (/\b(missed (visit|call)|visit (was )?missed|carer (did not|didn't) (arrive|attend)|no[- ]show|unattended visit)\b/.test(t)) return "Missed visit";
  if (/\b(late (visit|call|arrival)|visit (was )?late|carer (was |is |arrived )?late|delayed (visit|call)|running late)\b/.test(t)) return "Late visit";
  if (/\b(environmental hazard|trip(ping)? hazard|blocked exit|exposed wir(e|es|ing)|gas (leak|smell)|unsafe home|fire hazard|loose rug|broken heating)\b/.test(t)) return "Environmental hazard";
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
