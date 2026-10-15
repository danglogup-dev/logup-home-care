import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { STAFF_BY_ID, type StaffId } from "@/lib/demoDataRegistry";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { clientDisplayName } from "@/lib/visitPresentation";
import type { CarerEligibility } from "@/lib/rosterRules";
import type { ReactNode } from "react";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false });

export function unavailableReason(conflicts: CarerEligibility["unavailable"][number]["conflicts"]): string {
  return conflicts.map((v) => {
    const c = serviceUsersStore.getById(v.clientId);
    return `${c ? `assigned to ${clientDisplayName(c)}` : "overlapping visit"} ${hm(v.scheduledStart)}–${hm(v.scheduledEnd)}`;
  }).join("; ");
}

/** Available carers first; unavailable carers hidden unless toggled, each with its reason and an explicit override action. */
export function CarerChoices({ eligibility, renderAvailable, renderOverride, idPrefix }: { eligibility: CarerEligibility; renderAvailable: (id: StaffId) => ReactNode; renderOverride?: (id: StaffId) => ReactNode; idPrefix: string }) {
  const [showUnavailable, setShowUnavailable] = useState(false);
  const { eligible, unavailable } = eligibility;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Available carers</p>
      {eligible.length === 0 ? <p className="text-sm text-muted-foreground">No carer in this service area is free at this time.</p> : (
        <ul className="divide-y rounded-md border">
          {eligible.map((id) => <li key={id} className="flex flex-wrap items-center gap-3 px-3 py-2"><div className="min-w-0 flex-1"><p className="font-medium">{STAFF_BY_ID[id]?.name ?? id}</p><p className="text-xs text-muted-foreground">No scheduling conflict</p></div>{renderAvailable(id)}</li>)}
        </ul>
      )}
      {unavailable.length > 0 && (
        <div className="flex items-center gap-2"><Checkbox id={`${idPrefix}-show-unavail`} checked={showUnavailable} onCheckedChange={(v) => setShowUnavailable(!!v)} /><Label htmlFor={`${idPrefix}-show-unavail`}>Show unavailable carers ({unavailable.length})</Label></div>
      )}
      {showUnavailable && unavailable.length > 0 && (
        <>
          <p className="text-sm font-semibold">Unavailable</p>
          <ul className="divide-y rounded-md border">
            {unavailable.map((u) => <li key={u.staffId} className="flex flex-wrap items-center gap-3 px-3 py-2"><div className="min-w-0 flex-1"><p className="font-medium text-muted-foreground">{STAFF_BY_ID[u.staffId]?.name ?? u.staffId}</p><p className="text-xs text-destructive">Unavailable — {unavailableReason(u.conflicts)}</p></div>{renderOverride?.(u.staffId)}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}
