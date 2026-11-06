import { beforeEach, describe, expect, it, vi } from "vitest";

// The demo must never reach the backend: any backend call fails the test.
const backend = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/careNoteAi", () => ({ careFunction: () => { backend.calls++; throw new Error("backend called"); } }));

import { medicationDemoStore, resetMedicationDemo } from "@/lib/medicationDemoStore";
import { roleStore } from "@/lib/roleStore";
import { simulateDemoNoteDraft } from "@/lib/demoVisitNote";
import { signInErrorMessage } from "@/lib/logupAuth";

describe("fictional demo eMAR", () => {
  beforeEach(() => { resetMedicationDemo(); backend.calls = 0; roleStore.setPreset("keyworker-aisling"); });

  it("shows a fictional carer the medication tasks for her demo visit without any backend call", async () => {
    const data = await medicationDemoStore.loadVisit("VIS-DEMO-MARY-0930");
    expect(data.tasks.length).toBe(1);
    expect(data.tasks[0].medication.name).toBe("Paracetamol (fictional)");
    expect(data.access.organisation_id).toMatch(/^DEMO-/);
    expect(backend.calls).toBe(0);
  });

  it("still requires a reason for a refusal and raises a simulated exception", async () => {
    const { tasks } = await medicationDemoStore.loadVisit("VIS-DEMO-MARY-0930");
    const base = { taskId: tasks[0].id, visitId: "VIS-DEMO-MARY-0930", outcome: "refused" as const, eventAt: new Date().toISOString(), idempotencyKey: "k" };
    await expect(medicationDemoStore.submit({ ...base, reason: "" })).rejects.toThrow(/reason/);
    await medicationDemoStore.submit({ ...base, reason: "Declined, said she felt sick" });
    const after = await medicationDemoStore.loadVisit("VIS-DEMO-MARY-0930");
    expect(after.outcomes.at(-1)?.outcome).toBe("refused");
    expect(after.exceptions.at(-1)?.kind).toBe("refusal");
    expect(backend.calls).toBe(0);
  });

  it("populates manager oversight with fictional records", async () => {
    roleStore.setPreset("admin");
    const data = await medicationDemoStore.loadOversight();
    expect(data.tasks.length).toBeGreaterThan(0);
    expect(backend.calls).toBe(0);
  });
});

describe("simulated demo visit note", () => {
  it("uses only the carer's own sentences and marks empty sections Not recorded", () => {
    const note = simulateDemoNoteDraft("Helped Mary wash and dress. She ate half her porridge.");
    expect(note.careGiven).toBe("Helped Mary wash and dress.");
    expect(note.observations).toBe("She ate half her porridge.");
    expect(note.concerns).toBe("Not recorded");
    expect(note.followUp).toBe("Not recorded");
  });
  it("puts a refusal under Concerns", () => {
    expect(simulateDemoNoteDraft("She refused her tablets.").concerns).toBe("She refused her tablets.");
  });
});

describe("sign-in errors", () => {
  it("tells someone without an account to use the fictional demo", () => {
    expect(signInErrorMessage(new Error("Invalid login credentials"))).toMatch(/Explore fictional demo/);
  });
});
