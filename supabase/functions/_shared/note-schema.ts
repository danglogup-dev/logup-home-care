export const sectionKeys = ["careGiven", "observations", "concerns", "followUp"] as const;
export const noteFormat = {
  type: "json_schema", name: "visit_note", strict: true,
  schema: { type: "object", additionalProperties: false, properties: { ...Object.fromEntries(sectionKeys.map((key) => [key, { type: "string" }])), questions: { type: "array", items: { type: "string" }, maxItems: 5 } }, required: [...sectionKeys, "questions"] },
};
export function validNote(value: unknown): value is Record<typeof sectionKeys[number], string> {
  if (!value || typeof value !== "object") return false;
  const note = value as Record<string, unknown>;
  return sectionKeys.every((key) => typeof note[key] === "string" && (note[key] as string).length <= 12000)
    && (note.questions === undefined || (Array.isArray(note.questions) && note.questions.length <= 5 && note.questions.every((q) => typeof q === "string" && q.length <= 500)))
    && Object.keys(note).every((key) => sectionKeys.includes(key as typeof sectionKeys[number]) || key === "questions");
}