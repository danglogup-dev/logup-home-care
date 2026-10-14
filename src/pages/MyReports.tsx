import { isManagerRole } from "@/lib/roleStore";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, PlusCircle, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useRole } from "@/hooks/useRole";
import { useTerms } from "@/hooks/useTerms";
import { incidentsStore, FIELD_STATE_LABEL, type IncidentCard } from "@/lib/incidentsStore";
import { canViewFullRecord, type VisibilityMode } from "@/lib/eventVisibility";
import { FieldStateTag } from "./IncidentDraft";

const COLUMN_STATUS: Record<IncidentCard["column"], string> = {
  new: "Submitted", review: "Under review", actions: "Actions in progress", complete: "Closed",
};
const statusOf = (c: IncidentCard) => c.lifecycleStatus || COLUMN_STATUS[c.column];
const hhmm = (iso?: string) => iso ? new Date(iso).toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

type Access = "full" | "status" | "hidden";

/** Reporter access is decided by staff ID plus the record's visibility mode. */
function accessFor(c: IncidentCard, role: ReturnType<typeof useRole>): Access {
  if (role.role === "admin" || isManagerRole(role.role)) {
    return canViewFullRecord({ role: role.role, scope: role.scope, viewerStaffId: role.staffId, recordSite: c.site, submitterStaffId: c.createdByStaffId, visibility: c.visibility })
      ? "full" : "status";
  }
  const v: VisibilityMode = c.visibility || "submitter_full";
  if (v === "submitter_full") return "full";
  if (v === "submitter_status") return "status";
  return "hidden";
}

const MyReports = () => {
  const role = useRole();
  const terms = useTerms();
  const navigate = useNavigate();
  const [cards, setCards] = useState<IncidentCard[]>(incidentsStore.getPending());
  useEffect(() => { const u = incidentsStore.subscribe(setCards); return () => { u(); }; }, []);
  const [open, setOpen] = useState<string | null>(null);
  const [amendFor, setAmendFor] = useState<IncidentCard | null>(null);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");

  const mine = cards.filter(c => c.createdByStaffId === role.staffId);

  const saveAmendment = () => {
    if (!amendFor) return;
    incidentsStore.addAmendment(amendFor.id, { text, reason, byName: role.displayName, byStaffId: role.staffId });
    toast("Information added", { description: `${amendFor.id}: the original record is unchanged.` });
    setAmendFor(null); setText(""); setReason("");
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-20 overflow-x-hidden">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">My reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Events you have submitted. Submitted records can't be edited — add information instead.</p>
        </div>
        <Button className="rounded-xl" onClick={() => navigate("/app/incidents/capture")}>
          <PlusCircle className="h-4 w-4 mr-1.5" /> Log an event
        </Button>
      </div>

      {mine.length === 0 ? (
        <div className="mt-6 bg-card rounded-2xl border border-border p-6 text-sm text-muted-foreground text-center">
          You haven't submitted any events yet.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {mine.map((c) => {
            const access = accessFor(c, role);
            const expanded = open === c.id && access === "full";
            return (
              <li key={c.id} className="bg-card rounded-2xl border border-border shadow-soft p-4 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-foreground">{c.id}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.eventType || "Event"} · {c.site} · {c.serviceUserId ? c.resident : `No ${terms.singular} involved`}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-secondary/60 text-foreground">{statusOf(c)}</Badge>
                </div>

                {access === "hidden" && (
                  <p className="mt-3 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" /> Access restricted after submission. Your manager is handling this record.
                  </p>
                )}
                {access === "status" && (
                  <p className="mt-3 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" /> You can see the status of this report only.
                  </p>
                )}
                {access === "full" && (
                  <>
                    <p className="mt-2 text-sm text-foreground line-clamp-2 break-words">{c.summary}</p>
                    <div className="mt-3 flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setOpen(expanded ? null : c.id)}>
                        {expanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />} {expanded ? "Hide record" : "View record"}
                      </Button>
                      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setAmendFor(c)}>
                        <PlusCircle className="h-3.5 w-3.5 mr-1" /> Add information
                      </Button>
                    </div>
                  </>
                )}

                {expanded && (
                  <div className="mt-4 space-y-4 border-t border-border pt-4">
                    <div>
                      <p className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> What you said (original)</p>
                      <p className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words bg-secondary/30 rounded-xl border border-border p-3">{c.submission?.originalText || "—"}</p>
                    </div>
                    {c.fieldProvenance && c.fieldProvenance.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-foreground">Structured record (as submitted — read only)</p>
                        <ul className="mt-1 divide-y divide-border">
                          {c.fieldProvenance.map(f => (
                            <li key={f.key} className="py-2 min-w-0">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs font-medium text-foreground">{f.label}</span>
                                <FieldStateTag state={f.state} />
                              </div>
                              <p className="text-sm text-foreground break-words">{f.value || "—"}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {f.state === "human_confirmed"
                                  ? `Originated as ${FIELD_STATE_LABEL[f.origin]}, ${f.edited ? "edited and confirmed" : "confirmed"} by ${f.confirmedByName} at ${hhmm(f.confirmedAt)}`
                                  : `${FIELD_STATE_LABEL[f.state]} — not confirmed by reporter`}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {c.severityDecision && (
                      <p className="text-xs text-muted-foreground">
                        Severity: LogUp suggested {c.severityDecision.suggestedSeverity} ({c.severityDecision.suggestedSeverityReason})
                        {c.severityDecision.confirmedSeverity ? ` · you confirmed ${c.severityDecision.confirmedSeverity} at ${hhmm(c.severityDecision.confirmedAt)}` : " · not confirmed by you"}
                      </p>
                    )}
                    {c.reporterSignOff && (
                      <p className="text-xs text-muted-foreground">Signed off by {c.reporterSignOff.name} at {hhmm(c.reporterSignOff.confirmedAt)}.</p>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-foreground">Added information ({c.amendments?.length || 0})</p>
                      {(c.amendments || []).length === 0 && <p className="text-xs text-muted-foreground mt-1">None yet.</p>}
                      <ul className="mt-1 space-y-2">
                        {(c.amendments || []).map(a => (
                          <li key={a.id} className="rounded-xl border border-border p-3">
                            <p className="text-sm text-foreground break-words">{a.text}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">Reason: {a.reason} · {a.addedByName} · {hhmm(a.addedAt)}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!amendFor} onOpenChange={(o) => !o && setAmendFor(null)}>
        <DialogContent className="max-w-[92vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add information to {amendFor?.id}</DialogTitle>
            <DialogDescription>Your original report is kept as submitted. This is added alongside it with the time and your reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What do you want to add?" className="min-h-[90px]" />
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason — e.g. remembered a detail, new information" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAmendFor(null)}>Cancel</Button>
            <Button onClick={saveAmendment} disabled={!text.trim() || !reason.trim()}>Add information</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyReports;
