import { describe, expect, it } from "vitest";
import { hoursByClientWeek, weekStartOf } from "@/lib/hoursReport";
import { familySummariesStore } from "@/lib/familySummariesStore";
import { ROLE_PRESETS, canAccess, personInScope } from "@/lib/roleStore";
import { workforceStore } from "@/lib/workforceStore";
import type { Visit } from "@/lib/visitsStore";
import type { ServiceUser } from "@/lib/serviceUsersStore";

const family = ROLE_PRESETS.find((p) => p.id === "family-patrick")!;

describe("family role", () => {
  it("is limited to the family page and the linked client", () => {
    expect(canAccess("family.portal", "family")).toBe(true);
    expect(canAccess("visits.today", "family")).toBe(false);
    expect(canAccess("incidents.capture", "family")).toBe(false);
    expect(personInScope("PS-001", family)).toBe(true);
    expect(personInScope("PS-002", family)).toBe(false);
  });
  it("never sees unapproved summaries and cannot draft or approve", async () => {
    expect(familySummariesStore.approvedFor("PS-001")).toEqual([]);
    await expect(familySummariesStore.draft("PS-001", "2026-10-14", family)).rejects.toThrow();
  });
});

describe("hours report", () => {
  it("counts scheduled length of completed visits per Monday week", () => {
    const client = { id: "PS-001", hseApprovedHoursPerWeek: 14 } as unknown as ServiceUser;
    const v = (id: string, start: string, status: Visit["status"]) => ({ id, clientId: "PS-001", staffIds: [], scheduledStart: start, scheduledEnd: new Date(new Date(start).getTime() + 45 * 60000).toISOString(), status }) as unknown as Visit;
    const rows = hoursByClientWeek([v("a", "2026-10-13T08:00:00", "completed"), v("b", "2026-10-14T08:00:00", "missed"), v("c", "2026-10-15T08:00:00", "scheduled")], [client]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weekStart: weekStartOf(new Date("2026-10-14T08:00:00")), deliveredHours: 0.75, plannedHours: 1.5, approvedHours: 14, missedVisits: 1 });
  });
});

describe("home support rails", () => {
  it("adds the five rails", () => {
    const names = workforceStore.getQualificationTypes().map((q) => q.name);
    for (const n of ["QQI Level 5 Care Skills", "Garda vetting", "Lone working", "Full driving licence", "Business insurance"]) expect(names).toContain(n);
  });
});
