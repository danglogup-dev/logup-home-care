import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Camera, CheckCircle2, XCircle, MinusCircle, X,
  AlertTriangle, ClipboardList, Mic, Send, ChevronLeft, FileText, User as UserIcon,
  Building2, Sparkles, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  audits as seedAudits, auditTemplatesSeed, sitePICs,
} from "@/lib/auditsData";
import { auditsStore, useAuditRun, progressOf, type ItemOutcome, type Severity } from "@/lib/auditsStore";
import { notificationsStore } from "@/lib/notifications";

const fade = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result as string);
  r.onerror = reject;
  r.readAsDataURL(file);
});

const AuditWalkthrough = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const seedRecord = useMemo(() => seedAudits.find((a) => a.id === id), [id]);
  const template = useMemo(
    () => seedRecord ? auditTemplatesSeed.find((t) => t.name === seedRecord.templateName) : undefined,
    [seedRecord]
  );

  // Bootstrap a run if it doesn't exist yet
  useEffect(() => {
    if (!seedRecord || !template) return;
    if (!auditsStore.get(seedRecord.id)) {
      auditsStore.startOrResume({
        id: seedRecord.id,
        templateName: seedRecord.templateName,
        site: seedRecord.site,
        category: seedRecord.category,
        conductedBy: seedRecord.assignedTo,
        pic: sitePICs[seedRecord.site] ?? "PIC",
        items: template.items,
      });
    }
  }, [seedRecord, template]);

  const run = useAuditRun(id);

  // Pick first incomplete item by default; allow back/forward
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    if (!run) return;
    const firstPending = run.items.findIndex((i) => i.outcome === "pending");
    setCursor(firstPending === -1 ? run.items.length : firstPending);
  }, [run?.id]); // only on first load of this run

  // Local UI state for the current item
  const [view, setView] = useState<"choose" | "fail" | "na" | "review" | "done">("choose");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [severity, setSeverity] = useState<Severity>("Medium");
  const [findingDesc, setFindingDesc] = useState("");
  const [actionDesc, setActionDesc] = useState("");
  const [actionOwner, setActionOwner] = useState("");
  const [actionDue, setActionDue] = useState("");
  const [naReason, setNaReason] = useState("");
  const [signOffName, setSignOffName] = useState("");

  const photoInputRef = useRef<HTMLInputElement>(null);

  // Reset per-item state when cursor changes
  useEffect(() => {
    if (!run) return;
    const it = run.items[cursor];
    if (!it) {
      setView("review");
      return;
    }
    setView("choose");
    setNote(it.note ?? "");
    setPhotos(it.photos ?? []);
    setSeverity(it.severity ?? "Medium");
    setFindingDesc(it.findingDescription ?? "");
    setActionDesc(it.actionDescription ?? "");
    setActionOwner(it.actionOwner ?? "");
    setActionDue(it.actionDue ?? "");
    setNaReason(it.naReason ?? "");
  }, [cursor, run?.id]);

  if (!seedRecord || !template) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">Audit not found.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/app/audits/reporting")}>
          Back to register
        </Button>
      </div>
    );
  }
  if (!run) return null;

  const total = run.items.length;
  const { done, pct } = progressOf(run);
  const current = run.items[cursor];
  const staffRoster = Array.from(new Set([
    ...seedAudits.map((a) => a.assignedTo),
    "Brendan Tierney", "Maintenance", "Marie Doherty", "Áine Ryan",
  ])).sort();

  const onPhotos = async (files: FileList | null) => {
    if (!files) return;
    const next: string[] = [];
    for (const f of Array.from(files)) {
      try { next.push(await fileToDataUrl(f)); } catch { /* ignore */ }
    }
    if (next.length) setPhotos((p) => [...p, ...next]);
  };

  const recordOutcome = (outcome: ItemOutcome) => {
    if (outcome === "fail") {
      // Pre-fill finding description with the checklist item text if blank
      if (!findingDesc.trim()) setFindingDesc(`${current.item} — issue identified`);
      setView("fail");
      return;
    }
    if (outcome === "na") {
      setView("na");
      return;
    }
    // Pass — save and advance
    auditsStore.updateItem(run.id, cursor, {
      outcome: "pass",
      note: note.trim() || undefined,
      photos,
    });
    advance();
  };

  const saveFail = () => {
    if (!findingDesc.trim()) {
      toast.error("Add a short description of the finding before continuing.");
      return;
    }
    auditsStore.updateItem(run.id, cursor, {
      outcome: "fail",
      note: note.trim() || undefined,
      photos,
      severity,
      findingDescription: findingDesc.trim(),
      actionDescription: actionDesc.trim() || undefined,
      actionOwner: actionOwner || undefined,
      actionDue: actionDue || undefined,
    });
    advance();
  };

  const saveNA = () => {
    if (!naReason.trim()) {
      toast.error("Add a short reason this item doesn't apply.");
      return;
    }
    auditsStore.updateItem(run.id, cursor, {
      outcome: "na",
      note: note.trim() || undefined,
      photos,
      naReason: naReason.trim(),
    });
    advance();
  };

  const advance = () => {
    if (cursor + 1 >= total) {
      setView("review");
      setCursor(total);
    } else {
      setCursor(cursor + 1);
    }
  };

  const goBack = () => {
    if (cursor === 0) {
      navigate("/app/audits/reporting");
      return;
    }
    setCursor(Math.max(0, cursor - 1));
  };

  const submit = () => {
    if (!signOffName.trim()) {
      toast.error("Please type your name to sign off.");
      return;
    }
    const updated = auditsStore.submitForSignoff(run.id, signOffName.trim());
    if (updated) {
      const failCount = updated.items.filter((i) => i.outcome === "fail").length;
      notificationsStore.add({
        kind: "audit",
        tone: failCount > 0 ? "warning" : "info",
        title: `Audit awaiting your sign-off: ${updated.templateName}`,
        body: `${updated.site} · submitted by ${updated.signedOffBy} · ${failCount} finding${failCount === 1 ? "" : "s"}`,
        href: `/app/audits/reporting?signoff=${updated.id}`,
        createdAt: new Date().toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
      });
      toast.success("Submitted for PIC sign-off", {
        description: `Sent to ${updated.pic} for review.`,
      });
      setView("done");
    }
  };

  // ============ HEADER ============
  const Header = (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 -ml-2" onClick={goBack}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">{run.site} · {run.templateName}</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-1.5 flex-1 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-foreground tabular-nums">
              {Math.min(cursor, total)}/{total}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  // ============ REVIEW SCREEN ============
  if (view === "review") {
    const passCount = run.items.filter((i) => i.outcome === "pass").length;
    const failCount = run.items.filter((i) => i.outcome === "fail").length;
    const naCount = run.items.filter((i) => i.outcome === "na").length;
    const pendingCount = run.items.filter((i) => i.outcome === "pending").length;

    return (
      <div className="min-h-screen bg-background">
        {Header}
        <motion.div {...fade} className="max-w-2xl mx-auto px-4 py-6 pb-24">
          <h1 className="font-heading text-2xl font-bold text-foreground">Review and sign off</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Check everything looks right. After you sign off, this is sent to {run.pic} for PIC review.
          </p>

          {/* Summary chips */}
          <div className="grid grid-cols-3 gap-2 mt-5">
            <SummaryChip count={passCount} label="Pass" tone="success" />
            <SummaryChip count={failCount} label="Fail" tone="destructive" />
            <SummaryChip count={naCount} label="N/A" tone="muted" />
          </div>
          {pendingCount > 0 && (
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <div className="text-xs text-foreground">
                {pendingCount} item{pendingCount === 1 ? " has" : "s have"} no answer yet.
                <button className="ml-2 underline text-primary" onClick={() => {
                  const i = run.items.findIndex((x) => x.outcome === "pending");
                  if (i >= 0) setCursor(i);
                }}>Jump to first</button>
              </div>
            </div>
          )}

          {/* Item list */}
          <div className="mt-6 space-y-2">
            {run.items.map((it, i) => (
              <button
                key={i}
                onClick={() => setCursor(i)}
                className="w-full text-left bg-card rounded-xl border border-border p-3 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <OutcomeBadge outcome={it.outcome} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{it.item}</p>
                    {it.outcome === "fail" && it.findingDescription && (
                      <p className="text-xs text-destructive mt-0.5">
                        Finding ({it.severity}): {it.findingDescription}
                      </p>
                    )}
                    {it.outcome === "na" && it.naReason && (
                      <p className="text-xs text-muted-foreground mt-0.5">N/A · {it.naReason}</p>
                    )}
                    {it.note && <p className="text-xs text-muted-foreground mt-0.5 italic">"{it.note}"</p>}
                    {it.photos.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {it.photos.slice(0, 4).map((p, k) => (
                          <img key={k} src={p} alt="" className="h-10 w-10 rounded object-cover border border-border" />
                        ))}
                        {it.photos.length > 4 && (
                          <div className="h-10 w-10 rounded border border-border bg-secondary text-xs grid place-items-center text-muted-foreground">+{it.photos.length - 4}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Sign-off */}
          <div className="mt-8 bg-card rounded-2xl border border-border shadow-soft p-5">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-heading font-semibold text-sm text-foreground">Your sign-off</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              By typing your name and submitting, you confirm the answers above are accurate. The audit will be sent to {run.pic} for PIC sign-off.
            </p>
            <Label htmlFor="signoff" className="text-xs">Type your full name</Label>
            <Input
              id="signoff"
              value={signOffName}
              onChange={(e) => setSignOffName(e.target.value)}
              placeholder={run.conductedBy}
              className="mt-1.5 h-10 rounded-xl"
            />
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setCursor(0)}>
                Back to start
              </Button>
              <Button
                className="flex-1 h-11 rounded-xl font-semibold"
                onClick={submit}
                disabled={pendingCount > 0}
              >
                <Send className="h-4 w-4 mr-1.5" /> Submit for sign-off
              </Button>
            </div>
            {pendingCount > 0 && (
              <p className="text-[11px] text-warning mt-2">Answer all items before submitting.</p>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // ============ DONE SCREEN ============
  if (view === "done") {
    return (
      <div className="min-h-screen bg-background">
        <motion.div {...fade} className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="h-16 w-16 mx-auto rounded-full bg-success/10 grid place-items-center">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-foreground mt-5">Submitted</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Sent to <span className="font-medium text-foreground">{run.pic}</span> for PIC sign-off.
            They've been notified.
          </p>
          <div className="mt-8 flex flex-col gap-2">
            <Button className="h-11 rounded-xl" onClick={() => navigate("/app/audits/overview")}>
              Back to Audits
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => navigate(`/app/audits/reporting?openId=${run.id}`)}>
              View this audit record
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ============ ITEM SCREEN ============
  return (
    <div className="min-h-screen bg-background">
      {Header}

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => { onPhotos(e.target.files); e.target.value = ""; }}
      />

      <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
        <AnimatePresence mode="wait">
          <motion.div key={`${cursor}-${view}`} {...fade}>
            {/* CHOOSE OUTCOME */}
            {view === "choose" && (
              <>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Item {cursor + 1} of {total}
                </p>
                <h2 className="font-heading text-2xl font-bold text-foreground mt-2 leading-snug">
                  {current.item}
                </h2>

                <div className="mt-7 space-y-3">
                  <OutcomeButton
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    title="Pass"
                    sub="Looks good, no issue"
                    tone="success"
                    onClick={() => recordOutcome("pass")}
                  />
                  <OutcomeButton
                    icon={<XCircle className="h-5 w-5" />}
                    title="Fail"
                    sub="There's an issue to raise"
                    tone="destructive"
                    onClick={() => recordOutcome("fail")}
                  />
                  <OutcomeButton
                    icon={<MinusCircle className="h-5 w-5" />}
                    title="Not applicable"
                    sub="Doesn't apply here today"
                    tone="muted"
                    onClick={() => recordOutcome("na")}
                  />
                </div>

                {/* Optional note + photo */}
                <div className="mt-6 bg-card rounded-2xl border border-border shadow-soft p-4">
                  <Label className="text-xs text-muted-foreground">Add a note (optional)</Label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Anything worth recording…"
                    className="mt-1.5 min-h-[64px] rounded-xl text-sm"
                  />
                  <PhotoStrip photos={photos} onAdd={() => photoInputRef.current?.click()} onRemove={(i) => setPhotos((p) => p.filter((_, k) => k !== i))} />
                </div>
              </>
            )}

            {/* FAIL DETAILS */}
            {view === "fail" && (
              <>
                <button onClick={() => setView("choose")} className="text-xs text-muted-foreground inline-flex items-center gap-1 mb-3 hover:text-foreground">
                  <ChevronLeft className="h-3 w-3" /> Change answer
                </button>
                <div className="flex items-center gap-2">
                  <Badge className="bg-destructive/10 text-destructive border-destructive/20 font-semibold">Fail</Badge>
                  <span className="text-xs text-muted-foreground truncate">{current.item}</span>
                </div>
                <h2 className="font-heading text-xl font-bold text-foreground mt-3">Tell us about the issue</h2>

                <div className="mt-5 bg-card rounded-2xl border border-border shadow-soft p-4 space-y-4">
                  <div>
                    <Label className="text-xs">What's wrong?</Label>
                    <Textarea
                      value={findingDesc}
                      onChange={(e) => setFindingDesc(e.target.value)}
                      placeholder="e.g. Fire door on Unit B is not closing fully"
                      className="mt-1.5 min-h-[72px] rounded-xl text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">How serious is it?</Label>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(["Low", "Medium", "High"] as Severity[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSeverity(s)}
                          className={`h-10 rounded-xl text-sm font-semibold border transition-colors ${
                            severity === s
                              ? s === "High" ? "bg-destructive text-destructive-foreground border-destructive"
                                : s === "Medium" ? "bg-warning text-warning-foreground border-warning"
                                : "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border text-muted-foreground hover:border-foreground/30"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <PhotoStrip photos={photos} onAdd={() => photoInputRef.current?.click()} onRemove={(i) => setPhotos((p) => p.filter((_, k) => k !== i))} />
                </div>

                {/* Action prompt */}
                <div className="mt-4 bg-card rounded-2xl border border-border shadow-soft p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h3 className="font-heading font-semibold text-sm text-foreground">Assign a follow-up action</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Optional — you can also leave this and let the PIC assign it later.
                  </p>
                  <Textarea
                    value={actionDesc}
                    onChange={(e) => setActionDesc(e.target.value)}
                    placeholder="What needs to be done?"
                    className="min-h-[60px] rounded-xl text-sm"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <Select value={actionOwner} onValueChange={setActionOwner}>
                      <SelectTrigger className="h-10 rounded-xl text-xs">
                        <SelectValue placeholder="Assign to…" />
                      </SelectTrigger>
                      <SelectContent>
                        {staffRoster.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={actionDue}
                      onChange={(e) => setActionDue(e.target.value)}
                      className="h-10 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t border-border">
                  <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2">
                    <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setView("choose")}>
                      Cancel
                    </Button>
                    <Button className="flex-1 h-11 rounded-xl font-semibold" onClick={saveFail}>
                      Save and continue <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* N/A REASON */}
            {view === "na" && (
              <>
                <button onClick={() => setView("choose")} className="text-xs text-muted-foreground inline-flex items-center gap-1 mb-3 hover:text-foreground">
                  <ChevronLeft className="h-3 w-3" /> Change answer
                </button>
                <div className="flex items-center gap-2">
                  <Badge className="bg-secondary text-muted-foreground border-border font-semibold">N/A</Badge>
                  <span className="text-xs text-muted-foreground truncate">{current.item}</span>
                </div>
                <h2 className="font-heading text-xl font-bold text-foreground mt-3">Why doesn't this apply?</h2>

                <div className="mt-5 bg-card rounded-2xl border border-border shadow-soft p-4">
                  <Textarea
                    value={naReason}
                    onChange={(e) => setNaReason(e.target.value)}
                    placeholder="e.g. No CCTV in this part of the building"
                    className="min-h-[80px] rounded-xl text-sm"
                  />
                </div>

                <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t border-border">
                  <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2">
                    <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setView("choose")}>
                      Cancel
                    </Button>
                    <Button className="flex-1 h-11 rounded-xl font-semibold" onClick={saveNA}>
                      Save and continue <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

// =================== Sub components ===================

const OutcomeButton = ({
  icon, title, sub, tone, onClick,
}: {
  icon: React.ReactNode; title: string; sub: string;
  tone: "success" | "destructive" | "muted"; onClick: () => void;
}) => {
  const cls =
    tone === "success" ? "border-success/30 hover:bg-success/5 text-success"
    : tone === "destructive" ? "border-destructive/30 hover:bg-destructive/5 text-destructive"
    : "border-border hover:bg-secondary text-muted-foreground";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border-2 bg-card p-4 flex items-center gap-3 transition-colors ${cls}`}
    >
      <span className="shrink-0">{icon}</span>
      <div className="flex-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
};

const OutcomeBadge = ({ outcome }: { outcome: ItemOutcome }) => {
  if (outcome === "pass") return <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />;
  if (outcome === "fail") return <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />;
  if (outcome === "na") return <MinusCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />;
  return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0 mt-0.5" />;
};

const SummaryChip = ({ count, label, tone }: { count: number; label: string; tone: "success" | "destructive" | "muted" }) => {
  const cls = tone === "success" ? "bg-success/10 text-success border-success/20"
    : tone === "destructive" ? "bg-destructive/10 text-destructive border-destructive/20"
    : "bg-secondary text-muted-foreground border-border";
  return (
    <div className={`rounded-xl border p-3 text-center ${cls}`}>
      <p className="text-2xl font-heading font-bold">{count}</p>
      <p className="text-[11px] uppercase tracking-wide font-semibold">{label}</p>
    </div>
  );
};

const PhotoStrip = ({ photos, onAdd, onRemove }: { photos: string[]; onAdd: () => void; onRemove: (i: number) => void }) => (
  <div className="mt-3">
    <Label className="text-xs text-muted-foreground">Photos</Label>
    <div className="mt-1.5 flex flex-wrap gap-2">
      {photos.map((p, i) => (
        <div key={i} className="relative group">
          <img src={p} alt="" className="h-14 w-14 rounded-lg object-cover border border-border" />
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground grid place-items-center"
            aria-label="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="h-14 w-14 rounded-lg border-2 border-dashed border-border grid place-items-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        aria-label="Add photo"
      >
        <Camera className="h-5 w-5" />
      </button>
    </div>
  </div>
);

export default AuditWalkthrough;
