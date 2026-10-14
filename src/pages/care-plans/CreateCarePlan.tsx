import { sitesStore } from "@/lib/sitesStore";
import { useTerms } from "@/hooks/useTerms";
import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Mic, Send, Square, Building2, Home, User as UserIcon,
  ClipboardList, FileText, ShieldCheck, AlertTriangle, Languages, HeartPulse,
  ListChecks, CheckCircle2, Paperclip, Upload, StickyNote, Users, Pill,
  ClipboardCheck, ArrowRight, MessageCircle, PenLine, XCircle, RefreshCw,
  Sparkles, Info, Ban, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useCarePlans, carePlansStore, generateAiDraftSections, DEMO_VOICE_TRANSCRIPT,
  SECTION_ORDER, SECTION_LABELS, templateSectionOrder, type CarePlanSection, type SectionKey,
} from "@/lib/carePlansStore";
import {
  useCarePlanApprovalChains, findChainForPerson,
} from "@/lib/carePlanApprovalChainsStore";
import { useRole } from "@/hooks/useRole";
import { ALL_SITES, scopedSites, isFrontline } from "@/lib/roleStore";

// ---------- static config ----------
type CreationType = "new_person" | "existing_person" | "new_version";
type BaseStatus = "pending" | "captured" | "review" | "missing";
type CaptureStatus = BaseStatus | "confirmed" | "not_applicable";
type RiskLevel = "low" | "medium" | "high" | "critical";

const SERVICE_TYPES = [
  { id: "nursing_home", label: "Older Persons / Nursing Home",         template: "TPL-NH",   templateLabel: "Older Persons / Nursing Home Plan" },
  { id: "disability",   label: "Disability / Intellectual Disability", template: "TPL-DIS",  templateLabel: "Disability / Personal Plan" },
  { id: "home_support", label: "Home Support",                         template: "TPL-HS",   templateLabel: "Home Support Plan" },
  { id: "childrens",    label: "Children's Residential",               template: "TPL-CR",   templateLabel: "Children's Residential Placement Plan" },
  { id: "core",         label: "Regulated Care Core",                  template: "TPL-CORE", templateLabel: "Regulated Care Core Plan" },
];

// Units/wings are intentionally not shown in the current demo (site-only geography).
const UNITS_BY_SITE: Record<string, string[]> = {};

interface GuidanceItem {
  id: string;
  label: string;
  required: boolean;
  keywords: string[];
  /** If captured but the corpus does not include any of these, flag as needs-more-detail */
  needsForDetail?: { any: string[]; reason: string };
  sectionKey?: SectionKey;
}

const GUIDANCE_BY_SERVICE: Record<string, GuidanceItem[]> = {
  nursing_home: [
    { id: "person",        label: "Person details and preferred name",    required: true,  keywords: ["prefer","called","known as","paddy","name is","years old","age"], sectionKey: "about" },
    { id: "matters",       label: "What matters to the person",           required: true,  keywords: ["enjoy","like","matters","important","hobby","faith","music","garden"], sectionKey: "about" },
    { id: "communication", label: "Communication needs",                  required: true,  keywords: ["glass","hearing","language","speaks","irish","verbal","sign","aid"], sectionKey: "communication" },
    { id: "personalCare",  label: "Personal care support",                required: true,  keywords: ["shower","bath","dress","toilet","continence","washing","morning routine"], sectionKey: "personalCare" },
    { id: "mobility",      label: "Mobility and falls risk",              required: true,  keywords: ["walk","frame","zimmer","wheelchair","stick","steady","fall","transfer"],
      needsForDetail: { any: ["assessment","fra","risk assessment","falls risk assessment"], reason: "Falls risk assessment should be completed or referenced" },
      sectionKey: "mobility" },
    { id: "nutrition",     label: "Nutrition and hydration",              required: true,  keywords: ["diet","eat","food","meal","swallow","thicken","fluid","hydrat","drink"],
      needsForDetail: { any: ["fluid","hydrat","drink","thicken"], reason: "Hydration detail should be confirmed" },
      sectionKey: "nutrition" },
    { id: "medication",    label: "Medication support",                   required: true,  keywords: ["medic","tablet","prescri","mar","insulin","warfarin","vitamin","nursing staff"],
      needsForDetail: { any: ["mar","verified","reconciled","chart"], reason: "Medication list should be verified against MAR" },
      sectionKey: "medication" },
    { id: "health",        label: "Health conditions",                    required: true,  keywords: ["hypertens","diabet","dementia","cardiac","copd","arthritis","condition","bp","blood pressure"], sectionKey: "health" },
    { id: "safeguarding",  label: "Safeguarding considerations",          required: true,  keywords: ["safeguard","abuse","concern","protection","no concerns","no active"], sectionKey: "safeguarding" },
    { id: "risks",         label: "Risks and controls",                   required: true,  keywords: ["risk","control","hazard","bed rail","call bell","restraint","supervis"], sectionKey: "risksControls" },
    { id: "goals",         label: "Goals and outcomes",                   required: true,  keywords: ["goal","wants to","hopes","outcome","keep attending","maintain"], sectionKey: "goals" },
    { id: "family",        label: "Family / advocate involvement",        required: true,  keywords: ["daughter","son","wife","husband","spouse","advocate","next of kin","family","margaret"], sectionKey: "family" },
    { id: "review",        label: "Review date and responsible reviewer", required: true,  keywords: ["review","pic","sign off","responsible","reviewer"], sectionKey: "reviewNotes" },
  ],
  disability: [
    { id: "matters",       label: "What matters to the person",           required: true, keywords: ["matters","important","enjoy","hobby","friend"], sectionKey: "about" },
    { id: "communication", label: "Communication and accessible information", required: true, keywords: ["sign","picture","aac","easy read","verbal","language"], sectionKey: "communication" },
    { id: "decisions",     label: "Decision-making supports",             required: true, keywords: ["decision","consent","capacity","advocate","supported"] },
    { id: "rights",        label: "Rights and advocacy",                  required: true, keywords: ["rights","advocacy","advocate","choice"] },
    { id: "goals",         label: "Personal goals",                       required: true, keywords: ["goal","wants to","hopes","outcome"], sectionKey: "goals" },
    { id: "community",     label: "Community participation",              required: true, keywords: ["community","club","attend","outing","activity"] },
    { id: "health",        label: "Health support",                       required: true, keywords: ["health","gp","medic","condition"], sectionKey: "health" },
    { id: "personalCare",  label: "Intimate / personal care",             required: true, keywords: ["personal care","intimate","shower","toilet","continence"], sectionKey: "personalCare" },
    { id: "safeguarding",  label: "Safeguarding",                         required: true, keywords: ["safeguard","concern","protection"], sectionKey: "safeguarding" },
    { id: "family",        label: "Family / advocate involvement",        required: true, keywords: ["family","advocate","parent","sibling"], sectionKey: "family" },
    { id: "review",        label: "Review arrangements",                  required: true, keywords: ["review","sign off","key worker"], sectionKey: "reviewNotes" },
  ],
  home_support: [
    { id: "home",          label: "Home environment",                     required: true, keywords: ["home","house","apartment","stairs","kitchen"] },
    { id: "schedule",      label: "Visit schedule",                       required: true, keywords: ["visit","morning","evening","schedule","daily","weekly"] },
    { id: "personalCare",  label: "Personal care tasks",                  required: true, keywords: ["shower","bath","dress","toilet","personal care"], sectionKey: "personalCare" },
    { id: "medication",    label: "Medication prompting / support",       required: true, keywords: ["medic","tablet","prompt","prescri"], sectionKey: "medication" },
    { id: "mobility",      label: "Mobility / transfers",                 required: true, keywords: ["walk","transfer","frame","wheelchair","hoist"], sectionKey: "mobility" },
    { id: "family",        label: "Family / informal carer role",         required: true, keywords: ["family","carer","daughter","son","spouse"], sectionKey: "family" },
    { id: "emergency",     label: "Emergency contacts",                   required: true, keywords: ["emergency","next of kin","contact number"] },
    { id: "risks",         label: "Risks in the home",                    required: true, keywords: ["risk","hazard","trip","pet"], sectionKey: "risksControls" },
  ],
  childrens: [
    { id: "placement",     label: "Placement context",                    required: true, keywords: ["placement","admitted","referred","tusla"] },
    { id: "voice",         label: "Voice of the child",                   required: true, keywords: ["says","wants","prefers","voice","wishes","feels"], sectionKey: "about" },
    { id: "aims",          label: "Placement aims",                       required: true, keywords: ["aim","goal","reunif","long term"], sectionKey: "goals" },
    { id: "family",        label: "Family / access arrangements",         required: true, keywords: ["family","access","contact","visit","mother","father"], sectionKey: "family" },
    { id: "education",     label: "Education",                            required: true, keywords: ["school","education","study","college"] },
    { id: "health",        label: "Health and wellbeing",                 required: true, keywords: ["health","gp","medic","dental","sight"], sectionKey: "health" },
    { id: "safeguarding",  label: "Safeguarding",                         required: true, keywords: ["safeguard","protection","concern"], sectionKey: "safeguarding" },
  ],
  core: [],
};

function getGuidance(serviceType: string): GuidanceItem[] {
  return GUIDANCE_BY_SERVICE[serviceType]?.length ? GUIDANCE_BY_SERVICE[serviceType] : GUIDANCE_BY_SERVICE.nursing_home;
}

function autoStatuses(items: GuidanceItem[], corpus: string): Record<string, BaseStatus> {
  const t = corpus.toLowerCase();
  const out: Record<string, BaseStatus> = {};
  for (const it of items) {
    const hit = it.keywords.some((k) => t.includes(k));
    if (!hit) { out[it.id] = it.required ? "missing" : "pending"; continue; }
    if (it.needsForDetail) {
      const ok = it.needsForDetail.any.some((k) => t.includes(k));
      out[it.id] = ok ? "captured" : "review";
    } else {
      out[it.id] = "captured";
    }
  }
  return out;
}

function mergeStatuses(
  auto: Record<string, BaseStatus>,
  overrides: Record<string, "confirmed" | "not_applicable" | undefined>,
): Record<string, CaptureStatus> {
  const out: Record<string, CaptureStatus> = {};
  for (const k of Object.keys(auto)) {
    const o = overrides[k];
    out[k] = o ?? auto[k];
  }
  return out;
}

// ---------- chat ----------
type ChatMsg =
  | { id: string; role: "bot"; text: string; ts: string }
  | { id: string; role: "user"; text: string; voice?: boolean; ts: string; itemId?: string };

const stamp = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const STATUS_META: Record<CaptureStatus, { label: string; dot: string; text: string; bg: string; ring: string }> = {
  pending:        { label: "Not started",       dot: "bg-muted-foreground/30", text: "text-muted-foreground", bg: "bg-transparent",       ring: "border-transparent" },
  captured:       { label: "Captured",          dot: "bg-success",             text: "text-success",          bg: "bg-success/10",        ring: "border-success/20" },
  review:         { label: "Needs more detail", dot: "bg-warning",             text: "text-warning",          bg: "bg-warning/10",        ring: "border-warning/20" },
  missing:        { label: "Missing",           dot: "bg-destructive",         text: "text-destructive",      bg: "bg-destructive/10",    ring: "border-destructive/20" },
  confirmed:      { label: "Confirmed",         dot: "bg-primary",             text: "text-primary",          bg: "bg-primary/10",        ring: "border-primary/20" },
  not_applicable: { label: "Not applicable",    dot: "bg-muted-foreground/40", text: "text-muted-foreground", bg: "bg-secondary/40",      ring: "border-border" },
};

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

// ---------- page ----------
export default function CreateCarePlan() {
  const terms = useTerms();
  const navigate = useNavigate();
  const role = useRole();
  const { people, plans } = useCarePlans();
  const { chains } = useCarePlanApprovalChains();

  const availableSites = useMemo(() => scopedSites(role.role, role.scope), [role.role, role.scope]);

  // Criteria
  const [planType, setPlanType]                     = useState<CreationType>("new_person");
  const [site, setSite]                             = useState<string>(availableSites[0] ?? ALL_SITES[0]);
  const [unit, setUnit]                             = useState<string>("");
  const [existingPersonId, setExistingPersonId]     = useState<string>("");
  const [newPersonName, setNewPersonName]           = useState<string>("");
  const [newPersonPreferred, setNewPersonPreferred] = useState<string>("");
  const [newPersonDob, setNewPersonDob]             = useState<string>("");
  const [newPersonAdmission, setNewPersonAdmission] = useState<string>("");
  const [newPersonFamily, setNewPersonFamily]       = useState<string>("");
  const [newPersonKeyWorker, setNewPersonKeyWorker] = useState<string>("");
  const [newPersonId] = useState<string>(() => `PS-${Math.floor(100 + Math.random() * 900)}`);
  const [serviceType, setServiceType]               = useState<string>("nursing_home");
  const [riskLevel, setRiskLevel]                   = useState<RiskLevel>("medium");
  const [language, setLanguage]                     = useState<string>("auto");
  const [attemptedFormat, setAttemptedFormat]      = useState<boolean>(false);

  const templateMeta = SERVICE_TYPES.find((s) => s.id === serviceType)!;
  const templateId = templateMeta.template;
  // Default section order comes from the template's published version.
  const templateOrder: CarePlanSection[] = (() => {
    const secs = templateSectionOrder(templateId);
    return secs.length
      ? secs.map((t) => ({ key: t.sectionKey, body: "", ...(t.sectionKey.startsWith("custom_") ? { label: t.displayName, isCustom: true } : {}) }))
      : SECTION_ORDER.map((k) => ({ key: k, body: "" }));
  })();

  const existingPerson = people.find((p) => p.id === existingPersonId);
  const scopedPeople = people.filter((p) => availableSites.includes(p.site));
  const existingPlan = existingPerson ? plans.find((pl) => pl.personId === existingPerson.id) : undefined;
  const existingHasApprovedPlan = !!(
    existingPlan &&
    existingPlan.versions.find((v) => v.id === existingPlan.currentVersionId && v.status === "published")
  );
  const blockedByExistingPlan = planType === "existing_person" && !!existingPerson && existingHasApprovedPlan;

  const effectivePersonName =
    planType === "existing_person" ? (existingPerson?.name ?? "")
    : planType === "new_version" ? (existingPerson?.name ?? "")
    : newPersonName;
  const effectivePreferred = planType === "new_person" ? (newPersonPreferred || newPersonName) : (existingPerson?.name ?? "");
  const effectiveSite = planType !== "new_person" ? (existingPerson?.site ?? site) : site;
  const effectiveUnit = planType !== "new_person" ? (existingPerson?.unit ?? unit) : unit;

  // A site's centre type decides which template the new plan uses.
  const siteCentreType = sitesStore.all().find((x) => x.name === effectiveSite)?.centreType;
  useEffect(() => {
    if (!siteCentreType) return;
    const map: Record<string, string> = { older_persons: "nursing_home", disability: "disability", home_support: "home_support", childrens_residential: "childrens", supported_living: "core" };
    if (map[siteCentreType]) setServiceType(map[siteCentreType]);
  }, [siteCentreType]);

  const chainForScope = useMemo(
    () => findChainForPerson(chains, { site: effectiveSite, unit: effectiveUnit || undefined }),
    [chains, effectiveSite, effectiveUnit],
  );

  const newPersonFieldsOk =
    planType !== "new_person" ||
    (!!newPersonName.trim() && !!newPersonDob && !!newPersonAdmission &&
     !!newPersonFamily.trim() && !!newPersonKeyWorker.trim() && !!site);

  const anchorsOk =
    !!site && !!serviceType && !!templateId && newPersonFieldsOk &&
    (planType === "new_person" ? !!newPersonName.trim() : !!existingPersonId) &&
    !blockedByExistingPlan;


  // Assistant state
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [overrides, setOverrides] = useState<Record<string, "confirmed" | "not_applicable" | undefined>>({});
  const [addingDetailFor, setAddingDetailFor] = useState<string | null>(null);
  const [detailText, setDetailText] = useState("");
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset assistant state when the person/service changes materially
  useEffect(() => {
    setMessages([]); setOverrides({}); setSections(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePersonName, serviceType, effectiveSite]);

  const corpus = useMemo(
    () => messages.filter((m) => m.role === "user").map((m) => m.text).join("\n"),
    [messages],
  );
  const hasUserSent = messages.some((m) => m.role === "user");

  const guidance = useMemo(() => getGuidance(serviceType), [serviceType]);
  const auto = useMemo(() => autoStatuses(guidance, corpus), [guidance, corpus]);
  const statuses = useMemo(() => mergeStatuses(auto, overrides), [auto, overrides]);

  // Display statuses hold back amber/red until the user attempts to format the draft.
  const displayStatuses = useMemo<Record<string, CaptureStatus>>(() => {
    if (attemptedFormat) return statuses;
    const out: Record<string, CaptureStatus> = {};
    for (const k of Object.keys(statuses)) {
      const s = statuses[k];
      out[k] = (s === "missing" || s === "review") ? "pending" : s;
    }
    return out;
  }, [statuses, attemptedFormat]);

  const capturedCount = guidance.filter((g) => statuses[g.id] === "captured" || statuses[g.id] === "confirmed").length;
  const reviewCount   = guidance.filter((g) => statuses[g.id] === "review").length;
  const missingCount  = guidance.filter((g) => g.required && statuses[g.id] === "missing").length;
  const totalRequired = guidance.filter((g) => g.required).length;
  const readyEnough   = hasUserSent && missingCount === 0;


  // Auto-scroll
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages]);

  // Greet once required fields are complete
  useEffect(() => {
    if (anchorsOk && messages.length === 0) {
      const who = effectivePreferred || effectivePersonName || `this ${terms.singular}`;
      setMessages([{
        id: "b-init",
        role: "bot",
        text: `Tell LogUp about ${who} in your own words. I'll capture their needs, preferences, risks, routines, supports, goals and review information. I'll ask for anything still missing before formatting the care plan.`,
        ts: stamp(),
      }]);
    }
  }, [anchorsOk, effectivePersonName, effectivePreferred, messages.length]);

  // Voice mock
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
    const followUp = `He wears glasses and a hearing aid in his right ear. He prefers showers in the morning. Normal diet and thin fluids. Nursing staff support his medication. No active safeguarding concerns. He wants to keep attending music sessions and walking to the garden.`;
    const text = hasUserSent ? followUp : DEMO_VOICE_TRANSCRIPT;
    pushUser(text, true);
    toast.success("Voice note transcribed (demo)");
  };

  const pushUser = (text: string, voice = false, itemId?: string) => {
    const um: ChatMsg = { id: `u-${Date.now()}`, role: "user", text, voice, ts: stamp(), itemId };
    const next = [...messages, um];
    setMessages(next);

    const nextCorpus = next.filter((m) => m.role === "user").map((m) => m.text).join("\n");
    const nextAuto = autoStatuses(guidance, nextCorpus);
    const prevMerged = mergeStatuses(auto, overrides);
    const nextMerged = mergeStatuses(nextAuto, overrides);

    const justCaptured = guidance.filter((g) => nextMerged[g.id] === "captured" && prevMerged[g.id] !== "captured").map((g) => g.label);
    const needDetail   = guidance.filter((g) => nextMerged[g.id] === "review").map((g) => ({ label: g.label, reason: g.needsForDetail?.reason }));
    const stillMissing = guidance.filter((g) => g.required && nextMerged[g.id] === "missing").map((g) => g.label);

    let botText = justCaptured.length
      ? `I've captured ${justCaptured.slice(0, 4).join(", ")}${justCaptured.length > 4 ? "…" : ""}. `
      : `Thanks. `;

    if (needDetail.length) {
      const first = needDetail[0];
      botText += `${first.reason ? first.reason + ". " : ""}`;
    }

    if (stillMissing.length === 0 && needDetail.length === 0) {
      botText += `I have enough to draft the care plan — use "Format as care plan draft" below when you're ready. AI never publishes on its own.`;
    } else if (stillMissing.length === 0) {
      botText += `I can format the draft now, but ${needDetail.length} area${needDetail.length === 1 ? "" : "s"} still need${needDetail.length === 1 ? "s" : ""} more detail.`;
    } else if (stillMissing.length <= 3) {
      botText += `I still need detail on: ${stillMissing.join(", ")}. Can you tell me about those?`;
    } else {
      botText += `Can you tell me about ${stillMissing.slice(0, 3).join(", ")} and ${stillMissing.length - 3} other area${stillMissing.length - 3 === 1 ? "" : "s"}?`;
    }

    setTimeout(() => setMessages((m) => [...m, { id: `b-${Date.now()}`, role: "bot", text: botText, ts: stamp() }]), 250);
  };

  const handleSend = () => {
    if (!draft.trim()) return;
    pushUser(draft.trim(), false);
    setDraft("");
    inputRef.current?.focus();
  };

  // Missing-info per-item actions
  const askAssistant = (item: GuidanceItem) => {
    const q = `Can you tell me more about ${item.label.toLowerCase()} for ${effectivePreferred || effectivePersonName || "this person"}?`;
    setMessages((m) => [...m, { id: `b-ask-${Date.now()}`, role: "bot", text: q, ts: stamp() }]);
  };
  const beginAddDetail = (itemId: string) => { setAddingDetailFor(itemId); setDetailText(""); };
  const cancelAddDetail = () => { setAddingDetailFor(null); setDetailText(""); };
  const submitAddDetail = (item: GuidanceItem) => {
    if (!detailText.trim()) return;
    pushUser(`${item.label}: ${detailText.trim()}`, false, item.id);
    setAddingDetailFor(null); setDetailText("");
  };
  const markNA = (itemId: string) => {
    setOverrides((o) => ({ ...o, [itemId]: "not_applicable" }));
    toast.message("Marked as not applicable", { description: "Reviewer will see this decision." });
  };
  const markConfirmed = (itemId: string) => {
    setOverrides((o) => ({ ...o, [itemId]: "confirmed" }));
  };
  const clearOverride = (itemId: string) => {
    setOverrides((o) => { const n = { ...o }; delete n[itemId]; return n; });
  };

  // Formatted sections
  const [sections, setSections] = useState<CarePlanSection[] | null>(null);
  const [sectionMeta, setSectionMeta] = useState<Record<string, { accepted?: boolean; needsInfo?: boolean; source: "voice" | "typed" | "assistant" }>>({});

  const inferSource = (): "voice" | "typed" | "assistant" => {
    const userMsgs = messages.filter((m) => m.role === "user");
    const voice = userMsgs.some((m) => m.role === "user" && m.voice);
    const followUp = userMsgs.some((m) => m.role === "user" && m.itemId);
    if (voice) return "voice";
    if (followUp) return "assistant";
    return "typed";
  };

  const doFormat = () => {
    setAttemptedFormat(true);
    if (!hasUserSent) { toast.error("Capture some information first"); return; }
    const { sections: gen } = generateAiDraftSections(corpus, effectivePreferred || effectivePersonName || "The person");
    const ordered: CarePlanSection[] = templateOrder.map((t) => gen.find((s) => s.key === t.key) ?? t);
    setSections(ordered);
    const src = inferSource();
    const meta: Record<string, { accepted?: boolean; needsInfo?: boolean; source: "voice" | "typed" | "assistant" }> = {};
    ordered.forEach((s) => { meta[s.key] = { source: src }; });
    setSectionMeta(meta);
    toast.success("AI draft formatted", { description: "Every section is editable and requires human review." });
    setTimeout(() => document.getElementById("care-plan-sections")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const editSectionBody = (key: SectionKey, body: string) => {
    setSections((s) => s ? s.map((x) => x.key === key ? { ...x, body, humanEdited: true } : x) : s);
    setSectionMeta((m) => ({ ...m, [key]: { ...(m[key] ?? { source: "typed" }), needsInfo: false } }));
  };
  const acceptSection = (key: SectionKey) => setSectionMeta((m) => ({ ...m, [key]: { ...(m[key] ?? { source: "typed" }), accepted: true, needsInfo: false } }));
  const flagSectionNeedsInfo = (key: SectionKey) => setSectionMeta((m) => ({ ...m, [key]: { ...(m[key] ?? { source: "typed" }), needsInfo: true, accepted: false } }));
  const regenerateSection = (key: SectionKey) => {
    const { sections: gen } = generateAiDraftSections(corpus, effectivePreferred || effectivePersonName || "The person");
    const fresh = gen.find((s) => s.key === key);
    if (!fresh) { toast.message("No additional detail to regenerate from"); return; }
    setSections((s) => s ? s.map((x) => x.key === key ? { key, body: fresh.body, humanEdited: false } : x) : s);
    setSectionMeta((m) => ({ ...m, [key]: { ...(m[key] ?? { source: "typed" }), accepted: false } }));
    toast.success(`${SECTION_LABELS[key]} regenerated`);
  };

  // Supporting information (mock)
  type Support = { id: string; kind: string; label: string };
  const [support, setSupport] = useState<Support[]>([]);
  const addSupport = (kind: string, label: string) => {
    setSupport((s) => [...s, { id: `sup-${Date.now()}`, kind, label }]);
    toast.success(`${kind} added`);
  };

  // Submit
  const [humanReviewed, setHumanReviewed] = useState(false);
  const acceptedCount = sections ? sections.filter((s) => sectionMeta[s.key]?.accepted).length : 0;
  const canSubmitForApproval =
    anchorsOk && hasUserSent && !!chainForScope && !isFrontline(role.role) && !!sections && humanReviewed;

  const doSubmit = (markReady: boolean) => {
    if (!anchorsOk) { toast.error("Complete the required criteria to begin"); return; }
    if (markReady && !sections) { toast.error("Format the draft as a care plan first"); return; }
    if (markReady && !humanReviewed) { toast.error("Confirm the AI draft has been human-reviewed"); return; }

    const useSections: CarePlanSection[] = sections ?? templateOrder;

    let usePersonId = existingPersonId;
    if (planType === "new_person") {
      usePersonId = newPersonId;
      const storeRisk = riskLevel === "critical" ? "high" : riskLevel;
      const storeSetting: "nursing_home" | "disability" | "home_support" | "childrens_residential" =
        serviceType === "disability" ? "disability"
        : serviceType === "home_support" ? "home_support"
        : serviceType === "childrens" ? "childrens_residential"
        : "nursing_home";
      carePlansStore.addPersonSupported({
        id: newPersonId,
        name: newPersonName.trim(),
        site,
        unit: unit || undefined,
        riskLevel: storeRisk,
        tags: riskLevel === "critical" ? ["Critical risk"] : [],
        setting: storeSetting,
      });
    }

    const { version } = carePlansStore.createInitialCarePlan({
      personId: usePersonId,
      templateId,
      sections: useSections,
      createdBy: role.displayName,
      aiAssisted: true,
    });

    if (markReady) {
      carePlansStore.markReadyForApproval(usePersonId, version.id);
      toast.success("Submitted for approval", { description: missingCount + reviewCount ? `${missingCount + reviewCount} area(s) flagged for reviewer` : undefined });
    } else {
      toast.success("Draft saved");
    }
    navigate(`/app/care-plans/people/${usePersonId}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-20 space-y-4">
      {/* Hero */}
      <motion.div {...fade} transition={{ duration: 0.4 }}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <HeartPulse className="h-3.5 w-3.5 text-primary" /> Care Planning
        </div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Create a Plan</h1>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed max-w-2xl">
          Tell LogUp about the {terms.singular} in your own words. The assistant captures, structures and prompts for anything missing.
          AI drafts and suggests. Humans review, approve and publish.
        </p>
      </motion.div>

      {/* Stepper */}
      <Stepper
        current={
          !anchorsOk ? 1
          : !hasUserSent ? 2
          : !sections ? 3
          : !humanReviewed ? 4
          : 5
        }
      />


      {/* Mandatory criteria */}
      <motion.div {...fade} transition={{ delay: 0.06, duration: 0.4 }} className="bg-card rounded-2xl shadow-soft border border-border p-4">
        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <Field icon={ClipboardList} label="Plan type" required>
            <Select value={planType} onValueChange={(v) => setPlanType(v as CreationType)}>
              <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new_person">New plan for new {terms.singular}</SelectItem>
                <SelectItem value="existing_person">New plan for existing {terms.singular}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field icon={Building2} label="Site" required>
            <Select value={site} onValueChange={(v) => { setSite(v); setUnit(""); }} disabled={planType !== "new_person" && !!existingPerson}>
              <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>{availableSites.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>


          <Field icon={UserIcon} label={terms.Singular} required>
            {planType === "new_person" ? (
              <div className="grid grid-cols-2 gap-1.5">
                <Input className="h-10 rounded-xl bg-background" value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} placeholder="Full name" />
                <Input className="h-10 rounded-xl bg-background" value={newPersonPreferred} onChange={(e) => setNewPersonPreferred(e.target.value)} placeholder="Preferred" />
              </div>
            ) : (
              <Select value={existingPersonId} onValueChange={setExistingPersonId}>
                <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue placeholder="Choose person…" /></SelectTrigger>
                <SelectContent>
                  {scopedPeople.length === 0
                    ? <div className="px-2 py-1.5 text-xs text-muted-foreground">No {terms.plural} in scope</div>
                    : scopedPeople.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — {p.site}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field icon={ClipboardCheck} label="Service type" required>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>{SERVICE_TYPES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>

          <Field icon={FileText} label="Care plan template" required>
            <Input className="h-10 rounded-xl bg-background" value={templateMeta.templateLabel} readOnly />
          </Field>

          <Field icon={AlertTriangle} label="Initial risk level" required>
            <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as RiskLevel)}>
              <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field icon={Languages} label="Capture language">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="pl">Polish</SelectItem>
                <SelectItem value="ro">Romanian</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {planType === "new_person" && (
          <div className="mt-4 rounded-xl border border-border bg-background/60 p-3">
            <p className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5 text-primary" /> New {terms.singular} details
              <span className="text-[10px] font-normal text-muted-foreground">Required before the assistant starts.</span>
            </p>
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              <Field icon={UserIcon} label="Date of birth" required>
                <Input type="date" className="h-10 rounded-xl bg-background" value={newPersonDob} onChange={(e) => setNewPersonDob(e.target.value)} />
              </Field>
              <Field icon={ClipboardCheck} label="Start / admission date" required>
                <Input type="date" className="h-10 rounded-xl bg-background" value={newPersonAdmission} onChange={(e) => setNewPersonAdmission(e.target.value)} />
              </Field>
              <Field icon={Users} label="Family / advocate contact" required>
                <Input className="h-10 rounded-xl bg-background" value={newPersonFamily} onChange={(e) => setNewPersonFamily(e.target.value)} placeholder="Name & phone / email" />
              </Field>
              <Field icon={ShieldCheck} label="Key worker or responsible manager" required>
                <Input className="h-10 rounded-xl bg-background" value={newPersonKeyWorker} onChange={(e) => setNewPersonKeyWorker(e.target.value)} placeholder="Name & role" />
              </Field>
            </div>
          </div>
        )}


        {blockedByExistingPlan && (
          <Alert className="mt-4 border-warning/40 bg-warning/5">
            <Info className="h-4 w-4 text-warning" />
            <AlertTitle className="text-sm">This person already has an approved care plan</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              To update it, open their care plan and create a draft update. Create a Care Plan is for new care plans only.
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => existingPerson && navigate(`/app/care-plans/people/${existingPerson.id}`)}
                >
                  Open existing care plan
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Approval chain preview */}
        <div className="mt-4 rounded-xl border border-border bg-secondary/20 p-3 flex items-start gap-3">
          <ShieldCheck className={`h-4 w-4 mt-0.5 shrink-0 ${chainForScope ? "text-primary" : "text-warning"}`} />
          <div className="flex-1 text-xs">
            {chainForScope ? (
              <>
                <div className="font-medium text-foreground">Approval chain: {chainForScope.name}</div>
                <div className="text-muted-foreground mt-0.5">
                  {chainForScope.levels.length} level{chainForScope.levels.length === 1 ? "" : "s"} · {chainForScope.scopeLabel}
                </div>
              </>
            ) : (
              <>
                <div className="font-medium text-warning">No active care plan approval chain is configured for {effectiveSite}{effectiveUnit ? ` · ${effectiveUnit}` : ""}</div>
                <div className="text-muted-foreground mt-0.5">Admin must configure an approval chain before this care plan can be published.</div>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* Assistant */}
      <motion.div {...fade} transition={{ delay: 0.1, duration: 0.4 }} className="bg-card rounded-2xl shadow-soft border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 bg-secondary/20">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-heading font-semibold text-foreground leading-tight">LogUp Care Plan Assistant</p>
              <p className="text-[10px] text-muted-foreground">Captures by voice or text, prompts for missing info, then formats an editable draft.</p>
            </div>
          </div>
          {hasUserSent && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {capturedCount}/{guidance.length} captured
            </span>
          )}
        </div>

        <div className="grid lg:grid-cols-[7fr_3fr] items-stretch">
          {/* LEFT — chat + input */}
          <div className="flex flex-col lg:border-r border-border">
            <div ref={scrollerRef} className="px-5 py-4 max-h-[520px] min-h-[300px] overflow-y-auto space-y-3">
              {!anchorsOk && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center py-10 px-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Select the plan type, site, {terms.singular}, service type and template to begin.</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">LogUp will then guide capture and prompt for missing details.</p>
                </div>
              )}

              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
                    {m.role === "bot" && (
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                    <div className="max-w-[80%]">
                      <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary/60 text-foreground rounded-bl-sm"
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
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Draft readiness inline */}
              {hasUserSent && (
                <div className="mt-2 rounded-xl border border-border bg-secondary/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">Draft readiness</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{capturedCount} / {totalRequired} required areas captured</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.round((capturedCount / Math.max(1, totalRequired)) * 100))}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                    <Badge tone="success"     count={capturedCount} label="captured" />
                    <Badge tone="warning"     count={reviewCount}   label="need more detail" />
                    <Badge tone="destructive" count={missingCount}  label="missing" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {readyEnough ? (
                      <Button size="sm" onClick={doFormat} className="rounded-xl gap-1.5">
                        <FileText className="h-3.5 w-3.5" /> Format as care plan draft
                      </Button>
                    ) : missingCount === 0 ? (
                      <Button size="sm" onClick={doFormat} className="rounded-xl gap-1.5" variant="secondary">
                        <FileText className="h-3.5 w-3.5" /> Format as care plan draft anyway
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled className="rounded-xl">Continue capture</Button>
                    )}
                    {missingCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">This draft may be incomplete. Missing information must be reviewed before submission.</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="px-3 py-3 border-t border-border bg-secondary/10 mt-auto">
              {recording ? (
                <div className="flex items-center gap-3 px-3">
                  <div className="relative">
                    <span className="absolute inset-0 rounded-full bg-destructive/30 animate-ping" />
                    <div className="relative h-9 w-9 rounded-full bg-destructive flex items-center justify-center">
                      <Mic className="h-4 w-4 text-destructive-foreground" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Recording…</p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
                    </p>
                  </div>
                  <Button onClick={stopRec} size="sm" variant="destructive" className="rounded-xl">
                    <Square className="h-4 w-4 mr-1" /> Stop
                  </Button>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={startRec}
                    disabled={!anchorsOk}
                    className="h-10 w-10 rounded-xl bg-background border border-border text-foreground hover:bg-secondary/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shrink-0 transition-colors"
                    aria-label="Record voice"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    disabled={!anchorsOk}
                    placeholder={anchorsOk
                      ? "Tell LogUp about the person's needs, preferences, risks, routines, supports, goals, and family/advocate involvement…"
                      : "Complete required criteria above to start."}
                    rows={1}
                    className="flex-1 min-h-[40px] max-h-[140px] resize-none rounded-xl bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <Button onClick={handleSend} disabled={!anchorsOk || !draft.trim()} size="icon" className="h-10 w-10 rounded-xl shrink-0" aria-label="Send">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-2 px-2">
                AI draft only — a human must review and approve before publication. Voice transcription is simulated in this demo.
              </p>
            </div>
          </div>

          {/* RIGHT — guidance rail */}
          <aside className="bg-secondary/10 px-4 py-4 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                <ListChecks className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-heading font-semibold text-foreground leading-tight">Information LogUp may prompt for</p>
                <p className="text-[10px] text-muted-foreground">Updates live as you talk or type.</p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {guidance.map((item) => {
                const s = displayStatuses[item.id];
                const meta = STATUS_META[s];
                const isEditing = addingDetailFor === item.id;
                const showActions = hasUserSent && (s === "missing" || s === "review" || s === "captured" || s === "confirmed" || s === "not_applicable");
                return (
                  <li key={item.id} className={`rounded-lg px-2.5 py-2 border ${meta.bg} ${meta.ring}`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${meta.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-xs font-medium leading-snug ${s === "pending" || s === "missing" ? "text-muted-foreground" : "text-foreground"}`}>
                            {item.label}{item.required && <span className="text-destructive/70 ml-0.5">*</span>}
                          </p>
                          {hasUserSent && <span className={`text-[10px] font-medium ${meta.text} shrink-0`}>{meta.label}</span>}
                        </div>
                        {s === "review" && item.needsForDetail?.reason && (
                          <p className="text-[10px] text-warning/90 mt-1 leading-snug flex items-start gap-1">
                            <Info className="h-3 w-3 mt-px shrink-0" />{item.needsForDetail.reason}
                          </p>
                        )}

                        {showActions && !isEditing && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {(s === "missing" || s === "review") && (
                              <ItemBtn onClick={() => askAssistant(item)} icon={MessageCircle}>Ask assistant</ItemBtn>
                            )}
                            {s !== "not_applicable" && (
                              <ItemBtn onClick={() => beginAddDetail(item.id)} icon={PenLine}>Add detail</ItemBtn>
                            )}
                            {(s === "captured" || s === "review") && (
                              <ItemBtn onClick={() => markConfirmed(item.id)} icon={Check}>Confirmed</ItemBtn>
                            )}
                            {s !== "not_applicable" && s !== "confirmed" && !item.required && (
                              <ItemBtn onClick={() => markNA(item.id)} icon={Ban}>Not applicable</ItemBtn>
                            )}
                            {s !== "not_applicable" && s !== "confirmed" && item.required && s === "missing" && (
                              <ItemBtn onClick={() => markNA(item.id)} icon={Ban}>Not applicable</ItemBtn>
                            )}
                            {(s === "confirmed" || s === "not_applicable") && (
                              <ItemBtn onClick={() => clearOverride(item.id)} icon={RefreshCw}>Undo</ItemBtn>
                            )}
                          </div>
                        )}

                        {isEditing && (
                          <div className="mt-2 space-y-1.5">
                            <Textarea
                              value={detailText}
                              onChange={(e) => setDetailText(e.target.value)}
                              placeholder={`Add detail for ${item.label.toLowerCase()}…`}
                              rows={2}
                              className="text-xs resize-none rounded-lg"
                            />
                            <div className="flex gap-1.5">
                              <Button size="sm" className="h-7 rounded-lg text-xs px-2.5" onClick={() => submitAddDetail(item)}>Send to assistant</Button>
                              <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs px-2.5" onClick={cancelAddDetail}>Cancel</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 pt-3 border-t border-border/60 text-[10px] text-muted-foreground leading-relaxed">
              AI drafts and highlights gaps. A human reviews, approves and publishes.
            </p>
          </aside>
        </div>
      </motion.div>

      {/* Formatted sections */}
      {sections && (
        <motion.div id="care-plan-sections" {...fade} transition={{ duration: 0.4 }} className="bg-card rounded-2xl shadow-soft border border-border p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-heading font-semibold text-foreground inline-flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> AI-drafted care plan sections
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Every section is an <span className="font-medium text-warning">AI draft</span> — edit before accepting. Human review is required.
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{acceptedCount}/{sections.length} accepted</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {sections.map((sec) => {
              const meta = sectionMeta[sec.key];
              return (
                <div key={sec.key} className={`rounded-xl border p-3 space-y-2 ${meta?.accepted ? "border-success/40 bg-success/5" : meta?.needsInfo ? "border-warning/40 bg-warning/5" : "border-border bg-secondary/10"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground leading-tight">{SECTION_LABELS[sec.key]}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[9px] uppercase tracking-wider font-semibold text-warning bg-warning/10 rounded px-1.5 py-0.5">AI draft</span>
                        <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground bg-secondary/50 rounded px-1.5 py-0.5">
                          Source: {meta?.source === "voice" ? "voice" : meta?.source === "assistant" ? "assistant follow-up" : "typed note"}
                        </span>
                        {meta?.accepted && <span className="text-[9px] uppercase tracking-wider font-semibold text-success bg-success/10 rounded px-1.5 py-0.5">Accepted</span>}
                        {meta?.needsInfo && <span className="text-[9px] uppercase tracking-wider font-semibold text-warning bg-warning/10 rounded px-1.5 py-0.5">Needs info</span>}
                        {sec.humanEdited && <span className="text-[9px] uppercase tracking-wider font-semibold text-primary bg-primary/10 rounded px-1.5 py-0.5">Human edited</span>}
                      </div>
                    </div>
                  </div>
                  <Textarea
                    value={sec.body}
                    onChange={(e) => editSectionBody(sec.key as SectionKey, e.target.value)}
                    rows={4}
                    placeholder="No content captured yet — add detail via the assistant or type directly."
                    className="text-xs resize-none rounded-lg bg-background"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant={meta?.accepted ? "secondary" : "default"} className="h-7 rounded-lg text-xs px-2.5 gap-1" onClick={() => acceptSection(sec.key as SectionKey)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 rounded-lg text-xs px-2.5 gap-1" onClick={() => regenerateSection(sec.key as SectionKey)}>
                      <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs px-2.5 gap-1 text-warning hover:text-warning" onClick={() => flagSectionNeedsInfo(sec.key as SectionKey)}>
                      <AlertTriangle className="h-3.5 w-3.5" /> Needs more info
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Alert className="bg-primary/5 border-primary/20">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <AlertTitle className="text-xs">AI draft only. Human review required.</AlertTitle>
            <AlertDescription className="text-[11px]">AI never approves or publishes a care plan. Submit for human approval when the draft is reviewed.</AlertDescription>
          </Alert>
        </motion.div>
      )}

      {/* Supporting information */}
      <motion.div {...fade} transition={{ delay: 0.14, duration: 0.4 }} className="bg-card rounded-2xl shadow-soft border border-border p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-primary" /> Supporting information
              <span className="text-[10px] font-normal text-muted-foreground">(optional — add before submitting)</span>
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
              Assessments, documents, family/advocate input and referenced records are captured with the care plan audit trail.
            </p>
          </div>
          {support.length > 0 && (
            <span className="text-[10px] text-muted-foreground shrink-0 mt-1">{support.length} item{support.length === 1 ? "" : "s"}</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <SupportBtn icon={ClipboardCheck} label="Upload assessment" onClick={() => addSupport("Assessment", "Assessment document")} />
          <SupportBtn icon={Upload}         label="Upload document"   onClick={() => addSupport("Document", "Supporting document")} />
          <SupportBtn icon={StickyNote}     label="Add note"          onClick={() => addSupport("Note", "Handover note")} />
          <SupportBtn icon={Users}          label="Family / advocate input" onClick={() => addSupport("Family", "Family / advocate input")} />
          <SupportBtn icon={Pill}           label="Medication reference"    onClick={() => addSupport("Medication", "Medication reference")} />
          <SupportBtn icon={AlertTriangle}  label="Risk assessment"         onClick={() => addSupport("Risk", "Risk assessment reference")} />
        </div>

        {support.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {support.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-1.5 text-xs">
                <span><span className="text-muted-foreground">{s.kind}:</span> <span className="text-foreground">{s.label}</span></span>
                <button onClick={() => setSupport((sup) => sup.filter((x) => x.id !== s.id))} className="text-muted-foreground hover:text-destructive">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </motion.div>

      {/* Review + Submit — only shown once a draft exists */}
      {sections && (
      <motion.div {...fade} transition={{ delay: 0.18, duration: 0.4 }} className="bg-card rounded-2xl border border-border p-4 shadow-soft space-y-3">

        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          <p className="text-sm font-heading font-semibold text-foreground">Review before submission</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 text-xs">
          <ReviewRow label={terms.Singular} value={effectivePersonName || "—"} />
          <ReviewRow label="Site / house / unit" value={`${effectiveSite || "—"}${effectiveUnit ? ` · ${effectiveUnit}` : ""}`} />
          <ReviewRow label="Service type" value={templateMeta.label} />
          <ReviewRow label="Template" value={templateMeta.templateLabel} />
          <ReviewRow label="Approval chain" value={chainForScope?.name ?? "Not configured"} tone={chainForScope ? "default" : "warning"} />
          <ReviewRow label="Draft sections" value={sections ? `${sections.length} drafted · ${acceptedCount} accepted` : "Not formatted yet"} tone={sections ? "default" : "warning"} />
          <ReviewRow label="Remaining gaps" value={`${missingCount} missing · ${reviewCount} need more detail`} tone={missingCount + reviewCount === 0 ? "default" : "warning"} />
          <ReviewRow label="Supporting information" value={support.length ? `${support.length} item${support.length === 1 ? "" : "s"}` : "None attached"} />
        </div>

        {chainForScope && (
          <div className="rounded-xl border border-border bg-secondary/20 p-3">
            <p className="text-[11px] font-semibold text-foreground mb-1.5">Approval chain that will apply</p>
            <ol className="space-y-1">
              {chainForScope.levels.map((lv, i) => (
                <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-2">
                  <span className="h-4 w-4 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0 mt-px">{i + 1}</span>
                  <span className="flex-1">
                    <span className="text-foreground font-medium">{lv.levelName}</span>
                    <span className="text-muted-foreground"> — {lv.rule === "all_required" ? "all approvers" : "any one approver"} · {lv.approvers.map((a) => a.name).join(", ")}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[10px] text-primary/80 font-medium">AI drafts do not publish care plans. Human approval is required.</p>
          </div>
        )}

        {!isFrontline(role.role) && (
          <label className="flex items-start gap-3 cursor-pointer rounded-lg border p-3 bg-primary/5 border-primary/20">
            <Checkbox checked={humanReviewed} onCheckedChange={(v) => setHumanReviewed(!!v)} className="mt-0.5" />
            <div className="text-xs">
              <div className="font-medium text-foreground">I confirm this AI draft has been reviewed by a human before submission for approval.</div>
              <div className="text-muted-foreground mt-0.5">Required to submit. AI never approves or publishes a care plan.</div>
            </div>
          </label>
        )}

        {!chainForScope && anchorsOk && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No approval chain configured</AlertTitle>
            <AlertDescription className="text-xs">
              An Admin must configure a care plan approval chain for {effectiveSite}{effectiveUnit ? ` · ${effectiveUnit}` : ""} before the plan can be submitted.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {!anchorsOk ? "Complete the required criteria to start."
              : !hasUserSent ? `Describe ${effectivePreferred || effectivePersonName || `the ${terms.singular}`} to start the draft.`
              : !sections ? "Format the captured information into care plan sections above."
              : missingCount + reviewCount > 0 ? "You can submit — gaps will be surfaced to the reviewer."
              : "Ready — submit for human approval."}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => doSubmit(false)} disabled={!anchorsOk || !hasUserSent}>
              Save draft
            </Button>
            {!isFrontline(role.role) && (
              <Button onClick={() => doSubmit(true)} disabled={!canSubmitForApproval} className="rounded-xl gap-2">
                <ShieldCheck className="h-4 w-4" /> Submit for approval <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </motion.div>
      )}
    </div>
  );
}


// ---------- helpers ----------
function Field({ icon: Icon, label, required, children }: {
  icon: typeof Building2; label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 min-h-[18px]">
        <Icon className="h-3.5 w-3.5" /> {label}{required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

function SupportBtn({ icon: Icon, label, onClick }: { icon: typeof Building2; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 text-xs rounded-xl border border-border bg-background hover:bg-secondary/40 px-3 py-2 text-foreground transition-colors"
    >
      <Icon className="h-3.5 w-3.5 text-primary" /> {label}
    </button>
  );
}

function ItemBtn({ icon: Icon, children, onClick }: { icon: typeof Building2; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[10px] rounded-md border border-border bg-background hover:bg-secondary/40 px-1.5 py-0.5 text-foreground transition-colors"
    >
      <Icon className="h-3 w-3" /> {children}
    </button>
  );
}

function Badge({ tone, count, label }: { tone: "success" | "warning" | "destructive"; count: number; label: string }) {
  const map = {
    success:     { bg: "bg-success/10",     text: "text-success",     dot: "bg-success" },
    warning:     { bg: "bg-warning/10",     text: "text-warning",     dot: "bg-warning" },
    destructive: { bg: "bg-destructive/10", text: "text-destructive", dot: "bg-destructive" },
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${map.bg} ${map.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${map.dot}`} />
      <span className="tabular-nums font-semibold">{count}</span> {label}
    </span>
  );
}

function ReviewRow({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/10 px-2.5 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${tone === "warning" ? "text-warning" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = [
    { n: 1, label: "Setup" },
    { n: 2, label: "Assistant capture" },
    { n: 3, label: "Draft sections" },
    { n: 4, label: "Human review" },
    { n: 5, label: "Submit for approval" },
  ];
  return (
    <div className="bg-card rounded-2xl border border-border shadow-soft px-3 py-2.5">
      <ol className="flex items-center gap-1 overflow-x-auto">
        {steps.map((s, i) => {
          const done = s.n < current;
          const active = s.n === current;
          return (
            <li key={s.n} className="flex items-center gap-1 shrink-0">
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border ${
                  active
                    ? "bg-primary/10 text-primary border-primary/30"
                    : done
                    ? "bg-success/10 text-success border-success/30"
                    : "bg-secondary/30 text-muted-foreground border-border"
                }`}
              >
                <span className={`h-4 w-4 rounded-full inline-flex items-center justify-center text-[10px] font-semibold ${
                  active ? "bg-primary text-primary-foreground"
                  : done ? "bg-success text-success-foreground"
                  : "bg-muted text-muted-foreground"
                }`}>
                  {done ? "✓" : s.n}
                </span>
                {s.label}
              </div>
              {i < steps.length - 1 && <span className="text-muted-foreground/50 text-xs">›</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
