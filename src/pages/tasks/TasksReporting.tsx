import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useTasksStore, runReport, exportReportCsv, downloadCsv,
  effectiveStatus, statusBadgeClass, statusLabel, taskTypeLabel, sourceLabel,
  siteName, unitName, staffName, SITES, STAFF, type ReportFilters,
} from "@/lib/tasksStore";
import { useRole } from "@/hooks/useRole";
import { inScope } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";
import { Download } from "lucide-react";

export default function TasksReporting() {
  const { tasks } = useTasksStore(); // reactive
  const [from, setFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 14); return d.toISOString().slice(0,10);
  });
  const [to, setTo] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0,10);
  });
  const [siteId, setSiteId] = useState<string>("all");
  const [assigneeId, setAssigneeId] = useState<string>("all");
  const [taskType, setTaskType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const filters: ReportFilters = useMemo(() => ({
    from: from ? new Date(from + "T00:00:00").toISOString() : undefined,
    to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
    siteId: siteId === "all" ? undefined : siteId,
    assigneeId: assigneeId === "all" ? undefined : assigneeId,
    taskType: taskType === "all" ? undefined : (taskType as any),
    status: status === "all" ? undefined : (status as any),
  }), [from, to, siteId, assigneeId, taskType, status]);

  const role = useRole();
  const allRows = runReport(filters);
  const rows = useMemo(() => {
    const ids = new Set(SITES.filter(s => inScope(s.name, role.role, role.scope)).map(s => s.id));
    return allRows.filter(r => ids.has(r.siteId));
  }, [allRows, role.role, role.scope]);

  const summary = {
    total: rows.length,
    completed: rows.filter(r => r.status === "completed").length,
    skipped: rows.filter(r => r.status === "skipped").length,
    overdue: rows.filter(r => effectiveStatus(r) === "overdue").length,
  };

  const exportCsv = () => {
    const csv = exportReportCsv(rows);
    downloadCsv(`tasks-report-${new Date().toISOString().slice(0,10)}.csv`, csv);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-20 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Tasks reporting</h1>
          <p className="text-muted-foreground mt-1 text-sm">Inspection-ready proof of operational follow-through.</p>
          <div className="mt-3"><RoleContextBanner /></div>
        </div>
        <Button onClick={exportCsv} className="h-9 rounded-xl text-sm font-semibold"><Download className="h-4 w-4 mr-2"/>Export CSV</Button>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <Sel label="Site" value={siteId} setValue={setSiteId} options={[["all","All sites"], ...SITES.filter(s => inScope(s.name, role.role, role.scope)).map(s => [s.id, s.name] as [string,string])]} />
          <Sel label="Assignee" value={assigneeId} setValue={setAssigneeId} options={[["all","All"], ...STAFF.map(s => [s.id, s.name] as [string,string])]} />
          <Sel label="Type" value={taskType} setValue={setTaskType} options={[["all","All"],["recurring","Recurring"],["follow_up","Follow-up"],["one_off","One-off"]]} />
          <Sel label="Status" value={status} setValue={setStatus} options={[["all","All"],["completed","Completed"],["skipped","Skipped"],["overdue","Overdue"],["open","Open"],["in_progress","In progress"]]} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total" value={summary.total} />
        <Stat label="Completed" value={summary.completed} tone="text-success" />
        <Stat label="Skipped" value={summary.skipped} tone="text-muted-foreground" />
        <Stat label="Overdue" value={summary.overdue} tone="text-destructive" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Results ({rows.length})</CardTitle></CardHeader>
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
                <TableHead>Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(t => {
                const s = effectiveStatus(t);
                return (
                  <TableRow key={t.id}>
                    <TableCell><Badge className={statusBadgeClass(s)} variant="outline">{statusLabel(s)}</Badge></TableCell>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell>{taskTypeLabel(t.taskType)}</TableCell>
                    <TableCell className="text-sm">{siteName(t.siteId)}</TableCell>
                    <TableCell className="text-sm">{staffName(t.assigneeId)}</TableCell>
                    <TableCell className="text-sm">{sourceLabel(t.sourceType)}{t.sourceRef ? ` · ${t.sourceRef}` : ""}</TableCell>
                    <TableCell className="text-sm">{new Date(t.dueAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell className="text-sm">{t.completedAt ? new Date(t.completedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No matching tasks.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Sel({ label, value, setValue, options }: { label: string; value: string; setValue: (v: string) => void; options: [string,string][] }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className={`text-2xl font-semibold ${tone ?? ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </CardContent></Card>
  );
}
