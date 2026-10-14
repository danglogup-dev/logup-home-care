import { Link } from "react-router-dom";
import { OverdueReviewSuggestionsAlert } from "@/components/care-plans/OverdueReviewSuggestionsAlert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Sparkles, ClipboardCheck, ArrowRight, MapPin,
  Stethoscope, ShieldAlert, KeyRound, Building2, CheckCircle2, Clock, UserCheck,
} from "lucide-react";
import { useCarePlans, daysUntil, getVisiblePeople, scopeLabel } from "@/lib/carePlansStore";
import { useRole } from "@/hooks/useRole";
import { useSpecialistContributions } from "@/lib/specialistContributionsStore";
import {
  useCarePlanApprovalChains, canDecideAtCurrentLevel, currentLevel, pendingApproversAtLevel,
} from "@/lib/carePlanApprovalChainsStore";

const REVIEWS_URL = "/app/care-plans/reviews-approvals";
const ACCESS_URL = "/app/care-plans/access-contributors";
const SITES = ["Oakfield Manor", "Riverside Lodge", "Elm Grove House"] as const;

/**
 * Overview answers "What needs attention today?"
 * Governance trends, compliance %, contribution totals and archive counts live
 * in Reporting — they are intentionally not duplicated here.
 */
export default function CarePlansOverview() {
  const { people, plans, suggestions } = useCarePlans();
  const specialist = useSpecialistContributions();
  const { instances } = useCarePlanApprovalChains();
  const role = useRole();
  const scopeInput = { role: role.role, scope: role.scope, unit: role.unit };

  const visiblePeople = getVisiblePeople(people, scopeInput);
  const visiblePlans = plans.filter((pl) => visiblePeople.some((p) => p.id === pl.personId));
  const visibleIds = new Set(visiblePeople.map((p) => p.id));
  const personById = new Map(visiblePeople.map((p) => [p.id, p]));

  /* ---- Zone 1: Approvals waiting ---- */
  const approvalItems = instances
    .filter((i) => i.status === "awaiting_approval" && visibleIds.has(i.personId))
    .map((i) => {
      const person = personById.get(i.personId);
      const level = currentLevel(i);
      const isMine = canDecideAtCurrentLevel(i, role.staffId);
      const waitingDays = Math.floor((Date.now() - new Date(i.startedAt).getTime()) / 86400000);
      return { i, person, level, isMine, waitingDays };
    })
    .filter((x) => x.person)
    .sort((a, b) => Number(b.isMine) - Number(a.isMine) || b.waitingDays - a.waitingDays);
  const myApprovals = approvalItems.filter((x) => x.isMine);

  /* ---- Zone 2: Reviews due / overdue ---- */
  const reviewRows = visiblePlans.map((pl) => {
    const person = personById.get(pl.personId);
    const days = daysUntil(pl.nextReviewDue);
    return { pl, person, days };
  }).filter((r) => r.person);
  const overdueRows = reviewRows.filter((r) => r.days !== null && r.days < 0)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  const dueSoonRows = reviewRows.filter((r) => r.days !== null && r.days >= 0 && r.days <= 30)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

  /* ---- Zone 3: Signals ---- */
  const incidentPrompts = suggestions.filter(
    (s) => s.status === "open" && !!s.sourceIncidentId && visibleIds.has(s.personId),
  );
  const pendingContribs = specialist.contributions.filter(
    (c) => visibleIds.has(c.personId) &&
      (c.status === "submitted" || c.status === "under_manager_review" || c.status === "clarification_requested"),
  );
  const now = Date.now();
  const staleHighRisk = visiblePeople.filter((p) => {
    if (p.riskLevel !== "high") return false;
    const pl = visiblePlans.find((x) => x.personId === p.id);
    if (!pl) return true;
    const lastPub = pl.versions.filter((v) => v.status === "published" && v.publishedAt)
      .map((v) => new Date(v.publishedAt!).getTime())
      .sort((a, b) => b - a)[0];
    if (!lastPub) return true;
    return (now - lastPub) > 180 * 86400000;
  });
  const accessIssues = specialist.invites.filter((i) => i.status === "expired" || i.status === "revoked");

  /* ---- Site rollup ---- */
  const siteRows = SITES.map((site) => {
    const inSite = visiblePeople.filter((p) => p.site === site);
    if (inSite.length === 0) return null;
    const ids = new Set(inSite.map((p) => p.id));
    const sitePlans = visiblePlans.filter((pl) => ids.has(pl.personId));
    return {
      site,
      peopleCount: inSite.length,
      overdue: sitePlans.filter((p) => (daysUntil(p.nextReviewDue) ?? 999) < 0).length,
      awaiting: instances.filter((i) => i.status === "awaiting_approval" && ids.has(i.personId)).length,
      specialist: specialist.contributions.filter((c) => ids.has(c.personId) &&
        (c.status === "submitted" || c.status === "under_manager_review" || c.status === "clarification_requested")).length,
      highRisk: inSite.filter((p) => p.riskLevel === "high").length,
    };
  }).filter(Boolean) as Array<{ site: string; peopleCount: number; overdue: number; awaiting: number; specialist: number; highRisk: number }>;

  const nothingToDo =
    approvalItems.length === 0 && overdueRows.length === 0 && dueSoonRows.length === 0 &&
    incidentPrompts.length === 0 && pendingContribs.length === 0 &&
    staleHighRisk.length === 0 && accessIssues.length === 0;

  return (
    <div className="p-6 space-y-6">
      <OverdueReviewSuggestionsAlert />
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Care Planning</h1>
            <Badge variant="outline" className="gap-1 bg-secondary/60">
              <MapPin className="h-3 w-3" /> Viewing: {scopeLabel(scopeInput)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            What needs attention today. Governance trends and exports live in{" "}
            <Link to="/app/care-plans/reporting" className="underline hover:text-foreground">Reporting</Link>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/app/care-plans/plans">Care Plans <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          {role.role !== "frontline" && role.role !== "viewonly" && (
            <Button asChild>
              <Link to="/app/care-plans/create"><Sparkles className="mr-2 h-4 w-4" /> New Care Plan</Link>
            </Button>
          )}
        </div>
      </div>

      {nothingToDo && (
        <Card>
          <CardContent className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            Nothing needs attention in your scope right now. Governance reports remain available in{" "}
            <Link to="/app/care-plans/reporting" className="underline hover:text-foreground">Reporting</Link>.
          </CardContent>
        </Card>
      )}

      {/* Zone 1 — Approvals waiting */}
      <ZoneCard
        title="Approvals waiting"
        icon={ClipboardCheck}
        count={approvalItems.length}
        highlight={myApprovals.length > 0 ? `${myApprovals.length} awaiting your approval` : undefined}
        emptyLabel="No care plan drafts are awaiting approval."
        seeAllHref={REVIEWS_URL}
        seeAllLabel="Open Approval Queue"
      >
        {approvalItems.slice(0, 6).map(({ i, person, level, isMine, waitingDays }) => (
          <Link
            key={i.id}
            to={`/app/care-plans/people/${person!.id}?tab=drafts`}
            className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-accent/30 ${
              isMine ? "border-primary/40 bg-primary/5" : ""
            }`}
          >
            <div className="min-w-0 flex items-center gap-2">
              {isMine ? <UserCheck className="h-4 w-4 text-primary shrink-0" /> : <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="min-w-0">
                <div className="font-medium truncate">{person!.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  Draft v{i.carePlanVersion} · L{i.currentLevelNumber} {level?.levelName ? `· ${level.levelName}` : ""}
                  {" · "}Pending: {pendingApproversAtLevel(i).map((a) => a.name).slice(0, 2).join(", ") || "—"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isMine && <Badge className="bg-primary/15 text-primary border-primary/30">You approve</Badge>}
              <Badge variant="outline" className={waitingDays >= 3 ? "bg-amber-50 text-amber-800 border-amber-200" : ""}>
                {waitingDays}d
              </Badge>
            </div>
          </Link>
        ))}
      </ZoneCard>

      {/* Zone 2 — Reviews due or overdue */}
      <ZoneCard
        title="Reviews due or overdue"
        icon={ShieldAlert}
        count={overdueRows.length + dueSoonRows.length}
        highlight={overdueRows.length > 0 ? `${overdueRows.length} overdue` : undefined}
        emptyLabel="No care plan reviews due in the next 30 days."
        seeAllHref={REVIEWS_URL}
        seeAllLabel="Open Reviews & Approvals"
      >
        {overdueRows.slice(0, 4).map(({ pl, person, days }) => (
          <ReviewRow key={`o-${pl.personId}`} personId={person!.id} name={person!.name} site={person!.site} unit={person!.unit}
            label={`Overdue by ${Math.abs(days!)}d`} tone="warn" />
        ))}
        {dueSoonRows.slice(0, 4).map(({ pl, person, days }) => (
          <ReviewRow key={`d-${pl.personId}`} personId={person!.id} name={person!.name} site={person!.site} unit={person!.unit}
            label={`Due in ${days}d`} />
        ))}
      </ZoneCard>

      {/* Zone 3 — Signals */}
      <ZoneCard
        title="Signals"
        icon={Sparkles}
        count={incidentPrompts.length + pendingContribs.length + staleHighRisk.length + accessIssues.length}
        emptyLabel="No open signals."
        seeAllHref={REVIEWS_URL}
        seeAllLabel="Review triggers"
      >
        <Signal
          show={incidentPrompts.length > 0}
          icon={Sparkles}
          to={`${REVIEWS_URL}?tab=incident`}
          label={`${incidentPrompts.length} incident-linked care plan review prompt${incidentPrompts.length === 1 ? "" : "s"}`}
        />
        <Signal
          show={pendingContribs.length > 0}
          icon={Stethoscope}
          to={`${ACCESS_URL}?tab=review`}
          label={`${pendingContribs.length} specialist contribution${pendingContribs.length === 1 ? "" : "s"} awaiting review`}
        />
        <Signal
          show={staleHighRisk.length > 0}
          icon={AlertTriangle}
          to="/app/care-plans/plans?risk=high"
          label={`${staleHighRisk.length} high-risk care plan${staleHighRisk.length === 1 ? "" : "s"} without a recent review`}
          tone="warn"
        />
        <Signal
          show={accessIssues.length > 0}
          icon={KeyRound}
          to={`${ACCESS_URL}?tab=expiring`}
          label={`${accessIssues.length} specialist access issue${accessIssues.length === 1 ? "" : "s"} (expired or revoked)`}
        />
      </ZoneCard>

      {/* Compact site strip */}
      {siteRows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" /> Site rollup
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {siteRows.map((s) => (
                <div key={s.site} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-medium truncate">{s.site}</div>
                    <span className="text-[11px] text-muted-foreground">{s.peopleCount} people</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <SiteChip label="Overdue" value={s.overdue} warn />
                    <SiteChip label="Awaiting approval" value={s.awaiting} />
                    <SiteChip label="Specialist pending" value={s.specialist} />
                    <SiteChip label="High risk" value={s.highRisk} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

function ZoneCard({
  title, icon: Icon, count, highlight, emptyLabel, seeAllHref, seeAllLabel, children,
}: {
  title: string; icon: any; count: number; highlight?: string; emptyLabel: string;
  seeAllHref: string; seeAllLabel: string; children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
            <Badge variant="outline">{count}</Badge>
            {highlight && <Badge className="bg-primary/15 text-primary border-primary/30">{highlight}</Badge>}
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to={seeAllHref}>{seeAllLabel} <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {count === 0 || !hasChildren
          ? <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-md text-center">{emptyLabel}</div>
          : children}
      </CardContent>
    </Card>
  );
}

function ReviewRow({
  personId, name, site, unit, label, tone,
}: { personId: string; name: string; site: string; unit?: string; label: string; tone?: "warn" }) {
  return (
    <Link
      to={`/app/care-plans/people/${personId}`}
      className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-accent/30 ${
        tone === "warn" ? "border-amber-300 bg-amber-50/40" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="font-medium truncate">{name}</div>
        <div className="text-xs text-muted-foreground truncate">{site}{unit ? ` · ${unit}` : ""}</div>
      </div>
      <Badge variant="outline" className={tone === "warn" ? "bg-amber-100 text-amber-800 border-amber-300" : ""}>
        {label}
      </Badge>
    </Link>
  );
}

function Signal({
  show, icon: Icon, to, label, tone,
}: { show: boolean; icon: any; to: string; label: string; tone?: "warn" }) {
  if (!show) return null;
  return (
    <Link
      to={to}
      className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-accent/30 ${
        tone === "warn" ? "border-amber-300 bg-amber-50/40" : ""
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <Icon className={`h-4 w-4 shrink-0 ${tone === "warn" ? "text-amber-600" : "text-muted-foreground"}`} />
        <span className="truncate">{label}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0" />
    </Link>
  );
}

function SiteChip({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  const active = value > 0;
  const cls = active
    ? warn
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-secondary text-foreground"
    : "bg-muted/40 text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${cls}`}>
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}
