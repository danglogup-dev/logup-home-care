import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { carePlansStore, type CarePlanSection } from "@/lib/carePlansStore";
import { cloneVisitSchedule, type CarePlanVisitTemplate } from "@/lib/carePlanVisitSchedule";
import { visitsStore, type Weekday, type VisitCallType, type MedicationSupportLevel } from "@/lib/visitsStore";
import type { RoleState } from "@/lib/roleStore";
import type { ServiceUserId } from "@/lib/demoDataRegistry";
import { toast } from "@/components/ui/use-toast";

export default function VisitScheduleEditor({ clientId, section, actor, editable }: { clientId: ServiceUserId; section: CarePlanSection; actor: RoleState; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [calls, setCalls] = useState<CarePlanVisitTemplate[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const patch = (id: string, values: Partial<CarePlanVisitTemplate>) => setCalls((items) => items.map((t) => t.id === id ? { ...t, ...values } : t));
  const begin = () => {
    setCalls(cloneVisitSchedule(section.visitTemplates ?? visitsStore.templatesForClient(clientId)));
    setReason(""); setError(""); setEditing(true);
  };
  const save = () => {
    try {
      carePlansStore.saveDraftVisitSchedule(clientId, calls, actor, reason);
      setEditing(false);
      toast({ title: "Visit schedule saved to draft", description: "Visits change only when this plan is published." });
    } catch (e) { setError(e instanceof Error ? e.message : "Schedule could not be saved."); }
  };
  if (!editing) return editable ? <Button size="sm" variant="outline" className="mt-3" onClick={begin}>Edit visit schedule</Button> : null;
  return <div className="mt-4 space-y-4 border-t border-border pt-4">
    {calls.map((t, index) => <fieldset key={t.id} className="min-w-0 space-y-3 border-b border-border pb-4">
      <legend className="text-sm font-medium">Call {index + 1}</legend>
      <div className="flex items-center justify-between gap-2">
        <Select value={t.callType} onValueChange={(value) => patch(t.id, { callType: value as VisitCallType })}><SelectTrigger aria-label={`Call ${index + 1} type`} className="w-40"><SelectValue /></SelectTrigger><SelectContent>{["morning", "lunch", "tea", "bed"].map((c) => <SelectItem key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent></Select>
        <Button size="icon" variant="ghost" aria-label={`Remove call ${index + 1}`} title="Remove call" onClick={() => setCalls((items) => items.filter((c) => c.id !== t.id))}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <div className="flex flex-wrap gap-3">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, d) => <Label key={day} className="flex min-h-11 items-center gap-2"><Checkbox checked={t.daysOfWeek.includes(d as Weekday)} onCheckedChange={(checked) => patch(t.id, { daysOfWeek: checked === true ? [...t.daysOfWeek, d as Weekday].sort() : t.daysOfWeek.filter((v) => v !== d) })} />{day}</Label>)}</div>
      <div className="grid grid-cols-2 gap-3">
        <Label className="space-y-2">Window start<Input aria-label={`Call ${index + 1} window start`} type="time" value={t.windowStart} onChange={(e) => patch(t.id, { windowStart: e.target.value })} /></Label>
        <Label className="space-y-2">Window end<Input aria-label={`Call ${index + 1} window end`} type="time" value={t.windowEnd} onChange={(e) => patch(t.id, { windowEnd: e.target.value })} /></Label>
        <Label className="space-y-2">Duration (minutes)<Input aria-label={`Call ${index + 1} duration`} type="number" min={5} max={240} value={t.durationMinutes} onChange={(e) => patch(t.id, { durationMinutes: Number(e.target.value) })} /></Label>
        <Label className="space-y-2">Carers required<Input aria-label={`Call ${index + 1} carers`} type="number" min={1} max={4} value={t.carersRequired} onChange={(e) => patch(t.id, { carersRequired: Number(e.target.value) })} /></Label>
      </div>
      <Label className="block space-y-2">Tasks (one per line)<Textarea aria-label={`Call ${index + 1} tasks`} rows={4} value={t.tasks.join("\n")} onChange={(e) => patch(t.id, { tasks: e.target.value.split("\n") })} /></Label>
      {t.medications.map((m, mi) => <div key={mi} className="grid min-w-0 grid-cols-2 gap-2">
        <Input aria-label={`Call ${index + 1} medication ${mi + 1} name`} placeholder="Medication name" value={m.name} onChange={(e) => patch(t.id, { medications: t.medications.map((v, i) => i === mi ? { ...v, name: e.target.value } : v) })} />
        <Input aria-label={`Call ${index + 1} medication ${mi + 1} dose`} placeholder="Dose" value={m.dose ?? ""} onChange={(e) => patch(t.id, { medications: t.medications.map((v, i) => i === mi ? { ...v, dose: e.target.value } : v) })} />
        <Select value={m.supportLevel} onValueChange={(value) => patch(t.id, { medications: t.medications.map((v, i) => i === mi ? { ...v, supportLevel: value as MedicationSupportLevel } : v) })}><SelectTrigger aria-label={`Call ${index + 1} medication ${mi + 1} support`}><SelectValue /></SelectTrigger><SelectContent>{["prompt", "assist", "administer"].map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}</SelectContent></Select>
        <Button variant="ghost" size="icon" aria-label={`Remove medication ${mi + 1} from call ${index + 1}`} title="Remove medication" onClick={() => patch(t.id, { medications: t.medications.filter((_, i) => i !== mi) })}><Trash2 className="h-4 w-4" /></Button>
      </div>)}
      <Button size="sm" variant="outline" onClick={() => patch(t.id, { medications: [...t.medications, { name: "", supportLevel: "prompt" }] })}><Plus className="mr-2 h-4 w-4" />Medication</Button>
    </fieldset>)}
    <Button variant="outline" size="sm" onClick={() => setCalls((items) => [...items, { id: crypto.randomUUID(), callType: "morning", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], windowStart: "07:30", windowEnd: "09:00", durationMinutes: 30, carersRequired: 1, tasks: [""], medications: [] }])}><Plus className="mr-2 h-4 w-4" />Add call</Button>
    <Label className="block space-y-2">Reason for schedule change<Input aria-label="Reason for schedule change" value={reason} onChange={(e) => setReason(e.target.value)} /></Label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" onClick={save}><Save className="mr-2 h-4 w-4" />Confirm schedule &amp; save draft</Button><Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button></div>
  </div>;
}