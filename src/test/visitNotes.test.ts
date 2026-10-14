import { describe, expect, it } from "vitest";
import { noteRiskMentions, noteText, type StructuredVisitNote } from "@/lib/visitNoteRules";
import { encodeWav } from "@/lib/audio/recordWav";
const note = (concerns: string): StructuredVisitNote => ({ careGiven: "Made tea.", observations: "Not recorded", concerns, followUp: "Not recorded" });
describe("Visit note rules", () => {
  it("offers the requested risks without submitting an event", () => { expect(noteRiskMentions(note("Fell today. Refused tablets. Not eating. Bruising and confusion. Low mood. Safeguarding concern."))).toEqual(["Fall", "Refused medication", "Not eating", "Bruising", "Confusion", "Low mood", "Safeguarding"]); });
  it("does not invent risks in an ordinary note", () => { expect(noteRiskMentions(note("Not recorded"))).toEqual([]); expect(noteText(note("Not recorded"))).toContain("Care given: Made tea."); });
  it("encodes a complete PCM WAV with correct duration", async () => { const blob = encodeWav([new Float32Array(16000)], 16000); const view = new DataView(await blob.arrayBuffer()); expect(view.getUint32(40, true)).toBe(32000); expect(view.getUint32(24, true)).toBe(16000); expect(blob.type).toBe("audio/wav"); });
});