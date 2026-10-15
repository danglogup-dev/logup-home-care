import { describe, it, expect, beforeEach } from "vitest";
import { staffAvailabilityStore, FRONTLINE_IDS } from "@/lib/staffAvailabilityStore";
import { carerEligibility } from "@/lib/rosterRules";
import { competencyCheck, preferenceApplies, validateCarerPreference, type CarerPreference } from "@/lib/visitRequirements";
import { workforceStore } from "@/lib/workforceStore";

const mon = new Date(2026, 9, 19);
const at = (h: number, m = 0) => { const x = new Date(mon); x.setHours(h, m, 0, 0); return x.toISOString(); };

describe("visit competencies and carer preferences", () => {
  beforeEach(() => staffAvailabilityStore.reset(new Date(2026, 9, 19, 8)));

  it("missing and expired competencies exclude; amber warns", () => {
    expect(competencyCheck("STAFF-NIAMH", ["q-meds"], new Date()).excluded).toEqual(["Medication Administration competency missing"]);
    const emma = workforceStore.getStaffMember("STAFF-EMMA")!.qualifications.find((q) => q.qualificationId === "q-firstaid")!;
    const dayAfter = new Date(Date.parse(emma.expiresOn) + 2 * 86400000);
    expect(competencyCheck("STAFF-EMMA", ["q-firstaid"], dayAfter).excluded).toEqual(["First Aid expired"]);
    const amberDay = new Date(Date.parse(emma.expiresOn) - 5 * 86400000);
    const r = competencyCheck("STAFF-EMMA", ["q-firstaid"], amberDay);
    expect(r.excluded).toEqual([]);
    expect(r.warnings.length).toBe(1);
  });

  it("required preference filters only when applicable; preferred ranks", () => {
    const s = staffAvailabilityStore.getState();
    const req: CarerPreference = { type: "female_required", appliesTo: "intimate_care_visits", reasonContext: "x", recordedByStaffId: "STAFF-DANIEL", recordedAt: "2026-10-01" };
    const intimate = carerEligibility([], FRONTLINE_IDS, [], at(9), at(9, 30), undefined, { siteId: "SITE-ECK", availability: s, preference: req, requirement: { requiredQualificationIds: [], supportCategories: ["intimate_care"] } });
    expect(intimate.unavailable.find((u) => u.staffId === "STAFF-PEADAR")?.preference).toBeTruthy();
    expect(intimate.unavailable.find((u) => u.staffId === "STAFF-EMMA")?.preference).toBeUndefined();
    const meal = carerEligibility([], FRONTLINE_IDS, [], at(9), at(9, 30), undefined, { siteId: "SITE-ECK", availability: s, preference: req, requirement: { requiredQualificationIds: [], supportCategories: ["meal_support"] } });
    expect(meal.unavailable.every((u) => !u.preference)).toBe(true);
    const soft = carerEligibility([], FRONTLINE_IDS, [], at(9), at(9, 30), undefined, { siteId: "SITE-ECK", availability: s, preference: { type: "male_preferred", appliesTo: "all_visits" }, requirement: { requiredQualificationIds: [], supportCategories: [] } });
    expect(soft.eligible).toContain("STAFF-EMMA");
    expect(soft.eligible[0]).toBe(soft.preferred![0]);
    expect(preferenceApplies({ type: "female_required", appliesTo: "intimate_care_visits" }, ["personal_care"])).toBe(false);
  });

  it("required preference cannot be saved without context", () => {
    expect(validateCarerPreference({ type: "female_required", appliesTo: "all_visits", recordedByStaffId: "STAFF-DANIEL", recordedAt: "2026-10-01" }).length).toBe(1);
    expect(validateCarerPreference({ type: "female_preferred", appliesTo: "all_visits" })).toEqual([]);
  });
});
