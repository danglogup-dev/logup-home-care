import { useTerms } from "@/hooks/useTerms";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import { MapPin, Download, ArrowRight, AlertTriangle, ShieldCheck, Stethoscope, FileText, Archive } from "lucide-react";
import {
  useCarePlans, formatDate, daysUntil, statusLabel, getVisiblePeople, scopeLabel, SECTION_LABELS,
  type PersonSupported, type CarePlanVersion,
} from "@/lib/carePlansStore";
import {
  useCarePlanApprovalChains, currentLevel, pendingApproversAtLevel,
} from "@/lib/carePlanApprovalChainsStore";
import {
  useSpecialistContributions, CONTRIBUTION_STATUS_LABEL,
} from "@/lib/specialistContributionsStore";
import { useRole } from "@/hooks/useRole";

export default function Reporting() {
  const role = useRole();
  const scopeInput = { role: role.role, scope: role.scope, unit: role.unit };
  const { people, plans, suggestions } = useCarePlans();
  const { instances } = useCarePlanApprovalChains();
  const contribs = useSpecialistContributions();
  const visiblePeople = getVisiblePeople(people, scopeInput);
  const visibleIds = new Set(visiblePeople.map((p) => p.id));

  // Filters
  const sites = Array.from(new Set(visiblePeople.map((p) => p.site))).sort();
  const units = Array.from(new Set(visiblePeople.map((p) => p.unit).filter(Boolean))) as string[];
  const [siteFilter, setSiteFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filteredPeople = useMemo(() => visiblePeople.filter((p) => {
    if (siteFilter !== "all" && p.site !== siteFilter) return false;
    if (unitFilter !== "all" && p.unit !== unitFilter) return false;
    if (riskFilter !== "all" && p.riskLevel !== riskFilter) return false;
    if (serviceFilter !== "all" && p.setting !== serviceFilter) return false;
    return true;
  }), [visiblePeople, siteFilter, unitFilter, riskFilter, serviceFilter]);
  const filteredIds = new Set(filteredPeople.map((p) => p.id));

  const inRange = (iso?: string) => {
    if (!iso) return true;
    const t = new Date(iso).getTime();
    if (fromDate && t < new Date(fromDate).getTime()) return false;
    if (toDate && t > new Date(toDate).getTime()) return false;
    return true;
  };
  const matchesStatus = (s: string) => statusFilter === "all" || s === statusFilter;

  const doExport = (label: string) =>
    toast({ title: "Export queued (demo)", description: `${label} — CSV export placeholder.` });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Care Planning Reporting</h1>
            <Badge variant="outline" className="gap-1 bg-secondary/60">
              <MapPin className="h-3 w-3" /> Viewing: {scopeLabel(scopeInput)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Governance evidence for review compliance, approval chains, incident linkage, contributor activity, evidence completeness and version archive.
          </p>
        </div>
        <Button variant="outline" onClick={() => doExport("Full care planning report")}>
          <Download className="h-4 w-4 mr-1" /> Export report
        </Button>
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
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </FilterBlock>
            <FilterBlock label="Status">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft_in_progress">Draft in progress</SelectItem>
                  <SelectItem value="ready_for_approval">Ready for approval</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </FilterBlock>
            <FilterBlock label="Service type">
              <Select value={serviceFilter} onValueChange={setServiceFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All service types</SelectItem>
                  <SelectItem value="nursing_home">Nursing home</SelectItem>
                  <SelectItem value="disability">Disability</SelectItem>
                  <SelectItem value="home_support">Home support</SelectItem>
                  <SelectItem value="childrens_residential">Children's residential</SelectItem>
                </SelectContent>
              </Select>
            </FilterBlock>
            <FilterBlock label="From"><Input type="date" className="w-40" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></FilterBlock>
            <FilterBlock label="To"><Input type="date" className="w-40" value={toDate} onChange={(e) => setToDate(e.target.value)} /></FilterBlock>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="compliance">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="compliance">Review Compliance</TabsTrigger>
          <TabsTrigger value="approval">Approval Governance</TabsTrigger>
          <TabsTrigger value="incident">Incident-linked</TabsTrigger>
          <TabsTrigger value="contributor">Contributor Activity</TabsTrigger>
          <TabsTrigger value="evidence">Evidence Completeness</TabsTrigger>
          <TabsTrigger value="archive">Version Archive</TabsTrigger>
        </TabsList>

        {/* 1 — Review Compliance */}
        <TabsContent value="compliance" className="mt-4">
          <ReviewCompliance people={filteredPeople} plans={plans} inRange={inRange} doExport={doExport} />
        </TabsContent>

        {/* 2 — Approval Governance */}
        <TabsContent value="approval" className="mt-4">
          <ApprovalGovernance
            instances={instances.filter((i) => filteredIds.has(i.personId) && inRange(i.startedAt))}
            plans={plans}
            people={filteredPeople}
            doExport={doExport}
          />
        </TabsContent>

        {/* 3 — Incident-linked Care Planning */}
        <TabsContent value="incident" className="mt-4">
          <IncidentLinked
            suggestions={suggestions.filter((s) => filteredIds.has(s.personId) && inRange(s.createdAt))}
            people={filteredPeople}
            doExport={doExport}
          />
        </TabsContent>

        {/* 4 — Contributor Activity */}
        <TabsContent value="contributor" className="mt-4">
          <ContributorActivity
            invites={contribs.invites.filter((i) => i.personIds.length === 0 || i.personIds.some((pid) => filteredIds.has(pid)))}
            contributions={contribs.contributions.filter((c) => filteredIds.has(c.personId) && inRange(c.submittedAt))}
            contributors={contribs.contributors}
            people={filteredPeople}
            doExport={doExport}
          />
        </TabsContent>

        {/* 5 — Evidence Completeness */}
        <TabsContent value="evidence" className="mt-4">
          <EvidenceCompleteness
            people={filteredPeople}
            plans={plans}
            contributions={contribs.contributions.filter((c) => filteredIds.has(c.personId))}
            doExport={doExport}
          />
        </TabsContent>

        {/* 6 — Version Archive */}
        <TabsContent value="archive" className="mt-4">
          <VersionArchive
            people={filteredPeople}
            plans={plans}
            inRange={inRange}
            matchesStatus={matchesStatus}
            doExport={doExport}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ================= 1 Review Compliance ================= */

function ReviewCompliance({
  people, plans, inRange, doExport,
}: {
  people: PersonSupported[];
  plans: ReturnType<typeof useCarePlans>["plans"];
  inRange: (iso?: string) => boolean;
  doExport: (label: string) => void;
}) {
  const rows = people.map((p) => {
    const plan = plans.find((pl) => pl.personId === p.id);
    const days = daysUntil(plan?.nextReviewDue);
    return { p, plan, days };
  });
  const dueSoon = rows.filter((r) => r.days !== null && r.days >= 0 && r.days <= 60);
  const overdue = rows.filter((r) => r.days !== null && r.days < 0);
  const completed = plans.flatMap((pl) => pl.versions.filter((v) => v.status === "published" && inRange(v.publishedAt))).length;
  const overdueDays = overdue.map((r) => Math.abs(r.days!));
  const avgDelay = overdueDays.length ? Math.round(overdueDays.reduce((a, b) => a + b, 0) / overdueDays.length) : 0;

  // Breakdown by site
  const bySite = Array.from(new Set(people.map((p) => p.site))).map((site) => {
    const inSite = rows.filter((r) => r.p.site === site);
    return {
      site,
      total: inSite.length,
      overdue: inSite.filter((r) => r.days !== null && r.days < 0).length,
      dueSoon: inSite.filter((r) => r.days !== null && r.days >= 0 && r.days <= 60).length,
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Due within 60 days" value={dueSoon.length} tone="amber" />
        <Stat label="Overdue" value={overdue.length} tone="rose" />
        <Stat label="Reviews completed" value={completed} tone="emerald" />
        <Stat label="Avg delay (days)" value={avgDelay} tone="amber" />
      </div>
      <SectionCard
        title="Breakdown by site / unit"
        onExport={() => doExport("Review compliance by site")}
      >
        <Table>
          <TableHeader><TableRow>
            <TableHead>Site</TableHead><TableHead>Plans</TableHead><TableHead>Due soon</TableHead><TableHead>Overdue</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {bySite.map((b) => (
              <TableRow key={b.site}>
                <TableCell className="font-medium">{b.site}</TableCell>
                <TableCell>{b.total}</TableCell>
                <TableCell>{b.dueSoon}</TableCell>
                <TableCell>{b.overdue > 0 ? <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">{b.overdue}</Badge> : b.overdue}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

/* ================= 2 Approval Governance ================= */

function ApprovalGovernance({
  instances, plans, people, doExport,
}: {
  instances: ReturnType<typeof useCarePlanApprovalChains>["instances"];
  plans: ReturnType<typeof useCarePlans>["plans"];
  people: PersonSupported[];
  doExport: (label: string) => void;
}) {
  const awaiting = instances.filter((i) => i.status === "awaiting_approval");
  const now = Date.now();
  const bottlenecks = awaiting.map((i) => {
    const days = Math.floor((now - new Date(i.startedAt).getTime()) / 86400000);
    return { i, days, person: people.find((p) => p.id === i.personId) };
  }).filter((x) => x.days >= 3).sort((a, b) => b.days - a.days);

  const completed = instances.filter((i) => i.status === "approved" && i.completedAt);
  const avgApprovalDays = completed.length
    ? Math.round(completed.reduce((sum, i) => sum + (new Date(i.completedAt!).getTime() - new Date(i.startedAt).getTime()) / 86400000, 0) / completed.length)
    : 0;

  // Approval chain gaps: drafts ready_for_approval with no instance
  const gaps: { person: PersonSupported; version: CarePlanVersion }[] = [];
  for (const p of people) {
    const plan = plans.find((pl) => pl.personId === p.id);
    if (!plan) continue;
    for (const v of plan.versions) {
      if (v.status === "ready_for_approval" && !instances.some((i) => i.carePlanId === v.id)) {
        gaps.push({ person: p, version: v });
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Awaiting approval" value={awaiting.length} tone="amber" />
        <Stat label="Bottlenecks (≥3d)" value={bottlenecks.length} tone="rose" />
        <Stat label="Chain gaps" value={gaps.length} tone="amber" />
        <Stat label="Avg approval time (d)" value={avgApprovalDays} tone="emerald" />
      </div>

      <SectionCard title="Approval bottlenecks" onExport={() => doExport("Approval bottlenecks")}>
        {bottlenecks.length === 0
          ? <Empty label="No bottlenecks." />
          : <Table>
              <TableHeader><TableRow>
                <TableHead>Person</TableHead><TableHead>Draft</TableHead>
                <TableHead>Level</TableHead><TableHead>Pending approvers</TableHead><TableHead>Days waiting</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {bottlenecks.map(({ i, days, person }) => (
                  <TableRow key={i.id}>
                    <TableCell><Link to={`/app/care-plans/people/${person?.id}`} className="hover:underline font-medium">{person?.name ?? i.personId}</Link></TableCell>
                    <TableCell className="text-sm">v{i.carePlanVersion}</TableCell>
                    <TableCell className="text-sm">L{i.currentLevelNumber} · {currentLevel(i)?.levelName}</TableCell>
                    <TableCell className="text-xs">{pendingApproversAtLevel(i).map((a) => a.name).join(", ")}</TableCell>
                    <TableCell><Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">{days}d</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>}
      </SectionCard>

      <SectionCard title="Approval chain gaps" onExport={() => doExport("Chain gaps")}>
        {gaps.length === 0
          ? <Empty label="No drafts missing an approval chain." />
          : <Table>
              <TableHeader><TableRow>
                <TableHead>Person</TableHead><TableHead>Draft</TableHead><TableHead>Site / unit</TableHead><TableHead>Since</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {gaps.map(({ person, version }) => (
                  <TableRow key={version.id}>
                    <TableCell><Link to={`/app/care-plans/people/${person.id}`} className="hover:underline font-medium">{person.name}</Link></TableCell>
                    <TableCell className="text-sm">v{version.versionNumber}</TableCell>
                    <TableCell className="text-sm">{person.site}{person.unit ? ` · ${person.unit}` : ""}</TableCell>
                    <TableCell className="text-sm">{formatDate(version.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>}
      </SectionCard>
    </div>
  );
}

/* ================= 3 Incident-linked ================= */

function IncidentLinked({
  suggestions, people, doExport,
}: {
  suggestions: ReturnType<typeof useCarePlans>["suggestions"];
  people: PersonSupported[];
  doExport: (label: string) => void;
}) {
  const withPrompt = suggestions.filter((s) => !!s.sourceIncidentId);
  const triggered = withPrompt.filter((s) => s.status === "actioned");
  const noDecision = withPrompt.filter((s) => s.status === "open");
  // Repeat: same personId appearing more than once with sourceIncidentId
  const counts: Record<string, number> = {};
  withPrompt.forEach((s) => { counts[s.personId] = (counts[s.personId] ?? 0) + 1; });
  const repeat = Object.entries(counts).filter(([, n]) => n > 1).map(([pid]) => people.find((p) => p.id === pid)!).filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Incidents w/ prompts" value={withPrompt.length} tone="amber" />
        <Stat label="Reviews triggered" value={triggered.length} tone="emerald" />
        <Stat label="Without decision" value={noDecision.length} tone="rose" />
        <Stat label="Repeat, no update" value={repeat.length} tone="rose" />
      </div>

      <SectionCard title="Incident-linked review prompts" onExport={() => doExport("Incident-linked care planning")}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Person</TableHead><TableHead>Incident</TableHead><TableHead>Sections</TableHead><TableHead>Status</TableHead><TableHead>Raised</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {withPrompt.map((s) => {
              const person = people.find((p) => p.id === s.personId);
              return (
                <TableRow key={s.id}>
                  <TableCell><Link to={`/app/care-plans/people/${s.personId}`} className="hover:underline font-medium">{person?.name ?? s.personId}</Link></TableCell>
                  <TableCell className="text-sm font-mono">{s.sourceIncidentId}</TableCell>
                  <TableCell className="text-xs">{s.suggestedSections.map((k) => SECTION_LABELS[k]).join(", ")}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{s.status}</Badge></TableCell>
                  <TableCell className="text-sm">{formatDate(s.createdAt)}</TableCell>
                </TableRow>
              );
            })}
            {withPrompt.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No incident-linked prompts.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

/* ================= 4 Contributor Activity ================= */

function ContributorActivity({
  invites, contributions, contributors, people, doExport,
}: {
  invites: any[];
  contributions: any[];
  contributors: any[];
  people: PersonSupported[];
  doExport: (label: string) => void;
}) {
  const now = Date.now();
  const active = invites.filter((i) => i.status === "active");
  const expiringSoon = active.filter((i) => i.expiryDate && new Date(i.expiryDate).getTime() - now <= 30 * 24 * 3600 * 1000);
  const pending = contributions.filter((c) => ["submitted", "under_manager_review", "clarification_requested"].includes(c.status));
  const accepted = contributions.filter((c) => c.status === "accepted_into_draft");
  const rejected = contributions.filter((c) => c.status === "rejected");
  const missingReg = contributors.filter((c) =>
    !c.registrationNumber || c.registrationBody === "Not applicable / family advocate / non-registered contributor"
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Stat label="Pending contributions" value={pending.length} tone="amber" />
        <Stat label="Active contributors" value={active.length} tone="emerald" />
        <Stat label="Accepted into draft" value={accepted.length} tone="emerald" />
        <Stat label="Rejected" value={rejected.length} tone="rose" />
        <Stat label="Expiring ≤30d" value={expiringSoon.length} tone="amber" />
        <Stat label="Missing registration" value={missingReg.length} tone="rose" />
      </div>

      <SectionCard title="Recent contributions" onExport={() => doExport("Contributor activity")}>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Person</TableHead><TableHead>Contributor</TableHead><TableHead>Profession</TableHead>
            <TableHead>Sections</TableHead><TableHead>Status</TableHead><TableHead>Submitted</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {contributions.slice(0, 15).map((c) => {
              const person = people.find((p) => p.id === c.personId);
              return (
                <TableRow key={c.id}>
                  <TableCell><Link to={`/app/care-plans/people/${c.personId}`} className="hover:underline font-medium">{person?.name ?? c.personId}</Link></TableCell>
                  <TableCell>
                    <div className="text-sm flex items-center gap-1"><Stethoscope className="h-3 w-3 text-primary" />{c.contributorName}</div>
                    <div className="text-[10px] text-muted-foreground">{c.registrationBody}{c.registrationNumber ? ` ${c.registrationNumber}` : ""}</div>
                  </TableCell>
                  <TableCell className="text-sm">{c.profession}</TableCell>
                  <TableCell className="text-xs">{c.affectedSections.join(", ")}</TableCell>
                  <TableCell><Badge variant="outline">{CONTRIBUTION_STATUS_LABEL[c.status as keyof typeof CONTRIBUTION_STATUS_LABEL]}</Badge></TableCell>
                  <TableCell className="text-sm">{formatDate(c.submittedAt)}</TableCell>
                </TableRow>
              );
            })}
            {contributions.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No contributions in scope.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}

/* ================= 5 Evidence Completeness ================= */

function EvidenceCompleteness({
  people, plans, contributions, doExport,
}: {
  people: PersonSupported[];
  plans: ReturnType<typeof useCarePlans>["plans"];
  contributions: any[];
  doExport: (label: string) => void;
}) {
  const now = Date.now();
  const rows = people.map((p) => {
    const plan = plans.find((pl) => pl.personId === p.id);
    const current = plan?.versions.find((v) => v.id === plan.currentVersionId);
    const draft = plan?.versions.find((v) => v.status === "draft_in_progress" || v.status === "ready_for_approval");
    const missingSections = current
      ? current.sections.filter((s) => !s.body || s.body.trim().length < 20).map((s) => SECTION_LABELS[s.key])
      : [];
    const hasSpecialist = contributions.some((c) => c.personId === p.id);
    const lastReviewNote = current?.reviewNotes;
    const daysSinceReview = current?.publishedAt
      ? Math.floor((now - new Date(current.publishedAt).getTime()) / 86400000)
      : null;
    return { p, plan, current, draft, missingSections, hasSpecialist, lastReviewNote, daysSinceReview };
  });

  const missingEvidence = rows.filter((r) => r.missingSections.length > 0);
  const needReview = rows.filter((r) => r.daysSinceReview !== null && r.daysSinceReview > 180);
  const missingDraftInfo = rows.filter((r) => r.draft && r.missingSections.length > 0);
  const withSpecialist = rows.filter((r) => r.hasSpecialist);
  const noRecentNote = rows.filter((r) => !r.lastReviewNote);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Missing evidence" value={missingEvidence.length} tone="rose" />
        <Stat label="Sections needing review" value={needReview.length} tone="amber" />
        <Stat label="Drafts missing info" value={missingDraftInfo.length} tone="amber" />
        <Stat label="Plans w/ specialist input" value={withSpecialist.length} tone="emerald" />
        <Stat label="No recent review note" value={noRecentNote.length} tone="amber" />
      </div>

      <SectionCard title="Care plans with missing evidence" onExport={() => doExport("Evidence completeness")}>
        {missingEvidence.length === 0
          ? <Empty label="No evidence gaps in scope." />
          : <Table>
              <TableHeader><TableRow>
                <TableHead>Person</TableHead><TableHead>Site / unit</TableHead><TableHead>Missing / thin sections</TableHead><TableHead>Last review</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {missingEvidence.map((r) => (
                  <TableRow key={r.p.id}>
                    <TableCell><Link to={`/app/care-plans/people/${r.p.id}`} className="hover:underline font-medium">{r.p.name}</Link></TableCell>
                    <TableCell className="text-sm">{r.p.site}{r.p.unit ? ` · ${r.p.unit}` : ""}</TableCell>
                    <TableCell className="text-xs">{r.missingSections.join(", ")}</TableCell>
                    <TableCell className="text-sm">{r.current?.publishedAt ? formatDate(r.current.publishedAt) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>}
      </SectionCard>
    </div>
  );
}

/* ================= 6 Version Archive ================= */

function VersionArchive({
  people, plans, inRange, matchesStatus, doExport,
}: {
  people: PersonSupported[];
  plans: ReturnType<typeof useCarePlans>["plans"];
  inRange: (iso?: string) => boolean;
  matchesStatus: (s: string) => boolean;
  doExport: (label: string) => void;
}) {
  const terms = useTerms();
  const [search, setSearch] = useState("");
  const [approverFilter, setApproverFilter] = useState("");
  const [versionFilter, setVersionFilter] = useState("");

  const rows = useMemo(() => {
    const out: {
      person: PersonSupported;
      version: CarePlanVersion;
    }[] = [];
    for (const p of people) {
      const plan = plans.find((pl) => pl.personId === p.id);
      if (!plan) continue;
      for (const v of plan.versions) {
        out.push({ person: p, version: v });
      }
    }
    return out
      .filter(({ version }) => matchesStatus(version.status))
      .filter(({ version }) => inRange(version.publishedAt ?? version.createdAt))
      .filter(({ person, version }) => {
        if (search && !`${person.name} ${person.site} ${person.unit ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
        if (approverFilter && !(version.approvedBy ?? "").toLowerCase().includes(approverFilter.toLowerCase())) return false;
        if (versionFilter && !String(version.versionNumber).includes(versionFilter)) return false;
        return true;
      })
      .sort((a, b) => (b.version.publishedAt ?? b.version.createdAt).localeCompare(a.version.publishedAt ?? a.version.createdAt));
  }, [people, plans, search, approverFilter, versionFilter, inRange, matchesStatus]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <FilterBlock label="Search person / site"><Input className="w-64" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or site" /></FilterBlock>
            <FilterBlock label="Approver"><Input className="w-48" value={approverFilter} onChange={(e) => setApproverFilter(e.target.value)} /></FilterBlock>
            <FilterBlock label="Version"><Input className="w-24" value={versionFilter} onChange={(e) => setVersionFilter(e.target.value)} placeholder="e.g. 3" /></FilterBlock>
            <div className="ml-auto">
              <Button variant="outline" onClick={() => doExport("Version archive")}>
                <Download className="h-4 w-4 mr-1" /> Export archive
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="h-4 w-4" /> Care plan version archive ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{terms.Singular}</TableHead>
              <TableHead>Site / unit</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Approved by</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Archived</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(({ person, version }) => (
                <TableRow key={version.id}>
                  <TableCell><Link to={`/app/care-plans/people/${person.id}`} className="font-medium hover:underline">{person.name}</Link></TableCell>
                  <TableCell className="text-sm">{person.site}{person.unit ? ` · ${person.unit}` : ""}</TableCell>
                  <TableCell className="text-sm">v{version.versionNumber}</TableCell>
                  <TableCell><Badge variant="outline">{statusLabel(version.status)}</Badge></TableCell>
                  <TableCell className="text-sm">{version.approvedBy ?? "—"}</TableCell>
                  <TableCell className="text-sm">{formatDate(version.publishedAt)}</TableCell>
                  <TableCell className="text-sm">{formatDate(version.archivedAt)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/app/care-plans/people/${person.id}/version/${version.id}`}>Open <ArrowRight className="h-3 w-3 ml-1" /></Link>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => doExport(`v${version.versionNumber} — ${person.name}`)}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Export
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No versions match the filters.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ================= shared ================= */

function SectionCard({ title, onExport, children }: { title: string; onExport?: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {onExport && (
          <Button size="sm" variant="ghost" onClick={onExport}>
            <Download className="h-3.5 w-3.5 mr-1" /> Export
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-sm text-muted-foreground text-center py-8">{label}</div>;
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
