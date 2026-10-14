import { useState } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, AlertTriangle, Link as LinkIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { carePlansStore, formatDate, templateSectionName, useTemplates, type ReviewSuggestion } from "@/lib/carePlansStore";
import { STAFF, getStaffName, type SiteId, type StaffId } from "@/lib/demoDataRegistry";
import { LOGUP_REVIEW_LABEL, AI_SUGGESTION_LABEL, REASSESSMENT_TRIGGER_LABELS } from "@/lib/carePlanReviewRules";
import { ASSESSMENT_CATEGORIES, ASSESSMENT_CATEGORY_LABELS, type AssessmentCategory } from "@/lib/assessmentsStore";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { formatEventWhen } from "@/lib/carePlanReviewTrigger";

export function isSuggestionOverdue(s: Pick<ReviewSuggestion, "status" | "dueAt">): boolean {
  return s.status === "open" && !!s.dueAt && new Date(s.dueAt).getTime() < Date.now();
}

const MIN_REASON = 10;

interface Props {
  suggestions: ReviewSuggestion[];
  siteId?: SiteId;
  canAct: boolean;
  blockedNote: string;
  actor: string;
  actorRole: string;
}

/** "Care plan review suggestion" — open suggestions shown above the care plan tabs. */
export function CarePlanReviewSuggestionBanner({ suggestions, siteId, canAct, blockedNote, actor, actorRole }: Props) {
  const [assignFor, setAssignFor] = useState<ReviewSuggestion | null>(null);
  const [assignStaff, setAssignStaff] = useState<string>("");
  const [assignDue, setAssignDue] = useState("");
  const [dismissFor, setDismissFor] = useState<ReviewSuggestion | null>(null);
  const [reason, setReason] = useState("");
  const [reassessFor, setReassessFor] = useState<ReviewSuggestion | null>(null);
  const [reassessCat, setReassessCat] = useState<AssessmentCategory>("falls");
  const [reassessReason, setReassessReason] = useState("");
  useTemplates(); // re-render when template names change

  if (suggestions.length === 0) return null;
  const staffOptions = STAFF.filter((s) => !s.external && !s.readOnly && (!siteId || s.scopeSiteIds.includes(siteId)));

  const start = (s: ReviewSuggestion) => {
    const id = carePlansStore.startDraftFromSuggestion(s.id, actor, actorRole);
    if (id) toast({ title: "Review started", description: "A draft update is open. The published plan is unchanged until approved." });
  };
  const openAssign = (s: ReviewSuggestion) => {
    setAssignFor(s);
    setAssignStaff(s.reviewerStaffId ?? "");
    setAssignDue(s.dueAt ? s.dueAt.slice(0, 10) : "");
  };
  const saveAssign = () => {
    if (!assignFor || !assignStaff || !assignDue) return;
    carePlansStore.assignSuggestion(assignFor.id, assignStaff as StaffId, new Date(`${assignDue}T17:00:00`).toISOString(), actor, actorRole);
    toast({ title: "Review assigned", description: `${getStaffName(assignStaff as StaffId)} · due ${formatDate(new Date(`${assignDue}T17:00:00`).toISOString())}` });
    setAssignFor(null);
  };
  const saveDismiss = () => {
    if (!dismissFor) return;
    if (carePlansStore.dismissSuggestion(dismissFor.id, actor, reason, actorRole)) {
      toast({ title: "Marked not required", description: "Your reason is recorded in the care plan audit trail." });
      setDismissFor(null);
      setReason("");
    }
  };

  return (
    <>
      <Alert className="border-primary/30 bg-primary/5">
        <Sparkles className="h-4 w-4 text-primary" />
        <AlertTitle className="flex flex-wrap items-center gap-2 justify-between">
          <span>Care plan review suggestion{suggestions.length > 1 ? `s (${suggestions.length})` : ""}</span>
          <span className="flex gap-1">
            <Badge variant="outline" className="text-[10px]">{LOGUP_REVIEW_LABEL}</Badge>
            <Badge variant="outline" className="text-[10px]">{AI_SUGGESTION_LABEL}</Badge>
          </span>
        </AlertTitle>
        <AlertDescription className="space-y-3 mt-2">
          {suggestions.map((s) => {
            const overdue = isSuggestionOverdue(s);
            const isRule = s.label === LOGUP_REVIEW_LABEL;
            return (
              <div key={s.id} className={`rounded-md border p-3 bg-background space-y-2 ${overdue ? "border-destructive/50" : ""}`}>
                {isRule ? (
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{s.eventLabel} on {s.occurredAt ? formatEventWhen(s.occurredAt) : formatDate(s.createdAt)}.</span>{" "}
                    <Badge variant="secondary" className="text-[10px] mr-1">{LOGUP_REVIEW_LABEL}</Badge>
                    {s.suggestedSections.map((k) => templateSectionName(s.personId, k)).join(", ")}.{!s.reassessments && s.reassessment ? <> {s.reassessment} <span className="text-xs text-muted-foreground">({REASSESSMENT_TRIGGER_LABELS.event_rule})</span></> : null}
                  </p>
                ) : (
                  <p className="text-sm text-foreground">
                    <Badge variant="secondary" className="text-[10px] mr-1">{AI_SUGGESTION_LABEL}</Badge>
                    {s.reason} Sections: {s.suggestedSections.map((k) => templateSectionName(s.personId, k)).join(", ")}.
                  </p>
                )}
                {s.repeatReason && (
                  <p className="text-sm font-medium text-destructive flex items-start gap-1.5">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Repeat event detected — care plan review recommended. {s.repeatReason}</span>
                  </p>
                )}
                {(s.aiSections ?? []).length > 0 && (
                  <ul className="space-y-1">
                    {s.aiSections!.map((a) => (
                      <li key={a.key} className="text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] mr-1">{AI_SUGGESTION_LABEL}</Badge>
                        <span className="font-medium text-foreground">{templateSectionName(s.personId, a.key)}</span> — {a.reason}
                      </li>
                    ))}
                  </ul>
                )}
                {(s.reassessments ?? []).length > 0 && (
                  <ul className="space-y-1" aria-label="Consider reassessment">
                    {s.reassessments!.map((r) => (
                      <li key={r.category} className="text-xs rounded border px-2 py-1.5 bg-muted/30">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.completedAssessmentId ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className="font-medium text-foreground">Consider reassessment — {ASSESSMENT_CATEGORY_LABELS[r.category]}</span>
                          {r.triggers.map((t) => <Badge key={t} variant="outline" className="text-[10px]">Trigger: {REASSESSMENT_TRIGGER_LABELS[t]}{t === "person" && r.addedBy ? ` (${r.addedBy})` : ""}</Badge>)}
                        </div>
                        <div className="text-muted-foreground mt-0.5">{r.reason}</div>
                        {r.completedAssessmentId && <div className="text-foreground mt-0.5">Reassessment recorded by {r.completedBy} · {formatDate(r.completedAt)}</div>}
                      </li>
                    ))}
                    <li className="text-[11px] italic text-muted-foreground">A suggestion, not a clinical requirement. Staff decide whether to reassess.</li>
                  </ul>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {s.dueAt && <span className={overdue ? "text-destructive font-medium" : ""}>Due {formatDate(s.dueAt)}{overdue ? " — overdue" : ""}</span>}
                  {s.reviewerStaffId && <span>Reviewer: {getStaffName(s.reviewerStaffId)}</span>}
                  {s.sourceIncidentId && (
                    <Link to={`/app/incidents/reporting?incidentId=${s.sourceIncidentId}`} className="inline-flex items-center gap-1 underline">
                      <LinkIcon className="h-3 w-3" />{s.sourceIncidentId}
                    </Link>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground italic">A suggestion never changes the care plan. A person decides.</p>
                {canAct ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => start(s)}>Start review</Button>
                    <Button size="sm" variant="outline" onClick={() => openAssign(s)}>Assign review</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setReassessFor(s); setReassessReason(""); }}>Add reassessment</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setDismissFor(s); setReason(""); }}>Not required</Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">{blockedNote}</p>
                )}
              </div>
            );
          })}
        </AlertDescription>
      </Alert>

      <Dialog open={!!assignFor} onOpenChange={(o) => !o && setAssignFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign review</DialogTitle>
            <DialogDescription>Choose who reviews the care plan and by when.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Staff member</Label>
              <Select value={assignStaff} onValueChange={setAssignStaff}>
                <SelectTrigger><SelectValue placeholder="Choose a staff member" /></SelectTrigger>
                <SelectContent>
                  {staffOptions.map((st) => <SelectItem key={st.id} value={st.id}>{st.name} — {st.roleLabel}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input type="date" value={assignDue} onChange={(e) => setAssignDue(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignFor(null)}>Cancel</Button>
            <Button onClick={saveAssign} disabled={!assignStaff || !assignDue}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dismissFor} onOpenChange={(o) => !o && setDismissFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review not required</DialogTitle>
            <DialogDescription>Explain why the care plan does not need reviewing. This is saved with your name in the audit trail.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="nr-reason">Reason</Label>
            <Textarea id="nr-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            <p className={`text-xs ${reason.trim().length >= MIN_REASON ? "text-muted-foreground" : "text-destructive"}`}>
              At least {MIN_REASON} characters ({reason.trim().length}/{MIN_REASON}).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissFor(null)}>Cancel</Button>
            <Button onClick={saveDismiss} disabled={reason.trim().length < MIN_REASON}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!reassessFor} onOpenChange={(o) => !o && setReassessFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add “Consider reassessment”</DialogTitle>
            <DialogDescription>A suggestion for staff. Your name and reason are recorded.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Assessment</Label>
              <Select value={reassessCat} onValueChange={(v) => setReassessCat(v as AssessmentCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ASSESSMENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{ASSESSMENT_CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea value={reassessReason} onChange={(e) => setReassessReason(e.target.value)} rows={3} placeholder="Why reassessment should be considered (at least 10 characters)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReassessFor(null)}>Cancel</Button>
            <Button disabled={reassessReason.trim().length < MIN_REASON} onClick={() => {
              if (reassessFor && carePlansStore.addReassessment(reassessFor.id, reassessCat, reassessReason, actor, actorRole)) {
                toast({ title: "Reassessment suggestion added" });
                setReassessFor(null);
              }
            }}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
