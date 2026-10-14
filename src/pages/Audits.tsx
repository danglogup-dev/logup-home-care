import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import {
  ClipboardList, Calendar, AlertTriangle, Clock, CheckCircle2, Building2,
  ArrowUpRight, ListTodo, Flame, Filter, ShieldCheck, FileText, ListChecks,
  TrendingUp, Gauge, ArrowUp, ArrowDown, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { audits, sitePICs } from "@/lib/auditsData";
import { useAllAuditRuns } from "@/lib/auditsStore";
import { useRole } from "@/hooks/useRole";
import { inScope, scopedSites } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

const SITE_ORDER = [
  { site: "East Cork",  pic: "Siobhán Kelly" },
  { site: "West Waterford", pic: "Siobhán Kelly" },
  { site: "West Waterford",  pic: "Ciarán Walsh" },
];

const CATEGORY_ORDER = ["Clinical", "Medication", "Health & Safety", "Governance"];

// Mocked monthly trend (audits completed per month, last 6 months)
const monthlyData = [
  { month: "Nov", count: 14, key: "2025-11" },
  { month: "Dec", count: 12, key: "2025-12" },
  { month: "Jan", count: 18, key: "2026-01" },
  { month: "Feb", count: 21, key: "2026-02" },
  { month: "Mar", count: 19, key: "2026-03" },
  { month: "Apr", count: 16, key: "2026-04" },
];

const Audits = () => {
  const navigate = useNavigate();
  const runs = useAllAuditRuns();
  const role = useRole();
  const allowedSites = useMemo(() => new Set(scopedSites(role.role, role.scope)), [role.role, role.scope]);
  const scopedSiteOrder = useMemo(() => SITE_ORDER.filter((s) => allowedSites.has(s.site)), [allowedSites]);
  // Auto-default the site filter when manager has only one site.
  const defaultSiteFilter = scopedSiteOrder.length === 1
    ? scopedSiteOrder[0].site.toLowerCase().split(" ")[0]
    : "all";
  const [period, setPeriod] = useState("30d");
  const [siteFilter, setSiteFilter] = useState(defaultSiteFilter);
  const [scorecardOpen, setScorecardOpen] = useState(false);

  const goReg = (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    navigate(`/app/audits/reporting${qs ? `?${qs}` : ""}`);
  };

  // Scope-filtered audit set: a Manager only sees their assigned sites.
  const scoped = useMemo(
    () => audits.filter((a) => inScope(a.site, role.role, role.scope)),
    [role.role, role.scope],
  );

  // Apply user-selected site filter on top of the scope.
  const filtered = useMemo(() => {
    if (siteFilter === "all") return scoped;
    const map: Record<string, string> = {
      oakfield: "East Cork",
      riverside: "West Waterford",
      elmgrove: "West Waterford",
    };
    return scoped.filter((a) => a.site === map[siteFilter]);
  }, [siteFilter, scoped]);

  const overdue = filtered.filter((a) => a.status === "Overdue");
  const dueSoon = filtered.filter((a) => a.status === "Due Soon");
  const onTrack = filtered.filter((a) => a.status === "On Track");
  const complete = filtered.filter((a) => a.status === "Complete");

  const openFindings = filtered.reduce((n, a) => n + (a.findings ?? 0), 0);
  const openActions = filtered.reduce(
    (n, a) => n + (a.actions?.filter((ac) => ac.status !== "Closed").length ?? 0),
    0,
  );
  const overdueActionsCount = filtered.reduce(
    (n, a) => n + (a.actions?.filter((ac) => ac.status === "Open").length ?? 0),
    0,
  );

  const awaitingSignoff = runs.filter((r) => r.status === "awaiting_signoff" && inScope(r.site, role.role, role.scope));

  const stats = [
    { key: "live",     label: "Live audits",        value: String(overdue.length + dueSoon.length + onTrack.length), icon: ClipboardList,  tone: "text-primary",     params: { status: "in_progress" } },
    { key: "overdue",  label: "Overdue audits",     value: String(overdue.length),    change: overdue.length > 0 ? `${overdue.length} site${overdue.length === 1 ? "" : "s"}` : undefined, icon: AlertTriangle,  tone: "text-destructive", params: { status: "overdue" } },
    { key: "findings", label: "Open findings",      value: String(openFindings),      icon: Flame,          tone: "text-warning",     params: { findings: "open" } },
    { key: "complete", label: "Completed (30d)",    value: String(complete.length),   icon: CheckCircle2,   tone: "text-success",     params: { status: "completed" } },
  ];

  // By category
  const byCategory = CATEGORY_ORDER.map((cat) => {
    const records = filtered.filter((a) => a.category === cat);
    const overdueN = records.filter((a) => a.status === "Overdue").length;
    return { category: cat, count: records.length, overdue: overdueN };
  }).filter((c) => c.count > 0);
  const maxCategoryCount = Math.max(1, ...byCategory.map((c) => c.count));

  // By site
  const bySite = scopedSiteOrder.map((s) => {
    const recs = filtered.filter((a) => a.site === s.site && a.status !== "Complete");
    const ov = recs.filter((a) => a.status === "Overdue").length;
    const ds = recs.filter((a) => a.status === "Due Soon").length;
    const pct = recs.length > 0 ? Math.round(recs.reduce((sum, a) => sum + a.progress, 0) / recs.length) : 0;
    return { ...s, total: recs.length, overdue: ov, dueSoon: ds, pct };
  });

  // Live audits by status (parallels "Open incidents by status")
  const liveByStatus = [
    { label: "Overdue",   count: overdue.length, params: { status: "overdue" },     tone: "text-destructive" },
    { label: "Due soon",  count: dueSoon.length, params: { status: "in_progress" }, tone: "text-warning" },
    { label: "On track",  count: onTrack.length, params: { status: "in_progress" }, tone: "text-success" },
  ];

  // Findings by severity (across all open + recent completed)
  const allFindings = filtered.flatMap((a) => a.findingsList ?? []);
  const sevOrder = [
    { label: "High",   key: "High",   color: "bg-destructive" },
    { label: "Medium", key: "Medium", color: "bg-warning" },
    { label: "Low",    key: "Low",    color: "bg-success" },
  ];
  const bySeverity = sevOrder.map((s) => {
    const count = allFindings.filter((f) => f.severity === s.key).length;
    const pct = allFindings.length > 0 ? Math.round((count / allFindings.length) * 100) : 0;
    return { ...s, count, pct };
  });

  // Actions by site
  const actionsBySite = scopedSiteOrder.map((s) => {
    const recs = filtered.filter((a) => a.site === s.site);
    const open = recs.reduce((n, a) => n + (a.actions?.filter((ac) => ac.status !== "Closed").length ?? 0), 0);
    const ov = recs.reduce((n, a) => n + (a.actions?.filter((ac) => ac.status === "Open").length ?? 0), 0);
    return { site: s.site, open, overdue: ov };
  });

  // Hotspots — repeated finding themes (mocked from finding text patterns)
  const HOTSPOT_DEFS = [
    { area: "Oakfield · Fire doors (Unit B)",        site: "East Cork",  type: "Fire Safety",  match: (t: string) => /fire door/i.test(t) },
    { area: "Elmgrove · Emergency lighting",         site: "West Waterford",  type: "Health & Safety", match: (t: string) => /emergency light/i.test(t) },
    { area: "Riverside · Medication CD register",    site: "West Waterford", type: "Medication",   match: (t: string) => /cd register|controlled drug/i.test(t) },
  ];
  const hotspots = HOTSPOT_DEFS
    .filter((h) => allowedSites.has(h.site))
    .map((h) => ({
      ...h,
      incidents: filtered
        .filter((a) => a.site === h.site)
        .flatMap((a) => a.findingsList ?? [])
        .filter((f) => h.match(f.title)).length,
    }))
    .filter((h) => h.incidents > 0);

  // Overdue audits list (parallels "Overdue actions")
  const overdueList = [...overdue].sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  const maxMonthly = Math.max(...monthlyData.map((m) => m.count));

  // --- Unified compliance model -------------------------------------------
  // Everything (trend chart, scorecard, overall, previous) derives from one
  // deterministic per-day series so longer periods aggregate more samples
  // and values reconcile across views.
  const SITE_META: Record<string, { short: string; color: string; baseline: number }> = {
    "East Cork":  { short: "East Cork",  color: "hsl(var(--primary))",       baseline: 96 },
    "West Waterford": { short: "W. Waterford", color: "hsl(var(--warning))",       baseline: 91 },
  };

  const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

  const seeded = (seed: string) => {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000) / 1000;
  };

  const THEMES = [
    { label: "Falls Prevention",            match: /falls/i },
    { label: "Medication Management",       match: /medication/i },
    { label: "Infection & Hand Hygiene",    match: /infection|hand hygiene/i },
    { label: "Fire Safety",                 match: /fire/i },
    { label: "Health & Safety",             match: /health & safety|environment/i },
    { label: "Care Planning",               match: /care plan/i },
    { label: "Safeguarding",                match: /safeguard|protection/i },
    { label: "Complaints Handling",         match: /complaint/i },
    { label: "Training & Staff Development",match: /training|staff/i },
    { label: "Documentation Control",       match: /documentation/i },
  ];

  // Deterministic per-day compliance score for (site, theme, dayOffset).
  // Composed of a stable baseline, a per-theme bias, a slow per-month drift
  // (so different windows produce genuinely different averages), and small
  // daily noise. Never seeded by the active period.
  const dailyScore = (site: string, themeLabel: string, dayOffset: number) => {
    const meta = SITE_META[site];
    if (!meta) return 90;
    const themeBias = (seeded(`${themeLabel}-bias`) - 0.5) * 4; // ±2
    // Calendar-month index (relative to today), so monthly buckets line up.
    const d = new Date(today); d.setDate(today.getDate() - dayOffset);
    const calMonth = d.getFullYear() * 12 + d.getMonth();
    // Site-wide month drift (shared across themes) so monthly averages actually
    // move ±2–3% month-to-month instead of averaging out to a flat line.
    const siteMonthBias = (seeded(`${site}|cm${calMonth}`) - 0.5) * 6; // ±3
    const themeMonthBias = (seeded(`${site}|${themeLabel}|cm${calMonth}`) - 0.5) * 6; // ±3 per theme
    const daily = (seeded(`${site}|${themeLabel}|d${dayOffset}`) - 0.5) * 6; // ±3
    // Real overdue audits drag the score down on the days they sit unresolved.
    const overdueHit = filtered.some(
      (a) => a.site === site && a.status === "Overdue" &&
        THEMES.find((t) => t.label === themeLabel)?.match.test(a.templateName),
    ) ? -5 : 0;
    return clamp(Math.round(meta.baseline + themeBias + siteMonthBias + themeMonthBias + daily + overdueHit));
  };

  // Days covered by the active period.
  const today = useMemo(() => new Date(), []);
  const periodDays = useMemo(() => {
    if (period === "7d") return 7;
    if (period === "30d") return 30;
    if (period === "90d") return 90;
    // ytd: days since Jan 1
    const start = new Date(today.getFullYear(), 0, 1);
    return Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1);
  }, [period, today]);

  const periodBuckets = useMemo(() => {
    const fmtDay = (d: Date) => d.toLocaleDateString("en-IE", { day: "2-digit", month: "short" });
    const fmtMonth = (d: Date) => d.toLocaleDateString("en-IE", { month: "short" });
    // Each bucket covers `size` consecutive days; the bucket's endOffset is
    // the dayOffset (from today) of its most recent day.
    if (period === "7d") {
      return Array.from({ length: 7 }, (_, i) => {
        const endOffset = 6 - i;
        const d = new Date(today); d.setDate(today.getDate() - endOffset);
        return { key: `d${i}`, label: fmtDay(d), endOffset, size: 1 };
      });
    }
    if (period === "30d") {
      return Array.from({ length: 6 }, (_, i) => {
        const endOffset = (5 - i) * 5;
        const d = new Date(today); d.setDate(today.getDate() - endOffset);
        return { key: `w${i}`, label: fmtDay(d), endOffset, size: 5 };
      });
    }
    if (period === "90d") {
      return Array.from({ length: 12 }, (_, i) => {
        const endOffset = (11 - i) * 7;
        const d = new Date(today); d.setDate(today.getDate() - endOffset);
        return { key: `w${i}`, label: fmtDay(d), endOffset, size: 7 };
      });
    }
    const monthsCount = today.getMonth() + 1;
    return Array.from({ length: monthsCount }, (_, i) => {
      const d = new Date(today.getFullYear(), i, 1);
      const next = new Date(today.getFullYear(), i + 1, 1);
      const endDate = i === monthsCount - 1 ? today : new Date(next.getTime() - 86400000);
      const endOffset = Math.floor((today.getTime() - endDate.getTime()) / 86400000);
      const size = Math.floor((Math.min(next.getTime(), today.getTime() + 86400000) - d.getTime()) / 86400000);
      return { key: `m${i}`, label: fmtMonth(d), endOffset, size: Math.max(1, size) };
    });
  }, [period, today]);

  const sitesForChart = scopedSiteOrder.filter((s) => {
    if (siteFilter === "all") return true;
    const map: Record<string, string> = { oakfield: "East Cork", riverside: "West Waterford", elmgrove: "West Waterford" };
    return s.site === map[siteFilter];
  });

  // Average dailyScore for a site across all themes over a [startOffset, endOffset] window (inclusive).
  const siteAvgOverDays = (site: string, startOffset: number, endOffset: number) => {
    let sum = 0, n = 0;
    for (let d = startOffset; d <= endOffset; d++) {
      THEMES.forEach((t) => { sum += dailyScore(site, t.label, d); n++; });
    }
    return n ? sum / n : 0;
  };

  // Trend chart: bucket value = avg dailyScore across themes within bucket's days.
  const complianceData = useMemo(() => {
    return periodBuckets.map((b) => {
      const row: Record<string, string | number> = { label: b.label };
      const start = b.endOffset;
      const end = b.endOffset + b.size - 1;
      sitesForChart.forEach((s) => {
        const meta = SITE_META[s.site];
        row[meta.short] = Math.round(siteAvgOverDays(s.site, start, end));
      });
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodBuckets, siteFilter, scopedSiteOrder.map((s) => s.site).join("|")]);

  // Scorecard cell: avg dailyScore for (site, theme) across the full period window.
  const scoreFor = (themeLabel: string, site: string) => {
    let sum = 0;
    for (let d = 0; d < periodDays; d++) sum += dailyScore(site, themeLabel, d);
    return Math.round(sum / periodDays);
  };

  const scorecardSites = sitesForChart;
  const themeRows = useMemo(() => THEMES.map((t) => {
    const perSite = scorecardSites.map((s) => ({
      site: s.site,
      short: SITE_META[s.site].short,
      score: scoreFor(t.label, s.site),
    }));
    const overall = perSite.length
      ? Math.round(perSite.reduce((n, x) => n + x.score, 0) / perSite.length)
      : 0;
    return { ...t, perSite, overall };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [periodDays, siteFilter, scopedSiteOrder.map((s) => s.site).join("|")]);

  const siteOverall = useMemo(() => scorecardSites.map((s) => {
    const scores = themeRows.map((r) => r.perSite.find((p) => p.site === s.site)?.score ?? 0);
    const avg = scores.length ? Math.round(scores.reduce((n, x) => n + x, 0) / scores.length) : 0;
    return { site: s.site, short: SITE_META[s.site].short, score: avg };
  }), [themeRows, scorecardSites]);

  const overallScore = siteOverall.length
    ? Math.round(siteOverall.reduce((n, x) => n + x.score, 0) / siteOverall.length)
    : 0;

  // Previous period: same window shifted back by periodDays.
  const previousScore = useMemo(() => {
    if (scorecardSites.length === 0) return 0;
    const siteAvgs = scorecardSites.map((s) => siteAvgOverDays(s.site, periodDays, periodDays * 2 - 1));
    return Math.round(siteAvgs.reduce((n, x) => n + x, 0) / siteAvgs.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDays, siteFilter, scopedSiteOrder.map((s) => s.site).join("|")]);

  const delta = overallScore - previousScore;

  const periodLabel: Record<string, string> = {
    "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", "ytd": "Year to date",
  };

  const scoreTone = (v: number) => {
    if (v >= 95) return { text: "text-success", bg: "bg-success/10", border: "border-success/20", dot: "bg-success" };
    if (v >= 85) return { text: "text-warning", bg: "bg-warning/10", border: "border-warning/20", dot: "bg-warning" };
    return { text: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20", dot: "bg-destructive" };
  };





  // Shared interactive classes
  const tileInteractive =
    "group cursor-pointer transition-all hover:border-primary/40 hover:shadow-card hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const rowInteractive =
    "w-full text-left cursor-pointer rounded-lg p-3 -mx-2 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="px-4 py-8 max-w-7xl mx-auto pb-20">
      <motion.div {...fade} transition={{ duration: 0.4 }} className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Overview</h1>
          <p className="text-muted-foreground mt-1 text-sm">Live audit activity, findings and hotspots — click any tile to drill into Reporting.</p>
          <div className="mt-3"><RoleContextBanner /></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="h-9 w-[160px] rounded-xl bg-card text-xs"><Filter className="h-3.5 w-3.5 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {allowedSites.has("East Cork")  && <SelectItem value="oakfield">East Cork</SelectItem>}
              {allowedSites.has("West Waterford") && <SelectItem value="riverside">West Waterford</SelectItem>}
              {allowedSites.has("West Waterford")  && <SelectItem value="elmgrove">West Waterford</SelectItem>}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-9 w-[130px] rounded-xl bg-card text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="ytd">Year to date</SelectItem>
            </SelectContent>
          </Select>
          <Button asChild size="sm" variant="outline" className="h-9 rounded-xl text-xs">
            <Link to="/app/audits/templates"><FileText className="h-3.5 w-3.5 mr-1" /> Templates</Link>
          </Button>
          <Button asChild size="sm" className="h-9 rounded-xl text-xs font-semibold">
            <Link to="/app/audits/my"><ClipboardList className="h-3.5 w-3.5 mr-1" /> My audits</Link>
          </Button>
        </div>
      </motion.div>


      {/* Compliance scorecard — multi-site governance snapshot */}
      <motion.div {...fade} transition={{ delay: 0.04, duration: 0.4 }} className="mt-6 bg-card rounded-2xl border border-border shadow-card overflow-hidden">
        {/* Top summary */}
        <div className="p-6 bg-gradient-to-br from-primary/[0.04] to-transparent">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" /> Compliance scorecard
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {periodLabel[period]} · expand for theme × site breakdown
              </p>
            </div>
            <div className="flex items-stretch gap-3 flex-wrap">
              <button
                onClick={() => goReg({})}
                className={`group rounded-xl border ${scoreTone(overallScore).border} ${scoreTone(overallScore).bg} px-5 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Overall score</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className={`text-3xl font-heading font-bold tabular-nums ${scoreTone(overallScore).text}`}>{overallScore}%</span>
                  <span className={`text-xs font-semibold inline-flex items-center gap-0.5 ${delta >= 0 ? "text-success" : "text-destructive"}`}>
                    {delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {Math.abs(delta)} pts
                  </span>
                </div>
              </button>
              <div className="rounded-xl border border-border bg-background px-5 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Previous period</p>
                <p className="text-3xl font-heading font-bold text-muted-foreground tabular-nums mt-0.5">{previousScore}%</p>
              </div>
              {siteOverall.map((s) => {
                const tone = scoreTone(s.score);
                return (
                  <button
                    key={s.site}
                    onClick={() => goReg({ site: s.site })}
                    className={`rounded-xl border ${tone.border} ${tone.bg} px-5 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{s.short}</p>
                    <p className={`text-3xl font-heading font-bold tabular-nums mt-0.5 ${tone.text}`}>{s.score}%</p>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => setScorecardOpen((v) => !v)}
            aria-expanded={scorecardOpen}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1"
          >
            {scorecardOpen ? "Hide" : "Show"} theme × site breakdown
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${scorecardOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        {scorecardOpen && (
          <>
            <div className="border-t border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-6 py-3">Theme</th>
                    <th className="text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-3 py-3 w-28">
                      <button onClick={() => goReg({})} className="hover:text-foreground transition-colors">Overall</button>
                    </th>
                    {scorecardSites.map((s) => {
                      const so = siteOverall.find((x) => x.site === s.site);
                      const tone = scoreTone(so?.score ?? 0);
                      return (
                        <th key={s.site} className="text-center px-3 py-3 w-32">
                          <button
                            onClick={() => goReg({ site: s.site })}
                            className="group inline-flex flex-col items-center gap-0.5 hover:text-foreground transition-colors"
                          >
                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide group-hover:text-foreground">{SITE_META[s.site].short}</span>
                            <span className={`text-xs font-bold tabular-nums ${tone.text}`}>{so?.score ?? 0}%</span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {themeRows.map((row, i) => {
                    const overallTone = scoreTone(row.overall);
                    return (
                      <tr key={row.label} className={`border-b border-border/60 last:border-0 hover:bg-secondary/20 transition-colors ${i % 2 === 1 ? "bg-secondary/10" : ""}`}>
                        <td className="px-6 py-3">
                          <button
                            onClick={() => goReg({ q: row.label })}
                            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors text-left"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${overallTone.dot}`} />
                            {row.label}
                          </button>
                        </td>
                        <td className="text-center px-3 py-3">
                          <button
                            onClick={() => goReg({ q: row.label })}
                            className={`inline-flex min-w-[3.25rem] justify-center rounded-md px-2 py-1 text-xs font-bold tabular-nums transition-all hover:scale-105 ${overallTone.bg} ${overallTone.text}`}
                          >
                            {row.overall}%
                          </button>
                        </td>
                        {row.perSite.map((cell) => {
                          const tone = scoreTone(cell.score);
                          return (
                            <td key={cell.site} className="text-center px-3 py-3">
                              <button
                                onClick={() => goReg({ site: cell.site, q: row.label })}
                                title={`${row.label} · ${cell.short} — drill into evidence`}
                                className={`inline-flex min-w-[3.25rem] justify-center rounded-md px-2 py-1 text-xs font-bold tabular-nums transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone.bg} ${tone.text}`}
                              >
                                {cell.score}%
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="px-6 py-3 border-t border-border bg-secondary/20 flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
              <span className="font-medium uppercase tracking-wide">Legend</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> 95%+ strong</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" /> 85–94% caution</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-destructive" /> &lt;85% attention</span>
            </div>
          </>
        )}
      </motion.div>


      {/* Audit compliance trend */}
      <motion.div {...fade} transition={{ delay: 0.05, duration: 0.4 }} className="mt-6 bg-card rounded-2xl border border-border shadow-card p-6">

        <div className="flex items-start justify-between flex-wrap gap-2 mb-4">
          <div>
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Audit compliance by site
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              % of audit checks passed · {periodLabel[period]}
              {siteFilter !== "all" && " · filtered to selected site"}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {sitesForChart.map((s) => {
              const meta = SITE_META[s.site];
              return (
                <div key={s.site} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                  {meta.short}
                </div>
              );
            })}
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={complianceData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={[80, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={42} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${v}%`, ""]}
              />
              {sitesForChart.map((s) => {
                const meta = SITE_META[s.site];
                return (
                  <Line
                    key={s.site}
                    type="monotone"
                    dataKey={meta.short}
                    stroke={meta.color}
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 0, fill: meta.color }}
                    activeDot={{ r: 5 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* KPI tiles */}
      <motion.div {...fade} transition={{ delay: 0.08, duration: 0.4 }} className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <button
            key={s.key}
            onClick={() => goReg(s.params)}
            className={`bg-card rounded-xl p-4 border border-border shadow-soft text-left ${tileInteractive}`}
          >
            <div className="flex items-center justify-between mb-2">
              <s.icon className={`h-5 w-5 ${s.tone}`} />
              <div className="flex items-center gap-1">
                {s.change && <span className="text-xs text-muted-foreground font-medium">{s.change}</span>}
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <p className="text-2xl font-heading font-bold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </button>
        ))}
      </motion.div>

      {/* Awaiting your sign-off — surfaced near the top, like an alert banner */}
      {awaitingSignoff.length > 0 && (
        <motion.div {...fade} transition={{ delay: 0.1 }} className="mt-4 bg-card rounded-2xl border border-warning/30 shadow-soft p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-warning" /> Awaiting your sign-off
              <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20 font-semibold ml-1">{awaitingSignoff.length}</Badge>
            </h2>
          </div>
          <div className="space-y-2">
            {awaitingSignoff.map((r) => {
              const failCount = r.items.filter((i) => i.outcome === "fail").length;
              return (
                <Link
                  key={r.id}
                  to={`/app/audits/reporting?openId=${r.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-warning/5 border border-warning/15 hover:bg-warning/10 hover:border-warning/30 transition-colors"
                >
                  <ShieldCheck className="h-4 w-4 text-warning shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{r.templateName}</p>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap items-center">
                      <span className="font-mono">{r.id}</span>
                      <span>{r.site}</span>
                      <span>Submitted by {r.signedOffBy}</span>
                      {failCount > 0 && (
                        <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 font-semibold">{failCount} finding{failCount === 1 ? "" : "s"}</Badge>
                      )}
                    </div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-warning shrink-0" />
                </Link>
              );
            })}
          </div>
        </motion.div>
      )}

      <div className="mt-6 grid lg:grid-cols-2 gap-6">
        {/* By category */}
        <motion.div {...fade} transition={{ delay: 0.12, duration: 0.4 }} className="bg-card rounded-2xl shadow-card border border-border p-6">
          <h2 className="font-heading font-semibold text-foreground mb-4">By category</h2>
          <div className="space-y-1">
            {byCategory.map((c) => (
              <button
                key={c.category}
                onClick={() => goReg({ category: c.category })}
                className={rowInteractive}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{c.category}</span>
                  <div className="flex items-center gap-2">
                    {c.overdue > 0 && (
                      <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 font-semibold">{c.overdue} overdue</Badge>
                    )}
                    <span className="text-sm font-semibold text-foreground">{c.count}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(c.count / maxCategoryCount) * 100}%` }} />
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        {/* By site */}
        <motion.div {...fade} transition={{ delay: 0.16, duration: 0.4 }} className="bg-card rounded-2xl shadow-card border border-border p-6">
          <h2 className="font-heading font-semibold text-foreground mb-4">By site</h2>
          <div className="space-y-1">
            {bySite.map((s) => (
              <button
                key={s.site}
                onClick={() => goReg({ site: s.site })}
                className={rowInteractive}
              >
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="text-sm font-medium text-foreground">{s.site}</span>
                    <span className="text-xs text-muted-foreground ml-2">PIC: {s.pic}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{s.total}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${s.overdue > 0 ? "bg-destructive" : s.dueSoon > 0 ? "bg-warning" : "bg-success"}`}
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Findings by severity */}
        <motion.div {...fade} transition={{ delay: 0.18 }} className="bg-card rounded-2xl shadow-card border border-border p-6">
          <h2 className="font-heading font-semibold text-foreground mb-4">Findings by severity</h2>
          <div className="space-y-1">
            {bySeverity.map((s) => (
              <button
                key={s.label}
                onClick={() => goReg({ findings: "open", severity: s.key })}
                className={rowInteractive}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">{s.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{s.count}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className={`h-full ${s.color} rounded-full transition-all`} style={{ width: `${s.pct}%` }} />
                </div>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Live audits by status */}
        <motion.div {...fade} transition={{ delay: 0.2 }} className="bg-card rounded-2xl shadow-card border border-border p-6">
          <h2 className="font-heading font-semibold text-foreground mb-4">Live audits by status</h2>
          <div className="grid grid-cols-3 gap-3">
            {liveByStatus.map((s) => (
              <button
                key={s.label}
                onClick={() => goReg(s.params)}
                className={`bg-background rounded-xl border border-border p-4 text-center ${tileInteractive}`}
              >
                <p className={`text-2xl font-heading font-bold ${s.tone}`}>{s.count}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Monthly trend — audits completed */}
      <motion.div {...fade} transition={{ delay: 0.22, duration: 0.4 }} className="mt-6 bg-card rounded-2xl shadow-card border border-border p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-heading font-semibold text-foreground">Audits completed</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Per month · last 6 months</p>
          </div>
          <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20 font-semibold inline-flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> +14% vs Nov
          </Badge>
        </div>
        <div className="relative pl-8 pr-1">
          <div className="absolute inset-x-8 inset-y-0 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border-t border-dashed border-border/60 h-0" />
            ))}
          </div>
          <div className="absolute left-0 inset-y-0 flex flex-col justify-between text-[10px] text-muted-foreground font-medium tabular-nums">
            {[maxMonthly, Math.round(maxMonthly * 0.66), Math.round(maxMonthly * 0.33), 0].map((v, i) => (
              <span key={i} className="leading-none">{v}</span>
            ))}
          </div>
          <div className="relative flex items-end gap-4 h-44">
            {monthlyData.map((m, i) => {
              const heightPx = Math.max(6, Math.round((m.count / maxMonthly) * 160));
              const isLatest = i === monthlyData.length - 1;
              return (
                <button
                  key={m.month}
                  onClick={() => goReg({ status: "completed", month: m.key })}
                  title={`${m.count} audits completed in ${m.month}`}
                  className="group flex-1 flex flex-col items-center justify-end h-full relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                >
                  <span className="text-[11px] font-semibold text-foreground mb-1.5 tabular-nums opacity-80 group-hover:opacity-100 transition-opacity">{m.count}</span>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${heightPx}px` }}
                    transition={{ duration: 0.6, delay: 0.1 + i * 0.06, ease: "easeOut" }}
                    className={`w-full max-w-[42px] rounded-t-md transition-colors ${
                      isLatest
                        ? "bg-gradient-to-t from-primary to-primary/70 group-hover:from-primary group-hover:to-primary/80"
                        : "bg-gradient-to-t from-primary/55 to-primary/35 group-hover:from-primary/85 group-hover:to-primary/55"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <div className="flex gap-4 mt-2">
            {monthlyData.map((m) => (
              <span key={m.month} className="flex-1 text-center text-[11px] text-muted-foreground font-medium">{m.month}</span>
            ))}
          </div>
        </div>
      </motion.div>

      <div className="mt-6 grid lg:grid-cols-2 gap-6">
        {/* Follow-up actions by site */}
        <motion.div {...fade} transition={{ delay: 0.26 }} className="bg-card rounded-2xl shadow-card border border-border p-6">
          <h2 className="font-heading font-semibold text-foreground flex items-center gap-2 mb-4">
            <ListTodo className="h-5 w-5 text-primary" /> Follow-up actions by site
          </h2>
          <div className="space-y-2">
            {actionsBySite.map((a) => (
              <div
                key={a.site}
                className="flex items-center justify-between p-3 rounded-lg bg-background border border-border hover:border-primary/30 transition-colors"
              >
                <button
                  onClick={() => goReg({ site: a.site, actions: "open" })}
                  className="text-sm font-medium text-foreground hover:text-primary transition-colors text-left"
                >
                  {a.site}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => goReg({ site: a.site, actions: "open" })}
                    className="cursor-pointer"
                  >
                    <Badge variant="outline" className="text-[10px] hover:bg-secondary transition-colors">{a.open} open</Badge>
                  </button>
                  {a.overdue > 0 && (
                    <button
                      onClick={() => goReg({ site: a.site, actions: "overdue" })}
                      className="cursor-pointer"
                    >
                      <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/15 transition-colors">{a.overdue} overdue</Badge>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Hotspots — repeat finding patterns */}
        <motion.div {...fade} transition={{ delay: 0.28 }} className="bg-card rounded-2xl shadow-card border border-border p-6">
          <h2 className="font-heading font-semibold text-foreground flex items-center gap-2 mb-4">
            <Flame className="h-5 w-5 text-destructive" /> Repeat finding patterns
          </h2>
          {hotspots.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No repeat patterns detected.</p>
          ) : (
            <div className="space-y-2">
              {hotspots.map((h) => (
                <button
                  key={h.area}
                  onClick={() => goReg({ site: h.site, findings: "open" })}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 hover:border-destructive/30 transition-colors text-left cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{h.area}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{h.type}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 font-semibold">{h.incidents} finding{h.incidents === 1 ? "" : "s"}</Badge>
                    <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Overdue audits */}
      <motion.div {...fade} transition={{ delay: 0.3, duration: 0.4 }} className="mt-6 bg-card rounded-2xl shadow-card border border-border p-6">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-destructive" />
          Overdue audits
        </h2>
        {overdueList.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nothing overdue. Nice work.</p>
        ) : (
          <div className="space-y-2">
            {overdueList.map((a) => (
              <button
                key={a.id}
                onClick={() => navigate(`/app/audits/reporting?openId=${a.id}`)}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 hover:border-destructive/30 transition-colors text-left cursor-pointer"
              >
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{a.templateName} — {a.site}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap items-center">
                    <span className="font-mono">{a.id}</span>
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{a.site}</span>
                    <span>{a.assignedTo}</span>
                    <span className="text-destructive font-medium">Due {a.dueDate}</span>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-destructive shrink-0" />
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Audits;
