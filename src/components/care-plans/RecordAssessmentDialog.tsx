import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  assessmentsStore, ASSESSMENT_CATEGORIES, ASSESSMENT_CATEGORY_LABELS, RISK_LABELS,
  type AssessmentCategory, type AssessmentRisk,
} from "@/lib/assessmentsStore";
import { carePlansStore, formatDate, type ReviewSuggestion } from "@/lib/carePlansStore";
import type { ServiceUserId, StaffId } from "@/lib/demoDataRegistry";

const NONE = "__none";

/** Records the result of the provider's own tool. LogUp does not score. */
export default function RecordAssessmentDialog({ open, onOpenChange, serviceUserId, staffId, actor, actorRole, openSuggestions, defaultCategory }: {
  open: boolean; onOpenChange: (o: boolean) => void; serviceUserId: ServiceUserId; staffId: StaffId; actor: string; actorRole: string;
  openSuggestions: ReviewSuggestion[]; defaultCategory?: AssessmentCategory;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [category, setCategory] = useState<AssessmentCategory>(defaultCategory ?? "falls");
  const [toolName, setToolName] = useState("");
  const [score, setScore] = useState("");
  const [risk, setRisk] = useState<string>(NONE);
  const [summary, setSummary] = useState("");
  const [assessedAt, setAssessedAt] = useState(today);
  const [nextDue, setNextDue] = useState("");
  const [notes, setNotes] = useState("");
  const [suggestionId, setSuggestionId] = useState<string>(NONE);

  const matching = openSuggestions.filter((s) => (s.reassessments ?? []).some((r) => r.category === category && !r.completedAssessmentId));
  useEffect(() => { if (open && defaultCategory) setCategory(defaultCategory); }, [open, defaultCategory]);
  useEffect(() => { setSuggestionId(matching[0]?.id ?? NONE); }, [category, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = toolName.trim() && (risk !== NONE || summary.trim()) && assessedAt && nextDue && nextDue >= assessedAt;

  const save = () => {
    if (!valid) return;
    const sug = openSuggestions.find((s) => s.id === suggestionId);
    const rec = assessmentsStore.record({
      serviceUserId, category, toolName: toolName.trim(), score: score.trim() || undefined,
      riskLevel: risk === NONE ? undefined : (risk as AssessmentRisk), resultSummary: summary.trim(),
      assessedAt: new Date(`${assessedAt}T12:00:00`).toISOString(), assessedByStaffId: staffId,
      nextDueAt: new Date(`${nextDue}T12:00:00`).toISOString(), notes: notes.trim(),
      linkedEventId: sug?.sourceIncidentId, linkedSuggestionId: sug?.id,
    });
    if (sug) carePlansStore.completeReassessment(sug.id, category, rec.id, actor, actorRole);
    toast({ title: "Assessment recorded", description: sug ? "The reassessment on the review suggestion is ticked off." : `Next due ${formatDate(rec.nextDueAt)}.` });
    setToolName(""); setScore(""); setRisk(NONE); setSummary(""); setNotes(""); setNextDue("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record assessment</DialogTitle>
          <DialogDescription>Record the result of the tool your organisation uses. LogUp doesn&apos;t calculate scores.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as AssessmentCategory)}>
                <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                <SelectContent>{ASSESSMENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{ASSESSMENT_CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="asm-tool">Tool used</Label>
              <Input id="asm-tool" value={toolName} onChange={(e) => setToolName(e.target.value)} placeholder="e.g. Morse Fall Scale" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="asm-score">Score (optional)</Label>
              <Input id="asm-score" value={score} onChange={(e) => setScore(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Risk level (optional)</Label>
              <Select value={risk} onValueChange={setRisk}>
                <SelectTrigger aria-label="Risk level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not given by this tool</SelectItem>
                  {(Object.keys(RISK_LABELS) as AssessmentRisk[]).map((r) => <SelectItem key={r} value={r}>{RISK_LABELS[r]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="asm-summary">Result summary{risk === NONE ? "" : " (optional)"}</Label>
            <Textarea id="asm-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="For tools that give a descriptive result" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="asm-date">Assessed on</Label>
              <Input id="asm-date" type="date" value={assessedAt} onChange={(e) => setAssessedAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="asm-due">Next due</Label>
              <Input id="asm-due" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="asm-notes">Notes</Label>
            <Textarea id="asm-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Linked review suggestion</Label>
            <Select value={suggestionId} onValueChange={setSuggestionId}>
              <SelectTrigger aria-label="Linked review suggestion"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {openSuggestions.map((s) => <SelectItem key={s.id} value={s.id}>{s.eventLabel ?? s.title}{s.occurredAt ? ` · ${formatDate(s.occurredAt)}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            {suggestionId !== NONE && <p className="text-xs text-muted-foreground">Saving ticks off the matching “Consider reassessment” on this suggestion.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid} onClick={save}>Save assessment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
