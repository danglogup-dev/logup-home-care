import { useTerms } from "@/hooks/useTerms";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useCarePlans, formatDate, daysUntil, isPersonInScope, scopeLabel, SECTION_LABELS,
  type PersonSupported, type ReviewSuggestion,
} from "@/lib/carePlansStore";
import {
  useCarePlanApprovalChains, currentLevel, pendingApproversAtLevel, ruleLabel,
  type CarePlanApprovalInstance,
} from "@/lib/carePlanApprovalChainsStore";
import {
  useSpecialistContributions, CONTRIBUTION_STATUS_LABEL,
  type ContributionStatus, type SpecialistContribution,
} from "@/lib/specialistContributionsStore";
import { useRole } from "@/hooks/useRole";
import {
  Sparkles, Calendar, ArrowRight, MapPin, ShieldCheck, Clock, AlertTriangle,
  Stethoscope, Ban, FileText,
} from "lucide-react";

type TriggerSource = "ai" | "incident" | "specialist" | "manual";

const TRIGGER_BADGE: Record<TriggerSource, string> = {
  ai: "bg-primary/10 text-primary border-primary/20",
  incident: "bg-destructive/10 text-destructive border-destructive/20",
  specialist: "bg-emerald-50 text-emerald-800 border-emerald-200",
  manual: "bg-muted text-muted-foreground border-border",
};

const RISK_BADGE: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export default function ReviewsAndApprovals() {
  const role = useRole();
  const scopeInput = { role: role.role, scope: role.scope, unit: role.unit };
  const { people, plans, suggestions } = useCarePlans();
  const { instances } = useCarePlanApprovalChains();
  const contribs = useSpecialistContributions();

  const visiblePeople = useMemo(
    () => people.filter((p) => isPersonInScope(p, scopeInput)),
    [people, scopeInput],
  );
  const personById = useMemo(() => Object.fromEntries(visiblePeople.map((p) => [p.id, p])), [visiblePeople]);
  const visibleIds = useMemo(() => new Set(visiblePeople.map((p) => p.id)), [visiblePeople]);

  // filters
  const sites = Array.from(new Set(visiblePeople.map((p) => p.site))).sort();
  const units = Array.from(new Set(visiblePeople.map((p) => p.unit).filter(Boolean))) as string[];
  const [siteFilter, setSiteFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  // "Mine" filter — for managers, default on: only show approvals where the current
  // user is listed as an approver in the chain snapshot.
  const [mineOnly, setMineOnly] = useState<boolean>(role.role === "manager");
  const isMineApproval = (instance: { chainSnapshot?: { levels?: { approvers?: { name: string }[] }[] } }): boolean => {
    const me = role.displayName.trim().toLowerCase();
    if (!me) return false;
    const levels = instance.chainSnapshot?.levels ?? [];
    return levels.some((l) => (l.approvers ?? []).some((a) => a.name.trim().toLowerCase() === me));
  };

  const personMatchesFilters = (p?: PersonSupported) => {
    if (!p) return false;
    if (siteFilter !== "all" && p.site !== siteFilter) return false;
    if (unitFilter !== "all" && p.unit !== unitFilter) return false;
    if (riskFilter !== "all" && p.riskLevel !== riskFilter) return false;
    return true;
  };
  const inDateRange = (iso?: string) => {
    if (!iso) return true;
    const t = new Date(iso).getTime();
    if (fromDate && t < new Date(fromDate).getTime()) return false;
    if (toDate && t > new Date(toDate).getTime()) return false;
    return true;
  };
  const matchesReason = (r: TriggerSource) => reasonFilter === "all" || reasonFilter === r;
  const matchesOwner = (owner?: string) =>
    !ownerFilter.trim() || (owner ?? "").toLowerCase().includes(ownerFilter.trim().toLowerCase());
  const matchesStatus = (s: string) => statusFilter === "all" || statusFilter === s;

  // ------- Approval Queue -------
  const approvalRows = useMemo(() => {
    return instances
      .filter((i) => i.status === "awaiting_approval" && visibleIds.has(i.personId))
      .map((i) => {
        const person = personById[i.personId];
        const plan = plans.find((pl) => pl.personId === i.personId);
        const version = plan?.versions.find((v) => v.id === i.carePlanId);
        const suggestion = version?.sourceSuggestionId
          ? suggestions.find((s) => s.id === version.sourceSuggestionId)
          : undefined;
        const linkedContribution = contribs.contributions.find(
          (c) => c.linkedDraftVersionNumber === i.carePlanVersion && c.personId === i.personId,
        );
        let trigger: TriggerSource = "manual";
        let triggerLabel = "Manual update";
        if (linkedContribution) {
          trigger = "specialist";
          triggerLabel = `${linkedContribution.contributorName} · ${linkedContribution.profession}`;
        } else if (suggestion?.sourceIncidentId) {
          trigger = "incident";
          triggerLabel = suggestion.sourceIncidentId;
        } else if (version?.aiAssisted) {
          trigger = "ai";
          triggerLabel = "AI-drafted";
        }
        const owner = person ? `${person.site}${person.unit ? ` · ${person.unit}` : ""}` : "";
        return { i, person, version, trigger, triggerLabel, owner };
      })
      .filter(({ person, i }) => personMatchesFilters(person) && matchesReason(person ? triggerFor(i, plans, suggestions, contribs.contributions) : "manual") && inDateRange(i.startedAt) && matchesStatus("awaiting") && (!mineOnly || isMineApproval(i)));
  }, [instances, plans, suggestions, contribs.contributions, personById, visibleIds, siteFilter, unitFilter, riskFilter, reasonFilter, statusFilter, fromDate, toDate, mineOnly, role.displayName]);

  // ------- Due Soon & Overdue -------
  const scheduledRows = useMemo(() => {
    const rows = visiblePeople.map((p) => {
      const plan = plans.find((pl) => pl.personId === p.id);
      const d = daysUntil(plan?.nextReviewDue);
      return { person: p, plan, days: d };
    }).filter((r) => r.days !== null);
    return rows;
  }, [visiblePeople, plans]);

  const dueSoon = scheduledRows
    .filter((r) => r.days !== null && r.days >= 0 && r.days <= 90)
    .filter((r) => personMatchesFilters(r.person) && matchesReason("manual") === false ? matchesReason("manual") || reasonFilter === "all" : true)
    .filter((r) => reasonFilter === "all" || reasonFilter === "manual")
    .filter((r) => inDateRange(r.plan?.nextReviewDue))
    .sort((a, b) => (a.days! - b.days!));

  const overdue = scheduledRows
    .filter((r) => r.days !== null && r.days < 0)
    .filter((r) => personMatchesFilters(r.person))
    .filter((r) => reasonFilter === "all" || reasonFilter === "manual")
    .filter((r) => inDateRange(r.plan?.nextReviewDue))
    .sort((a, b) => (a.days! - b.days!));

  // ------- Incident-linked -------
  const incidentLinked = useMemo(() => suggestions
    .filter((s) => s.sourceIncidentId && visibleIds.has(s.personId))
    .filter((s) => reasonFilter === "all" || reasonFilter === "incident")
    .map((s) => ({ s, person: personById[s.personId] }))
    .filter(({ person }) => personMatchesFilters(person))
    .filter(({ s }) => inDateRange(s.createdAt))
    .filter(({ s }) => matchesStatus(s.status)),
  [suggestions, personById, visibleIds, siteFilter, unitFilter, riskFilter, reasonFilter, statusFilter, fromDate, toDate]);

  // ------- Specialist-triggered -------
  const specialistTriggered = useMemo(() => contribs.contributions
    .filter((c) => visibleIds.has(c.personId))
    .filter((c) => reasonFilter === "all" || reasonFilter === "specialist")
    .map((c) => ({ c, person: personById[c.personId] }))
    .filter(({ person }) => personMatchesFilters(person))
    .filter(({ c }) => inDateRange(c.submittedAt)),
  [contribs.contributions, personById, visibleIds, siteFilter, unitFilter, riskFilter, reasonFilter, fromDate, toDate]);

  // ------- Blocked / Needs Info -------
  const blockedItems = useMemo(() => {
    const items: BlockedItem[] = [];
    // 1. Drafts ready_for_approval with no active approval instance -> missing chain
    for (const plan of plans) {
      const person = personById[plan.personId];
      if (!person) continue;
      for (const v of plan.versions) {
        if (v.status === "ready_for_approval") {
          const hasInstance = instances.some((i) => i.carePlanId === v.id);
          if (!hasInstance) {
            items.push({
              key: `chain-${v.id}`,
              person, reason: "Missing approval chain",
              detail: `Draft v${v.versionNumber} has no approval chain assigned.`,
              date: v.createdAt,
              action: `/app/care-plans/people/${person.id}?tab=drafts`,
            });
          }
        }
        if (v.status === "draft_in_progress") {
          items.push({
            key: `notready-${v.id}`,
            person, reason: "Draft not ready",
            detail: v.dueBy
              ? `First care plan from admission. ${v.dueRuleLabel} (due ${new Date(v.dueBy).toLocaleString()}; ${v.dueRuleSource}).`
              : `Draft v${v.versionNumber} still in progress. Human review confirmation required before submission.`,
            date: v.createdAt,
            action: `/app/care-plans/people/${person.id}?tab=drafts`,
          });
        }
      }
    }
    // 2. Contributions awaiting clarification
    for (const c of contribs.contributions) {
      if (!visibleIds.has(c.personId)) continue;
      if (c.status === "clarification_requested") {
        const person = personById[c.personId];
        items.push({
          key: `clarify-${c.id}`,
          person: person!, reason: "Missing specialist clarification",
          detail: `${c.contributorName} (${c.profession}) — awaiting response.`,
          date: c.submittedAt,
          action: `/app/care-plans/people/${c.personId}?tab=contributors`,
        });
      }
    }
    return items
      .filter((it) => personMatchesFilters(it.person))
      .filter((it) => inDateRange(it.date))
      .filter((it) => matchesStatus("blocked"))
      .filter(() => reasonFilter === "all" || reasonFilter === "manual" || reasonFilter === "specialist");
  }, [plans, instances, contribs.contributions, personById, visibleIds, siteFilter, unitFilter, riskFilter, reasonFilter, statusFilter, fromDate, toDate]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Reviews &amp; Approvals</h1>
          <Badge variant="outline" className="gap-1 bg-secondary/60">
            <MapPin className="h-3 w-3" /> Viewing: {scopeLabel(scopeInput)}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          One place for care plan approval queues, scheduled reviews, incident-linked prompts, specialist-triggered updates and blocked items.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Awaiting approval" value={approvalRows.length} tone="amber" />
        <Stat label="Due ≤ 90 days" value={dueSoon.length} tone="muted" />
        <Stat label="Overdue" value={overdue.length} tone="rose" />
        <Stat label="Incident-linked" value={incidentLinked.length} tone="rose" />
        <Stat label="Specialist input" value={specialistTriggered.length} tone="emerald" />
        <Stat label="Blocked" value={blockedItems.length} tone="amber" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <FilterBlock label="Site">
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  {sites.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </FilterBlock>
            <FilterBlock label="Risk">
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All risks</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </FilterBlock>
            <FilterBlock label="Review reason">
              <Select value={reasonFilter} onValueChange={setReasonFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reasons</SelectItem>
                  <SelectItem value="manual">Scheduled / manual</SelectItem>
                  <SelectItem value="ai">AI-triggered</SelectItem>
                  <SelectItem value="incident">Incident-linked</SelectItem>
                  <SelectItem value="specialist">Specialist</SelectItem>
                </SelectContent>
              </Select>
            </FilterBlock>
            <FilterBlock label="Status">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="awaiting">Awaiting approval</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="actioned">Actioned</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </FilterBlock>
            <FilterBlock label="Owner">
              <Input className="w-40" placeholder="Site / unit" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} />
            </FilterBlock>
            <FilterBlock label="From"><Input type="date" className="w-40" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></FilterBlock>
            <FilterBlock label="To"><Input type="date" className="w-40" value={toDate} onChange={(e) => setToDate(e.target.value)} /></FilterBlock>
            {role.role === "manager" && (
              <FilterBlock label="Scope">
                <Button
                  size="sm"
                  variant={mineOnly ? "default" : "outline"}
                  onClick={() => setMineOnly((v) => !v)}
                  className="h-9"
                  title="Only show approvals where you are named in the chain"
                >
                  {mineOnly ? "Mine only" : "All approvals"}
                </Button>
              </FilterBlock>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="approval">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="approval">Approval Queue ({approvalRows.length})</TabsTrigger>
          <TabsTrigger value="overdue">Overdue ({overdue.length})</TabsTrigger>
          <TabsTrigger value="due">Due Soon ({dueSoon.length})</TabsTrigger>
          <TabsTrigger value="incident">Incident-linked ({incidentLinked.length})</TabsTrigger>
          <TabsTrigger value="specialist">Specialist-triggered ({specialistTriggered.length})</TabsTrigger>
          <TabsTrigger value="blocked">Blocked ({blockedItems.length})</TabsTrigger>
        </TabsList>

        {/* 1 — Approval Queue */}
        <TabsContent value="approval" className="mt-4">
          <ApprovalQueueTable rows={approvalRows.filter(r => matchesOwner(r.owner))} />
        </TabsContent>

        {/* 2 — Overdue */}
        <TabsContent value="overdue" className="mt-4">
          <ScheduledTable rows={overdue.filter(r => matchesOwner(`${r.person.site} ${r.person.unit ?? ""}`))} kind="overdue" />
        </TabsContent>

        {/* 3 — Due Soon */}
        <TabsContent value="due" className="mt-4">
          <ScheduledTable rows={dueSoon.filter(r => matchesOwner(`${r.person.site} ${r.person.unit ?? ""}`))} kind="due" />
        </TabsContent>

        {/* PART 4 — Incident-linked */}
        <TabsContent value="incident" className="mt-4">
          <IncidentTable rows={incidentLinked.filter(r => matchesOwner(`${r.person?.site} ${r.person?.unit ?? ""}`))} />
        </TabsContent>

        {/* PART 5 — Specialist-triggered */}
        <TabsContent value="specialist" className="mt-4">
          <SpecialistTable rows={specialistTriggered.filter(r => matchesOwner(`${r.person?.site} ${r.person?.unit ?? ""}`))} />
        </TabsContent>

        {/* PART 6 — Blocked / Needs Info */}
        <TabsContent value="blocked" className="mt-4">
          <BlockedTable rows={blockedItems.filter(r => matchesOwner(`${r.person.site} ${r.person.unit ?? ""}`))} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------- helpers -------- */

function triggerFor(
  i: CarePlanApprovalInstance,
  plans: ReturnType<typeof useCarePlans>["plans"],
  suggestions: ReturnType<typeof useCarePlans>["suggestions"],
  contributions: SpecialistContribution[],
): TriggerSource {
  const plan = plans.find((p) => p.personId === i.personId);
  const version = plan?.versions.find((v) => v.id === i.carePlanId);
  const linked = contributions.find(
    (c) => c.linkedDraftVersionNumber === i.carePlanVersion && c.personId === i.personId,
  );
  if (linked) return "specialist";
  const s = version?.sourceSuggestionId ? suggestions.find((x) => x.id === version.sourceSuggestionId) : undefined;
  if (s?.sourceIncidentId) return "incident";
  if (version?.aiAssisted) return "ai";
  return "manual";
}

/* -------- Approval Queue table -------- */

type ApprovalRow = {
  i: CarePlanApprovalInstance;
  person?: PersonSupported;
  version?: { versionNumber: number };
  trigger: TriggerSource;
  triggerLabel: string;
  owner: string;
};

function ApprovalQueueTable({ rows }: { rows: ApprovalRow[] }) {
  const terms = useTerms();
  if (rows.length === 0) return <Empty label="No care plans awaiting approval in scope." />;
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{terms.Singular}</TableHead>
              <TableHead>Site / unit</TableHead>
              <TableHead>Draft</TableHead>
              <TableHead>Current approval level</TableHead>
              <TableHead>Pending approvers</TableHead>
              <TableHead>Days waiting</TableHead>
              <TableHead>Source</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ i, person, trigger, triggerLabel }) => {
              const level = currentLevel(i);
              const pending = pendingApproversAtLevel(i);
              const days = Math.max(0, Math.floor((Date.now() - new Date(i.startedAt).getTime()) / 86400000));
              return (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link to={`/app/care-plans/people/${person?.id}`} className="font-medium hover:underline">{person?.name ?? i.personId}</Link>
                  </TableCell>
                  <TableCell className="text-sm">{person?.site}{person?.unit ? ` · ${person.unit}` : ""}</TableCell>
                  <TableCell className="text-sm">v{i.carePlanVersion}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">Level {i.currentLevelNumber} of {i.chainSnapshot.levels.length} — {level?.levelName}</div>
                    <div className="text-xs text-muted-foreground">{level ? ruleLabel(level.rule) : ""}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {pending.map((a) => <div key={a.id}>{a.name}{a.roleLabel ? ` — ${a.roleLabel}` : ""}</div>)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap"><Clock className="inline h-3 w-3 mr-1 text-muted-foreground" />{days}d</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={TRIGGER_BADGE[trigger]}>{trigger}</Badge>
                    <div className="text-[11px] text-muted-foreground mt-1">{triggerLabel}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/app/care-plans/people/${person?.id}?tab=drafts`}>Review <ArrowRight className="h-3 w-3 ml-1" /></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* -------- Scheduled (Due / Overdue) -------- */

function ScheduledTable({ rows, kind }: { rows: { person: PersonSupported; plan?: { nextReviewDue: string }; days: number | null }[]; kind: "due" | "overdue" }) {
  const terms = useTerms();
  if (rows.length === 0) return <Empty label={kind === "due" ? "No reviews due in the next 90 days." : "No overdue reviews."} />;
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{terms.Singular}</TableHead>
              <TableHead>Site / unit</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>{kind === "due" ? "Due date" : "Days overdue"}</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.person.id}>
                <TableCell><Link to={`/app/care-plans/people/${r.person.id}`} className="font-medium hover:underline">{r.person.name}</Link></TableCell>
                <TableCell className="text-sm">{r.person.site}{r.person.unit ? ` · ${r.person.unit}` : ""}</TableCell>
                <TableCell><Badge variant="outline" className={RISK_BADGE[r.person.riskLevel]}>{r.person.riskLevel}</Badge></TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {kind === "due"
                    ? <><Calendar className="inline h-3 w-3 mr-1 text-muted-foreground" />{formatDate(r.plan?.nextReviewDue)} <span className="text-xs text-muted-foreground">({r.days}d)</span></>
                    : <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20"><AlertTriangle className="h-3 w-3 mr-1" />{Math.abs(r.days!)}d overdue</Badge>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.person.site}{r.person.unit ? ` · ${r.person.unit}` : ""}</TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline"><Link to={`/app/care-plans/people/${r.person.id}`}>Open <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* -------- Incident-linked -------- */

function IncidentTable({ rows }: { rows: { s: ReviewSuggestion; person?: PersonSupported }[] }) {
  const terms = useTerms();
  if (rows.length === 0) return <Empty label="No incident-linked review prompts." />;
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{terms.Singular}</TableHead>
              <TableHead>Incident</TableHead>
              <TableHead>Suggested sections</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Raised</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ s, person }) => (
              <TableRow key={s.id}>
                <TableCell><Link to={`/app/care-plans/people/${person?.id}`} className="font-medium hover:underline">{person?.name ?? s.personId}</Link></TableCell>
                <TableCell className="text-sm">
                  <Sparkles className="inline h-3 w-3 mr-1 text-primary" />{s.sourceIncidentId}
                </TableCell>
                <TableCell className="text-xs">
                  <div className="flex flex-wrap gap-1">
                    {s.suggestedSections.map((k) => <Badge key={k} variant="secondary">{SECTION_LABELS[k]}</Badge>)}
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{s.status}</Badge></TableCell>
                <TableCell className="text-sm whitespace-nowrap">{formatDate(s.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline"><Link to={`/app/care-plans/people/${person?.id}`}>Open <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* -------- Specialist-triggered -------- */

function SpecialistTable({ rows }: { rows: { c: SpecialistContribution; person?: PersonSupported }[] }) {
  const terms = useTerms();
  if (rows.length === 0) return <Empty label="No specialist-triggered reviews." />;
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{terms.Singular}</TableHead>
              <TableHead>Specialist</TableHead>
              <TableHead>Profession</TableHead>
              <TableHead>Sections affected</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ c, person }) => (
              <TableRow key={c.id}>
                <TableCell><Link to={`/app/care-plans/people/${person?.id}`} className="font-medium hover:underline">{person?.name ?? c.personId}</Link></TableCell>
                <TableCell className="text-sm"><Stethoscope className="inline h-3 w-3 mr-1 text-primary" />{c.contributorName}</TableCell>
                <TableCell className="text-sm">{c.profession}</TableCell>
                <TableCell className="text-xs">
                  <div className="flex flex-wrap gap-1">
                    {c.affectedSections.map((k) => <Badge key={k} variant="secondary">{SECTION_LABELS[k as keyof typeof SECTION_LABELS] ?? k}</Badge>)}
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{CONTRIBUTION_STATUS_LABEL[c.status as ContributionStatus]}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/app/care-plans/people/${person?.id}?tab=contributors`}>Open <ArrowRight className="h-3 w-3 ml-1" /></Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* -------- Blocked / Needs Info -------- */

type BlockedItem = {
  key: string;
  person: PersonSupported;
  reason: string;
  detail: string;
  date?: string;
  action: string;
};

function BlockedTable({ rows }: { rows: BlockedItem[] }) {
  const terms = useTerms();
  if (rows.length === 0) return <Empty label="Nothing blocked. All reviews can progress." />;
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{terms.Singular}</TableHead>
              <TableHead>Site / unit</TableHead>
              <TableHead>Blocked reason</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead>Since</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell><Link to={`/app/care-plans/people/${r.person.id}`} className="font-medium hover:underline">{r.person.name}</Link></TableCell>
                <TableCell className="text-sm">{r.person.site}{r.person.unit ? ` · ${r.person.unit}` : ""}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                    <Ban className="h-3 w-3 mr-1" />{r.reason}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.detail}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{r.date ? formatDate(r.date) : "—"}</TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline"><Link to={r.action}>Open <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* -------- shared -------- */

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-sm text-muted-foreground text-center border border-dashed rounded-lg py-10">{label}</div>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "amber" | "emerald" | "rose" | "muted" }) {
  const cls = {
    amber: "text-amber-800",
    emerald: "text-emerald-800",
    rose: "text-destructive",
    muted: "text-foreground",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-3xl font-semibold mt-2 ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
