import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckCircle2, SkipForward, Play, Clock, MapPin, AlertTriangle,
  User as UserIcon, Home, Camera, Paperclip, ArrowRight, ListChecks,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  useTasksStore, effectiveStatus, statusLabel, isOverdue,
  formatLocations, taskTypeLabel, sourceLabel, taskOwnership,
  isAssignedToUser, isHouseTaskForUser, CURRENT_USER, staffName,
  completeTask, skipTask, startTask, type TaskRecord, SITES, taskSiteIds,
} from "@/lib/tasksStore";
import { useRole } from "@/hooks/useRole";
import { inScope, isFrontline } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

type SectionKey = "due_now" | "today" | "upcoming" | "overdue" | "completed" | "skipped";
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "due_now", label: "Due now" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
  { key: "skipped", label: "Skipped" },
];

const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); };
const endOfToday = () => { const d = new Date(); d.setHours(23,59,59,999); return d.getTime(); };

const classify = (t: TaskRecord): SectionKey => {
  if (t.status === "completed") return "completed";
  if (t.status === "skipped") return "skipped";
  if (isOverdue(t)) return "overdue";
  const due = new Date(t.dueAt).getTime();
  const now = Date.now();
  if (Math.abs(due - now) <= 60 * 60 * 1000) return "due_now";
  if (due >= startOfToday() && due <= endOfToday()) return "today";
  return "upcoming";
};

type Scope = "mine" | "house";

export default function TasksToday() {
  const { tasks } = useTasksStore();
  const [scope, setScope] = useState<Scope>("mine");
  const [section, setSection] = useState<SectionKey>("due_now");
  const me = CURRENT_USER;
  const role = useRole();
  const scopedSiteIds = useMemo(
    () => new Set(SITES.filter(s => inScope(s.name, role.role, role.scope)).map(s => s.id)),
    [role.role, role.scope],
  );

  const visible = useMemo(() => {
    return tasks
      .filter(t => taskSiteIds(t).some(sid => scopedSiteIds.has(sid)))
      .filter(t =>
        scope === "mine"
          ? isAssignedToUser(t, me.id)
          : isHouseTaskForUser(t, { onShiftSiteIds: me.onShiftSiteIds, onShiftUnitIds: me.onShiftUnitIds })
      );
  }, [tasks, scope, me.id, me.onShiftSiteIds, me.onShiftUnitIds, scopedSiteIds]);

  const counts = useMemo(() => {
    const c: Record<SectionKey, number> = { due_now: 0, today: 0, upcoming: 0, overdue: 0, completed: 0, skipped: 0 };
    visible.forEach(t => { c[classify(t)]++; });
    return c;
  }, [visible]);

  const rows = useMemo(() => {
    return visible
      .filter(t => classify(t) === section)
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }, [visible, section]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-20">
      <motion.div {...fade} className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Today</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            What you need to do right now — {me.name}, {me.role}.
          </p>
          <div className="mt-3"><RoleContextBanner /></div>
        </div>
        {!isFrontline(role.role) && (
          <Button asChild size="sm" variant="outline" className="h-9 rounded-xl text-sm">
            <Link to="/app/tasks/register"><ListChecks className="h-4 w-4 mr-1" /> Open register</Link>
          </Button>
        )}
      </motion.div>

      {/* Scope switch */}
      <motion.div {...fade} transition={{ delay: 0.06 }} className="mt-6 grid grid-cols-2 gap-2 max-w-md">
        <ScopeButton
          active={scope === "mine"} onClick={() => setScope("mine")}
          icon={UserIcon} label="My tasks"
          sub="Assigned to you"
        />
        <ScopeButton
          active={scope === "house"} onClick={() => setScope("house")}
          icon={Home} label="House tasks"
          sub="Shared on your shift"
        />
      </motion.div>

      {/* Section chips */}
      <motion.div {...fade} transition={{ delay: 0.1 }} className="mt-5 flex flex-wrap gap-2">
        {SECTIONS.map(s => {
          const active = section === s.key;
          const isAttention = (s.key === "due_now" || s.key === "overdue") && counts[s.key] > 0;
          return (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={[
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-soft"
                  : isAttention
                    ? "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20"
                    : "bg-card text-muted-foreground border-border hover:border-primary/30",
              ].join(" ")}
            >
              {s.label}
              <span className={[
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                active ? "bg-primary-foreground/20" : "bg-secondary text-foreground/70",
              ].join(" ")}>
                {counts[s.key]}
              </span>
            </button>
          );
        })}
      </motion.div>

      {/* List */}
      <motion.div {...fade} transition={{ delay: 0.14 }} className="mt-5 space-y-3">
        {rows.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-soft p-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Nothing in “{SECTIONS.find(s => s.key === section)?.label}”. Nice work.
            </p>
          </div>
        ) : (
          rows.map(t => <TaskCard key={t.id} t={t} who={me.name} whoId={me.id} />)
        )}
      </motion.div>
    </div>
  );
}

function ScopeButton({
  active, onClick, icon: Icon, label, sub,
}: { active: boolean; onClick: () => void; icon: typeof UserIcon; label: string; sub: string }) {
  return (
    <button
      onClick={onClick}
      className={[
        "text-left rounded-xl border p-3 transition-all",
        active
          ? "bg-primary/5 border-primary/40 shadow-soft"
          : "bg-card border-border hover:border-primary/30 shadow-soft",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
        <span className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5 ml-6">{sub}</p>
    </button>
  );
}

function TaskCard({ t, who, whoId }: { t: TaskRecord; who: string; whoId: string }) {
  const [completeOpen, setCompleteOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");

  const s = effectiveStatus(t);
  const own = taskOwnership(t);
  const overdue = isOverdue(t);

  const statusTone =
    s === "overdue" ? "bg-destructive/10 text-destructive border-destructive/20"
    : s === "completed" ? "bg-success/10 text-success border-success/20"
    : s === "in_progress" ? "bg-warning/10 text-warning border-warning/20"
    : s === "skipped" ? "bg-secondary text-muted-foreground border-border"
    : "bg-primary/10 text-primary border-primary/20";

  return (
    <div className={[
      "bg-card rounded-2xl border shadow-soft p-4 transition-all hover:shadow-card",
      overdue ? "border-destructive/30" : "border-border",
    ].join(" ")}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <Badge variant="outline" className={`text-[10px] font-semibold ${statusTone}`}>{statusLabel(s)}</Badge>
            <Badge variant="outline" className="text-[10px] font-normal bg-secondary/60">{taskTypeLabel(t.taskType)}</Badge>
            <Badge variant="outline" className="text-[10px] font-normal bg-secondary/60">
              {own === "person" ? <><UserIcon className="h-3 w-3 mr-1" />Yours</> : <><Home className="h-3 w-3 mr-1" />House</>}
            </Badge>
            {t.priority === "high" && (
              <Badge variant="outline" className="text-[10px] font-semibold bg-destructive/10 text-destructive border-destructive/20">High</Badge>
            )}
            {t.sourceRef && t.sourceType !== "recurring_template" && (
              <Badge variant="outline" className="text-[10px] font-normal bg-secondary/60">{sourceLabel(t.sourceType)} · {t.sourceRef}</Badge>
            )}
          </div>
          <Link to={`/app/tasks/${t.id}`} className="text-base font-semibold text-foreground hover:text-primary transition-colors">
            {t.title}
          </Link>
          {t.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{formatLocations(t)}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(t.dueAt).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
              {overdue && (
                <span className="text-destructive font-medium ml-1 inline-flex items-center gap-0.5">
                  <AlertTriangle className="h-3 w-3" />overdue
                </span>
              )}
            </span>
            {t.status === "completed" && t.completedById && (
              <span>Completed by <span className="font-medium text-foreground">{staffName(t.completedById)}</span></span>
            )}
            {t.status === "skipped" && t.skippedById && (
              <span>Skipped by <span className="font-medium text-foreground">{staffName(t.skippedById)}</span></span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" asChild className="h-8 rounded-lg text-xs">
            <Link to={`/app/tasks/${t.id}`}>Open <ArrowRight className="h-3 w-3 ml-1" /></Link>
          </Button>
          {(t.status === "open" || t.status === "in_progress") && (
            <>
              {t.status === "open" && (
                <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs"
                  onClick={() => { startTask(t.id, who); toast("Started"); }}>
                  <Play className="h-3.5 w-3.5 mr-1" />Start
                </Button>
              )}
              <Button size="sm" className="h-8 rounded-lg text-xs" onClick={() => setCompleteOpen(true)}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Complete
              </Button>
              <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => setSkipOpen(true)}>
                <SkipForward className="h-3.5 w-3.5 mr-1" />Skip
              </Button>
            </>
          )}
        </div>
      </div>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complete task</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t.title}</p>
          <Label>Completion note (optional)</Label>
          <Textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Fire panel checked, no faults noted." />
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Camera className="h-3 w-3" /> Add photos or files from the task page after.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              completeTask(t.id, note.trim() || undefined, who, whoId);
              setCompleteOpen(false); setNote("");
              toast("Task completed");
            }}>Confirm complete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Skip task</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t.title}</p>
          <Label>Reason (optional)</Label>
          <Textarea value={reason} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Already done on earlier shift." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              skipTask(t.id, reason.trim() || undefined, who, whoId);
              setSkipOpen(false); setReason("");
              toast("Task skipped");
            }}>Confirm skip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
