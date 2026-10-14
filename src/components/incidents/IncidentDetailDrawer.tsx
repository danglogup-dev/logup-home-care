import { isManagerRole } from "@/lib/roleStore";
import { useTerms } from "@/hooks/useTerms";
// Shared full incident detail — used by Events Board, Events Reporting and any
// deep link from Care Planning ("Open in Events"). Data source: the canonical
// `IncidentRecord` (Events owns it), merged with seeded enrichment and the live
// governance overlay from `incidentWorkspaceStore`. Care-plan impact is read
// from the Care Planning-owned `associatedIncidentsStore` by incident ID.
//
// Large centered MODAL (Dialog). Component name kept as `IncidentDetailDrawer`
// for backwards compatibility with existing imports.
//
// Site-only geography: Person Supported / Site / Location. No units, wings or floors.

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { insightSignalsStore, linkedServiceUserIdFor } from "@/lib/insightSignals";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { SITES } from "@/lib/demoDataRegistry";
import { ServiceUserPicker } from "@/components/incidents/ServiceUserPicker";
import { isSiteLevelEvent } from "@/lib/eventVisibility";
import { serviceUserName } from "@/lib/serviceUsersStore";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle, CheckCircle2, Clock, FileText, Paperclip, Shield,
  ShieldAlert, User as UserIcon, ExternalLink, ChevronDown, ChevronRight,
  Bell, FileCheck2, Download, MessageSquarePlus, ListPlus, Play,
  ClipboardCheck, RotateCcw, X, Mic, Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { IncidentRecord, Severity } from "@/lib/incidentRecords";
import {
  associatedIncidentsStore, CARE_IMPACT_LABELS, useAssociatedIncidents, type CarePlanImpactStatus,
} from "@/lib/associatedIncidentsStore";
import { useCarePlans } from "@/lib/carePlansStore";
import { carePlanStatusForEvent } from "@/lib/carePlanReviewTrigger";
import { useRole } from "@/hooks/useRole";
import { inScope } from "@/lib/roleStore";
import { reviewerCandidatesForSiteName } from "@/lib/demoDataRegistry";
import {
  notificationFormsStore, useNotificationDraftsForIncident, getTemplate,
} from "@/lib/notificationFormsStore";
import { NotificationFormPrepDialog } from "@/components/incidents/NotificationFormPrepDialog";
import {
  incidentWorkspaceStore, useIncidentView, closureBlockers, createLinkedTask,
} from "@/lib/incidentWorkspaceStore";

const severityTone: Record<Severity, string> = {
  Low: "bg-success/10 text-success border-success/20",
  Moderate: "bg-warning/10 text-warning border-warning/20",
  High: "bg-destructive/10 text-destructive border-destructive/20",
  Critical: "bg-destructive/15 text-destructive border-destructive/30",
};

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("closed") || s.includes("complete")) return "bg-success/10 text-success border-success/20";
  if (s.includes("overdue") || s.includes("action")) return "bg-destructive/10 text-destructive border-destructive/20";
  if (s.includes("review")) return "bg-warning/10 text-warning border-warning/20";
  return "bg-secondary text-foreground border-border";
}

function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-heading font-semibold text-sm text-foreground">{children}</h3>
      {right}
    </div>
  );
}

function KV({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="bg-background rounded-lg border border-border p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground mt-0.5 break-words">{value ?? "—"}</p>
    </div>
  );
}

function Prose({ label, value }: { label: string; value?: ReactNode }) {
  if (!value) return null;
  return (
    <div className="bg-background rounded-lg border border-border p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-sm text-foreground leading-relaxed">{value}</p>
    </div>
  );
}

function Section({
  title, defaultOpen = true, collapsible = false, right, children,
}: {
  title: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!collapsible) {
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <SectionTitle right={right}>{title}</SectionTitle>
        <div>{children}</div>
      </section>
    );
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl border border-border bg-card">
      <CollapsibleTrigger className="w-full flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <h3 className="font-heading font-semibold text-sm text-foreground">{title}</h3>
        </div>
        {right}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** Footer action. When blocked, stays clickable and explains why (toast + tooltip). */
function ActionButton({
  icon, label, onClick, blockedReason, primary,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  blockedReason?: string | null;
  primary?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={primary ? "default" : "outline"}
      className={`h-8 text-xs ${blockedReason ? "opacity-60" : ""}`}
      title={blockedReason ?? label}
      onClick={() => {
        if (blockedReason) { toast.error(blockedReason); return; }
        onClick();
      }}
    >
      {icon}
      {label}
    </Button>
  );
}

export interface IncidentDetailDrawerProps {
  incident: IncidentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional care-plan backlink info (e.g. from ?fromCarePlan=CP-PS001). */
  backlink?: { label: string; to: string } | null;
}

export function IncidentDetailDrawer({
  incident, open, onOpenChange, backlink,
}: IncidentDetailDrawerProps) {
  const terms = useTerms();
  const role = useRole();
  const view = useIncidentView(incident);
  const nfDrafts = useNotificationDraftsForIncident(incident?.id);

  const [prepOpen, setPrepOpen] = useState(false);
  const [notReqOpen, setNotReqOpen] = useState(false);
  const [notReqReason, setNotReqReason] = useState("");

  // Action dialogs
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [actionOpen, setActionOpen] = useState(false);
  const [actTitle, setActTitle] = useState("");
  const [actOwner, setActOwner] = useState("");
  const [actDue, setActDue] = useState("");
  const [actPriority, setActPriority] = useState("normal");
  const [impactOpen, setImpactOpen] = useState(false);
  const [impactDecision, setImpactDecision] = useState<CarePlanImpactStatus>("review_suggested");
  const [impactReason, setImpactReason] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeSummary, setCloseSummary] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPick, setAssignPick] = useState("");
  const [sevOpen, setSevOpen] = useState(false);
  const [sevPick, setSevPick] = useState("");
  const [sevNotes, setSevNotes] = useState("");

  // Re-render when care plan links or suggestions change.
  useAssociatedIncidents();
  useCarePlans();
  useSyncExternalStore(insightSignalsStore.subscribe, insightSignalsStore.resolutions, insightSignalsStore.resolutions);
  if (!incident || !view) return null;
  const i = incident;
  const v = view;
  const linkedId = i.serviceUserId ?? linkedServiceUserIdFor(i.id);
  const siteLevel = !linkedId && isSiteLevelEvent(i);
  const serviceUserLabel = linkedId ? serviceUserName(linkedId) : siteLevel ? "Site event · no resident involved" : "Resident not linked";

  const impact = associatedIncidentsStore.getById(i.id);
  const primaryDraft = nfDrafts[0];

  const openActions = v.actions.filter((a) => !a.done);
  const overdueActions = openActions.filter((a) => {
    const d = new Date(a.due);
    return !isNaN(d.getTime()) && d.getTime() < Date.now();
  });
  const doneActions = v.actions.filter((a) => a.done);
  const isClosed = /closed|completed/i.test(v.status);

  // ---- Role-aware capability ------------------------------------------------
  const inSiteScope = inScope(v.site, role.role, role.scope);
  const isExternal = role.role === "external";
  const isViewOnly = role.role === "viewonly";
  const isManagerish = role.role === "admin" || isManagerRole(role.role);
  const roleLabel = role.role === "admin" ? "Admin"
    : isManagerRole(role.role) ? "Manager / PIC"
      : role.role === "frontline" ? "Frontline"
        : role.role === "viewonly" ? "View Only" : "External Specialist";

  const managerBlock = (what: string): string | null => {
    if (isExternal) return "External Specialists don't have access to the Events module.";
    if (isViewOnly) return "View Only users cannot edit records.";
    if (!isManagerish) return `Only Manager/PIC/Admin can ${what}.`;
    if (!inSiteScope) return `${v.site} is outside your site scope.`;
    return null;
  };

  const canManageNotification = isManagerish && inSiteScope;

  // ---- Notification status --------------------------------------------------
  const notif = i.regulatoryNotification;
  const notifStatus: string = primaryDraft
    ? primaryDraft.status
    : notif
      ? (notif.submittedAt ? "Submitted outside LogUp" : notif.required ? "Notification form suggested" : "Marked not required, reason recorded")
      : v.notifications.hiqa
        ? v.notifications.hiqa
        : (v.severity === "High" || v.severity === "Critical" ? "Possible notification" : "Not assessed");
  const notificationAssessed = !/not assessed/i.test(notifStatus);

  const primaryTemplate = primaryDraft ? getTemplate(primaryDraft.templateId) : undefined;
  const cpStatus = carePlanStatusForEvent(i.id);
  const careImpactStatus = impact
    ? cpStatus.label
    : v.carePlanRef ? CARE_IMPACT_LABELS[v.carePlanRef.impact] : "Not checked";

  // ---- Classification (single line, no duplicate type/subtype cards) --------
  const classification = v.subtype && v.subtype.toLowerCase() !== v.category.toLowerCase()
    ? `${v.category} · ${v.subtype}`
    : v.category;

  // ---- Missing information --------------------------------------------------
  const missingInfo: string[] = [];
  if (!v.injury) missingInfo.push("injury / impact");
  if (!v.notifications.family || /pending|not recorded/i.test(v.notifications.family)) missingInfo.push("family / NOK notification");
  if (!v.reviewer) missingInfo.push("PIC reviewer");

  // ---- Review focus (derived from existing flags and statuses) --------------
  const reviewFocus: string[] = [];
  if (!v.reviewer) reviewFocus.push(`Assign PIC reviewer — suggested: ${v.defaultPic ?? "site PIC"}`);
  if (!v.managerReview?.summary) {
    reviewFocus.push(v.reviewStartedAt ? "Manager/PIC review in progress — record the review summary" : "Manager/PIC review not started");
  }
  if (!v.reviewedSeverity) reviewFocus.push(`Confirm severity — currently recorded as ${v.severity}`);
  if (/fall/i.test(classification)) reviewFocus.push("Check care plan mobility / falls guidance");
  if (/behaviour/i.test(classification)) reviewFocus.push("Behaviour pattern review suggested");
  if (/medication/i.test(classification)) reviewFocus.push("Confirm medication administration review");
  if (/not checked/i.test(careImpactStatus)) reviewFocus.push("Care plan impact not checked");
  else if (/suggested|required/i.test(careImpactStatus)) reviewFocus.push(`Care plan: ${careImpactStatus}`);
  if (!notificationAssessed) reviewFocus.push("Notification status not assessed");
  else if (/possible|suggested/i.test(notifStatus)) reviewFocus.push(`Notification: ${notifStatus}`);
  if (overdueActions.length > 0) reviewFocus.push(`${overdueActions.length} follow-up action${overdueActions.length === 1 ? "" : "s"} overdue`);
  else if (openActions.length > 0) reviewFocus.push(`${openActions.length} follow-up action${openActions.length === 1 ? "" : "s"} open`);
  if (!v.injury) reviewFocus.push("Confirm injury / impact detail");
  if (!v.notifications.family || /pending|not recorded/i.test(v.notifications.family)) reviewFocus.push("Confirm family / next-of-kin notification");
  if (reviewFocus.length === 0) reviewFocus.push("No outstanding review items — the incident is ready for a closure decision.");

  const linkedReferences = (i.linkedEvidence ?? []).filter((l) => l.kind === "policy" || l.kind === "audit");

  const reviewerCandidates = reviewerCandidatesForSiteName(v.site);

  const gate = closureBlockers(v, notificationAssessed);

  const canMoveToReview = /new event|submitted|awaiting review|draft/i.test(v.status);

  // ---- Handlers -------------------------------------------------------------
  const doMoveToReview = () => {
    incidentWorkspaceStore.moveToUnderReview(i.id, role.displayName, roleLabel, v.status, v.reviewer);
    toast.success(`${i.id} moved to Under Review`, { description: v.reviewer ? undefined : `Assigned to ${role.displayName}.` });
  };

  const saveNote = () => {
    incidentWorkspaceStore.addGovernanceNote(i.id, noteText.trim(), role.displayName, roleLabel);
    setNoteOpen(false); setNoteText("");
    toast.success("Governance note added to the incident record.");
  };

  const saveAction = () => {
    const due = actDue || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const dueLabel = new Date(due).toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" });
    incidentWorkspaceStore.addFollowUpAction(
      i.id,
      { action: actTitle.trim(), owner: actOwner.trim() || role.displayName, due: dueLabel, priority: actPriority },
      role.displayName, roleLabel,
    );
    createLinkedTask({
      incidentId: i.id,
      title: actTitle.trim(),
      owner: actOwner.trim() || role.displayName,
      dueIso: new Date(due).toISOString(),
      priority: actPriority as "low" | "normal" | "high",
      siteId: v.site === "East Cork" ? "site-oak" : v.site === "West Waterford" ? "site-rose" : "site-elm",
      createdById: role.displayName,
    });
    setActionOpen(false); setActTitle(""); setActOwner(""); setActDue(""); setActPriority("normal");
    toast.success("Follow-up action created and linked to this incident.");
  };

  const saveImpact = () => {
    incidentWorkspaceStore.recordCarePlanImpact(i.id, impactDecision, {
      reason: impactReason.trim() || undefined,
      sections: v.carePlanRef?.sections,
      actor: role.displayName,
      role: roleLabel,
      prevLabel: careImpactStatus,
    });
    setImpactOpen(false); setImpactReason("");
    toast.success(`Care plan impact recorded: ${CARE_IMPACT_LABELS[impactDecision]}`);
  };

  const doClose = () => {
    incidentWorkspaceStore.closeIncident(i.id, closeSummary.trim(), role.displayName, roleLabel, v.status);
    setCloseOpen(false); setCloseSummary("");
    toast.success(`${i.id} closed.`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-none w-[90vw] sm:w-[88vw] lg:w-[85vw] xl:max-w-[1180px] max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* ---------------- Sticky header ---------------- */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-xs font-mono text-muted-foreground">{i.id}</span>
                <Badge variant="outline" className={`text-[10px] ${statusTone(v.status)}`}>{v.status}</Badge>
                <Badge variant="outline" className={`text-[10px] font-semibold ${severityTone[(v.severity as Severity)] ?? ""}`}>{v.severity}</Badge>
                <Badge variant="outline" className="text-[10px]">{classification}</Badge>
                {notif?.required && (
                  <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/30 inline-flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Notifiable
                  </Badge>
                )}
                {v.carePlanRef?.impact === "review_required" && (
                  <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">
                    Care plan review required
                  </Badge>
                )}
                {v.carePlanRef?.impact === "draft_created" && (
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    Draft care plan update created
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-base font-heading leading-snug">{i.summary}</DialogTitle>
              <DialogDescription className="text-xs mt-1">
                {`${serviceUserLabel} · `}{v.site} · {v.location} · {i.date}
              </DialogDescription>
              {backlink && (
                <div className="mt-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                    <Link to={backlink.to}>← {backlink.label}</Link>
                  </Button>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ---------------- Scrollable body ---------------- */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-secondary/20">
          {isExternal && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              External Specialists don't have access to the full incident record.
            </div>
          )}

          {/* -------- Section 1: At a glance -------- */}
          <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <SectionTitle>At a glance</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <KV label={terms.Singular} value={serviceUserLabel} />
              <KV label="Site" value={v.site} />
              <KV label="Location" value={v.location} />
              <KV label="Incident date / time" value={i.date} />
              <KV label="Classification" value={classification} />
              <KV label="Severity" value={v.reviewedSeverity && v.reviewedSeverity !== v.initialSeverity ? `${v.reviewedSeverity} (reviewed)` : v.severity} />
              <KV label="Review stage" value={v.reviewStage ?? v.status} />
              <div className="bg-background rounded-lg border border-border p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reviewer / PIC</p>
                {v.reviewer ? (
                  <>
                    <p className="text-sm font-medium text-foreground mt-0.5 break-words">{v.reviewer}</p>
                    <p className="text-[11px] text-muted-foreground">{v.reviewerTitle ?? "Manager / PIC"}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-warning mt-0.5">PIC review pending</p>
                    <button
                      type="button"
                      className="text-[11px] text-primary underline underline-offset-2 mt-0.5"
                      onClick={() => {
                        const block = managerBlock("assign a PIC reviewer");
                        if (block) { toast.error(block); return; }
                        setAssignPick(v.defaultPic ?? role.displayName);
                        setAssignOpen(true);
                      }}
                    >
                      Assign PIC reviewer
                    </button>
                  </>
                )}
              </div>
            {!linkedId && !siteLevel && (
              <div className="mt-3 flex flex-wrap items-center gap-2 min-w-0">
                <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30 font-semibold">Resident not linked</Badge>
                {isManagerish && inSiteScope && !isClosed && (() => {
                  const siteId = SITES.find((s) => s.name === v.site)?.id;
                  const users = serviceUsersStore.all().filter((u) => u.siteId === siteId && u.status === "active");
                  return (
                    <div className="w-full sm:w-72">
                      <p className="text-[11px] text-muted-foreground mb-1">Link a resident</p>
                      <ServiceUserPicker users={users} value="" siteChosen singular={terms.singular} plural={terms.plural}
                        onChange={(id) => {
                          if (!id || id === "__none__") return;
                          insightSignalsStore.linkServiceUser(i.id, id, role.displayName, role.staffId);
                          incidentWorkspaceStore.logAudit(i.id, { action: "Resident linked", actor: role.displayName, role: roleLabel, next: serviceUserName(id) });
                          toast.success(`${serviceUserName(id)} linked to ${i.id}`);
                        }} />
                    </div>
                  );
                })()}
              </div>
            )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {overdueActions.length > 0 && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {overdueActions.length} overdue action{overdueActions.length === 1 ? "" : "s"}
                </Badge>
              )}
              {openActions.length > 0 && (
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                  {openActions.length} open action{openActions.length === 1 ? "" : "s"}
                </Badge>
              )}
              <Badge variant="outline" className="bg-background">Care plan: {careImpactStatus}</Badge>
              <Badge variant="outline" className="bg-background">Notification: {notifStatus}</Badge>
              {missingInfo.length > 0 && (
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                  Missing info: {missingInfo.join(", ")}
                </Badge>
              )}
            </div>
          </section>

          {/* -------- Section 2: Review focus -------- */}
          <section className="rounded-xl border border-border bg-card p-4">
            <SectionTitle
              right={<Badge variant="outline" className="text-[10px]">{reviewFocus.length} item{reviewFocus.length === 1 ? "" : "s"}</Badge>}
            >
              Review focus
            </SectionTitle>
            <ul className="space-y-1.5">
              {reviewFocus.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                  <ClipboardCheck className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* -------- Key details (context not shown above) -------- */}
          <Section title="Key details">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <KV label="Captured by" value={v.capturedBy} />
              {v.reportedBy && <KV label="Reported by" value={v.reportedBy} />}
              <KV label="Captured at" value={v.capturedAt} />
              <KV label="Capture method" value={v.captureMethod ?? "Guided prompts"} />
            </div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-3 mb-1.5">Notifications made</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <KV label="Family / next of kin" value={v.notifications.family ?? "Not recorded"} />
              <KV label="GP / medical contact" value={v.notifications.gp ?? "Not recorded"} />
              <KV label="Gardaí" value={v.notifications.gardai ?? "Not applicable"} />
              <KV label="Regulatory" value={v.notifications.hiqa ?? notifStatus} />
              {v.notifications.other && <KV label="Other" value={v.notifications.other} />}
            </div>
          </Section>

          {/* -------- Section 3: What happened -------- */}
          <Section title="What happened">
            <div className="space-y-2">
              <Prose label="Summary" value={v.narrative} />
              <Prose label="Immediate response" value={v.immediateAction} />
              <Prose label="Injury / impact" value={v.injury ?? "Not recorded — confirm at review."} />
              {(v.peopleInvolved.length > 0 || v.witnesses.length > 0) && (
                <div className="grid md:grid-cols-2 gap-2">
                  {v.peopleInvolved.length > 0 && (
                    <div className="bg-background rounded-lg border border-border p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">People involved</p>
                      <div className="flex flex-wrap gap-1.5">
                        {v.peopleInvolved.map((p) => (
                          <Badge key={p} variant="outline" className="text-[11px]">
                            <UserIcon className="h-3 w-3 mr-1" />{p}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {v.witnesses.length > 0 && (
                    <div className="bg-background rounded-lg border border-border p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Witnesses</p>
                      <div className="flex flex-wrap gap-1.5">
                        {v.witnesses.map((w) => (
                          <Badge key={w} variant="outline" className="text-[11px]">{w}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground italic flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> AI-assisted summary — human review required. Original wording is preserved in Evidence and source record.
              </p>
            </div>
          </Section>

          {/* -------- Section 4: Manager / PIC review -------- */}
          <Section
            title="Manager / PIC review"
            right={
              <Badge variant="outline" className={`text-[10px] ${v.managerReview?.summary ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}`}>
                {v.managerReview?.summary ? "Reviewed" : v.reviewStartedAt ? "Review in progress" : "Not started"}
              </Badge>
            }
          >
            {v.managerReview?.summary ? (
              <div className="grid md:grid-cols-2 gap-2">
                <div className="bg-background rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Reviewer</p>
                  <p className="text-sm text-foreground">{v.managerReview.reviewer ?? v.reviewer ?? "PIC review pending"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{v.managerReview.reviewerTitle ?? v.reviewerTitle ?? "Manager / PIC"}</p>
                </div>
                <div className="bg-background rounded-lg border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Review date</p>
                  <p className="text-sm text-foreground">{v.managerReview.reviewedAt ?? v.reviewStartedAt ?? "In progress"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Further review required: {v.managerReview.furtherReviewRequired ? "Yes" : "No"}
                  </p>
                </div>
                <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <KV label="Severity decision" value={v.reviewedSeverity ? (v.reviewedSeverity === v.initialSeverity ? `${v.reviewedSeverity} — unchanged` : `${v.initialSeverity} → ${v.reviewedSeverity}`) : "Not yet confirmed"} />
                  {i.impact && <KV label="Impact" value={i.impact} />}
                  {i.likelihood && <KV label="Likelihood" value={i.likelihood} />}
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Prose label="Review summary" value={v.managerReview.summary} />
                  <Prose label="Learning identified" value={v.managerReview.learning} />
                  <Prose label="Governance comments" value={v.managerReview.governanceComments} />
                  <Prose label="Severity review notes" value={v.managerReview.severityReviewNotes} />
                </div>
                {v.managerReview.flags && v.managerReview.flags.length > 0 && (
                  <div className="bg-background rounded-lg border border-border p-3 md:col-span-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Reviewer flags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {v.managerReview.flags.map((f) => (
                        <Badge key={f} variant="outline" className="text-[11px] bg-warning/10 text-warning border-warning/20">{f}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                <p className="text-sm text-foreground font-medium">Manager/PIC review not started.</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {v.reviewer
                    ? `Assigned to ${v.reviewer}${v.reviewerTitle ? ` — ${v.reviewerTitle}` : ""}.`
                    : `Suggested reviewer for ${v.site}: ${v.defaultPic ?? "site PIC"}${v.defaultPicTitle ? ` — ${v.defaultPicTitle}` : ""}.`}
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 pt-3">
              <ActionButton
                icon={<Play className="h-3 w-3 mr-1" />}
                label={v.reviewStartedAt || /under review/i.test(v.status) ? "Review started" : "Start review"}
                blockedReason={managerBlock("start the review")
                  ?? (v.reviewStartedAt || /under review/i.test(v.status) ? "Review has already been started." : null)}
                onClick={doMoveToReview}
              />
              <ActionButton
                icon={<MessageSquarePlus className="h-3 w-3 mr-1" />} label="Add governance note"
                blockedReason={managerBlock("add governance notes")}
                onClick={() => setNoteOpen(true)}
              />
              <ActionButton
                icon={<ClipboardCheck className="h-3 w-3 mr-1" />} label="Confirm severity"
                blockedReason={managerBlock("confirm severity")}
                onClick={() => { setSevPick(v.reviewedSeverity ?? v.severity); setSevOpen(true); }}
              />
              <ActionButton
                icon={<ListPlus className="h-3 w-3 mr-1" />} label="Add follow-up action"
                blockedReason={managerBlock("create follow-up actions")}
                onClick={() => setActionOpen(true)}
              />
              <ActionButton
                icon={<ShieldAlert className="h-3 w-3 mr-1" />} label="Check care plan impact"
                blockedReason={managerBlock("record care plan impact decisions")}
                onClick={() => setImpactOpen(true)}
              />
            </div>
          </Section>

          {/* -------- Section 5: Follow-up and governance -------- */}
          <Section title="Follow-up and governance">
            <div className="space-y-4">
              {/* Follow-up actions */}
              <div>
                <div className="flex gap-2 text-[11px] mb-2 flex-wrap items-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Follow-up actions</p>
                  <Badge variant="outline">{v.actions.length} total</Badge>
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">{openActions.length} open</Badge>
                  {overdueActions.length > 0 && (
                    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">{overdueActions.length} overdue</Badge>
                  )}
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">{doneActions.length} complete</Badge>
                </div>
                {v.actions.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No follow-up actions recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {v.actions.map((a, idx) => (
                      <div key={`${a.action}-${idx}`} className="flex items-start gap-3 p-2.5 rounded-lg bg-background border border-border">
                        {a.done
                          ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                          : <Clock className="h-4 w-4 text-warning mt-0.5 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{a.action}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {a.owner} · Due {a.due}{a.priority ? ` · ${a.priority}` : ""}
                          </p>
                          {a.note && <p className="text-xs text-muted-foreground italic mt-0.5">Completion note: {a.note}</p>}
                        </div>
                        {a.done
                          ? <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">Complete</Badge>
                          : <Badge variant="outline" className="text-[10px]">Open</Badge>}
                      </div>
                    ))}
                  </div>
                )}
                {v.governanceNotes.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Governance notes</p>
                    {v.governanceNotes.map((n, idx) => (
                      <div key={idx} className="rounded-lg bg-background border border-border p-2.5">
                        <p className="text-sm text-foreground">{n.text}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{n.actor} · {n.role} · {n.at}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Care plan impact */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Care plan impact</p>
                  <Badge variant="outline" className="text-[10px]">{careImpactStatus}</Badge>
                </div>
                {v.carePlanRef ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      <KV label="Linked care plan" value={<span className="font-mono">{v.carePlanRef.planId}</span>} />
                      <KV label="Reviewed by" value={impact?.impactCheckedBy ?? v.managerReview?.reviewer ?? "—"} />
                      {impact?.linkedDraftVersion && <KV label="Draft update" value={`v${impact.linkedDraftVersion}`} />}
                    </div>
                    {v.carePlanRef.sections.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[11px] text-muted-foreground">Linked sections:</span>
                        {v.carePlanRef.sections.map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                        ))}
                      </div>
                    )}
                    {impact?.impactReason && (
                      <p className="text-xs text-muted-foreground italic">No review required — reason: {impact.impactReason}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                        <Link to={`/app/care-plans/people/${v.carePlanRef.personId}`}>
                          <ExternalLink className="h-3 w-3 mr-1" /> Open linked care plan
                        </Link>
                      </Button>
                      <ActionButton
                        icon={<ShieldAlert className="h-3 w-3 mr-1" />} label="Check care plan impact"
                        blockedReason={managerBlock("record care plan impact decisions")}
                        onClick={() => setImpactOpen(true)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {impact ? (
                      <div className="space-y-1.5">
                        <p className="text-xs"><span className="font-medium">{cpStatus.label}</span>{cpStatus.detail ? <span className="text-muted-foreground"> · {cpStatus.detail}</span> : null}</p>
                        <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                          <Link to={`/app/care-plans/plans/${impact.personId}`}>
                            <ExternalLink className="h-3 w-3 mr-1" /> Open care plan
                          </Link>
                        </Button>
                      </div>
                    ) : (
                    <p className="text-xs text-muted-foreground italic">
                      <ShieldAlert className="h-3.5 w-3.5 inline mr-1" />
                      Care plan impact not checked — this incident is not yet linked to a care plan.
                    </p>
                    )}
                    <ActionButton
                      icon={<ShieldAlert className="h-3 w-3 mr-1" />} label="Check care plan impact"
                      blockedReason={managerBlock("record care plan impact decisions")}
                      onClick={() => setImpactOpen(true)}
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Notification Forms */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Notification Forms</p>
                  <Badge variant="outline" className="text-[10px] flex items-center gap-1"><Bell className="h-3 w-3" />{notifStatus}</Badge>
                </div>
                <div className="space-y-2">
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                    <KV label="Suggested template" value={primaryTemplate?.templateCode ?? (v.severity === "High" || v.severity === "Critical" ? "NF03" : "—")} />
                    <KV label="Selected template" value={primaryTemplate ? `${primaryTemplate.templateCode} — ${primaryTemplate.templateName.replace(`${primaryTemplate.templateCode} — `, "")}` : "—"} />
                    <KV label="Missing information" value={primaryDraft ? (primaryDraft.fields.filter(f => f.required && !f.value.trim() && !f.unavailableNote).length || "None") : "—"} />
                    <KV label="Draft status" value={primaryDraft?.status ?? "No draft"} />
                    <KV label="Human reviewer" value={primaryDraft?.approval?.reviewer ?? "—"} />
                    <KV label="Export status" value={primaryDraft?.exportedAt ? `Exported ${new Date(primaryDraft.exportedAt).toLocaleDateString()}` : (primaryTemplate?.pdfTemplateStatus === "Ready" ? "Ready" : "PDF template mapping pending")} />
                    <KV label="Submission" value={primaryDraft?.submittedOutsideAt ? `Outside LogUp ${new Date(primaryDraft.submittedOutsideAt).toLocaleDateString()}${primaryDraft.submittedReference ? ` · ${primaryDraft.submittedReference}` : ""}` : "—"} />
                    <KV label="Authority" value={notif?.authority ?? "—"} />
                  </div>
                  {primaryDraft?.notRequired && (
                    <div className="rounded-lg bg-secondary border border-border p-2.5 text-xs">
                      <p className="font-medium">Marked not required</p>
                      <p className="text-muted-foreground mt-0.5">
                        {primaryDraft.notRequired.reason} — {primaryDraft.notRequired.reviewer} · {new Date(primaryDraft.notRequired.reviewedAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {notif?.notes && <p className="text-xs text-muted-foreground italic">{notif.notes}</p>}
                  <div className="rounded-lg bg-warning/5 border border-warning/20 p-2.5 text-[11px] flex items-start gap-2">
                    <Shield className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                    <span className="text-warning">
                      LogUp prepares draft Notification Forms. A human must review and approve before export or submission.
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <ActionButton
                      icon={<FileCheck2 className="h-3 w-3 mr-1" />}
                      label={primaryDraft ? "Continue draft" : "Generate Notification Form"}
                      blockedReason={managerBlock("prepare Notification Forms")}
                      onClick={() => setPrepOpen(true)}
                    />
                    <ActionButton
                      icon={<Bell className="h-3 w-3 mr-1" />} label="Mark not required"
                      blockedReason={managerBlock("record notification decisions")}
                      onClick={() => setNotReqOpen((x) => !x)}
                    />
                  </div>
                  {notReqOpen && canManageNotification && (
                    <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                      <p className="text-xs font-medium">Reason for marking not required</p>
                      <textarea
                        className="w-full text-xs rounded-md border border-input bg-background p-2 min-h-[60px]"
                        value={notReqReason}
                        onChange={(e) => setNotReqReason(e.target.value)}
                        placeholder="e.g. Reviewed and does not meet notification thresholds under…"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setNotReqOpen(false); setNotReqReason(""); }}>Cancel</Button>
                        <Button
                          size="sm" className="h-7 text-xs"
                          disabled={!notReqReason.trim()}
                          onClick={() => {
                            notificationFormsStore.markNotRequired(i.id, notReqReason.trim(), role.displayName);
                            incidentWorkspaceStore.logAudit(i.id, {
                              action: "Notification marked not required", actor: role.displayName, role: roleLabel, next: notReqReason.trim(),
                            });
                            setNotReqOpen(false); setNotReqReason("");
                            toast.success("Notification decision recorded.");
                          }}
                        >
                          Record decision
                        </Button>
                      </div>
                    </div>
                  )}
                  {nfDrafts.length > 0 && (
                    <details className="text-[11px]">
                      <summary className="cursor-pointer text-muted-foreground">
                        Notification activity ({nfDrafts.reduce((n, d) => n + d.audit.length, 0)} events)
                      </summary>
                      <div className="mt-2 space-y-1">
                        {nfDrafts.flatMap(d => d.audit.map((a, idx) => (
                          <div key={`${d.draftId}-${idx}`} className="flex gap-2">
                            <span className="font-mono text-muted-foreground">{new Date(a.at).toLocaleString()}</span>
                            <span>· {a.event}</span>
                            {a.detail && <span className="text-muted-foreground">— {a.detail}</span>}
                            <span className="text-muted-foreground">· {a.actor}</span>
                          </div>
                        )))}
                      </div>
                    </details>
                  )}
                </div>
              </div>

              {linkedReferences.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Linked audit / policy references</p>
                    <div className="flex flex-wrap gap-1.5">
                      {linkedReferences.map((l) => (
                        <Badge key={l.id} variant="outline" className="text-[11px]">
                          {l.label}{l.ref ? ` · ${l.ref}` : ""}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </Section>

          {/* -------- Closure -------- */}
          {isClosed && v.closure && (
            <Section title="Closure summary">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <KV label="Closed by" value={v.closure.by} />
                  <KV label="Closed at" value={v.closure.at} />
                </div>
                <Prose label="Summary" value={v.closure.summary} />
                {i.closure?.lessonsLearned && <Prose label="Lessons learned" value={i.closure.lessonsLearned} />}
              </div>
            </Section>
          )}

          {/* -------- Section 6: Evidence and source record -------- */}
          <Section title="Evidence and source record" collapsible defaultOpen={false}
            right={<Badge variant="outline" className="text-[10px]">{i.attachments.length + (i.linkedEvidence?.length ?? 0) + (v.sourceEvidence ? 1 : 0)} item{i.attachments.length + (i.linkedEvidence?.length ?? 0) + (v.sourceEvidence ? 1 : 0) === 1 ? "" : "s"}</Badge>}
          >
            <div className="space-y-2">
              {v.sourceEvidence ? (
                <>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Source evidence — preserved verbatim</p>
                      <Badge variant="outline" className="text-[10px] flex items-center gap-1">
                        <Mic className="h-3 w-3" />{v.sourceEvidence.captureMethod}
                      </Badge>
                    </div>
                    <p className="text-sm text-foreground italic leading-relaxed">“{v.sourceEvidence.originalNarrative}”</p>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Captured by {v.sourceEvidence.submittedBy} · {v.sourceEvidence.submittedAt}
                    </p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-primary mb-1 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> AI-assisted summary — human review required
                    </p>
                    <p className="text-sm text-foreground leading-relaxed">{v.sourceEvidence.aiSummary}</p>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">Source evidence — preserved verbatim. No captured source note on this record.</p>
              )}
              {i.attachments.map((a, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg bg-background border border-border">
                  <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.type} · {a.size}</p>
                  </div>
                </div>
              ))}
              {i.linkedEvidence?.map((l) => (
                <div key={l.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-background border border-border">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{l.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.kind}{l.ref ? ` · ${l.ref}` : ""}{l.date ? ` · ${l.date}` : ""}
                    </p>
                    {l.note && <p className="text-xs text-muted-foreground italic mt-0.5">{l.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* -------- Section 7: Audit trail -------- */}
          <Section title="Audit trail" collapsible defaultOpen={false}
            right={<Badge variant="outline" className="text-[10px]">{v.audit.length} entries</Badge>}
          >
            {v.audit.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No audit entries recorded.</p>
            ) : (
              <div className="space-y-3">
                {v.audit.map((e, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-2.5 w-2.5 rounded-full bg-primary shrink-0 mt-1.5" />
                      {idx < v.audit.length - 1 && <div className="flex-1 w-px bg-border mt-1" />}
                    </div>
                    <div className="pb-1">
                      <p className="text-xs font-mono text-muted-foreground">{e.at}</p>
                      <p className="text-sm text-foreground mt-0.5">{e.action}</p>
                      {(e.prev || e.next) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {e.prev ? `${e.prev} → ` : ""}{e.next ?? ""}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">{e.actor} · {e.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Separator />
          <p className="text-[11px] text-muted-foreground italic flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Incident owned by the Events module — this is the shared full detail view.
          </p>
        </div>

        {/* ---------------- Sticky footer action bar ---------------- */}
        <div className="sticky bottom-0 z-10 bg-card border-t border-border px-5 py-3 flex flex-wrap items-center gap-2 justify-end">
          {isClosed ? (
            <>
              <ActionButton
                icon={<FileText className="h-3.5 w-3.5 mr-1" />} label="Export"
                blockedReason={managerBlock("export records")}
                onClick={() => setExportOpen(true)}
              />
              <ActionButton
                icon={<FileCheck2 className="h-3.5 w-3.5 mr-1" />}
                label={primaryDraft ? "Continue Notification Form" : "Generate Notification Form"}
                blockedReason={managerBlock("prepare Notification Forms")}
                onClick={() => setPrepOpen(true)}
              />
              <ActionButton
                icon={<RotateCcw className="h-3.5 w-3.5 mr-1" />} label="Reopen"
                blockedReason={managerBlock("reopen incidents")}
                onClick={() => {
                  incidentWorkspaceStore.moveToUnderReview(i.id, role.displayName, roleLabel, v.status, v.reviewer);
                  toast.success(`${i.id} reopened and moved to Under Review.`);
                }}
              />
            </>
          ) : (
            <>
              <ActionButton
                icon={<Play className="h-3.5 w-3.5 mr-1" />}
                label={canMoveToReview ? "Move to Under Review" : "Start review"}
                blockedReason={managerBlock("move incidents to review")
                  ?? (canMoveToReview ? null : `Already at stage: ${v.status}.`)}
                onClick={doMoveToReview}
              />
              <ActionButton
                icon={<MessageSquarePlus className="h-3.5 w-3.5 mr-1" />} label="Add governance note"
                blockedReason={managerBlock("add governance notes")}
                onClick={() => setNoteOpen(true)}
              />
              <ActionButton
                icon={<ListPlus className="h-3.5 w-3.5 mr-1" />} label="Add follow-up action"
                blockedReason={managerBlock("create follow-up actions")}
                onClick={() => setActionOpen(true)}
              />
              <ActionButton
                icon={<ShieldAlert className="h-3.5 w-3.5 mr-1" />} label="Check care plan impact"
                blockedReason={managerBlock("record care plan impact decisions")}
                onClick={() => setImpactOpen(true)}
              />
              <ActionButton
                icon={<FileCheck2 className="h-3.5 w-3.5 mr-1" />}
                label={primaryDraft ? "Continue Notification Form" : "Generate Notification Form"}
                blockedReason={managerBlock("prepare Notification Forms")}
                onClick={() => setPrepOpen(true)}
              />
              <ActionButton
                icon={<Download className="h-3.5 w-3.5 mr-1" />} label="Export"
                blockedReason={isExternal || isViewOnly ? "View Only users cannot export records." : null}
                onClick={() => setExportOpen(true)}
              />
              <ActionButton
                primary
                icon={<CheckCircle2 className="h-3.5 w-3.5 mr-1" />} label="Close incident"
                blockedReason={managerBlock("close incidents")}
                onClick={() => setCloseOpen(true)}
              />
            </>
          )}
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>

      {/* ---------------- Notification Form workflow ---------------- */}
      <NotificationFormPrepDialog
        incident={i}
        open={prepOpen}
        onOpenChange={setPrepOpen}
        initialDraftId={primaryDraft?.draftId}
      />

      {/* ---------------- Add governance note ---------------- */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Add governance note</DialogTitle>
            <DialogDescription className="text-xs">
              Recorded against {i.id} and added to the audit trail. Notes do not change the source event record.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full text-sm rounded-md border border-input bg-background p-2 min-h-[110px]"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="e.g. Reviewed at the weekly governance meeting — pattern to be monitored for four weeks."
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!noteText.trim()} onClick={saveNote}>Save note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Add follow-up action ---------------- */}
      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Add follow-up action</DialogTitle>
            <DialogDescription className="text-xs">
              Linked to source incident <span className="font-mono">{i.id}</span> and shared with the Tasks module.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Action title</Label>
              <Input className="h-9 text-sm" value={actTitle} onChange={(e) => setActTitle(e.target.value)} placeholder="e.g. Review transfer technique with the team" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Owner</Label>
                <Input className="h-9 text-sm" value={actOwner} onChange={(e) => setActOwner(e.target.value)} placeholder={role.displayName} />
              </div>
              <div>
                <Label className="text-xs">Due date</Label>
                <Input type="date" className="h-9 text-sm" value={actDue} onChange={(e) => setActDue(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={actPriority} onValueChange={setActPriority}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setActionOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!actTitle.trim()} onClick={saveAction}>Create action</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Care plan impact ---------------- */}
      <Dialog open={impactOpen} onOpenChange={setImpactOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Check care plan impact</DialogTitle>
            <DialogDescription className="text-xs">
              {`${serviceUserLabel} · `}Current status: {careImpactStatus}. Recorded in Care Planning and in this audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Decision</Label>
              <Select value={impactDecision} onValueChange={(x) => setImpactDecision(x as CarePlanImpactStatus)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_review_required">No review required</SelectItem>
                  <SelectItem value="review_suggested">Review suggested</SelectItem>
                  <SelectItem value="review_required">Review required</SelectItem>
                  <SelectItem value="draft_created">Create draft care plan update</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                {impactDecision === "no_review_required" ? "Reason (required)" : "Note (optional)"}
              </Label>
              <textarea
                className="w-full text-sm rounded-md border border-input bg-background p-2 min-h-[80px]"
                value={impactReason}
                onChange={(e) => setImpactReason(e.target.value)}
                placeholder={impactDecision === "no_review_required"
                  ? "Explain why the care plan does not need review."
                  : "Optional context for the care planning team."}
              />
            </div>
            {v.carePlanRef && (
              <p className="text-[11px] text-muted-foreground">
                Linked care plan <span className="font-mono">{v.carePlanRef.planId}</span>
                {v.carePlanRef.sections.length > 0 ? ` · sections: ${v.carePlanRef.sections.join(", ")}` : ""}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground italic">
              A human makes this decision. LogUp records it — it is not a final compliance judgement.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setImpactOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={impactDecision === "no_review_required" && !impactReason.trim()}
              onClick={saveImpact}
            >
              Record decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Assign PIC reviewer ---------------- */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Assign PIC reviewer</DialogTitle>
            <DialogDescription className="text-xs">
              The reviewer defaults to the PIC / Manager for {v.site}. Recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Reviewer</Label>
              <Select value={assignPick} onValueChange={setAssignPick}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a reviewer" /></SelectTrigger>
                <SelectContent>
                  {reviewerCandidates.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name} — {c.roleLabel}</SelectItem>
                  ))}
                  {isManagerish && !reviewerCandidates.some((c) => c.name === role.displayName) && (
                    <SelectItem value={role.displayName}>{role.displayName} — take review</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {v.defaultPic && (
              <p className="text-[11px] text-muted-foreground">
                Suggested for {v.site}: {v.defaultPic}{v.defaultPicTitle ? ` — ${v.defaultPicTitle}` : ""}.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!assignPick}
              onClick={() => {
                const picked = reviewerCandidates.find((c) => c.name === assignPick);
                incidentWorkspaceStore.assignReviewer(
                  i.id, assignPick, picked?.roleLabel ?? "Manager / PIC",
                  role.displayName, roleLabel, v.reviewer,
                );
                setAssignOpen(false);
                toast.success(`${assignPick} assigned as reviewer for ${i.id}.`);
              }}
            >
              Assign reviewer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Confirm severity ---------------- */}
      <Dialog open={sevOpen} onOpenChange={setSevOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Confirm severity</DialogTitle>
            <DialogDescription className="text-xs">
              Severity at capture: {v.initialSeverity}. Your decision is recorded in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Reviewed severity</Label>
              <Select value={sevPick} onValueChange={setSevPick}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select severity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Moderate">Moderate</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Severity review notes (optional)</Label>
              <textarea
                className="w-full text-sm rounded-md border border-input bg-background p-2 min-h-[70px]"
                value={sevNotes}
                onChange={(e) => setSevNotes(e.target.value)}
                placeholder="Why the severity was confirmed or changed."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSevOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!sevPick}
              onClick={() => {
                incidentWorkspaceStore.confirmSeverity(i.id, sevPick, sevNotes.trim() || undefined, role.displayName, roleLabel, v.initialSeverity);
                setSevOpen(false); setSevNotes("");
                toast.success(`Severity confirmed: ${sevPick}`);
              }}
            >
              Confirm severity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Export placeholder ---------------- */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Export incident record</DialogTitle>
            <DialogDescription className="text-xs">
              Export will generate the incident record once export templates are configured.
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            The request is recorded in the audit trail so the governance history stays complete.
          </p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => {
                incidentWorkspaceStore.logExport(i.id, role.displayName, roleLabel, "Full incident record export requested (templates pending)");
                setExportOpen(false);
                toast("Export request recorded", { description: "Export templates are not configured yet." });
              }}
            >
              Record export request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------- Close incident ---------------- */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Close incident {i.id}</DialogTitle>
            <DialogDescription className="text-xs">
              Closure requires manager review, confirmed severity, resolved follow-up actions, a care plan impact decision and an assessed notification status.
            </DialogDescription>
          </DialogHeader>
          {gate.ok ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-success/30 bg-success/5 p-2.5 text-xs text-success flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5" /> All closure prerequisites are met.
              </div>
              <div>
                <Label className="text-xs">Closure summary</Label>
                <textarea
                  className="w-full text-sm rounded-md border border-input bg-background p-2 min-h-[90px]"
                  value={closeSummary}
                  onChange={(e) => setCloseSummary(e.target.value)}
                  placeholder="Summarise the outcome, learning and any monitoring in place."
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p className="text-xs font-medium text-warning mb-1.5 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> This incident can't be closed yet
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-foreground">
                {gate.blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCloseOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!gate.ok || !closeSummary.trim()} onClick={doClose}>
              <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Close incident
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

export default IncidentDetailDrawer;
