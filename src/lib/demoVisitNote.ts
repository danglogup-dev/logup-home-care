/**
 * Simulated visit-note draft for the fictional demo. No AI is called: the
 * carer's own sentences are sorted into sections by keyword, word for word.
 * Nothing is added that the carer did not write.
 */
import type { StructuredVisitNote } from "./visitNoteRules";

const OBSERVATION = /\b(ate|eat\w*|food|breakfast|lunch|dinner|tea|drink\w*|drank|fluid\w*|water|mood|happy|cheerful|tearful|skin|red\w*|sore|bruis\w*|walk\w*|mobil\w*|frame|stick|pain\w*|ache\w*|contin\w*|toilet\w*|pad\w*|sleep\w*)\b/i;
const CONCERN = /\b(fall|fell|fallen|refus\w*|declin\w*|confus\w*|disorient\w*|low mood|bruis\w*|safeguard\w*|worr\w*|concern\w*|not eating|did not eat|didn't eat)\b/i;
const FOLLOW_UP = /\b(follow[- ]?up|tell|inform|call|ring|contact|ask|check (again|tomorrow|later)|next visit|GP|nurse|family|daughter|son)\b/i;

export function simulateDemoNoteDraft(text: string): StructuredVisitNote {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const out: Record<keyof StructuredVisitNote, string[]> = { careGiven: [], observations: [], concerns: [], followUp: [] };
  for (const s of sentences) {
    if (CONCERN.test(s)) out.concerns.push(s);
    else if (FOLLOW_UP.test(s)) out.followUp.push(s);
    else if (OBSERVATION.test(s)) out.observations.push(s);
    else out.careGiven.push(s);
  }
  const join = (lines: string[]) => lines.length ? lines.join(" ") : "Not recorded";
  return { careGiven: join(out.careGiven), observations: join(out.observations), concerns: join(out.concerns), followUp: join(out.followUp) };
}

/** Fictional sample spoken note used in place of a real recording in the demo. */
export const DEMO_VOICE_TRANSCRIPT = "Helped Mary with her wash and getting dressed. She had porridge and half a cup of tea. She was in good form and chatty. Skin on her heels looked fine. She said her knee was a bit sore when walking to the kitchen. Tell the coordinator about the sore knee.";

const CHECKS: { re: RegExp; question: string }[] = [
  { re: /\b(drink\w*|drank|fluid\w*|water|tea|juice|cup)\b/i, question: "How much did the client drink during the visit?" },
  { re: /\b(ate|eat\w*|food|breakfast|lunch|dinner|porridge|meal)\b/i, question: "Did the client eat anything? If so, roughly how much?" },
  { re: /\b(mood|form|happy|cheerful|chatty|tearful|low|upset|settled)\b/i, question: "How was the client's mood?" },
  { re: /\b(skin|heel\w*|pressure|red\w*|bruis\w*)\b/i, question: "Did you notice anything about the client's skin?" },
  { re: /\b(walk\w*|mobil\w*|frame|stick|transfer\w*|stand\w*)\b/i, question: "How was the client's mobility today?" },
  { re: /\b(toilet\w*|contin\w*|pad\w*|urin\w*|bowel\w*)\b/i, question: "Any continence needs or changes?" },
];

/** Rule-based questions for topics the carer did not mention. Questions only, never answers. */
export function demoMissingQuestions(text: string): string[] {
  return CHECKS.filter((c) => !c.re.test(text)).map((c) => c.question);
}
