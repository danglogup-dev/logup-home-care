import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { X } from "lucide-react";
import { MultiSelect } from "@/components/MultiSelect";
import {
  useTasksStore, effectiveStatus, statusBadgeClass, statusLabel,
  siteName, unitName, staffName, taskTypeLabel, sourceLabel, formatLocations,
  SITES, STAFF, isOverdue, createTask, taskSiteIds, type TaskType, type TaskPriority, type TaskOwnership,
} from "@/lib/tasksStore";
import { useRole } from "@/hooks/useRole";
import { inScope } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";

type StatusFilter =
  | "all" | "open" | "in_progress" | "completed" | "skipped"
  | "overdue" | "past" | "current" | "future"
  | "due_today" | "open_or_progress" | "needs_attention";

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All", open: "Open", in_progress: "In progress",
  completed: "Completed", skipped: "Skipped", overdue: "Overdue",
  past: "Past", current: "Current", future: "Upcoming",
  due_today: "Due today", open_or_progress: "Open or in progress",
  needs_attention: "Needs attention",
};

export default function TaskRegister() {
  const { tasks } = useTasksStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("current");
  const [siteId, setSiteId] = useState<string>("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [taskType, setTaskType] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [period, setPeriod] = useState<string>("any"); // any | today
  const [sort, setSort] = useState<string>("due_soon");

  // Hydrate filters from URL on mount / param change
  useEffect(() => {
    const s = searchParams.get("status") as StatusFilter | null;
    if (s && s in STATUS_LABELS) setStatus(s); else if (!s) setStatus("current");
    setSiteId(searchParams.get("siteId") ?? "all");
    setAssignee(searchParams.get("assignee") ?? "all");
    setTaskType(searchParams.get("taskType") ?? "all");
    setSource(searchParams.get("source") ?? "all");
    setPriority(searchParams.get("priority") ?? "all");
    setPeriod(searchParams.get("period") ?? "any");
    setQ(searchParams.get("q") ?? "");
    if (s === "overdue" || s === "needs_attention") setSort("overdue_first");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); };
  const endOfToday = () => { const d = new Date(); d.setHours(23,59,59,999); return d.getTime(); };

  const role = useRole();
  const scopedSiteIds = useMemo(
    () => new Set(SITES.filter(s => inScope(s.name, role.role, role.scope)).map(s => s.id)),
    [role.role, role.scope],
  );

  const filtered = useMemo(() => {
    const now = Date.now();
    let rows = tasks.filter(t => {
      if (!taskSiteIds(t).some(sid => scopedSiteIds.has(sid))) return false;
      if (q && !(`${t.title} ${t.description ?? ""} ${t.sourceRef ?? ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
      if (siteId !== "all" && t.siteId !== siteId) return false;
      if (assignee !== "all" && t.assigneeId !== assignee) return false;
      if (taskType !== "all" && t.taskType !== taskType) return false;
      if (source !== "all" && t.sourceType !== source) return false;
      if (priority !== "all" && t.priority !== priority) return false;

      // period gate (used by "Completed today")
      if (period === "today") {
        const ref = t.completedAt ? new Date(t.completedAt).getTime() : new Date(t.dueAt).getTime();
        if (ref < startOfToday() || ref > endOfToday()) return false;
      }

      switch (status) {
        case "overdue": return isOverdue(t);
        case "completed": return t.status === "completed";
        case "skipped": return t.status === "skipped";
        case "open": return t.status === "open" && !isOverdue(t);
        case "in_progress": return t.status === "in_progress";
        case "open_or_progress": return t.status === "open" || t.status === "in_progress";
        case "needs_attention": {
          if (isOverdue(t)) return true;
          const d = new Date(t.dueAt).getTime();
          return d >= startOfToday() && d <= endOfToday() && (t.status === "open" || t.status === "in_progress");
        }
        case "due_today": {
          const d = new Date(t.dueAt).getTime();
          return d >= startOfToday() && d <= endOfToday() && (t.status === "open" || t.status === "in_progress");
        }
        case "past": return new Date(t.dueAt).getTime() < now - 86400000;
        case "future": return new Date(t.dueAt).getTime() > endOfToday() && (t.status === "open" || t.status === "in_progress");
        case "current": {
          const d = new Date(t.dueAt).getTime();
          return d >= now - 86400000 && d <= now + 86400000;
        }
        case "all": default: return true;
      }
    });

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "overdue_first": {
          const ao = isOverdue(a) ? 0 : 1, bo = isOverdue(b) ? 0 : 1;
          if (ao !== bo) return ao - bo;
          return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        }
        case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "assignee": return staffName(a.assigneeId).localeCompare(staffName(b.assigneeId));
        case "site": return siteName(a.siteId).localeCompare(siteName(b.siteId));
        default: return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      }
    });
    return rows;
  }, [tasks, q, status, siteId, assignee, taskType, source, priority, period, sort, scopedSiteIds]);

  // Active filter chips (anything not at default)
  const activeChips: { key: string; label: string; clear: () => void }[] = [];
  if (status !== "current" && status !== "all") activeChips.push({ key: "status", label: `Status: ${STATUS_LABELS[status]}`, clear: () => updateParam("status", null) });
  if (siteId !== "all") activeChips.push({ key: "siteId", label: `Site: ${siteName(siteId)}`, clear: () => updateParam("siteId", null) });
  if (assignee !== "all") activeChips.push({ key: "assignee", label: `Assignee: ${staffName(assignee)}`, clear: () => updateParam("assignee", null) });
  if (taskType !== "all") activeChips.push({ key: "taskType", label: `Type: ${taskTypeLabel(taskType as TaskType)}`, clear: () => updateParam("taskType", null) });
  if (source !== "all") activeChips.push({ key: "source", label: `Source: ${sourceLabel(source as any)}`, clear: () => updateParam("source", null) });
  if (priority !== "all") activeChips.push({ key: "priority", label: `Priority: ${priority}`, clear: () => updateParam("priority", null) });
  if (period === "today") activeChips.push({ key: "period", label: `Period: Today`, clear: () => updateParam("period", null) });
  if (q) activeChips.push({ key: "q", label: `“${q}”`, clear: () => updateParam("q", null) });

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === "" || value === "all" || value === "any") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  function clearAll() {
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-20 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Task register</h1>
          <p className="text-muted-foreground mt-1 text-sm">All operational tasks — filter, sort, and act.</p>
          <div className="mt-3"><RoleContextBanner /></div>
        </div>
        <NewTaskDialog />
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-xs text-muted-foreground">Filtered by:</span>
          {activeChips.map(c => (
            <button key={c.key} onClick={c.clear}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs hover:bg-primary/20 transition-colors">
              {c.label} <X className="h-3 w-3" />
            </button>
          ))}
          <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground underline ml-1">
            Clear all
          </button>
        </div>
      )}

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Search</Label>
            <Input placeholder="Search title, ref…" value={q}
              onChange={e => { setQ(e.target.value); updateParam("q", e.target.value); }} />
          </div>
          <FilterSelect label="Status" value={status} setValue={v => { setStatus(v as StatusFilter); updateParam("status", v === "current" ? null : v); }} options={[
            ["current","Current"],["needs_attention","Needs attention"],
            ["overdue","Overdue"],["due_today","Due today"],["future","Upcoming"],
            ["open","Open"],["in_progress","In progress"],["open_or_progress","Open or in progress"],
            ["completed","Completed"],["skipped","Skipped"],
            ["past","Past"],["all","All"],
          ]} />
          <FilterSelect label="Site / house" value={siteId} setValue={v => { setSiteId(v); updateParam("siteId", v); }} options={[["all","All sites"], ...SITES.filter(s => inScope(s.name, role.role, role.scope)).map(s => [s.id, s.name] as [string,string])]} />
          <FilterSelect label="Assignee" value={assignee} setValue={v => { setAssignee(v); updateParam("assignee", v); }} options={[["all","All"], ...STAFF.map(s => [s.id, s.name] as [string,string])]} />
          <FilterSelect label="Type" value={taskType} setValue={v => { setTaskType(v); updateParam("taskType", v); }} options={[["all","All"],["recurring","Recurring"],["follow_up","Follow-up"],["one_off","One-off"]]} />
          <FilterSelect label="Source" value={source} setValue={v => { setSource(v); updateParam("source", v); }} options={[["all","All"],["manual","Manual"],["incident","Incident"],["audit","Audit"],["recurring_template","Recurring"]]} />
          <FilterSelect label="Priority" value={priority} setValue={v => { setPriority(v); updateParam("priority", v); }} options={[["all","All"],["high","High"],["normal","Normal"],["low","Low"]]} />
          <FilterSelect label="Sort by" value={sort} setValue={setSort} options={[
            ["due_soon","Due soonest"],["overdue_first","Overdue first"],["newest","Newest"],["assignee","Assignee"],["site","Site/unit"],
          ]} />
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground px-1">{filtered.length} task{filtered.length === 1 ? "" : "s"}</div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(t => {
                const s = effectiveStatus(t);
                return (
                  <TableRow key={t.id} className="cursor-pointer hover:bg-muted/40" onClick={() => (window.location.href = `/app/tasks/${t.id}`)}>
                    <TableCell><Badge className={statusBadgeClass(s)} variant="outline">{statusLabel(s)}</Badge></TableCell>
                    <TableCell>
                      <Link to={`/app/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                      {t.priority === "high" && <Badge variant="destructive" className="ml-2">High</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">{taskTypeLabel(t.taskType)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{formatLocations(t)}</TableCell>
                    <TableCell className="text-sm">{staffName(t.assigneeId)}</TableCell>
                    <TableCell className="text-sm">
                      {sourceLabel(t.sourceType)}{t.sourceRef && t.sourceType !== "recurring_template" ? ` · ${t.sourceRef}` : ""}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{new Date(t.dueAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No tasks match your filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({ label, value, setValue, options }: { label: string; value: string; setValue: (v: string) => void; options: [string,string][] }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function NewTaskDialog() {
  const role = useRole();
  const allowedSites = useMemo(
    () => SITES.filter(s => inScope(s.name, role.role, role.scope)),
    [role.role, role.scope],
  );
  const firstSiteId = allowedSites[0]?.id ?? SITES[0].id;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("one_off");
  const [ownership, setOwnership] = useState<TaskOwnership>("person");
  const [siteIds, setSiteIds] = useState<string[]>([firstSiteId]);
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState(STAFF[0].id);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setHours(d.getHours()+4,0,0,0);
    return d.toISOString().slice(0,16);
  });
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [sourceRef, setSourceRef] = useState("");

  const unitOptions = useMemo(() => {
    return allowedSites.filter(s => siteIds.includes(s.id)).flatMap(s =>
      s.units.map(u => ({ value: u.id, label: u.name, group: s.name }))
    );
  }, [siteIds, allowedSites]);

  const onSitesChange = (next: string[]) => {
    setSiteIds(next);
    const valid = new Set(
      allowedSites.filter(s => next.includes(s.id)).flatMap(s => s.units.map(u => u.id))
    );
    setUnitIds(prev => prev.filter(id => valid.has(id)));
  };

  const reset = () => {
    setTitle(""); setDescription(""); setSourceRef("");
    setTaskType("one_off"); setPriority("normal"); setOwnership("person");
    setSiteIds([firstSiteId]); setUnitIds([]);
    setAssigneeId(STAFF[0].id);
  };

  const submit = () => {
    if (!title.trim()) { toast("Title required"); return; }
    if (siteIds.length === 0) { toast("Select at least one site"); return; }
    const t = createTask({
      title: title.trim(), description: description.trim() || undefined,
      taskType,
      sourceType: sourceRef.startsWith("INC") ? "incident" : sourceRef.startsWith("AUDIT") ? "audit" : "manual",
      sourceRef: sourceRef.trim() || undefined,
      siteId: siteIds[0],
      unitId: unitIds[0],
      siteIds,
      unitIds,
      ownership,
      assigneeId: ownership === "person" ? assigneeId : "",
      assignedById: "u-ana",
      dueAt: new Date(dueDate).toISOString(),
      priority,
    });
    toast("Task created", { description: ownership === "location"
        ? `${t.title} · house task (${siteIds.length > 1 ? `${siteIds.length} sites` : siteName(siteIds[0])})`
        : (siteIds.length > 1 ? `${t.title} · ${siteIds.length} sites` : t.title) });
    setOpen(false); reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild><Button>New task</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Create task</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div><Label>Instructions</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>

          <div>
            <Label>Ownership</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button type="button" onClick={() => setOwnership("person")}
                className={`rounded-md border p-3 text-left text-sm transition-colors ${ownership === "person" ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}>
                <div className="font-medium">Assigned to a person</div>
                <div className="text-xs text-muted-foreground mt-0.5">e.g. GP follow-up, replace call bell</div>
              </button>
              <button type="button" onClick={() => setOwnership("location")}
                className={`rounded-md border p-3 text-left text-sm transition-colors ${ownership === "location" ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}>
                <div className="font-medium">Owned by site / house / unit</div>
                <div className="text-xs text-muted-foreground mt-0.5">Any on-shift staff can complete</div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Type</Label>
              <Select value={taskType} onValueChange={v => setTaskType(v as TaskType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_off">One-off</SelectItem>
                  <SelectItem value="follow_up">Follow-up</SelectItem>
                  <SelectItem value="recurring">Recurring (single)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Priority</Label>
              <Select value={priority} onValueChange={v => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sites <span className="text-muted-foreground font-normal">(one or more)</span></Label>
              <MultiSelect
                options={allowedSites.map(s => ({ value: s.id, label: s.name }))}
                values={siteIds}
                onChange={onSitesChange}
                placeholder="Select sites…"
              />
            </div>
            <div>
              <Label>Units <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <MultiSelect
                options={unitOptions}
                values={unitIds}
                onChange={setUnitIds}
                placeholder="All units"
                emptyText="Pick a site first"
              />
            </div>
            <div><Label>Assignee {ownership === "location" && <span className="text-muted-foreground font-normal">(not used for house tasks)</span>}</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId} disabled={ownership === "location"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STAFF.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — {s.role}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Due</Label><Input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
          </div>
          {siteIds.length > 1 && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              This task will apply across {siteIds.length} sites{unitIds.length > 0 ? ` and ${unitIds.length} unit${unitIds.length === 1 ? "" : "s"}` : ""}.
            </div>
          )}
          <div><Label>Linked reference (optional)</Label>
            <Input placeholder="INC-2026-001 or AUDIT-2025-03" value={sourceRef} onChange={e => setSourceRef(e.target.value)} />
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={submit}>Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
