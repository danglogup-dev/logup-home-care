import { useState } from "react";
import { Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BEST_FIT_ORDER } from "@/lib/carerBestFit";
import { STAFF_BY_ID, type StaffId } from "@/lib/demoDataRegistry";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { clientDisplayName } from "@/lib/visitPresentation";
import type { CarerEligibility } from "@/lib/rosterRules";
import type { ReactNode } from "react";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false });
type Unavailable = CarerEligibility["unavailable"][number];

export function unavailableReason(conflicts: Unavailable["conflicts"]): string {
  return conflicts.map((v) => {
    const c = serviceUsersStore.getById(v.clientId);
    return `another visit overlaps ${hm(v.scheduledStart)}–${hm(v.scheduledEnd)}${c ? ` (${clientDisplayName(c)})` : ""}`;
  }).join("; ");
}

export type ExclusionGroup = "Scheduling" | "Travel" | "Availability" | "Service area" | "Competency" | "Client requirement";
/** Every exact reason, grouped. A carer can have several. */
export function exclusionGroups(u: Unavailable): { group: ExclusionGroup; lines: string[] }[] {
  const g: { group: ExclusionGroup; lines: string[] }[] = [
    { group: "Scheduling", lines: u.conflicts.map((v) => { const c = serviceUsersStore.getById(v.clientId); return `Another visit ${hm(v.scheduledStart)}–${hm(v.scheduledEnd)}${c ? ` (${clientDisplayName(c)})` : ""}`; }) },
    { group: "Travel", lines: u.travel ?? [] },
    { group: "Availability", lines: (u.reasons ?? []).map((r) => r.charAt(0).toUpperCase() + r.slice(1)) },
    { group: "Service area", lines: u.outsideArea ? ["Outside permitted service area"] : [] },
    { group: "Competency", lines: u.competency ?? [] },
    { group: "Client requirement", lines: u.preference ? [u.preference] : [] },
  ];
  return g.filter((x) => x.lines.length);
}
export function exclusionLines(u: Unavailable): string[] {
  return exclusionGroups(u).flatMap((g) => g.lines.map((l) => `${g.group} — ${l}`));
}
/** Only overlap, availability and service area are operational (overridable by admin/manager). */
export const isOperationalOnly = (u: Unavailable) => !(u.competency?.length) && !u.preference;

export function SuitabilityTicks({ eligibility, staffId }: { eligibility: CarerEligibility; staffId: StaffId }) {
  const fit = eligibility.bestFit?.find((f) => f.staffId === staffId);
  const ticks = ["Available", "Permitted service area"];
  if (fit) {
    if (fit.travelMinutes !== undefined) ticks.push(`${fit.travelMinutes} min estimated travel ${fit.travelBasis === "previous" ? "from previous visit" : "to next visit"}`);
    if (fit.requiredCompetencies === 0) ticks.push("No visit-specific competencies required");
    else ticks.push(fit.competencyWarnings ? "Required competencies valid — some due soon" : "All required competencies current");
    if (fit.primaryAreaMatch) ticks.push("Primary service area match");
  } else ticks.push("Travel feasible", "Required competencies valid");
  if (eligibility.preferred?.includes(staffId)) ticks.push("Matches client preference");
  return (
    <ul className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
      {ticks.map((t) => <li key={t} className="flex items-center gap-1"><Check className="h-3 w-3 text-success" aria-hidden />{t}</li>)}
    </ul>
  );
}

/** Explainable eligible-only suggestions; exclusions remain separate and assignment is always explicit. */
export function CarerChoices({ eligibility, renderAvailable, renderOverride, idPrefix }: { eligibility: CarerEligibility; renderAvailable: (id: StaffId) => ReactNode; renderOverride?: (u: Unavailable) => ReactNode; idPrefix: string }) {
  const [showUnavailable, setShowUnavailable] = useState(false);
  const { eligible, unavailable } = eligibility;
  const primary = eligible.slice(0, 1);
  const others = eligible.slice(1);
  const counts: { group: ExclusionGroup; count: number }[] = (["Scheduling", "Travel", "Availability", "Service area", "Competency", "Client requirement"] as ExclusionGroup[])
    .map((group) => ({ group, count: unavailable.filter((u) => exclusionGroups(u).some((g) => g.group === group)).length })).filter((g) => g.count > 0);
  const row = (id: StaffId) => {
    const fit = eligibility.bestFit?.find((f) => f.staffId === id);
    return (
    <li key={id} className="flex flex-wrap items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{STAFF_BY_ID[id]?.name ?? id}</p>
        <SuitabilityTicks eligibility={eligibility} staffId={id} />
        {fit && <>
          <p className="text-xs text-muted-foreground">{fit.recentVisits ? `Has supported this client ${fit.recentVisits} ${fit.recentVisits === 1 ? "time" : "times"} in the last 30 days` : "No completed visits with this client in the last 30 days"}</p>
          <p className="text-xs text-muted-foreground">Visits today: {fit.visitsToday} · Scheduled care: {Math.floor(fit.scheduledMinutes / 60)}h {Math.round(fit.scheduledMinutes % 60)}m</p>
          {fit.travelMinutes === undefined && <p className="text-xs text-muted-foreground">{fit.travelBasis === "unknown" ? "Travel estimate unavailable — no known journey; starting location not assumed" : "Travel estimate unavailable"}</p>}
        </>}
        {(eligibility.warnings?.[id] ?? []).map((w) => <p key={w} className="text-xs text-warning">Warning — {w}</p>)}
      </div>
      {renderAvailable(id)}
    </li>
  ); };
  return (
    <div className="space-y-2">
      {eligible.length > 0 && <>
        <p className="text-xs font-medium text-muted-foreground">LogUp suggestion</p>
        <p className="text-xs text-muted-foreground">Suggested based on current schedule, travel, competencies and continuity.</p>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Ranking factors</summary><p className="mt-1">{BEST_FIT_ORDER}</p></details>
        <p className="text-sm font-semibold uppercase tracking-wide">Best match</p>
      </>}
      {eligible.length === 0 ? <div className="space-y-1">
        <p className="text-sm text-muted-foreground">No fully suitable carers are currently available.</p>
        <ul className="text-xs text-muted-foreground">{counts.map((g) => <li key={g.group}>{g.count} {g.count === 1 ? "carer" : "carers"} — {g.group === "Competency" ? "missing or expired required competency" : g.group === "Travel" ? "travel conflict" : g.group === "Availability" ? "unavailable" : g.group.toLowerCase()}</li>)}</ul>
        {counts.length > 0 && <p className="text-xs text-muted-foreground">A carer may have more than one exclusion.</p>}
        {unavailable.length > 0 && !showUnavailable && <Button size="sm" variant="outline" onClick={() => setShowUnavailable(true)}>View excluded carers</Button>}
      </div> : <ul className="divide-y rounded-md border">{primary.map(row)}</ul>}
      {others.length > 0 && (
        <>
          <p className="text-sm font-semibold uppercase tracking-wide">Other suitable carers</p>
          <ul className="divide-y rounded-md border">{others.map(row)}</ul>
        </>
      )}
      {unavailable.length > 0 && (
        <div className="flex items-center gap-2"><Checkbox id={`${idPrefix}-show-unavail`} checked={showUnavailable} onCheckedChange={(v) => setShowUnavailable(!!v)} /><Label htmlFor={`${idPrefix}-show-unavail`}>Show unavailable / excluded carers ({unavailable.length})</Label></div>
      )}
      {showUnavailable && unavailable.length > 0 && (
        <>
          <p className="text-sm font-semibold uppercase tracking-wide">Unavailable / excluded</p>
          <ul className="divide-y rounded-md border">
            {unavailable.map((u) => (
              <li key={u.staffId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-muted-foreground">{STAFF_BY_ID[u.staffId]?.name ?? u.staffId}</p>
                  {exclusionGroups(u).map((g) => (
                    <div key={g.group} className="text-xs"><span className="font-semibold">{g.group}:</span>
                      <ul className="ml-4 list-disc text-destructive">{g.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                    </div>
                  ))}
                </div>
                {renderOverride?.(u)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
