/**
 * Fictional historical visit notes so the demo looks like a real service.
 * Each note is attributed to the visit's own carer at check-out, marked demo,
 * and carries "human_confirmed" provenance (the fictional carer confirmed it).
 * A few of today's completed visits are deliberately left without a note.
 * Mary O'Sullivan's recent notes describe a repeated mobility observation
 * (Insight Story A). Nothing is invented beyond these fictional records.
 */
import type { Visit, VisitTemplate } from "./visitsStore";
import type { VisitNote } from "./visitNotesStore";
import type { StructuredVisitNote } from "./visitNoteRules";
import type { FieldProvenance } from "./incidentsStore";

const OBS = [
  "Ate most of the meal offered and drank a full cup of tea. In good form and chatty. Walked to the kitchen with usual aid.",
  "Had a good breakfast and a glass of water. Settled and cheerful. Skin checked where care given, no concerns seen.",
  "Ate a small sandwich and finished a cup of tea. Content, watching television. Moving around as usual.",
  "Drank juice and tea during the visit. Spoke about family visiting. Continence needs met, pad changed.",
];

/** Mary O'Sullivan, newest last: a repeated, coherent mobility observation. */
export const MARY_MOBILITY_OBSERVATIONS = [
  "Ate half her porridge and drank tea. Mary seemed unsteady walking from the bedroom to the kitchen and held on to furniture.",
  "Good form. Mary was unsteady standing up from the armchair and needed more help to stand than usual. Said her knee was sore.",
  "Drank a full cup of tea. Mary held on to furniture walking to the bathroom and said she felt wobbly. Stick not used indoors.",
  "Mary was unsteady again walking to the kitchen and stopped twice to rest. She said her knee was sore. Told the office.",
];
export const STORY_A_CLIENT = "PS-002";

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function buildHistoricalDemoNotes(visits: readonly Visit[], templates: readonly VisitTemplate[], now = new Date()): VisitNote[] {
  const todayKey = now.toDateString();
  const byTemplate = new Map(templates.map((t) => [t.id, t]));
  const completed = visits.filter((v) => v.status === "completed" && v.checkOutAt && v.staffIds.length && Date.parse(v.checkOutAt) <= now.getTime())
    .sort((a, b) => a.checkOutAt!.localeCompare(b.checkOutAt!));
  const maryRecent = completed.filter((v) => v.clientId === STORY_A_CLIENT).slice(-MARY_MOBILITY_OBSERVATIONS.length);
  let todayIndex = 0;
  return completed.flatMap((v): VisitNote[] => {
    const today = new Date(v.scheduledStart).toDateString() === todayKey;
    // Deliberate gaps: a few of today's visits still need their note.
    if (today && v.clientId !== STORY_A_CLIENT && todayIndex++ % 12 === 5) return [];
    const t = v.templateId ? byTemplate.get(v.templateId) : undefined;
    const maryIdx = maryRecent.findIndex((m) => m.id === v.id);
    const obs = maryIdx >= 0 ? MARY_MOBILITY_OBSERVATIONS[maryIdx] : OBS[hash(v.id) % OBS.length];
    const text: StructuredVisitNote = {
      careGiven: t?.tasks.length ? `Supported with: ${t.tasks.join(", ").toLowerCase()}.` : v.purpose ? `${v.purpose}.` : "Visit care given as planned.",
      observations: obs,
      concerns: maryIdx >= 0 ? "Unsteady on feet indoors (see observations)." : "None noted",
      followUp: maryIdx === MARY_MOBILITY_OBSERVATIONS.length - 1 ? "Office informed about unsteadiness and sore knee." : "None",
    };
    const at = v.checkOutAt!; const staff = v.staffIds[0];
    const provenance = (Object.keys(text) as (keyof StructuredVisitNote)[]).map((key) => ({ key, label: key, origin: "source", originalValue: text[key], value: text[key], state: "human_confirmed", edited: false, confirmedByStaffId: staff, confirmedAt: at } as FieldProvenance));
    return [{ id: `DEMO-HIST-NOTE-${v.id}`, visit_id: v.id, client_id: v.clientId, transcript: `${text.careGiven} ${obs}`, ai_draft: text, final_text: text, confirmed_by_staff_id: staff, confirmed_at: at, provenance, demo: true }];
  });
}
