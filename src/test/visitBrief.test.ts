import { describe, expect, it, vi } from "vitest";
import { ROLE_PRESETS } from "@/lib/roleStore";
import { visitsStore } from "@/lib/visitsStore";
import { visitBriefSources } from "@/lib/visitBriefSources";
import { carePlansStore } from "@/lib/carePlansStore";
import { incidentsStore } from "@/lib/incidentsStore";
import { visitNotesStore } from "@/lib/visitNotesStore";
import { decodePCM } from "@/lib/audio/streamSpeech";
function fixture() {
  const role = ROLE_PRESETS.find((r) => r.id === "frontline");
  if (!role) throw new Error("No carer");
  const visit = visitsStore.getState().visits.find((v) => v.staffIds.includes(role.staffId) && v.clientId === "PS-001");
  if (!visit) throw new Error("No visit"); return { role, visit };
}
describe("visit brief sources", () => {
  it("includes only published, non-restricted sections and never a draft", () => {
    const { role, visit } = fixture();
    const current = carePlansStore.getCurrentVersion(visit.clientId);
    if (!current) throw new Error("No plan");
    const spy = vi.spyOn(carePlansStore, "getCurrentVersion").mockReturnValue({ ...current, sections: [{ key: "a", body: "visible" }, { key: "b", body: "secret", visibility: "restricted" }, { key: "c", body: "unaccepted", contentState: "ai_draft" }] });
    expect(visitBriefSources(visit.id, role).carePlan?.sections.map(s => s.text)).toEqual(["visible"]);
    spy.mockReturnValue({ ...current, status: "draft_in_progress" });
    expect(visitBriefSources(visit.id, role).carePlan).toBeNull(); spy.mockRestore();
  });
  it("excludes hidden, other-client and closed Events; fingerprints new accessible Events", () => {
    const { role, visit } = fixture();
    const spy = vi.spyOn(incidentsStore, "getPending").mockReturnValue([]);
    const before = JSON.stringify(visitBriefSources(visit.id, role));
    const e = { id: "E1", serviceUserId: visit.clientId, site: role.scope[0], createdByStaffId: role.staffId, visibility: "submitter_full", lifecycleStatus: "Submitted", column: "new", dateTime: "2026-10-14", summary: "Changed appetite", severity: "Low" };
    spy.mockReturnValue([e, { ...e, id: "E2", visibility: "manager_only" }, { ...e, id: "E3", lifecycleStatus: "Closed" }] as ReturnType<typeof incidentsStore.getPending>);
    expect(visitBriefSources(visit.id, role).events.map(x => x.id)).toEqual(["E1"]);
    expect(JSON.stringify(visitBriefSources(visit.id, role))).not.toBe(before); spy.mockRestore();
  });
  it("takes the latest three confirmed notes by client ID", () => {
    const { role, visit } = fixture();
    const spy = vi.spyOn(visitNotesStore, "getState").mockReturnValue([1, 4, 3, 2].map(i => ({ id: String(i), client_id: visit.clientId, confirmed_at: `2026-10-14T0${i}:00:00Z`, final_text: { careGiven: String(i), observations: "", concerns: "", followUp: "" } })) as ReturnType<typeof visitNotesStore.getState>);
    expect(visitBriefSources(visit.id, role).notes.map(n => n.id)).toEqual(["4", "3", "2"]); spy.mockRestore();
  });
  it("carries odd PCM bytes across speech chunks", () => {
    const a = decodePCM(new Uint8Array(), new Uint8Array([0]));
    const b = decodePCM(a.pending, new Uint8Array([64]));
    expect(b.samples[0]).toBe(0.5); expect(b.pending.length).toBe(0);
  });
});
