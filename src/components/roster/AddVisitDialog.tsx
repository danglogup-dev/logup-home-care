import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRole } from "@/hooks/useRole";
import { useTerms } from "@/hooks/useTerms";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { visitsStore } from "@/lib/visitsStore";
import { STAFF, SITE_BY_ID, type StaffId } from "@/lib/demoDataRegistry";
import { clientDisplayName } from "@/lib/visitPresentation";
import { FRONTLINE_IDS, useStaffAvailability } from "@/lib/staffAvailabilityStore";
import { canEditRoster, carerEligibility, formWindow, scheduleConflicts, RosterConflictError } from "@/lib/rosterRules";
import { useVisits } from "@/lib/visitsStore";
import { TimePicker } from "./TimePicker";
import { CarerChoices } from "./CarerChoices";
import { VisitRequirementSummary } from "./VisitRequirementSummary";
import { Checkbox } from "@/components/ui/checkbox";
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABELS, type SupportCategory } from "@/lib/visitRequirements";
import { useWorkforceQualTypes } from "./useWorkforceQualTypes";
import { ConflictWarning } from "./RosterVisitDialog";

const NONE = "__none";

export function AddVisitDialog({ onClose }: { onClose: () => void }) {
  const role = useRole();
  const terms = useTerms();
  const { users } = useServiceUsers();
  const clients = users.filter((u) => u.status === "active" && canEditRoster(u.siteId, role)).sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b)));
  const [f, setF] = useState({ clientId: "", date: new Date().toISOString().slice(0, 10), time: "10:00", minutes: "30", carers: "1", purpose: "", staffId: NONE, note: "" });
  const [quals, setQuals] = useState<string[]>([]);
  const [cats, setCats] = useState<SupportCategory[]>([]);
  const qualTypes = useWorkforceQualTypes();
  const [error, setError] = useState("");
  const [ackKey, setAckKey] = useState("");
  const { visits } = useVisits();
  const client = users.find((u) => u.id === f.clientId);
  const availability = useStaffAvailability();
  const pool = client ? FRONTLINE_IDS : [];
  const chosen = f.staffId === NONE ? [] : [f.staffId as StaffId];
  const win = formWindow(f.date, f.time, Number(f.minutes));
  const eligibility = win ? carerEligibility(visits, pool, chosen, win.start, win.end, undefined, { siteId: client!.siteId, availability, requirement: { requiredQualificationIds: quals, supportCategories: cats }, preference: client!.carerPreference, clientId: client!.id }) : { eligible: pool.filter((p) => !chosen.includes(p)), unavailable: [] };
  const conflicts = win ? scheduleConflicts(visits, chosen, win.start, win.end) : [];
  const sig = conflicts.map((c) => c.staffId + c.visit.id).join("|");
  const ack = conflicts.length > 0 && ackKey === sig;
  const slotState = chosen.length ? (t: string) => { const w = formWindow(f.date, t, Number(f.minutes)); return w ? (scheduleConflicts(visits, chosen, w.start, w.end).length ? "conflict" as const : "available" as const) : undefined; } : undefined;
  const save = () => {
    setError("");
    try {
      visitsStore.createOneOff({ clientId: f.clientId as never, start: win!.start, durationMinutes: Number(f.minutes), carersRequired: Number(f.carers), purpose: f.purpose, staffIds: chosen, notesForScheduler: f.note, requiredQualificationIds: quals, supportCategories: cats }, role, { acknowledgeConflict: ack });
      onClose();
    } catch (e) {
      if (e instanceof RosterConflictError) setError("Schedule conflict — tick the confirmation to continue.");
      else setError(e instanceof Error ? e.message : "Could not add visit.");
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add visit</DialogTitle>
          <DialogDescription>One-off visit. It is saved as a draft until you publish it; carers only see published visits.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>{terms.Singular}</Label>
            <Select value={f.clientId} onValueChange={(v) => setF({ ...f, clientId: v, staffId: NONE })}><SelectTrigger><SelectValue placeholder={`Choose a ${terms.singular}`} /></SelectTrigger><SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{clientDisplayName(c)} · {SITE_BY_ID[c.siteId]?.name}</SelectItem>)}</SelectContent></Select>
            {client && <p className="mt-1 text-sm text-muted-foreground">Service area: {SITE_BY_ID[client.siteId]?.name} (from the {terms.singular} record)</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="a-date">Date</Label><Input id="a-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            <div><Label htmlFor="a-time">Start time</Label><TimePicker id="a-time" value={f.time} onChange={(t) => setF({ ...f, time: t })} slotState={slotState} /></div>
            <div><Label htmlFor="a-min">Expected minutes</Label><Input id="a-min" type="number" min={5} max={240} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></div>
            <div><Label>Carers required</Label><Select value={f.carers} onValueChange={(v) => setF({ ...f, carers: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem></SelectContent></Select></div>
          </div>
          <div><Label htmlFor="a-purpose">Expected support / visit purpose</Label><Input id="a-purpose" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="e.g. Welfare check" /></div>
          <fieldset className="space-y-1"><legend className="text-sm font-medium">Support categories</legend>
            <div className="grid grid-cols-2 gap-1">{SUPPORT_CATEGORIES.map((c) => <label key={c} className="flex items-center gap-2 text-sm"><Checkbox checked={cats.includes(c)} onCheckedChange={(v) => setCats(v ? [...cats, c] : cats.filter((x) => x !== c))} />{SUPPORT_CATEGORY_LABELS[c]}</label>)}</div>
          </fieldset>
          <fieldset className="space-y-1"><legend className="text-sm font-medium">Required competencies</legend>
            <div className="grid grid-cols-2 gap-1">{qualTypes.map((q) => <label key={q.id} className="flex items-center gap-2 text-sm"><Checkbox checked={quals.includes(q.id)} onCheckedChange={(v) => setQuals(v ? [...quals, q.id] : quals.filter((x) => x !== q.id))} />{q.name}</label>)}</div>
          </fieldset>
          {client && <VisitRequirementSummary requirement={{ requiredQualificationIds: quals, supportCategories: cats }} preference={client.carerPreference} />}
          {win && <p className="text-sm">Visit time: <strong className="tabular-nums">{f.time}–{new Date(win.end).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false })}</strong></p>}
          <div className="space-y-2"><Label>Assign carer (optional)</Label>
            {!client ? <p className="text-sm text-muted-foreground">Choose a {terms.singular} first.</p> : <>
              {chosen.length > 0 && <div className="flex items-center justify-between rounded-md border px-3 py-2"><span className="font-medium">{STAFF.find((s) => s.id === chosen[0])?.name}</span><Button size="sm" variant="ghost" onClick={() => setF({ ...f, staffId: NONE })}>Leave unassigned</Button></div>}
              <CarerChoices idPrefix="av" eligibility={eligibility}
                renderAvailable={(id) => <Button size="sm" onClick={() => setF({ ...f, staffId: id })}>{chosen.length ? "Choose instead" : "Choose"}</Button>}
                renderOverride={(u) => u.reasons?.length || u.outsideArea || u.competency?.length || u.preference ? <span className="text-xs text-muted-foreground">{u.outsideArea ? "Assign after creating (manager/admin override)" : "Not assignable"}</span> : <Button size="sm" variant="outline" onClick={() => { setF({ ...f, staffId: u.staffId }); setAckKey(""); }}>Choose anyway…</Button>} />
            </>}
          </div>
          <div><Label htmlFor="a-note">Note for scheduler (optional)</Label><Textarea id="a-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          {conflicts.length > 0 && <ConflictWarning conflicts={conflicts} acknowledged={ack} onAcknowledge={(v) => setAckKey(v ? sig : "")} />}
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <Button className="w-full" disabled={!f.clientId || !win || (conflicts.length > 0 && !ack)} onClick={save}>Add visit</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
