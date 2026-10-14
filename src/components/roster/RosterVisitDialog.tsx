import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRole } from "@/hooks/useRole";
import { useVisits, visitsStore, VISIT_STATUS_LABELS, type RosterChange } from "@/lib/visitsStore";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { STAFF, STAFF_BY_ID, SITE_BY_ID, type StaffId } from "@/lib/demoDataRegistry";
import { clientDisplayName } from "@/lib/visitPresentation";
import { assignmentStatus, ASSIGNMENT_LABELS, canEditRoster, carersRequiredFor, durationMinutes, isRosterEditable, ROSTER_REASONS, RosterConflictError, sameDay, type ScheduleConflict } from "@/lib/rosterRules";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false });
const name = (id: string) => STAFF_BY_ID[id as StaffId]?.name ?? id;
const KIND_LABELS: Record<RosterChange["kind"], string> = { created: "Visit created", changed: "Visit changed", assigned: "Carer assigned", removed: "Carer removed", replaced: "Carer replaced", second_carer_added: "Second carer added", conflict_overridden: "Overlap warning overridden", cancelled: "Visit cancelled", roster_status_changed: "Roster status changed" };
const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const prettyValue = (v?: string) => v?.replace(/STAFF-[A-Z]+/g, (id) => name(id));

export function ConflictWarning({ conflicts, acknowledged, onAcknowledge }: { conflicts: ScheduleConflict[]; acknowledged: boolean; onAcknowledge: (v: boolean) => void }) {
  return (
    <div role="alert" className="space-y-2 rounded-md border border-destructive bg-destructive/10 p-3">
      <p className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> Schedule conflict</p>
      {conflicts.map((c) => <p key={c.staffId + c.visit.id} className="text-sm">{name(c.staffId)} is already assigned to another visit from {hm(c.visit.scheduledStart)}–{hm(c.visit.scheduledEnd)}.</p>)}
      <div className="flex items-center gap-2"><Checkbox id="ack-conflict" checked={acknowledged} onCheckedChange={(v) => onAcknowledge(!!v)} /><Label htmlFor="ack-conflict">I understand — continue anyway (recorded)</Label></div>
    </div>
  );
}

export function RosterVisitDialog({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const role = useRole();
  const { visits } = useVisits();
  const visit = visits.find((v) => v.id === visitId);
  const client = visit ? serviceUsersStore.getById(visit.clientId) : undefined;
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [ack, setAck] = useState(false);
  const [pending, setPending] = useState<StaffId[] | null>(null);
  const [edit, setEdit] = useState(() => visit ? { date: localDate(visit.scheduledStart), time: hm(visit.scheduledStart), minutes: String(durationMinutes(visit)), carers: String(carersRequiredFor(visit)), note: visit.notesForScheduler ?? "" } : null);
  const [cancelReason, setCancelReason] = useState("");
  if (!visit || !client || !edit) return null;
  const siteId = visit.serviceAreaId ?? client.siteId;
  const canEdit = canEditRoster(siteId, role) && isRosterEditable(visit);
  const needsReason = visit.rosterStatus !== "draft";
  const pool = STAFF.filter((s) => s.accessRole === "Frontline" && s.scopeSiteIds.includes(siteId));
  const full = visit.staffIds.length >= carersRequiredFor(visit);
  const dayVisits = (id: StaffId) => visits.filter((v) => v.id !== visit.id && v.status !== "cancelled" && v.staffIds.includes(id) && sameDay(v.scheduledStart, new Date(visit.scheduledStart))).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));

  const run = (fn: () => void) => {
    setError("");
    try { fn(); setConflicts([]); setAck(false); setPending(null); setReason(""); }
    catch (e) {
      if (e instanceof RosterConflictError) setConflicts(e.conflicts);
      else setError(e instanceof Error ? e.message : "Could not save.");
    }
  };
  const assign = (staffIds: StaffId[]) => { setPending(staffIds); run(() => visitsStore.assignCarers(visit.id, staffIds, role, { reason: needsReason ? reason : undefined, acknowledgeConflict: ack })); };
  const saveEdit = () => run(() => visitsStore.editVisit(visit.id, { start: new Date(`${edit.date}T${edit.time}`).toISOString(), durationMinutes: Number(edit.minutes), carersRequired: Number(edit.carers), notesForScheduler: edit.note }, role, { reason: needsReason ? reason : undefined, acknowledgeConflict: ack }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{assignmentStatus(visit) === "unassigned" && canEdit ? "Assign carer" : "Visit"} · {hm(visit.scheduledStart)}–{hm(visit.scheduledEnd)}</DialogTitle>
          <DialogDescription>
            <Link to={`/app/org/service-users/${client.id}`} className="font-semibold text-foreground underline">{clientDisplayName(client)}</Link> · {SITE_BY_ID[siteId]?.name} · {new Date(visit.scheduledStart).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "short" })} · {durationMinutes(visit)} mins · {VISIT_STATUS_LABELS[visit.status]} · {visit.rosterStatus === "draft" ? "Draft" : "Published"}
          </DialogDescription>
        </DialogHeader>
        {visit.purpose && <p className="text-sm"><strong>Purpose:</strong> {visit.purpose}</p>}
        {!isRosterEditable(visit) && <p className="rounded-md border p-3 text-sm">This visit has started, finished or been cancelled, so its schedule is locked to protect the care record.</p>}
        {!canEditRoster(siteId, role) && <p className="rounded-md border p-3 text-sm">Read only — you can't change visits in this service area.</p>}

        <section className="space-y-2">
          <h3 className="font-semibold">Carers · {ASSIGNMENT_LABELS[assignmentStatus(visit)]} ({visit.staffIds.length}/{carersRequiredFor(visit)})</h3>
          {visit.staffIds.length === 0 && <p className="font-bold text-destructive">UNASSIGNED</p>}
          {visit.staffIds.map((s) => <div key={s} className="flex items-center justify-between rounded-md border px-3 py-2"><span className="font-medium">{name(s)}</span>{canEdit && <Button size="sm" variant="ghost" onClick={() => assign(visit.staffIds.filter((x) => x !== s))}><X className="mr-1 h-4 w-4" />Remove</Button>}</div>)}
        </section>

        {canEdit && needsReason && (
          <div className="space-y-1">
            <Label>Reason for change (required for published visits)</Label>
            <Select value={reason} onValueChange={setReason}><SelectTrigger><SelectValue placeholder="Choose a reason" /></SelectTrigger><SelectContent>{ROSTER_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
          </div>
        )}
        {conflicts.length > 0 && <div className="space-y-2"><ConflictWarning conflicts={conflicts} acknowledged={ack} onAcknowledge={setAck} />{ack && pending && <Button onClick={() => assign(pending)}>Confirm assignment</Button>}{ack && !pending && <Button onClick={saveEdit}>Confirm change</Button>}</div>}
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

        {canEdit && (
          <section className="space-y-2">
            <h3 className="font-semibold">Carers in {SITE_BY_ID[siteId]?.name}</h3>
            <ul className="divide-y rounded-md border">
              {pool.filter((s) => !visit.staffIds.includes(s.id)).map((s) => {
                const day = dayVisits(s.id);
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{s.name} <span className="text-sm font-normal text-muted-foreground">· {s.roleLabel} · {s.scopeSiteIds.map((x) => SITE_BY_ID[x]?.name).join(", ")}</span></p>
                      <p className="text-xs text-muted-foreground">{day.length ? day.map((v) => `${hm(v.scheduledStart)}–${hm(v.scheduledEnd)}`).join(" · ") : "No other visits this day"}</p>
                    </div>
                    {!full && <Button size="sm" onClick={() => assign([...visit.staffIds, s.id])}>{visit.staffIds.length ? "Add" : "Assign"}</Button>}
                    {full && visit.staffIds.length === 1 && <Button size="sm" variant="outline" onClick={() => assign([s.id])}>Replace</Button>}
                    {full && visit.staffIds.length > 1 && visit.staffIds.map((old) => <Button key={old} size="sm" variant="outline" onClick={() => assign(visit.staffIds.map((x) => x === old ? s.id : x))}>Replace {name(old).split(" ")[0]}</Button>)}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {canEdit && (
          <section className="space-y-2 border-t pt-3">
            <h3 className="font-semibold">Edit schedule</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><Label htmlFor="e-date">Date</Label><Input id="e-date" type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></div>
              <div><Label htmlFor="e-time">Start</Label><Input id="e-time" type="time" value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })} /></div>
              <div><Label htmlFor="e-min">Minutes</Label><Input id="e-min" type="number" min={5} max={240} value={edit.minutes} onChange={(e) => setEdit({ ...edit, minutes: e.target.value })} /></div>
              <div><Label>Carers required</Label><Select value={edit.carers} onValueChange={(v) => setEdit({ ...edit, carers: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem></SelectContent></Select></div>
            </div>
            <Label htmlFor="e-note">Note for scheduler</Label>
            <Textarea id="e-note" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
            <Button variant="secondary" onClick={() => { setPending(null); saveEdit(); }}>Save changes</Button>
          </section>
        )}

        {canEdit && (
          <section className="space-y-2 border-t pt-3">
            <h3 className="font-semibold">Cancel visit</h3>
            <div className="flex gap-2"><Input placeholder="Reason for cancelling" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /><Button variant="destructive" disabled={!cancelReason.trim()} onClick={() => run(() => visitsStore.cancelVisit(visit.id, cancelReason, role))}>Cancel visit</Button></div>
          </section>
        )}

        <section className="space-y-1 border-t pt-3">
          <h3 className="font-semibold">Roster history</h3>
          {!(visit.rosterHistory ?? []).length && <p className="text-sm text-muted-foreground">{visit.createdBy === "system" ? "Generated from the recurring visit schedule. No changes yet." : "No changes yet."}</p>}
          <ul className="space-y-1 text-sm">
            {[...(visit.rosterHistory ?? [])].reverse().map((h) => <li key={h.id}><strong>{KIND_LABELS[h.kind]}</strong> · {name(h.actorStaffId)} ({h.actorRole}) · {new Date(h.at).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{h.previous ? ` · from ${prettyValue(h.previous)}` : ""}{h.next ? ` · ${h.previous ? "to " : ""}${prettyValue(h.next)}` : ""}{h.reason ? ` · Reason: ${h.reason}` : ""}</li>)}
          </ul>
        </section>
      </DialogContent>
    </Dialog>
  );
}
