/**
 * @deprecated Duplicate care plan creation flow. /app/care-plans/new-wizard now
 * redirects to CreateCarePlan (/app/care-plans/create). Kept for reference only;
 * do not add features here. Scheduled for removal.
 */
import { useTerms } from "@/hooks/useTerms";
import { useMemo, useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Check, Sparkles, Mic, Square, Send, FileText,
  ClipboardList, UserPlus, ShieldCheck, AlertTriangle, HeartPulse, Wand2,
  RefreshCcw, Bot, ListChecks, Circle, CheckCircle2, Clock, AlertCircle,
  Languages, Building2, Home, User as UserIcon,
} from "lucide-react";
import {
  useCarePlans, carePlansStore, generateAiDraftSections, DEMO_VOICE_TRANSCRIPT,
  SECTION_LABELS, SECTION_ORDER, publishedVersion, type CarePlanSection, type SectionKey,
} from "@/lib/carePlansStore";
import {
  useCarePlanApprovalChains, findChainForPerson,
} from "@/lib/carePlanApprovalChainsStore";
import { useRole } from "@/hooks/useRole";
import { ALL_SITES } from "@/lib/roleStore";

type CreationType = "new_person" | "existing_person" | "new_version";
type DraftMethod = "voice" | "text" | "guided" | "blank";
type CaptureStatus = "pending" | "captured" | "review" | "missing";

interface GuidanceItem {
  id: string;
  label: string;
  required: boolean;
  keywords: string[];
  detailKeywords?: string[]; // if captured but missing these, mark "review"
}

const SERVICE_TYPES = [
  { id: "nursing_home", label: "Older Persons / Nursing Home", template: "TPL-NH" },
  { id: "disability",   label: "Disability / Intellectual Disability Residential", template: "TPL-DIS" },
  { id: "home_support", label: "Home Support", template: "TPL-HS" },
  { id: "childrens",    label: "Children's Residential", template: "TPL-CR" },
  { id: "core",         label: "Regulated Care Core", template: "TPL-CORE" },
];

// ---- Service-type-specific guidance checklists ----
const GUIDANCE_BY_SERVICE: Record<string, GuidanceItem[]> = {
  nursing_home: [
    { id: "person",         label: "Person details and preferred name", required: true,  keywords: ["prefer", "called", "known as", "name is", "paddy", "years old", "age"] },
    { id: "matters",        label: "What matters to the person",        required: true,  keywords: ["enjoy", "like", "matters", "important", "hobby", "faith", "family"] },
    { id: "communication",  label: "Communication needs",               required: true,  keywords: ["glass", "hearing", "language", "speaks", "irish", "gaeilge", "verbal", "sign"] },
    { id: "personalCare",   label: "Personal care support",             required: true,  keywords: ["shower", "bath", "dress", "toilet", "continence", "washing", "morning routine"] },
    { id: "mobility",       label: "Mobility and falls risk",           required: true,  keywords: ["walk", "frame", "zimmer", "wheelchair", "stick", "steady", "fall", "transfer"] },
    { id: "nutrition",      label: "Nutrition and hydration",           required: true,  keywords: ["diet", "eat", "food", "meal", "swallow", "thicken", "fluid", "hydrat"] },
    { id: "medication",     label: "Medication support",                required: true,  keywords: ["medic", "tablet", "prescri", "mar", "insulin", "warfarin", "nurse", "vitamin"] },
    { id: "health",         label: "Health conditions",                 required: true,  keywords: ["hypertens", "diabet", "dementia", "cardiac", "copd", "arthritis", "condition"] },
    { id: "safeguarding",   label: "Safeguarding considerations",       required: true,  keywords: ["safeguard", "abuse", "concern", "protection", "no concerns"] },
    { id: "risks",          label: "Risks and controls",                required: true,  keywords: ["risk", "control", "hazard", "bed rail", "call bell", "restraint"] },
    { id: "goals",          label: "Goals and outcomes",                required: true,  keywords: ["goal", "wants to", "hopes", "outcome", "keep attending", "maintain"] },
    { id: "family",         label: "Family / advocate involvement",     required: true,  keywords: ["daughter", "son", "wife", "husband", "spouse", "advocate", "next of kin", "family"] },
    { id: "review",         label: "Review date and responsible person", required: false, keywords: ["review", "pic", "sign off", "responsible"] },
    { id: "evidence",       label: "Evidence or assessment references", required: false, keywords: ["assessment", "salt", "gp", "referral", "assessed", "evidence"] },
  ],
  disability: [
    { id: "matters",        label: "What matters to the person",         required: true, keywords: ["matters", "important", "enjoy", "hobby", "friend"] },
    { id: "communication",  label: "Communication and accessible information", required: true, keywords: ["sign", "picture", "aac", "easy read", "verbal", "language"] },
    { id: "decisions",      label: "Decision-making supports",           required: true, keywords: ["decision", "consent", "capacity", "advocate", "supported"] },
    { id: "rights",         label: "Rights and advocacy",                required: true, keywords: ["rights", "advocacy", "advocate", "choice"] },
    { id: "goals",          label: "Personal goals",                     required: true, keywords: ["goal", "wants to", "hopes", "outcome"] },
    { id: "community",      label: "Community participation",            required: true, keywords: ["community", "club", "attend", "outing", "activity"] },
    { id: "relationships",  label: "Relationships",                      required: true, keywords: ["family", "friend", "relationship", "partner"] },
    { id: "pbs",            label: "Positive behaviour support",         required: false, keywords: ["behaviour", "pbs", "trigger", "de-escalat"] },
    { id: "health",         label: "Health support",                     required: true, keywords: ["health", "gp", "medic", "condition"] },
    { id: "personalCare",   label: "Intimate / personal care",           required: true, keywords: ["personal care", "intimate", "shower", "toilet", "continence"] },
    { id: "riskEnablement", label: "Risk enablement",                    required: true, keywords: ["risk", "enable", "positive risk"] },
    { id: "safeguarding",   label: "Safeguarding",                       required: true, keywords: ["safeguard", "concern", "protection"] },
    { id: "keyworker",      label: "Key worker",                         required: false, keywords: ["key worker", "keyworker", "named nurse"] },
    { id: "review",         label: "Review arrangements",                required: false, keywords: ["review", "sign off"] },
  ],
  home_support: [
    { id: "home",           label: "Home environment",           required: true, keywords: ["home", "house", "apartment", "stairs", "kitchen"] },
    { id: "schedule",       label: "Visit schedule",             required: true, keywords: ["visit", "morning", "evening", "schedule", "daily", "weekly"] },
    { id: "personalCare",   label: "Personal care tasks",        required: true, keywords: ["shower", "bath", "dress", "toilet", "personal care"] },
    { id: "nutrition",      label: "Nutrition / hydration support", required: true, keywords: ["meal", "eat", "food", "fluid", "diet"] },
    { id: "medication",     label: "Medication prompting/support", required: true, keywords: ["medic", "tablet", "prompt", "prescri"] },
    { id: "mobility",       label: "Mobility / transfers",       required: true, keywords: ["walk", "transfer", "frame", "wheelchair", "hoist"] },
    { id: "family",         label: "Family / informal carer role", required: true, keywords: ["family", "carer", "daughter", "son", "spouse"] },
    { id: "missed",         label: "Missed visit escalation",    required: true, keywords: ["missed", "no answer", "escalat"] },
    { id: "emergency",      label: "Emergency contacts",         required: true, keywords: ["emergency", "next of kin", "contact number"] },
    { id: "risks",          label: "Risks in the home",          required: true, keywords: ["risk", "hazard", "trip", "pet"] },
    { id: "record",         label: "What staff should record",   required: false, keywords: ["record", "note", "log"] },
  ],
  childrens: [
    { id: "placement",      label: "Placement context",          required: true, keywords: ["placement", "admitted", "referred", "tusla"] },
    { id: "voice",          label: "Voice of the child",         required: true, keywords: ["says", "wants", "prefers", "voice", "wishes", "feels"] },
    { id: "carePlan",       label: "Care plan reference",        required: true, keywords: ["care plan", "statutory", "reference"] },
    { id: "aims",           label: "Placement aims",             required: true, keywords: ["aim", "goal", "reunif", "long term"] },
    { id: "family",         label: "Family / access arrangements", required: true, keywords: ["family", "access", "contact", "visit", "mother", "father"] },
    { id: "education",      label: "Education",                  required: true, keywords: ["school", "education", "study", "college"] },
    { id: "health",         label: "Health and wellbeing",       required: true, keywords: ["health", "gp", "medic", "dental", "sight"] },
    { id: "emotional",      label: "Emotional / behavioural support", required: true, keywords: ["emotion", "behaviour", "therap", "counsel"] },
    { id: "safeguarding",   label: "Safeguarding",               required: true, keywords: ["safeguard", "protection", "concern"] },
    { id: "keyworker",      label: "Key working",                required: false, keywords: ["key worker", "keyworker"] },
    { id: "specialist",     label: "Specialist supports",        required: false, keywords: ["specialist", "cams", "psychologist", "therap"] },
    { id: "review",         label: "Review meetings",            required: false, keywords: ["review", "meeting"] },
  ],
  core: [], // fallback: use nursing_home list
};

function getGuidanceItems(serviceType: string): GuidanceItem[] {
  return GUIDANCE_BY_SERVICE[serviceType]?.length ? GUIDANCE_BY_SERVICE[serviceType] : GUIDANCE_BY_SERVICE.nursing_home;
}

type ChatMsg =
  | { id: string; role: "bot"; text: string; ts: string }
  | { id: string; role: "user"; text: string; voice?: boolean; ts: string };

const stamp = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// ---- Compute checklist status from cumulative transcript ----
function computeStatuses(items: GuidanceItem[], corpus: string): Record<string, CaptureStatus> {
  const t = corpus.toLowerCase();
  const out: Record<string, CaptureStatus> = {};
  for (const it of items) {
    const hit = it.keywords.some((k) => t.includes(k));
    if (!hit) { out[it.id] = it.required ? "missing" : "pending"; continue; }
    // captured — check for detail keywords if defined
    if (it.detailKeywords && !it.detailKeywords.some((k) => t.includes(k))) {
      out[it.id] = "review";
    } else {
      out[it.id] = "captured";
    }
  }
  return out;
}

export default function NewCarePlan() {
  const terms = useTerms();
  const navigate = useNavigate();
  const role = useRole();
  const { people, templates } = useCarePlans();
  const { chains } = useCarePlanApprovalChains();

  const [step, setStep] = useState(1);
  const [creationType, setCreationType] = useState<CreationType>("new_person");
  const [existingPersonId, setExistingPersonId] = useState<string>("");

  // Person details
  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [dob, setDob] = useState("");
  const [personId, setPersonId] = useState(() => `PS-${Math.floor(100 + Math.random() * 900)}`);
  const [site, setSite] = useState<string>(role.scope[0] ?? ALL_SITES[0]);
  const [unit, setUnit] = useState<string>("");
  const [admissionDate, setAdmissionDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [keyWorker, setKeyWorker] = useState("");
  const [pic, setPic] = useState("");
  const [familyContact, setFamilyContact] = useState("");
  const [serviceType, setServiceType] = useState<string>("nursing_home");
  const [language, setLanguage] = useState<string>("auto");

  const templateId = SERVICE_TYPES.find((s) => s.id === serviceType)?.template ?? "TPL-NH";
  const template = templates.find((t) => t.id === templateId);
  const tplPub = template ? publishedVersion(template) : undefined;

  const existingPerson = people.find((p) => p.id === existingPersonId);
  const effectivePersonName = creationType === "existing_person"
    ? (existingPerson?.name ?? "")
    : fullName;
  const nameToUse = preferredName || effectivePersonName;
  const effectiveSite = creationType === "existing_person" ? (existingPerson?.site ?? site) : site;
  const effectiveUnit = creationType === "existing_person" ? (existingPerson?.unit ?? unit) : unit;

  const chainForScope = useMemo(() =>
    findChainForPerson(chains, { site: effectiveSite, unit: effectiveUnit || undefined }),
    [chains, effectiveSite, effectiveUnit],
  );

  // ---- Draft method + assistant state ----
  const [draftMethod, setDraftMethod] = useState<DraftMethod>("voice");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [generated, setGenerated] = useState<{ sections: CarePlanSection[]; missing: string[] } | null>(null);
  const [generating, setGenerating] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Cumulative user text (voice + typed) — the source for AI drafting and checklist
  const corpus = useMemo(
    () => messages.filter((m) => m.role === "user").map((m) => m.text).join("\n"),
    [messages],
  );
  const hasUserSent = messages.some((m) => m.role === "user");

  const guidance = useMemo(() => getGuidanceItems(serviceType), [serviceType]);
  const statuses = useMemo(() => computeStatuses(guidance, corpus), [guidance, corpus]);

  const capturedCount   = guidance.filter((g) => statuses[g.id] === "captured").length;
  const reviewCount     = guidance.filter((g) => statuses[g.id] === "review").length;
  const missingRequired = guidance.filter((g) => g.required && (statuses[g.id] === "missing" || statuses[g.id] === "pending")).length;
  const totalRequired   = guidance.filter((g) => g.required).length;

  const readyEnough = missingRequired <= Math.max(1, Math.floor(totalRequired * 0.25));

  // Initial assistant message when entering step 4
  useEffect(() => {
    if (step === 4 && messages.length === 0) {
      const greeting = `Hi. I'm the LogUp Care Plan Assistant. Tell me about ${nameToUse || "this person"} in your own words — needs, preferences, risks, routines, supports and goals. I'll structure it into the care plan template and ask for anything still needed.`;
      setMessages([{ id: `b-init`, role: "bot", text: greeting, ts: stamp() }]);
    }
  }, [step, nameToUse, messages.length]);

  // Auto-scroll chat
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages]);

  // ---- Voice mock ----
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startRec = () => {
    setRecording(true); setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  };
  const stopRec = () => {
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    // Pick a demo transcript — the seed one on first send, a follow-up one after
    const followUp = `He wears glasses and a hearing aid in his right ear. He prefers showers in the morning. Normal diet and thin fluids. Nursing staff support his medication. No active safeguarding concerns. He wants to keep attending music sessions and walking to the garden.`;
    const text = hasUserSent ? followUp : DEMO_VOICE_TRANSCRIPT;
    pushUserMessage(text, true);
    toast.success("Voice note transcribed (demo)");
  };

  // ---- Assistant behaviour ----
  const pushUserMessage = (text: string, voice = false) => {
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", text, voice, ts: stamp() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    // Compute reply based on new corpus
    const nextCorpus = nextMessages.filter((m) => m.role === "user").map((m) => m.text).join("\n");
    const nextStatuses = computeStatuses(guidance, nextCorpus);
    const justCaptured = guidance
      .filter((g) => nextStatuses[g.id] === "captured" && statuses[g.id] !== "captured")
      .map((g) => g.label);
    const stillMissing = guidance
      .filter((g) => g.required && (nextStatuses[g.id] === "missing" || nextStatuses[g.id] === "pending"))
      .map((g) => g.label);

    let botText = "";
    if (justCaptured.length) {
      botText = `Thanks — I've captured ${justCaptured.slice(0, 4).join(", ")}${justCaptured.length > 4 ? "…" : ""}. `;
    } else {
      botText = `Thanks. `;
    }
    if (stillMissing.length === 0) {
      botText += `I have enough to draft the care plan. When you're ready, choose "Generate structured care plan draft" below.`;
    } else if (stillMissing.length <= 3) {
      botText += `I still need: ${stillMissing.join(", ")}. Can you tell me about those?`;
    } else {
      botText += `I still need details on ${stillMissing.slice(0, 3).join(", ")} and ${stillMissing.length - 3} other area${stillMissing.length - 3 === 1 ? "" : "s"}. You can answer by voice or text.`;
    }

    setTimeout(() => {
      setMessages((m) => [...m, { id: `b-${Date.now()}`, role: "bot", text: botText, ts: stamp() }]);
    }, 350);
  };

  const handleSend = () => {
    if (!draft.trim()) return;
    pushUserMessage(draft.trim(), false);
    setDraft("");
  };

  // ---- AI generation ----
  const runGeneration = () => {
    if (!corpus.trim() && draftMethod !== "blank") {
      toast.error("Capture at least some information first");
      return;
    }
    setGenerating(true);
    setTimeout(() => {
      const out = generateAiDraftSections(corpus, nameToUse || effectivePersonName || "The person");
      setGenerated(out);
      setGenerating(false);
      toast.success("AI draft created — human review required");
      setMessages((m) => [...m, {
        id: `b-gen-${Date.now()}`,
        role: "bot",
        text: `Structured draft created with ${out.sections.length} sections. Please review each section below — you can edit, regenerate, or mark it as needing more information before submitting for approval.`,
        ts: stamp(),
      }]);
    }, 700);
  };

  const regenerateSection = (key: SectionKey) => {
    if (!generated) return;
    const fresh = generateAiDraftSections(corpus, nameToUse || effectivePersonName);
    const replacement = fresh.sections.find((s) => s.key === key);
    if (!replacement) return;
    setGenerated({ ...generated, sections: generated.sections.map((s) => s.key === key ? replacement : s) });
    toast.success(`Regenerated ${SECTION_LABELS[key]}`);
  };
  const updateSection = (key: SectionKey, body: string) => {
    if (!generated) return;
    setGenerated({ ...generated, sections: generated.sections.map((s) => s.key === key ? { ...s, body, humanEdited: true } : s) });
  };
  const markSectionNeedsInfo = (key: SectionKey) => {
    toast.info(`${SECTION_LABELS[key]} flagged as needing more information`);
  };

  const askAssistantAbout = (label: string) => {
    setMessages((m) => [...m, {
      id: `b-ask-${Date.now()}`, role: "bot",
      text: `Can you tell me a bit more about: ${label}?`, ts: stamp(),
    }]);
    // scroll to input
    setTimeout(() => document.getElementById("careplan-input")?.focus(), 100);
  };

  // ---- Human review confirmation ----
  const [humanReviewed, setHumanReviewed] = useState(false);

  // ---- Final commit ----
  const canCommit = generated && effectivePersonName.trim() && effectiveSite;
  const commit = (markReady: boolean) => {
    if (!generated) return;
    if (markReady && !humanReviewed) {
      toast.error("Please confirm the AI draft has been reviewed by a human before submitting");
      return;
    }
    const byKey = new Map(generated.sections.map((s) => [s.key, s] as const));
    const ordered: CarePlanSection[] = SECTION_ORDER.map((k) => byKey.get(k) ?? { key: k, body: "" });

    if (creationType === "new_person") {
      carePlansStore.addPersonSupported({
        id: personId, name: fullName.trim(), site, unit: unit || undefined,
        riskLevel: "medium", tags: [], setting: "nursing_home",
      });
    }
    const usePersonId = creationType === "new_person" ? personId : existingPersonId;
    const { version } = carePlansStore.createInitialCarePlan({
      personId: usePersonId, templateId, sections: ordered,
      createdBy: role.displayName, aiAssisted: draftMethod !== "blank" && draftMethod !== "guided",
    });
    if (markReady) {
      carePlansStore.markReadyForApproval(usePersonId, version.id);
      toast.success("Draft submitted to approval chain");
    } else {
      toast.success("Draft saved");
    }
    navigate(`/app/care-plans/people/${usePersonId}`);
  };

  // ---- Step gates ----
  const step1Valid = !!creationType && (creationType !== "existing_person" || !!existingPersonId);
  const step2Valid = creationType === "existing_person" ? true : !!fullName.trim() && !!site;
  const step3Valid = !!templateId;
  const step4Valid = !!generated;

  const stepMeta = [
    { n: 1, label: "Type" },
    { n: 2, label: "Person" },
    { n: 3, label: "Template" },
    { n: 4, label: "Draft" },
    { n: 5, label: "Review" },
  ];

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <Link to="/app/care-plans/overview" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Care Planning
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3 mt-2">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <HeartPulse className="h-3.5 w-3.5 text-primary" /> New Care Plan
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Create a Care Plan</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              AI drafts and structures. Humans review, approve and publish.
            </p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 flex-wrap">
        {stepMeta.map((s, i) => (
          <div key={s.n} className="flex items-center">
            <button
              onClick={() => (s.n < step || (s.n === step)) && setStep(s.n)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                s.n === step ? "bg-primary text-primary-foreground border-primary"
                : s.n < step ? "bg-primary/10 text-primary border-primary/20"
                : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {s.n < step ? <Check className="h-3 w-3 inline mr-1" /> : null}
              {s.n}. {s.label}
            </button>
            {i < stepMeta.length - 1 && <div className="w-4 h-px bg-border mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1 — creation type */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>What are you creating?</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {[
              { id: "new_person", title: `Care plan for a new ${terms.singular}`, desc: "New admission or intake. Adds the person and creates v1.", icon: UserPlus },
              { id: "existing_person", title: `Care plan for an existing ${terms.singular}`, desc: "Person is already in LogUp but has no care plan yet.", icon: ClipboardList },
              { id: "new_version", title: "New version of existing care plan", desc: "Open the person's page and use Create draft update.", icon: RefreshCcw, disabled: true },
            ].map((opt) => (
              <button key={opt.id}
                onClick={() => !opt.disabled && setCreationType(opt.id as CreationType)}
                disabled={opt.disabled}
                className={`text-left rounded-lg border p-4 transition-colors ${
                  creationType === opt.id ? "border-primary bg-primary/5" : "hover:bg-accent/40"
                } ${opt.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <opt.icon className="h-5 w-5 text-primary mb-2" />
                <div className="font-medium text-sm">{opt.title}</div>
                <div className="text-xs text-muted-foreground mt-1">{opt.desc}</div>
              </button>
            ))}
            {creationType === "existing_person" && (
              <div className="md:col-span-3">
                <Label className="text-xs">Select person</Label>
                <Select value={existingPersonId} onValueChange={setExistingPersonId}>
                  <SelectTrigger><SelectValue placeholder={`Choose a ${terms.singular}…`} /></SelectTrigger>
                  <SelectContent>
                    {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.site}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2 — person details */}
      {step === 2 && creationType === "new_person" && (
        <Card>
          <CardHeader><CardTitle>{terms.Singular} details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Full name *"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Patrick Murphy" /></Field>
            <Field label="Preferred name"><Input value={preferredName} onChange={(e) => setPreferredName(e.target.value)} placeholder="e.g. Paddy" /></Field>
            <Field label="Date of birth"><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
            <Field label="Person ID"><Input value={personId} onChange={(e) => setPersonId(e.target.value)} /></Field>
            <Field label="Site *">
              <Select value={site} onValueChange={setSite}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_SITES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            
            <Field label="Admission / start date"><Input type="date" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} /></Field>
            <Field label="Key worker"><Input value={keyWorker} onChange={(e) => setKeyWorker(e.target.value)} placeholder="Assigned key worker" /></Field>
            <Field label="Primary manager / PIC"><Input value={pic} onChange={(e) => setPic(e.target.value)} placeholder="e.g. Siobhán Kelly" /></Field>
            <Field label="Family / advocate contact"><Input value={familyContact} onChange={(e) => setFamilyContact(e.target.value)} placeholder="e.g. Margaret Murphy (daughter)" /></Field>
            <Field label="Service type" className="md:col-span-2">
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SERVICE_TYPES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>
      )}
      {step === 2 && creationType === "existing_person" && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Person selected: <span className="font-medium text-foreground">{existingPerson?.name ?? "—"}</span>
        </CardContent></Card>
      )}

      {/* Step 3 — template + approval chain */}
      {step === 3 && (
        <Card>
          <CardHeader><CardTitle>Care plan template</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs">Template</Label>
                <div className="mt-1.5 rounded-lg border p-4">
                  <div className="font-medium">{template?.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{template?.serviceType}</div>
                  <div className="mt-3 text-xs text-muted-foreground">Review every {tplPub?.reviewFrequencyMonths} months · {tplPub?.approvalRequired ? "Approval required" : "No approval required"}</div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {tplPub?.sections.slice(0, 8).map((sec) => (
                      <Badge key={sec.id} variant="secondary" className="text-[10px]">{sec.displayName}</Badge>
                    ))}
                    {tplPub && tplPub.sections.length > 8 && (
                      <Badge variant="outline" className="text-[10px]">+{tplPub.sections.length - 8} more</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Assigned approval chain</Label>
                <div className="mt-1.5 rounded-lg border p-4">
                  {chainForScope ? (
                    <>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <div className="font-medium text-sm">{chainForScope.name}</div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Scope: {chainForScope.scopeLabel} · {chainForScope.levels.length} level{chainForScope.levels.length === 1 ? "" : "s"}</div>
                      <ul className="mt-3 space-y-1.5 text-xs">
                        {chainForScope.levels.map((l) => (
                          <li key={l.id} className="flex gap-2">
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">L{l.levelNumber}</Badge>
                            <div>
                              <div className="font-medium text-foreground">{l.levelName}</div>
                              <div className="text-muted-foreground">{l.approvers.map((a) => a.name).join(", ")}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>No approval chain configured</AlertTitle>
                      <AlertDescription className="text-xs">
                        No active approval chain is assigned to <b>{effectiveSite}{effectiveUnit ? ` · ${effectiveUnit}` : ""}</b>. An Admin must configure a chain
                        before this care plan can be published.
                        <div className="mt-2">
                          <Button asChild size="sm" variant="outline"><Link to="/app/admin/care-plan-approval-chains">Open Approval Chains</Link></Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4 — LogUp Care Plan Assistant */}
      {step === 4 && (
        <div className="space-y-4">
          {/* Top configuration row */}
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
                <ConfigField icon={Building2} label="Site">
                  <Select value={site} onValueChange={setSite} disabled={creationType === "existing_person"}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{ALL_SITES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </ConfigField>


                <ConfigField icon={UserIcon} label={terms.Singular}>
                  <Input className="h-9" value={effectivePersonName} readOnly />
                </ConfigField>
                <ConfigField icon={ClipboardList} label="Service type">
                  <Select value={serviceType} onValueChange={setServiceType}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{SERVICE_TYPES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </ConfigField>
                <ConfigField icon={FileText} label="Template">
                  <Input className="h-9" value={template?.name ?? ""} readOnly />
                </ConfigField>
                <ConfigField icon={Wand2} label="Draft method">
                  <Select value={draftMethod} onValueChange={(v) => setDraftMethod(v as DraftMethod)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="voice">Voice + assistant</SelectItem>
                      <SelectItem value="text">Text + assistant</SelectItem>
                      <SelectItem value="guided">Guided (manual)</SelectItem>
                      <SelectItem value="blank">Blank template</SelectItem>
                    </SelectContent>
                  </Select>
                </ConfigField>
                <ConfigField icon={Languages} label="Capture language">
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="pl">Polish</SelectItem>
                      <SelectItem value="ro">Romanian</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                    </SelectContent>
                  </Select>
                </ConfigField>
              </div>
            </CardContent>
          </Card>

          {/* Assistant + guidance rail */}
          <div className="bg-card rounded-2xl shadow-sm border overflow-hidden">
            <div className="px-5 py-3 border-b flex items-center justify-between gap-3 bg-secondary/20">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">LogUp Care Plan Assistant</p>
                  <p className="text-[10px] text-muted-foreground">Guides you through the information needed to draft a care plan.</p>
                </div>
              </div>
              {hasUserSent && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {capturedCount}/{guidance.length} areas captured
                </span>
              )}
            </div>

            <div className="grid lg:grid-cols-[7fr_3fr] items-stretch">
              {/* LEFT — chat + input */}
              <div className="flex flex-col lg:border-r">
                <div ref={scrollerRef} className="px-5 py-4 max-h-[460px] min-h-[280px] overflow-y-auto space-y-3">
                  {messages.map((m) => (
                    <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
                      {m.role === "bot" && (
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                        </div>
                      )}
                      <div className={`max-w-[80%]`}>
                        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          m.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-secondary/60 text-foreground rounded-bl-sm"
                        }`}>
                          {m.role === "user" && m.voice && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold opacity-80 mr-1.5">
                              <Mic className="h-3 w-3" /> Voice
                            </span>
                          )}
                          {m.text}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 px-1">{m.ts}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Readiness + generate */}
                {hasUserSent && (
                  <div className="px-5 py-3 border-t bg-primary/5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-xs font-semibold">Draft readiness</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {capturedCount} of {totalRequired} required areas captured · {reviewCount} need more detail · {missingRequired} missing
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!readyEnough && !generated && (
                          <Button size="sm" variant="outline" onClick={runGeneration} disabled={generating}>
                            Generate anyway (may be incomplete)
                          </Button>
                        )}
                        {(readyEnough || generated) && (
                          <Button size="sm" onClick={runGeneration} disabled={generating}>
                            <Sparkles className="h-3.5 w-3.5 mr-1" />
                            {generating ? "Generating…" : generated ? "Regenerate all" : "Generate structured care plan draft"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Input bar */}
                <div className="px-3 py-3 border-t bg-secondary/10 mt-auto">
                  {recording ? (
                    <div className="flex items-center gap-3 px-3">
                      <div className="relative">
                        <span className="absolute inset-0 rounded-full bg-destructive/30 animate-ping" />
                        <div className="relative h-9 w-9 rounded-full bg-destructive flex items-center justify-center">
                          <Mic className="h-4 w-4 text-destructive-foreground" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">Recording…</p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                          {String(Math.floor(elapsed/60)).padStart(2,"0")}:{String(elapsed%60).padStart(2,"0")}
                        </p>
                      </div>
                      <Button onClick={stopRec} size="sm" variant="destructive"><Square className="h-4 w-4 mr-1" /> Stop</Button>
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={startRec}
                        className="h-10 w-10 rounded-xl bg-background border hover:bg-secondary/40 flex items-center justify-center shrink-0 transition-colors"
                        aria-label="Record voice"
                      >
                        <Mic className="h-4 w-4" />
                      </button>
                      <textarea
                        id="careplan-input"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                        }}
                        placeholder="Tell LogUp about the person's needs, preferences, risks, routines, supports, and goals…"
                        rows={1}
                        className="flex-1 min-h-[40px] max-h-[140px] resize-none rounded-xl bg-background border px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <Button onClick={handleSend} disabled={!draft.trim()} size="icon" className="h-10 w-10 rounded-xl shrink-0" aria-label="Send">
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2 px-2">
                    Demo: voice transcription is simulated. AI draft only — human review required before approval.
                  </p>
                </div>
              </div>

              {/* RIGHT — guidance checklist */}
              <aside className="bg-secondary/10 px-4 py-4 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <ListChecks className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">Care plan information LogUp may prompt for</p>
                    <p className="text-[10px] text-muted-foreground">
                      {template?.name ?? SERVICE_TYPES.find((s) => s.id === serviceType)?.label}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                  {hasUserSent
                    ? `${capturedCount}/${guidance.length} areas captured. LogUp updates this as you talk.`
                    : "As you talk or type, LogUp will mark these off automatically and ask for anything missing."}
                </p>
                <ul className="space-y-1">
                  {guidance.map((item) => {
                    const s = statuses[item.id];
                    const meta = STATUS_META[s] ?? STATUS_META.pending;
                    return (
                      <li key={item.id} className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 ${meta.bg} border border-transparent`}>
                        <span className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${meta.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs font-medium leading-snug ${s === "pending" || s === "missing" ? "text-muted-foreground" : "text-foreground"}`}>
                              {item.label}{item.required && <span className="text-destructive/70 ml-0.5">*</span>}
                            </p>
                            {hasUserSent && <span className={`text-[10px] font-medium ${meta.text} shrink-0`}>{meta.label}</span>}
                          </div>
                          {hasUserSent && (s === "missing" || s === "review") && (
                            <button
                              onClick={() => askAssistantAbout(item.label)}
                              className="mt-1 text-[10px] text-primary hover:underline"
                            >
                              Ask assistant to prompt →
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-auto pt-4 text-[10px] text-muted-foreground leading-relaxed">
                  AI drafts and highlights gaps. A human reviews and approves before publication.
                </p>
              </aside>
            </div>
          </div>

          {/* Structured draft output */}
          {generated && (
            <>
              <Alert className="bg-primary/5 border-primary/20">
                <Sparkles className="h-4 w-4 text-primary" />
                <AlertTitle>AI draft only. Human review required before approval.</AlertTitle>
                <AlertDescription className="text-xs">
                  Review each section below. You can edit, regenerate, or mark it as needing more information.
                </AlertDescription>
              </Alert>

              {generated.missing.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-warning" /> Missing or incomplete information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {generated.missing.map((m, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-xs">
                        <span className="text-foreground">{m}</span>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => askAssistantAbout(m)}>Ask assistant</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => toast.info("Marked not applicable")}>Not applicable</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => toast.success("Marked confirmed")}>Confirmed</Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <div className="space-y-3">
                {generated.sections.map((sec) => (
                  <SectionCard
                    key={sec.key}
                    section={sec}
                    onChange={(b) => updateSection(sec.key as SectionKey, b)}
                    onRegenerate={() => regenerateSection(sec.key as SectionKey)}
                    onNeedsInfo={() => markSectionNeedsInfo(sec.key as SectionKey)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 5 — review + submit */}
      {step === 5 && (
        <Card>
          <CardHeader><CardTitle>Review and submit</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 text-sm">
              <SummaryRow label={terms.Singular} value={effectivePersonName || "—"} />
              <SummaryRow label="Site / unit" value={`${effectiveSite}${effectiveUnit ? ` · ${effectiveUnit}` : ""}`} />
              <SummaryRow label="Template" value={template?.name ?? "—"} />
              <SummaryRow label="Approval chain" value={chainForScope?.name ?? "⚠ None configured"} />
              <SummaryRow label="Draft method" value={draftMethod === "voice" ? "Voice + assistant" : draftMethod === "text" ? "Text + assistant" : draftMethod === "guided" ? "Guided form" : "Blank template"} />
              <SummaryRow label="Sections drafted" value={String(generated?.sections.length ?? 0)} />
            </div>

            {chainForScope && (
              <div className="rounded-lg border p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Approval chain that will apply</div>
                <ul className="space-y-1.5 text-xs">
                  {chainForScope.levels.map((l) => (
                    <li key={l.id} className="flex gap-2">
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">L{l.levelNumber}</Badge>
                      <div>
                        <div className="font-medium text-foreground">{l.levelName}</div>
                        <div className="text-muted-foreground">{l.approvers.map((a) => a.name).join(", ")}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {generated && generated.missing.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Outstanding missing information</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 mt-1 text-xs space-y-0.5">
                    {generated.missing.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border p-4 bg-primary/5 border-primary/20">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox checked={humanReviewed} onCheckedChange={(v) => setHumanReviewed(!!v)} className="mt-0.5" />
                <div>
                  <div className="text-sm font-medium">I confirm this AI draft has been reviewed by a human before submission.</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Required to submit for approval. AI never approves or publishes a care plan.
                  </div>
                </div>
              </label>
            </div>

            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Human approval required</AlertTitle>
              <AlertDescription className="text-xs">
                Submitting attaches the correct approval chain and creates <b>Care Plan v1 Draft</b>. The care plan
                cannot be published until every level of the approval chain is completed by a permitted human approver.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => commit(false)} disabled={!canCommit}>Save as draft</Button>
              <Button onClick={() => commit(true)} disabled={!canCommit || !chainForScope || !humanReviewed}>
                <ShieldCheck className="h-4 w-4 mr-1" /> Submit for approval
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button
          onClick={() => setStep(Math.min(5, step + 1))}
          disabled={
            (step === 1 && !step1Valid) ||
            (step === 2 && !step2Valid) ||
            (step === 3 && !step3Valid) ||
            (step === 4 && !step4Valid) ||
            step === 5
          }
        >
          Next <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

const STATUS_META: Record<CaptureStatus, { label: string; dot: string; text: string; bg: string }> = {
  pending:  { label: "Not started",       dot: "bg-muted-foreground/30", text: "text-muted-foreground", bg: "bg-transparent" },
  captured: { label: "Captured",          dot: "bg-success",             text: "text-success",          bg: "bg-success/10" },
  review:   { label: "Needs more detail", dot: "bg-warning",             text: "text-warning",          bg: "bg-warning/10" },
  missing:  { label: "Missing",           dot: "bg-destructive",         text: "text-destructive",      bg: "bg-destructive/10" },
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ConfigField({ icon: Icon, label, children }: { icon: typeof Building2; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3 w-3" /> {label}
      </label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}

function SectionCard({ section, onChange, onRegenerate, onNeedsInfo }: {
  section: CarePlanSection;
  onChange: (b: string) => void;
  onRegenerate: () => void;
  onNeedsInfo: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [accepted, setAccepted] = useState(false);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {SECTION_LABELS[section.key]}
          {accepted
            ? <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px]"><CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Accepted</Badge>
            : section.humanEdited
              ? <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">Human edited</Badge>
              : <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]"><Sparkles className="h-2.5 w-2.5 mr-1" /> AI draft</Badge>}
          <span className="text-[10px] text-muted-foreground font-normal">source: assistant conversation</span>
        </CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onRegenerate}><RefreshCcw className="h-3.5 w-3.5 mr-1" /> Regenerate</Button>
          <Button size="sm" variant="ghost" onClick={onNeedsInfo}><AlertCircle className="h-3.5 w-3.5 mr-1" /> Needs info</Button>
          <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Edit"}</Button>
          {!accepted && <Button size="sm" onClick={() => setAccepted(true)}><Check className="h-3.5 w-3.5 mr-1" /> Accept</Button>}
        </div>
      </CardHeader>
      <CardContent>
        {editing
          ? <Textarea value={section.body} onChange={(e) => onChange(e.target.value)} rows={4} />
          : <p className="text-sm text-foreground/90 whitespace-pre-wrap">{section.body || <span className="text-muted-foreground italic">Empty section.</span>}</p>}
      </CardContent>
    </Card>
  );
}
