import { isManagerRole } from "@/lib/roleStore";
import { getTerms } from "@/lib/orgSettingsStore";
import { useTerms } from "@/hooks/useTerms";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles, MapPin, Users, ShieldAlert, TrendingUp, TrendingDown, Minus, ArrowRight,
  Clock, ExternalLink, CheckCircle2, XCircle, Download, NotebookPen, Send, FileWarning,
  AlertTriangle, Heart, FileText, ListChecks, BookOpen,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { canAccess, inScope, isFrontline } from "@/lib/roleStore";
import { SITE_BY_ID } from "@/lib/demoDataRegistry";

import { toast } from "sonner";
import {
  seedInsights, type Insight, type InsightStatus, type InsightType, type InsightCategory,
  CATEGORY_ORDER, statusBadgeClasses, confidenceClasses,
} from "@/lib/insightsData";
import { NoAccessPanel } from "@/components/RoleContextBanner";
import { useInsightSignals, isSignal, insightSignalsStore, type SignalInsight } from "@/lib/insightSignals";
import { serviceUsersStore } from "@/lib/serviceUsersStore";

// Events and Care Planning cards now come from live signals (insightSignals.ts).
const isEventsOrCarePlanSeed = (i: Insight) =>
  i.category === "Care plan risks" || i.category === "Event / incident risks" ||
  (i.relatedRecordIds.length > 0 && i.relatedRecordIds.every((id) => /^(INC|CP)-/i.test(id)));
const retainedSeeds = seedInsights.filter((i) => !isEventsOrCarePlanSeed(i));

type LinkedSource = {
  kind: "incident" | "audit" | "task" | "workforce" | "care_plan" | "policy" | "unknown";
  path: string | null;
  moduleLabel: string;
};

function resolveLinkedRecord(id: string): LinkedSource {
  const up = id.toUpperCase();
  if (up.startsWith("INC")) return { kind: "incident", path: `/app/incidents/reporting?incidentId=${id}`, moduleLabel: "Events" };
  if (up.startsWith("AUD")) return { kind: "audit", path: `/app/audits/conduct/${id}`, moduleLabel: "Audits" };
  if (up.startsWith("TASK")) return { kind: "task", path: `/app/tasks/${id}`, moduleLabel: "Tasks" };
  if (up.startsWith("QUAL")) return { kind: "workforce", path: `/app/workforce/qualifications?source=${id}`, moduleLabel: "Workforce" };
  if (up.startsWith("POL")) return { kind: "policy", path: `/app/policies/${id}`, moduleLabel: "Policy Hub" };
  if (up.startsWith("CP-PS")) {
    const m = up.match(/^CP-(PS\d+)/);
    const person = m ? m[1] : "";
    return { kind: "care_plan", path: person ? `/app/care-plans/plans/${person}` : null, moduleLabel: "Care Planning" };
  }
  return { kind: "unknown", path: null, moduleLabel: "Records" };
}


function canViewLinked(kind: LinkedSource["kind"], role: ReturnType<typeof useRole>) {
  if (kind === "incident") return canAccess("incidents.board", role.role) || canAccess("incidents.overview", role.role) || canAccess("incidents.reporting", role.role);
  if (kind === "audit") return canAccess("audits.overview", role.role) || canAccess("audits.my", role.role);
  if (kind === "task") return canAccess("tasks.overview", role.role) || canAccess("tasks.today", role.role);
  if (kind === "workforce") return canAccess("workforce.overview", role.role) || canAccess("workforce.qualifications", role.role);
  if (kind === "care_plan") return canAccess("carePlans.people", role.role) || canAccess("carePlans.overview", role.role);
  if (kind === "policy") return canAccess("policies.library", role.role);
  return true;
}



export default function Insights() {
  const terms = useTerms();
  const r = useRole();
  const navigate = useNavigate();

  // Frontline: no org-wide insights view.
  if (isFrontline(r.role)) {
    return (
      <div className="p-6 md:p-8">
        <NoAccessPanel moduleLabel="Insights" />
      </div>
    );
  }

  const [seeded, setInsights] = useState<Insight[]>(retainedSeeds);
  const liveSignals = useInsightSignals(r);
  const [signalPatches, setSignalPatches] = useState<Record<string, Partial<Insight>>>({});
  const insights = useMemo<Insight[]>(
    () => [...liveSignals.map((s) => ({ ...s, ...(signalPatches[s.id] ?? {}) }) as SignalInsight), ...seeded],
    [liveSignals, signalPatches, seeded],
  );
  const [filters, setFilters] = useState({
    source: "all" as "all" | "incidents" | "audits",
    site: "all",
    type: "all" as "all" | InsightType,
    status: "all" as "all" | InsightStatus,
    confidence: "all" as "all" | "Low" | "Medium" | "High",
    overdueOnly: false,
  });

  // Classify an insight by the source records it draws from.
  // Incidents source = INC-* records and TASK-* incident-linked follow-up actions.
  // Audits source = AUD-* records and audit-linked follow-up actions.
  const insightSources = (i: Insight) => {
    const ids = i.relatedRecordIds.map((x) => x.toUpperCase());
    const hasIncident = ids.some((x) => x.startsWith("INC") || x.startsWith("TASK"));
    const hasAudit = ids.some((x) => x.startsWith("AUD"));
    return { hasIncident, hasAudit };
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [digestOpen, setDigestOpen] = useState(false);

  // Site scope filter (managers see only their assigned sites)
  const scopedInsights = useMemo(
    () => insights.filter((i) => {
      if (i.site === "Multiple") return true;
      // Match via canonical relatedSiteIds when present (e.g. workforce insights).
      if (i.relatedSiteIds && i.relatedSiteIds.length > 0) {
        return i.relatedSiteIds.some((sid) => {
          const name = (SITE_BY_ID as Record<string, { name: string } | undefined>)[sid]?.name ?? "";
          return name && inScope(name, r.role, r.scope);
        });
      }
      return inScope(i.site, r.role, r.scope);
    }),
    [insights, r.role, r.scope],
  );


  const filtered = useMemo(() => {
    const today = new Date();
    return scopedInsights.filter((i) => {
      if (filters.source !== "all") {
        const { hasIncident, hasAudit } = insightSources(i);
        if (filters.source === "incidents" && !hasIncident) return false;
        if (filters.source === "audits" && !hasAudit) return false;
      }
      if (filters.site !== "all" && i.site !== filters.site) return false;
      if (filters.type !== "all" && i.type !== filters.type) return false;
      if (filters.status !== "all" && i.status !== filters.status) return false;
      if (filters.confidence !== "all" && i.confidence !== filters.confidence) return false;
      if (filters.overdueOnly) {
        if (!i.dueDate) return false;
        if (new Date(i.dueDate) >= today) return false;
        if (i.status === "Confirmed" || i.status === "Dismissed") return false;
      }
      return true;
    });
  }, [scopedInsights, filters]);

  // Overview card counts (by category)
  const counts = useMemo(() => {
    const byCat = (c: InsightCategory) => scopedInsights.filter((i) => i.category === c).length;
    return {
      immediate: byCat("Immediate attention"),
      carePlan: byCat("Care plan risks"),
      event: byCat("Event / incident risks"),
      workforce: byCat("Workforce compliance risks"),
      audit: byCat("Audit and governance risks"),
      policy: byCat("Policy review risks"),
      task: byCat("Follow-up and task risks"),
      newThisWeek: scopedInsights.filter((i) => i.isNewThisWeek).length,
    };
  }, [scopedInsights]);

  const sites = Array.from(new Set(seedInsights.map((i) => i.site)));

  const selected = insights.find((i) => i.id === selectedId) || null;

  // Mutations
  const updateInsight = (id: string, patch: Partial<Insight>, eventText?: string) => {
    if (id.startsWith("SIG-")) {
      const cur = insights.find((i) => i.id === id);
      if (!cur) return;
      setSignalPatches((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? {}), ...patch, updatedAt: new Date().toISOString(),
          auditTrail: eventText
            ? [...cur.auditTrail, { at: new Date().toISOString(), by: r.displayName, event: eventText }]
            : cur.auditTrail,
        },
      }));
      return;
    }
    setInsights((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              ...patch,
              updatedAt: new Date().toISOString(),
              auditTrail: eventText
                ? [...i.auditTrail, { at: new Date().toISOString(), by: r.displayName, event: eventText }]
                : i.auditTrail,
            }
          : i,
      ),
    );
  };

  const handleConfirm = (id: string) => {
    const date = new Date().toISOString();
    updateInsight(
      id,
      { status: "Confirmed", confirmedBy: r.displayName, confirmedAt: date },
      `Pattern reviewed and confirmed by ${r.displayName}`,
    );
    toast.success("Pattern confirmed", { description: "A governance note has been added to the audit trail." });
  };

  const handleDismiss = () => {
    if (!dismissId) return;
    if (!dismissReason.trim()) {
      toast.error("A short reason is required to dismiss a pattern.");
      return;
    }
    const sig = insights.find((i) => i.id === dismissId);
    if (sig && isSignal(sig)) {
      insightSignalsStore.dismiss(sig, dismissReason, r.displayName, r.staffId);
      toast.success("Card dismissed", { description: "Your reason has been logged." });
      setDismissId(null); setSelectedId(null);
      setDismissReason("");
      return;
    }
    updateInsight(
      dismissId,
      { status: "Dismissed", dismissedReason: dismissReason.trim() },
      `Pattern dismissed by ${r.displayName} — ${dismissReason.trim()}`,
    );
    toast.success("Pattern dismissed");
    setDismissId(null);
    setDismissReason("");
  };

  const handleMarkReviewed = (id: string) => {
    updateInsight(id, { status: "Under Review" }, `Marked as Under Review by ${r.displayName}`);
    toast.success("Marked as Under Review");
  };

  const handleCreateAction = (id: string, owner: string, due: string, note: string) => {
    const i = insights.find((x) => x.id === id);
    const linkSummary = i
      ? ` (linked to insight ${i.id} "${i.title}" and ${i.relatedRecordIds.length} source record${i.relatedRecordIds.length === 1 ? "" : "s"})`
      : "";
    updateInsight(
      id,
      { status: "Action Needed", assignedOwner: owner, dueDate: due, managerNotes: note || undefined },
      `Follow-up action created by ${r.displayName}${due ? `, due ${due}` : ""}, assigned to ${owner}${linkSummary}`,
    );
    toast.success("Follow-up action created", {
      description: "Linked back to this insight and its source records.",
    });
    setActionId(null);
  };

  const handleOpenLinkedRecord = (insightId: string, recordId: string) => {
    const owner = insights.find((x) => x.id === insightId);
    const override = owner && isSignal(owner) ? owner.recordLinks[recordId] : undefined;
    const link = override ? { ...resolveLinkedRecord(recordId), ...override } : resolveLinkedRecord(recordId);
    if (!canViewLinked(link.kind, r) || !link.path) {
      toast.error("You do not have permission to view this record.");
      return;
    }
    const i = insights.find((x) => x.id === insightId);
    updateInsight(
      insightId,
      {},
      `${r.displayName} opened linked source record ${recordId} from insight "${i?.title ?? insightId}"`,
    );
    setSelectedId(null);
    navigate(link.path);
  };


  const handleExport = (i: Insight) => {
    const blob = new Blob([JSON.stringify(i, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${i.id}-insight-summary.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Insight summary exported");
  };

  // Section groupings (by category)
  const byCategory = (c: InsightCategory) => filtered.filter((i) => i.category === c);
  const immediate = byCategory("Immediate attention");
  const carePlan = byCategory("Care plan risks");
  const eventRisks = byCategory("Event / incident risks");
  const workforce = byCategory("Workforce compliance risks");
  const auditRisks = byCategory("Audit and governance risks");
  const policyRisks = byCategory("Policy review risks");
  const taskRisks = byCategory("Follow-up and task risks");

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI-assisted insight
          </div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Insights</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Possible patterns, hotspots and governance gaps surfaced from your LogUp records.
            A manager reviews, confirms or dismisses each insight — AI does not take action.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setDigestOpen(true)}>
            <NotebookPen className="h-4 w-4" /> Weekly leadership digest
          </Button>
        </div>
      </div>

      {/* Overview cards — by category */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <OverviewCard
          icon={<AlertTriangle className="h-4 w-4 text-orange-600" />}
          label="Immediate attention"
          count={counts.immediate}
          sub={`${counts.newThisWeek} new this week`}
          trend="up"
        />
        <OverviewCard
          icon={<Heart className="h-4 w-4" />}
          label="Care plan risks"
          count={counts.carePlan}
          sub="Cross-linked to Events"
          trend="flat"
        />
        <OverviewCard
          icon={<MapPin className="h-4 w-4" />}
          label="Event / incident risks"
          count={counts.event}
          sub="Site-level patterns"
          trend="up"
        />
        <OverviewCard
          icon={<Users className="h-4 w-4" />}
          label="Workforce compliance"
          count={counts.workforce}
          sub="Expired / due soon"
          trend="flat"
        />
        <OverviewCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Audit & governance"
          count={counts.audit}
          sub="Overdue / due soon"
          trend="up"
        />
        <OverviewCard
          icon={<BookOpen className="h-4 w-4" />}
          label="Policy review"
          count={counts.policy}
          sub="Due for review"
          trend="flat"
        />
        <OverviewCard
          icon={<ListChecks className="h-4 w-4" />}
          label="Follow-up & tasks"
          count={counts.task}
          sub="Open / overdue"
          trend="flat"
        />
        <OverviewCard
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          label="Total suggested attention"
          count={counts.immediate + counts.carePlan + counts.event + counts.workforce + counts.audit + counts.policy + counts.task}
          sub="Manager review only"
          trend="flat"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <FilterSelect
              label="Source"
              value={filters.source}
              onChange={(v) => setFilters((f) => ({ ...f, source: v as "all" | "incidents" | "audits" }))}
              options={[
                { value: "all", label: "All records" },
                { value: "incidents", label: "Events" },
                { value: "audits", label: "Audits" },
              ]}
            />
            <FilterSelect
              label="Site"
              value={filters.site}
              onChange={(v) => setFilters((f) => ({ ...f, site: v }))}
              options={[{ value: "all", label: "All sites" }, ...sites.map((s) => ({ value: s, label: s }))]}
            />
            <FilterSelect
              label="Theme type"
              value={filters.type}
              onChange={(v) => setFilters((f) => ({ ...f, type: v as InsightType | "all" }))}
              options={[
                { value: "all", label: "All types" },
                { value: "Resident", label: terms.Singular },
                { value: "Location", label: "Location" },
                { value: "Time", label: "Time / shift" },
                { value: "Incident Type", label: "Incident type" },
                { value: "Governance", label: "Governance" },
                { value: "Audit", label: "Audit" },
                { value: "Workforce", label: "Workforce" },
                { value: "Policy", label: "Policy" },
                { value: "Task", label: "Task" },
              ]}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(v) => setFilters((f) => ({ ...f, status: v as InsightStatus | "all" }))}
              options={[
                { value: "all", label: "All statuses" },
                { value: "New", label: "New" },
                { value: "Under Review", label: "Under Review" },
                { value: "Action Needed", label: "Action Needed" },
                { value: "Confirmed", label: "Confirmed" },
                { value: "Dismissed", label: "Dismissed" },
              ]}
            />
            <FilterSelect
              label="Confidence"
              value={filters.confidence}
              onChange={(v) => setFilters((f) => ({ ...f, confidence: v as "Low" | "Medium" | "High" | "all" }))}
              options={[
                { value: "all", label: "Any" },
                { value: "High", label: "High" },
                { value: "Medium", label: "Medium" },
                { value: "Low", label: "Low" },
              ]}
            />
            <div className="flex items-end">
              <Button
                variant={filters.overdueOnly ? "default" : "outline"}
                className="w-full"
                onClick={() => setFilters((f) => ({ ...f, overdueOnly: !f.overdueOnly }))}
              >
                <Clock className="h-4 w-4" /> Overdue only
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category tabs */}
      <Tabs defaultValue="immediate" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="immediate">
            <AlertTriangle className="h-3.5 w-3.5" /> Immediate ({immediate.length})
          </TabsTrigger>
          <TabsTrigger value="carePlan">Care plans ({carePlan.length})</TabsTrigger>
          <TabsTrigger value="event">Events ({eventRisks.length})</TabsTrigger>
          <TabsTrigger value="workforce">Workforce ({workforce.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit & governance ({auditRisks.length})</TabsTrigger>
          <TabsTrigger value="policy">Policy ({policyRisks.length})</TabsTrigger>
          <TabsTrigger value="task">Follow-up & tasks ({taskRisks.length})</TabsTrigger>
        </TabsList>

        {([
          ["immediate", immediate],
          ["carePlan", carePlan],
          ["event", eventRisks],
          ["workforce", workforce],
          ["audit", auditRisks],
          ["policy", policyRisks],
          ["task", taskRisks],
        ] as [string, Insight[]][]).map(([key, list]) => (
          <TabsContent key={key} value={key} className="space-y-3">
            {list.length === 0 ? <EmptyState /> : list.map((i) => (
              <InsightCard key={i.id} insight={i} onOpen={() => setSelectedId(i.id)}
                onConfirm={() => handleConfirm(i.id)}
                onDismiss={() => setDismissId(i.id)}
                onAction={() => setActionId(i.id)}
                onExport={() => handleExport(i)}
                onReview={() => handleMarkReviewed(i.id)}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {/* Footer principle */}
      <div className="rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm text-foreground/80 flex items-start gap-3">
        <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p>
          AI helps surface possible patterns and evidence gaps. Managers review, confirm and decide what action is needed.
          AI does not make clinical, safeguarding or compliance decisions.
        </p>
      </div>

      {/* Detail dialog */}
      <InsightDetailDialog
        insight={selected}
        onClose={() => setSelectedId(null)}
        onConfirm={() => selected && handleConfirm(selected.id)}
        onDismiss={() => selected && setDismissId(selected.id)}
        onAction={() => selected && setActionId(selected.id)}
        onExport={() => selected && handleExport(selected)}
        onOpenLinked={(recordId) => selected && handleOpenLinkedRecord(selected.id, recordId)}
      />


      {/* Dismiss dialog */}
      <Dialog open={!!dismissId} onOpenChange={(o) => { if (!o) { setDismissId(null); setDismissReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss this AI-assisted insight?</DialogTitle>
            <DialogDescription>
              A short reason is required. This is added to the governance audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dismiss-reason">Reason</Label>
            <Textarea
              id="dismiss-reason"
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="e.g. Not a true pattern — incidents were unrelated."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDismissId(null); setDismissReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDismiss}>Dismiss insight</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create action dialog */}
      <CreateActionDialog
        insight={insights.find((i) => i.id === actionId) || null}
        onClose={() => setActionId(null)}
        onCreate={handleCreateAction}
        defaultOwner={r.displayName}
      />

      {/* Weekly digest dialog */}
      <DigestDialog
        open={digestOpen}
        onClose={() => setDigestOpen(false)}
        insights={scopedInsights}
      />
    </div>
  );
}

// ---------- Sub-components ----------

function OverviewCard({
  icon, label, count, sub, trend,
}: { icon: React.ReactNode; label: string; count: number; sub: string; trend: "up" | "down" | "flat" }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-orange-600" : trend === "down" ? "text-emerald-600" : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">{icon} {label}</span>
          <TrendIcon className={`h-3.5 w-3.5 ${trendColor}`} />
        </div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">{count}</div>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
        </SelectContent>
      </Select>
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <Sparkles className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">No insights match your filters.</p>
        <p className="text-xs text-muted-foreground mt-1">Try widening the date range, site or theme type.</p>
      </CardContent>
    </Card>
  );
}

function InsightCard({
  insight, onOpen, onConfirm, onDismiss, onAction, onExport, onReview,
}: {
  insight: Insight;
  onOpen: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
  onAction: () => void;
  onExport: () => void;
  onReview: () => void;
}) {
  const isClosed = insight.status === "Confirmed" || insight.status === "Dismissed";
  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardContent className="pt-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                <Sparkles className="h-3 w-3 mr-1 text-primary" /> {isSignal(insight) ? "LogUp suggestion" : "Suggested attention"}
              </Badge>
              <Badge variant="outline" className={statusBadgeClasses[insight.status]}>{insight.status}</Badge>
              <Badge variant="outline" className={confidenceClasses[insight.confidence]}>
                {insight.confidence} confidence
              </Badge>
              <Badge variant="secondary">{insight.category}</Badge>
            </div>
            <h3 className="text-base font-semibold leading-tight">{insight.title}</h3>
            <p className="text-sm text-muted-foreground mt-1.5">{insight.summary}</p>

            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
              <Meta label="Site" value={insight.site} />
              <Meta label="Source records" value={`${insight.relatedCount}`} />
              <Meta label="Date range" value={`${fmt(insight.dateRangeStart)} → ${fmt(insight.dateRangeEnd)}`} />
              <Meta label="Owner" value={insight.assignedOwner || "Unassigned"} />
            </div>

            {insight.suggestedReview.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Why this appears</p>
                <ul className="text-xs text-foreground/80 list-disc pl-4 space-y-0.5">
                  {insight.suggestedReview.slice(0, 3).map((q, idx) => (<li key={idx}>{q}</li>))}
                </ul>
              </div>
            )}

            {isSignal(insight) && (
              <p className="mt-3 text-xs"><span className="text-muted-foreground">Based on:</span> {insight.basedOn}</p>
            )}
            {insight.relatedRecordIds.length > 0 && (
              <p className="mt-3 text-[11px] text-muted-foreground italic">
                Source records: {insight.relatedRecordIds.slice(0, 6).join(" · ")}
                {insight.relatedRecordIds.length > 6 ? ` +${insight.relatedRecordIds.length - 6} more` : ""} · Not a final compliance judgement.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 md:w-48 shrink-0">
            <Button size="sm" onClick={onOpen}>Review insight <ArrowRight className="h-4 w-4" /></Button>
            {!isClosed && (
              <>
                {insight.status === "New" && (
                  <Button size="sm" variant="outline" onClick={onReview}>Mark Under Review</Button>
                )}
                <Button size="sm" variant="outline" onClick={onAction}>Create action</Button>
                <Button size="sm" variant="outline" onClick={onConfirm}>
                  <CheckCircle2 className="h-4 w-4" /> Confirm pattern
                </Button>
                <Button size="sm" variant="ghost" onClick={onDismiss}>
                  <XCircle className="h-4 w-4" /> Dismiss
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={onExport}>
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground truncate">{value}</p>
    </div>
  );
}

function fmt(d: string) {
  try {
    return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch { return d; }
}

function InsightDetailDialog({
  insight, onClose, onConfirm, onDismiss, onAction, onExport, onOpenLinked,
}: {
  insight: Insight | null;
  onClose: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
  onAction: () => void;
  onExport: () => void;
  onOpenLinked: (recordId: string) => void;
}) {
  if (!insight) return null;
  return (
    <Dialog open={!!insight} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {isSignal(insight) ? "LogUp suggestion · calculated from live records" : "AI-assisted insight · requires manager review"}
          </div>
          <DialogTitle className="text-xl">{insight.title}</DialogTitle>
          <DialogDescription>
            {isSignal(insight)
              ? "Calculated by fixed LogUp rules from the linked records. It does not state a cause. A manager decides what, if anything, to do."
              : "This insight is AI-assisted and based on linked LogUp records. A manager must review before action is taken."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusBadgeClasses[insight.status]}>{insight.status}</Badge>
            <Badge variant="outline" className={confidenceClasses[insight.confidence]}>{insight.confidence} confidence</Badge>
            <Badge variant="secondary">{insight.type === "Resident" ? getTerms().Singular : insight.type}</Badge>
          </div>

          {isSignal(insight) && (
            <Section title="Based on">
              <p className="text-sm">{insight.basedOn}</p>
            </Section>
          )}
          {isSignal(insight) && insight.signalKind === "missing_service_user_link" && insight.eventId && (
            <MissingLinkResolver signal={insight} onDone={onClose} />
          )}

          <Section title={isSignal(insight) ? "Summary" : "AI-generated summary"}>
            <p className="text-sm">{insight.summary}</p>
          </Section>

          <Section title="Why this was surfaced">
            <p className="text-sm">{insight.whyItMatters}</p>
          </Section>

          <div className="grid md:grid-cols-2 gap-4">
            <Section title="Suggested review questions">
              <ul className="text-sm list-disc pl-4 space-y-1">
                {insight.suggestedReview.map((q, i) => (<li key={i}>{q}</li>))}
              </ul>
            </Section>
            <Section title="Suggested next actions">
              <ul className="text-sm list-disc pl-4 space-y-1">
                {insight.suggestedActions.map((q, i) => (<li key={i}>{q}</li>))}
              </ul>
            </Section>
          </div>

          <Section title="Linked source records">
            <div className="flex flex-wrap gap-2">
              {insight.relatedRecordIds.map((rid) => {
                const link = resolveLinkedRecord(rid);
                return (
                  <button
                    type="button"
                    key={rid}
                    onClick={() => onOpenLinked(rid)}
                    title={`Open ${link.moduleLabel} record ${rid}`}
                    className="inline-flex items-center gap-1 text-xs rounded-md border bg-secondary px-2 py-1 cursor-pointer hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                  >
                    {rid} <ExternalLink className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Open source — click a record above to jump straight to it in Events, Care Planning, Audits, Policy Hub, Workforce or Tasks.
              This insight is <span className="font-medium">not a final compliance judgement</span>.
            </p>
          </Section>


          <Section title="Status history">
            <ol className="text-sm space-y-2">
              {insight.auditTrail.map((a, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[150px]">
                    {new Date(a.at).toLocaleString()}
                  </span>
                  <span><span className="font-medium">{a.by}</span> — {a.event}</span>
                </li>
              ))}
            </ol>
          </Section>

          {insight.managerNotes && (
            <Section title="Manager notes">
              <p className="text-sm">{insight.managerNotes}</p>
            </Section>
          )}
          {insight.dismissedReason && (
            <Section title="Dismissal reason">
              <p className="text-sm">{insight.dismissedReason}</p>
            </Section>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {insight.status !== "Confirmed" && insight.status !== "Dismissed" && (
            <>
              <Button variant="outline" onClick={onAction}>Create action</Button>
              <Button variant="outline" onClick={onConfirm}>
                <CheckCircle2 className="h-4 w-4" /> Confirm pattern
              </Button>
              <Button variant="ghost" onClick={onDismiss}>
                <XCircle className="h-4 w-4" /> Dismiss
              </Button>
            </>
          )}
          <Button variant="outline" onClick={onExport}>
            <Download className="h-4 w-4" /> Export summary
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h4>
      {children}
    </div>
  );
}

function CreateActionDialog({
  insight, onClose, onCreate, defaultOwner,
}: {
  insight: Insight | null;
  onClose: () => void;
  onCreate: (id: string, owner: string, due: string, note: string) => void;
  defaultOwner: string;
}) {
  const [owner, setOwner] = useState(defaultOwner);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");

  if (!insight) return null;

  return (
    <Dialog open={!!insight} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create follow-up action</DialogTitle>
          <DialogDescription>
            Linked to insight <span className="font-medium">{insight.title}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Assigned owner</Label>
            <Input value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Manager note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder="Context, scope or any specific evidence to collect." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate(insight.id, owner, due, note)}>Create action</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DigestDialog({
  open, onClose, insights,
}: { open: boolean; onClose: () => void; insights: Insight[] }) {
  const newOnes = insights.filter((i) => i.isNewThisWeek);
  const overdue = insights.filter((i) => i.dueDate && new Date(i.dueDate) < new Date()
    && i.status !== "Confirmed" && i.status !== "Dismissed");
  const hotspots = insights.filter((i) => i.type === "Location");
  const gaps = insights.filter((i) => i.type === "Governance" || i.type === "Audit");

  const [recipients, setRecipients] = useState("leadership@example.org");
  const [summary, setSummary] = useState(
    `This week LogUp surfaced ${newOnes.length} new possible pattern${newOnes.length === 1 ? "" : "s"}, ` +
    `${hotspots.length} location hotspot${hotspots.length === 1 ? "" : "s"} and ${gaps.length} governance gap${gaps.length === 1 ? "" : "s"} for manager review.`,
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Draft AI-assisted leadership digest — requires approval before sending
          </div>
          <DialogTitle>Weekly leadership digest</DialogTitle>
          <DialogDescription>
            Preview, edit and choose recipients. Nothing is sent automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Summary</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
          </div>

          <DigestSection title="New possible patterns" items={newOnes.map((i) => i.title)} />
          <DigestSection title="Location hotspots" items={hotspots.map((i) => `${i.location} — ${i.relatedCount} records`)} />
          <DigestSection title="Governance & evidence gaps" items={gaps.map((i) => i.title)} />
          <DigestSection
            title="Overdue follow-up actions"
            items={overdue.map((i) => `${i.title} — due ${fmt(i.dueDate!)} (${i.assignedOwner ?? "unassigned"})`)}
          />

          <Separator />
          <div className="space-y-1.5">
            <Label>Recipients</Label>
            <Input value={recipients} onChange={(e) => setRecipients(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => toast.success("Digest exported as PDF (draft)")}>
            <Download className="h-4 w-4" /> Export PDF
          </Button>
          <Button variant="outline" onClick={() => toast.success("Saved to governance record")}>
            Save to governance record
          </Button>
          <Button onClick={() => { toast.success("Digest sent to recipients"); onClose(); }}>
            <Send className="h-4 w-4" /> Approve &amp; send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DigestSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        <FileWarning className="h-3.5 w-3.5" /> {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None this week.</p>
      ) : (
        <ul className="text-sm list-disc pl-4 space-y-0.5">
          {items.map((s, i) => (<li key={i}>{s}</li>))}
        </ul>
      )}
    </div>
  );
}

function MissingLinkResolver({ signal, onDone }: { signal: SignalInsight; onDone: () => void }) {
  const r = useRole();
  const terms = useTerms();
  const [suId, setSuId] = useState("");
  const [reason, setReason] = useState("");
  const siteId = signal.relatedSiteIds?.[0];
  const options = serviceUsersStore.all().filter((u) => u.siteId === siteId && u.status === "active");
  const canResolve = r.role === "admin" || isManagerRole(r.role);
  if (!canResolve) return null;
  return (
    <Section title="Resolve">
      <p className="text-xs text-muted-foreground mb-2">Nothing is linked until you choose. LogUp never links from the narrative.</p>
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={suId} onValueChange={setSuId}>
          <SelectTrigger className="w-64 h-8 text-xs"><SelectValue placeholder={`Choose ${terms.singular}`} /></SelectTrigger>
          <SelectContent>
            {options.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.serviceUserCode}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" disabled={!suId}
          onClick={() => {
            insightSignalsStore.linkServiceUser(signal.eventId!, suId, r.displayName, r.staffId);
            toast.success("Linked", { description: `${signal.eventId} is now linked.` });
            onDone();
          }}>Link</Button>
      </div>
      <div className="flex flex-wrap gap-2 items-center mt-2">
        <Input className="w-64 h-8 text-xs" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason it doesn't apply" />
        <Button size="sm" variant="ghost" disabled={reason.trim().length < 5}
          onClick={() => {
            insightSignalsStore.markNotApplicable(signal.eventId!, reason, r.displayName, r.staffId);
            toast.success("Marked as not applicable");
            onDone();
          }}>Not applicable</Button>
      </div>
    </Section>
  );
}
