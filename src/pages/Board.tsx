import { SCENARIO_EVENTS, toBoardCard } from "@/lib/demoScenario";
import { STAFF as REGISTRY_STAFF, STAFF_BY_ID } from "@/lib/demoDataRegistry";
import { useState, useMemo, useEffect, useSyncExternalStore } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { insightSignalsStore, linkedServiceUserIdFor } from "@/lib/insightSignals";
import { serviceUsersStore } from "@/lib/serviceUsersStore";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { isSiteLevelEvent } from "@/lib/eventVisibility";
import { useSearchParams } from "react-router-dom";
import { OverdueReviewSuggestionsAlert } from "@/components/care-plans/OverdueReviewSuggestionsAlert";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, Clock, CheckCircle2, ListTodo, Building2, Calendar,
  User as UserIcon, Flag, ArrowRight, MessageSquare, X, Plus, AtSign,
  CheckCircle, Circle, PlayCircle, History, Send, Mic, FileText, Quote, AlertCircle,
  Stethoscope, Bell, MinusCircle,
  Filter, Search, CalendarIcon, Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { notificationsStore } from "@/lib/notifications";
import { incidentsStore } from "@/lib/incidentsStore";
import { serviceUserName } from "@/lib/serviceUsersStore";
import { createTask as createTaskRecord } from "@/lib/tasksStore";
import { LANGUAGE_LABELS } from "@/lib/translation";
import { buildManagerSummary, polish } from "@/lib/incidentDrafting";
import { useRole } from "@/hooks/useRole";
import { inScope, roleStore } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";
import { RiskBadge, LifecyclePill } from "@/components/incidents/RiskBadge";
import { deriveLifecycleFromColumn, canCloseIncident, type ClosureRecord } from "@/lib/incidentGovernance";
import { Lock, ShieldCheck, Paperclip, Gavel, FileSearch } from "lucide-react";
import { EvidenceTray } from "@/components/incidents/EvidenceTray";
import type { EvidenceItem } from "@/lib/evidence";
import { IncidentDetailDrawer } from "@/components/incidents/IncidentDetailDrawer";
import { getIncidentById, assertIncidentCardMatchesModal } from "@/lib/incidentRecords";
import { EVENT_TYPES } from "@/lib/eventTypes";
import {
  VISIBILITY_OPTIONS, VISIBILITY_LABEL, isRestricted, canManageVisibility,
  getDefaultVisibility, type VisibilityMode,
} from "@/lib/eventVisibility";
import {
  aiDraftProportionate, aiDraftLearning, detectInsights,
  REVIEW_LEVELS, SEVERITY_OPTIONS as LEARN_SEV_OPTS, ESCALATION_LABELS, LINKED_KIND_LABELS,
  type LinkedRefKind, type ReviewLevel, type EscalationFlag,
} from "@/lib/learningStore";
import { Eye, EyeOff, ShieldAlert, Lightbulb, Link2, GraduationCap, TrendingUp, Trash2 } from "lucide-react";



const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

type Severity = "Low" | "Moderate" | "High" | "Critical" | "Severe" | "Death";
type ColumnId = "new" | "review" | "actions" | "complete";

type NotificationKey = "family" | "gp" | "gardai" | "hiqa" | "mhc" | "hsa";
interface NotificationStatus { notified: boolean; ts?: string; by?: string; notApplicable?: boolean; }
type NotificationsRecord = Record<NotificationKey, NotificationStatus>;
interface NotifiableAssessment {
  flagged: boolean;
  framework?: "HIQA NIMS" | "MHC" | "Patient Safety Act 2023" | "Multiple";
  rationale?: string;
}
interface OpenDisclosureRec { required: "Yes" | "No" | "Not yet decided"; discussedOn?: string; discussedWith?: string; }
interface InjuryRec { sustained: boolean; type?: string; bodyArea?: string; note?: string; }

const NOTIF_LABELS: Record<NotificationKey, string> = {
  family: "Family / NOK",
  gp: "GP",
  gardai: "Gardaí",
  hiqa: "HIQA",
  mhc: "Mental Health Commission",
  hsa: "HSA",
};
type ActionStatus = "Open" | "In progress" | "Complete" | "Overdue";
type ActionPriority = "Low" | "Medium" | "High" | "Urgent";

interface ActionItem {
  id: string;
  title: string;
  assignee: string;
  due: string;
  status: ActionStatus;
  priority?: ActionPriority;
  linkedEvidence?: string;
  instruction?: string;
  createdBy: string;
  createdAt: string;
  completedBy?: string;
  completedAt?: string;
  completionNote?: string;
}

interface GovernanceComment {
  id: string;
  author: string;
  text: string;
  ts: string;
}

interface TimelineEntry {
  id: string;
  ts: string;
  who: string;
  what: string;
}

interface ClarificationExchange {
  id: string;
  question: string;
  answer: string;
  ts: string;
}

interface DraftSection {
  label: string;
  body: string;
}

interface IncidentSubmission {
  capturedBy: string;
  capturedAt: string;
  source: "text" | "voice";
  rawNote: string;
  // Multilingual capture
  sourceLanguage?: "en" | "pl" | "ro" | "es" | "pt" | "fr" | "lt" | "lv" | "other";
  languageAutoDetected?: boolean;
  originalText?: string;
  translatedText?: string;
  voiceDurationSec?: number;
  draftSections: DraftSection[];
  clarifications: ClarificationExchange[];
  outstandingFlags: string[];
  // Regulatory-grade context
  incidentType?: string;
  dateOfIncident?: string;
  timeOfIncident?: string;
  residentDemographics?: { age?: number; gender?: string; room?: string };
  staffInvolved?: string[];
  witnesses?: string[];
  otherWitnesses?: string;
  injury?: InjuryRec;
  medicationTreatment?: string;
  immediateActions?: string;
  notifications?: NotificationsRecord;
  notifiable?: NotifiableAssessment;
  openDisclosure?: OpenDisclosureRec;
  contributoryFactors?: string;
  reviewNotes?: string;
  prevention?: string;
}

interface Card {
  id: string;
  resident: string;
  noServiceUserInvolved?: boolean;
  serviceUserId?: import("@/lib/demoDataRegistry").ServiceUserId;
  category: string;
  /** User-facing Event Type (defaults to "Incident / Accident" for legacy data). */
  eventType?: import("@/lib/eventTypes").EventType;
  severity: Severity;
  initialSeverity: "Low" | "Moderate" | "High" | "Critical" | "Unsure";
  reviewedSeverity?: "Low" | "Moderate" | "High" | "Critical";
  severityReviewComment?: string;
  severityReviewedBy?: string;
  severityReviewedAt?: string;
  // Governance (additive — optional)
  impact?: import("@/lib/incidentGovernance").RiskImpact;
  likelihood?: import("@/lib/incidentGovernance").RiskLikelihood;
  lifecycleStatus?: import("@/lib/incidentGovernance").LifecycleStatus;
  secondaryCategory?: import("@/lib/incidentGovernance").PrimaryCategory;
  investigation?: import("@/lib/incidentGovernance").InvestigationRecord;
  closure?: import("@/lib/incidentGovernance").ClosureRecord;
  linkedEvidence?: import("@/lib/incidentGovernance").EvidenceLink[];
  regulatoryNotification?: import("@/lib/incidentGovernance").RegulatoryNotificationRecord;
  /** Uploaded evidence (photos, documents, audio, video). */
  evidence?: EvidenceItem[];

  site: string;
  location: string;
  dateTime: string;
  owner?: string;
  overdue?: boolean;
  column: ColumnId;
  summary: string;
  actions: ActionItem[];
  governanceComments?: GovernanceComment[];
  timeline: TimelineEntry[];
  submission?: IncidentSubmission;
  // Visibility / compliance
  visibility?: import("@/lib/eventVisibility").VisibilityMode;
  visibilityHistory?: import("@/lib/eventVisibility").VisibilityChange[];
  // Learning, Action & Prevention
  proportionate?: import("@/lib/learningStore").ProportionateResponse;
  linkedRefs?: import("@/lib/learningStore").LinkedRef[];
  learning?: import("@/lib/learningStore").LearningSummary;
}


const STAFF = REGISTRY_STAFF.filter((s) => !s.external && !s.readOnly).map((s) => ({ name: s.name, role: s.roleLabel }));

const staffSlug = (name: string) => "u-" + name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

const CURRENT_USER = STAFF_BY_ID[roleStore.get().staffId as keyof typeof STAFF_BY_ID]?.name ?? "Daniel Walsh"; // signed-in person

/**
 * Guarantee that the fields shown on a Board card match the corresponding
 * IncidentRecord that the shared modal will open. The card retains its
 * board-specific operational state (column, actions, timeline, submission,
 * etc.) — only the user-visible identity fields are normalised.
 *
 * This exists because the Board historically kept its own copy of a handful
 * of demo cards. It is NOT a place to invent new incident data.
 */
function reconcileCardWithRecord(card: Card): Card {
  const rec = getIncidentById(card.id);
  if (!rec) return card;
  const sev = (rec.severity as Card["severity"]) || card.severity;
  return {
    ...card,
    resident: rec.resident,
    serviceUserId: rec.serviceUserId,
    site: rec.site,
    location: rec.location,
    category: rec.category,
    severity: sev,
    owner: card.owner ?? (rec.reviewedBy && rec.reviewedBy !== "Pending" ? rec.reviewedBy : undefined),
  };
}


const initial: Card[] = SCENARIO_EVENTS.map((e) => toBoardCard(e) as unknown as Card);

/** Tag that wraps with its row and truncates (with tooltip) if one label is too long. */
function CardTag({ label, className }: { label: string; className: string }) {
  return (
    <Badge variant="outline" title={label} className={`text-[10px] max-w-full min-w-0 ${className}`}>
      <span className="truncate">{label}</span>
    </Badge>
  );
}

/** Resident line: preferred name (full name in tooltip), or a clear no-resident state. */
function CardResident({ card }: { card: Card }) {
  const id = card.serviceUserId ?? linkedServiceUserIdFor(card.id);
  const u = id ? serviceUsersStore.getById(id) : undefined;
  if (u) {
    const shown = u.preferredName ? `${u.preferredName} ${u.legalLastName ?? u.name.split(" ").slice(-1)[0]}` : u.name;
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="text-sm font-medium text-foreground leading-snug truncate">{shown}</p>
          </TooltipTrigger>
          <TooltipContent>{u.name}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  if (isSiteLevelEvent(card)) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
        <Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Site event · no resident involved</span>
      </p>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30 font-semibold max-w-full">
      <span className="truncate">Resident not linked</span>
    </Badge>
  );
}

const columns: { id: ColumnId; title: string; icon: typeof AlertTriangle; tone: string }[] = [
  { id: "new", title: "New Events", icon: AlertTriangle, tone: "text-primary" },
  { id: "review", title: "Under Review", icon: Clock, tone: "text-accent" },
  { id: "actions", title: "Actions Required", icon: ListTodo, tone: "text-warning" },
  { id: "complete", title: "Complete", icon: CheckCircle2, tone: "text-success" },
];

const severityChip = (s: Severity) => {
  const map: Record<Severity, string> = {
    Low: "bg-success/10 text-success border-success/20",
    Moderate: "bg-warning/10 text-warning border-warning/20",
    High: "bg-destructive/10 text-destructive border-destructive/20",
    Critical: "bg-destructive/15 text-destructive border-destructive/30",
    Severe: "bg-destructive/10 text-destructive border-destructive/20",
    Death: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return <Badge variant="outline" className={`text-[10px] font-semibold ${map[s]}`}>{s}</Badge>;
};

const initialSeverityChip = (s: "Low" | "Moderate" | "High" | "Critical" | "Unsure") => {
  const map: Record<string, string> = {
    Low: "bg-success/10 text-success border-success/20",
    Moderate: "bg-warning/10 text-warning border-warning/20",
    High: "bg-destructive/10 text-destructive border-destructive/20",
    Critical: "bg-destructive/15 text-destructive border-destructive/30",
    Unsure: "bg-muted/40 text-muted-foreground border-muted/50",
  };
  return <Badge variant="outline" className={`text-[10px] font-semibold ${map[s]}`}>{s}</Badge>;
};

const notifiableChip = () => (
  <Badge variant="outline" className="text-[10px] font-semibold bg-destructive/10 text-destructive border-destructive/20 inline-flex items-center gap-1">
    <Flag className="h-2.5 w-2.5" /> Notifiable
  </Badge>
);


const statusChip = (s: ActionStatus) => {
  const map: Record<ActionStatus, { cls: string; Icon: typeof Circle }> = {
    "Open": { cls: "bg-secondary text-foreground border-border", Icon: Circle },
    "In progress": { cls: "bg-accent/10 text-accent border-accent/20", Icon: PlayCircle },
    "Complete": { cls: "bg-success/10 text-success border-success/20", Icon: CheckCircle },
    "Overdue": { cls: "bg-destructive/10 text-destructive border-destructive/20", Icon: AlertTriangle },
  };
  const { cls, Icon } = map[s];
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold inline-flex items-center gap-1 ${cls}`}>
      <Icon className="h-2.5 w-2.5" /> {s}
    </Badge>
  );
};

const nextColumn: Record<ColumnId, ColumnId | null> = {
  new: "review",
  review: "actions",
  actions: "complete",
  complete: null,
};

const nowStamp = () => {
  const d = new Date();
  const day = d.getDate();
  const month = d.toLocaleString("en-IE", { month: "short" });
  const time = d.toTimeString().slice(0, 5);
  return `${day} ${month} · ${time}`;
};

const LINKED_KIND_OPTIONS: LinkedRefKind[] = [
  "task", "audit", "policy", "workforce", "complaint", "concern", "related-event", "attachment", "pack", "coverage",
];

const LinkedRefAdder = ({ onAdd }: { onAdd: (r: { kind: LinkedRefKind; label: string; detail?: string }) => void }) => {
  const [kind, setKind] = useState<LinkedRefKind>("task");
  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");
  return (
    <div className="grid sm:grid-cols-[140px_1fr_1fr_auto] gap-2">
      <Select value={kind} onValueChange={(v) => setKind(v as LinkedRefKind)}>
        <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {LINKED_KIND_OPTIONS.map(k => (
            <SelectItem key={k} value={k} className="text-xs">{LINKED_KIND_LABELS[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input className="h-9 rounded-lg text-xs" placeholder="Label (e.g. TASK-204, Medication audit Q1)" value={label} onChange={(e) => setLabel(e.target.value)} />
      <Input className="h-9 rounded-lg text-xs" placeholder="Detail (optional)" value={detail} onChange={(e) => setDetail(e.target.value)} />
      <Button size="sm" variant="outline" className="h-9 rounded-lg text-xs" disabled={!label.trim()} onClick={() => {
        onAdd({ kind, label: label.trim(), detail: detail.trim() || undefined });
        setLabel(""); setDetail("");
      }}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Link
      </Button>
    </div>
  );
};

const Board = () => {
  const [cards, setCards] = useState<Card[]>(() => initial.map(reconcileCardWithRecord));
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [completeAction, setCompleteAction] = useState<ActionItem | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [form, setForm] = useState<{ title: string; assignee: string; due: string; instruction: string; priority: ActionPriority; linkedEvidence: string }>({ title: "", assignee: "", due: "", instruction: "", priority: "Medium", linkedEvidence: "" });
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [followupTab, setFollowupTab] = useState<"comments" | "actions">("comments");
  const [commentDraft, setCommentDraft] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColumnId | null>(null);

  // Close-incident dialog state
  const todayISO = new Date().toISOString().slice(0, 10);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeForm, setCloseForm] = useState<{ summary: string; lessons: string; closedBy: string; closedDate: string; override: boolean; rationale: string; }>({
    summary: "", lessons: "", closedBy: CURRENT_USER, closedDate: todayISO, override: false, rationale: "",
  });

  // Filter bar state
  const [filterSite, setFilterSite] = useState("all");
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterEventType, setFilterEventType] = useState("all");
  const [filterReviewer, setFilterReviewer] = useState("all");
  const [filterFlag, setFilterFlag] = useState<"all" | "restricted" | "ai-draft" | "translated" | "overdue" | "closure-approval">("all");
  const [residentSearch, setResidentSearch] = useState("");
  const isMobile = useIsMobile();
  const [mobileCol, setMobileCol] = useState<ColumnId>("new");
  useSyncExternalStore(insightSignalsStore.subscribe, insightSignalsStore.resolutions, insightSignalsStore.resolutions);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  // Severity review draft (per-open drawer)
  const [sevDraft, setSevDraft] = useState<{ severity: "" | "Low" | "Moderate" | "High" | "Critical"; comment: string }>({ severity: "", comment: "" });
  useEffect(() => {
    if (!openId) return;
    const c = cards.find(x => x.id === openId);
    if (!c) return;
    const current = c.reviewedSeverity
      ?? (c.initialSeverity === "Unsure" ? "" : c.initialSeverity);
    setSevDraft({ severity: (current as any) || "", comment: c.severityReviewComment || "" });
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge in any incidents submitted from the Incidents capture flow
  useEffect(() => {
    const unsub = incidentsStore.subscribe((pending) => {
      if (pending.length === 0) return;
      setCards((prev) => {
        const ids = new Set(prev.map((c) => c.id));
        const fresh = pending.filter((p) => !ids.has(p.id)) as Card[];
        return fresh.length ? [...fresh, ...prev] : prev;
      });
    });
    return () => { unsub; };
  }, []);

  // Deep link from Insights: ?eventId=INC-…
  const [boardParams] = useSearchParams();
  useEffect(() => {
    const id = boardParams.get("eventId");
    if (id && cards.some(c => c.id === id)) setOpenId(id);
  }, [boardParams, cards]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = openId ? cards.find(c => c.id === openId) : null;

  const move = (id: string, to: ColumnId) => {
    setCards(prev => prev.map(c => c.id === id
      ? {
          ...c, column: to,
          overdue: to === "complete" ? false : c.overdue,
          timeline: [...c.timeline, { id: `t${Date.now()}`, ts: nowStamp(), who: CURRENT_USER, what: `Moved to ${columns.find(x => x.id === to)?.title}` }],
        }
      : c));
    toast("Event moved", { description: `${id} moved to ${columns.find(c => c.id === to)?.title}.` });
  };

  const role = useRole();
  // Derived option lists from current cards
  const siteOptions = useMemo(() => Array.from(new Set(cards.filter(c => inScope(c.site, role.role, role.scope)).map(c => c.site))).sort(), [cards, role.role, role.scope]);
  const locationOptions = useMemo(() => Array.from(new Set(cards.map(c => c.location))).sort(), [cards]);
  const categoryOptions = useMemo(() => Array.from(new Set(cards.map(c => c.category))).sort(), [cards]);
  const severityOptions: Severity[] = ["Low", "Moderate", "High", "Critical", "Severe", "Death"];
  const reviewerOptions = useMemo(
    () => Array.from(new Set(cards.map(c => c.owner).filter(Boolean) as string[])).sort(),
    [cards],
  );

  // Parse "11 Apr · 13:15" → Date in 2026 (matches dataset year)
  const parseCardDate = (dt: string): Date | null => {
    const m = dt.match(/^(\d{1,2})\s+([A-Za-z]{3})/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const monIdx = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(m[2]);
    if (monIdx < 0) return null;
    return new Date(2026, monIdx, day);
  };

  const filteredCards = useMemo(() => {
    const sevOrder: Record<string, number> = { Death: 0, Severe: 1, Critical: 2, High: 3, Moderate: 4, Low: 5 };
    return cards
      .filter((c) => inScope(c.site, role.role, role.scope))
      // Compliance: hide restricted Events from frontline / view-only users.
      // Managers/Admins still see them (subject to site scope above).
      .filter((c) => {
        if (role.role === "admin" || role.role === "manager") return true;
        return !isRestricted(c.visibility);
      })
      .filter((c) => {
        if (filterSite !== "all" && c.site !== filterSite) return false;
        if (filterLocation !== "all" && c.location !== filterLocation) return false;
        if (filterSeverity !== "all" && c.severity !== filterSeverity) return false;
        if (filterCategory !== "all" && c.category !== filterCategory) return false;
        if (filterEventType !== "all" && (c.eventType || "Incident / Accident") !== filterEventType) return false;
        if (filterReviewer !== "all") {
          if (filterReviewer === "__unassigned__" ? !!c.owner : c.owner !== filterReviewer) return false;
        }
        if (filterFlag !== "all") {
          const restricted = isRestricted(c.visibility || getDefaultVisibility(c.eventType));
          const aiDraft = c.column === "new" && !!c.submission;
          const translated = !!c.submission?.translatedText && c.submission?.sourceLanguage && c.submission.sourceLanguage !== "en";
          const overdue = !!c.overdue || c.actions.some(a => a.status === "Overdue");
          const closureApproval = c.lifecycleStatus === "Investigation In Progress" || c.lifecycleStatus === "Investigation Required";
          if (filterFlag === "restricted" && !restricted) return false;
          if (filterFlag === "ai-draft" && !aiDraft) return false;
          if (filterFlag === "translated" && !translated) return false;
          if (filterFlag === "overdue" && !overdue) return false;
          if (filterFlag === "closure-approval" && !closureApproval) return false;
        }
        if (residentSearch && !serviceUserName(c.serviceUserId ?? linkedServiceUserIdFor(c.id)).toLowerCase().includes(residentSearch.toLowerCase())) return false;
        const d = parseCardDate(c.dateTime);
        if (filterDateFrom && d && d < new Date(filterDateFrom)) return false;
        if (filterDateTo && d && d > new Date(filterDateTo + "T23:59:59")) return false;
        return true;
      })
      .sort((a, b) => {
        const da = parseCardDate(a.dateTime)?.getTime() ?? 0;
        const db = parseCardDate(b.dateTime)?.getTime() ?? 0;
        if (sortBy === "newest") return db - da;
        if (sortBy === "oldest") return da - db;
        if (sortBy === "severity") return (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9);
        return 0;
      });
  }, [cards, filterSite, filterLocation, filterSeverity, filterCategory, filterEventType, filterReviewer, filterFlag, residentSearch, filterDateFrom, filterDateTo, sortBy, role.role, role.scope]);

  const grouped = useMemo(() => {
    const g: Record<ColumnId, Card[]> = { new: [], review: [], actions: [], complete: [] };
    filteredCards.forEach(c => g[c.column].push(c));
    return g;
  }, [filteredCards]);

  const clearAllFilters = () => {
    setFilterSite("all"); setFilterLocation("all"); setFilterSeverity("all");
    setFilterCategory("all"); setResidentSearch(""); setFilterDateFrom(""); setFilterDateTo("");
    setSortBy("newest");
  };

  const submitCreate = () => {
    if (!open || !form.title.trim() || !form.assignee) return;
    const ts = nowStamp();
    const newAction: ActionItem = {
      id: `a${Date.now()}`,
      title: form.title.trim(),
      assignee: form.assignee,
      due: form.due || "—",
      status: "Open",
      priority: form.priority,
      linkedEvidence: form.linkedEvidence.trim() || undefined,
      instruction: form.instruction.trim() || undefined,
      createdBy: CURRENT_USER,
      createdAt: ts,
    };
    const entries: TimelineEntry[] = [
      { id: `t${Date.now()}`, ts, who: CURRENT_USER, what: `Action created: ${newAction.title} → @${newAction.assignee} (priority ${newAction.priority})` },
    ];
    if (form.due) entries.push({ id: `t${Date.now() + 1}`, ts, who: CURRENT_USER, what: `Due date set: ${form.due}` });
    if (newAction.linkedEvidence) entries.push({ id: `t${Date.now() + 2}`, ts, who: CURRENT_USER, what: `Linked evidence: ${newAction.linkedEvidence}` });

    setCards(prev => prev.map(c => c.id === open.id
      ? { ...c, actions: [...c.actions, newAction], timeline: [...c.timeline, ...entries] }
      : c));

    notificationsStore.add({
      kind: "action",
      tone: "info",
      title: `Action assigned: ${newAction.title}`,
      body: `@${newAction.assignee} — due ${newAction.due} · linked to ${open.id}`,
      href: "/app/incidents/board",
      incidentId: open.id,
      actionId: newAction.id,
      assignee: newAction.assignee,
      createdAt: ts,
    });

    // Push to operational tasks store so it appears in My Tasks for the assignee.
    try {
      const dueISO = form.due ? new Date(form.due + "T09:00:00").toISOString() : new Date(Date.now() + 86400000).toISOString();
      const priorityMap: Record<string, "low" | "normal" | "high"> = {
        Low: "low", Medium: "normal", High: "high", Urgent: "high",
      };
      createTaskRecord({
        title: newAction.title,
        description: [
          newAction.instruction,
          newAction.linkedEvidence ? `Linked evidence: ${newAction.linkedEvidence}` : null,
          `Linked incident: ${open.id} · ${serviceUserName(open.serviceUserId)}`,
        ].filter(Boolean).join("\n"),
        taskType: "follow_up",
        sourceType: "incident",
        sourceRef: open.id,
        siteId: "site-oak",
        ownership: "person",
        assigneeId: staffSlug(newAction.assignee),
        assignedById: staffSlug(CURRENT_USER),
        dueAt: dueISO,
        priority: priorityMap[newAction.priority || "Medium"] || "normal",
      });
    } catch {
      /* tasks store optional in some demos */
    }

    toast("Action created", { description: `Assigned to ${newAction.assignee}. Notification sent and added to My Tasks.` });
    setForm({ title: "", assignee: "", due: "", instruction: "", priority: "Medium", linkedEvidence: "" });
    setMentionOpen(false);
    setCreateOpen(false);
  };

  const addGovernanceComment = () => {
    if (!open || !commentDraft.trim()) return;
    const ts = nowStamp();
    const newComment: GovernanceComment = {
      id: `gc-${Date.now()}`,
      author: CURRENT_USER,
      text: commentDraft.trim(),
      ts,
    };
    setCards(prev => prev.map(c => c.id === open.id
      ? {
          ...c,
          governanceComments: [...(c.governanceComments || []), newComment],
          timeline: [...c.timeline, { id: `t${Date.now()}`, ts, who: CURRENT_USER, what: `Governance comment added: "${newComment.text}"` }],
        }
      : c));
    setCommentDraft("");
    toast("Comment added", { description: "Visible to reviewers in the governance trail." });
  };

  const startComplete = (a: ActionItem) => {
    setCompleteAction(a);
    setCompletionNote("");
  };

  const submitComplete = () => {
    if (!open || !completeAction) return;
    const ts = nowStamp();
    setCards(prev => prev.map(c => c.id === open.id
      ? {
          ...c,
          actions: c.actions.map(a => a.id === completeAction.id
            ? { ...a, status: "Complete" as ActionStatus, completedBy: CURRENT_USER, completedAt: ts, completionNote: completionNote.trim() || undefined }
            : a),
          timeline: [
            ...c.timeline,
            { id: `t${Date.now()}`, ts, who: CURRENT_USER, what: `Marked complete: ${completeAction.title}` },
            ...(completionNote.trim() ? [{ id: `t${Date.now() + 1}`, ts, who: CURRENT_USER, what: `Comment: "${completionNote.trim()}"` }] : []),
          ],
        }
      : c));
    toast("Action completed", { description: `${completeAction.title} marked complete.` });
    setCompleteAction(null);
    setCompletionNote("");
  };

  const setActionStatus = (actionId: string, status: ActionStatus) => {
    if (!open) return;
    const ts = nowStamp();
    setCards(prev => prev.map(c => c.id === open.id
      ? {
          ...c,
          actions: c.actions.map(a => a.id === actionId ? { ...a, status } : a),
          timeline: [...c.timeline, { id: `t${Date.now()}`, ts, who: CURRENT_USER, what: `Status changed → ${status}` }],
        }
      : c));
  };

  const openCloseDialog = () => {
    if (!open) return;
    setCloseForm({
      summary: "", lessons: "", closedBy: CURRENT_USER,
      closedDate: todayISO, override: false, rationale: "",
    });
    setCloseOpen(true);
  };

  const submitClose = () => {
    if (!open) return;
    const gate = canCloseIncident({ investigation: open.investigation, actions: open.actions });
    if (!gate.ok && !closeForm.override) {
      toast("Closure blocked", { description: "Resolve blockers or document a manager override." });
      return;
    }
    if (!gate.ok && closeForm.override && !closeForm.rationale.trim()) {
      toast("Override rationale required", { description: "Document why you're closing despite blockers." });
      return;
    }
    if (!closeForm.summary.trim() || !closeForm.closedBy.trim() || !closeForm.closedDate) {
      toast("Missing closure fields", { description: "Summary, closed by and closed date are required." });
      return;
    }
    const ts = nowStamp();
    const closure: ClosureRecord = {
      summary: closeForm.summary.trim(),
      lessonsLearned: closeForm.lessons.trim() || undefined,
      closedBy: closeForm.closedBy.trim(),
      closedAt: `${closeForm.closedDate} · ${new Date().toTimeString().slice(0, 5)}`,
      overrideRationale: !gate.ok && closeForm.override ? closeForm.rationale.trim() : undefined,
    };
    const entries: TimelineEntry[] = [
      { id: `t${Date.now()}`, ts, who: closure.closedBy, what: `Incident closed — "${closure.summary}"` },
    ];
    if (closure.lessonsLearned) entries.push({ id: `t${Date.now() + 1}`, ts, who: closure.closedBy, what: `Lessons learned: ${closure.lessonsLearned}` });
    if (closure.overrideRationale) entries.push({ id: `t${Date.now() + 2}`, ts, who: closure.closedBy, what: `Manager override applied — ${closure.overrideRationale}` });

    setCards(prev => prev.map(c => c.id === open.id
      ? { ...c, closure, lifecycleStatus: "Closed", column: "complete" as ColumnId, overdue: false, timeline: [...c.timeline, ...entries] }
      : c));
    toast("Incident closed", { description: `${open.id} closed by ${closure.closedBy}.` });
    setCloseOpen(false);
  };


  const confirmSeverity = () => {
    if (!open) return;
    if (!sevDraft.severity) {
      toast("Select a reviewed severity", { description: "Choose Low, Moderate, High or Critical." });
      return;
    }
    const initial = open.initialSeverity;
    const changed = initial !== sevDraft.severity;
    if (changed && !sevDraft.comment.trim()) {
      toast("Reviewer comment required", { description: "Explain why severity is being changed." });
      return;
    }
    const ts = nowStamp();
    const newSev = sevDraft.severity as "Low" | "Moderate" | "High" | "Critical";
    const entry = changed
      ? `Severity changed from ${initial} to ${newSev} by ${CURRENT_USER}${sevDraft.comment.trim() ? ` — "${sevDraft.comment.trim()}"` : ""}`
      : `Severity confirmed as ${newSev} by ${CURRENT_USER}${sevDraft.comment.trim() ? ` — "${sevDraft.comment.trim()}"` : ""}`;
    setCards(prev => prev.map(c => c.id === open.id
      ? {
          ...c,
          reviewedSeverity: newSev,
          severityReviewComment: sevDraft.comment.trim() || undefined,
          severityReviewedBy: CURRENT_USER,
          severityReviewedAt: ts,
          severity: newSev as Severity,
          timeline: [...c.timeline, { id: `t${Date.now()}`, ts, who: CURRENT_USER, what: entry }],
        }
      : c));
    toast(changed ? "Severity updated" : "Severity confirmed", { description: entry });
  };

  return (
    <div className="px-4 py-8 max-w-[1400px] mx-auto">
      <motion.div {...fade} transition={{ duration: 0.4 }}>
        <h1 className="font-heading text-2xl font-bold text-foreground">Events Board</h1>
        <p className="text-muted-foreground mt-1 text-sm">Triage, review, assign actions, and progress events to completion.</p>
        <div className="mt-3"><RoleContextBanner /></div>
        <div className="mt-3"><OverdueReviewSuggestionsAlert /></div>
      </motion.div>

      {/* Filter bar — matches Incidents > Reporting UX */}
      <motion.div {...fade} transition={{ delay: 0.06, duration: 0.4 }} className="mt-6 bg-card rounded-2xl shadow-soft border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={filterSite} onValueChange={setFilterSite}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="All sites" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {siteOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterSeverity} onValueChange={setFilterSeverity}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="All severities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              {severityOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterLocation} onValueChange={setFilterLocation}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="All locations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locationOptions.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterEventType} onValueChange={setFilterEventType}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="All event types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All event types</SelectItem>
              {EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="All sub-types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sub-types</SelectItem>
              {categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={residentSearch}
              onChange={(e) => setResidentSearch(e.target.value)}
              placeholder="Resident name…"
              className="h-9 pl-8 rounded-xl bg-background text-xs"
            />
          </div>

          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="h-9 rounded-xl bg-background text-xs"
            placeholder="From"
          />
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="h-9 rounded-xl bg-background text-xs"
            placeholder="To"
          />

          <Select value={filterReviewer} onValueChange={setFilterReviewer}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="Any reviewer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any reviewer</SelectItem>
              <SelectItem value="__unassigned__">Unassigned</SelectItem>
              {reviewerOptions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterFlag} onValueChange={(v) => setFilterFlag(v as typeof filterFlag)}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="Any flag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any flag</SelectItem>
              <SelectItem value="restricted">Restricted only</SelectItem>
              <SelectItem value="ai-draft">AI draft — needs review</SelectItem>
              <SelectItem value="translated">Translation available</SelectItem>
              <SelectItem value="overdue">Follow-up overdue</SelectItem>
              <SelectItem value="closure-approval">Closure approval required</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="severity">By severity</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">{filteredCards.length} event{filteredCards.length !== 1 ? "s" : ""} found</p>
      </motion.div>

      {/* Kanban */}
      {isMobile && (
        <div role="tablist" aria-label="Board columns" className="mt-6 grid grid-cols-4 gap-1 bg-secondary/40 rounded-xl p-1">
          {columns.map((col) => (
            <button key={col.id} role="tab" aria-selected={mobileCol === col.id} onClick={() => setMobileCol(col.id)}
              className={`min-w-0 rounded-lg px-1 py-1.5 text-[11px] font-medium leading-tight ${mobileCol === col.id ? "bg-card text-foreground shadow-soft" : "text-muted-foreground"}`}>
              <span className="block truncate">{col.title}</span>
              <span className="block text-[10px] text-muted-foreground">{grouped[col.id].length}</span>
            </button>
          ))}
        </div>
      )}
      <div className={isMobile ? "mt-3" : "mt-6 overflow-x-auto min-[1100px]:overflow-x-visible pb-2"}>
      <div className={isMobile ? "grid gap-4 grid-cols-1" : "grid gap-4 grid-flow-col auto-cols-[minmax(280px,1fr)] min-[1100px]:grid-flow-row min-[1100px]:grid-cols-4"}>
        {columns.filter((col) => !isMobile || col.id === mobileCol).map((col, ci) => {
          const items = grouped[col.id];
          const Icon = col.icon;
          const isDropTarget = dragOverCol === col.id;
          return (
            <motion.div
              key={col.id}
              {...fade}
              transition={{ delay: 0.06 * ci, duration: 0.35 }}
              onDragOver={(e) => { e.preventDefault(); if (dragOverCol !== col.id) setDragOverCol(col.id); }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOverCol((cur) => (cur === col.id ? null : cur));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || draggingId;
                setDragOverCol(null);
                setDraggingId(null);
                if (!id) return;
                const card = cards.find((c) => c.id === id);
                if (!card || card.column === col.id) return;
                move(id, col.id);
              }}
              className={`min-w-0 bg-secondary/40 rounded-2xl p-3 min-h-[200px] transition-colors ${
                isDropTarget ? "bg-primary/10 ring-2 ring-primary/40" : ""
              }`}
            >
              <div className="flex items-center justify-between px-2 py-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${col.tone}`} />
                  <h3 className="text-sm font-heading font-semibold text-foreground">{col.title}</h3>
                </div>
                <span className="text-xs font-medium text-muted-foreground bg-card px-2 py-0.5 rounded-full border border-border">{items.length}</span>
              </div>
              <div className="space-y-2 mt-1">
                {items.map((c) => {
                  const openActions = c.actions.filter(a => a.status !== "Complete").length;
                  const openFlags = c.submission?.outstandingFlags?.length ?? 0;
                  const isDragging = draggingId === c.id;
                  const severityChanged = c.initialSeverity !== c.severity;
                  return (
                    <motion.div
                      key={c.id}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: isDragging ? 0.5 : 1, scale: 1 }}
                      draggable
                      onDragStart={(e) => {
                        const ev = e as unknown as React.DragEvent;
                        ev.dataTransfer.setData("text/plain", c.id);
                        ev.dataTransfer.effectAllowed = "move";
                        setDraggingId(c.id);
                      }}
                      onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                      onClick={() => setOpenId(c.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") setOpenId(c.id); }}
                      className="cursor-grab active:cursor-grabbing w-full min-w-0 text-left bg-card rounded-xl border border-border shadow-soft p-3 hover:shadow-card hover:border-primary/30 transition-all"
                    >
                      {/* Row 1: ID + severity + status */}
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="text-[10px] font-mono text-muted-foreground">{c.id}</span>
                        {initialSeverityChip(c.initialSeverity)}
                        <RiskBadge impact={c.impact} likelihood={c.likelihood} showMatrix={false} />
                        <LifecyclePill status={c.lifecycleStatus ?? deriveLifecycleFromColumn(c.column, !!c.owner)} />
                      </div>

                      {/* Row 2: flags (only rendered when any apply) */}
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0 mt-1.5 empty:hidden [&>*]:max-w-full">
                        {c.submission?.notifiable?.flagged && notifiableChip()}
                        {c.overdue && (
                          <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 font-semibold flex items-center gap-1">
                            <Flag className="h-2.5 w-2.5" /> Overdue
                          </Badge>
                        )}
                        {(() => {
                          const vis = c.visibility || getDefaultVisibility(c.eventType);
                          if (!isRestricted(vis)) return null;
                          return (
                            <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30 font-semibold inline-flex items-center gap-1">
                              <EyeOff className="h-2.5 w-2.5" /> Restricted
                            </Badge>
                          );
                        })()}
                        {c.column === "new" && c.submission && (
                          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 font-semibold inline-flex items-center gap-1">
                            <Sparkles className="h-2.5 w-2.5" /> AI draft — needs review
                          </Badge>
                        )}
                        {c.submission?.translatedText && c.submission?.sourceLanguage && c.submission.sourceLanguage !== "en" && (
                          <Badge variant="outline" className="text-[10px] bg-accent/10 text-accent border-accent/20 font-semibold inline-flex items-center gap-1">
                            <FileText className="h-2.5 w-2.5" /> Translated
                          </Badge>
                        )}
                        {c.actions.some(a => a.status === "Overdue") && !c.overdue && (
                          <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 font-semibold inline-flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" /> Follow-up overdue
                          </Badge>
                        )}
                      </div>

                      {/* Row 3: resident (alone on its line) */}
                      <div className="mt-1.5 min-w-0"><CardResident card={c} /></div>

                      {/* Row 4: event type + category */}
                      <div className="flex flex-wrap gap-1 mt-1.5 min-w-0">
                        <CardTag className="bg-secondary/60 text-foreground border-border" label={c.eventType || "Incident / Accident"} />
                        <CardTag className="bg-primary/5 text-primary border-primary/20" label={c.category} />
                      </div>

                      {/* Row 3: Compact metadata strip */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1 min-w-0 max-w-full"><Building2 className="h-3 w-3 shrink-0" /><span className="truncate">{c.site}</span></span>
                        <span className="flex items-center gap-1 min-w-0 max-w-full"><UserIcon className="h-3 w-3 shrink-0" /><span className="truncate">{c.location}</span></span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{c.dateTime}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1 min-w-0 max-w-full"><MessageSquare className="h-3 w-3 shrink-0" /><span className="truncate">{c.submission?.capturedBy || "—"}</span></span>
                        <span className="flex items-center gap-1 min-w-0 max-w-full"><AtSign className="h-3 w-3 shrink-0" /><span className="truncate">{c.owner || "Unassigned"}</span></span>
                      </div>

                      {/* Severity change note */}
                      {severityChanged && (
                        <div className="mt-1.5 text-[10px] text-muted-foreground italic">
                          Severity changed: {c.initialSeverity} → {c.severity}
                        </div>
                      )}

                      {/* Row 4: Bottom strip — flags + actions */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                        <div className="flex items-center gap-2">
                          {openFlags > 0 && (
                            <span className="text-[10px] text-warning inline-flex items-center gap-1">
                              <Flag className="h-3 w-3" /> {openFlags} flag{openFlags !== 1 ? "s" : ""}
                            </span>
                          )}
                          {openActions > 0 && (
                            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                              <ListTodo className="h-3 w-3" /> {openActions} open
                            </span>
                          )}
                          {openFlags === 0 && openActions === 0 && (
                            <span className="text-[10px] text-muted-foreground italic">No open items</span>
                          )}
                        </div>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </motion.div>
                  );
                })}
                {items.length === 0 && (
                  <div className={`text-center text-[11px] py-6 rounded-lg border border-dashed transition-colors ${
                    isDropTarget ? "border-primary/40 text-primary" : "border-border text-muted-foreground"
                  }`}>
                    {isDropTarget ? "Drop to move here" : "Nothing here."}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      </div>

      {/* Shared full incident modal — same component used by Events Reporting.
          The card and modal are BOTH keyed by incidentId; the modal reads from
          the shared IncidentRecord store via getIncidentById. If a card has no
          matching record, we show an explicit not-found dialog rather than
          silently opening a different incident. */}
      {(() => {
        if (!openId) {
          return (
            <IncidentDetailDrawer
              incident={null}
              open={false}
              onOpenChange={() => setOpenId(null)}
            />
          );
        }
        const modalIncident = getIncidentById(openId);
        const cardForOpen = cards.find((c) => c.id === openId);
        if (cardForOpen) assertIncidentCardMatchesModal(cardForOpen, modalIncident);
        if (!modalIncident) {
          return (
            <Dialog open={!!openId} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-heading">Incident not found in Events</DialogTitle>
                  <DialogDescription>
                    <span className="font-mono">{openId}</span> is referenced on the board but
                    has no matching record in the Events store. It may have been archived or
                    the reference is out of date.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenId(null)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          );
        }
        return (
          <IncidentDetailDrawer
            incident={modalIncident}
            open={true}
            onOpenChange={(v) => { if (!v) setOpenId(null); }}
          />
        );
      })()}



      {/* Add note dialog */}
      <Dialog open={noteOpen} onOpenChange={(v) => { setNoteOpen(v); if (!v) setNoteText(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Add note to incident</DialogTitle>
            <DialogDescription>This will appear in the incident timeline as a record entry.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="e.g. Spoke with family at 14:00, no further concerns raised."
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setNoteOpen(false); setNoteText(""); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (!open || !noteText.trim()) return;
                const txt = noteText.trim();
                setCards(prev => prev.map(c => c.id === open.id
                  ? { ...c, timeline: [...c.timeline, { id: `t${Date.now()}`, ts: nowStamp(), who: CURRENT_USER, what: `Note: ${txt}` }] }
                  : c));
                setNoteOpen(false);
                setNoteText("");
                toast("Note added", { description: "Saved to the incident timeline." });
              }}
            >Save note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create action dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Create follow-up action</DialogTitle>
            <DialogDescription>
              Assign to a staff member. They will receive a notification.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative">
              <Label className="text-xs">Action title</Label>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Tip: type <span className="font-mono bg-secondary/60 px-1 rounded">@</span> to mention and assign a staff member.
              </p>
              <Input
                value={form.title}
                onChange={(e) => {
                  const val = e.target.value;
                  const caret = e.target.selectionStart ?? val.length;
                  setForm({ ...form, title: val });
                  // Detect "@query" immediately before caret with no whitespace
                  const upto = val.slice(0, caret);
                  const m = upto.match(/@([A-Za-zÀ-ÿ' -]*)$/);
                  if (m) {
                    setMentionOpen(true);
                    setMentionQuery(m[1]);
                    setMentionStart(caret - m[0].length);
                  } else {
                    setMentionOpen(false);
                    setMentionStart(null);
                  }
                }}
                onKeyDown={(e) => { if (e.key === "Escape") setMentionOpen(false); }}
                placeholder="e.g. @Joanne Walsh complete post-fall observations by tomorrow"
                className="mt-1"
              />
              {mentionOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                  {STAFF
                    .filter((s) => s.name.toLowerCase().includes(mentionQuery.toLowerCase()))
                    .map((s) => (
                      <button
                        type="button"
                        key={s.name}
                        className="w-full text-left px-3 py-2 hover:bg-secondary/60 flex items-center gap-2"
                        onClick={() => {
                          const title = form.title;
                          const start = mentionStart ?? title.length;
                          const before = title.slice(0, start);
                          const afterQuery = title.slice(start + 1 + mentionQuery.length);
                          const inserted = `@${s.name} `;
                          setForm({ ...form, title: before + inserted + afterQuery, assignee: s.name });
                          setMentionOpen(false);
                          setMentionStart(null);
                          setMentionQuery("");
                        }}
                      >
                        <AtSign className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">· {s.role}</span>
                      </button>
                    ))}
                  {STAFF.filter((s) => s.name.toLowerCase().includes(mentionQuery.toLowerCase())).length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No matching staff</div>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Assign to</Label>
              <Select value={form.assignee} onValueChange={(v) => setForm({ ...form, assignee: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select staff member (or use @mention above)" />
                </SelectTrigger>
                <SelectContent>
                  {STAFF.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      <span className="inline-flex items-center gap-1.5">
                        <AtSign className="h-3 w-3 text-primary" />
                        {s.name} <span className="text-muted-foreground text-xs">· {s.role}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Due date</Label>
              <Input
                type="date"
                value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as ActionPriority })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Linked evidence (optional)</Label>
              <Select value={form.linkedEvidence || "none"} onValueChange={(v) => setForm({ ...form, linkedEvidence: v === "none" ? "" : v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Link to an evidence item" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  <SelectItem value="Source evidence (verbatim submission)">Source evidence (verbatim submission)</SelectItem>
                  {open?.submission?.draftSections?.map((d, i) => (
                    <SelectItem key={`ds-${i}`} value={`Draft: ${d.label}`}>Draft: {d.label}</SelectItem>
                  ))}
                  {open?.submission?.clarifications?.map((c) => (
                    <SelectItem key={c.id} value={`Clarification: ${c.question}`}>Clarification: {c.question}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Instruction (optional)</Label>
              <Textarea
                value={form.instruction}
                onChange={(e) => setForm({ ...form, instruction: e.target.value })}
                placeholder="Add context or specific instruction"
                className="mt-1 min-h-[70px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={!form.title.trim() || !form.assignee}>
              <Send className="h-4 w-4 mr-1.5" /> Create & notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete action dialog */}
      <Dialog open={!!completeAction} onOpenChange={(o) => !o && setCompleteAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Mark action complete</DialogTitle>
            <DialogDescription>
              {completeAction?.title} — assigned to {completeAction?.assignee}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs">Completion comment</Label>
            <Textarea
              value={completionNote}
              onChange={(e) => setCompletionNote(e.target.value)}
              placeholder="Briefly describe what was done"
              className="mt-1 min-h-[90px]"
            />
            <p className="text-[10px] text-muted-foreground mt-2">
              Will be recorded as completed by {CURRENT_USER} at {nowStamp()}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleteAction(null)}>Cancel</Button>
            <Button onClick={submitComplete}>
              <CheckCircle className="h-4 w-4 mr-1.5" /> Mark complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close incident dialog (guarded) */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading inline-flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" /> Close incident
            </DialogTitle>
            <DialogDescription>
              {open?.id} — {serviceUserName(open?.serviceUserId)}. Closure is permanent and logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            if (!open) return null;
            const gate = canCloseIncident({ investigation: open.investigation, actions: open.actions });
            return (
              <div className="space-y-3 py-2">
                {!gate.ok && (
                  <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
                    <p className="text-xs font-semibold text-warning mb-1.5 inline-flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" /> Closure blocked
                    </p>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {gate.blockers.map(b => <li key={b} className="text-xs text-foreground">{b}</li>)}
                    </ul>
                    <label className="flex items-start gap-2 mt-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={closeForm.override}
                        onChange={(e) => setCloseForm(f => ({ ...f, override: e.target.checked }))}
                      />
                      <span className="text-xs text-foreground">
                        Apply manager override — I accept governance responsibility for closing despite the blockers above.
                      </span>
                    </label>
                    {closeForm.override && (
                      <div className="mt-2">
                        <Label className="text-[11px] text-muted-foreground">
                          Override rationale <span className="text-destructive">(required)</span>
                        </Label>
                        <Textarea
                          value={closeForm.rationale}
                          onChange={(e) => setCloseForm(f => ({ ...f, rationale: e.target.value }))}
                          placeholder="Explain why this incident is being closed with outstanding blockers…"
                          className="mt-1 min-h-[70px] text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
                {gate.ok && (
                  <div className="rounded-lg border border-success/30 bg-success/5 p-2.5 text-xs text-success font-medium inline-flex items-center gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5" /> All closure prerequisites met.
                  </div>
                )}

                <div>
                  <Label className="text-xs">Closure summary <span className="text-destructive">*</span></Label>
                  <Textarea
                    value={closeForm.summary}
                    onChange={(e) => setCloseForm(f => ({ ...f, summary: e.target.value }))}
                    placeholder="Brief governance summary of the resolution and final outcome."
                    className="mt-1 min-h-[80px] text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Lessons learned</Label>
                  <Textarea
                    value={closeForm.lessons}
                    onChange={(e) => setCloseForm(f => ({ ...f, lessons: e.target.value }))}
                    placeholder="What we learned and what changes (if any) result from this incident."
                    className="mt-1 min-h-[70px] text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Closed by <span className="text-destructive">*</span></Label>
                    <Input
                      value={closeForm.closedBy}
                      onChange={(e) => setCloseForm(f => ({ ...f, closedBy: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Closed date <span className="text-destructive">*</span></Label>
                    <Input
                      type="date"
                      value={closeForm.closedDate}
                      onChange={(e) => setCloseForm(f => ({ ...f, closedDate: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloseOpen(false)}>Cancel</Button>
            <Button onClick={submitClose}>
              <Lock className="h-4 w-4 mr-1.5" /> Confirm closure
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
};

export default Board;
