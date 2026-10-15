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
import { TimePicker } from "./TimePicker";
import { CarerChoices, SuitabilityTicks, exclusionLines, isOperationalOnly } from "./CarerChoices";
import { VisitRequirementSummary } from "./VisitRequirementSummary";
import { requirementFor } from "@/lib/visitRequirements";
import { useRole } from "@/hooks/useRole";
import { useVisits, visitsStore, VISIT_STATUS_LABELS, type RosterChange } from "@/lib/visitsStore";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { STAFF_BY_ID, SITE_BY_ID, type StaffId } from "@/lib/demoDataRegistry";
import { clientDisplayName } from "@/lib/visitPresentation";
import { FRONTLINE_IDS, useStaffAvailability } from "@/lib/staffAvailabilityStore";
import { canOverrideServiceArea, assignmentStatus, ASSIGNMENT_LABELS, canEditRoster, carersRequiredFor, durationMinutes, isRosterEditable, ROSTER_REASONS, RosterConflictError, scheduleConflicts, carerEligibility, formWindow, type ScheduleConflict } from "@/lib/rosterRules";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false });
const name = (id: string) => STAFF_BY_ID[id as StaffId]?.name ?? id;
const KIND_LABELS: Record<RosterChange["kind"], string> = { created: "Visit created", changed: "Visit changed", assigned: "Carer assigned", removed: "Carer removed", replaced: "Carer replaced", second_carer_added: "Second carer added", conflict_overridden: "Overlap warning overridden", area_overridden: "Service area overridden", availability_overridden: "Availability overridden", cancelled: "Visit cancelled", roster_status_changed: "Roster status changed" };
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
  const { visits, templates } = useVisits();
  const visit = visits.find((v) => v.id === visitId);
  const client = visit ? serviceUsersStore.getById(visit.clientId) : undefined;
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [ackKey, setAckKey] = useState("");
  const [override, setOverride] = useState<{ ids: StaffId[]; staffId: StaffId } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [summary, setSummary] = useState<{ staffId: StaffId; overridden: boolean } | null>(null);
  const availability = useStaffAvailability();
  const [edit, setEdit] = useState(() => visit ? { date: localDate(visit.scheduledStart), time: hm(visit.scheduledStart), minutes: String(durationMinutes(visit)), carers: String(carersRequiredFor(visit)), note: visit.notesForScheduler ?? "" } : null);
  const [cancelReason, setCancelReason] = useState("");
  if (!visit || !client || !edit) return null;
  const siteId = visit.serviceAreaId ?? client.siteId;
  const canEdit = canEditRoster(siteId, role) && isRosterEditable(visit);
  const needsReason = visit.rosterStatus !== "draft";
  const pool = FRONTLINE_IDS;
  const full = visit.staffIds.length >= carersRequiredFor(visit);
  // All checks derive from the current form values — never from a cached warning.
   const formWin = formWindow(edit.date, edit.time, Number(edit.minutes));
   const win = formWin ?? { start: visit.scheduledStart, end: visit.scheduledEnd };
   const dirty = !formWin || win.start !== visit.scheduledStart || win.end !== visit.scheduledEnd;
  const requirement = requirementFor(visit, templates);
  const preference = client.carerPreference;
  const eligibility = carerEligibility(visits, pool, visit.staffIds, win.start, win.end, visit.id, { siteId, availability, requirement, preference });
  const scheduleConflictsNow = scheduleConflicts(visits, visit.staffIds, win.start, win.end, visit.id);
  const sig = (c: ScheduleConflict[]) => c.map((x) => x.staffId + x.visit.id).join("|");
  const slotState = visit.staffIds.length ? (t: string) => {
    const w = formWindow(edit.date, t, Number(edit.minutes));
    return w ? (scheduleConflicts(visits, visit.staffIds, w.start, w.end, visit.id).length ? "conflict" as const : "available" as const) : undefined;
  } : undefined;

  const run = (fn: () => void) => {
    setError("");
    try { fn(); setAckKey(""); setOverride(null); setOverrideReason(""); setReason(""); }
    catch (e) { setError(e instanceof RosterConflictError ? "Schedule conflict — tick the confirmation to continue." : e instanceof Error ? e.message : "Could not save."); }
  };
   const assign = (staffIds: StaffId[], overrideFor?: StaffId) => {
     if (dirty) return;
     const added = staffIds.find((s) => !visit.staffIds.includes(s));
     setSummary(null);
     run(() => { visitsStore.assignCarers(visit.id, staffIds, role, { reason: needsReason ? reason : undefined, overrideReason: overrideFor ? overrideReason : undefined }); if (added) setSummary({ staffId: added, overridden: !!overrideFor }); });
   };
  const scheduleAck = scheduleConflictsNow.length > 0 && ackKey === "s:" + sig(scheduleConflictsNow);
  const saveEdit = () => run(() => visitsStore.editVisit(visit.id, { start: win.start, durationMinutes: Number(edit.minutes), carersRequired: Number(edit.carers), notesForScheduler: edit.note }, role, { reason: needsReason ? reason : undefined, acknowledgeConflict: scheduleAck }));
  const assignButtons = (s: StaffId, variant: "default" | "outline" = "default", onPick: (ids: StaffId[]) => void = (ids) => assign(ids)) => <>
    {!full && <Button size="sm" variant={variant} onClick={() => onPick([...visit.staffIds, s])}>{visit.staffIds.length ? "Add" : "Assign"}</Button>}
    {full && visit.staffIds.length === 1 && <Button size="sm" variant="outline" onClick={() => onPick([s])}>Replace</Button>}
    {full && visit.staffIds.length > 1 && visit.staffIds.map((old) => <Button key={old} size="sm" variant="outline" onClick={() => onPick(visit.staffIds.map((x) => x === old ? s : x))}>Replace {name(old).split(" ")[0]}</Button>)}
  </>;

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
        <VisitRequirementSummary requirement={requirement} preference={preference} />
        {!isRosterEditable(visit) && <p className="rounded-md border p-3 text-sm">This visit has started, finished or been cancelled, so its schedule is locked to protect the care record.</p>}
        {!canEditRoster(siteId, role) && <p className="rounded-md border p-3 text-sm">Read only — you can't change visits in this service area.</p>}

        <section className="space-y-2">
          <h3 className="font-semibold">Carers · {ASSIGNMENT_LABELS[assignmentStatus(visit)]} ({visit.staffIds.length}/{carersRequiredFor(visit)})</h3>
          {visit.staffIds.length === 0 && <p className="font-bold text-destructive">UNASSIGNED</p>}
           {visit.staffIds.map((s) => <div key={s} className="flex items-center justify-between rounded-md border px-3 py-2"><span className="font-medium">{name(s)}</span>{canEdit && <Button size="sm" variant="ghost" disabled={dirty} onClick={() => assign(visit.staffIds.filter((x) => x !== s))}><X className="mr-1 h-4 w-4" />Remove</Button>}</div>)}
        </section>

        {canEdit && needsReason && (
          <div className="space-y-1">
            <Label>Reason for change (required for published visits)</Label>
            <Select value={reason} onValueChange={setReason}><SelectTrigger><SelectValue placeholder="Choose a reason" /></SelectTrigger><SelectContent>{ROSTER_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
          </div>
        )}
        {summary && visit.staffIds.includes(summary.staffId) && (
          <div role="status" className="rounded-md border p-3 text-sm">
            <p className="font-semibold">Assigned: {name(summary.staffId)}</p>
            {summary.overridden ? <p className="text-xs text-destructive">Assigned by override — reason recorded in roster history.</p> : <SuitabilityTicks eligibility={{ ...eligibility, preferred: preference && (eligibility.preferred?.length ?? 0) >= 0 ? carerEligibility(visits, [summary.staffId], [], visit.scheduledStart, visit.scheduledEnd, visit.id, { siteId, availability, requirement, preference }).preferred : [] }} staffId={summary.staffId} />}
          </div>
        )}
        {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

        {canEdit && (
          <section className="space-y-2">
            <h3 className="font-semibold">Carers in {SITE_BY_ID[siteId]?.name} · {hm(win.start)}–{hm(win.end)}</h3>
             {dirty && <p role="status" className="text-sm text-muted-foreground">Save the updated visit time before assigning a carer.</p>}
            <CarerChoices idPrefix="rv" eligibility={eligibility}
              renderAvailable={(s) => dirty ? null : assignButtons(s)}
              renderOverride={(u) => {
                if (dirty) return null;
                if (!isOperationalOnly(u)) return <span className="text-xs text-muted-foreground">Blocked — not assignable</span>;
                if (!canOverrideServiceArea(role)) return <span className="text-xs text-muted-foreground">Manager/admin override only</span>;
                return assignButtons(u.staffId, "outline", (ids) => { setOverride({ ids, staffId: u.staffId }); setOverrideReason(""); });
              }} />
            {!dirty && override && (() => {
              const u = eligibility.unavailable.find((x) => x.staffId === override.staffId);
              if (!u) return null;
              return (
                <div role="alert" className="space-y-2 rounded-md border border-destructive bg-destructive/10 p-3">
                  <p className="font-semibold text-destructive">Override: {name(override.staffId)} is unavailable</p>
                  <ul className="ml-4 list-disc text-sm">{exclusionLines(u).map((l) => <li key={l}>{l}</li>)}</ul>
                  <Label htmlFor="override-reason">Override reason (recorded with your name, role and time)</Label>
                  <Input id="override-reason" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                  <div className="flex gap-2"><Button disabled={!overrideReason.trim()} onClick={() => assign(override.ids, override.staffId)}>Confirm override</Button><Button variant="ghost" onClick={() => setOverride(null)}>Back</Button></div>
                </div>
              );
            })()}
          </section>
        )}

        {canEdit && (
          <section className="space-y-2 border-t pt-3">
            <h3 className="font-semibold">Edit schedule</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><Label htmlFor="e-date">Date</Label><Input id="e-date" type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></div>
              <div><Label htmlFor="e-time">Start</Label><TimePicker id="e-time" value={edit.time} onChange={(t) => setEdit({ ...edit, time: t })} slotState={slotState} /></div>
              <div><Label htmlFor="e-min">Minutes</Label><Input id="e-min" type="number" min={5} max={240} value={edit.minutes} onChange={(e) => setEdit({ ...edit, minutes: e.target.value })} /></div>
              <div><Label>Carers required</Label><Select value={edit.carers} onValueChange={(v) => setEdit({ ...edit, carers: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem></SelectContent></Select></div>
            </div>
            <p className="text-sm">New time: <strong className="tabular-nums">{hm(win.start)}–{hm(win.end)}</strong></p>
            {scheduleConflictsNow.length > 0 && <ConflictWarning conflicts={scheduleConflictsNow} acknowledged={scheduleAck} onAcknowledge={(v) => setAckKey(v ? "s:" + sig(scheduleConflictsNow) : "")} />}
            <Label htmlFor="e-note">Note for scheduler</Label>
            <Textarea id="e-note" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
             <Button variant={dirty ? "default" : "secondary"} disabled={!formWin || (scheduleConflictsNow.length > 0 && !scheduleAck)} onClick={saveEdit}>{dirty ? "Save time & continue" : "Save changes"}</Button>
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
