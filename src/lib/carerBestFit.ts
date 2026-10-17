// Explainable, deterministic ordering over hard-eligible IDs; no assignment or store writes.
import type { StaffId } from "./demoDataRegistry";
import type { Visit } from "./visitsStore";
import type { EligibilityContext } from "./rosterRules";
import { matchesPreference, competencyCheck } from "./visitRequirements";
import { travelCheck } from "./travelTime";
import { workforceStore } from "./workforceStore";

export const BEST_FIT_ORDER = "Recent continuity → client preference → estimated travel → scheduled care minutes, then visit count → primary service area → fewer required competencies due soon. Ties use staff ID. Unknown journeys rank after known estimates; no previous visit is not zero travel.";
export interface CarerFit {
  staffId: StaffId;
  recentVisits: number;
  preferenceMatch: boolean;
  travelMinutes?: number;
  travelBasis: "previous" | "next" | "unknown";
  visitsToday: number;
  scheduledMinutes: number;
  primaryAreaMatch: boolean;
  competencyWarnings: number;
  requiredCompetencies: number;
}

/** Lexicographic order: each visible factor breaks ties in the factors before it. No weighted score. */
export function compareCarerFit(a: CarerFit, b: CarerFit): number {
  const travelA = a.travelMinutes ?? Infinity, travelB = b.travelMinutes ?? Infinity;
  return b.recentVisits - a.recentVisits
    || Number(b.preferenceMatch) - Number(a.preferenceMatch)
    || (travelA === travelB ? 0 : travelA < travelB ? -1 : 1)
    || a.scheduledMinutes - b.scheduledMinutes
    || a.visitsToday - b.visitsToday
    || Number(b.primaryAreaMatch) - Number(a.primaryAreaMatch)
    || a.competencyWarnings - b.competencyWarnings
    || a.staffId.localeCompare(b.staffId);
}

export function recentContinuity(visits: readonly Visit[], staffId: StaffId, clientId: string, asOf: Date): number {
  const cutoff = new Date(asOf); cutoff.setDate(cutoff.getDate() - 30);
  return visits.filter((v) => v.status === "completed" && v.clientId === clientId && v.staffIds.includes(staffId)
    && Date.parse(v.checkOutAt ?? v.scheduledEnd) >= cutoff.getTime()
    && Date.parse(v.checkOutAt ?? v.scheduledEnd) < asOf.getTime()).length;
}

export function dailyWorkload(visits: readonly Visit[], staffId: StaffId, start: string, excludeId?: string) {
  const day = new Date(start).toDateString();
  const mine = visits.filter((v) => v.id !== excludeId && v.status !== "cancelled" && v.staffIds.includes(staffId) && new Date(v.scheduledStart).toDateString() === day);
  return { visitsToday: mine.length, scheduledMinutes: mine.reduce((sum, v) => sum + Math.max(0, (Date.parse(v.scheduledEnd) - Date.parse(v.scheduledStart)) / 60000), 0) };
}

/** Caller supplies only IDs that passed carerEligibility; excluded IDs never enter this list. */
export function rankEligibleCarers(visits: readonly Visit[], eligible: readonly StaffId[], start: string, end: string, excludeId: string | undefined, ctx: EligibilityContext, now = new Date()): CarerFit[] {
  const asOf = new Date(Math.min(Date.parse(start), now.getTime()));
  return eligible.map((staffId): CarerFit => {
    const travel = ctx.clientId ? travelCheck(visits, staffId, ctx.clientId, start, end, excludeId, ctx.locate) : undefined;
    const leg = travel?.previous ?? travel?.next;
    const qualificationIds = ctx.requirement?.requiredQualificationIds ?? [];
    return {
      staffId,
      recentVisits: ctx.clientId ? recentContinuity(visits, staffId, ctx.clientId, asOf) : 0,
      preferenceMatch: matchesPreference(ctx.preference, ctx.requirement?.supportCategories ?? [], staffId) === true,
      travelMinutes: leg?.minutes,
      travelBasis: leg?.minutes === undefined ? "unknown" : travel?.previous ? "previous" : "next",
      ...dailyWorkload(visits, staffId, start, excludeId),
      primaryAreaMatch: workforceStore.getStaffMember(staffId)?.primarySiteId === ctx.siteId,
      competencyWarnings: competencyCheck(staffId, qualificationIds, new Date(start)).warnings.length,
      requiredCompetencies: qualificationIds.length,
    };
  }).sort(compareCarerFit);
}