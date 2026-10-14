import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, UserPlus, X, AlertTriangle, CheckCircle2, Info, ShieldCheck, ClipboardList, CalendarClock, Plus, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  workforceStore, shiftCoverage, ragColorClasses, qualificationStatus, daysToExpiry, formatDate,
  staffWorksOn, rotaLabel, getShiftIssue,
  type ShiftAssignment, type ShiftType, type ShiftIssue,
} from "@/lib/workforceStore";
import { createTask, CURRENT_USER } from "@/lib/tasksStore";
import { useRole } from "@/hooks/useRole";
import { inScope } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

function startOfWeek(d: Date) {
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const x = new Date(d);
  x.setDate(x.getDate() + offset);
  x.setHours(0, 0, 0, 0);
  return x;
}
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDay(d: Date) { return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }); }

const ShiftCoverage = () => {
  const [, force] = useState(0);
  useEffect(() => workforceStore.subscribe(() => force((n) => n + 1)), []);
  const role = useRole();

  const allSites = workforceStore.getSites();
  const sites = allSites.filter((s) => inScope(s.name, role.role, role.scope));
  const allStaff = workforceStore.getStaff();
  const shifts = workforceStore.getShifts();

  const [siteId, setSiteId] = useState<string>(sites[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [shiftTypeFilter, setShiftTypeFilter] = useState<"all" | ShiftType>("all");

  const [openShift, setOpenShift] = useState<ShiftAssignment | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const shiftFor = (date: string, type: ShiftType) =>
    shifts.find((s) => s.siteId === siteId && s.date === date && s.shift === type);

  const weekShifts = useMemo(() => {
    const dateSet = new Set(days.map(iso));
    return shifts.filter((s) => s.siteId === siteId && dateSet.has(s.date));
  }, [shifts, siteId, days]);

  const weekStats = useMemo(() => {
    let covered = 0, attention = 0, uncovered = 0, expiring = 0;
    for (const sh of weekShifts) {
      const cov = shiftCoverage(sh);
      if (cov.status === "covered") covered++;
      else if (cov.status === "at_risk") attention++;
      else uncovered++;
      if (getShiftIssue(sh)?.kind === "attention") expiring++;
    }
    return { covered, attention, uncovered, total: weekShifts.length, expiring };
  }, [weekShifts]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-20">
      <motion.div {...fade} className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Shift coverage</h1>
          <p className="text-muted-foreground mt-1 text-sm">Light shift coverage with live qualification and competency checks.</p>
          <div className="mt-3"><RoleContextBanner /></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger className="h-9 w-[180px] rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={shiftTypeFilter} onValueChange={(v) => setShiftTypeFilter(v as "all" | ShiftType)}>
            <SelectTrigger className="h-9 w-[120px] rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All shifts</SelectItem>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="night">Night</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl px-1 py-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium text-foreground px-2">
              {weekStart.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – {addDays(weekStart, 6).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-secondary/50 border border-border px-3 py-2 text-[11px] text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
        <span>
          LogUp does not replace rota or payroll systems. This view helps managers evidence who was assigned and whether required competencies were in place.
        </span>
      </div>

      {/* Weekly summary cards */}
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<ShieldCheck className="h-4 w-4 text-success" />}
          label="Shifts covered"
          value={`${weekStats.covered}/${weekStats.total}`}
          tone="success"
        />
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4 text-warning" />}
          label="Need attention"
          value={`${weekStats.attention}`}
          tone="warning"
        />
        <SummaryCard
          icon={<ClipboardList className="h-4 w-4 text-destructive" />}
          label="Uncovered shifts"
          value={`${weekStats.uncovered}`}
          tone={weekStats.uncovered > 0 ? "destructive" : "muted"}
        />
        <SummaryCard
          icon={<CalendarClock className="h-4 w-4 text-warning" />}
          label="Qualifications expiring soon"
          value={`${weekStats.expiring}`}
          tone="muted"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-7 gap-3">
        {days.map((d) => {
          const date = iso(d);
          const isToday = date === iso(new Date());
          return (
            <div key={date} className="flex flex-col gap-2">
              <div className={`text-center text-xs font-semibold py-1.5 rounded-lg ${isToday ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                {fmtDay(d)}
              </div>
              {(["day", "night"] as ShiftType[]).map((type) => {
                if (shiftTypeFilter !== "all" && shiftTypeFilter !== type) return null;
                const sh = shiftFor(date, type);
                if (!sh) return null;
                const cov = shiftCoverage(sh);
                const c = ragColorClasses(cov.status);
                const assigned = sh.staffIds.map((id) => allStaff.find((s) => s.id === id)).filter(Boolean);
                const shIssue = getShiftIssue(sh);
                const issueSummary = shIssue
                  ? `${shIssue.staffName} — ${shIssue.qualificationName} ${shIssue.detail}`
                  : cov.gaps.length > 0
                    ? `Missing: ${cov.gaps.map((g) => g.qualificationName).join(", ")}`
                    : cov.warnings.find((w) => w.level === "red")?.message
                    ?? cov.warnings.find((w) => w.level === "amber")?.message;
                return (
                  <button
                    key={type}
                    onClick={() => setOpenShift(sh)}
                    className={`text-left bg-card rounded-xl border p-3 hover:shadow-card transition-all ${
                      cov.status === "uncovered" ? "border-destructive/30" : cov.status === "at_risk" ? "border-warning/30" : "border-success/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">{type}</span>
                      <Badge variant="outline" className={`text-[9px] ${c.bg} ${c.text} ${c.border} font-semibold`}>
                        {c.label}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {assigned.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground italic">No staff assigned</p>
                      ) : assigned.map((s) => (
                        <p key={s!.id} className="text-[11px] text-foreground truncate">{s!.name}</p>
                      ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-border/60 space-y-0.5">
                      <p className="text-[10px] text-muted-foreground">
                        {assigned.length}/{type === "day" ? 4 : 2} staff assigned
                      </p>
                      {cov.status === "covered" ? (
                        <p className="text-[10px] text-success">All required competencies met</p>
                      ) : issueSummary ? (
                        <p className={`text-[10px] ${cov.status === "uncovered" ? "text-destructive" : "text-warning"} line-clamp-2`}>{issueSummary}</p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <ShiftDialog shift={openShift} onClose={() => setOpenShift(null)} />
    </div>
  );
};

const SummaryCard = ({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "success" | "warning" | "destructive" | "muted" }) => {
  const toneClasses = {
    success: "border-success/20 bg-success/5",
    warning: "border-warning/20 bg-warning/5",
    destructive: "border-destructive/20 bg-destructive/5",
    muted: "border-border bg-card",
  }[tone];
  return (
    <div className={`rounded-xl border p-3 ${toneClasses}`}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
    </div>
  );
};

const ShiftDialog = ({ shift, onClose }: { shift: ShiftAssignment | null; onClose: () => void }) => {
  if (!shift) return null;
  const sites = workforceStore.getSites();
  const allStaff = workforceStore.getStaff();
  const reqs = workforceStore.getRequirements().filter((r) => r.siteId === shift.siteId && (r.appliesTo === "both" || r.appliesTo === shift.shift));
  const site = sites.find((s) => s.id === shift.siteId);
  const cov = shiftCoverage(shift);
  const c = ragColorClasses(cov.status);
  const di: ShiftIssue | undefined = getShiftIssue(shift);

  const assigned = shift.staffIds.map((id) => allStaff.find((s) => s.id === id)).filter(Boolean);
  const otherCandidates = allStaff.filter((s) => s.assignedSiteIds.includes(shift.siteId) && !shift.staffIds.includes(s.id));
  const onRota = otherCandidates.filter((s) => staffWorksOn(s, shift.date));
  const offRota = otherCandidates.filter((s) => !staffWorksOn(s, shift.date));

  return (
    <Dialog open={!!shift} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {site?.name} · {shift.shift === "day" ? "Day" : "Night"} · {new Date(shift.date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
            <Badge variant="outline" className={`text-[10px] ${c.bg} ${c.text} ${c.border} font-semibold ml-2`}>{c.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Required vs current */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Required competencies</p>
            <div className="space-y-1.5">
              {reqs.map((r) => {
                const t = workforceStore.getQualType(r.qualificationId);
                let current = assigned.reduce((n, s) => {
                  const q = s!.qualifications.find((x) => x.qualificationId === r.qualificationId);
                  if (!q) return n;
                  return qualificationStatus(q) === "red" ? n : n + 1;
                }, 0);
                // Demo override: force the affected required qual to be "not met" for uncovered scenarios
                if (di && di.kind === "uncovered" && di.qualificationId === r.qualificationId) {
                  current = 0;
                }
                const ok = current >= r.minimumPerShift;
                return (
                  <div key={r.id} className={`flex items-center gap-2 text-sm py-2 px-3 rounded-lg ${ok ? "bg-success/5" : "bg-destructive/5"}`}>
                    {ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-destructive" />}
                    <span className="flex-1 text-foreground">{t?.name}</span>
                    <span className={`text-xs font-semibold ${ok ? "text-success" : "text-destructive"}`}>{current} / {r.minimumPerShift}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gap reason — only when there is a demoIssue or warnings */}
          {(di || cov.warnings.length > 0) && (
            <div className={`rounded-lg border p-3 ${di?.kind === "uncovered" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5"}`}>
              <p className={`text-xs font-semibold uppercase mb-1 ${di?.kind === "uncovered" ? "text-destructive" : "text-warning"}`}>Gap reason</p>
              <p className="text-sm text-foreground">
                {di?.gapReason ?? cov.warnings[0]?.message}
              </p>
            </div>
          )}

          {/* Assigned staff */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              Assigned staff <span className="text-muted-foreground/70 font-normal">· {assigned.length}/{shift.shift === "day" ? 4 : 2}</span>
            </p>
            {assigned.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No staff assigned yet.</p>
            ) : (
              <ul className="space-y-2">
                {assigned.map((s) => {
                  const onToday = staffWorksOn(s!, shift.date);
                  const relevant = reqs.map((r) => {
                    const t = workforceStore.getQualType(r.qualificationId);
                    // Apply demo override for the issue staff/qual
                    if (di && di.staffId === s!.id && di.qualificationId === r.qualificationId) {
                      return {
                        name: t?.name ?? r.qualificationId,
                        status: (di.kind === "uncovered" ? "red" : "amber") as "red" | "amber",
                        label: di.detail,
                      };
                    }
                    const q = s!.qualifications.find((x) => x.qualificationId === r.qualificationId);
                    if (!q) return { name: t?.name ?? r.qualificationId, status: "missing" as const, label: "not on file" };
                    const st = qualificationStatus(q);
                    return {
                      name: t?.name ?? r.qualificationId,
                      status: st,
                      label: st === "red" ? `expired ${formatDate(q.expiresOn)}` : `valid until ${formatDate(q.expiresOn)}`,
                    };
                  });
                  const isIssueStaff = di && di.staffId === s!.id;
                  return (
                    <li key={s!.id} className={`px-3 py-2 rounded-lg border ${isIssueStaff ? (di!.kind === "uncovered" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5") : "border-border"}`}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground">{s!.name}</p>
                            <span className="text-[11px] text-muted-foreground">— {s!.role}</span>
                            {!onToday && (
                              <Badge variant="outline" className="text-[9px] bg-warning/10 text-warning border-warning/20">Off rota</Badge>
                            )}
                          </div>
                          {relevant.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5">
                              {relevant.map((r, i) => {
                                const cc = ragColorClasses(r.status);
                                return (
                                  <li key={i} className="flex items-center gap-2 text-[11px]">
                                    <span className={`h-2 w-2 rounded-full ${cc.dot}`} />
                                    <span className="text-foreground">{r.name}:</span>
                                    <span className={cc.text}>{r.label}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => workforceStore.removeStaffFromShift(shift.id, s!.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Suggested action */}
          {(di || cov.status !== "covered") && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-semibold text-primary uppercase mb-1">Suggested action</p>
              <p className="text-sm text-foreground">
                {di?.suggestedAction
                  ?? (cov.gaps.length > 0
                    ? `Assign a staff member with valid ${cov.gaps[0].qualificationName} or update qualification evidence.`
                    : cov.warnings.some((w) => w.level === "red")
                      ? "Replace the assigned staff member with expired certification, or update their evidence before shift start."
                      : "Schedule refresher training before the certification expires.")}
              </p>
            </div>
          )}

          {/* Create follow-up action */}
          <FollowUpActionPanel shift={shift} assigned={assigned.map((s) => s!) as ReturnType<typeof workforceStore.getStaff>} demoIssue={di} />

          {/* Candidate picker — split by rota */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
              <UserPlus className="h-3.5 w-3.5" /> Available staff
            </p>
            <div className="max-h-56 overflow-y-auto space-y-3 border border-border rounded-lg p-2">
              <CandidateSection
                title="On rota today"
                emptyText="No staff on rota for this site today."
                staff={onRota}
                shift={shift}
                reqs={reqs}
                onRota
              />
              {offRota.length > 0 && (
                <CandidateSection
                  title="Off rota (override)"
                  emptyText=""
                  staff={offRota}
                  shift={shift}
                  reqs={reqs}
                  onRota={false}
                />
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// --- Follow-up action panel with @mention autocomplete -----------------------
const FollowUpActionPanel = ({
  shift,
  assigned,
  demoIssue,
}: {
  shift: ShiftAssignment;
  assigned: ReturnType<typeof workforceStore.getStaff>;
  demoIssue?: ShiftIssue;
}) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const allStaff = workforceStore.getStaff();
  const allowedStaff = allStaff; // demo: any staff can be @mentioned

  useEffect(() => {
    if (!open) { setTitle(""); setAssigneeId(""); setMentionQuery(null); }
    else if (demoIssue) {
      // Pre-seed a sensible action from the demo issue
      setTitle(`@${demoIssue.staffName} ${demoIssue.suggestedAction}`);
      const match = allStaff.find((s) => s.name === demoIssue.staffName);
      if (match) setAssigneeId(match.id);
    }
  }, [open]);

  const onTitleChange = (v: string) => {
    setTitle(v);
    const caret = inputRef.current?.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = before.match(/@([\w'’.-]*)$/);
    setMentionQuery(m ? m[1] : null);
  };

  const pickMention = (s: ReturnType<typeof workforceStore.getStaff>[number]) => {
    const caret = inputRef.current?.selectionStart ?? title.length;
    const before = title.slice(0, caret).replace(/@([\w'’.-]*)$/, `@${s.name} `);
    const after = title.slice(caret);
    setTitle(before + after);
    setAssigneeId(s.id);
    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const suggestions = mentionQuery !== null
    ? allowedStaff.filter((s) => s.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
    : [];

  const submit = () => {
    if (!title.trim()) return;
    const assignee = allStaff.find((s) => s.id === assigneeId);
    const due = new Date(); due.setDate(due.getDate() + 3); due.setHours(17, 0, 0, 0);
    createTask({
      title: title.trim(),
      taskType: "follow_up",
      sourceType: "manual",
      sourceRef: `SHIFT-${shift.id}`,
      siteId: shift.siteId,
      siteIds: [shift.siteId],
      unitIds: [],
      ownership: assignee ? "person" : "location",
      assigneeId: assignee?.id ?? "",
      assignedById: CURRENT_USER.id,
      dueAt: due.toISOString(),
      priority: demoIssue?.kind === "uncovered" ? "high" : "normal",
    });
    toast.success(`Follow-up action created${assignee ? ` for ${assignee.name}` : ""}.`);
    setOpen(false);
  };

  if (!open) {
    return (
      <div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Create follow-up action
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
        <ListTodo className="h-3.5 w-3.5" /> New follow-up action
      </div>
      <p className="text-[11px] text-muted-foreground">
        Type <span className="font-mono bg-muted px-1 rounded">@name</span> to assign. Example: “@Tom Reed upload renewed Manual Handling certificate by Friday”.
      </p>
      <div className="relative">
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Describe the action…"
          className="h-9 text-sm"
        />
        {mentionQuery !== null && suggestions.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pickMention(s)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary flex items-center justify-between"
              >
                <span className="text-foreground">{s.name}</span>
                <span className="text-[11px] text-muted-foreground">{s.role}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Select value={assigneeId} onValueChange={setAssigneeId}>
          <SelectTrigger className="h-8 text-xs w-[200px]"><SelectValue placeholder="Assign to (or use @)" /></SelectTrigger>
          <SelectContent>
            {allStaff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" className="h-8 text-xs" onClick={submit} disabled={!title.trim()}>Create action</Button>
      </div>
      {assigned.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Action will be linked to this shift ({shift.shift === "day" ? "Day" : "Night"} · {new Date(shift.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}).
        </p>
      )}
    </div>
  );
};

// silence unused linter for rotaLabel — still used elsewhere if needed
void rotaLabel;


const CandidateSection = ({
  title, emptyText, staff, shift, reqs, onRota,
}: {
  title: string;
  emptyText: string;
  staff: ReturnType<typeof workforceStore.getStaff>;
  shift: ShiftAssignment;
  reqs: ReturnType<typeof workforceStore.getRequirements>;
  onRota: boolean;
}) => {
  if (staff.length === 0 && !emptyText) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase text-muted-foreground px-1 mb-1">{title}</p>
      {staff.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">{emptyText}</p>
      ) : (
        <div className="space-y-0.5">
          {staff.map((s) => {
            const dots = reqs.map((r) => {
              const q = s.qualifications.find((x) => x.qualificationId === r.qualificationId);
              const t = workforceStore.getQualType(r.qualificationId);
              if (!q) return { id: r.id, label: t?.name, status: "missing" as const };
              return { id: r.id, label: t?.name, status: qualificationStatus(q), days: daysToExpiry(q) };
            });
            return (
              <div key={s.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-secondary ${onRota ? "" : "opacity-60"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-foreground truncate">{s.name}</p>
                    <span className="text-[9px] font-semibold text-muted-foreground">· {s.rotaPattern}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{s.role}</p>
                </div>
                <div className="flex gap-1">
                  {dots.map((d) => {
                    const cc = ragColorClasses(d.status);
                    return <span key={d.id} className={`h-2 w-2 rounded-full ${cc.dot}`} title={`${d.label}: ${cc.label}`} />;
                  })}
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => workforceStore.assignStaff(shift.id, s.id)}>
                  Assign
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ShiftCoverage;
