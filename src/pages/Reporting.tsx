import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, Clock, ArrowUpRight, CheckCircle2, Sparkles,
  MapPin, ShieldAlert, Inbox, FolderOpen, ChevronRight, Check,
  ChevronDown, Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRole } from "@/hooks/useRole";
import { scopedSiteIds } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";
import { SITE_BY_ID, type SiteId } from "@/lib/demoDataRegistry";
import {
  DATE_RANGE_LABELS,
  computeCategoryRows,
  computeHotspots,
  computeOverdueActionRows,
  computeOverviewMetrics,
  computeSeverityRows,
  computeSiteRiskRows,
  getFilteredEventsForOverview,
  reportingSearchParams,
  type OverviewDateRange,
} from "@/lib/overviewFilters";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

const sevBadge = (sev: string) => {
  if (sev === "High" || sev === "Critical")
    return <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 font-semibold">{sev}</Badge>;
  if (sev === "Moderate")
    return <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20 font-semibold">{sev}</Badge>;
  return <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20 font-semibold">{sev}</Badge>;
};

const Reporting = () => {
  const navigate = useNavigate();
  const role = useRole();

  // Sites this role can see (permission source of truth).
  const allowedSiteIds = useMemo<SiteId[]>(() => scopedSiteIds(role), [role]);

  // Multi-select site filter — defaults to all allowed sites.
  const [selectedSiteIds, setSelectedSiteIds] = useState<SiteId[]>(allowedSiteIds);
  const [dateRange, setDateRange] = useState<OverviewDateRange>("last_30_days");

  // Reset if scope changes (e.g. role switcher).
  useEffect(() => {
    const inScope = selectedSiteIds.filter((s) => allowedSiteIds.includes(s));
    if (inScope.length === 0) setSelectedSiteIds(allowedSiteIds);
    else if (inScope.length !== selectedSiteIds.length) setSelectedSiteIds(inScope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedSiteIds.join(",")]);

  // Ensure at least one site is selected — fall back to all allowed.
  const effectiveSiteIds = selectedSiteIds.length ? selectedSiteIds : allowedSiteIds;

  const filters = { selectedSiteIds: effectiveSiteIds, dateRange };

  // Shared filtered dataset — every card/table below reads from this.
  const filteredEvents = useMemo(
    () => getFilteredEventsForOverview(filters),
    [filters.selectedSiteIds.join(","), filters.dateRange],
  );

  const metrics = useMemo(() => computeOverviewMetrics(filteredEvents), [filteredEvents]);
  const siteRiskRows = useMemo(() => computeSiteRiskRows(filters), [filters.selectedSiteIds.join(","), filters.dateRange]);
  const hotspots = useMemo(() => computeHotspots(filteredEvents).slice(0, 6), [filteredEvents]);
  const overdueRows = useMemo(() => computeOverdueActionRows(filteredEvents).slice(0, 5), [filteredEvents]);
  const categoryRows = useMemo(() => computeCategoryRows(filteredEvents), [filteredEvents]);
  const severityRows = useMemo(() => computeSeverityRows(filteredEvents), [filteredEvents]);

  const isEmpty = filteredEvents.length === 0;

  // Site dropdown label
  const siteLabel = (() => {
    if (effectiveSiteIds.length === allowedSiteIds.length) return "All sites";
    if (effectiveSiteIds.length === 1) return SITE_BY_ID[effectiveSiteIds[0]]?.name ?? effectiveSiteIds[0];
    return `${effectiveSiteIds.length} sites selected`;
  })();

  const toggleSite = (id: SiteId) => {
    setSelectedSiteIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };
  const selectAllSites = () => setSelectedSiteIds([...allowedSiteIds]);

  const goReporting = (extra: Record<string, string> = {}) => {
    const p = reportingSearchParams(filters, extra);
    const search = new URLSearchParams(p).toString();
    navigate(`/app/incidents/reporting${search ? `?${search}` : ""}`);
  };

  const kpiParams = (key: string): Record<string, string> => {
    switch (key) {
      case "awaiting": return { status: "Awaiting Review" };
      case "high":     return { severity: "High,Critical", status: "open" };
      case "overdue":  return { actions: "overdue" };
      case "open":     return { status: "open" };
      case "closed":   return { status: "Closed" };
      default:         return {};
    }
  };

  const kpis = [
    { key: "awaiting", label: "Awaiting review",      value: metrics.awaitingReview,    icon: Inbox,         tone: "text-primary",     tile: "bg-primary/10",     border: "" },
    { key: "high",     label: "High / critical open", value: metrics.highCriticalOpen,  icon: ShieldAlert,   tone: "text-destructive", tile: "bg-destructive/10", border: "border-destructive/20" },
    { key: "overdue",  label: "Overdue actions",      value: metrics.overdueActions,    icon: AlertTriangle, tone: "text-warning",     tile: "bg-warning/10",     border: "border-warning/20" },
    { key: "open",     label: "Open events",          value: metrics.openCount,         icon: FolderOpen,    tone: "text-primary",     tile: "bg-primary/10",     border: "" },
    { key: "closed",   label: "Closed this period",   value: metrics.closedThisPeriod,  icon: CheckCircle2,  tone: "text-success",     tile: "bg-success/10",     border: "" },
  ];

  const tileInteractive =
    "group cursor-pointer transition-all hover:border-primary/40 hover:shadow-card hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const rowInteractive =
    "w-full text-left cursor-pointer rounded-lg p-3 -mx-2 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const maxCategory = Math.max(1, ...categoryRows.map((c) => c.count));
  const maxSeverity = Math.max(1, ...severityRows.map((s) => s.count));

  return (
    <div className="px-4 py-8 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <motion.div {...fade} transition={{ duration: 0.4 }} className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Events overview</h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Live event visibility, follow-up pressure and repeat pattern review — every tile updates as you change site or date range.
          </p>
          <div className="mt-3"><RoleContextBanner /></div>
        </div>
        <div className="flex gap-2">
          {/* Multi-select site dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 min-w-[180px] justify-between rounded-xl bg-card text-xs">
                <span className="truncate">{siteLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60 ml-2" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[220px] p-1">
              <button
                type="button"
                onClick={selectAllSites}
                className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm hover:bg-accent"
              >
                <span>All sites</span>
                {effectiveSiteIds.length === allowedSiteIds.length && <Check className="h-4 w-4 text-primary" />}
              </button>
              <div className="h-px bg-border my-1" />
              {allowedSiteIds.map((id) => {
                const selected = selectedSiteIds.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleSite(id)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-sm hover:bg-accent"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-4 w-4 rounded border ${selected ? "bg-primary border-primary" : "border-input"} flex items-center justify-center`}>
                        {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                      </span>
                      {SITE_BY_ID[id]?.name ?? id}
                    </span>
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>

          {/* Date range */}
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as OverviewDateRange)}>
            <SelectTrigger className="h-9 w-[150px] rounded-xl bg-card text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="last_7_days">Last 7 days</SelectItem>
              <SelectItem value="last_30_days">Last 30 days</SelectItem>
              <SelectItem value="last_90_days">Last 90 days</SelectItem>
              <SelectItem value="year_to_date">Year to date</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Empty state */}
      {isEmpty ? (
        <motion.div {...fade} transition={{ delay: 0.08, duration: 0.4 }} className="mt-8 bg-card rounded-2xl border border-dashed border-border p-10 text-center">
          <Info className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">No events match the selected filters.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Try widening the date range or selecting more sites.
          </p>
          <p className="text-[11px] text-muted-foreground mt-3">
            Filters: {siteLabel} · {DATE_RANGE_LABELS[dateRange]}
          </p>
        </motion.div>
      ) : (
      <>
      {/* Row 1 — KPI cards */}
      <motion.div {...fade} transition={{ delay: 0.08, duration: 0.4 }} className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <button
            key={k.key}
            onClick={() => goReporting(kpiParams(k.key))}
            className={`bg-card rounded-xl p-4 border ${k.border || "border-border"} shadow-soft text-left ${tileInteractive}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`h-8 w-8 rounded-lg ${k.tile} flex items-center justify-center`}>
                <k.icon className={`h-4 w-4 ${k.tone}`} />
              </div>
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-2xl font-heading font-bold text-foreground">{k.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
          </button>
        ))}
      </motion.div>

      {/* Row 2 — Site risk summary */}
      <motion.section {...fade} transition={{ delay: 0.1, duration: 0.4 }} className="mt-6 bg-card rounded-2xl shadow-card border border-border p-6">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-heading font-semibold text-foreground">Site risk summary</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Comparing {siteRiskRows.length === 1 ? siteRiskRows[0].siteName : `${siteRiskRows.length} sites`} · {DATE_RANGE_LABELS[dateRange]}
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="py-2 pr-4 font-medium">Site</th>
                <th className="py-2 pr-4 font-medium text-right">Reported</th>
                <th className="py-2 pr-4 font-medium text-right">Open</th>
                <th className="py-2 pr-4 font-medium text-right">High/Critical open</th>
                <th className="py-2 pr-4 font-medium text-right">Overdue actions</th>
                <th className="py-2 pr-4 font-medium text-right">Hotspots</th>
                <th className="py-2 w-6" />
              </tr>
            </thead>
            <tbody>
              {siteRiskRows.map((s) => {
                const numBtn = "ml-auto inline-flex items-center justify-end min-w-[2.5rem] px-1.5 py-0.5 rounded-md tabular-nums font-medium text-foreground hover:text-primary hover:bg-primary/10 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors";
                const stop = (e: React.MouseEvent) => e.stopPropagation();
                const goSite = (extra: Record<string, string> = {}) => {
                  const p = reportingSearchParams({ selectedSiteIds: [s.siteId], dateRange }, extra);
                  navigate(`/app/incidents/reporting?${new URLSearchParams(p).toString()}`);
                };
                return (
                  <tr
                    key={s.siteId}
                    onClick={() => goSite()}
                    className="border-b border-border/60 last:border-0 cursor-pointer hover:bg-secondary/40 transition-colors group"
                  >
                    <td className="py-3 pr-4 font-medium text-foreground">{s.siteName}</td>
                    <td className="py-3 pr-4 text-right">
                      <button onClick={(e) => { stop(e); goSite(); }} className={numBtn}>{s.reported}</button>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <button onClick={(e) => { stop(e); goSite({ status: "open" }); }} className={numBtn}>{s.open}</button>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {s.highCriticalOpen > 0
                        ? <button onClick={(e) => { stop(e); goSite({ status: "open", severity: "High,Critical" }); }} className="inline-flex items-center justify-center rounded-md hover:ring-2 hover:ring-destructive/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all">
                            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 font-semibold tabular-nums cursor-pointer hover:underline underline-offset-2">{s.highCriticalOpen}</Badge>
                          </button>
                        : <span className="text-muted-foreground tabular-nums">0</span>}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {s.overdueActions > 0
                        ? <button onClick={(e) => { stop(e); goSite({ actions: "overdue" }); }} className="inline-flex items-center justify-center rounded-md hover:ring-2 hover:ring-warning/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all">
                            <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20 font-semibold tabular-nums cursor-pointer hover:underline underline-offset-2">{s.overdueActions}</Badge>
                          </button>
                        : <span className="text-muted-foreground tabular-nums">0</span>}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <button onClick={(e) => { stop(e); goSite({ hotspot: "true" }); }} className={numBtn}>{s.hotspots}</button>
                    </td>
                    <td className="py-3 text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity inline-block" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.section>

      {/* Row 3 — Hotspots */}
      <motion.section {...fade} transition={{ delay: 0.12, duration: 0.4 }} className="mt-6 bg-card rounded-2xl shadow-card border border-border p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-heading font-semibold text-foreground">Repeat patterns &amp; hotspots</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Suggested clusters within the selected filters — click any row to see the underlying events.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] bg-secondary/60 border-border text-muted-foreground font-medium">
            {DATE_RANGE_LABELS[dateRange]}
          </Badge>
        </div>

        {hotspots.length === 0 ? (
          <p className="mt-4 text-xs text-muted-foreground">No repeat clusters detected in this period.</p>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {hotspots.map((h, i) => (
              <button
                key={`${h.siteId}-${h.location}-${h.category}-${i}`}
                onClick={() =>
                  navigate(
                    `/app/incidents/reporting?${new URLSearchParams(
                      reportingSearchParams(
                        { selectedSiteIds: [h.siteId], dateRange },
                        { category: h.category, location: h.location },
                      ),
                    ).toString()}`,
                  )
                }
                className="group text-left rounded-xl border border-border bg-background p-3.5 hover:border-primary/40 hover:shadow-card hover:-translate-y-0.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center shrink-0">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <Badge variant="outline" className="text-[10px] bg-secondary/60 border-border text-muted-foreground font-medium">Location</Badge>
                      <Badge variant="outline" className="text-[10px] bg-secondary/60 border-border text-muted-foreground font-medium tabular-nums">{h.count} events</Badge>
                    </div>
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {h.siteName} · {h.location} · {h.count} {h.category.toLowerCase()}
                    </p>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        )}
      </motion.section>

      {/* Row 4 — By category + By severity */}
      <div className="mt-6 grid lg:grid-cols-2 gap-6">
        <motion.div {...fade} transition={{ delay: 0.16, duration: 0.4 }} className="bg-card rounded-2xl shadow-card border border-border p-6">
          <h2 className="font-heading font-semibold text-foreground mb-4">By category</h2>
          {categoryRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events in this period.</p>
          ) : (
            <div className="space-y-1">
              {categoryRows.map((c) => {
                const pct = (c.count / maxCategory) * 100;
                return (
                  <button
                    key={c.category}
                    onClick={() => goReporting({ category: c.category })}
                    className={rowInteractive}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{c.category}</span>
                      <span className="text-sm font-semibold text-foreground tabular-nums">{c.count}</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>

        <motion.div {...fade} transition={{ delay: 0.18, duration: 0.4 }} className="bg-card rounded-2xl shadow-card border border-border p-6">
          <h2 className="font-heading font-semibold text-foreground mb-4">By severity</h2>
          <div className="space-y-1">
            {severityRows.map((s) => {
              const pct = (s.count / maxSeverity) * 100;
              return (
                <button
                  key={s.label}
                  onClick={() => goReporting({ severity: s.key })}
                  className={rowInteractive}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{s.label}</span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">{s.count}</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full ${s.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Row 5 — Overdue actions */}
      <motion.div {...fade} transition={{ delay: 0.22, duration: 0.4 }} className="mt-6 bg-card rounded-2xl shadow-card border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5 text-destructive" />
            Overdue actions
          </h2>
          <Badge variant="outline" className="text-[10px] bg-secondary/60 border-border text-muted-foreground font-medium">
            Top 5 · {DATE_RANGE_LABELS[dateRange]}
          </Badge>
        </div>
        {overdueRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No overdue actions in this period.</p>
        ) : (
          <div className="space-y-2">
            {overdueRows.map((o) => (
              <button
                key={o.incidentId + o.action}
                onClick={() => goReporting({ expand: o.incidentId, actions: "overdue", openDetail: "true" })}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-background border border-border hover:border-destructive/30 hover:bg-destructive/5 transition-colors text-left cursor-pointer group"
              >
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{o.action} — {o.resident}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap items-center">
                    <span className="font-mono">{o.incidentId}</span>
                    <span>{o.siteName}</span>
                    {sevBadge(o.severity)}
                    <span className="text-destructive font-medium">Due {o.due}</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-8"
            onClick={() => goReporting({ actions: "overdue" })}
          >
            View all overdue actions
            <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </motion.div>
      </>
      )}
    </div>
  );
};

export default Reporting;
