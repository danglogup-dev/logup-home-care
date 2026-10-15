import { describe, it, expect, beforeEach } from "vitest";
import { availabilityReasons, isPermittedArea, staffAvailabilityStore, FRONTLINE_IDS } from "@/lib/staffAvailabilityStore";
import { carerEligibility } from "@/lib/rosterRules";

const at = (d: Date, h: number, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x.toISOString(); };
const monday = () => { const d = new Date(2026, 9, 19); return d; };

describe("staff availability", () => {
  beforeEach(() => staffAvailabilityStore.reset(new Date(2026, 9, 19, 8)));
  it("excludes visits outside working hours with exact reason", () => {
    const s = staffAvailabilityStore.getState();
    expect(availabilityReasons(s, "STAFF-AISLING", at(monday(), 13, 30), at(monday(), 14, 30))).toEqual(["working hours end at 14:00"]);
    expect(availabilityReasons(s, "STAFF-AISLING", at(monday(), 9), at(monday(), 10))).toEqual([]);
  });
  it("excludes leave", () => {
    const tue = new Date(2026, 9, 20);
    expect(availabilityReasons(staffAvailabilityStore.getState(), "STAFF-SINEAD", at(tue, 9), at(tue, 10))).toContain("annual leave");
  });
  it("applies service-area coverage and overlaps in eligibility", () => {
    const s = staffAvailabilityStore.getState();
    expect(isPermittedArea(s, "STAFF-DARRAGH", "SITE-ECK")).toBe(true);
    expect(isPermittedArea(s, "STAFF-NIAMH", "SITE-ECK")).toBe(false);
    const visit = { id: "V1", staffIds: ["STAFF-EMMA"], status: "scheduled", scheduledStart: at(monday(), 9), scheduledEnd: at(monday(), 10) } as never;
    const r = carerEligibility([visit], FRONTLINE_IDS, [], at(monday(), 9, 30), at(monday(), 10), undefined, { siteId: "SITE-ECK", availability: s });
    expect(r.eligible).not.toContain("STAFF-EMMA");
    expect(r.eligible).not.toContain("STAFF-NIAMH");
    expect(r.eligible).toContain("STAFF-DARRAGH");
    expect(r.unavailable.find((u) => u.staffId === "STAFF-NIAMH")?.outsideArea).toBe(true);
    expect(r.unavailable.find((u) => u.staffId === "STAFF-EMMA")?.conflicts.length).toBe(1);
  });
});
