import { noteFormat, validNote } from "../_shared/note-schema.ts";
Deno.test("strict note schema requires all four sections", () => {
  if (noteFormat.schema.required.length !== 4 || noteFormat.schema.additionalProperties !== false) throw new Error("Non-strict schema");
  if (!validNote({ careGiven: "Made tea", observations: "Not recorded", concerns: "Not recorded", followUp: "Not recorded" })) throw new Error("Valid note rejected");
  if (validNote({ careGiven: "Made tea" }) || validNote({ careGiven: "Tea", observations: "", concerns: "", followUp: "", extra: "invented" })) throw new Error("Invalid note accepted");
});