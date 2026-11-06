import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { followUpAssignees } from "@/components/emar/ExceptionFollowUp";
import { useRole } from "@/hooks/useRole";
import { staffName, effectiveStatus, statusLabel, statusBadgeClass, type TaskPriority, type TaskRecord } from "@/lib/tasksStore";
import { ASSESSMENT_LABELS, createVisitFollowUp, visitAlertReviewStore, type AlertReview, type DeliveryAssessment } from "@/lib/visitAlertReviewStore";
import type { LiveVisitAlert } from "@/lib/liveVisitRules";
import type { Visit } from "@/lib/visitsStore";

const stamp = (iso: string) => new Date(iso).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const SUGGESTIONS = [
  "Contact assigned carer to confirm visit delivery",
  "Confirm client's wellbeing and whether support was received",
  "Arrange replacement support if care was missed",
  "Investigate why no check-in was recorded",
  "Review attendance documentation through the authorised correction workflow",
];

export default function VisitManagerReview({ visit, siteId, alert, reviews, tasks, canAct }: { visit: Visit; siteId: string; alert?: LiveVisitAlert; reviews: AlertReview[]; tasks: TaskRecord[]; canAct: boolean }) {
  const role = useRole();
  const latest = reviews.filter((r) => r.kind === "assessment" || r.kind === "confirmed_missed").at(-1);
  const currentAssessment = latest?.assessment ?? (latest?.kind === "confirmed_missed" ? "missed" : "not_confirmed");
  const alertId = alert?.id ?? latest?.alertId ?? `visit-${visit.id}`;
  const acknowledged = reviews.some((r) => r.kind === "acknowledged" && r.alertId === alertId);
  const [editing, setEditing] = useState(!latest);
  const [note, setNote] = useState("");
  const [assessment, setAssessment] = useState<DeliveryAssessment>(currentAssessment);
  const [basis, setBasis] = useState("");
  const [message, setMessage] = useState("");
  const [taskOpen, setTaskOpen] = useState(false);
  const pending = tasks.filter((t) => t.status === "open" || t.status === "in_progress");
  const save = () => {
    try {
      visitAlertReviewStore.saveReview({ visitId: visit.id, alertId, byStaffId: role.staffId, note, assessment, evidenceBasis: basis });
      setEditing(false); setNote(""); setBasis(""); setMessage("Review saved. Attendance evidence unchanged.");
    } catch (error) { setMessage((error as Error).message); }
  };
  const activity = [
    ...(alert ? [{ id: `raised-${alert.id}`, at: alert.kind === "late" || alert.kind === "missed" ? new Date(new Date(visit.scheduledStart).getTime() + (alert.kind === "missed" ? 60 : 15) * 60000).toISOString() : alert.at, title: "Alert raised", by: "LogUp", source: alert.id, detail: alert.title, origin: "Original alert" }] : []),
    ...reviews.map((r) => ({ id: r.id, at: r.at, title: r.kind === "acknowledged" ? "Alert acknowledged" : r.kind === "investigation_note" ? "Investigation note added" : "Assessment recorded", by: staffName(r.byStaffId), source: `${r.id} · ${r.alertId}${r.findingsId ? ` · Findings ${r.findingsId}` : ""}`, detail: r.kind === "assessment" ? `${ASSESSMENT_LABELS[r.assessment ?? "not_confirmed"]}${r.evidenceBasis ? ` — Evidence: ${r.evidenceBasis}` : ""}` : r.note, origin: "Manager review" })),
    ...tasks.flatMap((task) => task.activity.map((entry, i) => ({ id: `${task.id}-${i}`, at: entry.at, title: i === 0 ? "Follow-up task created" : "Follow-up updated or completed", by: entry.byStaffId ? staffName(entry.byStaffId) : entry.by, source: task.id, detail: `${task.title} — ${entry.message}`, origin: "Task record" }))),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return <section className="space-y-4 border-t pt-3" aria-label="Manager review">
    <h3 className="font-heading font-semibold">Manager review</h3>
    <dl className="space-y-2 text-sm">
      <div><dt className="text-muted-foreground">Acknowledgement</dt><dd>{acknowledged ? "Acknowledged" : alert ? "Not yet acknowledged" : "No active alert"}</dd></div>
      <div><dt className="text-muted-foreground">Current manager assessment</dt><dd className="font-medium">{ASSESSMENT_LABELS[currentAssessment]}</dd>{latest && <dd className="text-xs text-muted-foreground">Saved by {staffName(latest.byStaffId)} · {stamp(latest.at)}</dd>}</div>
      <div><dt className="text-muted-foreground">Outstanding follow-up</dt><dd>{pending.length ? `${pending.length} open follow-up${pending.length === 1 ? "" : "s"}` : "No open follow-up"}</dd></div>
    </dl>
    {canAct && <>
      {alert && !acknowledged && <Button variant="outline" className="min-h-11" onClick={() => {
        visitAlertReviewStore.add({ visitId: visit.id, alertId, kind: "acknowledged", note: "", byStaffId: role.staffId }); setMessage("Alert acknowledged. Delivery assessment unchanged.");
      }}>Acknowledge alert</Button>}
      {editing ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <div className="space-y-1"><Label htmlFor="review-findings">Review findings</Label><Textarea id="review-findings" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Record factual findings from your investigation" /></div>
        <div className="space-y-1"><Label htmlFor="delivery-assessment">Delivery assessment</Label><Select value={assessment} onValueChange={(v) => setAssessment(v as DeliveryAssessment)}><SelectTrigger id="delivery-assessment" className="h-auto min-h-11 [&>span]:line-clamp-none [&>span]:text-left"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ASSESSMENT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor="review-basis">Evidence basis {assessment !== "not_confirmed" ? "(required)" : "(optional)"}</Label><Input id="review-basis" value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="Source, person contacted, time or record reference" /></div>
        <p className="text-xs text-muted-foreground">No check-in does not establish missed care. Assessments do not change original attendance evidence.</p>
        <div className="flex gap-2"><Button className="min-h-11" type="submit">Save review</Button>{latest && <Button variant="ghost" type="button" onClick={() => { setEditing(false); setNote(""); setBasis(""); }}>Cancel</Button>}</div>
        {(note || basis || assessment !== currentAssessment) && <p className="text-xs text-muted-foreground">Unsaved review changes</p>}
      </form> : <Button variant="outline" className="min-h-11" onClick={() => { setAssessment(currentAssessment); setEditing(true); setTaskOpen(false); setMessage(""); }}>Add further review</Button>}
    </>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <section className="space-y-2 border-t pt-3" aria-label="Follow-up tasks"><h3 className="font-heading font-semibold">Follow-up tasks</h3>
      {!tasks.length && <p className="text-sm text-muted-foreground">No follow-up tasks.</p>}
      {tasks.map((task) => <article key={task.id} className="rounded-md border p-3 space-y-2 text-sm" aria-label={task.title}>
        <p className="font-semibold break-words">{task.title}</p><div className="flex flex-wrap gap-2"><Badge variant="outline" className={statusBadgeClass(effectiveStatus(task))}>{statusLabel(effectiveStatus(task))}</Badge><Badge variant="secondary">{task.priority} priority</Badge></div>
        <p>{staffName(task.assigneeId)} · Due {stamp(task.dueAt)}</p>
        <Button asChild variant="outline" className="min-h-11"><Link to={`/app/tasks/${task.id}`}>Open task</Link></Button>
      </article>)}
      {canAct && !editing && latest?.kind === "assessment" && !taskOpen && <Button className="min-h-11" onClick={() => { setTaskOpen(true); setMessage(""); }}>Create follow-up task</Button>}
      {taskOpen && latest?.kind === "assessment" && <FollowUpForm key={latest.id} visit={visit} siteId={siteId} alertId={alertId} review={latest} onClose={() => setTaskOpen(false)} onSaved={() => { setTaskOpen(false); setMessage("Follow-up task saved and linked to this visit and review."); }} />}
    </section>
    <section className="space-y-3 border-t pt-3" aria-label="Review activity history"><h3 className="font-heading font-semibold">Review activity history</h3>
      {!activity.length && <p className="text-sm text-muted-foreground">No review activity recorded.</p>}
      <ol className="space-y-3">{activity.map((entry) => <li key={entry.id} className="border-l-2 pl-3 text-sm space-y-1"><p className="font-medium">{entry.title}</p><p className="text-xs text-muted-foreground">{entry.origin} · {entry.by} · {stamp(entry.at)}</p>{entry.detail && <p className="whitespace-pre-wrap break-words">{entry.detail}</p>}<p className="text-xs text-muted-foreground break-all">Source: {entry.source}</p></li>)}</ol>
    </section>
  </section>;
}

function FollowUpForm({ visit, siteId, alertId, review, onClose, onSaved }: { visit: Visit; siteId: string; alertId: string; review: AlertReview; onClose: () => void; onSaved: () => void }) {
  const role = useRole(); const people = followUpAssignees(siteId);
  const [title, setTitle] = useState(SUGGESTIONS[review.assessment === "missed" ? 2 : review.assessment === "delivered_discrepancy" ? 4 : 0]);
  const [assignee, setAssignee] = useState(people.find((p) => p.id === role.staffId)?.id ?? people[0]?.id ?? "");
  const [due, setDue] = useState(() => { const day = new Date(Date.now() + 86400000); day.setHours(12, 0, 0, 0); return new Date(day.getTime() - day.getTimezoneOffset() * 60000).toISOString().slice(0, 16); });
  const [priority, setPriority] = useState<TaskPriority>(review.assessment === "missed" ? "high" : "normal");
  const [instructions, setInstructions] = useState(""); const [error, setError] = useState("");
  return <form className="space-y-3 pt-2" aria-label="Create follow-up" onSubmit={(e) => { e.preventDefault(); try {
    createVisitFollowUp({ title, description: instructions, assigneeId: assignee, dueAt: due ? new Date(due).toISOString() : "", priority, taskType: "follow_up", sourceType: "manual", sourceRef: visit.id, siteId, ownership: "person", assignedById: role.staffId, visitReviewLinks: { visitId: visit.id, serviceUserId: visit.clientId, alertId, reviewId: review.id } }); onSaved();
  } catch (err) { setError((err as Error).message); } }}>
    <h4 className="font-semibold">Create follow-up</h4>
    <div className="space-y-1"><Label htmlFor="task-suggestion">LogUp suggestion</Label><Select onValueChange={(v) => setTitle(v)}><SelectTrigger id="task-suggestion" className="h-auto min-h-11 [&>span]:line-clamp-none [&>span]:text-left"><SelectValue placeholder="Choose an action suggestion" /></SelectTrigger><SelectContent>{SUGGESTIONS.map((suggestion) => <SelectItem key={suggestion} value={suggestion}>{suggestion}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1"><Label htmlFor="visit-task-title">Task title</Label><Input id="visit-task-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
    <div className="space-y-1"><Label htmlFor="visit-task-owner">Responsible staff member</Label><Select value={assignee} onValueChange={setAssignee}><SelectTrigger id="visit-task-owner" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
    <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="visit-task-due">Due date/time</Label><Input className="min-w-0" id="visit-task-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></div><div className="space-y-1"><Label htmlFor="visit-task-priority">Priority</Label><Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}><SelectTrigger id="visit-task-priority"><SelectValue /></SelectTrigger><SelectContent>{["low", "normal", "high"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div></div>
    <div className="space-y-1"><Label htmlFor="visit-task-instructions">Action instructions</Label><Textarea id="visit-task-instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></div>
    <p className="text-xs text-muted-foreground break-all">Visit {visit.id} · Client {visit.clientId} · Alert {alertId} · Review {review.id}</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex gap-2"><Button className="min-h-11" type="submit">Save follow-up task</Button><Button className="min-h-11" type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
  </form>;
}