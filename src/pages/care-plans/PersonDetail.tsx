import { useTerms } from "@/hooks/useTerms";
import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, Sparkles, ShieldCheck, HeartPulse, FileText, History, LinkIcon, ListChecks,
  CheckCircle2, XCircle, Edit3, AlertTriangle, User, ClipboardList, Activity, Utensils,
  Pill, MessageSquare, Bell, Footprints, ShieldAlert, Circle, Users as UsersIcon, Clock,
  Plus, Trash2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useCarePlans, carePlansStore, formatDate, statusLabel, SECTION_LABELS, SECTION_ORDER,
  AI_DISCLAIMER, publishedVersion, isPersonInScope, canApproveCarePlan, canEditCarePlanFor, isKeyWorkerFor,
  sectionLabel, availableTemplateSectionsForPerson,
  type SectionKey, type CarePlanVersion, type CarePlanSection, type PersonSupported, type SectionVisibility,
} from "@/lib/carePlansStore";
import { useRole } from "@/hooks/useRole";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { CarePlanReviewSuggestionBanner } from "@/components/care-plans/CarePlanReviewSuggestionBanner";
import { Lock } from "lucide-react";
import {
  useCarePlanApprovalChains, carePlanApprovalChainsStore,
  currentLevel as currentChainLevel, pendingApproversAtLevel, ruleLabel,
  canDecideAtCurrentLevel, findChainForPerson, instanceStatusLabel,
  type CarePlanApprovalInstance,
} from "@/lib/carePlanApprovalChainsStore";
import { carePlanAuditStore, useCarePlanAudit, auditActionLabel } from "@/lib/carePlanAuditStore";
import { UserPlus, Copy, Ban, Stethoscope } from "lucide-react";
import { InviteSpecialistDialog } from "@/components/care-plans/InviteSpecialistDialog";
import {
  useSpecialistContributions, specialistContributionsStore, canInviteSpecialists,
  type InviteStatus,
} from "@/lib/specialistContributionsStore";
import { CARE_PLAN_SECTIONS as SPEC_SECTIONS, ACCESS_LEVELS as SPEC_LEVELS } from "@/lib/specialistContributionsStore";
import { SpecialistContributionsPanel } from "@/components/care-plans/SpecialistContributionsPanel";
import { AssociatedIncidentsPanel } from "@/components/care-plans/AssociatedIncidentsPanel";
import { KeyWorkerCoverageNote } from "@/components/care-plans/KeyWorkerCoverageNote";

import { useAssociatedIncidents, summarize as summarizeIncidents } from "@/lib/associatedIncidentsStore";
import { ShieldAlert as ShieldAlertIcon } from "lucide-react";
import AskLogUpPanel, { buildAssistantInput } from "@/components/care-plans/AskLogUpPanel";
import PriorityRightNow from "@/components/care-plans/PriorityRightNow";
import ConsultationDialog, { consultationSummary } from "@/components/care-plans/ConsultationDialog";
import DraftSectionOrder from "@/components/care-plans/DraftSectionOrder";
import RecordAssessmentDialog from "@/components/care-plans/RecordAssessmentDialog";
import AssessmentChip from "@/components/care-plans/AssessmentChip";
import { useAssessments, ASSESSMENT_CATEGORIES, ASSESSMENT_CATEGORY_LABELS, RISK_LABELS, isAssessmentOverdue } from "@/lib/assessmentsStore";
import { SECTION_ASSESSMENT } from "@/lib/carePlanReviewRules";
import { categoryForSectionKey } from "@/lib/carePlansStore";
import { getStaffName, type StaffId, type ServiceUserId } from "@/lib/demoDataRegistry";
import { proposeCarePlanChanges, type ChangeSet } from "@/lib/carePlanAssistant";
import { CONTENT_STATE_LABELS, type Consultation } from "@/lib/carePlansStore";

// ---------- helpers ----------

function statusBadge(s: CarePlanVersion["status"]) {
  const map: Record<CarePlanVersion["status"], string> = {
    published: "bg-emerald-100 text-emerald-800 border-emerald-200",
    review_suggested: "bg-primary/10 text-primary border-primary/20",
    draft_in_progress: "bg-amber-100 text-amber-800 border-amber-200",
    ready_for_approval: "bg-blue-100 text-blue-800 border-blue-200",
    approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
    archived: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={map[s]}>{statusLabel(s)}</Badge>;
}

function riskBadge(level: PersonSupported["riskLevel"]) {
  const map = {
    low: "bg-emerald-100 text-emerald-800 border-emerald-200",
    medium: "bg-amber-100 text-amber-800 border-amber-200",
    high: "bg-destructive/10 text-destructive border-destructive/20",
  };
  const label = level === "high" ? "High risk" : level === "medium" ? "Medium risk" : "Low risk";
  return <Badge variant="outline" className={map[level]}>{label}</Badge>;
}

function SnapshotCard({
  label, value, tone = "default", icon: Icon, sub,
}: {
  label: string;
  value: string;
  tone?: "default" | "warn" | "danger" | "ok" | "info";
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
}) {
  const toneMap = {
    default: "border-border bg-card",
    warn: "border-amber-200 bg-amber-50",
    danger: "border-destructive/30 bg-destructive/5",
    ok: "border-emerald-200 bg-emerald-50",
    info: "border-primary/30 bg-primary/5",
  };
  const iconTone = {
    default: "text-muted-foreground",
    warn: "text-amber-700",
    danger: "text-destructive",
    ok: "text-emerald-700",
    info: "text-primary",
  };
  return (
    <div className={`rounded-lg border p-3 ${toneMap[tone]}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${iconTone[tone]}`} />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold leading-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

const glanceCards: { key: SectionKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "about", label: "What matters to me", icon: HeartPulse },
  { key: "communication", label: "Communication", icon: MessageSquare },
  { key: "mobility", label: "Mobility & falls support", icon: Footprints },
  { key: "personalCare", label: "Personal care", icon: User },
  { key: "nutrition", label: "Nutrition & hydration", icon: Utensils },
  { key: "medication", label: "Medication support", icon: Pill },
  { key: "risksControls", label: "Key risks", icon: ShieldAlert },
  { key: "reviewNotes", label: "Daily staff reminders", icon: Bell },
];

// ---------- component ----------

export default function PersonDetail() {
  const terms = useTerms();
  const { id = "" } = useParams();
  const { people, plans, suggestions, followUps } = useCarePlans();
  const role = useRole();

  const person = people.find((p) => p.id === id);
  const plan = plans.find((p) => p.personId === id);
  const current = plan?.versions.find((v) => v.id === plan.currentVersionId);
  const draft = plan?.versions.find((v) => v.status === "draft_in_progress" || v.status === "ready_for_approval");
  const personSuggestions = suggestions.filter((s) => s.personId === id);
  const openSuggestions = personSuggestions.filter((s) => s.status === "open");
  const openSuggestion = openSuggestions[0];
  const personFollowUps = followUps.filter((f) => f.personId === id);
  const openTasks = personFollowUps.filter((f) => f.status !== "dismissed");

  const [reviewNote, setReviewNote] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [editingReason, setEditingReason] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  // Read legacy ?tab= param and map removed tabs onto the new consolidated ones.
  const [outerTab, setOuterTab] = useState<string>(() => {
    const p = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const t = p.get("tab");
    if (t === "evidence") return "plan";                 // Evidence merged into Full Plan (drawer)
    if (t === "history") return "drafts";                // Version History merged into Drafts, Approvals & History
    if (t === "contributors" || t === "access") return "contributors";
    if (t && ["glance", "plan", "incidents", "drafts", "tasks", "contributors"].includes(t)) return t;
    // Role-based default when no explicit tab is provided.
    // Key worker → Full Plan; Manager/Admin → Full Plan; Frontline (non-key-worker) & View only → Care at a Glance.
    if (role.role === "manager" || role.role === "admin") return "plan";
    if (role.role === "frontline" && role.presetId === "frontline-keyworker") return "plan";
    return "glance";
  });
  const [evidenceOpen, setEvidenceOpen] = useState<boolean>(() => {
    const p = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    return p.get("tab") === "evidence";
  });
  const [contribFilterSection, setContribFilterSection] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Section editing / adding
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [addSectionMode, setAddSectionMode] = useState<"template" | "custom">("template");
  const [addTemplateKey, setAddTemplateKey] = useState<string>("");
  const [customForm, setCustomForm] = useState<{
    title: string; purpose: string; body: string;
    riskLevel: "" | "low" | "medium" | "high";
    reviewFrequencyMonths: string;
    evidenceRequired: boolean;
    linkedTaskNote: string;
    visibility: SectionVisibility;
    owner: string;
    reason: string;
  }>({
    title: "", purpose: "", body: "", riskLevel: "",
    reviewFrequencyMonths: "", evidenceRequired: false, linkedTaskNote: "",
    visibility: "all_staff", owner: "", reason: "",
  });
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [resetChangeSet, setResetChangeSet] = useState<ChangeSet | null>(null);
  const [consultOpen, setConsultOpen] = useState(false);
  const [assessOpen, setAssessOpen] = useState(false);
  const allAssessments = useAssessments();
  const personAssessments = useMemo(() => allAssessments.filter((a) => a.serviceUserId === id).sort((a, b) => b.assessedAt.localeCompare(a.assessedAt)), [allAssessments, id]);

  const specialistState = useSpecialistContributions();
  const specialistInvites = useMemo(
    () => specialistState.invites.filter((i) => i.personIds.includes(id)),
    [specialistState.invites, id],
  );
  const personContributions = useMemo(
    () => specialistState.contributions.filter((c) => c.personId === id),
    [specialistState.contributions, id],
  );
  const pendingContribs = personContributions.filter((c) =>
    c.status === "submitted" || c.status === "under_manager_review" || c.status === "clarification_requested",
  );
  const acceptedIntoDraftContribs = personContributions.filter((c) => c.status === "accepted_into_draft");
  const canInvite = canInviteSpecialists(role.role);
  const associatedForPerson = useAssociatedIncidents(id);

  const scopeInput = { role: role.role, scope: role.scope, unit: role.unit };
  const canApprove = canApproveCarePlan(role.role);
  const readOnly = role.role === "frontline" || role.role === "viewonly";
  const inScope = person ? isPersonInScope(person, scopeInput) : false;
  const isKeyWorker = person ? isKeyWorkerFor(person, role.staffId) : false;
  // Fine-grained: may create/edit draft edits & add sections for this person.
  // Admin, Manager/PIC (in scope), or the assigned key worker (in scope).
  const canEditPlan = person ? canEditCarePlanFor(person, { ...scopeInput, staffId: role.staffId }) : false;

  const versionHistory = useMemo(
    () => (plan?.versions ?? []).slice().sort((a, b) => b.versionNumber - a.versionNumber),
    [plan]
  );
  const allAuditEvents = useCarePlanAudit();
  const auditEvents = useMemo(() => allAuditEvents.filter((e) => e.personId === person?.id), [allAuditEvents, person?.id]);

  const planTemplate = person ? carePlansStore.templateForPerson(person.id) : undefined;
  const latestTemplateVersion = planTemplate ? publishedVersion(planTemplate)?.versionNumber : undefined;
  const newTemplateAvailable = !!(latestTemplateVersion && current?.templateVersion !== undefined && current.templateVersion < latestTemplateVersion);
  const draftNeedsTemplate = !!(latestTemplateVersion && draft && (draft.templateVersion ?? 0) < latestTemplateVersion);
  const flaggedSections = new Set<SectionKey>(openSuggestions.flatMap((s) => [...s.suggestedSections, ...(s.aiSections ?? []).map((a) => a.key)]));
  const evidenceCount = personSuggestions.reduce((n, s) => n + s.sources.length, 0);
  const linkedIncident = personSuggestions.flatMap((s) => s.sources).find((src) => src.kind === "incident");

  if (!person || !plan || !current) {
    return (
      <div className="p-6">
        <Button variant="ghost" asChild className="mb-4"><Link to="/app/care-plans/plans"><ArrowLeft className="h-4 w-4 mr-1" /> Care plans</Link></Button>
        <Card><CardContent className="p-8 text-center text-muted-foreground">{terms.Singular} not found.</CardContent></Card>
      </div>
    );
  }

  if (!inScope) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Button variant="ghost" asChild className="mb-4"><Link to="/app/care-plans/plans"><ArrowLeft className="h-4 w-4 mr-1" /> Care plans</Link></Button>
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="font-semibold">This person is outside your current scope</div>
            <p className="text-sm text-muted-foreground">
              You&apos;re signed in as {role.displayName} ({role.title}). Ask an Admin if you need access to {person.site}{person.unit ? ` · ${person.unit}` : ""}.
            </p>
            <Button asChild size="sm"><Link to="/app/care-plans/plans">Back to Care Plans</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleCreateReview = () => {
    if (!openSuggestion) return;
    const versionId = carePlansStore.startDraftFromSuggestion(openSuggestion.id, role.displayName, role.role);
    if (versionId) {
      toast({ title: "Draft created", description: `Care Plan v${(plan.versions.length + 1)} started from AI suggestion. Human review required.` });
    }
  };
  const handleMarkReady = () => {
    if (!draft) return;
    // Reason for change is required governance metadata before an approval starts.
    if (!reviewNote.trim()) {
      toast({ title: "Reason for change required", description: "Add a short reason before marking the draft ready for approval." });
      return;
    }
    setConsultOpen(true);
  };
  const confirmMarkReady = (consultation: Consultation) => {
    if (!draft) return;
    carePlansStore.markReadyForApproval(person.id, draft.id, {
      actor: role.displayName, actorRole: role.role, reasonForChange: reviewNote.trim(), consultation,
    });
    toast({ title: "Draft marked ready for approval" });
    setReviewNote("");
    setConsultOpen(false);
  };
  const proposeTemplateOrder = () => {
    const working = draft ?? current;
    setResetChangeSet(proposeCarePlanChanges(buildAssistantInput(person.id, current, working === current ? undefined : draft, associatedForPerson, "", { resetToTemplate: true })));
    setOuterTab("drafts");
  };
  const customOrder = carePlansStore.hasCustomOrder(person.id, current);
  const handleReject = () => {
    if (!draft) return;
    if (!reviewNote.trim()) {
      toast({ title: "Rejection note required", description: "Explain what needs to change so the drafter can revise." });
      return;
    }
    carePlansStore.rejectDraft(person.id, draft.id, reviewNote.trim(), { actor: role.displayName, actorRole: role.role });
    toast({ title: "Draft rejected" });
    setReviewNote("");
  };
  const handleApprovePublish = () => {
    if (!draft) return;
    const instance = carePlanApprovalChainsStore.getInstanceForVersion(draft.id);
    if (instance && instance.status !== "approved") {
      toast({
        title: "Approval chain not complete",
        description: `Care plan cannot be published until all approval levels are cleared. Current: Level ${instance.currentLevelNumber} of ${instance.chainSnapshot.levels.length}.`,
      });
      return;
    }
    carePlansStore.approveAndPublish(person.id, draft.id, role.displayName, reviewNote, { actorRole: role.role });
    toast({ title: `Care Plan v${draft.versionNumber} published`, description: "Previous version archived. Evidence links preserved." });
    setReviewNote("");
  };
  const startEdit = (key: string) => {
    // The published/current version is never edited directly. Ensure a draft exists
    // (cloned from current) and edit that draft's copy of the section instead.
    const target = carePlansStore.ensureDraft(person.id, role.displayName, role.role, "manual") ?? draft;
    if (!target) return;
    const sec = target.sections.find((s) => s.key === key) ?? current.sections.find((s) => s.key === key);
    setEditingSection(key);
    setEditingBody(sec?.body ?? "");
    setEditingReason("");
  };
  const saveEdit = () => {
    if (!editingSection) return;
    const target = carePlansStore.ensureDraft(person.id, role.displayName, role.role, "manual") ?? draft;
    if (!target) return;
    carePlansStore.updateDraftSection(person.id, target.id, editingSection, editingBody, {
      actor: role.displayName, actorRole: role.role, reason: editingReason.trim() || undefined, source: "manual",
    });
    toast({ title: "Draft saved", description: "Published plan unchanged. Draft update recorded — human review required." });
    setEditingSection(null);
    setEditingReason("");
  };
  const cancelEdit = () => { setEditingSection(null); setEditingReason(""); };

  const resetCustomForm = () => setCustomForm({
    title: "", purpose: "", body: "", riskLevel: "",
    reviewFrequencyMonths: "", evidenceRequired: false, linkedTaskNote: "",
    visibility: "all_staff", owner: "", reason: "",
  });

  const handleAddTemplateSection = () => {
    if (!addTemplateKey) return;
    const label = SECTION_LABELS[addTemplateKey as SectionKey] ?? addTemplateKey;
    carePlansStore.addDraftSection(person.id, role.displayName, {
      key: addTemplateKey,
      body: "",
      label,
      isCustom: false,
    }, { actorRole: role.role, sectionType: "template", source: "manual", reason: `Added ${label} section` });
    toast({ title: `Section added to draft`, description: `${label} — awaiting approval. Published plan unchanged.` });
    setAddSectionOpen(false);
    setAddTemplateKey("");
  };

  const handleAddCustomSection = () => {
    const title = customForm.title.trim();
    if (!title) { toast({ title: "Section title is required" }); return; }
    if (!customForm.reason.trim()) { toast({ title: "Reason for adding this section is required" }); return; }
    const customKey = `custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    carePlansStore.addDraftSection(person.id, role.displayName, {
      key: customKey,
      label: title,
      body: customForm.body,
      isCustom: true,
      purpose: customForm.purpose || undefined,
      riskLevel: customForm.riskLevel || undefined,
      reviewFrequencyMonths: customForm.reviewFrequencyMonths ? Number(customForm.reviewFrequencyMonths) : undefined,
      evidenceRequired: customForm.evidenceRequired,
      linkedTaskNote: customForm.linkedTaskNote || undefined,
      visibility: customForm.visibility,
      owner: customForm.owner || undefined,
      reason: customForm.reason || undefined,
    }, { actorRole: role.role, sectionType: "custom", source: "manual", reason: customForm.reason });
    toast({ title: `Custom section added to draft`, description: `${title} — person-specific · awaiting approval. Templates unchanged.` });
    setAddSectionOpen(false);
    resetCustomForm();
  };

  const handleDiscardDraft = () => {
    if (!draft) return;
    carePlansStore.discardDraft(person.id, draft.id, { actor: role.displayName, actorRole: role.role });
    toast({ title: "Draft discarded", description: "Published plan unchanged." });
    setEditingSection(null);
  };


  const templateOptions = useMemo(() => availableTemplateSectionsForPerson(person.id), [person.id, plan, draft]);

  // per-section status derived from draft/openSuggestion
  const sectionStatus = (key: SectionKey): { label: string; className: string } => {
    const draftSec = draft?.sections.find((s) => s.key === key);
    const currentSec = current.sections.find((s) => s.key === key);
    const inDraft = draft && draftSec?.body !== currentSec?.body;
    if (inDraft) return { label: "Draft update", className: "bg-amber-100 text-amber-800 border-amber-200" };
    if (flaggedSections.has(key)) return { label: "Needs review", className: "bg-primary/10 text-primary border-primary/20" };
    return { label: "Current", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  };

  const primaryConcerns = person.tags.length > 0 ? person.tags : (person.riskLevel === "high" ? ["Falls risk"] : []);

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <Button variant="ghost" asChild><Link to="/app/care-plans/plans"><ArrowLeft className="h-4 w-4 mr-1" /> Care Plans</Link></Button>
        <div className="text-xs text-muted-foreground">{person.id}</div>
      </div>

      {/* Compact 2-row person header */}
      {(() => {
        // Main action based on role/status
        const draftReady = draft?.status === "ready_for_approval";
        let mainAction: { label: string; onClick: () => void; variant?: "default" | "outline" } | null = null;
        if (draft && draftReady && canApprove) {
          mainAction = { label: "Review approval", onClick: () => setOuterTab("drafts") };
        } else if (draft && canEditPlan) {
          mainAction = { label: "Continue draft", onClick: () => setOuterTab("drafts") };
        } else if (openSuggestion && canEditPlan) {
          mainAction = { label: "Start review", onClick: handleCreateReview };
        } else {
          mainAction = { label: "View full plan", onClick: () => setOuterTab("plan"), variant: "outline" };
        }
        return (
          <Card>
            <CardContent className="p-4 space-y-2">
              {/* Row 1: identity */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                  {person.initials}
                </div>
                <h1 className="text-lg font-semibold leading-tight">{person.name}</h1>
                <span className="text-muted-foreground">·</span>
                <span>{person.site}{person.unit ? ` · ${person.unit}` : ""}</span>
                {person.keyWorker && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span>Key worker: <span className="font-medium">{person.keyWorker}</span>{isKeyWorker && <Badge variant="outline" className="ml-1.5 text-[10px] bg-primary/10 text-primary border-primary/20">You</Badge>}</span>
                  </>
                )}
                <span className="text-muted-foreground">·</span>
                <span>Current approved plan <span className="font-medium">v{current.versionNumber}</span></span>
              </div>
              {/* Row 2: focus + action */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {riskBadge(person.riskLevel)}
                {primaryConcerns.map((t) => <Badge key={t} variant="secondary" className="text-[11px]">{t}</Badge>)}
                {customOrder && <Badge variant="outline" className="text-[11px]" title="Section order differs from the organisation template">Custom order</Badge>}
                <span className="text-muted-foreground">·</span>
                <span>Next review <span className="font-medium">{formatDate(plan.nextReviewDue)}</span></span>
                {draft && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <Badge variant="outline" className="text-[11px] bg-amber-100 text-amber-800 border-amber-200">
                      Draft v{draft.versionNumber} {draftReady ? "awaiting approval" : "in progress"}
                    </Badge>
                  </>
                )}
                <div className="ml-auto">
                  <Button size="sm" variant={mainAction.variant ?? "default"} onClick={mainAction.onClick}>
                    {mainAction.label}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Compact status strip — 4 items + incident summary */}
      {(() => {
        const incidentRows = associatedForPerson;
        const inc = summarizeIncidents(incidentRows);
        return (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div className="rounded-md border p-2 bg-emerald-50/40 border-emerald-200">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current approved plan</div>
              <div className="font-semibold mt-0.5">v{current.versionNumber}</div>
            </div>
            <div className={`rounded-md border p-2 ${draft ? "bg-amber-50/40 border-amber-200" : ""}`}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Draft update</div>
              <div className="font-semibold mt-0.5">{draft ? `v${draft.versionNumber} — ${draft.status === "ready_for_approval" ? "Awaiting approval" : "In progress"}` : "None"}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Next review</div>
              <div className="font-semibold mt-0.5">{formatDate(plan.nextReviewDue)}</div>
            </div>
            <div className={`rounded-md border p-2 ${openTasks.length > 0 ? "bg-amber-50/40 border-amber-200" : ""}`}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Open actions</div>
              <div className="font-semibold mt-0.5">{openTasks.length}</div>
            </div>
            <button
              type="button"
              onClick={() => setOuterTab("incidents")}
              className={`rounded-md border p-2 text-left transition hover:bg-accent ${inc.openOrUnderReview > 0 || inc.reviewSuggested > 0 ? "bg-amber-50/40 border-amber-200" : ""}`}
            >
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <ShieldAlertIcon className="h-3 w-3" /> Associated incidents
              </div>
              <div className="font-semibold mt-0.5">{inc.total}</div>
              {inc.total > 0 && (
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                  {inc.fallsRelated > 0 && <>Falls-related: {inc.fallsRelated} · </>}
                  Open/review: {inc.openOrUnderReview} · Completed: {inc.completed}
                  {inc.reviewSuggested > 0 && <> · Review suggested: {inc.reviewSuggested}</>}
                </div>
              )}
            </button>
          </div>
        );
      })()}


          {/* Care plan review suggestion — LogUp rules + AI suggestions; a person decides */}
          <CarePlanReviewSuggestionBanner
            suggestions={openSuggestions}
            siteId={serviceUsersStore.getById(person.id)?.siteId}
            canAct={canEditPlan}
            actor={role.displayName}
            actorRole={role.role}
            blockedNote={role.role === "viewonly"
              ? "Read-only view. Care plan changes are managed by the care team."
              : role.role === "frontline"
                ? "Only the assigned key worker, PIC or Admin can act on this suggestion."
                : "This person is outside your current scope."}
          />

          <Tabs value={outerTab} onValueChange={setOuterTab} className="space-y-4">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="glance"><HeartPulse className="h-4 w-4 mr-1" /> Care at a Glance</TabsTrigger>
              <TabsTrigger value="plan"><ShieldCheck className="h-4 w-4 mr-1" /> Full Plan</TabsTrigger>
              <TabsTrigger value="incidents"><ShieldAlertIcon className="h-4 w-4 mr-1" /> Associated Incidents{associatedForPerson.length ? ` (${associatedForPerson.length})` : ""}</TabsTrigger>
              <TabsTrigger value="drafts"><Edit3 className="h-4 w-4 mr-1" /> Drafts, Approvals &amp; History{draft ? ` (v${draft.versionNumber})` : ""}</TabsTrigger>
              <TabsTrigger value="assessments"><ClipboardList className="h-4 w-4 mr-1" /> Assessments{personAssessments.some(isAssessmentOverdue) ? " (overdue)" : ""}</TabsTrigger>
              <TabsTrigger value="tasks"><ListChecks className="h-4 w-4 mr-1" /> Tasks{openTasks.length ? ` (${openTasks.length})` : ""}</TabsTrigger>
              <TabsTrigger value="contributors"><UsersIcon className="h-4 w-4 mr-1" /> Contributors{pendingContribs.length ? ` (${pendingContribs.length})` : ""}</TabsTrigger>
            </TabsList>


            {/* Care at a glance */}
            <TabsContent value="glance" className="space-y-3">
              <PriorityRightNow personId={person.id} current={current} openSuggestions={openSuggestions} canRegenerate={role.role === "manager" || role.role === "admin"} actor={role.displayName} />
              {customOrder && <div><Badge variant="outline" className="text-[11px]">Custom order</Badge> <span className="text-xs text-muted-foreground">This plan uses its own section order.</span></div>}
              <KeyWorkerCoverageNote keyWorkerName={person.keyWorker} />
              <div className="text-xs text-muted-foreground">Practical guidance for staff at the point of care. Drawn from the current approved plan (v{current.versionNumber}).</div>

              {(() => {
                const nutritionSec = current.sections.find((s) => s.key === "nutrition");
                const medicationSec = current.sections.find((s) => s.key === "medication");
                const familySec = current.sections.find((s) => s.key === ("family" as SectionKey));
                const cards: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; body?: string; flagged?: boolean }[] = [
                  { key: "about", label: "What matters to me", icon: HeartPulse, body: current.sections.find((s) => s.key === "about")?.body, flagged: flaggedSections.has("about" as SectionKey) },
                  { key: "communication", label: "Communication", icon: MessageSquare, body: current.sections.find((s) => s.key === "communication")?.body, flagged: flaggedSections.has("communication" as SectionKey) },
                  { key: "risksControls", label: "Key risks", icon: ShieldAlert, body: current.sections.find((s) => s.key === "risksControls")?.body, flagged: flaggedSections.has("risksControls" as SectionKey) },
                  { key: "personalCare", label: "Daily support guidance", icon: User, body: current.sections.find((s) => s.key === "personalCare")?.body, flagged: flaggedSections.has("personalCare" as SectionKey) },
                  { key: "mobility", label: "Mobility & falls guidance", icon: Footprints, body: current.sections.find((s) => s.key === "mobility")?.body, flagged: flaggedSections.has("mobility" as SectionKey) },
                ];
                if (nutritionSec?.body) cards.push({ key: "nutrition", label: "Nutrition & hydration", icon: Utensils, body: nutritionSec.body, flagged: flaggedSections.has("nutrition" as SectionKey) });
                if (medicationSec?.body) cards.push({ key: "medication", label: "Medication support", icon: Pill, body: medicationSec.body, flagged: flaggedSections.has("medication" as SectionKey) });
                if (familySec?.body) cards.push({ key: "family", label: "Family / advocate note", icon: UsersIcon, body: familySec.body });
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {cards.map(({ key, label, icon: Icon, body, flagged }) => (
                      <div key={key} className={`rounded-lg border p-4 ${flagged ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Icon className="h-4 w-4 text-primary" /> {label}
                          </div>
                          {flagged && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">Needs review</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{body ?? "Not recorded."}</p>
                      </div>
                    ))}
                    {openTasks.length > 0 && (
                      <div className="rounded-lg border p-4 bg-amber-50/40 border-amber-200 md:col-span-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <ListChecks className="h-4 w-4 text-amber-700" /> Today&apos;s linked tasks
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setOuterTab("tasks")}>Open tasks</Button>
                        </div>
                        <ul className="text-sm text-foreground/90 leading-relaxed space-y-1 list-disc pl-5">
                          {openTasks.slice(0, 4).map((f) => <li key={f.id}>{f.text}</li>)}
                        </ul>
                        {openTasks.length > 4 && (
                          <div className="text-xs text-muted-foreground mt-1">+{openTasks.length - 4} more</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </TabsContent>


            {/* Full care plan */}
            <TabsContent value="plan" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  Current approved plan v{current.versionNumber} · Published {formatDate(current.publishedAt)} · Approved by {current.approvedBy ?? "—"}
                </div>
                <div className="flex items-center gap-2">
                  {newTemplateAvailable && (
                    <Badge variant="outline" className="text-[10px]" title={`${planTemplate?.name}: plan follows v${current.templateVersion}, latest is v${latestTemplateVersion}`}>New template available</Badge>
                  )}
                  {statusBadge(current.status)}
                  <Button size="sm" variant="ghost" onClick={() => setEvidenceOpen(true)}>
                    <FileText className="h-3.5 w-3.5 mr-1" /> View all evidence
                  </Button>
                  {canEditPlan && (
                    <Button size="sm" variant="outline" onClick={() => { setAddSectionMode("template"); setAddSectionOpen(true); }}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add section
                    </Button>
                  )}
                </div>
              </div>

              {draft && (
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold">Draft update v{draft.versionNumber} — published plan unchanged.</div>
                      <div>Approval required before publication. Current approved plan v{current.versionNumber} remains live.</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEditPlan && draftNeedsTemplate && (
                      <Button size="sm" variant="outline" className="h-7" onClick={() => {
                        if (carePlansStore.applyLatestTemplateToDraft(person.id, role.displayName, role.role)) {
                          toast({ title: `Draft now follows template v${latestTemplateVersion}`, description: "Sections were added, removed or reordered in the draft only. The published plan is unchanged." });
                        }
                      }}>Use latest template</Button>
                    )}
                    {canEditPlan && carePlansStore.templateOrderFor(person.id, draft.sections.map((x) => x.key)).join("|") !== draft.sections.map((x) => x.key).join("|") && (
                      <Button size="sm" variant="outline" className="h-7" onClick={proposeTemplateOrder}>Reset to template order</Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-amber-900 hover:bg-amber-100" onClick={() => setOuterTab("drafts")}>Open Drafts, Approvals &amp; History</Button>
                    {canEditPlan && (
                      <Button size="sm" variant="ghost" className="h-7 text-destructive hover:bg-destructive/10" onClick={handleDiscardDraft}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Discard draft
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {(() => {
                  const currentKeys = new Set(current.sections.map((s) => s.key));
                  const draftAdded = draft ? draft.sections.filter((s) => !currentKeys.has(s.key)) : [];
                  const orderedCurrent: CarePlanSection[] = current.sectionOrderOverride ? current.sections.slice() : [
                    ...SECTION_ORDER.filter((k) => currentKeys.has(k)).map((k) => current.sections.find((s) => s.key === k)!),
                    ...current.sections.filter((s) => !(SECTION_ORDER as readonly string[]).includes(s.key)),
                  ];
                  const rows: Array<{ sec: CarePlanSection; added: boolean }> = [
                    ...orderedCurrent.map((sec) => ({ sec, added: false })),
                    ...draftAdded.map((sec) => ({ sec, added: true })),
                  ];
                  return rows.map(({ sec, added }) => {
                    const key = sec.key;
                    const label = sectionLabel(sec);
                    const isRisky = key === "fallsRisk" || key === "mobility" || key === "safeguarding";
                    const linkedInc = flaggedSections.has(key as SectionKey) ? linkedIncident : undefined;
                    const secContribs = personContributions.filter((c) => c.affectedSections.includes(key as never));
                    const pendSpec = secContribs.filter((c) => c.status === "submitted" || c.status === "under_manager_review" || c.status === "clarification_requested").length;
                    const accSpec = secContribs.filter((c) => c.status === "accepted_into_draft" || c.status === "accepted_note_only" || c.status === "partially_accepted").length;
                    const secEvidence = personSuggestions
                      .filter((s) => s.suggestedSections.includes(key as never))
                      .reduce((n, s) => n + s.sources.length, 0);
                    const secTasks = openTasks.length;
                    const draftSec = draft?.sections.find((s) => s.key === key);
                    const draftDiffers = !!draft && !added && !!draftSec && draftSec.body !== sec.body;
                    const isEditing = editingSection === key;

                    const badgeLabel = added
                      ? { text: "Added — awaiting approval", cls: "bg-amber-100 text-amber-800 border-amber-200" }
                      : draftDiffers
                        ? { text: "Draft update pending", cls: "bg-amber-100 text-amber-800 border-amber-200" }
                        : pendSpec > 0
                          ? { text: "Specialist input", cls: "bg-primary/10 text-primary border-primary/20" }
                          : flaggedSections.has(key as SectionKey) && secEvidence === 0
                            ? { text: "Evidence missing", cls: "bg-destructive/10 text-destructive border-destructive/20" }
                            : flaggedSections.has(key as SectionKey)
                              ? { text: "Needs review", cls: "bg-amber-100 text-amber-800 border-amber-200" }
                              : { text: "Current approved", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };

                    const displayBody = added ? (draftSec?.body ?? sec.body) : sec.body;

                    return (
                      <div
                        key={key}
                        className={`rounded-lg border-l-4 border p-4 bg-card ${
                          added ? "border-l-amber-500/70" : draftDiffers ? "border-l-amber-500/60" : "border-l-emerald-500/60"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="font-medium text-sm truncate">{label}</div>
                            {sec.isCustom && <Badge variant="outline" className="text-[10px]">Custom · person-specific</Badge>}
                            {(() => { const ac = SECTION_ASSESSMENT[categoryForSectionKey(key)]; const la = ac ? personAssessments.find((a) => a.category === ac) : undefined; return la ? <AssessmentChip a={la} /> : null; })()}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={`text-[10px] ${badgeLabel.cls}`}>{badgeLabel.text}</Badge>
                            {isRisky && person.riskLevel === "high" && (
                              <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">High risk</Badge>
                            )}
                          </div>
                        </div>

                        {added && (() => {
                          const addRec = draft?.sectionChanges?.find((c) => c.key === key && c.kind === "added");
                          const meta: string[] = [];
                          if (addRec?.sectionType) meta.push(addRec.sectionType === "custom" ? "Custom · person-specific" : "Template section");
                          if (draftSec?.riskLevel) meta.push(`Risk: ${draftSec.riskLevel}`);
                          if (draftSec?.reviewFrequencyMonths) meta.push(`Review every ${draftSec.reviewFrequencyMonths} mo`);
                          return (
                            <div className="mb-2 rounded-md bg-amber-50 border-2 border-amber-300 text-amber-900 px-2.5 py-2 text-[11px] space-y-1">
                              <div className="font-semibold">Added section awaiting approval — published plan unchanged.</div>
                              <div className="text-amber-800">
                                {meta.join(" · ") || "New section"}
                                {addRec ? ` · Created by ${addRec.editedBy} · ${formatDate(addRec.editedAt)}` : ""}
                              </div>
                              {addRec?.reason && <div className="italic">Reason: {addRec.reason}</div>}
                            </div>
                          );
                        })()}
                        {draftDiffers && !added && !isEditing && (
                          <div className="mb-2 text-[11px] rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1">
                            Draft update — published plan unchanged. Approval required before publication.
                          </div>
                        )}
                        {draftSec?.contentState && draftSec.contentState !== "approved" && (draftDiffers || added) && (
                          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <Badge variant="outline" className="text-[10px] border-dashed">Draft text: {CONTENT_STATE_LABELS[draftSec.contentState]}</Badge>
                            {draftSec.aiOrigin && <span>Accepted by {draftSec.aiOrigin.acceptedBy} · {formatDate(draftSec.aiOrigin.acceptedAt)}{draftSec.aiOrigin.confirmedBy ? ` · Confirmed by ${draftSec.aiOrigin.confirmedBy}` : ""}</span>}
                            {draftSec.contentState === "ai_draft" && canEditPlan && (
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => carePlansStore.confirmDraftSection(person.id, key, role.displayName, role.role)}>Confirm text</Button>
                            )}
                          </div>
                        )}
                        {!added && sec.aiOrigin && (
                          <div className="mb-2 text-[11px] text-muted-foreground">Started as an AI draft · accepted by {sec.aiOrigin.acceptedBy}{sec.aiOrigin.confirmedBy ? ` · confirmed by ${sec.aiOrigin.confirmedBy}` : ""}</div>
                        )}

                        {isEditing ? (
                          <div className="space-y-3">
                            <div className="text-[11px] rounded-md bg-amber-50 border-2 border-amber-300 text-amber-900 px-2.5 py-1.5 font-medium">
                              Draft update — published plan unchanged. Approval required before publication.
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <div className="text-[10px] uppercase tracking-wide text-emerald-800 font-semibold flex items-center gap-1">
                                  <ShieldCheck className="h-3 w-3" /> Current approved plan · v{current.versionNumber}
                                </div>
                                <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2.5 text-sm whitespace-pre-wrap min-h-[9rem]">
                                  {sec.body || <span className="italic text-muted-foreground">Empty</span>}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <div className="text-[10px] uppercase tracking-wide text-amber-800 font-semibold flex items-center gap-1">
                                  <Edit3 className="h-3 w-3" /> Draft update · v{draft?.versionNumber ?? current.versionNumber + 1}
                                </div>
                                <Textarea rows={7} value={editingBody} onChange={(e) => setEditingBody(e.target.value)} className="border-amber-300 focus-visible:ring-amber-400" />
                              </div>
                            </div>
                            <div>
                              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Reason for change (optional but recommended)</Label>
                              <Input
                                value={editingReason}
                                onChange={(e) => setEditingReason(e.target.value)}
                                placeholder="e.g. Updated after fall on 12 Nov — added night-time supervision"
                                className="mt-1"
                              />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" onClick={saveEdit}>Save draft</Button>
                              <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                              <Button size="sm" variant="ghost" onClick={() => setOuterTab("drafts")}>Go to Drafts &amp; Approvals</Button>
                            </div>
                            <AskLogUpPanel personId={person.id} current={current} draft={draft} actor={role.displayName} actorRole={role.role} focusSectionKey={key} />
                          </div>
                        ) : (
                          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{displayBody || <span className="text-muted-foreground italic">Empty — click Edit section to add content to the draft.</span>}</p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>Last updated {formatDate(current.publishedAt)}</span>
                          <span className="flex items-center gap-1"><LinkIcon className="h-3 w-3" /> {secEvidence} evidence</span>
                          <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" /> {secTasks} related task{secTasks === 1 ? "" : "s"}</span>
                          {linkedInc && <span className="flex items-center gap-1"><LinkIcon className="h-3 w-3" />{linkedInc.refId}</span>}
                          {(pendSpec > 0 || accSpec > 0) && (
                            <button
                              type="button"
                              onClick={() => { setContribFilterSection(key as SectionKey); setOuterTab("contributors"); }}
                              className="flex items-center gap-1 text-primary hover:underline"
                            >
                              <Stethoscope className="h-3 w-3" />
                              {pendSpec > 0
                                ? `${pendSpec} specialist ${pendSpec === 1 ? "contribution" : "contributions"} awaiting review`
                                : "Specialist input accepted"}
                            </button>
                          )}
                        </div>

                        {!isEditing && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {canEditPlan && (
                              <Button size="sm" variant="outline" onClick={() => startEdit(key)}>
                                <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit section
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setHistoryKey(key)}>
                              <History className="h-3.5 w-3.5 mr-1" /> View section history
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </TabsContent>




            {/* Assessments */}
            <TabsContent value="assessments" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">Results from the tools your organisation uses. LogUp records them and tracks when they are due.</div>
                {canEditPlan && <Button size="sm" onClick={() => setAssessOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Record assessment</Button>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ASSESSMENT_CATEGORIES.map((c) => {
                  const list = personAssessments.filter((a) => a.category === c);
                  if (!list.length) return null;
                  const [latest, ...older] = list;
                  return (
                    <Card key={c}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium text-sm">{ASSESSMENT_CATEGORY_LABELS[c]}</div>
                          <AssessmentChip a={latest} />
                        </div>
                        <div className="text-sm">{latest.toolName}{latest.score ? ` · score ${latest.score}` : ""}{latest.riskLevel ? ` · ${RISK_LABELS[latest.riskLevel]}` : ""}</div>
                        {latest.resultSummary && <p className="text-sm text-muted-foreground">{latest.resultSummary}</p>}
                        <div className="text-xs text-muted-foreground">Assessed {formatDate(latest.assessedAt)} by {getStaffName(latest.assessedByStaffId)} · next due {formatDate(latest.nextDueAt)}{latest.linkedEventId ? ` · linked to ${latest.linkedEventId}` : ""}</div>
                        {older.length > 0 && <div className="text-xs text-muted-foreground">Earlier: {older.map((o) => `${formatDate(o.assessedAt)} (${o.riskLevel ? RISK_LABELS[o.riskLevel] : o.toolName})`).join(", ")}</div>}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              {personAssessments.length === 0 && <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No assessments recorded yet.</CardContent></Card>}
            </TabsContent>

            {/* Associated Incidents */}
            <TabsContent value="incidents" className="space-y-3">
              <AssociatedIncidentsPanel personId={person.id} personName={person.name} />
            </TabsContent>

            {/* Drafts & Approvals */}
            <TabsContent value="drafts" className="space-y-4">
              {draft && (
                <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold">Draft update v{draft.versionNumber} — published plan unchanged.</div>
                    <div>Approval required before publication. The current approved plan v{current.versionNumber} remains live for staff.</div>
                  </div>
                </div>
              )}
              {/* Always show approval-first summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 bg-emerald-50/40 border-emerald-200">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Current approved plan</div>
                  <div className="font-semibold mt-0.5">v{current.versionNumber} — Published</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{formatDate(current.publishedAt)}{current.approvedBy ? ` · Approved by ${current.approvedBy}` : ""}</div>
                </div>
                <div className={`rounded-lg border p-3 ${draft ? "bg-amber-50/40 border-amber-200" : "bg-card"}`}>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Edit3 className="h-3 w-3" /> Draft update</div>
                  <div className="font-semibold mt-0.5">
                    {draft
                      ? `v${draft.versionNumber} — ${draft.status === "ready_for_approval" ? "Awaiting approval" : "In progress"}`
                      : "No draft in progress"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {draft ? `Created ${formatDate(draft.createdAt)} by ${draft.createdBy}` : (openSuggestion ? "AI review suggestion available" : "—")}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Trigger</div>
                  <div className="font-semibold mt-0.5">
                    {linkedIncident ? `${linkedIncident.refId} fall` : draft ? "Manual update" : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {openSuggestion?.suggestedSections.length
                      ? `Affects: ${openSuggestion.suggestedSections.map((k) => SECTION_LABELS[k]).join(", ")}`
                      : "—"}
                  </div>
                </div>
              </div>

              {canEditPlan && (
                <AskLogUpPanel personId={person.id} current={current} draft={draft} actor={role.displayName} actorRole={role.role} initialChangeSet={resetChangeSet} />
              )}
              {canEditPlan && draft && (
                <DraftSectionOrder personId={person.id} draft={draft} actor={role.displayName} actorRole={role.role} onResetToTemplate={proposeTemplateOrder} />
              )}

              {!draft && !openSuggestion && (
                <Card>
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    No draft update in progress. When an AI review suggestion is created or a manager starts a new version, it will appear here.
                  </CardContent>
                </Card>
              )}

              {draft && (
                <>
                  {/* Approval state FIRST */}
                  <ApprovalChainPanel
                    person={person}
                    draft={draft}
                    reviewNote={reviewNote}
                    setReviewNote={setReviewNote}
                    onMarkReady={handleMarkReady}
                    onReject={handleReject}
                    onApprovePublish={handleApprovePublish}
                    canApprove={canApprove}
                    readOnly={readOnly}
                    roleName={role.role}
                    userName={role.displayName}
                    userStaffId={role.staffId}
                  />
                  {draft.consultation && (
                    <div className="rounded-md border p-3 text-sm">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Who was consulted · How</div>
                      <div className="font-medium mt-0.5">{consultationSummary(draft.consultation, terms.Singular)}</div>
                      <div className="text-xs text-muted-foreground">Recorded by {draft.consultation.recordedBy} · {formatDate(draft.consultation.recordedAt)}</div>
                    </div>
                  )}

                  {/* Change summary — governance metadata for this draft */}
                  {(() => {
                    const changes = draft.sectionChanges ?? [];
                    const edited = changes.filter((c) => c.kind === "edited");
                    const added = changes.filter((c) => c.kind === "added");
                    const removed = changes.filter((c) => c.kind === "removed");
                    const sourceLabel = draft.sourceType
                      ? draft.sourceType === "AI" ? "AI-drafted" : draft.sourceType === "incident" ? "Incident-triggered" : draft.sourceType.charAt(0).toUpperCase() + draft.sourceType.slice(1)
                      : (draft.aiAssisted ? "AI-drafted" : "Manual");
                    return (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" /> Change summary — v{draft.versionNumber}
                          </CardTitle>
                          <div className="text-xs text-muted-foreground">
                            Current approved: v{current.versionNumber} · Draft update: v{draft.versionNumber} — <span className="text-amber-800">{draft.status === "ready_for_approval" ? "Awaiting approval" : "Draft in progress"}</span>. Published plan unchanged.
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="rounded-md border p-2">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Source</div>
                              <div className="font-medium mt-0.5">{sourceLabel}</div>
                            </div>
                            <div className="rounded-md border p-2">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sections edited</div>
                              <div className="font-medium mt-0.5">{edited.length}</div>
                            </div>
                            <div className="rounded-md border p-2">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sections added</div>
                              <div className="font-medium mt-0.5">{added.length}</div>
                            </div>
                            <div className="rounded-md border p-2">
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sections removed</div>
                              <div className="font-medium mt-0.5">{removed.length}</div>
                            </div>
                          </div>
                          {draft.reasonForChange && (
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Reason for change</div>
                              <div className="text-sm mt-0.5">{draft.reasonForChange}</div>
                            </div>
                          )}
                          {(edited.length + added.length + removed.length) > 0 && (
                            <div className="rounded-md bg-muted/40 border p-2 space-y-1 text-xs">
                              {edited.map((c) => (
                                <div key={`e-${c.key}`}>
                                  <span className="font-medium">Edited:</span> {SECTION_LABELS[c.key as SectionKey] ?? c.sectionTitle ?? c.key}
                                  {c.reason && <span className="text-muted-foreground"> — {c.reason}</span>}
                                  <span className="text-muted-foreground"> · {c.editedBy} · {formatDate(c.editedAt)}</span>
                                </div>
                              ))}
                              {added.map((c) => (
                                <div key={`a-${c.key}`}>
                                  <span className="font-medium">Added ({c.sectionType}):</span> {c.sectionTitle ?? c.key}
                                  {c.reason && <span className="text-muted-foreground"> — {c.reason}</span>}
                                  <span className="text-muted-foreground"> · {c.editedBy} · {formatDate(c.editedAt)}</span>
                                </div>
                              ))}
                              {removed.map((c) => (
                                <div key={`r-${c.key}`}>
                                  <span className="font-medium">Removed:</span> {SECTION_LABELS[c.key as SectionKey] ?? c.key}
                                  {c.reason && <span className="text-muted-foreground"> — {c.reason}</span>}
                                  <span className="text-muted-foreground"> · {c.editedBy} · {formatDate(c.editedAt)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })()}

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" /> Drafted changes
                      </CardTitle>
                      <div className="text-xs text-muted-foreground">
                        Source: {linkedIncident ? "AI (incident-triggered)" : draft.aiAssisted ? "AI" : "Manual"}
                        {" · "}Every change requires human review before publish.
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {SECTION_ORDER.map((key) => {
                        const draftSec = draft.sections.find((s) => s.key === key);
                        const currentSec = current.sections.find((s) => s.key === key);
                        const changed = draftSec?.body !== currentSec?.body;
                        if (!changed && !flaggedSections.has(key)) return null;
                        const isEditing = editingSection === key;
                        return (
                          <div key={key} className="rounded-lg border p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-medium text-sm">{SECTION_LABELS[key]}</div>
                              <div className="flex items-center gap-2">
                                {changed && !draftSec?.humanEdited && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20"><Sparkles className="h-3 w-3 mr-1" />AI draft</Badge>}
                                {draftSec?.humanEdited && <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200"><User className="h-3 w-3 mr-1" />Human edited</Badge>}
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="space-y-2">
                                <Textarea value={editingBody} onChange={(e) => setEditingBody(e.target.value)} rows={6} />
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={saveEdit}>Save edit</Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingSection(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {changed ? (
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <div className="space-y-1">
                                      <div className="text-[10px] uppercase tracking-wide text-emerald-800 font-semibold flex items-center gap-1">
                                        <ShieldCheck className="h-3 w-3" /> Current approved plan · v{current.versionNumber}
                                      </div>
                                      <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-2.5 text-sm whitespace-pre-wrap">
                                        {currentSec?.body || <span className="italic text-muted-foreground">Empty</span>}
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="text-[10px] uppercase tracking-wide text-amber-800 font-semibold flex items-center gap-1">
                                        <Edit3 className="h-3 w-3" /> Draft update · v{draft.versionNumber}
                                      </div>
                                      <div className="rounded-md border-2 border-amber-300 bg-amber-50/40 p-2.5 text-sm whitespace-pre-wrap">
                                        {draftSec?.body || <span className="italic text-muted-foreground">Empty</span>}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm leading-relaxed">{draftSec?.body}</p>
                                )}
                                <div className="text-[11px] text-amber-800 mt-2">Published plan unchanged. Approval required before publication.</div>
                                {draft.status !== "ready_for_approval" && canEditPlan && (
                                  <div className="mt-3 flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => startEdit(key)}><Edit3 className="h-3 w-3 mr-1" /> Edit</Button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>


            {/* Evidence — dialog opened from Full Plan header ("View all evidence") */}
            <Dialog open={evidenceOpen} onOpenChange={setEvidenceOpen}>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>All evidence for this care plan</DialogTitle>
                  <DialogDescription>
                    Chain: Incident → Care plan impact check → Draft update → Human approval → Follow-up tasks.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  {(() => {
                    const events: { icon: any; title: string; when?: string; sub?: string; tone: "muted" | "primary" | "warn" | "ok" }[] = [];
                    if (linkedIncident) events.push({ icon: AlertTriangle, title: `Incident recorded — ${linkedIncident.refId}`, when: formatDate(linkedIncident.date), sub: linkedIncident.label, tone: "warn" });
                    if (openSuggestion) events.push({ icon: Sparkles, title: "Care plan impact check created", when: formatDate(openSuggestion.createdAt), sub: openSuggestion.suggestedSections.map((k) => SECTION_LABELS[k]).join(", "), tone: "primary" });
                    if (draft) events.push({ icon: Edit3, title: `Draft update v${draft.versionNumber} created`, when: formatDate(draft.createdAt), sub: `By ${draft.createdBy}`, tone: "primary" });
                    if (draft && draft.status === "ready_for_approval") events.push({ icon: Clock, title: "Awaiting approval", sub: "Approval required before publication", tone: "warn" });
                    if (draft && draft.status === "draft_in_progress") events.push({ icon: Clock, title: "Awaiting mark-ready", sub: "Draft update still in progress", tone: "muted" });
                    const suggestedTasks = personFollowUps.filter((f) => f.status === "suggested");
                    if (suggestedTasks.length > 0) events.push({ icon: ListChecks, title: `${suggestedTasks.length} follow-up task${suggestedTasks.length === 1 ? "" : "s"} suggested`, sub: "Available in Tasks tab", tone: "muted" });
                    if (events.length === 0) return <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">No evidence events yet.</CardContent></Card>;

                    const toneCls: Record<string, string> = {
                      muted: "bg-muted text-muted-foreground",
                      primary: "bg-primary/10 text-primary",
                      warn: "bg-amber-100 text-amber-700",
                      ok: "bg-emerald-100 text-emerald-700",
                    };
                    return (
                      <ol className="relative border-l border-border ml-3 space-y-4">
                        {events.map((ev, idx) => (
                          <li key={idx} className="pl-6 relative">
                            <span className={`absolute -left-3 top-0.5 h-6 w-6 rounded-full flex items-center justify-center ${toneCls[ev.tone]}`}>
                              <ev.icon className="h-3 w-3" />
                            </span>
                            <div className="text-sm font-medium">{ev.title}</div>
                            {ev.sub && <div className="text-xs text-muted-foreground mt-0.5">{ev.sub}</div>}
                            {ev.when && <div className="text-[11px] text-muted-foreground mt-0.5">{ev.when}</div>}
                          </li>
                        ))}
                      </ol>
                    );
                  })()}

                  {personSuggestions.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">Linked evidence sources</div>
                  )}
                  {personSuggestions.map((s) => {
                    const linkedSections = s.suggestedSections.map((k) => SECTION_LABELS[k]).join(", ") || "—";
                    return (
                      <Card key={s.id}>
                        <CardContent className="p-3 space-y-2">
                          {s.sources.map((src) => (
                            <div key={src.id} className="rounded-md border p-2 text-xs space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Badge variant="outline" className="text-[10px] uppercase">{src.kind}</Badge>
                                  <span className="font-medium">{src.refId}</span>
                                  <span className="text-muted-foreground truncate">{src.label}</span>
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                                  {src.severity && <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">{src.severity}</Badge>}
                                  <span>{formatDate(src.date)}</span>
                                </div>
                              </div>
                              <div className="text-muted-foreground grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                                <div>Linked section: <span className="text-foreground">{linkedSections}</span></div>
                                <div>Recorded by: <span className="text-foreground">System</span></div>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    );
                  })}

                </div>
              </DialogContent>
            </Dialog>

            {/* Tasks — with batch actions */}
            <TabsContent value="tasks" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {AI_DISCLAIMER} These tasks are scoped to {person.name.split(" ")[0]}. Manage across the service in Tasks &amp; Follow-up.
                </div>
                <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                  <Link to="/app/tasks/register">Open Tasks &amp; Follow-up →</Link>
                </Button>
              </div>


              {personFollowUps.length === 0 ? (
                <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">No follow-up suggestions.</CardContent></Card>
              ) : (
                <>
                  {!readOnly && (() => {
                    const suggested = personFollowUps.filter((f) => f.status === "suggested");
                    const selectedSuggested = suggested.filter((f) => selectedTaskIds.has(f.id));
                    const allSelected = suggested.length > 0 && selectedSuggested.length === suggested.length;
                    return (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-secondary/30 p-2">
                        <label className="flex items-center gap-2 text-xs px-2 cursor-pointer">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={(v) => {
                              if (v) setSelectedTaskIds(new Set(suggested.map((f) => f.id)));
                              else setSelectedTaskIds(new Set());
                            }}
                          />
                          Select all suggested ({suggested.length})
                        </label>
                        <div className="text-xs text-muted-foreground">{selectedSuggested.length} selected</div>
                        <div className="ml-auto flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={selectedSuggested.length === 0}
                            onClick={() => {
                              selectedSuggested.forEach((f) => carePlansStore.setFollowUpStatus(f.id, "created"));
                              toast({ title: `${selectedSuggested.length} task${selectedSuggested.length === 1 ? "" : "s"} created`, description: "Available in Tasks & Follow-up." });
                              setSelectedTaskIds(new Set());
                            }}
                          >
                            Create selected
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={selectedSuggested.length === 0}
                            onClick={() => {
                              selectedSuggested.forEach((f) => carePlansStore.setFollowUpStatus(f.id, "dismissed"));
                              toast({ title: `${selectedSuggested.length} suggestion${selectedSuggested.length === 1 ? "" : "s"} dismissed` });
                              setSelectedTaskIds(new Set());
                            }}
                          >
                            Dismiss selected
                          </Button>
                          <Button
                            size="sm"
                            disabled={suggested.length === 0}
                            onClick={() => {
                              suggested.forEach((f) => carePlansStore.setFollowUpStatus(f.id, "created"));
                              toast({ title: `${suggested.length} task${suggested.length === 1 ? "" : "s"} created`, description: "Available in Tasks & Follow-up." });
                              setSelectedTaskIds(new Set());
                            }}
                          >
                            Create all suggested
                          </Button>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-2">
                    {personFollowUps.map((f) => {
                      const isSuggested = f.status === "suggested";
                      const checked = selectedTaskIds.has(f.id);
                      return (
                        <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-3 bg-card">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            {!readOnly && isSuggested && (
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => {
                                  setSelectedTaskIds((prev) => {
                                    const next = new Set(prev);
                                    if (v) next.add(f.id); else next.delete(f.id);
                                    return next;
                                  });
                                }}
                                className="mt-0.5"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="text-sm">{f.text}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Source: {draft ? `Care Plan v${draft.versionNumber} draft` : `Care Plan v${current.versionNumber}`}
                                {linkedIncident ? ` · ${linkedIncident.refId}` : ""} · Owner: Nurse in charge · Frequency: Each shift
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="capitalize text-xs">{f.status}</Badge>
                            {!readOnly && isSuggested && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => { carePlansStore.setFollowUpStatus(f.id, "created"); toast({ title: "Task created", description: "Available in Tasks & Follow-up." }); }}>Create task</Button>
                                <Button size="sm" variant="ghost" onClick={() => { carePlansStore.setFollowUpStatus(f.id, "dismissed"); }}>Dismiss</Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </TabsContent>

            {/* Contributors — person-specific summary only */}
            <TabsContent value="contributors" className="space-y-6">
              <div className="rounded-lg border bg-muted/30 p-3 flex items-start justify-between gap-3 flex-wrap">
                <div className="text-xs text-muted-foreground max-w-2xl space-y-0.5">
                  <div>
                    <strong>Specialist contribution only</strong> — not part of the approved care plan until reviewed.
                  </div>
                  <div>
                    <strong>External contributors cannot approve or publish.</strong> Professional registration details are recorded for audit.
                  </div>
                  <div>
                    Summary scoped to {person.name.split(" ")[0]}. Manage all invites, section-level access, and history in Access &amp; Contributors.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canInvite && (
                    <Button size="sm" onClick={() => setInviteOpen(true)}>
                      <UserPlus className="h-3.5 w-3.5 mr-1" /> Invite contributor
                    </Button>
                  )}
                  <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                    <Link to="/app/care-plans/access-contributors">Open Access &amp; Contributors →</Link>
                  </Button>
                </div>
              </div>

              {/* Pending contributions for this person */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-primary" /> Pending contributions
                  </div>
                  {pendingContribs.length > 0 && <Badge variant="outline">{pendingContribs.length} pending</Badge>}
                </div>
                <SpecialistContributionsPanel
                  personId={person.id}
                  reviewer={{ name: role.displayName, role: role.role }}
                  readOnly={readOnly}
                  filterSection={contribFilterSection}
                  onClearFilter={() => setContribFilterSection(null)}
                />
              </div>

              <Separator />

              {/* Active contributors for this person — compact */}
              <div>
                <div className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <UserPlus className="h-4 w-4 text-primary" /> Active contributors ({specialistInvites.filter((i) => i.status === "active" || i.status === "pending").length})
                </div>
                {specialistInvites.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground text-center">
                    No contributors invited for {person.name.split(" ")[0]} yet.
                  </div>
                ) : (
                  <div className="rounded-lg border divide-y">
                    {specialistInvites
                      .filter((i) => i.status === "active" || i.status === "pending")
                      .map((i) => {
                        const statusMap: Record<InviteStatus, string> = {
                          pending: "bg-amber-100 text-amber-800 border-amber-200",
                          active: "bg-emerald-100 text-emerald-800 border-emerald-200",
                          expired: "bg-muted text-muted-foreground border-border",
                          revoked: "bg-destructive/10 text-destructive border-destructive/20",
                        };
                        const levelLabels = i.accessLevel.map((l) => SPEC_LEVELS.find((x) => x.value === l)?.label ?? l);
                        return (
                          <div key={i.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{i.contributorName}</span>
                                <Badge variant="outline" className="text-[10px]">{i.profession}</Badge>
                                <Badge variant="outline" className={`text-[10px] ${statusMap[i.status]}`}>
                                  {i.status}
                                </Badge>
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {i.organisation} · {i.registrationBody}{i.registrationNumber ? ` ${i.registrationNumber}` : ""}
                                {" · "}Access: {levelLabels.join(", ")}
                                {i.expiryDate ? ` · Expires ${formatDate(i.expiryDate)}` : " · No expiry"}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(window.location.origin + i.inviteLink); toast({ title: "Invite link copied" }); }}>
                                <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                              </Button>
                              {canInvite && (
                                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { specialistContributionsStore.revoke(i.id); toast({ title: "Access revoked" }); }}>
                                  <Ban className="h-3.5 w-3.5 mr-1" /> Revoke
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Section access summary */}
              {specialistInvites.filter((i) => i.status === "active").length > 0 && (
                <div>
                  <div className="text-sm font-semibold flex items-center gap-2 mb-2">
                    Section access summary
                  </div>
                  <div className="rounded-lg border p-3 text-xs">
                    {(() => {
                      const activeInv = specialistInvites.filter((i) => i.status === "active");
                      const perSection = SPEC_SECTIONS.map((s) => {
                        const contributors = activeInv
                          .filter((i) => i.sectionAccess.length === 0 || i.sectionAccess.includes(s.key))
                          .map((i) => i.contributorName);
                        return { section: s.label, contributors };
                      }).filter((r) => r.contributors.length > 0);
                      if (perSection.length === 0) {
                        return <span className="text-muted-foreground">No section access granted to specialists.</span>;
                      }
                      return (
                        <div className="grid md:grid-cols-2 gap-2">
                          {perSection.map((r) => (
                            <div key={r.section} className="flex items-start gap-2">
                              <span className="font-medium min-w-[9rem]">{r.section}:</span>
                              <span className="text-muted-foreground">{r.contributors.join(", ")}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </TabsContent>



            {/* Version History & Audit trail — merged into "Drafts, Approvals & History" */}
            <TabsContent value="drafts" className="space-y-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground pt-2">Version History &amp; Audit trail</div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Version History</CardTitle>
                  <div className="text-xs text-muted-foreground">Full lifecycle of the care plan — including approved, archived, rejected and cancelled versions.</div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {versionHistory.map((v) => {
                      const changes = v.sectionChanges ?? [];
                      const edited = changes.filter((c) => c.kind === "edited").length;
                      const added = changes.filter((c) => c.kind === "added").length;
                      const removed = changes.filter((c) => c.kind === "removed").length;
                      const instance = carePlanApprovalChainsStore.getInstanceForVersion(v.id);
                      return (
                        <div key={v.id} className="p-4 space-y-2">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <div className="font-medium">v{v.versionNumber} — {v.id}</div>
                              <div className="text-xs text-muted-foreground">
                                Created {formatDate(v.createdAt)} by {v.createdBy}
                                {v.publishedAt ? ` · Published ${formatDate(v.publishedAt)}` : ""}
                                {v.archivedAt ? ` · Archived ${formatDate(v.archivedAt)}` : ""}
                                {v.approvedBy ? ` · Approved by ${v.approvedBy}` : ""}
                                {v.rejectedAt ? ` · Rejected ${formatDate(v.rejectedAt)}${v.rejectedBy ? ` by ${v.rejectedBy}` : ""}` : ""}
                                {v.sourceType ? ` · Source: ${v.sourceType}` : v.aiAssisted ? " · AI-assisted draft" : ""}
                              </div>
                              {v.consultation && <div className="text-xs text-muted-foreground">Consulted: {consultationSummary(v.consultation, terms.Singular)}</div>}
                              {(v.assistantDecisions?.length ?? 0) > 0 && (
                                <ul className="text-xs text-muted-foreground list-disc pl-4">
                                  {v.assistantDecisions!.map((d) => (
                                    <li key={d.proposalId + d.at}>{d.origin === "ai" ? "AI draft" : "LogUp suggestion"} — {d.decision === "rejected" ? "rejected" : d.decision === "accepted_with_edits" ? "accepted with edits" : "accepted"} by {d.by}, {formatDate(d.at)}: “{d.prompt}”{d.proposedText && d.decision !== "rejected" ? <> · original proposal: “{d.proposedText.slice(0, 120)}{d.proposedText.length > 120 ? "…" : ""}”</> : null}</li>
                                  ))}
                                </ul>
                              )}
                              {v.sections.some((x) => x.aiOrigin) && <div className="text-xs text-muted-foreground">Started as AI draft: {v.sections.filter((x) => x.aiOrigin).map((x) => x.label ?? SECTION_LABELS[x.key as SectionKey] ?? x.key).join(", ")}</div>}
                            </div>
                            <div className="flex items-center gap-2">
                              {statusBadge(v.status)}
                              <Button asChild size="sm" variant="outline">
                                <Link to={`/app/care-plans/people/${person.id}/version/${v.id}`}>Open version</Link>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  carePlanAuditStore.log({
                                    personId: person.id, versionId: v.id, carePlanId: v.id,
                                    actor: role.displayName, actorRole: role.role,
                                    action: "version_exported", fromStatus: v.status, toStatus: v.status,
                                    metadata: { format: "print", versionNumber: v.versionNumber },
                                  });
                                  toast({ title: `v${v.versionNumber} export queued`, description: "Export event recorded in audit trail." });
                                }}
                              >
                                Export
                              </Button>
                            </div>
                          </div>
                          {(v.reasonForChange || edited + added + removed > 0 || instance) && (
                            <div className="text-xs bg-muted/40 border rounded-md p-2 space-y-1">
                              {v.reasonForChange && (
                                <div><span className="text-muted-foreground">Reason for change:</span> {v.reasonForChange}</div>
                              )}
                              {(edited + added + removed) > 0 && (
                                <div className="text-muted-foreground">
                                  Sections edited: {edited} · added: {added} · removed: {removed}
                                </div>
                              )}
                              {instance && (
                                <div className="text-muted-foreground">
                                  Approval chain: <span className="text-foreground">{instance.chainName}</span> · {instance.decisions.length} decision{instance.decisions.length === 1 ? "" : "s"} recorded
                                </div>
                              )}
                              {v.rejectionNote && (
                                <div><span className="text-muted-foreground">Rejection note:</span> {v.rejectionNote}</div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Audit trail — every governed action on this person's care plan */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Audit trail</CardTitle>
                  <div className="text-xs text-muted-foreground">
                    Immutable log of every draft, edit, approval decision, publication and archive event.
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {auditEvents.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">No audit events recorded yet for this {terms.singular}.</div>
                  ) : (
                    <div className="divide-y max-h-[420px] overflow-auto">
                      {[...auditEvents].reverse().map((ev) => (
                        <div key={ev.id} className="p-3 text-xs flex items-start gap-3">
                          <div className="w-40 shrink-0 text-muted-foreground">{formatDate(ev.timestamp)}</div>
                          <div className="flex-1">
                            <div className="font-medium text-foreground">{auditActionLabel(ev.action)}</div>
                            <div className="text-muted-foreground">
                              {ev.actor} ({ev.actorRole}) · version {ev.versionId}
                              {ev.fromStatus && ev.toStatus && ev.fromStatus !== ev.toStatus ? ` · ${ev.fromStatus} → ${ev.toStatus}` : ""}
                            </div>
                            {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                              <div className="text-muted-foreground truncate">
                                {Object.entries(ev.metadata).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>


      <RecordAssessmentDialog open={assessOpen} onOpenChange={setAssessOpen} serviceUserId={person.id as ServiceUserId} staffId={(role.staffId ?? "STAFF-AOIFE") as StaffId} actor={role.displayName} actorRole={role.role} openSuggestions={openSuggestions} />
      <ConsultationDialog open={consultOpen} onOpenChange={setConsultOpen} onConfirm={confirmMarkReady} actor={role.displayName} serviceUserLabel={terms.Singular} />
      <InviteSpecialistDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        personId={person.id}
        personName={person.name}
        site={person.site}
        unit={person.unit}
        invitedBy={role.displayName}
      />

      {/* Add section dialog */}
      <Dialog open={addSectionOpen} onOpenChange={(o) => { setAddSectionOpen(o); if (!o) { setAddTemplateKey(""); resetCustomForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add section to care plan</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-amber-800">Draft update — published plan unchanged. Approval required before publication.</span>
              <br />
              New sections are added to a draft update only. Custom sections apply to this person only — global templates are not modified.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={addSectionMode} onValueChange={(v) => setAddSectionMode(v as "template" | "custom")}>
            <TabsList>
              <TabsTrigger value="template">From template</TabsTrigger>
              <TabsTrigger value="custom">Custom section</TabsTrigger>
            </TabsList>
            <TabsContent value="template" className="space-y-3 pt-3">
              <Label className="text-xs">Template section</Label>
              <Select value={addTemplateKey} onValueChange={setAddTemplateKey}>
                <SelectTrigger><SelectValue placeholder={templateOptions.length ? "Select a template section" : "All template sections already present"} /></SelectTrigger>
                <SelectContent>
                  {templateOptions.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The section will be added empty. Edit its content from the Full Plan tab.</p>
            </TabsContent>
            <TabsContent value="custom" className="space-y-3 pt-3 max-h-[60vh] overflow-y-auto">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Section title *</Label>
                  <Input value={customForm.title} onChange={(e) => setCustomForm({ ...customForm, title: e.target.value })} placeholder="e.g. Night-time routine" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Purpose</Label>
                  <Input value={customForm.purpose} onChange={(e) => setCustomForm({ ...customForm, purpose: e.target.value })} placeholder="Why this section exists for this person" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Content</Label>
                  <Textarea rows={4} value={customForm.body} onChange={(e) => setCustomForm({ ...customForm, body: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Risk level</Label>
                  <Select value={customForm.riskLevel || "none"} onValueChange={(v) => setCustomForm({ ...customForm, riskLevel: v === "none" ? "" : (v as "low" | "medium" | "high") })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not applicable</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Review frequency (months)</Label>
                  <Input type="number" min={1} value={customForm.reviewFrequencyMonths} onChange={(e) => setCustomForm({ ...customForm, reviewFrequencyMonths: e.target.value })} placeholder="e.g. 6" />
                </div>
                <div>
                  <Label className="text-xs">Visibility</Label>
                  <Select value={customForm.visibility} onValueChange={(v) => setCustomForm({ ...customForm, visibility: v as SectionVisibility })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_staff">All care staff</SelectItem>
                      <SelectItem value="managers_only">Managers only</SelectItem>
                      <SelectItem value="restricted">Restricted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Section owner</Label>
                  <Input value={customForm.owner} onChange={(e) => setCustomForm({ ...customForm, owner: e.target.value })} placeholder="e.g. Key worker" />
                </div>
                <div className="sm:col-span-2 flex items-center gap-2">
                  <input id="evReq" type="checkbox" className="h-4 w-4" checked={customForm.evidenceRequired} onChange={(e) => setCustomForm({ ...customForm, evidenceRequired: e.target.checked })} />
                  <Label htmlFor="evReq" className="text-xs">Evidence required for this section</Label>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Linked tasks (optional note)</Label>
                  <Input value={customForm.linkedTaskNote} onChange={(e) => setCustomForm({ ...customForm, linkedTaskNote: e.target.value })} placeholder="e.g. Nightly checks by staff on duty" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Reason for adding this section</Label>
                  <Textarea rows={2} value={customForm.reason} onChange={(e) => setCustomForm({ ...customForm, reason: e.target.value })} placeholder="Clinical rationale / trigger" />
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSectionOpen(false)}>Cancel</Button>
            {addSectionMode === "template"
              ? <Button onClick={handleAddTemplateSection} disabled={!addTemplateKey}>Add to draft</Button>
              : <Button onClick={handleAddCustomSection} disabled={!customForm.title.trim()}>Add to draft</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section history dialog */}
      <Dialog open={!!historyKey} onOpenChange={(o) => !o && setHistoryKey(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Section history</DialogTitle>
            <DialogDescription>
              {historyKey ? sectionLabel({ key: historyKey, label: current.sections.find((s) => s.key === historyKey)?.label ?? draft?.sections.find((s) => s.key === historyKey)?.label }) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {plan.versions
              .slice()
              .sort((a, b) => b.versionNumber - a.versionNumber)
              .map((v) => {
                const sec = v.sections.find((s) => s.key === historyKey);
                if (!sec) return null;
                return (
                  <div key={v.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>v{v.versionNumber} · {statusLabel(v.status)}</span>
                      <span>{formatDate(v.publishedAt ?? v.createdAt)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{sec.body || <span className="italic text-muted-foreground">Empty</span>}</p>
                  </div>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ---------- Approval Chain Panel ----------

function ApprovalChainPanel({
  person, draft, reviewNote, setReviewNote,
  onMarkReady, onReject, onApprovePublish,
  canApprove, readOnly, roleName, userName, userStaffId,
}: {
  person: PersonSupported;
  draft: CarePlanVersion;
  reviewNote: string;
  setReviewNote: (v: string) => void;
  onMarkReady: () => void;
  onReject: () => void;
  onApprovePublish: () => void;
  canApprove: boolean;
  readOnly: boolean;
  roleName: string;
  userName: string;
  userStaffId?: string;
}) {
  const { chains, instances } = useCarePlanApprovalChains();
  const instance = instances.find((i) => i.carePlanId === draft.id);
  const matched = findChainForPerson(chains, { site: person.site, unit: person.unit });
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [actorEmail, setActorEmail] = useState("");

  // No chain configured for scope
  if (!matched && !instance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Approval chain
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No approval chain configured for this scope</AlertTitle>
            <AlertDescription>
              Admin must configure an approval chain for {person.site}{person.unit ? ` · ${person.unit}` : ""} before
              care plan changes can be published.
            </AlertDescription>
          </Alert>
          {roleName === "admin" && (
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/app/admin/care-plan-approval-chains">Configure approval chains</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Ready-for-approval but instance not yet started (shouldn't normally happen — auto-start on markReady). Offer to start.
  if (!instance && matched) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Approval chain
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>Chain <span className="font-medium">{matched.name}</span> will be used ({matched.scopeLabel}).</div>
          {draft.status === "draft_in_progress" && !readOnly && (
            <>
              <Textarea aria-label="Reason for change" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2} placeholder="Reason for change (required)" />
              <Button size="sm" onClick={onMarkReady}>Mark ready for approval</Button>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!instance) return null;

  const level = currentChainLevel(instance);
  const pending = pendingApproversAtLevel(instance);
  const isApproved = instance.status === "approved";
  const isRejected = instance.status === "rejected";
  const totalLevels = instance.chainSnapshot.levels.length;

  const userMatches = level && userStaffId ? level.approvers.find((a) => a.staffId === userStaffId) : undefined;

  const mayDecide = !!(level && canApprove && (
    canDecideAtCurrentLevel(instance, userStaffId) || roleName === "admin"
  ));

  const handleApproveClick = (approver?: { name: string; email: string }) => {
    if (!level) return;
    const a = approver ?? userMatches ?? (roleName === "admin" ? { name: userName, email: actorEmail || `${userName.toLowerCase().replace(/\s+/g,".")}@admin.example` } : null);
    if (!a) { toast({ title: "Enter your email to approve", variant: "destructive" as never }); return; }
    const updated = carePlanApprovalChainsStore.approve(instance.id, a, reviewNote || undefined);
    carePlanAuditStore.log({
      personId: person.id, versionId: draft.id, carePlanId: draft.id,
      actor: a.name, actorRole: roleName,
      action: "approval_decision", fromStatus: draft.status, toStatus: draft.status,
      metadata: {
        decision: "approved", levelNumber: level.levelNumber, rule: level.rule,
        approverEmail: a.email, note: reviewNote || undefined,
        approvalInstanceId: instance.id,
      },
    });
    if (updated?.status === "approved") {
      onApprovePublish();
    } else {
      toast({ title: `Approval recorded — moving to Level ${updated?.currentLevelNumber ?? "?"}` });
      setReviewNote("");
    }
  };

  const handleRejectClick = () => {
    if (!reviewNote.trim()) { toast({ title: "Rejection note required", description: "Explain what needs to change." }); return; }
    if (!userMatches && roleName !== "admin") { toast({ title: "You are not listed as an approver at this level" }); return; }
    const a = userMatches ?? { name: userName, email: actorEmail || `${userName.toLowerCase().replace(/\s+/g,".")}@admin.example` };
    carePlanApprovalChainsStore.reject(instance.id, a, reviewNote.trim());
    carePlanAuditStore.log({
      personId: person.id, versionId: draft.id, carePlanId: draft.id,
      actor: a.name, actorRole: roleName,
      action: "approval_decision", fromStatus: draft.status, toStatus: "rejected",
      metadata: {
        decision: "rejected", levelNumber: level?.levelNumber, rule: level?.rule,
        approverEmail: a.email, note: reviewNote.trim(),
        approvalInstanceId: instance.id,
      },
    });
    onReject();
  };

  const handleOverride = () => {
    if (!overrideReason.trim()) { toast({ title: "A reason is required for Admin override" }); return; }
    carePlanApprovalChainsStore.adminOverride(
      instance.id,
      { name: userName, email: actorEmail || `${userName.toLowerCase().replace(/\s+/g,".")}@admin.example` },
      overrideReason.trim(),
    );
    setOverrideOpen(false);
    setOverrideReason("");
    onApprovePublish();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Approval chain
          </CardTitle>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
            {instanceStatusLabel(instance.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Human approval required.</span> AI drafts do not publish care plans.
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Approval chain</div>
            <div className="font-medium">{instance.chainName}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Scope</div>
            <div className="font-medium">{instance.chainSnapshot.scopeLabel}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Draft version</div>
            <div className="font-medium">v{instance.carePlanVersion}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Current level</div>
            <div className="font-medium">
              {level ? `Level ${level.levelNumber} of ${totalLevels} — ${level.levelName}` : "—"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Days waiting</div>
            <div className="font-medium">
              {(() => {
                const start = new Date(instance.startedAt).getTime();
                const days = Math.max(0, Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24)));
                return `${days} day${days === 1 ? "" : "s"}`;
              })()}
            </div>
          </div>
        </div>

        {level && !isApproved && !isRejected && (
          <>
            <Separator />
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Approval rule</div>
              <div className="text-sm">{ruleLabel(level.rule)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {level.rule === "any_one"
                  ? "One approval is required at this level."
                  : `All ${level.approvers.length} approvers must approve at this level.`}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Pending approvers</div>
              <div className="space-y-1.5">
                {pending.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{a.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {a.roleLabel ? `${a.roleLabel} · ` : ""}{a.email}
                      </div>
                    </div>
                    {!readOnly && canApprove && (roleName === "admin" || (!!userStaffId && a.staffId === userStaffId)) && (
                      <Button size="sm" variant="outline" onClick={() => handleApproveClick(a)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve as {a.name.split(" ")[0]} <span className="ml-1 text-[10px] opacity-70">(demo)</span>
                      </Button>
                    )}
                  </div>
                ))}
                {pending.length === 0 && (
                  <div className="text-xs text-muted-foreground">All approvals for this level collected — advancing.</div>
                )}
              </div>
            </div>

            {(roleName === "admin" || roleName === "manager") && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Your email (optional — matches your approver record)</div>
                  <input
                    type="email"
                    value={actorEmail}
                    onChange={(e) => setActorEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Approval note (optional)</div>
                  <Textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={2} placeholder="Add an approval note…" />
                </div>
              </div>
            )}
          </>
        )}

        {isApproved && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>All approval levels complete</AlertTitle>
            <AlertDescription>
              Care Plan v{instance.carePlanVersion} is approved and ready to publish. Previous version will be preserved in history.
            </AlertDescription>
          </Alert>
        )}
        {isRejected && (() => {
          const rej = [...instance.decisions].reverse().find((d) => d.decision === "rejected");
          return (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Draft rejected — approval required before publication</AlertTitle>
              <AlertDescription className="space-y-1">
                <div>
                  Rejected by <span className="font-medium">{rej?.approverName ?? "approver"}</span>
                  {rej ? ` on ${formatDate(rej.decidedAt)}` : ""}.
                </div>
                {rej?.note && (
                  <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2 mt-1">
                    <div className="text-[10px] uppercase tracking-wide font-semibold">Rejection note</div>
                    <div className="italic">"{rej.note}"</div>
                  </div>
                )}
                <div className="pt-1">
                  The current approved plan remains live. A permitted user can revise this draft and resubmit for approval.
                </div>
              </AlertDescription>
            </Alert>
          );
        })()}

        {/* Actions */}
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {draft.status === "draft_in_progress" && (
              <Button variant="outline" onClick={onMarkReady}>Mark ready for approval</Button>
            )}
            {!isApproved && !isRejected && (
              <>
                <Button onClick={() => handleApproveClick()} disabled={!mayDecide}>
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Approve at this level
                </Button>
                <Button variant="outline" onClick={handleRejectClick} disabled={!mayDecide} className="text-destructive hover:text-destructive">
                  <XCircle className="h-4 w-4 mr-1" /> Reject draft
                </Button>
              </>
            )}
            {isApproved && (
              <Button onClick={onApprovePublish}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Publish Care Plan v{instance.carePlanVersion}
              </Button>
            )}
            {roleName === "admin" && !isApproved && !isRejected && (
              <Button variant="ghost" onClick={() => setOverrideOpen(true)} className="text-amber-800">
                Admin override…
              </Button>
            )}
          </div>
        )}
        {!canApprove && !readOnly && (
          <div className="text-xs text-muted-foreground">Only listed approvers or Admins can decide at this level.</div>
        )}
        {readOnly && (
          <div className="text-xs text-muted-foreground italic">Frontline staff cannot approve or publish care plans.</div>
        )}

        {/* History */}
        <Separator />
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Approval history</div>
          {instance.decisions.length === 0 ? (
            <div className="text-xs text-muted-foreground">No approval decisions yet.</div>
          ) : (
            <div className="space-y-1.5">
              {instance.decisions.map((d) => (
                <div key={d.id} className="text-xs flex items-start gap-2 border-l-2 pl-2" style={{ borderColor: d.decision === "rejected" ? "hsl(var(--destructive))" : d.decision === "override" ? "#d97706" : "hsl(var(--primary))" }}>
                  <div className="flex-1">
                    <div>
                      <span className="font-medium">{d.approverName}</span>
                      <span className="text-muted-foreground"> ({d.approverEmail})</span>
                      {" — "}
                      {d.decision === "override" ? (
                        <span className="text-amber-800 font-medium">Admin override</span>
                      ) : d.decision === "approved" ? (
                        <span className="text-emerald-700 font-medium">Approved</span>
                      ) : (
                        <span className="text-destructive font-medium">Rejected</span>
                      )}
                      {" · Level "}{d.levelNumber}{" · v"}{instance.carePlanVersion}
                    </div>
                    {d.note && <div className="text-muted-foreground italic mt-0.5">"{d.note}"</div>}
                    <div className="text-muted-foreground">{formatDate(d.decidedAt)} · Chain: {instance.chainName}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      {/* Admin override dialog */}
      {overrideOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setOverrideOpen(false)}>
          <div className="bg-background rounded-lg border shadow-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold">Admin override</div>
            <div className="text-sm text-muted-foreground">
              This will bypass remaining approval levels and mark the chain as approved. A reason is required and will be
              logged in approval history.
            </div>
            <Textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              rows={3}
              placeholder="Why is override required? (mandatory)"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
              <Button onClick={handleOverride} disabled={!overrideReason.trim()}>Confirm override</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

