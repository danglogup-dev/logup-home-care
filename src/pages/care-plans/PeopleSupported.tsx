import { useTerms } from "@/hooks/useTerms";
import { isSuggestionOverdue } from "@/components/care-plans/CarePlanReviewSuggestionBanner";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useCarePlans, formatDate, daysUntil, statusLabel,
  getVisiblePeople, scopeLabel, isKeyWorkerFor,
} from "@/lib/carePlansStore";
import { useSpecialistContributions } from "@/lib/specialistContributionsStore";
import { useRole } from "@/hooks/useRole";
import { useMemo, useState } from "react";
import { Search, MapPin, Plus, X, SlidersHorizontal, ChevronDown, Star } from "lucide-react";

const SITES = ["East Cork", "West Waterford", "West Waterford"] as const;

function riskBadge(level: "low" | "medium" | "high") {
  const map = {
    low: "bg-emerald-100 text-emerald-800 border-emerald-200",
    medium: "bg-amber-100 text-amber-800 border-amber-200",
    high: "bg-destructive/10 text-destructive border-destructive/20",
  } as const;
  return <Badge variant="outline" className={`capitalize ${map[level]}`}>{level}</Badge>;
}

type ReviewStatus = "any" | "overdue" | "due30" | "ok";
type PlanStatus = "any" | "published" | "draft" | "none";
type ApprovalStatus = "any" | "awaiting" | "clean";
type SpecialistPending = "any" | "pending" | "none";
type RiskFilter = "any" | "low" | "medium" | "high";

/** Priority-ordered badge tones. Lower index = higher priority. */
type BadgeTone = "warn" | "info" | "muted" | "primary";

export default function PeopleSupported() {
  const terms = useTerms();
  const { people, plans, suggestions, followUps } = useCarePlans();
  const specialist = useSpecialistContributions();
  const role = useRole();
  const navigate = useNavigate();
  const scopeInput = { role: role.role, scope: role.scope, unit: role.unit };

  const [q, setQ] = useState("");
  const [site, setSite] = useState<string>("any");
  const [unit, setUnit] = useState<string>("any");
  const [risk, setRisk] = useState<RiskFilter>("any");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("any");
  const [planStatus, setPlanStatus] = useState<PlanStatus>("any");
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>("any");
  const [specialistPending, setSpecialistPending] = useState<SpecialistPending>("any");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const isKeyWorker = role.presetId === "frontline-keyworker";
  const [myAssignments, setMyAssignments] = useState<boolean>(isKeyWorker);

  const visible = useMemo(() => getVisiblePeople(people, scopeInput), [people, scopeInput]);
  const unitOptions = useMemo(() => {
    const set = new Set<string>();
    visible.forEach((p) => { if (p.unit && (site === "any" || p.site === site)) set.add(p.unit); });
    return Array.from(set).sort();
  }, [visible, site]);

  const rows = useMemo(() => visible
    .map((p) => {
      const plan = plans.find((pl) => pl.personId === p.id);
      const current = plan?.versions.find((v) => v.id === plan.currentVersionId);
      const draftV = plan?.versions.find((v) => v.status === "draft_in_progress" || v.status === "ready_for_approval");
      const openSug = suggestions.filter((s) => s.personId === p.id && s.status === "open").length;
      const openTasks = followUps.filter((f) => f.personId === p.id && f.status !== "dismissed").length;
      const pendingSpecialist = specialist.contributions.filter(
        (c) => c.personId === p.id && (c.status === "submitted" || c.status === "under_manager_review" || c.status === "clarification_requested"),
      ).length;
      const nextDays = daysUntil(plan?.nextReviewDue);
      // Evidence missing = published plan has a section marked evidenceRequired but with a thin/empty body.
      const evidenceMissing = !!current?.sections.some(
        (s) => s.evidenceRequired === true && (!s.body || s.body.trim().length < 20),
      );
      const mine = isKeyWorkerFor(p, role.staffId);
      return { person: p, plan, current, draftV, openSug, openTasks, pendingSpecialist, nextDays, evidenceMissing, mine };
    })
    .filter(({ person, plan, current, draftV, pendingSpecialist, nextDays, mine }) => {
      if (myAssignments && !mine) return false;
      if (q) {
        const s = q.toLowerCase();
        if (!person.name.toLowerCase().includes(s) && !person.site.toLowerCase().includes(s) && !(person.unit || "").toLowerCase().includes(s)) return false;
      }
      if (site !== "any" && person.site !== site) return false;
      if (unit !== "any" && person.unit !== unit) return false;
      if (risk !== "any" && person.riskLevel !== risk) return false;
      if (reviewStatus === "overdue" && !(nextDays !== null && nextDays < 0)) return false;
      if (reviewStatus === "due30" && !(nextDays !== null && nextDays >= 0 && nextDays <= 30)) return false;
      if (reviewStatus === "ok" && !(nextDays !== null && nextDays > 30)) return false;
      if (planStatus === "published" && current?.status !== "published") return false;
      if (planStatus === "draft" && !draftV) return false;
      if (planStatus === "none" && !!current) return false;
      if (approvalStatus === "awaiting" && !(draftV && draftV.status === "ready_for_approval")) return false;
      if (approvalStatus === "clean" && !!(draftV && draftV.status === "ready_for_approval")) return false;
      if (specialistPending === "pending" && pendingSpecialist === 0) return false;
      if (specialistPending === "none" && pendingSpecialist > 0) return false;
      // Suppress unused variables
      void plan;
      return true;
    })
    // Sort assigned people to top when "Your assignments" is on
    .sort((a, b) => (myAssignments ? Number(b.mine) - Number(a.mine) : 0)),
    [visible, plans, suggestions, followUps, specialist.contributions, q, site, unit, risk,
     reviewStatus, planStatus, approvalStatus, specialistPending, myAssignments, role.displayName],
  );

  const readOnly = role.role === "frontline" || role.role === "viewonly";
  const advancedActive = planStatus !== "any" || approvalStatus !== "any" || specialistPending !== "any" || unit !== "any";
  const activeCount = [
    q ? 1 : 0,
    site !== "any" ? 1 : 0,
    unit !== "any" ? 1 : 0,
    risk !== "any" ? 1 : 0,
    reviewStatus !== "any" ? 1 : 0,
    planStatus !== "any" ? 1 : 0,
    approvalStatus !== "any" ? 1 : 0,
    specialistPending !== "any" ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const resetFilters = () => {
    setQ(""); setSite("any"); setUnit("any"); setRisk("any");
    setReviewStatus("any"); setPlanStatus("any");
    setApprovalStatus("any"); setSpecialistPending("any");
  };

  /** Choose the default tab query for a row, based on role and pending action. */
  const defaultTabFor = (draftV: { status: string } | undefined): string => {
    const actionPending = !!(draftV && draftV.status === "ready_for_approval");
    switch (role.role) {
      case "frontline":
        return isKeyWorker ? "plan" : "glance";
      case "manager":
        return actionPending ? "drafts" : "plan";
      case "admin":
      case "viewonly":
      default:
        return "plan";
    }
  };
  const openRow = (personId: string, draftV: { status: string } | undefined) => {
    navigate(`/app/care-plans/people/${personId}?tab=${defaultTabFor(draftV)}`);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Care Plans</h1>
            <Badge variant="outline" className="gap-1 bg-secondary/60">
              <MapPin className="h-3 w-3" /> Viewing: {scopeLabel(scopeInput)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {readOnly
              ? `View ${terms.plural} and their current approved care plans within your scope.`
              : `${terms.Plural} and their current care plans. Open a person to view, add draft updates, or manage contributors.`}
          </p>
        </div>
        {!readOnly && (
          <Button asChild>
            <Link to="/app/care-plans/create"><Plus className="mr-1 h-4 w-4" /> New Care Plan</Link>
          </Button>
        )}
      </div>

      {/* Toolbar: search + collapsible filters + assignments toggle */}
      <Card>
        <CardContent className="p-3 md:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search person or site…" className="pl-9 h-9" />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-4 w-4 mr-1" /> Filters
              {activeCount > 0 && <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{activeCount}</Badge>}
              <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </Button>
            <div className="flex items-center gap-2 pl-1">
              <Switch id="mine" checked={myAssignments} onCheckedChange={setMyAssignments} />
              <Label htmlFor="mine" className="text-sm cursor-pointer flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-muted-foreground" /> Your assignments
              </Label>
            </div>
            <div className="ml-auto text-xs text-muted-foreground">
              {rows.length} match{rows.length === 1 ? "" : "es"}
            </div>
          </div>

          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleContent className="space-y-3 pt-1">
              {/* Default filters — always visible when panel is open */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <Select value={site} onValueChange={(v) => { setSite(v); setUnit("any"); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Site" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">All sites</SelectItem>
                    {SITES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={risk} onValueChange={(v) => setRisk(v as RiskFilter)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Risk level" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any risk</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={reviewStatus} onValueChange={(v) => setReviewStatus(v as ReviewStatus)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Review status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any review status</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="due30">Due in 30 days</SelectItem>
                    <SelectItem value="ok">On schedule</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Advanced filters */}
              <Collapsible open={advancedOpen || advancedActive} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
                    <ChevronDown className={`h-3.5 w-3.5 mr-1 transition-transform ${advancedOpen || advancedActive ? "rotate-180" : ""}`} />
                    More filters
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    <Select value={planStatus} onValueChange={(v) => setPlanStatus(v as PlanStatus)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Care plan status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any plan status</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="draft">Has draft</SelectItem>
                        <SelectItem value="none">No plan</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={approvalStatus} onValueChange={(v) => setApprovalStatus(v as ApprovalStatus)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Approval status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any approval status</SelectItem>
                        <SelectItem value="awaiting">Awaiting approval</SelectItem>
                        <SelectItem value="clean">No pending approval</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={specialistPending} onValueChange={(v) => setSpecialistPending(v as SpecialistPending)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Specialist input pending" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any specialist status</SelectItem>
                        <SelectItem value="pending">Pending review</SelectItem>
                        <SelectItem value="none">None pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {activeCount > 0 && (
                <div className="flex items-center justify-end">
                  <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs">
                    <X className="h-3 w-3 mr-1" /> Reset filters
                  </Button>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <TooltipProvider delayDuration={200}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%]">{terms.Singular}</TableHead>
                  <TableHead className="w-[18%]">Site</TableHead>
                  <TableHead className="w-[14%]">Current approved plan</TableHead>
                  <TableHead className="w-[8%]">Risk</TableHead>
                  <TableHead className="w-[13%]">Next review</TableHead>
                  <TableHead>Attention needed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ person, plan, current, draftV, openSug, openTasks, pendingSpecialist, nextDays, evidenceMissing, mine }) => {
                  // Build in priority order: Overdue > Awaiting approval > High risk >
                  // Specialist input pending > Evidence missing > Tasks open > Review due soon.
                  const badges: Array<{ key: string; label: string; tone: BadgeTone }> = [];
                  if (nextDays !== null && nextDays < 0) badges.push({ key: "overdue", label: `Overdue ${Math.abs(nextDays)}d`, tone: "warn" });
                  if (draftV && draftV.status === "ready_for_approval") badges.push({ key: "await", label: "Awaiting approval", tone: "warn" });
                  if (person.riskLevel === "high") badges.push({ key: "high", label: "High risk", tone: "warn" });
                  if (pendingSpecialist > 0) badges.push({ key: "spec", label: "Specialist input pending", tone: "primary" });
                  if (evidenceMissing) badges.push({ key: "evidence", label: "Evidence missing", tone: "primary" });
                  if (openTasks > 0) badges.push({ key: "tasks", label: `${openTasks} task${openTasks === 1 ? "" : "s"} open`, tone: "muted" });
                  if (nextDays !== null && nextDays >= 0 && nextDays <= 30) badges.push({ key: "duesoon", label: `Review due in ${nextDays}d`, tone: "info" });
                  if (draftV && draftV.status === "draft_in_progress") badges.push({ key: "draft", label: "Draft in progress", tone: "info" });
                  if (openSug > 0) badges.push({ key: "sug", label: `${openSug} review prompt${openSug === 1 ? "" : "s"}`, tone: "primary" });

                  const shown = badges.slice(0, 2);
                  const extra = badges.slice(2);

                  return (
                    <TableRow
                      key={person.id}
                      className="cursor-pointer hover:bg-accent/40 align-top"
                      onClick={() => openRow(person.id, draftV)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {mine && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Star className="h-3.5 w-3.5 text-primary fill-primary" />
                              </TooltipTrigger>
                              <TooltipContent>Your assignment · Key worker</TooltipContent>
                            </Tooltip>
                          )}
                          <span className="font-medium whitespace-nowrap">{person.name}</span>
                        </div>
                        {suggestions.some((s) => s.personId === person.id && isSuggestionOverdue(s)) && (
                          <div className="text-xs font-medium text-destructive">Review suggestion overdue</div>
                        )}
                        <div className="text-xs text-muted-foreground">{person.id}</div>
                      </TableCell>
                      <TableCell>
                        <div className="whitespace-nowrap">{person.site}</div>
                        {person.unit && <div className="text-xs text-muted-foreground whitespace-nowrap">{person.unit}</div>}
                      </TableCell>
                      <TableCell>
                        {current
                          ? <Badge variant="outline" className="whitespace-nowrap">v{current.versionNumber} · {statusLabel(current.status)}</Badge>
                          : <span className="text-muted-foreground text-sm">No plan</span>}
                      </TableCell>
                      <TableCell>{riskBadge(person.riskLevel)}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(plan?.nextReviewDue) || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {badges.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Up to date</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 items-center">
                            {shown.map((b) => <AttentionBadge key={b.key} label={b.label} tone={b.tone} />)}
                            {extra.length > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="text-[11px] font-normal cursor-help">+{extra.length} more</Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <div className="flex flex-col gap-1">
                                    {extra.map((b) => (
                                      <div key={b.key} className="text-xs">• {b.label}</div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {myAssignments
                        ? "No people are assigned to you within the current filters."
                        : "No people match the current filters."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  );
}

function AttentionBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  const cls = {
    warn: "bg-amber-100 text-amber-800 border-amber-200",
    info: "bg-sky-100 text-sky-800 border-sky-200",
    muted: "bg-secondary text-foreground/70 border-border",
    primary: "bg-primary/10 text-primary border-primary/20",
  }[tone];
  return <Badge variant="outline" className={`text-[11px] font-normal whitespace-nowrap ${cls}`}>{label}</Badge>;
}
