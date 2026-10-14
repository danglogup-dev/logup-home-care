export const NOTE_SECTIONS = [{ key: "careGiven", label: "Care given" }, { key: "observations", label: "Observations" }, { key: "concerns", label: "Concerns" }, { key: "followUp", label: "Follow-up" }] as const;
export type StructuredVisitNote = Record<typeof NOTE_SECTIONS[number]["key"], string>;
export const noteText = (note: StructuredVisitNote) => NOTE_SECTIONS.map(({ key, label }) => `${label}: ${note[key]}`).join("\n\n");
export function noteRiskMentions(note: StructuredVisitNote): string[] {
  const text = noteText(note);
  const rules: [string, RegExp][] = [["Fall", /\b(fall|falls|fell|fallen)\b/i], ["Refused medication", /\b(refus\w*|declin\w*|would not|did not|not tak\w*)\b[^.!?\n]{0,60}\b(med\w*|tablet\w*|dose\w*)\b|\b(med\w*|tablet\w*|dose\w*)\b[^.!?\n]{0,60}\b(refus\w*|declin\w*)\b/i], ["Not eating", /\b(not eating|did not eat|didn't eat|has not eaten|hasn't eaten|refused (food|breakfast|lunch|dinner|meal)|poor appetite|no appetite)\b/i], ["Bruising", /\b(bruis\w*)\b/i], ["Confusion", /\b(confus\w*|disorient\w*)\b/i], ["Low mood", /\b(low mood|tearful|depress\w*|sad|withdrawn)\b/i], ["Safeguarding", /\b(safeguard\w*|abus\w*|neglect\w*)\b/i]];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}