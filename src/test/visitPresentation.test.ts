import { describe, expect, it } from "vitest";
import { ROLE_PRESETS, canAccess } from "@/lib/roleStore";
import { PEOPLE_SUPPORTED } from "@/lib/demoDataRegistry";
import { clientDisplayName, clientTown, directionsUrl, myVisits, visitsOnDate } from "@/lib/visitPresentation";
import type { Visit } from "@/lib/visitsStore";

const role = ROLE_PRESETS.find((r) => r.id === "frontline");
const visit = (id: string, clientId: Visit["clientId"], hour: number, staffIds: Visit["staffIds"] = ["STAFF-LIAM"]): Visit => ({
  id, clientId, staffIds, scheduledStart: new Date(2026, 9, 14, hour).toISOString(), scheduledEnd: new Date(2026, 9, 14, hour, 30).toISOString(), status: "scheduled",
});

describe("frontline visit presentation", () => {
  it("limits visits by staff ID and current client service area, then sorts by time", () => {
    if (!role) throw new Error("Missing frontline preset");
    const visits = [visit("later", "PS-001", 16), visit("other-staff", "PS-001", 8, ["STAFF-EMMA"]), visit("other-area", "PS-004", 8), visit("early", "PS-003", 7)];
    expect(myVisits(visits, PEOPLE_SUPPORTED, role).map((v) => v.id)).toEqual(["early", "later"]);
  });
  it("uses the local calendar date, not UTC date strings", () => {
    const today = visit("today", "PS-001", 23);
    expect(visitsOnDate([today], new Date(2026, 9, 14, 8))).toEqual([today]);
    expect(visitsOnDate([today], new Date(2026, 9, 15, 8))).toEqual([]);
  });
  it("uses preferred names, towns and encoded Google Maps direction links", () => {
    const client = PEOPLE_SUPPORTED.find((p) => p.id === "PS-001");
    if (!client) throw new Error("Missing client");
    expect(clientDisplayName(client)).toBe("Paddy");
    expect(clientTown(client)).toBe("Youghal");
    const url = directionsUrl(client);
    if (!url) throw new Error("Missing directions");
    expect(new URL(url).searchParams.get("destination")).toContain(client.eircode);
    expect(directionsUrl({ ...client, homeAddress: undefined, eircode: undefined })).toBeUndefined();
  });
  it("only grants the carer visit module to frontline", () => {
    expect(canAccess("visits.today", "frontline")).toBe(true);
    for (const other of ["admin", "manager", "viewonly", "external"] as const) expect(canAccess("visits.today", other)).toBe(false);
  });
});