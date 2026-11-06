import { useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MedicationException, MedicationOutcomeRecord, MedicationTask } from "@/lib/medicationStore";
import { OUTCOME_LABELS } from "@/lib/medicationRules";
import { fmt, staffName } from "@/lib/emarPresentation";
import { STAFF } from "@/lib/demoDataRegistry";
import { getState as visitsState } from "@/lib/visitsStore";
import { VISIT_STATUS_LABELS } from "@/lib/visitPresentation";
import { createTask, effectiveStatus, statusLabel, statusBadgeClass, useTasksStore, type TaskPriority } from "@/lib/tasksStore";
import { useRole } from "@/hooks/useRole";
import { isManagerRole } from "@/lib/roleStore";

/** People who may own a medication follow-up: managers/admins covering the exception's service area. */
export function followUpAssignees(siteId: string) {
  return STAFF.filter((s) => (s.accessRole === "Admin" || s.accessRole === "Manager") && s.scopeSiteIds.includes(siteId as never));
}

/** Original outcome + visit, shown before anyone acts on an exception. */
export function ExceptionSource({ outcome, task }: { outcome?: MedicationOutcomeRecord; task?: MedicationTask }) {
  const visit = task?.visit_id ? visitsState().visits.find((v) => v.id === task.visit_id) : undefined;
  return <div className="mt-2 grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
    <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Original medication record</p>
      {outcome ? <><p className="font-medium">{OUTCOME_LABELS[outcome.outcome]}</p><p>By {staffName(outcome.staff_id)} · {fmt(outcome.event_at)}</p>{outcome.reason && <p>Reason: {outcome.reason}</p>}<p className="text-xs text-muted-foreground">Recorded by hand {fmt(outcome.submitted_at)}</p></> : <p className="text-muted-foreground">No outcome recorded.</p>}
    </div>
    <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visit</p>
      {visit ? <><p className="font-medium">{fmt(visit.scheduledStart)} · {VISIT_STATUS_LABELS[visit.status]}</p><p>Carer: {visit.staffIds.map(staffName).join(", ") || "Unassigned"}</p><p>{visit.checkInAt ? `Arrived ${fmt(visit.checkInAt)}` : "Not checked in"}{visit.checkOutAt ? ` · left ${fmt(visit.checkOutAt)}` : ""}</p>
        <Link className="inline-flex items-center gap-1 text-primary underline" to={`/app/org/service-users/${visit.clientId}?tab=history`}>Visit history<ExternalLink className="h-3 w-3" aria-hidden="true" /></Link></> : <p className="text-muted-foreground">Visit not found.</p>}
    </div>
  </div>;
}

/** Follow-up tasks for one exception, created in the shared Tasks store. Never changes the exception or dose. */
export function ExceptionFollowUp({ exception, outcome, task }: { exception: MedicationException; outcome?: MedicationOutcomeRecord; task?: MedicationTask }) {
  const role = useRole(); const { tasks } = useTasksStore(); const [open, setOpen] = useState(false);
  const linked = tasks.filter((t) => t.medicationLinks?.exceptionId === exception.id);
  const canCreate = isManagerRole(role.role) && !!outcome && !!task?.visit_id;
  return <div className="mt-3 space-y-2">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow-up tasks</p>
    {!linked.length && <p className="text-muted-foreground">No follow-up task yet.</p>}
    <ul className="space-y-1">{linked.map((t) => { const s = effectiveStatus(t); return <li key={t.id}>
      <Link to={`/app/tasks/${t.id}`} className="flex flex-wrap items-center gap-2 rounded-md border p-2 hover:bg-accent"><ClipboardList className="h-4 w-4" aria-hidden="true" /><span className="font-medium">{t.title}</span><Badge variant="outline" className={statusBadgeClass(s)}>{statusLabel(s)}</Badge><span className="text-muted-foreground">{staffName(t.assigneeId)} · due {fmt(t.dueAt)}</span></Link>
    </li>; })}</ul>
    {canCreate && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Create follow-up task</Button>}
    {open && outcome && task && <CreateFollowUpDialog exception={exception} outcome={outcome} task={task} onClose={() => setOpen(false)} />}
  </div>;
}

function CreateFollowUpDialog({ exception, outcome, task, onClose }: { exception: MedicationException; outcome: MedicationOutcomeRecord; task: MedicationTask; onClose: () => void }) {
  const role = useRole(); const people = followUpAssignees(exception.site_id);
  const tomorrow = new Date(Date.now() + 86_400_000); tomorrow.setHours(12, 0, 0, 0);
  const [assigneeId, setAssigneeId] = useState(people.some((p) => p.id === role.staffId) ? role.staffId : people[0]?.id ?? "");
  const [due, setDue] = useState(new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [priority, setPriority] = useState<TaskPriority>("high");
  const [action, setAction] = useState(""); const [error, setError] = useState("");
  const save = () => {
    if (!assigneeId) return setError("Choose who owns this follow-up.");
    if (!due) return setError("Set a due date.");
    createTask({
      title: `Medication follow-up · ${task.medication.name} ${OUTCOME_LABELS[outcome.outcome].toLowerCase()}`,
      description: action.trim() || `Review ${OUTCOME_LABELS[outcome.outcome].toLowerCase()} recorded by ${staffName(outcome.staff_id)} on ${fmt(outcome.event_at)}.`,
      taskType: "follow_up", sourceType: "medication_exception", sourceRef: exception.id,
      siteId: exception.site_id, ownership: "person", assigneeId, assignedById: role.staffId,
      dueAt: new Date(due).toISOString(), priority,
      medicationLinks: { serviceUserId: exception.client_id, visitId: task.visit_id!, medicationTaskId: task.id, medicationOutcomeId: outcome.id, exceptionId: exception.id },
    });
    onClose();
  };
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
    <DialogHeader><DialogTitle>Create follow-up task</DialogTitle><DialogDescription>Linked to this exception, the original dose record and visit. Creating a task does not acknowledge or resolve the exception.</DialogDescription></DialogHeader>
    <div className="space-y-3">
      <div className="space-y-1"><Label>Assign to</Label><Select value={assigneeId} onValueChange={setAssigneeId}><SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger><SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.roleLabel}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="fu-due">Due</Label><Input id="fu-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        <div className="space-y-1"><Label>Priority</Label><Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select></div>
      </div>
      <div className="space-y-1"><Label htmlFor="fu-action">What needs to happen</Label><Textarea id="fu-action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. Phone Mary's daughter and check with the pharmacist" /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><Button onClick={save}>Create task</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></div>
    </div>
  </DialogContent></Dialog>;
}
