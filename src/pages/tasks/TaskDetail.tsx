import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Camera, Paperclip, MessageSquarePlus, User, Home, FileIcon } from "lucide-react";
import {
  useTasksStore, effectiveStatus, statusBadgeClass, statusLabel,
  siteName, unitName, staffName, taskTypeLabel, sourceLabel, formatLocations,
  recurrenceSummary, taskOwnership, ownershipLabel, CURRENT_USER, isAssignedToUser, isHouseTaskForUser,
  STAFF, completeTask, skipTask, startTask, reassignTask, rescheduleTask, addAttachment, addNote,
} from "@/lib/tasksStore";

export default function TaskDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { tasks, templates } = useTasksStore();
  const t = tasks.find(x => x.id === id);
  const linkedTemplate = t?.recurringTemplateId ? templates.find(x => x.id === t.recurringTemplateId) : undefined;

  const [completeOpen, setCompleteOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const [completionNote, setCompletionNote] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [newAssignee, setNewAssignee] = useState(t?.assigneeId ?? "");
  const [newDue, setNewDue] = useState(t ? new Date(t.dueAt).toISOString().slice(0, 16) : "");
  const [noteText, setNoteText] = useState("");
  const [attachCaption, setAttachCaption] = useState("");

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!t) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => nav("/app/tasks/register")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>
        <p className="mt-4">Task not found.</p>
      </div>
    );
  }

  const s = effectiveStatus(t);
  const own = taskOwnership(t);
  const me = CURRENT_USER;
  const meName = me.name;

  const canActOnThis =
    isAssignedToUser(t, me.id) ||
    isHouseTaskForUser(t, { onShiftSiteIds: me.onShiftSiteIds, onShiftUnitIds: me.onShiftUnitIds });

  const handleFile = (file: File, kind: "photo" | "file") => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : undefined;
      addAttachment(
        t.id,
        {
          kind,
          name: file.name,
          dataUrl: kind === "photo" ? dataUrl : undefined,
          caption: attachCaption.trim() || undefined,
          addedById: me.id,
        },
        meName
      );
      setAttachCaption("");
      toast(kind === "photo" ? "Photo attached" : "File attached");
    };
    if (kind === "photo") reader.readAsDataURL(file);
    else reader.readAsDataURL(file); // store small files inline for demo
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-20 space-y-4">
      <Button variant="ghost" onClick={() => nav(-1)}>
        <ArrowLeft className="h-4 w-4 mr-2" />Back
      </Button>

      {/* Ownership banner */}
      <div
        className={[
          "rounded-lg border px-4 py-3 flex items-center justify-between gap-3",
          own === "person" ? "bg-primary/5 border-primary/20" : "bg-warning/10 border-warning/20",
        ].join(" ")}
      >
        <div className="flex items-center gap-2 text-sm">
          {own === "person" ? <User className="h-4 w-4 text-primary" /> : <Home className="h-4 w-4 text-warning" />}
          <span className="font-medium">
            {own === "person"
              ? `Assigned to ${staffName(t.assigneeId)}`
              : `House task — owned by ${formatLocations(t)}`}
          </span>
          {own === "location" && (
            <span className="text-muted-foreground">· any on-shift staff can complete</span>
          )}
        </div>
        {canActOnThis && (
          <Badge variant="outline" className="bg-white">You can complete this</Badge>
        )}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge className={statusBadgeClass(s)} variant="outline">{statusLabel(s)}</Badge>
            <Badge variant="secondary">{taskTypeLabel(t.taskType)}</Badge>
            <Badge variant="outline">{sourceLabel(t.sourceType)}{t.sourceRef && t.sourceType !== "recurring_template" ? ` · ${t.sourceRef}` : ""}</Badge>
            {t.priority === "high" && <Badge variant="destructive">High priority</Badge>}
          </div>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{formatLocations(t)}</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {(t.status === "open" || t.status === "in_progress") && (
            <>
              {t.status === "open" && (
                <Button variant="outline" onClick={() => { startTask(t.id, meName); toast("Marked in progress"); }}>
                  Start
                </Button>
              )}
              <Button onClick={() => setCompleteOpen(true)}>Complete</Button>
              <Button variant="outline" onClick={() => setSkipOpen(true)}>Skip</Button>
              <Button variant="outline" onClick={() => setNoteOpen(true)}>
                <MessageSquarePlus className="h-4 w-4 mr-1" />Note
              </Button>
              <Button variant="outline" onClick={() => photoInputRef.current?.click()}>
                <Camera className="h-4 w-4 mr-1" />Photo
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-4 w-4 mr-1" />File
              </Button>
              <Button variant="outline" onClick={() => setReassignOpen(true)}>Reassign</Button>
              <Button variant="outline" onClick={() => setRescheduleOpen(true)}>Reschedule</Button>
            </>
          )}
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f, "photo"); e.currentTarget.value = ""; }} />
      <input ref={fileInputRef} type="file" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f, "file"); e.currentTarget.value = ""; }} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Instructions</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{t.description || "No instructions provided."}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <Row k="Ownership" v={ownershipLabel(own)} />
            <Row k="Locations" v={formatLocations(t)} />
            {(t.siteIds && t.siteIds.length > 1) && (
              <div className="pt-1">
                <div className="text-xs text-muted-foreground mb-1">Applies to</div>
                <ul className="list-disc list-inside text-sm space-y-0.5">
                  {t.siteIds.map(sid => <li key={sid}>{siteName(sid)}</li>)}
                </ul>
              </div>
            )}
            {own === "person" && <Row k="Assigned to" v={staffName(t.assigneeId)} />}
            <Row k="Assigned by" v={staffName(t.assignedById)} />
            <Row k="Due" v={new Date(t.dueAt).toLocaleString()} />
            {linkedTemplate && <Row k="Schedule" v={recurrenceSummary(linkedTemplate)} />}
            {!linkedTemplate && t.recurrence && <Row k="Recurrence" v={t.recurrence} />}
            {t.completedAt && <Row k="Completed" v={new Date(t.completedAt).toLocaleString()} />}
            {t.completedById && <Row k="Completed by" v={staffName(t.completedById)} />}
            {t.completionNote && <Row k="Completion note" v={t.completionNote} />}
            {t.skippedById && <Row k="Skipped by" v={staffName(t.skippedById)} />}
            {t.skippedReason && <Row k="Skipped reason" v={t.skippedReason} />}
            {t.sourceRef && <Row k="Linked to" v={t.sourceRef} />}
          </CardContent>
        </Card>
      </div>

      {/* Attachments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Evidence & attachments</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => photoInputRef.current?.click()}>
              <Camera className="h-3.5 w-3.5 mr-1" />Add photo
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-3.5 w-3.5 mr-1" />Add file
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(t.attachments?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No attachments yet. Add a photo or file as proof.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {t.attachments!.map(a => (
                <div key={a.id} className="rounded-md border bg-muted/20 overflow-hidden">
                  {a.kind === "photo" && a.dataUrl ? (
                    <img src={a.dataUrl} alt={a.name} className="w-full h-28 object-cover" />
                  ) : (
                    <div className="w-full h-28 grid place-items-center text-muted-foreground">
                      <FileIcon className="h-8 w-8" />
                    </div>
                  )}
                  <div className="p-2 text-xs">
                    <div className="truncate font-medium">{a.name}</div>
                    {a.caption && <div className="text-muted-foreground truncate">{a.caption}</div>}
                    <div className="text-muted-foreground mt-0.5">
                      {staffName(a.addedById)} · {new Date(a.addedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity */}
      <Card>
        <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {t.activity.slice().reverse().map((a, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <div className="text-xs text-muted-foreground w-36 shrink-0">{new Date(a.at).toLocaleString()}</div>
              <div><span className="font-medium">{a.by}</span> — {a.message}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complete task</DialogTitle></DialogHeader>
          <Label>Completion note (optional)</Label>
          <Textarea value={completionNote} onChange={e => setCompletionNote(e.target.value)} placeholder="What was done? Any observations?" />
          <p className="text-xs text-muted-foreground">Recorded as completed by {meName} just now.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            <Button onClick={() => { completeTask(t.id, completionNote.trim() || undefined, meName, me.id); setCompleteOpen(false); setCompletionNote(""); toast("Task completed"); }}>
              Confirm complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Skip task</DialogTitle></DialogHeader>
          <Label>Reason (optional)</Label>
          <Textarea value={skipReason} onChange={e => setSkipReason(e.target.value)} placeholder="Why is this being skipped?" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipOpen(false)}>Cancel</Button>
            <Button onClick={() => { skipTask(t.id, skipReason.trim() || undefined, meName, me.id); setSkipOpen(false); setSkipReason(""); toast("Task skipped"); }}>
              Confirm skip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add note</DialogTitle></DialogHeader>
          <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Short context, observation or update…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button onClick={() => { addNote(t.id, noteText, meName); setNoteOpen(false); setNoteText(""); toast("Note added"); }}>
              Add note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reassign task</DialogTitle></DialogHeader>
          <Label>Assignee</Label>
          <Select value={newAssignee} onValueChange={setNewAssignee}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{STAFF.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — {s.role}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>Cancel</Button>
            <Button onClick={() => { reassignTask(t.id, newAssignee, meName); setReassignOpen(false); toast("Task reassigned"); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reschedule task</DialogTitle></DialogHeader>
          <Label>New due date/time</Label>
          <Input type="datetime-local" value={newDue} onChange={e => setNewDue(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)}>Cancel</Button>
            <Button onClick={() => { rescheduleTask(t.id, new Date(newDue).toISOString(), meName); setRescheduleOpen(false); toast("Task rescheduled"); }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>;
}
