import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import {
  MessageSquare, FileText, Upload, CheckCircle2, XCircle, HelpCircle, Archive as ArchiveIcon,
  ShieldCheck, Stethoscope, Sparkles, User,
} from "lucide-react";
import {
  useSpecialistContributions, specialistContributionsStore,
  CONTRIBUTION_STATUS_LABEL, CARE_PLAN_SECTIONS,
  type SpecialistContribution, type ContributionStatus,
} from "@/lib/specialistContributionsStore";
import { SECTION_LABELS, formatDate } from "@/lib/carePlansStore";
import type { Role } from "@/lib/roleStore";

interface Props {
  personId: string;
  reviewer: { name: string; role: Role };
  readOnly: boolean;
  filterSection?: string | null;
  onClearFilter?: () => void;
}

const STATUS_BADGE: Record<ContributionStatus, string> = {
  submitted: "bg-amber-100 text-amber-800 border-amber-200",
  under_manager_review: "bg-amber-100 text-amber-800 border-amber-200",
  accepted_note_only: "bg-blue-100 text-blue-800 border-blue-200",
  accepted_into_draft: "bg-emerald-100 text-emerald-800 border-emerald-200",
  partially_accepted: "bg-emerald-100 text-emerald-800 border-emerald-200",
  clarification_requested: "bg-primary/10 text-primary border-primary/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  archived: "bg-muted text-muted-foreground border-border",
};

const PENDING: ContributionStatus[] = ["submitted", "under_manager_review", "clarification_requested"];
const ACCEPTED: ContributionStatus[] = ["accepted_note_only", "accepted_into_draft", "partially_accepted"];

function typeIcon(t: SpecialistContribution["contributionType"]) {
  if (t === "professional_note") return MessageSquare;
  if (t === "proposed_section_update") return FileText;
  return Upload;
}

function typeLabel(t: SpecialistContribution["contributionType"]) {
  if (t === "professional_note") return "Professional note";
  if (t === "proposed_section_update") return "Proposed section update";
  return "Supporting document";
}

export function SpecialistContributionsPanel({
  personId, reviewer, readOnly, filterSection, onClearFilter,
}: Props) {
  const state = useSpecialistContributions();
  const all = useMemo(
    () => state.contributions
      .filter((c) => c.personId === personId)
      .filter((c) => !filterSection || c.affectedSections.includes(filterSection as any))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    [state.contributions, personId, filterSection],
  );

  const groups = {
    pending: all.filter((c) => PENDING.includes(c.status)),
    accepted: all.filter((c) => ACCEPTED.includes(c.status)),
    rejected: all.filter((c) => c.status === "rejected"),
    archived: all.filter((c) => c.status === "archived"),
  };

  return (
    <div className="space-y-3">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Specialist contribution only — not yet part of the approved care plan. Manager/PIC review required. Professional registration details recorded for audit.
        </AlertDescription>
      </Alert>

      {filterSection && (
        <div className="flex items-center gap-2 text-xs">
          Filtered by section: <Badge variant="secondary">{SECTION_LABELS[filterSection as keyof typeof SECTION_LABELS] ?? filterSection}</Badge>
          {onClearFilter && <Button variant="ghost" size="sm" onClick={onClearFilter}>Clear filter</Button>}
        </div>
      )}

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending review ({groups.pending.length})</TabsTrigger>
          <TabsTrigger value="accepted">Accepted ({groups.accepted.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({groups.rejected.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({groups.archived.length})</TabsTrigger>
        </TabsList>
        {(["pending","accepted","rejected","archived"] as const).map((k) => (
          <TabsContent key={k} value={k} className="space-y-3 mt-3">
            {groups[k].length === 0 && (
              <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">Nothing here.</CardContent></Card>
            )}
            {groups[k].map((c) => (
              <ContributionCard key={c.id} c={c} reviewer={reviewer} readOnly={readOnly} />
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ContributionCard({ c, reviewer, readOnly }: { c: SpecialistContribution; reviewer: Props["reviewer"]; readOnly: boolean }) {
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [clarify, setClarify] = useState("");
  const [action, setAction] = useState<null | "reject" | "clarify">(null);
  const Icon = typeIcon(c.contributionType);
  const isPending = PENDING.includes(c.status);
  const canReview = !readOnly && (reviewer.role === "admin" || reviewer.role === "manager");

  const affectedLabels = c.affectedSections.map((k) => SECTION_LABELS[k as keyof typeof SECTION_LABELS] ?? CARE_PLAN_SECTIONS.find((s) => s.key === k)?.label ?? k);

  const doAcceptNote = () => {
    specialistContributionsStore.acceptAsNote(c.id, { name: reviewer.name, role: reviewer.role }, note || undefined);
    toast({ title: "Contribution accepted as note", description: "Care plan text unchanged. Recorded in evidence trail." });
    setNote("");
  };
  const doAcceptDraft = async (merge = false) => {
    await specialistContributionsStore.acceptIntoDraft(c.id, { name: reviewer.name, role: reviewer.role }, { note: note || undefined, merge });
    toast({ title: merge ? "Merged into existing draft" : "Accepted into draft", description: "Approval chain required before publication. Published plan unchanged." });
    setNote("");
  };
  const doReject = () => {
    if (!rejectReason.trim()) return;
    specialistContributionsStore.rejectContribution(c.id, { name: reviewer.name, role: reviewer.role }, rejectReason.trim());
    toast({ title: "Contribution rejected" });
    setRejectReason(""); setAction(null);
  };
  const doClarify = () => {
    if (!clarify.trim()) return;
    specialistContributionsStore.requestClarification(c.id, { name: reviewer.name, role: reviewer.role }, clarify.trim());
    toast({ title: "Clarification requested" });
    setClarify(""); setAction(null);
  };
  const doArchive = () => {
    specialistContributionsStore.archiveContribution(c.id, { name: reviewer.name, role: reviewer.role });
    toast({ title: "Contribution archived" });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Icon className="h-4 w-4 text-primary" />
              <span className="font-medium">{c.contributorName}</span>
              <span className="text-sm text-muted-foreground">· {c.profession} · {c.registrationBody}{c.registrationNumber ? ` ${c.registrationNumber}` : ""}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{c.organisation} · submitted {formatDate(c.submittedAt)}</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{typeLabel(c.contributionType)}</Badge>
            <Badge variant="outline" className={STATUS_BADGE[c.status]}>{CONTRIBUTION_STATUS_LABEL[c.status]}</Badge>
            {c.linkedDraftVersionNumber && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200">Draft v{c.linkedDraftVersionNumber}</Badge>
            )}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase text-muted-foreground mb-1">Affected sections</div>
          <div className="flex flex-wrap gap-1">
            {affectedLabels.map((l) => <Badge key={l} variant="secondary">{l}</Badge>)}
          </div>
        </div>

        {c.note && (
          <div>
            <div className="text-[11px] uppercase text-muted-foreground mb-1">Professional note</div>
            <div className="text-sm rounded-md border p-2 bg-muted/30 whitespace-pre-wrap">{c.note}</div>
          </div>
        )}
        {c.proposedText && (
          <div>
            <div className="text-[11px] uppercase text-muted-foreground mb-1">Proposed section wording</div>
            <div className="text-sm rounded-md border p-2 bg-muted/30 whitespace-pre-wrap">{c.proposedText}</div>
            {c.rationale && <div className="text-xs text-muted-foreground italic mt-1">Rationale: {c.rationale}</div>}
          </div>
        )}
        {c.documentTitle && (
          <div className="text-sm">
            <div className="text-[11px] uppercase text-muted-foreground mb-1">Supporting document</div>
            <div className="rounded-md border p-2 flex items-center gap-2 text-xs"><Upload className="h-3.5 w-3.5" /> {c.documentTitle}{c.documentType ? ` · ${c.documentType}` : ""} (placeholder)</div>
          </div>
        )}

        {c.status === "accepted_into_draft" && (
          <Alert className="border-emerald-200 bg-emerald-50 py-2">
            <Sparkles className="h-4 w-4 text-emerald-700" />
            <AlertDescription className="text-xs">
              Contribution accepted into draft{c.linkedDraftVersionNumber ? ` v${c.linkedDraftVersionNumber}` : ""}. Approval chain required before publication. Published care plan unchanged.
            </AlertDescription>
          </Alert>
        )}

        {isPending && canReview && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="text-[11px] uppercase text-muted-foreground">Review actions</div>
              {c.contributionType === "proposed_section_update" && c.proposedText ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => doAcceptDraft(false)}>
                    <FileText className="h-3.5 w-3.5 mr-1" /> Create/replace draft
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => doAcceptDraft(true)}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> Merge into existing draft
                  </Button>
                  <Button size="sm" variant="outline" onClick={doAcceptNote}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1" /> Accept as note only
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAction("clarify")}>
                    <HelpCircle className="h-3.5 w-3.5 mr-1" /> Request clarification
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAction("reject")}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={doAcceptNote}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Accept as note
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAction("clarify")}>
                    <HelpCircle className="h-3.5 w-3.5 mr-1" /> Request clarification
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAction("reject")}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                  </Button>
                </div>
              )}

              {action === "reject" && (
                <div className="rounded-md border p-2 space-y-2">
                  <div className="text-xs">Rejection reason (required, kept in audit history)</div>
                  <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
                    <Button size="sm" onClick={doReject} disabled={!rejectReason.trim()}>Confirm reject</Button>
                  </div>
                </div>
              )}
              {action === "clarify" && (
                <div className="rounded-md border p-2 space-y-2">
                  <div className="text-xs">Message to contributor</div>
                  <Textarea value={clarify} onChange={(e) => setClarify(e.target.value)} rows={2} />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
                    <Button size="sm" onClick={doClarify} disabled={!clarify.trim()}>Send</Button>
                  </div>
                </div>
              )}

              <div className="pt-1">
                <Textarea placeholder="Optional reviewer note (attached to decision)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
              </div>
            </div>
          </>
        )}

        {!isPending && canReview && c.status !== "archived" && (
          <div>
            <Button size="sm" variant="ghost" onClick={doArchive}><ArchiveIcon className="h-3.5 w-3.5 mr-1" /> Archive</Button>
          </div>
        )}

        {(c.decisions?.length ?? 0) > 0 && (
          <>
            <Separator />
            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1 flex items-center gap-1"><Stethoscope className="h-3 w-3" /> Review history</div>
              <div className="space-y-1.5">
                {(c.decisions ?? []).map((d) => (
                  <div key={d.id} className="text-xs border-l-2 border-primary/40 pl-2">
                    <div>
                      <span className="font-medium">{d.reviewerName}</span>
                      <span className="text-muted-foreground"> ({d.reviewerRole})</span>
                      {" — "}
                      <span className="font-medium">{CONTRIBUTION_STATUS_LABEL[
                        (d.decision === "merged_into_draft" ? "accepted_into_draft" : d.decision) as ContributionStatus
                      ] ?? d.decision}</span>
                      {d.draftVersionNumber && <> · Draft v{d.draftVersionNumber}</>}
                    </div>
                    {d.note && <div className="italic text-muted-foreground">"{d.note}"</div>}
                    <div className="text-muted-foreground">{formatDate(d.decidedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="text-[10px] text-muted-foreground pt-1 flex items-center gap-1">
          <User className="h-3 w-3" /> Contributor audit: {c.contributorEmail} · {c.registrationBody}{c.registrationNumber ? ` ${c.registrationNumber}` : ""}
        </div>
      </CardContent>
    </Card>
  );
}
