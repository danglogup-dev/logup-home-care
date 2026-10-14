import { isManagerRole } from "@/lib/roleStore";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, FileUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTerms } from "@/hooks/useTerms";
import { useRole } from "@/hooks/useRole";
import { scopedSiteIds } from "@/lib/roleStore";
import { useSites, useIsHomeSupportOrg } from "@/lib/sitesStore";
import { serviceUsersStore, admissionDraftsStore, nextServiceUserCode } from "@/lib/serviceUsersStore";
import { carePlansStore } from "@/lib/carePlansStore";
import {
  STAFF, getStaffName,
  type SiteId, type StaffId, type DemoPersonSupported, type FieldProvenance, type ServiceUserRepresentative,
} from "@/lib/demoDataRegistry";
import {
  ADMISSION_TYPE_LABELS, ADMITTED_FROM_LABELS, SEX_LABELS, MARITAL_LABELS, REPRESENTATIVE_TYPE_LABELS,
  missingDirectoryFields, admissionCarePlanDeadline, ageFrom, type DirectoryStep,
} from "@/lib/residentDirectory";
import { extractAdmissionDetails } from "@/lib/admissionAssistant";
import { NoAccessPanel } from "@/components/RoleContextBanner";

type Rep = { id: string; type: NonNullable<ServiceUserRepresentative["type"]>; name: string; relationship: string; address: string; phone: string };
type Form = {
  legalFirstName: string; legalLastName: string; preferredName: string; dateOfBirth: string; sex: string; maritalStatus: string;
  preferredLanguage: string; interpreterNeeded: boolean; previousAddress: string; photo: string; photoConsent: boolean;
  reps: Rep[]; "gp.name": string; "gp.practice": string; "gp.phone": string;
  siteId: string; roomOrUnit: string; admissionDate: string; admissionType: string; admittedFrom: string; admittedFromName: string;
  admissionArrangedBy: string; keyWorkerStaffId: string;
};
const blankRep = (): Rep => ({ id: `REP-${Date.now()}-${Math.round(Math.random() * 1e4)}`, type: "next_of_kin", name: "", relationship: "", address: "", phone: "" });
const blank = (): Form => ({
  legalFirstName: "", legalLastName: "", preferredName: "", dateOfBirth: "", sex: "", maritalStatus: "", preferredLanguage: "English",
  interpreterNeeded: false, previousAddress: "", photo: "", photoConsent: false, reps: [blankRep()],
  "gp.name": "", "gp.practice": "", "gp.phone": "", siteId: "", roomOrUnit: "", admissionDate: new Date().toISOString().slice(0, 10),
  admissionType: "", admittedFrom: "", admittedFromName: "", admissionArrangedBy: "", keyWorkerStaffId: "",
});
function fromUser(u: DemoPersonSupported): Form {
  const [first, ...rest] = u.name.split(" ");
  return {
    legalFirstName: u.legalFirstName ?? first, legalLastName: u.legalLastName ?? rest.join(" "), preferredName: u.preferredName ?? "",
    dateOfBirth: u.dateOfBirth, sex: u.sex ?? "", maritalStatus: u.maritalStatus ?? "", preferredLanguage: u.preferredLanguage ?? "",
    interpreterNeeded: !!u.interpreterNeeded, previousAddress: u.previousAddress ?? "", photo: u.photo ?? "", photoConsent: !!u.photoConsent,
    reps: u.representatives.length ? u.representatives.map((r) => ({ id: r.id, type: r.type ?? "next_of_kin", name: r.name, relationship: r.relationship, address: r.address ?? "", phone: r.phone })) : [blankRep()],
    "gp.name": u.gp?.name ?? "", "gp.practice": u.gp?.practice ?? "", "gp.phone": u.gp?.phone ?? "",
    siteId: u.siteId, roomOrUnit: u.roomOrUnit ?? "", admissionDate: u.admissionDate, admissionType: u.admissionType ?? "",
    admittedFrom: u.admittedFrom ?? "", admittedFromName: u.admittedFromName ?? "", admissionArrangedBy: u.admissionArrangedBy ?? "",
    keyWorkerStaffId: u.keyWorkerStaffId,
  };
}

const STEPS: { key: DirectoryStep | "review"; label: string }[] = [
  { key: "about", label: "About the person" }, { key: "contacts", label: "Contacts and support" },
  { key: "admission", label: "Admission" }, { key: "review", label: "Review" },
];

export default function AdmitResident() {
  const terms = useTerms();
  const role = useRole();
  const navigate = useNavigate();
  const sites = useSites();
  const homeSupportOrg = useIsHomeSupportOrg();
  const [params] = useSearchParams();
  const editId = params.get("edit");
  const draftId = params.get("draft");
  const editing = editId ? serviceUsersStore.getById(editId) : undefined;
  const draft = admissionDraftsStore.get(draftId);

  const [f, setF] = useState<Form>(() => (editing ? fromUser(editing) : (draft?.data.form as Form) ?? blank()));
  const [prov, setProv] = useState<Record<string, FieldProvenance>>(() => editing?.fieldProvenance ?? (draft?.data.prov as Record<string, FieldProvenance>) ?? {});
  const [step, setStep] = useState(() => { const s = params.get("step"); const i = STEPS.findIndex((x) => x.key === s); return i >= 0 ? i : 0; });
  const [extracting, setExtracting] = useState(false);
  const docRef = useRef<HTMLInputElement>(null);

  const canManage = role.role === "admin" || isManagerRole(role.role);
  const scope = useMemo(() => new Set<string>(scopedSiteIds(role)), [role]);
  const scopeSites = sites.filter((s) => scope.has(s.id) && s.status === "active");
  const keyWorkers = STAFF.filter((s) => !s.external && !s.readOnly && s.scopeSiteIds.includes(f.siteId as SiteId));
  if (!canManage || (editing && !scope.has(editing.siteId))) return <div className="p-6"><NoAccessPanel moduleLabel={`Admit a ${terms.singular}`} /></div>;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    // A person typing over a value makes it their own (Source).
    if (prov[k as string]) setProv((p) => { const n = { ...p }; delete n[k as string]; return n; });
  };
  const name = `${f.legalFirstName} ${f.legalLastName}`.trim();
  const unconfirmed = Object.entries(prov).filter(([, p]) => p.state === "ai_draft").map(([k]) => k);

  const record: Partial<DemoPersonSupported> = {
    name, legalFirstName: f.legalFirstName, legalLastName: f.legalLastName, dateOfBirth: f.dateOfBirth,
    sex: (f.sex || undefined) as DemoPersonSupported["sex"], maritalStatus: (f.maritalStatus || undefined) as DemoPersonSupported["maritalStatus"],
    previousAddress: f.previousAddress || undefined, preferredLanguage: f.preferredLanguage || undefined, interpreterNeeded: f.interpreterNeeded,
    photo: f.photoConsent ? f.photo || undefined : undefined, photoConsent: f.photoConsent,
    representatives: f.reps.filter((r) => r.name.trim()).map((r, i) => ({ id: r.id, type: r.type, name: r.name.trim(), relationship: r.relationship, address: r.address, phone: r.phone, isPrimary: i === 0 })),
    gp: f["gp.name"] || f["gp.practice"] || f["gp.phone"] ? { name: f["gp.name"], practice: f["gp.practice"], phone: f["gp.phone"] } : undefined,
    admissionDate: f.admissionDate, admissionType: (f.admissionType || undefined) as DemoPersonSupported["admissionType"],
    admittedFrom: (f.admittedFrom || undefined) as DemoPersonSupported["admittedFrom"], admittedFromName: f.admittedFromName || undefined,
    admissionArrangedBy: f.admissionArrangedBy || undefined, roomOrUnit: f.roomOrUnit || undefined,
  };
  const missing = missingDirectoryFields(record);
  const essentialsMissing = [
    !name && "Name", !f.dateOfBirth && "Date of birth", !f.siteId && "Site", !f.admissionDate && "Admission date", !f.keyWorkerStaffId && "Key worker",
  ].filter(Boolean) as string[];

  const confirm = (k: string) => setProv((p) => ({ ...p, [k]: { ...p[k], state: "human_confirmed", confirmedByStaffId: role.staffId as StaffId, confirmedAt: new Date().toISOString() } }));

  const onDocument = async (file?: File) => {
    if (!file) return;
    setExtracting(true);
    const out = await extractAdmissionDetails(file);
    setExtracting(false);
    setF((p) => { const n = { ...p } as Record<string, unknown>; out.forEach((o) => { n[o.field] = o.value; }); return n as Form; });
    setProv((p) => { const n = { ...p }; out.forEach((o) => { n[o.field] = { state: "ai_draft", sourceText: o.sourceText }; }); return n; });
    toast.success(`${out.length} details pre-filled as AI drafts`, { description: "Confirm each one before admitting." });
  };

  const saveDraft = () => {
    const d = admissionDraftsStore.save({ id: draft?.id, data: { form: f, prov }, label: name || `Unnamed ${terms.singular}`, siteId: (f.siteId || undefined) as SiteId | undefined, savedByStaffId: role.staffId as StaffId });
    toast.success("Admission saved as a draft");
    navigate(`/app/org/service-users?admissionDraft=${d.id}`);
  };

  const finish = () => {
    if (essentialsMissing.length || unconfirmed.length) return;
    const patch = { ...record, preferredName: f.preferredName || undefined, keyWorkerStaffId: f.keyWorkerStaffId as StaffId, keyWorkerId: f.keyWorkerStaffId as StaffId, fieldProvenance: prov };
    if (editing) {
      serviceUsersStore.update(editing.id, patch, role.staffId as StaffId);
      toast.success("Details saved");
      navigate(`/app/org/service-users/${editing.id}`);
      return;
    }
    const site = sites.find((s) => s.id === f.siteId)!;
    const u = serviceUsersStore.add({
      ...(patch as DemoPersonSupported), siteId: site.id, unitId: null, risk: "Low", primaryFocus: "",
      serviceUserCode: nextServiceUserCode(site.id, site.name), status: "active", decisionSupportSummary: "",
      representatives: record.representatives ?? [],
    }, role.staffId as StaffId);
    const deadline = admissionCarePlanDeadline(site.centreType, f.admissionDate);
    carePlansStore.createAdmissionDraft({
      personId: u.id, name: u.name, siteName: site.name, dob: u.dateOfBirth, centreType: site.centreType,
      keyWorkerStaffId: u.keyWorkerStaffId, keyWorkerName: getStaffName(u.keyWorkerStaffId), createdBy: role.displayName, deadline,
    });
    if (draft) admissionDraftsStore.remove(draft.id);
    toast.success(`${u.name} admitted (${u.serviceUserCode})`, { description: deadline ? deadline.label : "Draft care plan created" });
    navigate(`/app/org/service-users/${u.id}`);
  };

  const tag = (k: string) => {
    const p = prov[k];
    if (!p) return null;
    return p.state === "ai_draft" ? (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="border-warning text-warning">AI draft</Badge>
        <span className="text-muted-foreground">From: “{p.sourceText}”</span>
        <Button type="button" size="sm" variant="outline" className="h-6 px-2" onClick={() => confirm(k)}><Check className="h-3 w-3 mr-1" />Confirm</Button>
      </div>
    ) : p.state === "human_confirmed" ? (
      <div className="mt-1 text-xs"><Badge variant="secondary">Human confirmed</Badge> <span className="text-muted-foreground">{getStaffName(p.confirmedByStaffId as StaffId)}</span></div>
    ) : null;
  };
  const text = (k: keyof Form, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div><Label htmlFor={`f-${k}`}>{label}</Label><Input id={`f-${k}`} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} {...props} />{tag(k)}</div>
  );
  const select = (k: keyof Form, label: string, options: Record<string, string>, placeholder = "Choose") => (
    <div><Label>{label}</Label>
      <Select value={(f[k] as string) || undefined} onValueChange={(v) => set(k, v as never)}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{Object.entries(options).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>{tag(k)}
    </div>
  );
  const age = ageFrom(f.dateOfBirth);
  const cur = STEPS[step].key;

  const summary: { step: number; title: string; rows: [string, string][] }[] = [
    { step: 0, title: "About the person", rows: [["Name", name], ["Preferred name", f.preferredName], ["Date of birth", f.dateOfBirth ? `${f.dateOfBirth}${age !== undefined ? ` (age ${age})` : ""}` : ""], ["Sex", SEX_LABELS[f.sex as keyof typeof SEX_LABELS] ?? ""], ["Marital status", MARITAL_LABELS[f.maritalStatus as keyof typeof MARITAL_LABELS] ?? ""], ["Language", `${f.preferredLanguage}${f.interpreterNeeded ? " · interpreter needed" : ""}`], ["Previous address", f.previousAddress], ["Photo", f.photo && f.photoConsent ? "Added with consent" : ""]] },
    { step: 1, title: "Contacts and support", rows: [...f.reps.filter((r) => r.name).map((r) => [REPRESENTATIVE_TYPE_LABELS[r.type], `${r.name}${r.relationship ? ` (${r.relationship})` : ""} · ${r.phone || "no phone"}`] as [string, string]), ["GP", [f["gp.name"], f["gp.practice"], f["gp.phone"]].filter(Boolean).join(" · ")]] },
    { step: 2, title: "Admission", rows: [["Site", sites.find((s) => s.id === f.siteId)?.name ?? ""], ["Room or unit", f.roomOrUnit], ["Admission date", f.admissionDate], ["Type", ADMISSION_TYPE_LABELS[f.admissionType as keyof typeof ADMISSION_TYPE_LABELS] ?? ""], ["Admitted from", f.admittedFrom ? `${ADMITTED_FROM_LABELS[f.admittedFrom as keyof typeof ADMITTED_FROM_LABELS]}${f.admittedFromName ? ` · ${f.admittedFromName}` : ""}` : ""], ["Arranged by", f.admissionArrangedBy], ["Key worker", f.keyWorkerStaffId ? getStaffName(f.keyWorkerStaffId as StaffId) : ""]] },
  ];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <Link to={editing ? `/app/org/service-users/${editing.id}` : "/app/org/service-users"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <div>
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{editing ? `Complete details for ${editing.name}` : `Admit a ${terms.singular}`}</h1>
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground"><span>Step {step + 1} of {STEPS.length}: {STEPS[step].label}</span></div>
          <Progress value={((step + 1) / STEPS.length) * 100} />
        </div>
      </div>

      {step === 0 && !editing && (
        <Card><CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] text-sm"><div className="font-medium">Start from a document (optional)</div><div className="text-muted-foreground text-xs">Upload a pre-admission assessment or discharge letter. Pre-filled details are AI drafts you confirm one by one.</div></div>
          <input ref={docRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,image/*" onChange={(e) => onDocument(e.target.files?.[0])} />
          <Button variant="outline" disabled={extracting} onClick={() => docRef.current?.click()}>{extracting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileUp className="h-4 w-4 mr-1" />}Upload document</Button>
        </CardContent></Card>
      )}

      <Card>
        <CardContent className="p-4 grid gap-4">
          {cur === "about" && <>
            <div className="grid gap-3 sm:grid-cols-2">{text("legalFirstName", "Legal first name *")}{text("legalLastName", "Legal last name *")}</div>
            {text("preferredName", "Preferred name")}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>{text("dateOfBirth", "Date of birth *", { type: "date" })}{age !== undefined && <div className="text-xs text-muted-foreground mt-1">Age {age}</div>}</div>
              {select("sex", "Sex", SEX_LABELS)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{select("maritalStatus", "Marital status", MARITAL_LABELS)}{text("preferredLanguage", "Preferred language")}</div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.interpreterNeeded} onCheckedChange={(v) => set("interpreterNeeded", !!v)} />Interpreter needed</label>
            {text("previousAddress", "Address before admission")}
            <div className="space-y-2">
              <Label>Photo</Label>
              <div className="flex items-center gap-3">
                {f.photo && <img src={f.photo} alt="" className="h-14 w-14 rounded-full object-cover" />}
                <Input type="file" accept="image/*" className="max-w-xs" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = () => set("photo", String(r.result)); r.readAsDataURL(file); }} />
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.photoConsent} onCheckedChange={(v) => set("photoConsent", !!v)} />Consent to keep a photo has been given</label>
              {f.photo && !f.photoConsent && <p className="text-xs text-muted-foreground">The photo won't be saved without consent.</p>}
            </div>
          </>}

          {cur === "contacts" && <>
            {f.reps.map((r, i) => {
              const upd = (patch: Partial<Rep>) => setF((p) => ({ ...p, reps: p.reps.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) }));
              return (
                <div key={r.id} className="rounded-md border p-3 grid gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <Select value={r.type} onValueChange={(v) => upd({ type: v as Rep["type"] })}>
                      <SelectTrigger className="w-full sm:w-[240px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(REPRESENTATIVE_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                    {i > 0 && <Button size="icon" variant="ghost" aria-label="Remove person" onClick={() => setF((p) => ({ ...p, reps: p.reps.filter((x) => x.id !== r.id) }))}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label>Name</Label><Input value={r.name} onChange={(e) => upd({ name: e.target.value })} /></div>
                    <div><Label>Relationship</Label><Input value={r.relationship} onChange={(e) => upd({ relationship: e.target.value })} /></div>
                    <div><Label>Address</Label><Input value={r.address} onChange={(e) => upd({ address: e.target.value })} /></div>
                    <div><Label>Phone</Label><Input value={r.phone} onChange={(e) => upd({ phone: e.target.value })} /></div>
                  </div>
                </div>
              );
            })}
            <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setF((p) => ({ ...p, reps: [...p.reps, { ...blankRep(), type: "decision_supporter" }] }))}><Plus className="h-4 w-4 mr-1" />Add another person</Button>
            <div className="font-medium text-sm pt-2">GP</div>
            <div className="grid gap-3 sm:grid-cols-3">{text("gp.name", "Name")}{text("gp.practice", "Practice and address")}{text("gp.phone", "Phone")}</div>
          </>}

          {cur === "admission" && <>
            <div><Label>Site *</Label>
              <Select value={f.siteId || undefined} onValueChange={(v) => setF((p) => ({ ...p, siteId: v, keyWorkerStaffId: "" }))} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Choose site" /></SelectTrigger>
                <SelectContent>{scopeSites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">{sites.find((s) => s.id === f.siteId)?.centreType !== "home_support" && text("roomOrUnit", "Room or unit")}{text("admissionDate", "Admission date *", { type: "date", disabled: !!editing })}</div>
            <div className="grid gap-3 sm:grid-cols-2">{select("admissionType", "Admission type", ADMISSION_TYPE_LABELS)}{select("admittedFrom", "Admitted from", ADMITTED_FROM_LABELS)}</div>
            {f.admittedFrom && f.admittedFrom !== "home" && text("admittedFromName", "Name of hospital, centre or place")}
            {text("admissionArrangedBy", "Arranged by (name and address of authority or organisation)", { placeholder: "e.g. HSE Community Healthcare, Carlow" })}
            <div><Label>Key worker *</Label>
              <Select value={f.keyWorkerStaffId || undefined} onValueChange={(v) => set("keyWorkerStaffId", v)} disabled={!f.siteId}>
                <SelectTrigger><SelectValue placeholder={f.siteId ? "Choose key worker" : "Choose a site first"} /></SelectTrigger>
                <SelectContent>{keyWorkers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.roleLabel}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </>}

          {cur === "review" && <>
            {summary.map((sec) => (
              <div key={sec.title} className="space-y-2">
                <div className="flex items-center justify-between"><div className="font-medium">{sec.title}</div><Button size="sm" variant="ghost" onClick={() => setStep(sec.step)}>Edit</Button></div>
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[180px_1fr] text-sm">
                  {sec.rows.map(([k, v], i) => <div key={i} className="contents"><dt className="text-muted-foreground">{k}</dt><dd>{v || "—"}</dd></div>)}
                </dl>
              </div>
            ))}
            {missing.length > 0 && !homeSupportOrg && (
              <Card className="border-warning/50 bg-warning/5"><CardHeader className="pb-1"><CardTitle className="text-sm">Still needed for the Directory of Residents ({missing.length})</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">{missing.map((m) => m.label).join(" · ")}<div className="text-xs mt-1">You can admit now and complete these later.</div></CardContent></Card>
            )}
            {essentialsMissing.length > 0 && <p className="text-sm text-destructive">Needed to admit: {essentialsMissing.join(", ")}.</p>}
            {unconfirmed.length > 0 && <p className="text-sm text-destructive">{unconfirmed.length} AI draft detail{unconfirmed.length === 1 ? "" : "s"} still to confirm.</p>}
          </>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
          {!editing && <Button variant="ghost" onClick={saveDraft}>Save as draft</Button>}
        </div>
        {step < STEPS.length - 1
          ? <Button onClick={() => setStep(step + 1)}>Continue</Button>
          : <Button onClick={finish} disabled={essentialsMissing.length > 0 || unconfirmed.length > 0}>{editing ? "Save details" : "Admit"}</Button>}
      </div>
    </div>
  );
}
