import { useState } from "react";
import { Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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

export type ExclusionGroup = "Scheduling" | "Availability" | "Service area" | "Competency" | "Client requirement";
/** Every exact reason, grouped. A carer can have several. */
export function exclusionGroups(u: Unavailable): { group: ExclusionGroup; lines: string[] }[] {
  const g: { group: ExclusionGroup; lines: string[] }[] = [
    { group: "Scheduling", lines: u.conflicts.map((v) => { const c = serviceUsersStore.getById(v.clientId); return `Another visit ${hm(v.scheduledStart)}–${hm(v.scheduledEnd)}${c ? ` (${clientDisplayName(c)})` : ""}`; }) },
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
  const ticks = ["Available", "Service area match", "Required competencies current"];
  if (eligibility.preferred?.includes(staffId)) ticks.push("Matches client preference");
  return (
    <ul className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
      {ticks.map((t) => <li key={t} className="flex items-center gap-1"><Check className="h-3 w-3 text-success" aria-hidden />{t}</li>)}
    </ul>
  );
}

/** Available & suitable carers first (preference matches ranked first, others in their own group), excluded carers behind a toggle with grouped reasons. */
export function CarerChoices({ eligibility, renderAvailable, renderOverride, idPrefix }: { eligibility: CarerEligibility; renderAvailable: (id: StaffId) => ReactNode; renderOverride?: (u: Unavailable) => ReactNode; idPrefix: string }) {
  const [showUnavailable, setShowUnavailable] = useState(false);
  const { eligible, unavailable } = eligibility;
  const hasSoftPref = eligibility.preferred !== undefined && eligible.length > 0 && (eligibility.preferred.length > 0 && eligibility.preferred.length < eligible.length);
  const primary = hasSoftPref ? eligibility.preferred! : eligible;
  const others = hasSoftPref ? eligible.filter((id) => !eligibility.preferred!.includes(id)) : [];
  const row = (id: StaffId) => (
    <li key={id} className="flex flex-wrap items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{STAFF_BY_ID[id]?.name ?? id}</p>
        <SuitabilityTicks eligibility={eligibility} staffId={id} />
        {(eligibility.warnings?.[id] ?? []).map((w) => <p key={w} className="text-xs text-warning">Warning — {w}</p>)}
      </div>
      {renderAvailable(id)}
    </li>
  );
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold uppercase tracking-wide">Available &amp; suitable</p>
      {eligible.length === 0 ? <p className="text-sm text-muted-foreground">No carer is available and suitable at this time.</p> : <ul className="divide-y rounded-md border">{primary.map(row)}</ul>}
      {others.length > 0 && (
        <>
          <p className="text-sm font-semibold uppercase tracking-wide">Other available carers</p>
          <p className="text-xs text-muted-foreground">Eligible, but not the client's preferred match.</p>
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
