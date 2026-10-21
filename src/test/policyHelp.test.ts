import { describe, expect, it } from "vitest";
import { ROLE_PRESETS } from "@/lib/roleStore";
import { policiesStore } from "@/lib/policiesStore";
import { approvedPolicySources, excerptAnswer, validateAiAnswer, policyHelpAudit, auditFor, NOT_FOUND_MESSAGE } from "@/lib/policyHelp";

const carer = ROLE_PRESETS.find((r) => r.id === "frontline")!;
const live = () => policiesStore.getLiveVersion("doc-no-access")!;

describe("policy help sources", () => {
  it("uses only the current published version — never drafts or archived versions", () => {
    const sources = approvedPolicySources(carer).filter((s) => s.docId === "doc-no-access");
    expect(sources.length).toBeGreaterThan(0);
    expect(new Set(sources.map((s) => s.versionNumber))).toEqual(new Set(["4.1"]));
    expect(sources.some((s) => s.text.includes("DRAFT ONLY"))).toBe(false);
    expect(sources.some((s) => s.text.includes("Wait five minutes"))).toBe(false);
  });
  it("answers the door question from No Access policy 4.1 with a source", () => {
    const a = excerptAnswer("What do I do if nobody answers the door?", approvedPolicySources(carer));
    expect(a.found).toBe(true);
    expect(a.primary?.title).toBe("No Access / Missed Visit Policy");
    expect(a.primary?.versionNumber).toBe("4.1");
    expect(a.steps.every((s) => s.sourceId === a.primary?.sourceId)).toBe(true);
  });
  it("returns no answer when no approved policy matches", () => {
    expect(excerptAnswer("What is the wifi password for the van?", approvedPolicySources(carer)).found).toBe(false);
    expect(NOT_FOUND_MESSAGE).toBe("I couldn’t find this in your organisation’s approved policies.");
  });
  it("rejects AI answers that cite a source that was not supplied", () => {
    const supplied = approvedPolicySources(carer).slice(0, 2);
    const ok = validateAiAnswer({ found: true, primarySourceId: supplied[0].sourceId, steps: [{ text: "x", sourceId: supplied[0].sourceId }], alsoRelevantSourceIds: [], possibleConflict: false }, supplied, "q");
    expect(ok.found).toBe(true);
    const bad = validateAiAnswer({ found: true, primarySourceId: supplied[0].sourceId, steps: [{ text: "x", sourceId: "invented#1" }], alsoRelevantSourceIds: [], possibleConflict: false }, supplied, "q");
    expect(bad.found).toBe(false);
  });
  it("flags safety questions with the escalation message", () => {
    expect(excerptAnswer("Client found on the floor and not breathing", approvedPolicySources(carer)).safety).toBe(true);
  });
  it("external users get no policy sources", () => {
    expect(approvedPolicySources({ ...carer, role: "external" })).toEqual([]);
  });
  it("stops using the old version once a new one is published", () => {
    const old = live();
    const draft = policiesStore.getVersions("doc-no-access").find((v) => v.status === "draft")!;
    policiesStore.publish(draft.id, "Test");
    const sources = approvedPolicySources(carer).filter((s) => s.docId === "doc-no-access");
    expect(sources.every((s) => s.versionId === draft.id)).toBe(true);
    expect(sources.some((s) => s.versionId === old.id)).toBe(false);
  });
  it("audits question, source version and found state without the answer", () => {
    policyHelpAudit.reset();
    const a = excerptAnswer("nobody answers the door", approvedPolicySources(carer));
    auditFor(carer.staffId, "nobody answers the door", a);
    const [e] = policyHelpAudit.list();
    expect(e).toMatchObject({ staffId: carer.staffId, question: "nobody answers the door", sourceFound: true, sourceVersionId: a.primary?.versionId });
    expect(Object.keys(e)).not.toContain("steps");
  });
});
