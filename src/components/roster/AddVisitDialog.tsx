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
import { canEditRoster, RosterConflictError, type ScheduleConflict } from "@/lib/rosterRules";
import { ConflictWarning } from "./RosterVisitDialog";

const NONE = "__none";

export function AddVisitDialog({ onClose }: { onClose: () => void }) {
  const role = useRole();
  const terms = useTerms();
  const { users } = useServiceUsers();
  const clients = users.filter((u) => u.status === "active" && canEditRoster(u.siteId, role)).sort((a, b) => clientDisplayName(a).localeCompare(clientDisplayName(b)));
  const [f, setF] = useState({ clientId: "", date: new Date().toISOString().slice(0, 10), time: "10:00", minutes: "30", carers: "1", purpose: "", staffId: NONE, note: "" });
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [ack, setAck] = useState(false);
  const client = users.find((u) => u.id === f.clientId);
  const pool = client ? STAFF.filter((s) => s.accessRole === "Frontline" && s.scopeSiteIds.includes(client.siteId)) : [];
  const save = () => {
    setError("");
    try {
      visitsStore.createOneOff({ clientId: f.clientId as never, start: new Date(`${f.date}T${f.time}`).toISOString(), durationMinutes: Number(f.minutes), carersRequired: Number(f.carers), purpose: f.purpose, staffIds: f.staffId === NONE ? [] : [f.staffId as StaffId], notesForScheduler: f.note }, role, { acknowledgeConflict: ack });
      onClose();
    } catch (e) {
      if (e instanceof RosterConflictError) setConflicts(e.conflicts);
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
            <div><Label htmlFor="a-time">Start time</Label><Input id="a-time" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>
            <div><Label htmlFor="a-min">Expected minutes</Label><Input id="a-min" type="number" min={5} max={240} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></div>
            <div><Label>Carers required</Label><Select value={f.carers} onValueChange={(v) => setF({ ...f, carers: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem></SelectContent></Select></div>
          </div>
          <div><Label htmlFor="a-purpose">Expected support / visit purpose</Label><Input id="a-purpose" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="e.g. Welfare check" /></div>
          <div><Label>Assign carer (optional)</Label>
            <Select value={f.staffId} onValueChange={(v) => setF({ ...f, staffId: v })} disabled={!client}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>Leave unassigned</SelectItem>{pool.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.roleLabel}</SelectItem>)}</SelectContent></Select>
          </div>
          <div><Label htmlFor="a-note">Note for scheduler (optional)</Label><Textarea id="a-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
          {conflicts.length > 0 && <ConflictWarning conflicts={conflicts} acknowledged={ack} onAcknowledge={setAck} />}
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <Button className="w-full" disabled={!f.clientId || (conflicts.length > 0 && !ack)} onClick={save}>Add visit</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
