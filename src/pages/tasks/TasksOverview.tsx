import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, Clock, CheckCircle2, SkipForward, ListChecks,
  FileWarning, Building2, ArrowRight, ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useTasksStore, effectiveStatus, statusLabel, isOverdue,
  siteName, unitName, staffName, sourceLabel, SITES, taskSiteIds,
} from "@/lib/tasksStore";
import { useRole } from "@/hooks/useRole";
import { inScope } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";
import { useMemo } from "react";

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const endOfToday = () => { const d = new Date(); d.setHours(23,59,59,999); return d; };

const regUrl = (params: Record<string, string | undefined>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
  const s = q.toString();
  return `/app/tasks/register${s ? `?${s}` : ""}`;
};

export default function TasksOverview() {
  const { tasks: allTasks } = useTasksStore();
  const navigate = useNavigate();
  const role = useRole();
  const scopedSiteIds = useMemo(
    () => new Set(SITES.filter(s => inScope(s.name, role.role, role.scope)).map(s => s.id)),
    [role.role, role.scope],
  );
  const tasks = useMemo(
    () => allTasks.filter(t => taskSiteIds(t).some(sid => scopedSiteIds.has(sid))),
    [allTasks, scopedSiteIds],
  );

  const todayStart = startOfToday();
  const todayEnd = endOfToday();

  const isDueToday = (t: any) => {
    const d = new Date(t.dueAt);
    return d >= todayStart && d <= todayEnd && (t.status === "open" || t.status === "in_progress");
  };
  const isUpcoming = (t: any) =>
    new Date(t.dueAt) > todayEnd && (t.status === "open" || t.status === "in_progress");
  const isCompletedToday = (t: any) =>
    t.status === "completed" && t.completedAt && new Date(t.completedAt) >= todayStart;
  const isFollowUpOpen = (t: any) =>
    t.taskType === "follow_up" && (t.status === "open" || t.status === "in_progress");

  const overdue = tasks.filter(isOverdue);
  const dueToday = tasks.filter(isDueToday);
  const upcoming = tasks.filter(isUpcoming);
  const completedToday = tasks.filter(isCompletedToday);
  const skipped = tasks.filter(t => t.status === "skipped");
  const followUpOpen = tasks.filter(isFollowUpOpen);

  const attention = [...overdue, ...dueToday]
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 5);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-20">
      <motion.div {...fade} className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Tasks & Follow-up</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            What needs attention, where the pressure is, and what's been done.
          </p>
          <div className="mt-3"><RoleContextBanner /></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild size="sm" variant="outline" className="h-9 rounded-xl text-sm">
            <Link to="/app/tasks/today">Today</Link>
          </Button>
          <Button asChild size="sm" className="h-9 rounded-xl text-sm font-semibold">
            <Link to="/app/tasks/register"><ListChecks className="h-4 w-4 mr-1" /> Open register</Link>
          </Button>
        </div>
      </motion.div>

      {/* KPIs */}
      <motion.div {...fade} transition={{ delay: 0.06 }}
        className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi value={overdue.length} label="Overdue" tone="destructive" onClick={() => navigate(regUrl({ status: "overdue" }))} />
        <Kpi value={dueToday.length} label="Due today" tone="primary" onClick={() => navigate(regUrl({ status: "due_today" }))} />
        <Kpi value={upcoming.length} label="Upcoming" tone="warning" onClick={() => navigate(regUrl({ status: "future" }))} />
        <Kpi value={completedToday.length} label="Done today" tone="success" onClick={() => navigate(regUrl({ status: "completed", period: "today" }))} />
        <Kpi value={skipped.length} label="Skipped" tone="default" onClick={() => navigate(regUrl({ status: "skipped" }))} />
        <Kpi value={followUpOpen.length} label="Follow-ups open" tone="warning" onClick={() => navigate(regUrl({ taskType: "follow_up", status: "open_or_progress" }))} />
      </motion.div>

      {/* Two-column: Needs attention + Site progress */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.section {...fade} transition={{ delay: 0.12 }}
          className="bg-card rounded-2xl border border-border shadow-soft p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h2 className="font-heading text-lg font-semibold text-foreground">Needs attention</h2>
            </div>
            <Link to={regUrl({ status: "needs_attention" })} className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          {attention.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">All clear. Nothing pressing right now.</p>
          ) : (
            <div className="space-y-2">
              {attention.map(t => {
                const s = effectiveStatus(t);
                const od = isOverdue(t);
                return (
                  <Link
                    key={t.id}
                    to={`/app/tasks/${t.id}`}
                    className="flex items-start gap-3 rounded-xl border border-border p-3 hover:border-primary/30 hover:shadow-card transition-all"
                  >
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${od ? "bg-destructive/10" : "bg-primary/10"}`}>
                      {od ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <Clock className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] font-semibold ${od ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-primary/10 text-primary border-primary/20"}`}>
                          {statusLabel(s)}
                        </Badge>
                        {t.priority === "high" && (
                          <Badge variant="outline" className="text-[10px] font-semibold bg-destructive/10 text-destructive border-destructive/20">High</Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {siteName(t.siteId)} · {staffName(t.assigneeId) || "House task"}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </Link>
                );
              })}
            </div>
          )}
        </motion.section>

        <motion.section {...fade} transition={{ delay: 0.16 }}
          className="bg-card rounded-2xl border border-border shadow-soft p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-lg font-semibold text-foreground">Site pressure</h2>
          </div>
          <div className="space-y-2">
            {SITES.filter(s => scopedSiteIds.has(s.id)).map(site => {
              const inSite = tasks.filter(t => t.siteId === site.id);
              const od = inSite.filter(isOverdue).length;
              const dt = inSite.filter(isDueToday).length;
              const open = inSite.filter(t => t.status !== "completed" && t.status !== "skipped").length;
              const tone: "destructive" | "warning" | "success" =
                od > 0 ? "destructive" : dt > 0 ? "warning" : "success";
              const dot = tone === "destructive" ? "bg-destructive" : tone === "warning" ? "bg-warning" : "bg-success";
              return (
                <Link
                  key={site.id}
                  to={regUrl({ siteId: site.id })}
                  className="flex items-center gap-3 rounded-xl border border-border p-3 hover:border-primary/30 hover:shadow-card transition-all"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{site.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{open} open task{open === 1 ? "" : "s"}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${od > 0 ? "text-destructive" : "text-foreground"}`}>{od}</p>
                    <p className="text-[11px] text-muted-foreground">overdue</p>
                  </div>
                  <div className="w-px h-8 bg-border mx-2" />
                  <div className="text-right min-w-[60px]">
                    <p className={`text-sm font-semibold ${dt > 0 ? "text-warning" : "text-foreground"}`}>{dt}</p>
                    <p className="text-[11px] text-muted-foreground">today</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </motion.section>
      </div>

      {/* Quick links */}
      <motion.div {...fade} transition={{ delay: 0.22 }}
        className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <QuickLink to="/app/tasks/today" icon={CheckCircle2} title="Today" sub="Your shift's task list" />
        <QuickLink to="/app/tasks/recurring" icon={ListChecks} title="Recurring setup" sub="Schedule routine checks" />
        <QuickLink to="/app/tasks/reporting" icon={FileWarning} title="Reporting" sub="Inspection-ready proof" />
      </motion.div>
    </div>
  );
}

function Kpi({
  value, label, tone, onClick,
}: { value: number; label: string; tone: "destructive" | "warning" | "success" | "primary" | "default"; onClick?: () => void }) {
  const cls =
    tone === "destructive" ? "text-destructive"
    : tone === "warning" ? "text-warning"
    : tone === "success" ? "text-success"
    : tone === "primary" ? "text-primary"
    : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-card rounded-xl p-4 border border-border shadow-soft hover:border-primary/30 hover:shadow-card transition-all group"
    >
      <div className="flex items-center justify-between mb-1">
        <p className={`text-2xl font-heading font-bold ${cls}`}>{value}</p>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </button>
  );
}

function QuickLink({
  to, icon: Icon, title, sub,
}: { to: string; icon: typeof ListChecks; title: string; sub: string }) {
  return (
    <Link to={to}
      className="flex items-center gap-3 bg-card rounded-xl p-4 border border-border shadow-soft hover:border-primary/30 hover:shadow-card transition-all">
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
}
