export const sectionKeys = ["careGiven", "observations", "concerns", "followUp"] as const;
export const noteFormat = {
  type: "json_schema", name: "visit_note", strict: true,
  schema: { type: "object", additionalProperties: false, properties: Object.fromEntries(sectionKeys.map((key) => [key, { type: "string" }])), required: [...sectionKeys] },
};
export function validNote(value: unknown): value is Record<typeof sectionKeys[number], string> {
  return !!value && typeof value === "object" && sectionKeys.every((key) => typeof (value as Record<string, unknown>)[key] === "string" && ((value as Record<string, string>)[key].length <= 12000)) && Object.keys(value).length === sectionKeys.length;
}