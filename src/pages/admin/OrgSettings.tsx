import { resetDemoData } from "@/lib/demoScenario";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_RULES } from "@/lib/carePlanReviewRules";
import { ASSESSMENT_CATEGORIES, ASSESSMENT_CATEGORY_LABELS, type AssessmentCategory } from "@/lib/assessmentsStore";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  orgSettingsStore, useOrgSettings, buildTerms, PRESET_LABELS, SERVICE_USER_PRESETS,
  type ServiceUserLabelPreset,
} from "@/lib/orgSettingsStore";

const ORDER: ServiceUserLabelPreset[] = ["service_user", "resident", "person_supported", "client", "individual", "young_person", "custom"];

export default function OrgSettings() {
  const { serviceUserLabel, defaultCarePlanReviewDays } = useOrgSettings();
  const [reviewDays, setReviewDays] = useState(String(defaultCarePlanReviewDays));
  const reviewDaysNum = Number(reviewDays);
  const reviewDaysValid = Number.isInteger(reviewDaysNum) && reviewDaysNum >= 1 && reviewDaysNum <= 365;
  const [preset, setPreset] = useState<ServiceUserLabelPreset>(serviceUserLabel.preset);
  const [singular, setSingular] = useState(serviceUserLabel.preset === "custom" ? serviceUserLabel.singular : "");
  const [plural, setPlural] = useState(serviceUserLabel.preset === "custom" ? serviceUserLabel.plural : "");

  const def = SERVICE_USER_PRESETS.find((p) => p.id === preset);
  const draft = def
    ? { preset, singular: def.singular, plural: def.plural }
    : { preset, singular: singular.trim() || "…", plural: plural.trim() || "…" };
  const t = buildTerms(draft);
  const customInvalid = preset === "custom" && (!singular.trim() || !plural.trim());
  const unchanged = draft.preset === serviceUserLabel.preset && draft.singular === serviceUserLabel.singular && draft.plural === serviceUserLabel.plural;

  const save = () => {
    if (customInvalid) return;
    orgSettingsStore.setServiceUserLabel({ preset, singular, plural });
    toast.success("Organisation settings saved", { description: `People you support are now called "${t.plural}".` });
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organisation settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Choose what your organisation calls the people it supports. This wording is used across LogUp.</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Reset demo data</div>
            <p className="text-sm text-muted-foreground">Restores the three homes, 64 residents and all demo records to their starting state.</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="outline">Reset demo data</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
                <AlertDialogDescription>Everything recorded in this demo (events, care plan changes, assessments, admissions) is cleared and the starting dataset is restored. Your role and organisation settings are kept.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={resetDemoData}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">What do you call the people you support?</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={preset} onValueChange={(v) => setPreset(v as ServiceUserLabelPreset)} className="space-y-2">
              {ORDER.map((id) => {
                const p = SERVICE_USER_PRESETS.find((x) => x.id === id);
                return (
                  <label key={id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-secondary">
                    <RadioGroupItem value={id} />
                    <span className="text-sm font-medium">{PRESET_LABELS[id]}</span>
                    {p && <span className="text-xs text-muted-foreground ml-auto">{p.plural}</span>}
                  </label>
                );
              })}
            </RadioGroup>
            {preset === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Singular</Label><Input value={singular} onChange={(e) => setSingular(e.target.value)} placeholder="e.g. Tenant" /></div>
                <div className="space-y-1"><Label>Plural</Label><Input value={plural} onChange={(e) => setPlural(e.target.value)} placeholder="e.g. Tenants" /></div>
              </div>
            )}
            <Button onClick={save} disabled={customInvalid || unchanged}>Save</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Preview</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg bg-secondary p-3"><p className="text-xs text-muted-foreground">Sidebar</p><p className="font-medium">{t.Plural}</p></div>
            <div className="rounded-lg bg-secondary p-3"><p className="text-xs text-muted-foreground">Log an event</p><p className="font-medium">{t.Singular} <span className="text-destructive">*</span></p><p className="text-muted-foreground">Select {t.singular}</p></div>
            <div className="rounded-lg bg-secondary p-3"><p className="text-xs text-muted-foreground">Care plans</p><p className="font-medium">{t.possessive("care plan")}</p><p className="text-muted-foreground">{t.pluralPossessive("care plans")}</p></div>
            <div className="rounded-lg bg-secondary p-3"><p className="text-xs text-muted-foreground">Counts</p><p>{t.count(1)} · {t.count(142)}</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Care plan review suggestions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">When an event is logged for {buildTerms(serviceUserLabel).singular}, LogUp suggests a care plan review. This sets how many days the reviewer has to decide.</p>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="review-days">Days to review</Label>
              <Input id="review-days" type="number" min={1} max={365} className="w-28" value={reviewDays} onChange={(e) => setReviewDays(e.target.value)} />
            </div>
            <Button
              disabled={!reviewDaysValid || reviewDaysNum === defaultCarePlanReviewDays}
              onClick={() => { orgSettingsStore.setDefaultCarePlanReviewDays(reviewDaysNum); toast.success("Review period saved", { description: `New suggestions are due ${reviewDaysNum} day${reviewDaysNum === 1 ? "" : "s"} after the event is logged.` }); }}
            >Save</Button>
          </div>
          {!reviewDaysValid && <p className="text-xs text-destructive">Enter a whole number from 1 to 365.</p>}
        </CardContent>
      </Card>
      <ReassessmentRulesCard />
    </div>
  );
}

function ReassessmentRulesCard() {
  const { reassessmentRules } = useOrgSettings();
  const [ev, setEv] = useState<string>(CATEGORY_RULES[0].category);
  const [asm, setAsm] = useState<AssessmentCategory>("falls");
  const [note, setNote] = useState("");
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Reassessment rules</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Your organisation&apos;s own rules. After an event of this type, LogUp adds “Consider reassessment” to the review suggestion, marked “Provider rule”. It is always a suggestion.</p>
        {reassessmentRules.length === 0 ? <p className="text-sm italic text-muted-foreground">No rules yet.</p> : (
          <ul className="space-y-1">
            {reassessmentRules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm">
                <span>{r.eventCategory} → {ASSESSMENT_CATEGORY_LABELS[r.assessmentCategory as AssessmentCategory] ?? r.assessmentCategory}{r.note ? ` — ${r.note}` : ""}</span>
                <Button size="sm" variant="ghost" onClick={() => orgSettingsStore.removeReassessmentRule(r.id)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] items-end">
          <div className="space-y-1"><Label>Event type</Label>
            <Select value={ev} onValueChange={setEv}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORY_RULES.map((c) => <SelectItem key={c.category} value={c.category}>{c.category}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Assessment</Label>
            <Select value={asm} onValueChange={(v) => setAsm(v as AssessmentCategory)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ASSESSMENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{ASSESSMENT_CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label htmlFor="rr-note">Note (optional)</Label><Input id="rr-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button onClick={() => { orgSettingsStore.addReassessmentRule({ eventCategory: ev, assessmentCategory: asm, note: note.trim() || undefined }); setNote(""); }}>Add rule</Button>
        </div>
      </CardContent>
    </Card>
  );
}

