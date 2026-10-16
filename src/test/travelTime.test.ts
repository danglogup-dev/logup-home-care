import { describe, it, expect } from "vitest";
import { legLevel, travelBetween, travelCheck, travelLines, TRAVEL_BUFFER_MINUTES } from "@/lib/travelTime";
import type { Visit } from "@/lib/visitsStore";

const locs: Record<string, { lat: number; lng: number }> = { A: { lat: 51.9536, lng: -7.8506 }, B: { lat: 51.9153, lng: -8.1752 }, C: { lat: 51.9536, lng: -7.8506 } };
const locate = (id: string) => locs[id];
const v = (id: string, clientId: string, s: string, e: string): Visit => ({ id, clientId, staffIds: ["STAFF-EMMA"], scheduledStart: `2026-10-20T${s}:00`, scheduledEnd: `2026-10-20T${e}:00`, status: "scheduled" } as unknown as Visit);

describe("travel feasibility", () => {
  it("uses a 5 minute buffer", () => expect(TRAVEL_BUFFER_MINUTES).toBe(5));
  it("is deterministic", () => {
    expect(travelBetween("A", "B", undefined, locate)).toEqual(travelBetween("A", "B", undefined, locate));
  });
  it("brief example: 18 min travel, 15 min gap is a conflict", () => expect(legLevel(15, 18)).toBe("conflict"));
  it("gap covering travel but not buffer is tight", () => expect(legLevel(20, 18)).toBe("tight"));
  it("gap covering travel plus buffer is feasible", () => expect(legLevel(23, 18)).toBe("feasible"));
  it("unknown travel never invents a conflict", () => expect(legLevel(0, undefined)).toBe("feasible"));
  it("flags previous visit that is too far to reach", () => {
    const c = travelCheck([v("p", "B", "09:00", "09:30")], "STAFF-EMMA", "A", "2026-10-20T09:35:00", "2026-10-20T10:00:00", undefined, locate);
    expect(c.previous?.level).toBe("conflict");
    expect(travelLines(c, "2026-10-20T09:35:00").conflict[0]).toMatch(/^Travel conflict — earliest estimated arrival/);
  });
  it("flags next visit too soon after", () => {
    const c = travelCheck([v("n", "B", "10:05", "10:30")], "STAFF-EMMA", "A", "2026-10-20T09:30:00", "2026-10-20T10:00:00", undefined, locate);
    expect(c.next?.level).toBe("conflict");
  });
  it("no previous or next visit means feasible", () => {
    expect(travelCheck([], "STAFF-EMMA", "A", "2026-10-20T09:30:00", "2026-10-20T10:00:00", undefined, locate).level).toBe("feasible");
  });
  it("same location back to back is feasible", () => {
    expect(travelCheck([v("p", "C", "09:00", "09:25")], "STAFF-EMMA", "A", "2026-10-20T09:30:00", "2026-10-20T10:00:00", undefined, locate).level).toBe("feasible");
  });
});
