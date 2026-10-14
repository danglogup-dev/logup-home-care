import { useTerms } from "@/hooks/useTerms";
import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Download, FileText, Clock, User as UserIcon, CheckCircle2, Paperclip, Building2, Calendar, Shield, Search, Filter, ArrowUpDown, Package, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { incidentRecords, getIncidentById, type IncidentRecord, type Severity } from "@/lib/incidentRecords";
import { useRole } from "@/hooks/useRole";
import { inScope } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";
import { THEMES, findSimilar } from "@/lib/incidentPatterns";
import { buildPackHtml, openIncidentPack, type PackOptions, type PackFilterSummary } from "@/lib/incidentPack";
import { IncidentDetailDrawer } from "@/components/incidents/IncidentDetailDrawer";
import { SITE_BY_ID, type SiteId } from "@/lib/demoDataRegistry";
import { dateRangeCutoff, referenceNow, type OverviewDateRange } from "@/lib/overviewFilters";

// Map Person Supported IDs to resident names for cross-module filtering.
// Full care plan records are owned by Care Planning; this map only exists so
// Events Reporting can honour a `?personSupportedId=` deep link from a care plan.
const PS_ID_TO_NAME: Record<string, string> = {
  "PS-001": "Patrick Murphy",
  "PS-002": "Mary O'Sullivan",
  "PS-003": "John Byrne",
  "PS-004": "Eileen Fitzgerald",
  "PS-005": "Tomás Ryan",
  "PS-006": "Bridget Walsh",
  "PS-007": "Michael Doyle",
};

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

type Incident = IncidentRecord;

const incidents: Incident[] = incidentRecords;

const severityBadge = (sev: Severity) => {
  const map: Record<Severity, { bg: string; text: string; border: string }> = {
    Low: { bg: "bg-success/10", text: "text-success", border: "border-success/20" },
    Moderate: { bg: "bg-warning/10", text: "text-warning", border: "border-warning/20" },
    High: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/20" },
    Critical: { bg: "bg-destructive/15", text: "text-destructive", border: "border-destructive/30" },
  };
  const s = map[sev];
  return <Badge variant="outline" className={`text-[10px] ${s.bg} ${s.text} ${s.border} font-semibold`}>{sev}</Badge>;
};

// Map "friendly" overview labels to actual filter values
const STATUS_ALIAS: Record<string, string> = {
  "New": "Awaiting Review",
  "Under review": "Awaiting Review",
  "Actions required": "Overdue",
};
const CATEGORY_ALIAS: Record<string, string> = {
  "Falls": "Fall",
  "Skin Integrity": "Skin Integrity",
};
const SEVERITY_ALIAS: Record<string, string> = {
  "High / Critical": "High",
};

const EvidenceExport = () => {
  return <EvidenceExportMain />;
};

const EvidenceExportMain = () => {
  const terms = useTerms();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useRole();




  const [siteFilter, setSiteFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");        // single-select UI value
  const [severitySet, setSeveritySet] = useState<string[]>([]);       // multi (from drill-down)
  const [statusFilter, setStatusFilter] = useState("all");            // "all" | exact status | "open"
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [residentSearch, setResidentSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actionsFilter, setActionsFilter] = useState<"all" | "overdue" | "open">("all");
  const [hotspotLabel, setHotspotLabel] = useState<string | null>(null);
  const [hotspotOnly, setHotspotOnly] = useState(false);
  const [timeframe, setTimeframe] = useState<"all" | "30d" | "7d" | "90d">("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all"); // e.g. "closed-apr-2026"
  const [recencyFilter, setRecencyFilter] = useState<"all" | "new" | "under-review">("all");
  const [themeFilter, setThemeFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<"all" | "night" | "morning" | "evening">("all");
  const [siteIdsFilter, setSiteIdsFilter] = useState<SiteId[]>([]); // from ?siteIds=

  const [detailId, setDetailId] = useState<string | null>(null);
  const [incidentIdParam, setIncidentIdParam] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<Incident | null>(null);
  const [packOpen, setPackOpen] = useState(false);
  const [packOptions, setPackOptions] = useState<PackOptions>({
    aiSummary: true, index: true, fullDetails: true,
    followUps: true, attachments: true, reviewHistory: true,
  });


  // Apply URL params on mount / when they change
  useEffect(() => {
    const site = searchParams.get("site") ?? searchParams.get("siteId");
    const severity = searchParams.get("severity");
    const status = searchParams.get("status");
    const category = searchParams.get("category") ?? searchParams.get("eventType");
    const eventSubtype = searchParams.get("eventSubtype");
    const resident = searchParams.get("resident");
    const actions = searchParams.get("actions");
    const hotspot = searchParams.get("hotspot");
    const location = searchParams.get("location");
    const month = searchParams.get("month");
    const recency = searchParams.get("recency");
    const theme = searchParams.get("theme");
    const shift = searchParams.get("shift");
    const tf = searchParams.get("timeframe");
    const df = searchParams.get("dateFrom");
    const dt = searchParams.get("dateTo");
    const incidentId = searchParams.get("incidentId");

    // Multi-site via `?siteIds=SITE-ECK,SITE-WWD` overrides single `?site=`.
    const siteIdsParam = searchParams.get("siteIds");
    if (siteIdsParam) {
      const ids = siteIdsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) as SiteId[];
      setSiteIdsFilter(ids);
      if (ids.length === 1) {
        setSiteFilter(SITE_BY_ID[ids[0]]?.name ?? "all");
      } else {
        setSiteFilter("all");
      }
    } else {
      setSiteIdsFilter([]);
      if (site) setSiteFilter(site); else setSiteFilter("all");
    }


    // Severity: support single value or comma-separated multi (e.g. "High,Critical")
    if (severity && severity.includes(",")) {
      const parts = severity.split(",").map(s => s.trim()).filter(Boolean).map(s => SEVERITY_ALIAS[s] || s);
      setSeveritySet(parts);
      setSeverityFilter("all");
    } else if (severity) {
      setSeveritySet([]);
      setSeverityFilter(SEVERITY_ALIAS[severity] || severity);
    } else {
      setSeveritySet([]);
      setSeverityFilter("all");
    }

    if (status) setStatusFilter(STATUS_ALIAS[status] || status); else setStatusFilter("all");
    if (category) setCategoryFilter(CATEGORY_ALIAS[category] || category); else setCategoryFilter("all");
    const personSupportedId = searchParams.get("personSupportedId");
    const mappedFromPerson = personSupportedId ? (PS_ID_TO_NAME[personSupportedId] ?? "") : "";
    if (resident) setResidentSearch(resident);
    else if (mappedFromPerson) setResidentSearch(mappedFromPerson);
    else if (eventSubtype) setResidentSearch(""); // subtype narrows via search text below
    else setResidentSearch("");
    if (actions === "overdue" || actions === "open") setActionsFilter(actions); else setActionsFilter("all");

    // Hotspot can be a label (legacy) or "true" (drill-down flag)
    if (hotspot === "true" || hotspot === "1") { setHotspotOnly(true); setHotspotLabel(null); }
    else { setHotspotOnly(false); setHotspotLabel(hotspot || null); }

    setLocationFilter(location || "all");
    if (month === "closed") {
      setStatusFilter("Closed");
      setMonthFilter("closed-apr-2026");
    } else if (month && /^\d{4}-\d{2}$/.test(month)) {
      setMonthFilter(month);
    } else {
      setMonthFilter("all");
    }
    if (recency === "new" || recency === "under-review") setRecencyFilter(recency); else setRecencyFilter("all");
    setThemeFilter(theme && THEMES.some(t => t.id === theme) ? theme : "all");
    if (shift === "night" || shift === "morning" || shift === "evening") setShiftFilter(shift);
    else setShiftFilter("all");
    // dateRange (from Events Overview) → mapped to existing timeframe / date fields.
    const dr = searchParams.get("dateRange") as OverviewDateRange | null;
    if (dr === "last_7_days") { setTimeframe("7d"); setDateFrom(""); setDateTo(""); }
    else if (dr === "last_30_days") { setTimeframe("30d"); setDateFrom(""); setDateTo(""); }
    else if (dr === "last_90_days") { setTimeframe("90d"); setDateFrom(""); setDateTo(""); }
    else if (dr === "year_to_date") {
      setTimeframe("all");
      const cutoff = dateRangeCutoff("year_to_date");
      const now = referenceNow();
      setDateFrom(cutoff.toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    } else {
      if (tf === "7d" || tf === "30d" || tf === "90d") setTimeframe(tf); else setTimeframe("all");
      setDateFrom(df || "");
      setDateTo(dt || "");
    }
    setIncidentIdParam(incidentId || null);
    // Auto-open full detail drawer when a specific incident is requested
    // (from care-plan deep links or `?incidentId=...&openDetail=true`).
    const expand = searchParams.get("expand") ?? incidentId;
    const openDetail = searchParams.get("openDetail");
    if (expand && (openDetail === "true" || openDetail === "1" || incidentId)) {
      setDetailId(expand);
    } else if (expand) {
      setDetailId(expand);
    }

  }, [searchParams]);


  const allCategories = Array.from(new Set(incidents.map(i => i.category)));
  const allStatuses = Array.from(new Set(incidents.map(i => i.status)));

  const filtered = incidents
    .filter((i) => !incidentIdParam || i.id === incidentIdParam)
    .filter((i) => inScope(i.site, role.role, role.scope))
    .filter((i) => siteFilter === "all" || i.site === siteFilter)
    .filter((i) => {
      if (siteIdsFilter.length === 0) return true;
      const allowedNames = siteIdsFilter.map((id) => SITE_BY_ID[id]?.name).filter(Boolean);
      return allowedNames.includes(i.site);
    })
    .filter((i) => {
      const sub = searchParams.get("eventSubtype");
      if (!sub) return true;
      const s = sub.toLowerCase();
      return i.category.toLowerCase().includes(s) || i.summary.toLowerCase().includes(s);
    })

    .filter((i) => locationFilter === "all" || i.location === locationFilter)
    .filter((i) => {
      if (severitySet.length > 0) return severitySet.includes(i.severity);
      return severityFilter === "all" || i.severity === severityFilter;
    })
    .filter((i) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "open") return i.status !== "Closed";
      return i.status === statusFilter;
    })

    .filter((i) => categoryFilter === "all" || i.category === categoryFilter)
    .filter((i) => !residentSearch || i.resident.toLowerCase().includes(residentSearch.toLowerCase()))
    .filter((i) => {
      if (actionsFilter === "overdue") {
        // Strict: status is Overdue (matches the Overview "Overdue actions" KPI)
        return i.status === "Overdue";
      }
      if (actionsFilter === "open") {
        return i.actions.some(a => !a.done);
      }
      return true;
    })
    .filter((i) => {
      if (monthFilter === "closed-apr-2026") {
        return i.dateObj.getMonth() === 3 && i.dateObj.getFullYear() === 2026;
      }
      const ymMatch = monthFilter.match(/^(\d{4})-(\d{2})$/);
      if (ymMatch) {
        const y = parseInt(ymMatch[1], 10);
        const mo = parseInt(ymMatch[2], 10) - 1;
        return i.dateObj.getFullYear() === y && i.dateObj.getMonth() === mo;
      }
      return true;
    })
    .filter((i) => {
      if (recencyFilter === "new") {
        return i.status === "Awaiting Review" && i.dateObj >= new Date(2026, 3, 9);
      }
      if (recencyFilter === "under-review") {
        return i.status === "Awaiting Review" && i.dateObj < new Date(2026, 3, 9);
      }
      return true;
    })
    .filter((i) => {
      if (dateFrom && i.dateObj < new Date(dateFrom)) return false;
      if (dateTo && i.dateObj > new Date(dateTo + "T23:59:59")) return false;
      return true;
    })
    .filter((i) => {
      if (themeFilter === "all") return true;
      const theme = THEMES.find(t => t.id === themeFilter);
      if (!theme) return true;
      const text = [
        i.summary,
        ...i.chronology.map(e => e.event),
        ...i.actions.map(a => a.action),
      ].join(" \n ");
      return theme.keywords.test(text);
    })
    .filter((i) => {
      if (shiftFilter === "all") return true;
      const h = i.dateObj.getHours();
      if (shiftFilter === "night") return h >= 22 || h < 6;
      if (shiftFilter === "morning") return h >= 6 && h < 14;
      if (shiftFilter === "evening") return h >= 14 && h < 22;
      return true;
    })
    .filter((i) => {
      if (timeframe === "all") return true;
      const days = timeframe === "7d" ? 7 : timeframe === "30d" ? 30 : 90;
      // Reference point is the latest record in the dataset (demo data is historical).
      const latest = incidents.reduce((mx, r) => Math.max(mx, r.dateObj.getTime()), 0);
      const cutoff = latest - days * 24 * 60 * 60 * 1000;
      return i.dateObj.getTime() >= cutoff;
    })
    .filter((i) => {
      if (!hotspotOnly) return true;
      // Hotspot locations per site (mirrors the Overview "Repeat patterns & hotspots" cards)
      const HOTSPOT_LOCATIONS: Record<string, string[]> = {
        "East Cork":  ["Corridor", "Med Room"],
        "West Waterford": ["Med Room"],
        "West Waterford":  ["Unit B"],
      };
      const allHotspots = Object.values(HOTSPOT_LOCATIONS).flat();
      const sites = siteFilter === "all" ? Object.keys(HOTSPOT_LOCATIONS) : [siteFilter];
      const locs = sites.flatMap(s => HOTSPOT_LOCATIONS[s] || allHotspots);
      return locs.includes(i.location);
    })

    .sort((a, b) => {
      if (sortBy === "newest") return b.dateObj.getTime() - a.dateObj.getTime();
      if (sortBy === "oldest") return a.dateObj.getTime() - b.dateObj.getTime();
      const sevOrder: Record<Severity, number> = { Critical: 0, High: 1, Moderate: 2, Low: 3 };
      return sevOrder[a.severity] - sevOrder[b.severity];
    });

  const activeContextChips: { label: string; onClear: () => void }[] = [];
  if (siteFilter !== "all") activeContextChips.push({ label: `Site: ${siteFilter}`, onClear: () => setSiteFilter("all") });
  if (locationFilter !== "all") activeContextChips.push({ label: `Location: ${locationFilter}`, onClear: () => setLocationFilter("all") });
  if (severitySet.length > 0) activeContextChips.push({ label: `Severity: ${severitySet.join(" / ")}`, onClear: () => setSeveritySet([]) });
  else if (severityFilter !== "all") activeContextChips.push({ label: `Severity: ${severityFilter}`, onClear: () => setSeverityFilter("all") });
  if (statusFilter !== "all") activeContextChips.push({ label: statusFilter === "open" ? "Status: Open events" : `Status: ${statusFilter}`, onClear: () => setStatusFilter("all") });
  if (timeframe !== "all") activeContextChips.push({ label: `Last ${timeframe === "7d" ? "7" : timeframe === "30d" ? "30" : "90"} days`, onClear: () => setTimeframe("all") });

  if (categoryFilter !== "all") activeContextChips.push({ label: `Category: ${categoryFilter}`, onClear: () => setCategoryFilter("all") });
  if (residentSearch) activeContextChips.push({ label: `${terms.Singular}: ${residentSearch}`, onClear: () => setResidentSearch("") });
  if (actionsFilter !== "all") activeContextChips.push({ label: actionsFilter === "overdue" ? "Actions: Overdue" : "Actions: Open", onClear: () => setActionsFilter("all") });
  if (monthFilter === "closed-apr-2026") activeContextChips.push({ label: "Month: Apr 2026", onClear: () => setMonthFilter("all") });
  else if (/^\d{4}-\d{2}$/.test(monthFilter)) {
    const [y, mo] = monthFilter.split("-").map(Number);
    const label = new Date(y, mo - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    activeContextChips.push({ label: `Month: ${label}`, onClear: () => setMonthFilter("all") });
  }
  if (recencyFilter !== "all") activeContextChips.push({ label: recencyFilter === "new" ? "New (last 3 days)" : "Under review (older)", onClear: () => setRecencyFilter("all") });
  if (themeFilter !== "all") {
    const t = THEMES.find(x => x.id === themeFilter);
    if (t) activeContextChips.push({ label: `Theme: ${t.shortLabel}`, onClear: () => setThemeFilter("all") });
  }
  if (shiftFilter !== "all") {
    const lbl = shiftFilter === "night" ? "Night shift (22:00–06:00)"
      : shiftFilter === "morning" ? "Morning shift (06:00–14:00)"
      : "Evening shift (14:00–22:00)";
    activeContextChips.push({ label: `Shift: ${lbl}`, onClear: () => setShiftFilter("all") });
  }
  if (hotspotLabel) activeContextChips.push({ label: `Hotspot: ${hotspotLabel}`, onClear: () => { setHotspotLabel(null); setLocationFilter("all"); } });
  if (hotspotOnly) activeContextChips.push({ label: "Hotspot events", onClear: () => setHotspotOnly(false) });


  const clearAllContext = () => {
    setSiteFilter("all");
    setLocationFilter("all");
    setSeverityFilter("all");
    setStatusFilter("all");
    setCategoryFilter("all");
    setResidentSearch("");
    setActionsFilter("all");
    setMonthFilter("all");
    setRecencyFilter("all");
    setThemeFilter("all");
    setShiftFilter("all");
    setHotspotLabel(null);
    setHotspotOnly(false);
    setSeveritySet([]);
    setTimeframe("all");

    setSearchParams({});
  };

  const handleExport = (id: string) => {
    toast("Exporting PDF…", { description: `Evidence pack for ${id} is being generated.` });
  };

  const handleConfirmExport = () => {
    if (!exportTarget) return;
    toast("Evidence pack ready", { description: `Inspection-ready pack for ${exportTarget.id} has been generated.` });
    setExportTarget(null);
  };

  // ---- Incident Pack (filtered export) -----------------------------------
  const packFilterSummary: PackFilterSummary = useMemo(() => {
    const sevLabel = severitySet.length > 0
      ? severitySet.join(" / ")
      : (severityFilter === "all" ? "All severities" : severityFilter);
    const statusLabel = statusFilter === "all" ? "All statuses"
      : statusFilter === "open" ? "Open incidents" : statusFilter;
    const tfLabel = timeframe === "all" ? "All time"
      : timeframe === "7d" ? "Last 7 days"
      : timeframe === "30d" ? "Last 30 days" : "Last 90 days";
    const followUp = actionsFilter === "all" ? "All" : actionsFilter === "overdue" ? "Overdue" : "Open actions";
    const themeLabel = themeFilter === "all" ? "All"
      : (THEMES.find(t => t.id === themeFilter)?.shortLabel ?? themeFilter);
    const shiftLabel = shiftFilter === "all" ? "All"
      : shiftFilter === "night" ? "Night (22:00–06:00)"
      : shiftFilter === "morning" ? "Morning (06:00–14:00)" : "Evening (14:00–22:00)";
    const dateRange = (dateFrom || dateTo) ? `${dateFrom || "…"} → ${dateTo || "…"}` : "—";
    const hotspotLabelOut = hotspotOnly ? "Hotspot events only"
      : (hotspotLabel ? `Hotspot: ${hotspotLabel}` : "All");
    return {
      site: siteFilter === "all" ? "All sites" : siteFilter,
      location: locationFilter === "all" ? "All" : locationFilter,
      timeframe: tfLabel,
      status: statusLabel,
      severity: sevLabel,
      category: categoryFilter === "all" ? "All categories" : categoryFilter,
      resident: residentSearch || "All",
      followUp,
      hotspot: hotspotLabelOut,
      theme: themeLabel,
      shift: shiftLabel,
      month: monthFilter === "all" ? "All" : monthFilter,
      dateRange,
    };
  }, [siteFilter, locationFilter, severityFilter, severitySet, statusFilter, categoryFilter,
      residentSearch, actionsFilter, timeframe, themeFilter, shiftFilter, monthFilter, hotspotOnly,
      hotspotLabel, dateFrom, dateTo]);

  const handleGeneratePack = () => {
    const html = buildPackHtml({
      records: filtered,
      filters: packFilterSummary,
      options: packOptions,
      organisation: siteFilter === "all" ? "All sites" : siteFilter,
      generatedBy: role.displayName || "LogUp user",
    });
    const ok = openIncidentPack(html);
    if (!ok) {
      toast("Pop-up blocked", { description: "Please allow pop-ups to open the Event Pack." });
      return;
    }
    setPackOpen(false);
    toast("Event Pack ready", { description: `${filtered.length} incident${filtered.length === 1 ? "" : "s"} included. Use the Save as PDF button in the new window.` });
  };


  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-20">
      <motion.div {...fade} transition={{ duration: 0.4 }}>
        <h1 className="font-heading text-2xl font-bold text-foreground">Event report</h1>
        <p className="text-muted-foreground mt-1 text-sm">All event records — chronology, actions, evidence, and inspection-ready export packs.</p>
        <div className="mt-3"><RoleContextBanner /></div>
      </motion.div>

      {/* Care Planning context banner */}
      {(() => {
        const personParam = searchParams.get("personSupportedId");
        const fromRaw = searchParams.get("fromCarePlan");
        // Normalise `CP-PS001` → `PS-001` for name lookup / backlink.
        const fromNormalised = fromRaw
          ? (fromRaw.startsWith("CP-") ? fromRaw.slice(3).replace(/^([A-Z]+)(\d+)$/, "$1-$2") : fromRaw)
          : null;
        const personId = personParam || fromNormalised;
        if (!fromRaw && !personParam) return null;
        const name = (personId && PS_ID_TO_NAME[personId]) || "care plan";

        return (
          <div className="mt-4 flex flex-wrap items-center gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5">
            <span className="text-xs font-semibold text-primary">Filtered from {name}'s care plan</span>
            <Button variant="outline" size="sm" className="h-7 text-xs ml-auto" asChild>
              <Link to={personId ? `/app/care-plans/people/${personId}` : "/app/care-plans/plans"}>
                <ArrowLeft className="h-3 w-3 mr-1" /> Back to {name}'s care plan
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAllContext}>
              Clear filters
            </Button>
          </div>
        );
      })()}


      {/* Active context (from Overview drill-down) */}
      {activeContextChips.length > 0 && (
        <motion.div {...fade} transition={{ delay: 0.04, duration: 0.3 }} className="mt-4 flex items-center gap-2 flex-wrap bg-primary/5 border border-primary/15 rounded-xl px-3 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Drill-down</span>
          {activeContextChips.map((chip) => (
            <Badge key={chip.label} variant="outline" className="text-[11px] bg-card border-primary/20 text-foreground gap-1 pr-1.5">
              {chip.label}
              <button onClick={chip.onClear} className="ml-1 rounded-full hover:bg-secondary p-0.5" aria-label={`Clear ${chip.label}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={clearAllContext}>Clear all</Button>
        </motion.div>
      )}

      {/* Filter bar */}
      <motion.div {...fade} transition={{ delay: 0.08, duration: 0.4 }} className="mt-6 bg-card rounded-2xl shadow-soft border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filters</span>
          <Button
            onClick={() => setPackOpen(true)}
            disabled={filtered.length === 0}
            className="ml-auto h-9 rounded-xl font-semibold text-xs px-4"
          >
            <Package className="h-4 w-4 mr-1.5" />
            Download Event Pack — {filtered.length} event{filtered.length === 1 ? "" : "s"}
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="All sites" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {inScope("East Cork",  role.role, role.scope) && <SelectItem value="East Cork">East Cork</SelectItem>}
              {inScope("West Waterford", role.role, role.scope) && <SelectItem value="West Waterford">West Waterford</SelectItem>}
              {inScope("West Waterford",  role.role, role.scope) && <SelectItem value="West Waterford">West Waterford</SelectItem>}
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v); setSeveritySet([]); }}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="All severities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="Low">Low</SelectItem>
              <SelectItem value="Moderate">Moderate</SelectItem>
              <SelectItem value="High">High</SelectItem>
              <SelectItem value="Critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {allStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={residentSearch} onChange={(e) => setResidentSearch(e.target.value)} placeholder={`${terms.Singular} name…`} className="h-9 pl-8 rounded-xl bg-background text-xs" />
          </div>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-xl bg-background text-xs" placeholder="From" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-xl bg-background text-xs" placeholder="To" />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-9 rounded-xl bg-background text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="severity">By severity</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">{filtered.length} event{filtered.length !== 1 ? "s" : ""} found</p>
      </motion.div>

      {/* Direct-link hint */}
      {incidentIdParam && filtered.length === 1 && (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
          Showing incident from direct link — other filters have been overridden.
        </div>
      )}

      {/* Incident cards — click to open full detail drawer */}
      <div className="mt-4 space-y-3">
        {filtered.map((inc, idx) => {
          return (
            <motion.div key={inc.id} {...fade} transition={{ delay: 0.1 + idx * 0.04, duration: 0.35 }} className="bg-card rounded-2xl shadow-card border border-border overflow-hidden">
              <button
                className="w-full text-left p-4 sm:p-5 flex items-start gap-4 hover:bg-secondary/20 transition-colors"
                onClick={() => setDetailId(inc.id)}
                aria-label={`Open full detail for ${inc.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-mono text-muted-foreground">{inc.id}</span>
                    {severityBadge(inc.severity)}
                    <Badge variant="outline" className="text-[10px]">{inc.category}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{inc.status}</Badge>
                    {inc.id === incidentIdParam && (
                      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                        Direct link
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground leading-snug">{inc.summary}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{inc.site}</span>
                    <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" />{inc.resident}</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{inc.date}</span>
                  </div>
                </div>
                <span className="text-[11px] text-primary font-medium shrink-0 mt-1">Open detail →</span>
              </button>
            </motion.div>
          );
        })}


        {filtered.length === 0 && incidentIdParam && (
          <div className="bg-card rounded-2xl shadow-soft border border-destructive/30 p-8 text-center space-y-3">
            <p className="text-sm font-semibold text-destructive">Incident not found in Events.</p>
            <p className="text-xs text-muted-foreground">
              Requested ID: <span className="font-mono">{incidentIdParam}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Possible reason: seed data mismatch or missing Events record. It may also be outside your access scope.
            </p>
            <div className="flex flex-wrap gap-2 justify-center pt-1">
              {(() => {
                const personParam = searchParams.get("personSupportedId");
                const fromRaw = searchParams.get("fromCarePlan");
                const fromNormalised = fromRaw
                  ? (fromRaw.startsWith("CP-") ? fromRaw.slice(3).replace(/^([A-Z]+)(\d+)$/, "$1-$2") : fromRaw)
                  : null;
                const pid = personParam || fromNormalised;
                if (!pid) return null;
                return (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/app/care-plans/people/${pid}`}>
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to care plan
                    </Link>
                  </Button>
                );
              })()}
              <Button variant="ghost" size="sm" onClick={clearAllContext}>Clear filters</Button>
            </div>
          </div>
        )}
        {filtered.length === 0 && !incidentIdParam && (
          <div className="bg-card rounded-2xl shadow-soft border border-border p-12 text-center text-muted-foreground text-sm">
            No events match your filters.
          </div>
        )}
        {filtered.length === 0 && incidentIdParam && !getIncidentById(incidentIdParam) && (
          <div className="bg-card rounded-2xl shadow-soft border border-destructive/30 p-12 text-center text-sm">
            <p className="font-semibold text-destructive mb-1">Incident not found in Events</p>
            <p className="text-muted-foreground font-mono">{incidentIdParam}</p>
          </div>
        )}

      </div>

      {/* Full incident detail modal — shared component. Reads from the same
          IncidentRecord store as the list via getIncidentById; care-plan
          impact is resolved by ID. No fallback / substitute record is used. */}
      {(() => {
        const detailIncident = getIncidentById(detailId);
        const permitted = !!detailIncident && inScope(detailIncident.site, role.role, role.scope);
        const personParam = searchParams.get("personSupportedId");
        const fromRaw = searchParams.get("fromCarePlan");
        const fromNormalised = fromRaw
          ? (fromRaw.startsWith("CP-") ? fromRaw.slice(3).replace(/^([A-Z]+)(\d+)$/, "$1-$2") : fromRaw)
          : null;
        const pid = personParam || fromNormalised;
        const name = (pid && PS_ID_TO_NAME[pid]) || null;
        const backlink = pid && name
          ? { label: `Back to ${name}'s care plan`, to: `/app/care-plans/people/${pid}` }
          : null;

        // Deep-linked incident that exists but is filtered out of the current
        // list. Show a plain not-found dialog instead of silently substituting.
        if (detailId && !detailIncident) {
          return (
            <Dialog open={!!detailId} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-heading">Incident not found in Events</DialogTitle>
                  <DialogDescription>
                    <span className="font-mono">{detailId}</span> could not be located in the
                    Events store.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDetailId(null)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          );
        }

        return (
          <IncidentDetailDrawer
            incident={permitted ? detailIncident : null}
            open={!!detailId && permitted}
            onOpenChange={(o) => { if (!o) setDetailId(null); }}
            backlink={backlink}
          />
        );
      })()}



      {/* Export Pack dialog */}
      <Dialog open={!!exportTarget} onOpenChange={(o) => !o && setExportTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <Package className="h-5 w-5 text-primary" /> Inspection-ready Export Pack
            </DialogTitle>
            <DialogDescription>
              {exportTarget && <span className="font-mono text-xs">{exportTarget.id}</span>} — a defensible record bundle for this incident.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {[
              "Incident details & summary",
              "Full chronology / timeline",
              "People involved (recorded by, reviewed by)",
              "Review notes & decisions",
              "Follow-up actions & outcomes",
              "Current status",
              "All evidence & attachments",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground bg-secondary/40 rounded-lg p-2.5">
            Pack will be generated as a single PDF with audit-trail metadata, ready to share with HIQA inspectors.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setExportTarget(null)}>Cancel</Button>
            <Button onClick={handleConfirmExport} className="font-semibold">
              <Download className="h-4 w-4 mr-1.5" /> Generate pack
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create incident pack dialog */}
      <Dialog open={packOpen} onOpenChange={setPackOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-heading">
              <Package className="h-5 w-5 text-primary" /> Create incident pack
            </DialogTitle>
            <DialogDescription>
              This pack will include <strong>{filtered.length}</strong> event{filtered.length === 1 ? "" : "s"} matching the current filters.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs">
            <div className="font-semibold text-foreground mb-2 uppercase tracking-wider text-[10px]">Current filters</div>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 gap-x-3">
              {[
                ["Site", packFilterSummary.site],
                ["Location", packFilterSummary.location],
                ["Category", packFilterSummary.category],
                ["Severity", packFilterSummary.severity],
                ["Status", packFilterSummary.status],
                ["Timeframe", packFilterSummary.timeframe],
                [terms.Singular, packFilterSummary.resident],
                ["Follow-up", packFilterSummary.followUp],
                ["Hotspot", packFilterSummary.hotspot],
              ].filter(([, v]) => v && v !== "All" && v !== "—").map(([k, v]) => (
                <div key={k as string} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-foreground">{v}</dd>
                </div>
              ))}
              <dt className="text-muted-foreground">Matching</dt>
              <dd className="text-foreground font-semibold">{filtered.length} event{filtered.length === 1 ? "" : "s"}</dd>
            </dl>
          </div>

          <div className="space-y-2.5 py-1">
            {([
              ["aiSummary",     "Include AI-assisted governance summary"],
              ["index",         "Include incident index"],
              ["fullDetails",   "Include full incident details"],
              ["followUps",     "Include follow-up actions"],
              ["attachments",   "Include evidence / attachments list"],
              ["reviewHistory", "Include review and closure history"],
            ] as [keyof PackOptions, string][]).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 text-sm py-1">
                <span className="text-foreground">{label}</span>
                <Switch
                  checked={packOptions[key]}
                  onCheckedChange={(v) => setPackOptions(o => ({ ...o, [key]: v }))}
                />
              </label>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground bg-secondary/40 rounded-lg p-2.5">
            Suggested observations only — not conclusions. Human review required before use in governance, inspection or external reporting.
          </p>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setPackOpen(false)}>Cancel</Button>
            <Button onClick={handleGeneratePack} disabled={filtered.length === 0} className="font-semibold">
              <Download className="h-4 w-4 mr-1.5" /> Generate pack
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EvidenceExport;
