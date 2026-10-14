import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { MultiSelect } from "@/components/MultiSelect";
import {
  useTasksStore, SITES, STAFF, staffName,
  createTemplate, updateTemplate, deleteTemplate,
  recurrenceSummary, formatLocations, WEEKDAY_LABELS_SHORT,
  type Recurrence, type Weekday,
} from "@/lib/tasksStore";
import { useRole } from "@/hooks/useRole";
import { inScope } from "@/lib/roleStore";
import { RoleContextBanner } from "@/components/RoleContextBanner";

const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0]; // Mon-first display

export default function RecurringSetup() {
  const { templates: allTemplates } = useTasksStore();
  const role = useRole();
  const allowedSites = useMemo(
    () => SITES.filter(s => inScope(s.name, role.role, role.scope)),
    [role.role, role.scope],
  );
  const allowedSiteIds = useMemo(() => new Set(allowedSites.map(s => s.id)), [allowedSites]);
  const firstSiteId = allowedSites[0]?.id ?? SITES[0].id;
  // Only show templates that touch at least one in-scope site.
  const templates = useMemo(
    () => allTemplates.filter(t => {
      const ids = t.siteIds && t.siteIds.length ? t.siteIds : [t.siteId];
      return ids.some(id => allowedSiteIds.has(id));
    }),
    [allTemplates, allowedSiteIds],
  );
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [siteIds, setSiteIds] = useState<string[]>([firstSiteId]);
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [defaultAssigneeId, setDefaultAssigneeId] = useState(STAFF[0].id);
  const [frequency, setFrequency] = useState<Recurrence>("daily");
  const [weekdays, setWeekdays] = useState<Weekday[]>([1, 3, 5]);
  const [dueTimes, setDueTimes] = useState<string[]>(["09:00"]);

  // Available units depend on selected sites
  const unitOptions = useMemo(() => {
    return allowedSites.filter(s => siteIds.includes(s.id)).flatMap(s =>
      s.units.map(u => ({ value: u.id, label: u.name, group: s.name }))
    );
  }, [siteIds, allowedSites]);

  // When sites change, drop units that no longer belong
  const onSitesChange = (next: string[]) => {
    setSiteIds(next);
    const valid = new Set(
      allowedSites.filter(s => next.includes(s.id)).flatMap(s => s.units.map(u => u.id))
    );
    setUnitIds(prev => prev.filter(id => valid.has(id)));
  };

  const reset = () => {
    setEditingId(null); setTitle(""); setDescription("");
    setSiteIds([firstSiteId]); setUnitIds([]);
    setDefaultAssigneeId(STAFF[0].id);
    setFrequency("daily"); setWeekdays([1, 3, 5]); setDueTimes(["09:00"]);
  };

  const startEdit = (id: string) => {
    const t = templates.find(x => x.id === id); if (!t) return;
    setEditingId(id); setTitle(t.title); setDescription(t.description ?? "");
    setSiteIds(t.siteIds.length ? t.siteIds : [t.siteId]);
    setUnitIds(t.unitIds);
    setDefaultAssigneeId(t.defaultAssigneeId);
    setFrequency(t.frequency);
    setWeekdays(t.weekdays ?? [1, 3, 5]);
    setDueTimes(t.dueTimes.length ? t.dueTimes : [t.dueTime]);
    setOpen(true);
  };

  const addTime = () => setDueTimes(prev => [...prev, "12:00"]);
  const updateTime = (i: number, v: string) =>
    setDueTimes(prev => prev.map((t, idx) => idx === i ? v : t));
  const removeTime = (i: number) =>
    setDueTimes(prev => prev.filter((_, idx) => idx !== i));

  const toggleWeekday = (d: Weekday) =>
    setWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const save = () => {
    if (!title.trim()) { toast("Title required"); return; }
    if (siteIds.length === 0) { toast("Select at least one site"); return; }
    const cleanTimes = Array.from(new Set(dueTimes.filter(t => /^\d{2}:\d{2}$/.test(t)))).sort();
    if (cleanTimes.length === 0) { toast("Add at least one due time"); return; }
    const useWeekdays = (frequency === "weekly" || frequency === "custom");
    if (useWeekdays && weekdays.length === 0) {
      toast("Pick at least one day of the week"); return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      taskType: "recurring" as const,
      siteIds, unitIds,
      defaultAssigneeId,
      frequency,
      dueTimes: cleanTimes,
      weekdays: useWeekdays ? weekdays.slice().sort() : undefined,
    };
    if (editingId) {
      updateTemplate(editingId, {
        ...payload,
        siteId: siteIds[0],
        unitId: unitIds[0],
        dueTime: cleanTimes[0],
      });
      toast("Template updated");
    } else {
      createTemplate(payload);
      toast("Template created");
    }
    setOpen(false); reset();
  };

  const showWeekdays = frequency === "weekly" || frequency === "custom";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-20 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Recurring task setup</h1>
          <p className="text-muted-foreground mt-1 text-sm">Define recurring operational checks across sites and units. Tasks generate on schedule.</p>
          <div className="mt-3"><RoleContextBanner /></div>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild><Button>New recurring task</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editingId ? "Edit" : "New"} recurring task</DialogTitle></DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Medication fridge temperature check" /></div>
              <div><Label>Instructions</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>

              <div className="grid grid-cols-2 gap-3">
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
                    placeholder="All units in selected sites"
                    emptyText="Pick a site first"
                  />
                </div>
                <div>
                  <Label>Default assignee</Label>
                  <Select value={defaultAssigneeId} onValueChange={setDefaultAssigneeId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STAFF.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — {s.role}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={v => setFrequency(v as Recurrence)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="custom">Custom (specific weekdays)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {showWeekdays && (
                <div>
                  <Label>Repeats on</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {ALL_WEEKDAYS.map(d => {
                      const selected = weekdays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleWeekday(d)}
                          className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                            selected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-foreground border-input hover:bg-muted"
                          }`}
                        >
                          {WEEKDAY_LABELS_SHORT[d]}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">Pattern repeats every week.</p>
                </div>
              )}

              <div>
                <Label>Due time(s)</Label>
                <div className="space-y-2 mt-1.5">
                  {dueTimes.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input type="time" value={t} onChange={e => updateTime(i, e.target.value)} className="w-36" />
                      {dueTimes.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeTime(i)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addTime}>
                    <Plus className="h-4 w-4 mr-1" /> Add another time
                  </Button>
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Summary</div>
                <div className="text-sm font-medium">
                  {recurrenceSummary({ frequency, dueTimes, weekdays, dueTime: dueTimes[0] ?? "" })}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
              <Button onClick={save}>{editingId ? "Save" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Sites / Units</TableHead>
                <TableHead>Default assignee</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell className="text-sm">{formatLocations(t)}</TableCell>
                  <TableCell>{staffName(t.defaultAssigneeId)}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">{t.frequency}</Badge>
                      <span className="text-muted-foreground">{recurrenceSummary(t)}</span>
                    </div>
                  </TableCell>
                  <TableCell><Switch checked={t.active} onCheckedChange={v => updateTemplate(t.id, { active: v })} /></TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(t.id)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => { deleteTemplate(t.id); toast("Template removed"); }}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
              {templates.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No recurring tasks yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
