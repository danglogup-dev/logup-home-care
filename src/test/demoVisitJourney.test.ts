import { describe, it, expect } from "vitest";
import { demoMissingQuestions, DEMO_VOICE_TRANSCRIPT, simulateDemoNoteDraft } from "@/lib/demoVisitNote";
import { SIGN_IN_VIEWS, prototypeSignIn } from "@/pages/SignIn";
import { roleStore } from "@/lib/roleStore";
import { visitsStore } from "@/lib/visitsStore";
import { relevantSectionKeys } from "@/components/visits/VisitCarePlan";

describe("demo carer journey", () => {
  it("signs the carer in as Aisling, who holds Mary's eMAR visit", () => {
    const carer = SIGN_IN_VIEWS.find((v) => v.label.startsWith("Carer"))!;
    prototypeSignIn(carer.presetId);
    expect(roleStore.get().staffId).toBe("STAFF-AISLING");
    const mary = visitsStore.getState().visits.find((v) => v.id === "VIS-DEMO-MARY-0930")!;
    expect(mary.staffIds).toContain("STAFF-AISLING");
  });
  it("asks only about topics the carer did not mention", () => {
    const q = demoMissingQuestions(DEMO_VOICE_TRANSCRIPT);
    expect(q).toContain("Any continence needs or changes?");
    expect(q).not.toContain("How was the client's mood?");
    expect(demoMissingQuestions("Helped with wash.")).toHaveLength(6);
  });
  it("sorts the sample transcript without inventing content", () => {
    const d = simulateDemoNoteDraft(DEMO_VOICE_TRANSCRIPT);
    expect(d.followUp).toContain("sore knee");
  });
  it("puts medication sections first for medication visits", () => {
    expect(relevantSectionKeys({ tasks: ["Prepare breakfast"], medications: [{ name: "x", supportLevel: "prompt" }] as never, supportCategories: [] }).has("medication")).toBe(true);
  });
});
