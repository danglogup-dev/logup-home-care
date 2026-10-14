import { useTerms } from "@/hooks/useTerms";
import { useState, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useRole } from "@/hooks/useRole";
import { Pencil, ArrowRight, ListChecks, LayoutGrid, PlusCircle } from "lucide-react";
import { motion } from "framer-motion";
import {
  Building2, User as UserIcon, Shield, MapPin, Tag, Clock, Calendar,
  ChevronDown, ChevronUp, CheckCircle2, Circle, Send, Bell, Flag, Stethoscope, Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { roleStore } from "@/lib/roleStore";
import { serviceUserName } from "@/lib/serviceUsersStore";
import {
  incidentsStore, NOTIFICATION_LABELS, NotificationKey, suggestSeverity, suggestNotifications,
  FIELD_STATE_LABEL, type FieldProvenance, type FieldState, type Severity, type SeverityDecision,
  type NotificationSuggestion, type IncidentCard, type DraftDetails,
} from "@/lib/incidentsStore";
import { LANGUAGE_LABELS } from "@/lib/translation";
import { buildManagerSummary, buildStructuredSections, polish } from "@/lib/incidentDrafting";
import { Sparkles, FileText } from "lucide-react";
import { getDefaultVisibility, VISIBILITY_LABEL, isRestricted } from "@/lib/eventVisibility";

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

const SITE_LABEL: Record<string, string> = {
  oakfield: "East Cork",
  riverside: "West Waterford",
  elmgrove: "West Waterford",
};
const LOCATION_LABEL: Record<string, string> = {
  kitchen: "Kitchen", corridor: "Corridor", bedroom: "Bedroom", garden: "Garden", bathroom: "Bathroom",
};
const SEVERITY_LABEL: Record<string, string> = {
  low: "Low", moderate: "Moderate", severe: "Severe", death: "Death",
};

const SEVERITIES: Severity[] = ["Low", "Moderate", "Severe", "Death"];

const STATE_TAG: Record<FieldState, string> = {
  source: "bg-secondary text-foreground border-border",
  ai_draft: "bg-primary/10 text-primary border-primary/20",
  human_confirmed: "bg-success/10 text-success border-success/20",
};

export function FieldStateTag({ state }: { state: FieldState }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none whitespace-nowrap ${STATE_TAG[state]}`}>
      {FIELD_STATE_LABEL[state]}
    </span>
  );
}

const hhmm = (iso?: string) => iso ? new Date(iso).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" }) : "";

function buildInitialFields(d: DraftDetails, residentLabel: string): FieldProvenance[] {
  const translated = !!(d.sourceLanguage && d.sourceLanguage !== "en" && d.translatedText);
  const original = (d.originalText || "").toLowerCase();
  // "Source" only when the value appears word-for-word in what the reporter said.
  const verbatim = (v?: string) => !translated && !!v && original.includes(v.trim().toLowerCase());
  const mk = (key: string, label: string, origin: "source" | "ai_draft", value: string): FieldProvenance =>
    ({ key, label, origin, originalValue: value, value, state: origin });
  return [
    mk("serviceUser", "Person involved", "source", residentLabel),
    mk("eventType", "Event type", "ai_draft", d.eventType || "Incident / Accident"),
    // Translated text is the assistant's work, so it is an AI draft, not source.
    mk("what", "What happened", verbatim(d.translatedText || d.text) ? "source" : "ai_draft", (d.translatedText || d.text || "").trim()),
    mk("date", "Date", "ai_draft", d.dateOfIncident || ""),
    mk("time", "Time", "ai_draft", d.timeOfIncident || ""),
    mk("location", "Location", "ai_draft", d.location || ""),
    mk("immediate", "Immediate actions", verbatim(d.immediateActions) ? "source" : "ai_draft", d.immediateActions || ""),
    // Injury is never pre-confirmed and always starts as an AI draft.
    mk("injury", "Injury", "ai_draft", d.injurySustained ? `Yes${d.injuryNote ? ` — ${d.injuryNote}` : ""}` : "No injury reported"),
  ];
}

/** Map an edited field back onto the pending draft so the saved record carries it. */
function patchFor(key: string, value: string, d: DraftDetails): Partial<DraftDetails> {
  switch (key) {
    case "what": return d.translatedText ? { translatedText: value, text: value } : { text: value };
    case "date": return { dateOfIncident: value };
    case "time": return { timeOfIncident: value };
    case "location": return { location: value };
    case "immediate": return { immediateActions: value };
    case "injury": {
      const none = /^no\b/i.test(value.trim());
      return { injurySustained: !none, injuryNote: none ? undefined : value.replace(/^yes\s*[—-]?\s*/i, "") };
    }
    default: return {};
  }
}

const EDITABLE = new Set(["what", "date", "time", "location", "immediate", "injury"]);

function FieldRow({ f, onConfirm, onSave }: { f: FieldProvenance; onConfirm: () => void; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(f.value);
  return (
    <div className="py-3 border-b border-border last:border-0 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-foreground">{f.label}</p>
        <FieldStateTag state={f.state} />
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea value={val} onChange={(e) => setVal(e.target.value)} className="min-h-[64px] text-sm rounded-xl" />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setVal(f.value); setEditing(false); }}>Cancel</Button>
            <Button size="sm" onClick={() => { onSave(val.trim()); setEditing(false); }} disabled={!val.trim()}>Save & confirm</Button>
          </div>
        </div>
      ) : (
        <p className={`mt-1 text-sm leading-relaxed break-words ${f.value ? "text-foreground" : "italic text-muted-foreground"}`}>
          {f.value || "Not captured — reviewer will see this flagged"}
        </p>
      )}
      {!editing && (
        <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-muted-foreground">
            {f.state === "human_confirmed"
              ? `${f.edited ? "Edited and confirmed" : "Confirmed"} by ${f.confirmedByName} at ${hhmm(f.confirmedAt)} · originally ${FIELD_STATE_LABEL[f.origin]}`
              : f.origin === "source" ? "Taken directly from what you said" : "Structured or inferred by the assistant"}
          </p>
          {f.state !== "human_confirmed" && (
            <div className="flex gap-1.5">
              {EDITABLE.has(f.key) && (
                <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
              )}
              {f.value && (
                <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={onConfirm}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const IncidentDraft = () => {
  const terms = useTerms();
  const role = useRole();
  const [reply, setReply] = useState("");
  const [showConversation, setShowConversation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedCard, setSubmittedCard] = useState<IncidentCard | null>(null);
  const [accurate, setAccurate] = useState(false);
  const navigate = useNavigate();

  const draft = incidentsStore.getDraft();
  const residentName = draft?.serviceUserId ? serviceUserName(draft.serviceUserId) : `the ${terms.singular}`;
  const residentLabel = draft?.serviceUserId ? serviceUserName(draft.serviceUserId) : `No ${terms.singular} involved`;

  const [fields, setFields] = useState<FieldProvenance[]>(() => draft ? buildInitialFields(draft, residentLabel) : []);
  const [severity, setSeverity] = useState<SeverityDecision | null>(() => {
    if (!draft) return null;
    const s = suggestSeverity(draft);
    return { suggestedSeverity: s.severity, suggestedSeverityReason: s.reason };
  });
  const [notifs, setNotifs] = useState<NotificationSuggestion[]>(() => draft ? suggestNotifications(draft) : []);

  const stamp = () => ({ confirmedByStaffId: role.staffId, confirmedAt: new Date().toISOString() });

  const confirmField = (key: string, newValue?: string) => {
    if (newValue !== undefined && draft) incidentsStore.updateDraft(patchFor(key, newValue, draft));
    setFields(prev => prev.map(f => f.key !== key ? f : {
      ...f,
      value: newValue ?? f.value,
      edited: newValue !== undefined && newValue !== f.originalValue ? true : f.edited,
      state: "human_confirmed",
      confirmedByName: role.displayName,
      ...stamp(),
    }));
  };

  const confirmSeverity = (v: Severity) => {
    setSeverity(s => s ? { ...s, confirmedSeverity: v, ...stamp() } : s);
    if (draft) incidentsStore.updateDraft({ severity: v.toLowerCase() });
  };
  const confirmNotif = (key: NotificationKey, v: boolean) =>
    setNotifs(prev => prev.map(n => n.key === key ? { ...n, confirmed: v, ...stamp() } : n));

  const summaryInputs = useMemo(() => {
    if (!draft) return null;
    return {
      residentName,
      what: draft.translatedText || draft.text || "",
      whenDate: draft.dateOfIncident,
      whenTime: draft.timeOfIncident,
      whereDetail: draft.location,
      injurySustained: draft.injurySustained,
      injuryNote: draft.injuryNote,
      response: draft.immediateActions,
    };
  }, [draft, residentName]);
  const managerSummary = useMemo(() => (summaryInputs ? buildManagerSummary(summaryInputs) : ""), [summaryInputs]);
  const outstanding = useMemo(() => (draft ? incidentsStore.computeOutstanding(draft) : []), [draft]);
  const notifiable = useMemo(() => (draft ? incidentsStore.computeNotifiable(draft) : { flagged: false } as { flagged: boolean; framework?: string; rationale?: string }), [draft]);
  const clarifications = incidentsStore.getClarifications();

  const handleSendReply = () => {
    if (!reply.trim()) return;
    incidentsStore.addClarification("Additional clarification from submitter", reply.trim());
    toast("Reply added to record", { description: "Your clarification will be preserved with the submission." });
    setReply("");
  };

  const handleSaveDraft = () => {
    toast("Draft saved", { description: "You can return to complete this later." });
    navigate("/app/incidents/capture");
  };

  const signedAt = useMemo(() => new Date(), [accurate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = () => {
    if (!accurate || !draft) return;
    setSubmitting(true);
    const card = incidentsStore.submit({
      createdBy: role.displayName,
      createdByStaffId: role.staffId,
      severityDecision: severity ?? undefined,
      notificationSuggestions: notifs,
      fieldProvenance: fields,
      reporterSignOff: { staffId: role.staffId, name: role.displayName, confirmedAt: signedAt.toISOString(), statement: "I confirm this is an accurate account" },
    });
    setSubmitting(false);
    setSubmittedCard(card);
    window.scrollTo({ top: 0 });
  };

  // === Confirmation screen ===================================================
  if (submittedCard) {
    const canBoard = role.role === "manager" || role.role === "admin";
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <motion.div {...fade} className="bg-card rounded-2xl border border-border shadow-card p-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
          <h1 className="font-heading text-xl font-bold text-foreground mt-3">Event submitted</h1>
          <p className="text-sm text-muted-foreground mt-1">Reference number</p>
          <p className="font-mono text-lg font-semibold text-foreground tabular-nums">{submittedCard.id}</p>
          <div className="mt-5 text-left rounded-xl bg-secondary/40 border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">What happens next</p>
            <p className="text-sm text-foreground leading-relaxed">
              Your manager has been notified.{submittedCard.serviceUserId ? " A care plan review may be suggested." : ""}
            </p>
            <p className="text-[11px] text-muted-foreground mt-2">
              Signed off by {submittedCard.reporterSignOff?.name} at {hhmm(submittedCard.reporterSignOff?.confirmedAt)}. You can add information later from My reports — the original stays as submitted.
            </p>
          </div>
          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <Button className="flex-1 rounded-xl" onClick={() => navigate("/app/incidents/capture")}>
              <PlusCircle className="h-4 w-4 mr-1.5" /> Log another event
            </Button>
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => navigate("/app/incidents/mine")}>
              <ListChecks className="h-4 w-4 mr-1.5" /> My reports
            </Button>
            {canBoard && (
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => navigate("/app/incidents/board")}>
                <LayoutGrid className="h-4 w-4 mr-1.5" /> Open on Board
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  const defaultVisibility = getDefaultVisibility(draft?.eventType);
  const visibilityRestricted = isRestricted(defaultVisibility);
  const lang = draft?.sourceLanguage || "en";
  const original = draft?.originalText || draft?.text || "";
  const isTranslated = lang !== "en" && !!draft?.translatedText;
  const suggestedNotifs = notifs.filter(n => n.suggested);
  const otherNotifs = notifs.filter(n => !n.suggested);

  const anchorItems = [
    { icon: Building2, label: "Site", value: draft ? (SITE_LABEL[draft.site] || draft.site || "—") : "—" },
    { icon: UserIcon, label: terms.Singular, value: draft ? residentLabel : "—" },
    { icon: MapPin, label: "Location", value: draft ? (LOCATION_LABEL[draft.location] || draft.location || "—") : "—" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-20 overflow-x-hidden">
      <motion.div {...fade} transition={{ duration: 0.4 }}>
        <h1 className="font-heading text-2xl font-bold text-foreground">Review and sign off</h1>
        <p className="text-muted-foreground mt-1 text-sm">Check what LogUp structured from your account, confirm or edit each part, then sign off.</p>

        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.04] px-3 py-2.5 flex items-start gap-2.5">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">AI-assisted draft — pending your sign-off. </span>
            Nothing is submitted until you confirm. AI does not approve, close, or make regulatory decisions.
          </p>
        </div>
        <div className={`mt-2 rounded-xl border px-3 py-2.5 flex items-start gap-2.5 ${visibilityRestricted ? "border-warning/30 bg-warning/[0.05]" : "border-border bg-secondary/30"}`}>
          <Shield className={`h-4 w-4 mt-0.5 shrink-0 ${visibilityRestricted ? "text-warning" : "text-muted-foreground"}`} />
          <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Visibility on submission: {VISIBILITY_LABEL[defaultVisibility]}. </span>
            A Manager or Admin can change this later — every change is recorded.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {anchorItems.map((a) => (
            <Badge key={a.label} variant="outline" className="bg-secondary/60 text-foreground inline-flex items-center gap-1.5 py-1 px-2.5 max-w-full">
              <a.icon className="h-3 w-3 shrink-0" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.label}</span>
              <span className="text-xs font-medium truncate">{a.value}</span>
            </Badge>
          ))}
        </div>
      </motion.div>

      {!draft ? (
        <div className="mt-6 bg-card rounded-2xl border border-border p-6 text-sm text-muted-foreground">
          No draft yet — <button className="text-primary hover:underline" onClick={() => navigate("/app/incidents/capture")}>log an event</button> to begin.
        </div>
      ) : (
      <div className="mt-6 grid gap-4 lg:grid-cols-2 items-start">
        {/* LEFT — What you said */}
        <motion.section {...fade} transition={{ delay: 0.06, duration: 0.4 }} className="bg-card rounded-2xl shadow-soft p-5 border border-border min-w-0 lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h2 className="font-heading font-semibold text-foreground inline-flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" /> What you said
            </h2>
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <Languages className="h-3 w-3" />
              {draft.source === "voice" ? "Voice transcript" : "Typed"} · {LANGUAGE_LABELS[lang]}{draft.languageAutoDetected ? " (auto-detected)" : ""}
            </span>
          </div>
          <div className="bg-secondary/30 rounded-xl border border-border p-3">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">{original || "—"}</p>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">Kept exactly as you said it, in the original language. It is never edited.</p>
          {isTranslated && (
            <p className="text-[11px] text-muted-foreground mt-1">The structured record was built from an English translation.</p>
          )}
        </motion.section>

        {/* RIGHT — Structured record */}
        <motion.section {...fade} transition={{ delay: 0.1, duration: 0.4 }} className="space-y-4 min-w-0">
          <div className="bg-card rounded-2xl shadow-card p-5 border border-border">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <h2 className="font-heading font-semibold text-foreground">Structured record</h2>
              <div className="flex gap-1 flex-wrap">
                <FieldStateTag state="source" /><FieldStateTag state="ai_draft" /><FieldStateTag state="human_confirmed" />
              </div>
            </div>
            {fields.map((f) => (
              <FieldRow key={f.key} f={f} onConfirm={() => confirmField(f.key)} onSave={(v) => confirmField(f.key, v)} />
            ))}
          </div>

          {/* Severity — suggested, never pre-confirmed */}
          {severity && (
            <div className="bg-card rounded-2xl shadow-soft p-5 border border-border">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-heading font-semibold text-foreground inline-flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-primary" /> Severity
                </h3>
                <FieldStateTag state={severity.confirmedSeverity ? "human_confirmed" : "ai_draft"} />
              </div>
              <p className="text-sm text-foreground mt-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">LogUp suggestion</span>
                Suggested: <span className="font-semibold">{severity.suggestedSeverity}</span>. {severity.suggestedSeverityReason}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SEVERITIES.map((v) => {
                  const active = severity.confirmedSeverity === v;
                  const isSuggested = v === severity.suggestedSeverity;
                  return (
                    <Button key={v} size="sm" variant={active ? "default" : "outline"} className="rounded-lg h-9" onClick={() => confirmSeverity(v)}>
                      {isSuggested && !severity.confirmedSeverity ? `Confirm ${v}` : v}
                    </Button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {severity.confirmedSeverity
                  ? `${severity.confirmedSeverity === severity.suggestedSeverity ? "Confirmed" : `Changed to ${severity.confirmedSeverity}`} by ${role.displayName} at ${hhmm(severity.confirmedAt)}. Your manager can still review it.`
                  : "Not confirmed yet. If you leave it, your manager will confirm it."}
              </p>
            </div>
          )}

          {/* Notifications — suggested, never pre-confirmed */}
          <div className="bg-card rounded-2xl shadow-soft p-5 border border-border">
            <h3 className="text-sm font-heading font-semibold text-foreground inline-flex items-center gap-1.5">
              <Bell className="h-4 w-4 text-primary" /> Who should be told
            </h3>
            <div className="mt-2 divide-y divide-border">
              {[...suggestedNotifs, ...otherNotifs].map((n) => (
                <div key={n.key} className="py-2.5 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm text-foreground font-medium">{NOTIFICATION_LABELS[n.key]}</p>
                    <FieldStateTag state={n.confirmed !== undefined ? "human_confirmed" : "ai_draft"} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    <span className="uppercase tracking-wider mr-1">LogUp suggestion</span>
                    {n.suggested ? "Suggested" : "Not suggested"} — {n.reason}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant={n.confirmed === true ? "default" : "outline"} className="h-8 rounded-lg" onClick={() => confirmNotif(n.key, true)}>Needed</Button>
                    <Button size="sm" variant={n.confirmed === false ? "default" : "outline"} className="h-8 rounded-lg" onClick={() => confirmNotif(n.key, false)}>Not needed</Button>
                    {n.confirmed !== undefined && <span className="text-[11px] text-muted-foreground">by {role.displayName} at {hhmm(n.confirmedAt)}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className={`mt-3 rounded-xl border p-3 ${notifiable.flagged ? "bg-destructive/5 border-destructive/20" : "bg-secondary/40 border-border"}`}>
              <p className="text-xs font-semibold text-foreground inline-flex items-center gap-1.5">
                <Flag className={`h-3.5 w-3.5 ${notifiable.flagged ? "text-destructive" : "text-muted-foreground"}`} />
                {notifiable.flagged ? "May be notifiable to the regulator" : "Not flagged as notifiable"}
              </p>
              {notifiable.rationale && <p className="text-[11px] text-muted-foreground mt-1">{notifiable.rationale}</p>}
              <p className="text-[11px] text-muted-foreground mt-1">Your manager makes the final notification decision.</p>
            </div>
          </div>

          {managerSummary && (
            <div className="bg-card rounded-2xl shadow-soft p-5 border border-border">
              <div className="flex items-center justify-between mb-2 gap-2">
                <h3 className="text-sm font-heading font-semibold text-foreground inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Manager summary
                </h3>
                <FieldStateTag state="ai_draft" />
              </div>
              <p className="text-sm text-foreground leading-relaxed break-words">{managerSummary}</p>
            </div>
          )}

          {outstanding.length > 0 && (
            <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Missing or unclear — flagged for your manager</p>
              <div className="flex flex-wrap gap-2">
                {outstanding.map((flag) => (
                  <Badge key={flag} variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">{flag}</Badge>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card rounded-2xl shadow-soft p-4 border border-border">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Add anything still missing — e.g. 'Family informed at 14:10 by Áine.'"
              className="min-h-[72px] rounded-xl bg-background border-input text-sm resize-none"
            />
            <div className="flex justify-end mt-3">
              <Button variant="outline" className="h-9 rounded-xl text-sm" onClick={handleSendReply} disabled={!reply.trim()}>
                <Send className="h-4 w-4 mr-1.5" /> Add to record
              </Button>
            </div>
          </div>

          <button
            onClick={() => setShowConversation(!showConversation)}
            className="w-full flex items-center justify-between bg-card rounded-xl p-4 border border-border shadow-soft text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors"
          >
            Conversation so far ({clarifications.length})
            {showConversation ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {showConversation && (
            <div className="bg-card rounded-xl p-4 border border-border shadow-soft space-y-3">
              {clarifications.length === 0 && <p className="text-sm text-muted-foreground italic">No clarifications yet.</p>}
              {clarifications.map((c) => (
                <div key={c.id} className="min-w-0">
                  <p className="text-xs font-medium text-foreground break-words">{c.question}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 break-words">{c.answer}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{c.ts}</p>
                </div>
              ))}
            </div>
          )}

          {/* Sign-off */}
          <div className="bg-card rounded-2xl shadow-card p-5 border border-border">
            <h3 className="text-sm font-heading font-semibold text-foreground">Sign off</h3>
            <label className="mt-3 flex items-start gap-3 cursor-pointer">
              <Checkbox checked={accurate} onCheckedChange={(v) => setAccurate(v === true)} className="mt-0.5" aria-label="I confirm this is an accurate account" />
              <span className="text-sm text-foreground leading-snug">I confirm this is an accurate account</span>
            </label>
            <p className="text-[11px] text-muted-foreground mt-2 ml-7">
              {role.displayName} · {accurate ? signedAt.toLocaleString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "time recorded when you tick the box"}
            </p>
            <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
              <Button variant="outline" className="flex-1 h-11 rounded-xl font-semibold text-sm" onClick={handleSaveDraft}>Save as draft</Button>
              <Button className="flex-1 h-11 rounded-xl font-semibold text-sm" onClick={handleSubmit} disabled={!accurate || submitting}>
                {submitting ? "Submitting…" : <>Submit <ArrowRight className="h-4 w-4 ml-1.5" /></>}
              </Button>
            </div>
          </div>
        </motion.section>
      </div>
      )}
    </div>
  );
};

export default IncidentDraft;
