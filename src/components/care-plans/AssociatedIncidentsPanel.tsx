import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { AlertTriangle, ExternalLink, ShieldAlert, BarChart3 } from "lucide-react";
import {
  useAssociatedIncidents, associatedIncidentsStore, summarize,
  CARE_IMPACT_LABELS, canCompleteImpactReview,
  type IncidentSeverity, type IncidentStatus,
  type CarePlanImpactStatus, type AssociatedIncident,
} from "@/lib/associatedIncidentsStore";
import { useRole } from "@/hooks/useRole";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function severityTone(s: IncidentSeverity) {
  return {
    Low: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Moderate: "bg-amber-100 text-amber-800 border-amber-200",
    High: "bg-orange-100 text-orange-800 border-orange-200",
    Critical: "bg-destructive/10 text-destructive border-destructive/20",
  }[s];
}
function statusTone(s: IncidentStatus) {
  return {
    "New event": "bg-primary/10 text-primary border-primary/20",
    "Under review": "bg-amber-100 text-amber-800 border-amber-200",
    "Actions required": "bg-orange-100 text-orange-800 border-orange-200",
    "Completed": "bg-emerald-100 text-emerald-800 border-emerald-200",
  }[s];
}
function impactTone(s: CarePlanImpactStatus) {
  if (s === "not_checked") return "bg-muted text-muted-foreground border-border";
  if (s === "care_plan_updated" || s === "no_review_required") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s === "review_required" || s === "review_suggested" || s === "draft_awaiting_approval") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-primary/10 text-primary border-primary/20";
}

export function AssociatedIncidentsPanel({ personId, personName }: { personId: string; personName: string }) {
  const role = useRole();
  const rows = useAssociatedIncidents(personId);
  const canReview = canCompleteImpactReview(role.role);
  const summary = summarize(rows);
  const reviewTriggered = rows.filter(
    (r) => r.careImpact === "review_required" || r.careImpact === "review_suggested" ||
           r.careImpact === "draft_created" || r.careImpact === "draft_awaiting_approval" ||
           r.careImpact === "care_plan_updated",
  ).length;

  const [checkOpen, setCheckOpen] = useState<AssociatedIncident | null>(null);

  // Care Planning references Events by ID only. Route/params match the Events module conventions.
  const carePlanRef = `CP-${personId.replace(/-/g, "")}`; // e.g. PS-001 → CP-PS001
  const eventsReportUrl = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({
      personSupportedId: personId,
      fromCarePlan: carePlanRef,
      ...extra,
    });
    return `/app/events/reporting?${p.toString()}`;
  };
  const openIncidentInEvents = (incidentId: string) => {
    const p = new URLSearchParams({
      incidentId,
      fromCarePlan: carePlanRef,
      openDetail: "true",
    });
    return `/app/events/reporting?${p.toString()}`;
  };

  const hasFalls = rows.some((r) =>
    /fall/i.test(r.eventType) || /fall/i.test(r.subtype),
  );

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Incidents are owned by the Events module. This is a lightweight view of events associated with {personName.split(" ")[0]} — full records live in Events.
      </div>

      {/* Summary strip */}
      <Card>
        <CardContent className="p-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <Stat label="Associated" value={summary.total} />
          <Stat label="Falls-related" value={summary.fallsRelated} />
          <Stat label="Open / under review" value={summary.openOrUnderReview} />
          <Stat label="Completed" value={summary.completed} />
          <Stat label="Care plan review triggered" value={reviewTriggered} />
        </CardContent>
      </Card>

      {/* Cross-module links */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link to={eventsReportUrl()}>
            <BarChart3 className="h-3.5 w-3.5 mr-1" /> View all related Events
          </Link>
        </Button>
        {hasFalls && (
          <Button size="sm" variant="outline" asChild>
            <Link to={eventsReportUrl({ eventSubtype: "fall" })}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> View falls in Events
            </Link>
          </Button>
        )}
      </div>


      {/* Lightweight list */}
      {rows.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">No incidents associated with {personName.split(" ")[0]}.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.incidentId}>
              <CardContent className="p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <Badge variant="outline" className="font-mono text-[11px]">{r.incidentId}</Badge>
                  <span className="font-medium">{r.eventType}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{r.subtype}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{fmt(r.occurredAt)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="outline" className={severityTone(r.severity)}>{r.severity}</Badge>
                  <Badge variant="outline" className={statusTone(r.status)}>{r.status}</Badge>
                  <Badge variant="outline">Stage: {r.reviewStage}</Badge>
                  <span className="text-muted-foreground">·</span>
                  <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
                  <Badge variant="outline" className={impactTone(r.careImpact)}>
                    {CARE_IMPACT_LABELS[r.careImpact]}
                    {r.linkedDraftVersion ? ` (v${r.linkedDraftVersion})` : ""}
                  </Badge>
                  {r.careImpact === "no_review_required" && r.impactReason && (
                    <span className="text-muted-foreground italic">— {r.impactReason}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" asChild>
                    <Link to={openIncidentInEvents(r.incidentId)}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open in Events
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={eventsReportUrl()}>
                      <BarChart3 className="h-3.5 w-3.5 mr-1" /> View all related Events
                    </Link>
                  </Button>

                  {r.careImpact === "not_checked" && canReview && (
                    <Button size="sm" onClick={() => setCheckOpen(r)}>
                      <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Check care plan impact
                    </Button>
                  )}
                  {r.careImpact === "not_checked" && !canReview && (
                    <span className="text-xs text-muted-foreground italic">Manager/PIC to complete care plan impact review.</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ImpactCheckDialog row={checkOpen} onClose={() => setCheckOpen(null)} actor={role.displayName} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function ImpactCheckDialog({
  row, onClose, actor,
}: { row: AssociatedIncident | null; onClose: () => void; actor: string }) {
  const [decision, setDecision] = useState<"required" | "none">("required");
  const [reason, setReason] = useState("");
  if (!row) return null;
  const handleSubmit = () => {
    if (decision === "none") {
      if (!reason.trim()) {
        toast({ title: "Reason required", description: "Please record why no care plan review is needed." });
        return;
      }
      associatedIncidentsStore.markNoReview(row.incidentId, actor, reason);
      toast({ title: "Recorded", description: "No care plan review required — reason logged." });
    } else {
      associatedIncidentsStore.markReviewRequired(row.incidentId, actor);
      toast({ title: "Care plan review required", description: "The care plan review has been flagged." });
    }
    setReason(""); setDecision("required"); onClose();
  };
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Care plan impact — {row.incidentId}</DialogTitle>
          <DialogDescription>{row.eventType} · {row.subtype}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Decision</Label>
            <Select value={decision} onValueChange={(v) => setDecision(v as any)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="required">Care plan review required</SelectItem>
                <SelectItem value="none">No care plan review required</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {decision === "none" && (
            <div>
              <Label className="text-xs">Reason (required)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Environmental cause resolved; existing plan already covers this." rows={3} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Record decision</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
