import { isManagerRole } from "@/lib/roleStore";
// Notification Form preparation workflow (5 steps).
//
// LogUp prepares a DRAFT. A human reviews, edits, approves, exports.
// Never overwrites the source IncidentRecord.

import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download,
  FileCheck2, Shield, Sparkles,
} from "lucide-react";
import type { IncidentRecord } from "@/lib/incidentRecords";
import {
  notificationFormsStore, useNotificationDraftsForIncident,
  suggestedTemplatesFor, NOTIFICATION_TEMPLATES, getTemplate,
  type NotificationDraft, type NotificationTemplate,
} from "@/lib/notificationFormsStore";
import { useRole } from "@/hooks/useRole";

interface Props {
  incident: IncidentRecord;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** If provided, start on that draft (step 2). */
  initialDraftId?: string;
}

type Step = 1 | 2 | 3 | 4 | 5;

const DISCLAIMER =
  "LogUp prepares draft Notification Forms. A human must review and approve before export or submission.";

export function NotificationFormPrepDialog({
  incident, open, onOpenChange, initialDraftId,
}: Props) {
  const role = useRole();
  const drafts = useNotificationDraftsForIncident(incident.id);

  const [step, setStep] = useState<Step>(initialDraftId ? 2 : 1);
  const [draftId, setDraftId] = useState<string | undefined>(initialDraftId);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [reviewerConfirmed, setReviewerConfirmed] = useState(false);

  const draft: NotificationDraft | undefined = draftId
    ? drafts.find(d => d.draftId === draftId)
    : undefined;

  const canMutate = role.role === "admin" || isManagerRole(role.role);

  const suggested = useMemo(() => suggestedTemplatesFor(incident), [incident]);
  const suggestedIds = new Set(suggested.map(t => t.templateId));
  const others = NOTIFICATION_TEMPLATES.filter(t => !suggestedIds.has(t.templateId));

  const template: NotificationTemplate | undefined = draft
    ? getTemplate(draft.templateId)
    : selectedTemplateId ? getTemplate(selectedTemplateId) : undefined;

  const missingRequired = draft?.fields.some(
    f => f.required && !f.value.trim() && !f.unavailableNote
  ) ?? false;

  function handleGenerate() {
    if (!selectedTemplateId) return;
    const d = notificationFormsStore.createDraft(
      incident, selectedTemplateId, role.displayName,
    );
    setDraftId(d.draftId);
    setStep(2);
  }

  function handleApprove() {
    if (!draft) return;
    notificationFormsStore.approveForExport(draft.draftId, role.displayName);
    setStep(5);
  }

  function TemplateCard({ t, suggested: sug }: { t: NotificationTemplate; suggested?: boolean }) {
    const selected = selectedTemplateId === t.templateId;
    return (
      <button
        type="button"
        onClick={() => setSelectedTemplateId(t.templateId)}
        className={`text-left w-full rounded-lg border p-3 transition-colors ${
          selected ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-secondary/40"
        }`}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">{t.templateCode}</span>
            <span className="text-sm font-medium">{t.templateName.replace(`${t.templateCode} — `, "")}</span>
          </div>
          {sug && (
            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
              <Sparkles className="h-3 w-3 mr-1" /> Suggested
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t.description}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          <Badge variant="outline" className="text-[10px]">{t.serviceProfile}</Badge>
          <Badge variant="outline" className="text-[10px]">{t.timeframe}</Badge>
          <Badge variant="outline" className="text-[10px] bg-warning/5 text-warning border-warning/20">
            {t.pdfTemplateStatus === "Ready" ? "PDF ready" : "PDF template mapping pending"}
          </Badge>
        </div>
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-none w-[90vw] xl:max-w-[1000px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-base font-heading flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-primary" />
            Prepare Notification Form — {incident.id}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {incident.resident ? `${incident.resident} · ` : ""}{incident.site} · {incident.date}
          </DialogDescription>
          <div className="flex gap-1 mt-2 text-[11px]">
            {(["1. Template", "2. Mapped fields", "3. Edit draft", "4. Approve", "5. Export"] as const).map((label, idx) => {
              const n = (idx + 1) as Step;
              const active = step === n;
              const done = step > n;
              return (
                <div key={label} className={`flex-1 px-2 py-1 rounded border text-center ${
                  active ? "bg-primary/10 border-primary text-primary font-medium"
                  : done ? "bg-success/5 border-success/30 text-success"
                  : "bg-background border-border text-muted-foreground"
                }`}>
                  {label}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-secondary/20">
          <div className="rounded-lg bg-warning/5 border border-warning/20 p-2.5 text-[11px] text-warning flex items-start gap-2">
            <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{DISCLAIMER}</span>
          </div>

          {/* ---------- Step 1: Template ---------- */}
          {step === 1 && (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Suggested templates</h3>
                {suggested.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No template auto-suggested for this incident type. Choose one below.
                  </p>
                ) : (
                  <div className="grid md:grid-cols-2 gap-2">
                    {suggested.map(t => <TemplateCard key={t.templateId} t={t} suggested />)}
                  </div>
                )}
              </section>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">All available templates</h3>
                <div className="grid md:grid-cols-2 gap-2">
                  {others.map(t => <TemplateCard key={t.templateId} t={t} />)}
                </div>
              </section>
            </>
          )}

          {/* ---------- Step 2/3: Mapped fields & editing ---------- */}
          {(step === 2 || step === 3) && draft && template && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{template.templateName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Draft {draft.draftId} · {draft.status}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {template.pdfTemplateStatus === "Ready" ? "PDF ready" : "PDF template mapping pending"}
                </Badge>
              </div>
              {missingRequired && (
                <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-2.5 text-xs text-destructive flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                  Missing information required before export.
                </div>
              )}
              <div className="space-y-2">
                {draft.fields.map(f => {
                  const editable = step === 3 && canMutate;
                  const isMissing = f.status === "Missing required information";
                  return (
                    <div key={f.key} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Label className="text-xs font-medium">{f.label}</Label>
                          {f.required && <Badge variant="outline" className="text-[10px]">Required</Badge>}
                        </div>
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${
                          f.status === "Populated from incident" ? "bg-success/10 text-success border-success/20"
                          : f.status === "Manually edited" ? "bg-accent/10 text-accent border-accent/20"
                          : isMissing ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-warning/10 text-warning border-warning/20"
                        }`}>{f.status}</Badge>
                      </div>
                      {f.value.length > 60 || f.label.toLowerCase().includes("descrip") || f.label.toLowerCase().includes("action") ? (
                        <Textarea
                          value={f.value}
                          disabled={!editable}
                          rows={3}
                          onChange={(e) =>
                            notificationFormsStore.editField(draft.draftId, f.key, e.target.value, role.displayName)
                          }
                        />
                      ) : (
                        <Input
                          value={f.value}
                          disabled={!editable}
                          onChange={(e) =>
                            notificationFormsStore.editField(draft.draftId, f.key, e.target.value, role.displayName)
                          }
                        />
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Source: <span className="font-mono">{f.sourceRef}</span>
                        {f.editedBy && <> · Edited by {f.editedBy}</>}
                      </p>
                      {isMissing && step === 3 && canMutate && (
                        <div className="mt-2 flex items-center gap-2">
                          <Input
                            placeholder='Note that this information is unavailable…'
                            className="h-7 text-xs"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const v = (e.target as HTMLInputElement).value.trim();
                                if (v) notificationFormsStore.markFieldUnavailable(draft.draftId, f.key, v, role.displayName);
                              }
                            }}
                          />
                        </div>
                      )}
                      {f.unavailableNote && (
                        <p className="text-[10px] text-warning mt-1 italic">Unavailable: {f.unavailableNote}</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground italic">
                Editing this draft does not change the source incident record.
              </p>
            </>
          )}

          {/* ---------- Step 4: Approve ---------- */}
          {step === 4 && draft && (
            <div className="space-y-3">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                Human approval required before export.
              </div>
              <div className="rounded-lg border border-border bg-background p-3 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Reviewer</span><span>{role.displayName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Role</span><span>{role.title}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Missing required</span>
                  <span className={missingRequired ? "text-destructive" : "text-success"}>
                    {missingRequired ? "Yes — resolve before approving" : "None"}
                  </span>
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={reviewerConfirmed} onCheckedChange={(v) => setReviewerConfirmed(!!v)} />
                <span>I have reviewed this draft Notification Form.</span>
              </label>
            </div>
          )}

          {/* ---------- Step 5: Export ---------- */}
          {step === 5 && draft && (
            <div className="space-y-3">
              <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-xs flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <div>
                  <p className="font-medium text-success">Draft approved for export.</p>
                  {draft.approval && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      By {draft.approval.reviewer} at {new Date(draft.approval.reviewedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-2">
                <p className="text-muted-foreground">
                  {template?.pdfTemplateStatus === "Ready"
                    ? "PDF export is available."
                    : "PDF export will be available once the uploaded template is mapped."}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={template?.pdfTemplateStatus !== "Ready"}
                    onClick={() => notificationFormsStore.recordExported(draft.draftId, role.displayName)}
                  >
                    <Download className="h-3 w-3 mr-1" /> Export PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      const ref = window.prompt("External submission reference (optional):", "") ?? "";
                      notificationFormsStore.recordSubmittedOutside(draft.draftId, role.displayName, ref);
                    }}
                  >
                    Record submitted outside LogUp
                  </Button>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-xs font-semibold mb-1.5">Audit trail</p>
                <div className="space-y-1.5">
                  {draft.audit.map((a, i) => (
                    <div key={i} className="text-[11px] flex gap-2">
                      <span className="font-mono text-muted-foreground">{new Date(a.at).toLocaleString()}</span>
                      <span>· {a.event}</span>
                      {a.detail && <span className="text-muted-foreground">— {a.detail}</span>}
                      <span className="text-muted-foreground">· {a.actor}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-2 bg-card">
          <Button
            variant="ghost" size="sm" className="h-8 text-xs"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, (s - 1)) as Step)}
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {step === 1 && (
              <Button size="sm" className="h-8 text-xs" disabled={!selectedTemplateId || !canMutate} onClick={handleGenerate}>
                Generate draft <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {step === 2 && draft && (
              <Button size="sm" className="h-8 text-xs" onClick={() => setStep(3)}>
                Edit draft content <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {step === 3 && draft && (
              <Button size="sm" className="h-8 text-xs" onClick={() => setStep(4)} disabled={missingRequired}>
                Continue to approval <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {step === 4 && draft && (
              <Button
                size="sm" className="h-8 text-xs"
                disabled={!reviewerConfirmed || missingRequired || !canMutate}
                onClick={handleApprove}
              >
                Approve for export <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NotificationFormPrepDialog;
