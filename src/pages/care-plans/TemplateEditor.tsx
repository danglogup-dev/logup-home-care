import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, GripVertical, ChevronDown, ChevronUp, Plus, Trash2, Lock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useRole } from "@/hooks/useRole";
import {
  carePlansStore, useCarePlans, publishedVersion, draftVersion, canEditCarePlanTemplates, defaultSection,
  CATEGORY_LABELS, SECTION_CATEGORIES, FIELD_TYPE_LABELS, RECOMMENDED_CORE_WARNING, SYSTEM_FIELDS, CENTRE_TYPE_TEMPLATE_LABEL,
  STANDARD_SECTION_KEYS, formatDate,
  type TemplateSection, type TemplateField, type TemplateFieldType, type SectionCategory, type TemplateVersion,
} from "@/lib/carePlansStore";

const MIN_REASON = 10;

export default function TemplateEditor() {
  const { id = "" } = useParams();
  const { templates } = useCarePlans();
  const role = useRole();
  const canEdit = canEditCarePlanTemplates(role.role);
  const tpl = templates.find((t) => t.id === id);
  const [open, setOpen] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TemplateSection | null>(null);
  const [reason, setReason] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState<SectionCategory>("other");

  if (!tpl) {
    return (
      <div className="p-6">
        <Button variant="ghost" asChild><Link to="/app/care-plans/templates"><ArrowLeft className="h-4 w-4 mr-1" /> Templates</Link></Button>
        <p className="text-muted-foreground mt-4">Template not found.</p>
      </div>
    );
  }
  const pub = publishedVersion(tpl);
  const draft = draftVersion(tpl);
  const working = (draft ?? pub)!;
  const actor = role.displayName;

  const edit = (change: (d: TemplateVersion) => TemplateVersion) => {
    if (!canEdit) return;
    carePlansStore.editTemplateDraft(tpl.id, actor, change);
  };
  const editSection = (sid: string, patch: Partial<TemplateSection>) =>
    edit((d) => ({ ...d, sections: d.sections.map((s) => s.id === sid ? { ...s, ...patch } : s) }));
  const editField = (sid: string, fid: string, patch: Partial<TemplateField>) =>
    edit((d) => ({ ...d, sections: d.sections.map((s) => s.id !== sid ? s : { ...s, fields: s.fields.map((f) => f.id === fid ? { ...f, ...patch } : f) }) }));
  const move = (from: string, to: string) => {
    if (from === to) return;
    edit((d) => {
      const list = [...d.sections];
      const a = list.findIndex((s) => s.id === from);
      const b = list.findIndex((s) => s.id === to);
      const [item] = list.splice(a, 1);
      list.splice(b, 0, item);
      return { ...d, sections: list };
    });
  };
  const step = (sid: string, dir: -1 | 1) => {
    const i = working.sections.findIndex((s) => s.id === sid);
    const j = i + dir;
    if (j < 0 || j >= working.sections.length) return;
    move(sid, working.sections[j].id);
  };

  const confirmRemove = () => {
    if (!removing) return;
    const err = carePlansStore.removeTemplateSection(tpl.id, removing.id, actor, reason);
    if (err) { toast({ title: "Section not removed", description: err }); return; }
    toast({ title: `${removing.displayName} removed from the draft`, description: "Published template and existing care plans are unchanged." });
    setRemoving(null); setReason("");
  };

  const addSection = () => {
    const name = newName.trim();
    if (!name) return;
    const std = (STANDARD_SECTION_KEYS as Record<string, string>)[newCat];
    const taken = working.sections.some((s) => s.sectionKey === std);
    const uid = Date.now().toString(36).toUpperCase();
    const key = std && !taken ? std : `custom_${uid}`;
    const sec = defaultSection(newCat, tpl.serviceType, { id: `SEC-${uid}`, sectionKey: key, displayName: name, guidance: "" });
    edit((d) => ({ ...d, sections: [...d.sections, sec] }));
    setAddOpen(false); setNewName(""); setNewCat("other");
    toast({ title: `${name} added to the draft` });
  };

  const removeNeedsReason = !!removing?.recommendedCore;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <Button variant="ghost" asChild className="-ml-2"><Link to="/app/care-plans/templates"><ArrowLeft className="h-4 w-4 mr-1" /> Templates</Link></Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tpl.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">Service type: {CENTRE_TYPE_TEMPLATE_LABEL[tpl.serviceType]}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {pub && <Badge variant="outline">v{pub.versionNumber} published {formatDate(pub.publishedAt)}</Badge>}
            {draft && <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Editing draft v{draft.versionNumber}</Badge>}
          </div>
        </div>
        {canEdit && draft && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { carePlansStore.discardTemplateDraft(tpl.id); toast({ title: "Draft discarded" }); }}>Discard draft</Button>
            <Button onClick={() => { carePlansStore.publishTemplate(tpl.id, actor); toast({ title: `Template v${draft.versionNumber} published`, description: "Existing care plans are not changed. They show “New template available”." }); }}>Publish v{draft.versionNumber}</Button>
          </div>
        )}
      </div>

      {!canEdit && <p className="text-sm text-muted-foreground">Read-only. Admins, or managers given template editing, can change templates.</p>}
      {canEdit && !draft && <p className="text-sm text-muted-foreground">Any change creates a draft version. The published template stays in use until you publish.</p>}

      <Card>
        <CardHeader><CardTitle className="text-base">Plan settings</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-6">
          <div className="space-y-1">
            <Label htmlFor="freq">Review every (months)</Label>
            <Input id="freq" type="number" min={1} max={24} className="w-28" disabled={!canEdit} value={working.reviewFrequencyMonths}
              onChange={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= 24) edit((d) => ({ ...d, reviewFrequencyMonths: n })); }} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={working.approvalRequired} disabled={!canEdit} onCheckedChange={(v) => edit((d) => ({ ...d, approvalRequired: v }))} />
            Approval required before a plan is published
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Sections <span className="text-muted-foreground font-normal text-sm">— order here is the default order for care plans</span></CardTitle>
          {canEdit && <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add section</Button>}
        </CardHeader>
        <CardContent className="space-y-2">
          {working.sections.map((sec, idx) => {
            const isOpen = open === sec.id;
            return (
              <div
                key={sec.id}
                draggable={canEdit}
                onDragStart={() => setDragId(sec.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) move(dragId, sec.id); setDragId(null); }}
                className={`rounded-lg border bg-card ${dragId === sec.id ? "opacity-50" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2 p-2">
                  {canEdit && <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" aria-label="Drag to reorder" />}
                  <span className="text-xs text-muted-foreground w-5">{idx + 1}</span>
                  <Input
                    aria-label="Section name" value={sec.displayName} disabled={!canEdit}
                    onChange={(e) => editSection(sec.id, { displayName: e.target.value })}
                    className="h-8 flex-1 min-w-[160px]"
                  />
                  <Badge variant="outline" className="text-[10px]" title="Standard type — used by event rules and reporting">{CATEGORY_LABELS[sec.category]}</Badge>
                  {sec.systemRequired && <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="h-3 w-3" />Required by LogUp</Badge>}
                  {sec.recommendedCore && <Badge variant="secondary" className="text-[10px]">LogUp recommended core</Badge>}
                  {canEdit && (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move up" onClick={() => step(sec.id, -1)} disabled={idx === 0}><ChevronUp className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move down" onClick={() => step(sec.id, 1)} disabled={idx === working.sections.length - 1}><ChevronDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remove ${sec.displayName}`} disabled={sec.systemRequired}
                        title={sec.systemRequired ? "LogUp depends on this section, so it cannot be removed." : undefined}
                        onClick={() => { setRemoving(sec); setReason(""); }}><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(isOpen ? null : sec.id)}>{isOpen ? "Close" : "Guidance & fields"}</Button>
                </div>
                {isOpen && (
                  <div className="border-t p-3 space-y-3">
                    <div className="space-y-1">
                      <Label>Guidance for staff</Label>
                      <Textarea rows={2} value={sec.guidance} disabled={!canEdit} onChange={(e) => editSection(sec.id, { guidance: e.target.value })} />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={sec.required} disabled={!canEdit || sec.systemRequired} onCheckedChange={(v) => editSection(sec.id, { required: !!v })} />
                      Must be completed in every plan
                    </label>
                    <div className="space-y-2">
                      <Label>Fields</Label>
                      {sec.fields.map((f) => (
                        <div key={f.id} className="flex flex-wrap items-center gap-2">
                          <Input className="h-8 flex-1 min-w-[140px]" value={f.label} disabled={!canEdit} onChange={(e) => editField(sec.id, f.id, { label: e.target.value })} aria-label="Field label" />
                          <Select value={f.type} disabled={!canEdit} onValueChange={(v) => editField(sec.id, f.id, { type: v as TemplateFieldType })}>
                            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>{(Object.keys(FIELD_TYPE_LABELS) as TemplateFieldType[]).map((t) => <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                          </Select>
                          {f.type === "select" && (
                            <Input className="h-8 w-48" placeholder="Choices, comma separated" disabled={!canEdit} value={(f.options ?? []).join(", ")}
                              onChange={(e) => editField(sec.id, f.id, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
                          )}
                          <label className="flex items-center gap-1 text-xs"><Checkbox checked={f.required} disabled={!canEdit} onCheckedChange={(v) => editField(sec.id, f.id, { required: !!v })} />Required</label>
                          {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remove field" onClick={() => edit((d) => ({ ...d, sections: d.sections.map((s) => s.id !== sec.id ? s : { ...s, fields: s.fields.filter((x) => x.id !== f.id) }) }))}><Trash2 className="h-3.5 w-3.5" /></Button>}
                        </div>
                      ))}
                      {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => edit((d) => ({ ...d, sections: d.sections.map((s) => s.id !== sec.id ? s : { ...s, fields: [...s.fields, { id: `F-${Date.now().toString(36)}`, label: "New field", type: "text", required: false }] }) }))}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add field
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {working.removals.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Removed in v{working.versionNumber}</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {working.removals.map((r) => (
              <div key={r.sectionId + r.at}>
                <span className="font-medium">{r.displayName}</span> <span className="text-muted-foreground">({CATEGORY_LABELS[r.category]}) · {r.by} · {formatDate(r.at)}</span>
                {r.reason && <div className="text-xs text-muted-foreground">Reason: {r.reason}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">System fields</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">Every care plan records these automatically. They cannot be edited.</p>
          <div className="flex flex-wrap gap-1">{SYSTEM_FIELDS.map((f) => <Badge key={f} variant="outline" className="gap-1"><Lock className="h-3 w-3" />{f}</Badge>)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Version history</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {[...tpl.versions].reverse().map((v) => (
            <div key={v.versionNumber} className="flex flex-wrap gap-2">
              <span className="font-medium">v{v.versionNumber}</span>
              <span className="text-muted-foreground">{v.status === "published" ? "Published" : v.status === "draft" ? "Draft" : "Replaced"} · {v.sections.length} sections · {v.publishedBy ? `published by ${v.publishedBy} ${formatDate(v.publishedAt)}` : `started by ${v.createdBy} ${formatDate(v.createdAt)}`}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.displayName}?</DialogTitle>
            <DialogDescription>Removed from the draft template only. Existing care plans keep this section.</DialogDescription>
          </DialogHeader>
          {removeNeedsReason && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {RECOMMENDED_CORE_WARNING}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="rm-reason">Reason{removeNeedsReason ? "" : " (optional)"}</Label>
            <Textarea id="rm-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            {removeNeedsReason && (
              <p className={`text-xs ${reason.trim().length >= MIN_REASON ? "text-muted-foreground" : "text-destructive"}`}>At least {MIN_REASON} characters ({reason.trim().length}/{MIN_REASON}). Saved on this template version.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="destructive" disabled={removeNeedsReason && reason.trim().length < MIN_REASON} onClick={confirmRemove}>Remove section</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add section</DialogTitle>
            <DialogDescription>Choose a standard type so event review prompts and reporting can recognise it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="new-name">Section name</Label><Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Standard type</Label>
              <Select value={newCat} onValueChange={(v) => setNewCat(v as SectionCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SECTION_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={!newName.trim()} onClick={addSection}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
