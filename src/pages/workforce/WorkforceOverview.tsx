import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ShieldCheck, AlertTriangle, ClipboardCheck, Building2, ArrowRight, CalendarClock, UserX,
} from "lucide-react";
import {
  workforceStore, expiringSoonCount, expiredCount, missingCriticalCount,
  todaysCoverageBreakdown, todayString, shiftCoverage, staffStatus,
  qualificationStatus, daysToExpiry, ragColorClasses,
  overallCompliancePct, highRiskGapCount, siteRequirementsNotMet,
} from "@/lib/workforceStore";

import { useRole } from "@/hooks/useRole";
import { inScope } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

const WorkforceOverview = () => {
  const [, force] = useState(0);
  useEffect(() => workforceStore.subscribe(() => force((n) => n + 1)), []);
  const role = useRole();

  const allSites = workforceStore.getSites();
  const sites = allSites.filter((s) => inScope(s.name, role.role, role.scope));
  const scopedSiteIds = new Set(sites.map((s) => s.id));
  const scopedIdArray = Array.from(scopedSiteIds);
  const compliancePct = overallCompliancePct(scopedIdArray);
  const highRiskGaps = highRiskGapCount(scopedIdArray);
  const siteGaps = siteRequirementsNotMet(scopedIdArray);
  const expiring = expiringSoonCount();
  const expired = expiredCount();
  const missing = missingCriticalCount();
  const cov = todaysCoverageBreakdown();
  const allStaff = workforceStore.getStaff();
  const staff = allStaff.filter((s) => s.assignedSiteIds.some((id) => scopedSiteIds.has(id)) && s.operationalProfile !== "governance_view_only");
  const allShifts = workforceStore.getShifts();
  const shifts = allShifts.filter((sh) => scopedSiteIds.has(sh.siteId));


  // Site compliance summary
  const siteSummary = sites.map((site) => {
    const siteStaff = staff.filter((s) => s.assignedSiteIds.includes(site.id));
    const compliantCount = siteStaff.filter((s) => staffStatus(s).overall === "green").length;
    const pct = siteStaff.length === 0 ? 0 : Math.round((compliantCount / siteStaff.length) * 100);
    const today = todayString();
    const next7 = shifts.filter((sh) => sh.siteId === site.id && sh.date >= today && sh.date <= addDays(today, 7));
    const atRisk = next7.filter((sh) => {
      const r = shiftCoverage(sh);
      return r.status === "at_risk" || r.status === "uncovered";
    }).length;
    let overall: "green" | "amber" | "red" = "green";
    if (next7.some((sh) => shiftCoverage(sh).status === "uncovered") || pct < 60) overall = "red";
    else if (atRisk > 0 || pct < 90) overall = "amber";
    return { site, pct, atRisk, overall };
  });

  // Build attention list
  type Attention = { key: string; title: string; sub: string; tone: "red" | "amber"; href: string };
  const items: Attention[] = [];

  // Today's uncovered/at-risk shifts
  const today = todayString();
  for (const sh of shifts.filter((s) => s.date === today)) {
    const r = shiftCoverage(sh);
    if (r.status === "uncovered") {
      const site = sites.find((s) => s.id === sh.siteId);
      items.push({
        key: sh.id,
        title: `${site?.name} — Tonight's ${sh.shift} shift uncovered`,
        sub: r.warnings[0]?.message ?? "Required competencies not met.",
        tone: "red",
        href: "/app/workforce/coverage",
      });
    } else if (r.status === "at_risk") {
      const site = sites.find((s) => s.id === sh.siteId);
      items.push({
        key: sh.id,
        title: `${site?.name} — ${sh.shift === "day" ? "Day" : "Night"} shift at risk`,
        sub: r.warnings[0]?.message ?? "Coverage just meets minimum.",
        tone: "amber",
        href: "/app/workforce/coverage",
      });
    }
  }

  // Expired qualifications
  for (const s of staff) {
    for (const q of s.qualifications) {
      if (qualificationStatus(q) === "red") {
        const t = workforceStore.getQualType(q.qualificationId);
        const days = -daysToExpiry(q);
        items.push({
          key: `${s.id}-${q.qualificationId}-r`,
          title: `${s.name} — ${t?.name} expired ${days} day${days === 1 ? "" : "s"} ago`,
          sub: `${s.role} · expired ${q.expiresOn}`,
          tone: "red",
          href: "/app/workforce/qualifications",
        });
      }
    }
  }
  // Missing critical
  for (const s of staff) {
    const mc = staffStatus(s).missingCritical;
    for (const t of mc) {
      items.push({
        key: `${s.id}-${t.id}-m`,
        title: `${s.name} — Missing ${t.name}`,
        sub: `${s.role} · critical competency`,
        tone: "red",
        href: "/app/workforce/qualifications",
      });
    }
  }
  // Amber expiring soon (top few)
  for (const s of staff) {
    for (const q of s.qualifications) {
      if (qualificationStatus(q) === "amber") {
        const t = workforceStore.getQualType(q.qualificationId);
        const days = daysToExpiry(q);
        items.push({
          key: `${s.id}-${q.qualificationId}-a`,
          title: `${s.name} — ${t?.name} expires in ${days} day${days === 1 ? "" : "s"}`,
          sub: `${s.role} · expires ${q.expiresOn}`,
          tone: "amber",
          href: "/app/workforce/qualifications",
        });
      }
    }
  }
  const attention = items
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "red" ? -1 : 1))
    .slice(0, 8);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-20">
      <motion.div {...fade}>
        <h1 className="font-heading text-2xl font-bold text-foreground">Workforce Compliance & Coverage</h1>
        <p className="text-muted-foreground mt-1 text-sm">Who's qualified, what's expiring, and whether every shift is safely covered.</p>
        <div className="mt-3"><RoleContextBanner /></div>
      </motion.div>

      {/* KPI cards */}
      <motion.div {...fade} transition={{ delay: 0.06 }} className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi value={`${compliancePct}%`} label="Compliance (required)" tone={compliancePct >= 90 ? "success" : compliancePct >= 75 ? "warning" : "destructive"} href="/app/workforce/qualifications" />
        <Kpi value={highRiskGaps} label="High-risk gaps" tone={highRiskGaps > 0 ? "destructive" : "success"} href="/app/workforce/qualifications?status=missing" />
        <Kpi value={expiring} label="Expiring ≤ 30 days" tone="warning" href="/app/workforce/qualifications?status=expiring" />
        <Kpi value={expired} label="Expired" tone="destructive" href="/app/workforce/qualifications?status=expired" />
        <Kpi value={cov.at_risk} label="Shifts at risk (today)" tone="warning" href="/app/workforce/coverage" />
        <Kpi value={cov.uncovered} label="Shifts uncovered (today)" tone="destructive" href="/app/workforce/coverage" />
      </motion.div>

      {siteGaps.length > 0 && (
        <motion.div {...fade} transition={{ delay: 0.1 }} className="mt-4 bg-warning/5 border border-warning/30 rounded-xl p-4">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" />Site requirements not met</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {siteGaps.slice(0, 6).map((g) => {
              const s = sites.find((x) => x.id === g.siteId);
              return <li key={`${g.siteId}-${g.qualificationId}`}>• {s?.name ?? g.siteId} — no compliant staff for <span className="font-medium text-foreground">{g.qualificationName}</span></li>;
            })}
          </ul>
        </motion.div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Site compliance summary */}
        <section className="bg-card rounded-2xl border border-border shadow-soft p-5">
          <div className="flex items-center gap-2 mb-3">

            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-lg font-semibold text-foreground">Site compliance</h2>
          </div>
          <div className="space-y-2">
            {siteSummary.map(({ site, pct, atRisk, overall }) => {
              const c = ragColorClasses(overall);
              return (
                <Link
                  key={site.id}
                  to="/app/workforce/coverage"
                  className="flex items-center gap-3 rounded-xl border border-border p-3 hover:border-primary/30 hover:shadow-card transition-all"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{site.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{site.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{pct}%</p>
                    <p className="text-[11px] text-muted-foreground">staff compliant</p>
                  </div>
                  <div className="w-px h-8 bg-border mx-2" />
                  <div className="text-right min-w-[80px]">
                    <p className={`text-sm font-semibold ${atRisk > 0 ? "text-warning" : "text-foreground"}`}>{atRisk}</p>
                    <p className="text-[11px] text-muted-foreground">at-risk shifts (7d)</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Attention list */}
        <section className="bg-card rounded-2xl border border-border shadow-soft p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="font-heading text-lg font-semibold text-foreground">Needs attention</h2>
          </div>
          {attention.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">All clear. Nothing flagged today.</p>
          ) : (
            <div className="space-y-2">
              {attention.map((a) => {
                const Icon = a.tone === "red" ? UserX : CalendarClock;
                return (
                  <Link
                    key={a.key}
                    to={a.href}
                    className="flex items-start gap-3 rounded-xl border border-border p-3 hover:border-primary/30 hover:shadow-card transition-all"
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${a.tone === "red" ? "bg-destructive/10" : "bg-warning/10"}`}>
                      <Icon className={`h-4 w-4 ${a.tone === "red" ? "text-destructive" : "text-warning"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{a.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{a.sub}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <motion.div {...fade} transition={{ delay: 0.2 }} className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickLink to="/app/workforce/qualifications" icon={ShieldCheck} title="Staff qualifications" sub="Matrix, expiry tracking" />
        <QuickLink to="/app/workforce/requirements" icon={ClipboardCheck} title="Site requirements" sub="What each unit needs" />
        <QuickLink to="/app/workforce/reporting" icon={Building2} title="Reporting" sub="Inspection-ready proof" />
      </motion.div>
    </div>
  );
};

const Kpi = ({ value, label, tone, href }: { value: number | string; label: string; tone: "destructive" | "warning" | "success" | "default"; href: string }) => {
  const cls = tone === "destructive" ? "text-destructive"
    : tone === "warning" ? "text-warning"
    : tone === "success" ? "text-success"
    : "text-foreground";
  return (
    <Link to={href} className="text-left bg-card rounded-xl p-4 border border-border shadow-soft hover:border-primary/30 hover:shadow-card transition-all">
      <p className={`text-2xl font-heading font-bold ${cls}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </Link>
  );
};

const QuickLink = ({ to, icon: Icon, title, sub }: { to: string; icon: typeof ShieldCheck; title: string; sub: string }) => (
  <Link to={to} className="flex items-center gap-3 bg-card rounded-xl p-4 border border-border shadow-soft hover:border-primary/30 hover:shadow-card transition-all">
    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
      <Icon className="h-4 w-4 text-primary" />
    </div>
    <div className="flex-1">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
    <ArrowRight className="h-4 w-4 text-muted-foreground" />
  </Link>
);

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default WorkforceOverview;
