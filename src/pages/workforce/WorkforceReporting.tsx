import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, Play, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  workforceStore, runReport, exportReportCsv, downloadCsv, ragColorClasses, formatDate,
  futureCoverageRisks,
  type ReportRow, type CoverageStatus, type ShiftType,
} from "@/lib/workforceStore";
import { useRole } from "@/hooks/useRole";
import { inScope } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

const today = new Date().toISOString().slice(0, 10);
const monthAgo = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 28);
  return d.toISOString().slice(0, 10);
})();

interface SavedReport { id: string; name: string; created: string; rowCount: number; }
const savedReports: SavedReport[] = [
  { id: "r-q1", name: "Oakfield · Q1 epilepsy coverage proof", created: "2026-04-02", rowCount: 56 },
  { id: "r-q2", name: "All sites · Fire safety coverage (last 30 days)", created: "2026-04-15", rowCount: 84 },
  { id: "r-q3", name: "West Waterford · Behavioural support coverage (March)", created: "2026-04-04", rowCount: 42 },
];

const WorkforceReporting = () => {
  const [, force] = useState(0);
  useEffect(() => workforceStore.subscribe(() => force((n) => n + 1)), []);
  const role = useRole();

  const allSites = workforceStore.getSites();
  const sites = allSites.filter((s) => inScope(s.name, role.role, role.scope));
  const scopedSiteIds = new Set(sites.map((s) => s.id));
  const allStaff = workforceStore.getStaff();
  const staff = allStaff.filter((s) => s.assignedSiteIds.some((id) => scopedSiteIds.has(id)));
  const types = workforceStore.getQualificationTypes();

  const [filters, setFilters] = useState({
    siteId: "all" as string,
    staffId: "all" as string,
    qualificationId: "all" as string,
    shift: "all" as ShiftType | "all",
    status: "all" as CoverageStatus | "all",
    fromDate: monthAgo,
    toDate: today,
  });
  const [rows, setRows] = useState<ReportRow[] | null>(null);

  const summary = useMemo(() => {
    if (!rows) return null;
    const total = rows.length;
    const covered = rows.filter((r) => r.status === "covered").length;
    const at_risk = rows.filter((r) => r.status === "at_risk").length;
    const uncovered = rows.filter((r) => r.status === "uncovered").length;
    const pct = total === 0 ? 0 : Math.round((covered / total) * 100);
    return { total, covered, at_risk, uncovered, pct };
  }, [rows]);

  const run = () => {
    const r = runReport({
      siteId: filters.siteId === "all" ? undefined : filters.siteId,
      staffId: filters.staffId === "all" ? undefined : filters.staffId,
      qualificationId: filters.qualificationId === "all" ? undefined : filters.qualificationId,
      shift: filters.shift,
      status: filters.status,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
    });
    setRows(r);
  };

  const exportCsv = () => {
    if (!rows || rows.length === 0) return;
    const csv = exportReportCsv(rows);
    downloadCsv(`workforce-coverage-report-${today}.csv`, csv);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-20">
      <motion.div {...fade}>
        <h1 className="font-heading text-2xl font-bold text-foreground">Reporting</h1>
        <p className="text-muted-foreground mt-1 text-sm">Inspection-ready proof: who was on shift, what they held, and whether coverage was met.</p>
        <div className="mt-3"><RoleContextBanner /></div>
      </motion.div>

      <Tabs defaultValue="run" className="mt-6">
        <TabsList>
          <TabsTrigger value="run">Run report</TabsTrigger>
          <TabsTrigger value="saved">Saved reports</TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="mt-4 space-y-4">
          {/* Filters */}
          <section className="bg-card rounded-2xl border border-border shadow-soft p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Filters</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Site">
                <Select value={filters.siteId} onValueChange={(v) => setFilters((f) => ({ ...f, siteId: v }))}>
                  <SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sites</SelectItem>
                    {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Staff">
                <Select value={filters.staffId} onValueChange={(v) => setFilters((f) => ({ ...f, staffId: v }))}>
                  <SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All staff</SelectItem>
                    {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Qualification">
                <Select value={filters.qualificationId} onValueChange={(v) => setFilters((f) => ({ ...f, qualificationId: v }))}>
                  <SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Shift">
                <Select value={filters.shift} onValueChange={(v) => setFilters((f) => ({ ...f, shift: v as ShiftType | "all" }))}>
                  <SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All shifts</SelectItem>
                    <SelectItem value="day">Day</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Coverage status">
                <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v as CoverageStatus | "all" }))}>
                  <SelectTrigger className="h-9 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="covered">Covered</SelectItem>
                    <SelectItem value="at_risk">At risk</SelectItem>
                    <SelectItem value="uncovered">Uncovered</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="From date">
                <Input type="date" value={filters.fromDate} onChange={(e) => setFilters((f) => ({ ...f, fromDate: e.target.value }))} className="h-9 rounded-xl" />
              </Field>
              <Field label="To date">
                <Input type="date" value={filters.toDate} onChange={(e) => setFilters((f) => ({ ...f, toDate: e.target.value }))} className="h-9 rounded-xl" />
              </Field>
              <div className="flex items-end gap-2">
                <Button onClick={run} className="h-9 rounded-xl flex-1"><Play className="h-4 w-4 mr-1" /> Run report</Button>
              </div>
            </div>
          </section>

          {/* Future coverage risks — projection over selected date range */}
          <FutureCoverageRisksSection
            siteId={filters.siteId === "all" ? undefined : filters.siteId}
            fromDate={filters.fromDate}
            toDate={filters.toDate}
          />

          {/* Summary + results */}
          {rows && (
            <>
              {summary && (
                <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <SumKpi value={summary.total} label="Total shifts" />
                  <SumKpi value={summary.covered} label="Covered" tone="success" />
                  <SumKpi value={summary.at_risk} label="At risk" tone="warning" />
                  <SumKpi value={summary.uncovered} label="Uncovered" tone="destructive" />
                </section>
              )}

              <section className="bg-card rounded-2xl border border-border shadow-soft p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-foreground">{rows.length} result{rows.length === 1 ? "" : "s"}</p>
                  <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0} className="h-8 rounded-lg">
                    <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
                  </Button>
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No shifts match these filters.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Date</th>
                          <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Shift</th>
                          <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Site</th>
                          <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Staff on duty</th>
                          <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Required (met / required)</th>
                          <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const c = ragColorClasses(r.status);
                          return (
                            <tr key={r.shiftId} className="border-b border-border align-top">
                              <td className="px-2 py-2 whitespace-nowrap">{formatDate(r.date)}</td>
                              <td className="px-2 py-2 capitalize">{r.shift}</td>
                              <td className="px-2 py-2">{r.siteName}<br /><span className="text-[10px] text-muted-foreground">{r.unit}</span></td>
                              <td className="px-2 py-2">
                                <ul className="space-y-0.5">
                                  {r.staff.map((s) => (
                                    <li key={s.id}>
                                      <span className="text-foreground">{s.name}</span>
                                      <span className="text-[10px] text-muted-foreground"> · {s.role}</span>
                                    </li>
                                  ))}
                                </ul>
                              </td>
                              <td className="px-2 py-2">
                                <ul className="space-y-0.5">
                                  {r.requirements.map((q, i) => {
                                    const ok = q.current >= q.required;
                                    return (
                                      <li key={i} className={ok ? "text-foreground" : "text-destructive"}>
                                        {q.name} <span className="font-semibold">{q.current}/{q.required}</span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </td>
                              <td className="px-2 py-2">
                                <Badge variant="outline" className={`text-[10px] ${c.bg} ${c.text} ${c.border} font-semibold`}>{c.label}</Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </TabsContent>

        <TabsContent value="saved" className="mt-4">
          <section className="bg-card rounded-2xl border border-border shadow-soft p-3">
            <ul className="divide-y divide-border">
              {savedReports.map((r) => (
                <li key={r.id} className="py-3 px-2 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">Created {r.created} · {r.rowCount} rows</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 rounded-lg">Re-run</Button>
                  <Button size="sm" variant="ghost" className="h-8 rounded-lg"><Download className="h-3.5 w-3.5 mr-1" /> Download</Button>
                </li>
              ))}
            </ul>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
    <div className="mt-1">{children}</div>
  </div>
);

const SumKpi = ({ value, label, tone }: { value: number; label: string; tone?: "success" | "warning" | "destructive" }) => {
  const cls = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="bg-card rounded-xl border border-border shadow-soft p-4">
      <p className={`text-2xl font-heading font-bold ${cls}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
};

// ---------- Future coverage risks panel ----------
const FutureCoverageRisksSection = ({ siteId, fromDate, toDate }: { siteId?: string; fromDate: string; toDate: string }) => {
  const { rows, ongoing } = useMemo(
    () => futureCoverageRisks({ siteId, fromDate, toDate }),
    [siteId, fromDate, toDate],
  );

  return (
    <section className="bg-card rounded-2xl border border-border shadow-soft p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">Future coverage risks</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Projection of scheduled shifts in this date range where qualification gaps or expiring evidence put coverage at risk.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">{rows.length} flagged shift{rows.length === 1 ? "" : "s"}</Badge>
      </div>

      {ongoing.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Ongoing qualification gaps</p>
          <ul className="space-y-1.5">
            {ongoing.map((g, i) => (
              <li key={i} className={`flex items-start gap-2 rounded-lg border p-2.5 ${g.impact === "Uncovered" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5"}`}>
                <FileText className={`h-3.5 w-3.5 mt-0.5 ${g.impact === "Uncovered" ? "text-destructive" : "text-warning"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">
                    <span className="font-semibold">{g.staffName}</span> — {g.qualificationName} — affects{" "}
                    <span className="font-semibold">{g.affectedShifts}</span> scheduled shift{g.affectedShifts === 1 ? "" : "s"} from {formatDate(g.firstDate)}.
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{g.suggestedAction}</p>
                </div>
                <Badge variant="outline" className={`text-[9px] ${g.impact === "Uncovered" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-warning/10 text-warning border-warning/20"}`}>
                  {g.impact}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No future coverage risks identified in this date range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Date</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Shift</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Site</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Staff member</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Qualification</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Detail</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Impact</th>
                  <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Suggested action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const bad = r.impact === "Uncovered";
                  return (
                    <tr key={r.shiftId} className="border-b border-border align-top">
                      <td className="px-2 py-2 whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="px-2 py-2 capitalize">{r.shift}</td>
                      <td className="px-2 py-2">{r.siteName}{r.unit && <><br /><span className="text-[10px] text-muted-foreground">{r.unit}</span></>}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{r.staffName}</td>
                      <td className="px-2 py-2">{r.qualificationName}</td>
                      <td className="px-2 py-2 text-muted-foreground">{r.detail}</td>
                      <td className="px-2 py-2">
                        <Badge variant="outline" className={`text-[9px] ${bad ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-warning/10 text-warning border-warning/20"}`}>
                          {r.impact}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-foreground">{r.suggestedAction}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        LogUp checks scheduled shift coverage against site requirements and staff qualification evidence. It does not replace rota or payroll systems.
      </p>
    </section>
  );
};

export default WorkforceReporting;
