import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ClipboardList, Calendar, Building2, AlertTriangle, Play,
  ShieldCheck, ArrowRight, Flame, CheckCircle2, ListChecks,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  audits, statusColor, type AuditRecord,
} from "@/lib/auditsData";
import {
  useAllAuditRuns, CURRENT_AUDIT_USER, progressOf, type WalkthroughRun,
} from "@/lib/auditsStore";
import { useRole } from "@/hooks/useRole";
import { inScope, isFrontline } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

type Scope = "mine" | "house";
type SectionKey = "overdue" | "due_soon" | "in_progress" | "upcoming" | "awaiting_signoff" | "completed";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "due_soon", label: "Due soon" },
  { key: "in_progress", label: "In progress" },
  { key: "upcoming", label: "Upcoming" },
  { key: "awaiting_signoff", label: "Awaiting sign-off" },
  { key: "completed", label: "Completed" },
];

const classify = (a: AuditRecord, run?: WalkthroughRun): SectionKey => {
  if (run?.status === "awaiting_signoff") return "awaiting_signoff";
  if (run?.status === "signed_off" || a.status === "Complete") return "completed";
  if (run?.status === "in_progress") return "in_progress";
  if (a.status === "Overdue") return "overdue";
  if (a.status === "Due Soon") return "due_soon";
  return "upcoming";
};

export default function MyAudits() {
  const me = CURRENT_AUDIT_USER;
  const role = useRole();
  const frontline = isFrontline(role.role);
  // For Frontline, "Mine" means audits assigned to the active user identity;
  // "House" means audits at their assigned site(s) from role scope.
  const myName = frontline ? role.displayName : me.name;
  const houseSites = frontline ? role.scope : me.onShiftSites;
  const houseLabel = houseSites[0] ?? "House";
  const runs = useAllAuditRuns();
  const runsById = useMemo(() => Object.fromEntries(runs.map((r) => [r.id, r])), [runs]);
  // Frontline staff usually aren't named owners of audits — default to House.
  const [scope, setScope] = useState<Scope>(frontline ? "house" : "mine");
  const [section, setSection] = useState<SectionKey>("overdue");

  const visible = useMemo(() => {
    return audits
      .filter((a) => inScope(a.site, role.role, role.scope))
      .filter((a) =>
        scope === "mine"
          ? a.assignedTo === myName
          : houseSites.includes(a.site),
      );
  }, [scope, myName, houseSites, role.role, role.scope]);

  const counts = useMemo(() => {
    const c: Record<SectionKey, number> = {
      overdue: 0, due_soon: 0, in_progress: 0, upcoming: 0, awaiting_signoff: 0, completed: 0,
    };
    visible.forEach((a) => { c[classify(a, runsById[a.id])]++; });
    return c;
  }, [visible, runsById]);

  const rows = useMemo(() => {
    return visible
      .filter((a) => classify(a, runsById[a.id]) === section)
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }, [visible, section, runsById]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-20">
      <motion.div {...fade} className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">My audits</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Audits assigned to you or your house — start, continue, or review.
          </p>
          <div className="mt-3"><RoleContextBanner /></div>
        </div>
        {!frontline && (
          <Button asChild size="sm" variant="outline" className="h-9 rounded-xl text-sm">
            <Link to="/app/audits/reporting"><ListChecks className="h-4 w-4 mr-1" /> Open register</Link>
          </Button>
        )}
      </motion.div>

      {/* Scope toggle */}
      <motion.div {...fade} transition={{ delay: 0.05 }} className="mt-5 inline-flex rounded-xl border border-border bg-card p-1">
        <ScopeBtn active={scope === "mine"} onClick={() => setScope("mine")}>
          Mine
        </ScopeBtn>
        <ScopeBtn active={scope === "house"} onClick={() => setScope("house")}>
          {houseLabel}
        </ScopeBtn>
      </motion.div>

      {/* Section pills */}
      <motion.div {...fade} transition={{ delay: 0.08 }} className="mt-4 flex gap-2 flex-wrap">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
              section === s.key
                ? "bg-primary text-primary-foreground border-primary font-semibold"
                : "bg-card text-muted-foreground border-border hover:border-primary/30"
            }`}
          >
            {s.label}
            <span className={`ml-1.5 ${section === s.key ? "opacity-90" : "opacity-60"}`}>{counts[s.key]}</span>
          </button>
        ))}
      </motion.div>

      {/* Rows */}
      <motion.section {...fade} transition={{ delay: 0.12 }} className="mt-5">
        {rows.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-soft p-8 text-center text-sm text-muted-foreground">
            Nothing here. Try a different filter.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((a) => {
              const run = runsById[a.id];
              return <AuditRow key={a.id} audit={a} run={run} />;
            })}
          </div>
        )}
      </motion.section>
    </div>
  );
}

const ScopeBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={`text-sm px-4 py-1.5 rounded-lg transition-all ${
      active ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
    }`}
  >
    {children}
  </button>
);

const AuditRow = ({ audit: a, run }: { audit: AuditRecord; run?: WalkthroughRun }) => {
  const sc = statusColor(a.status);
  const isAwaiting = run?.status === "awaiting_signoff";
  const isSignedOff = run?.status === "signed_off";
  const isInProgress = run?.status === "in_progress";
  const isDone = isSignedOff || a.status === "Complete";
  const prog = run ? progressOf(run) : { pct: a.progress, done: a.completedItems, total: a.totalItems };

  const ctaTo = isAwaiting
    ? `/app/audits/reporting?openId=${a.id}`
    : isDone
      ? `/app/audits/reporting?openId=${a.id}`
      : `/app/audits/conduct/${a.id}`;
  const ctaLabel = isAwaiting ? "Review" : isDone ? "View" : isInProgress ? "Continue" : "Start";
  const CtaIcon = isAwaiting ? ShieldCheck : isDone ? ArrowRight : isInProgress ? Play : Play;

  return (
    <div className="bg-card rounded-xl border border-border shadow-soft p-4 hover:border-primary/30 hover:shadow-card transition-all">
      <div className="flex items-start gap-3">
        <div className={`h-9 w-9 rounded-lg ${sc.bg} flex items-center justify-center shrink-0`}>
          {isDone ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <ClipboardList className={`h-4 w-4 ${sc.text}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-xs font-mono text-muted-foreground">{a.id}</span>
            <Badge variant="outline" className={`text-[10px] ${sc.bg} ${sc.text} ${sc.border} font-semibold`}>
              {a.status}
            </Badge>
            {isAwaiting && (
              <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20 font-semibold">
                Awaiting sign-off
              </Badge>
            )}
            {isInProgress && (
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 font-semibold">
                In progress
              </Badge>
            )}
            {a.templateName === "Fire Safety Check" && <Flame className="h-3.5 w-3.5 text-destructive" />}
            {a.status === "Overdue" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
          </div>
          <p className="text-sm font-medium text-foreground">{a.templateName}</p>
          <div className="flex gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
            <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{a.site}</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Due {a.dueDate}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  a.status === "Overdue" ? "bg-destructive" : a.status === "Due Soon" ? "bg-warning" : "bg-primary"
                }`}
                style={{ width: `${prog.pct}%` }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">{prog.done}/{prog.total}</span>
          </div>
        </div>
        <Button asChild size="sm" className="h-8 rounded-lg text-xs font-semibold shrink-0 self-center">
          <Link to={ctaTo}>
            <CtaIcon className="h-3.5 w-3.5 mr-1" />
            {ctaLabel}
          </Link>
        </Button>
      </div>
    </div>
  );
};
