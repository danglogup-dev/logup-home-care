import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMedicationSource } from "@/components/MedicationSourceGate";
import type { Medication, MedicationInstructionVersion } from "@/lib/medicationStore";

type Form = { name: string; strength: string; dose: string; route: string; frequency: string; scheduledTimes: string; regularity: "regular" | "prn"; supportLevel: "prompt" | "assist" | "administer"; startDate: string; endDate: string; sourceDocument: string; providerInstructions: string };

/** Add a medicine or create a new draft version of one. Nothing goes live until a second person verifies. */
export function InstructionForm({ medication, version, clientId, siteId, onDone, onCancel }: { medication?: Medication; version?: MedicationInstructionVersion; clientId: string; siteId: string; onDone: () => void; onCancel: () => void }) {
  const { store } = useMedicationSource();
  const [form, setForm] = useState<Form>(() => version && medication
    ? { name: medication.name, strength: medication.strength, dose: version.dose, route: version.route, frequency: version.frequency, scheduledTimes: version.scheduled_times.join(", "), regularity: version.regularity, supportLevel: version.support_level, startDate: new Date().toISOString().slice(0, 10), endDate: version.end_date ?? "", sourceDocument: version.source_document, providerInstructions: version.provider_instructions }
    : { name: "", strength: "", dose: "", route: "Oral", frequency: "", scheduledTimes: "", regularity: "regular", supportLevel: "prompt", startDate: new Date().toISOString().slice(0, 10), endDate: "", sourceDocument: "", providerInstructions: "" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.name.trim() || !form.dose.trim()) { setError("Enter at least the medicine name and dose."); return; }
    setBusy(true); setError("");
    try {
      const input = { ...form, scheduledTimes: form.scheduledTimes.split(",").map((x) => x.trim()).filter(Boolean), endDate: form.endDate || null };
      if (medication) await store.updateInstruction({ ...input, medicationId: medication.id }); else await store.createInstruction({ ...input, clientId, siteId });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); } finally { setBusy(false); }
  };
  const fields = [["name", "Medicine"], ["strength", "Strength"], ["dose", "Dose"], ["route", "Route"], ["frequency", "Frequency"], ["scheduledTimes", "Times (e.g. 08:00, 20:00)"], ["startDate", "Start date"], ["endDate", "End date (optional)"], ["sourceDocument", "Source (GP letter, pharmacy label…)"]] as const;
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map(([k, label]) => <div key={k} className="space-y-1"><Label htmlFor={`f-${k}`}>{label}</Label><Input id={`f-${k}`} type={k.includes("Date") ? "date" : "text"} value={form[k]} disabled={!!medication && (k === "name" || k === "strength")} onChange={(e) => set(k, e.target.value)} /></div>)}
      <div className="space-y-1"><Label>Regular or PRN</Label><Select value={form.regularity} onValueChange={(v) => set("regularity", v as Form["regularity"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="regular">Regular</SelectItem><SelectItem value="prn">PRN (as needed)</SelectItem></SelectContent></Select></div>
      <div className="space-y-1"><Label>Support level</Label><Select value={form.supportLevel} onValueChange={(v) => set("supportLevel", v as Form["supportLevel"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="prompt">Prompt</SelectItem><SelectItem value="assist">Assist</SelectItem><SelectItem value="administer">Administer</SelectItem></SelectContent></Select></div>
    </div>
    <div className="space-y-1"><Label htmlFor="f-instr">Instructions for carers</Label><Textarea id="f-instr" value={form.providerInstructions} onChange={(e) => set("providerInstructions", e.target.value)} /></div>
    <p className="text-sm text-muted-foreground">Saved as a draft. A different person must verify it before carers see it.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex gap-2"><Button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save draft"}</Button><Button variant="ghost" onClick={onCancel}>Cancel</Button></div>
  </div>;
}
