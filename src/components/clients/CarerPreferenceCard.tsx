import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRole } from "@/hooks/useRole";
import { serviceUsersStore, type ServiceUser } from "@/lib/serviceUsersStore";
import { STAFF_BY_ID } from "@/lib/demoDataRegistry";
import { canEditRoster } from "@/lib/rosterRules";
import { APPLIES_TO_LABELS, CARER_PREFERENCE_LABELS, isRequiredPreference, validateCarerPreference, type CarerPreference, type CarerPreferenceType, type PreferenceAppliesTo } from "@/lib/visitRequirements";

const today = () => new Date().toISOString().slice(0, 10);

/** Structured carer preference on the existing client record. Required preferences need context, recorder and date. */
export function CarerPreferenceCard({ u }: { u: ServiceUser }) {
  const role = useRole();
  const canEdit = canEditRoster(u.siteId, role);
  const current = u.carerPreference ?? { type: "no_preference", appliesTo: "all_visits" } as CarerPreference;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<CarerPreference>(current);
  const [errors, setErrors] = useState<string[]>([]);
  const start = () => { setF({ ...current, recordedAt: today() }); setErrors([]); setEditing(true); };
  const save = () => {
    const next: CarerPreference = { ...f, reasonContext: f.reasonContext?.trim() || undefined, recordedByStaffId: role.staffId, reviewDate: f.reviewDate || undefined };
    const errs = validateCarerPreference(next);
    if (errs.length) { setErrors(errs); return; }
    serviceUsersStore.update(u.id, { carerPreference: next }, role.staffId);
    setEditing(false);
  };
  const needsContext = isRequiredPreference(f.type) || f.type === "other";
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Carer preference</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {!editing ? <>
          <p className="font-medium">{CARER_PREFERENCE_LABELS[current.type]}{current.type !== "no_preference" ? ` · ${APPLIES_TO_LABELS[current.appliesTo]}` : ""}</p>
          {current.reasonContext && <p>{current.reasonContext}</p>}
          {current.recordedByStaffId && <p className="text-xs text-muted-foreground">Recorded by {STAFF_BY_ID[current.recordedByStaffId]?.name ?? current.recordedByStaffId}{current.recordedAt ? `, ${current.recordedAt.slice(0, 10)}` : ""}{current.reviewDate ? ` · Review ${current.reviewDate}` : ""}</p>}
          {canEdit && <Button size="sm" variant="outline" onClick={start}>Change preference</Button>}
        </> : <>
          <div><Label>Preference</Label>
            <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v as CarerPreferenceType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(CARER_PREFERENCE_LABELS) as CarerPreferenceType[]).map((k) => <SelectItem key={k} value={k}>{CARER_PREFERENCE_LABELS[k]}</SelectItem>)}</SelectContent></Select>
          </div>
          {f.type !== "no_preference" && <div><Label>Applies to</Label>
            <Select value={f.appliesTo} onValueChange={(v) => setF({ ...f, appliesTo: v as PreferenceAppliesTo })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(APPLIES_TO_LABELS) as PreferenceAppliesTo[]).map((k) => <SelectItem key={k} value={k}>{APPLIES_TO_LABELS[k]}</SelectItem>)}</SelectContent></Select>
          </div>}
          {f.type !== "no_preference" && <div><Label htmlFor="pref-ctx">Reason / context{needsContext ? " (required)" : ""}</Label><Textarea id="pref-ctx" value={f.reasonContext ?? ""} onChange={(e) => setF({ ...f, reasonContext: e.target.value })} /></div>}
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="pref-at">Recorded date</Label><Input id="pref-at" type="date" value={f.recordedAt?.slice(0, 10) ?? ""} onChange={(e) => setF({ ...f, recordedAt: e.target.value })} /></div>
            <div><Label htmlFor="pref-review">Review date (optional)</Label><Input id="pref-review" type="date" value={f.reviewDate ?? ""} onChange={(e) => setF({ ...f, reviewDate: e.target.value })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Recorded by {STAFF_BY_ID[role.staffId]?.name ?? role.staffId}</p>
          {errors.map((e) => <p key={e} role="alert" className="text-sm text-destructive">{e}</p>)}
          <div className="flex gap-2"><Button size="sm" onClick={save}>Save preference</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
        </>}
      </CardContent>
    </Card>
  );
}
