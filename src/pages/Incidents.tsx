import { useTerms } from "@/hooks/useTerms";
import { getTerms } from "@/lib/orgSettingsStore";
import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, Send, MapPin, Shield, Building2, User as UserIcon, Info, Square, Sparkles, Languages,
  Bot, CheckCircle2, ArrowRight, Circle, AlertCircle, Clock, ListChecks, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { incidentsStore } from "@/lib/incidentsStore";
import {
  detectLanguage, translateToEnglish, LANGUAGE_LABELS, type SourceLanguage,
} from "@/lib/translation";
import { CareVoiceRecorder } from "@/components/visits/CareVoiceRecorder";
import { accessibleVisit } from "@/lib/visitActions";
import { useRole } from "@/hooks/useRole";
import { inScope } from "@/lib/roleStore";
import { serviceUsersStore, useServiceUsers } from "@/lib/serviceUsersStore";
import { siteIdByName } from "@/lib/demoDataRegistry";
import type { IncidentType } from "@/lib/incidentsStore";
import { EVENT_TYPES, DEFAULT_EVENT_TYPE, inferEventType, type EventType } from "@/lib/eventTypes";
import { EvidenceTray } from "@/components/incidents/EvidenceTray";
import type { EvidenceItem } from "@/lib/evidence";
import { Paperclip, Tag } from "lucide-react";
import { ServiceUserPicker, NO_SERVICE_USER, rememberRecentServiceUser } from "@/components/incidents/ServiceUserPicker";




const INCIDENT_TYPE_OPTIONS: { value: string; label: string; mapped: IncidentType }[] = [
  { value: "fall",         label: "Fall",                          mapped: "Fall" },
  { value: "medication",   label: "Medication",                    mapped: "Medication error" },
  { value: "behaviour",    label: "Behaviour / Safeguarding",      mapped: "Behavioural" },
  { value: "skin",         label: "Skin Injury / Wound",           mapped: "Skin integrity" },
  { value: "missing",      label: `Missing ${getTerms().Singular} / Absence`,    mapped: "Missing person" },
  { value: "complaint",    label: "Complaint",                     mapped: "Other" },
  { value: "other",        label: "Other",                         mapped: "Other" },
];

const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

// === Conversation engine =====================================================
// The "guide" walks the reporter through the information a regulator-ready
// incident report needs. Each step inspects the captured state, decides what
// is still missing, and returns the next question. Pure client-side, scripted
// to look and feel like an AI assistant.

type Captured = {
  what?: string;
  when?: string;            // free-text e.g. "around 14:00 today"
  whenTime?: string;        // parsed HH:MM if found
  whenDate?: string;        // friendly date
  whereDetail?: string;     // exact spot (e.g. "beside her bed") or site/house/unit
  location?: string;        // category from anchors
  staff?: string;           // staff involved/witnesses (free text)
  injury?: "yes" | "no";
  injuryDetail?: string;
  response?: string;        // immediate actions
  severity?: "Low" | "Moderate" | "Severe" | "Death";
  notifications?: string;   // free text e.g. "Told the family and the GP"
  notes?: string;           // anything else

  // === Shared across non-incident event types ===
  raisedBy?: string;           // who raised / gave / requested
  relationship?: string;       // relationship to service
  followUp?: string;           // follow-up action required

  // Complaint-specific
  desiredOutcome?: string;

  // Concern-specific
  concernCategory?:
    | "safeguarding" | "care quality" | "staffing" | "environment"
    | "behavioural" | "medication" | "family concern" | "staff concern" | "other";
  immediateRisk?: "yes" | "no";

  // Compliment-specific
  staffMentioned?: string;
  shareInternally?: "yes" | "no";

  // Information / Records Request-specific
  requesterContact?: string;
  requestType?:
    | "Subject Access Request" | "Records Request" | "Family Request"
    | "Regulator Request" | "Solicitor / Legal Request"
    | "Internal Governance Request" | "Other";
  documentsRequested?: string;
  urgency?: "Low" | "Standard" | "Urgent";
};

type Msg =
  | { id: string; role: "bot"; text: string; suggestions?: string[]; ts: string }
  | { id: string; role: "user"; text: string; voice?: boolean; originalTranscript?: string; ts: string };

const stamp = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// Decide the next missing field and produce the bot's question
const nextStep = (
  c: Captured,
  ctx: { residentName: string; eventType: EventType },
): { field: keyof Captured | "done"; question: string; suggestions?: string[] } => {
  const r = ctx.residentName || `the ${getTerms().singular}`;
  const et = ctx.eventType;

  if (!c.what) {
    const opener =
      et === "Complaint"
        ? `Tell me about the complaint in your own words — who raised it, what they're unhappy about, and anything they want done. I'll structure it and only ask for what's missing.`
        : et === "Concern"
          ? `Describe the concern in your own words — what you've noticed, when, and anyone affected. I'll structure it and only ask for what's missing.`
          : et === "Compliment"
            ? `Tell me about the compliment — who said it, what they appreciated, and any staff or team mentioned. I'll structure it.`
            : et === "Information Request / Records Request"
              ? `Describe the request — who's asking, what they want, and any deadline. I'll structure it and only ask for what's missing.`
              : `Tell me what happened in your own words. Include as much as you remember — I'll mark off what we have and ask only for what's missing.`;
    return { field: "what", question: opener };
  }

  // === Complaint branch ===
  if (et === "Complaint") {
    if (!c.raisedBy)
      return { field: "raisedBy", question: `Who raised the complaint? (name, or "anonymous" if not given)`,
        suggestions: ["Family member", getTerms().Singular, "Visitor", "Anonymous"] };
    if (!c.relationship)
      return { field: "relationship", question: `What is their relationship to the service?`,
        suggestions: ["Family / NOK", getTerms().Singular, "Visitor", "Staff member", "Other"] };
    if (!c.whereDetail)
      return { field: "whereDetail", question: `Which site, house or unit does this relate to?` };
    if (!c.when)
      return { field: "when", question: `When was the complaint received? Approximate is fine.`,
        suggestions: ["Today", "Yesterday", "This week"] };
    if (!c.response)
      return { field: "response", question: `Was any immediate response given — for example, acknowledgement, apology, action? If not yet, say "not yet".`,
        suggestions: ["Not yet", "Verbal acknowledgement given", "Manager informed"] };
    if (!c.desiredOutcome)
      return { field: "desiredOutcome", question: `Did they mention a desired outcome? You can skip if not.`,
        suggestions: ["Skip", "Apology requested", "Investigation requested", "Change in care requested"] };
    if (!c.followUp)
      return { field: "followUp", question: `Any follow-up required? You can skip if not yet decided.`,
        suggestions: ["Skip", "Manager to call back", "Formal investigation", "Add to QI log"] };
    if (c.notes === undefined)
      return { field: "notes", question: `Anything else to add before submitting?`,
        suggestions: ["Nothing else"] };
    return { field: "done", question: `That covers the complaint. You can submit for review whenever you're ready — I'll flag anything unclear.` };
  }

  // === Concern branch ===
  if (et === "Concern") {
    if (!c.raisedBy)
      return { field: "raisedBy", question: `Who raised the concern?`,
        suggestions: ["Myself", "Colleague", "Family member", getTerms().Singular, "Anonymous"] };
    if (!c.concernCategory)
      return { field: "concernCategory", question: `What category best fits this concern?`,
        suggestions: ["Safeguarding", "Care quality", "Staffing", "Environment", "Behavioural", "Medication", "Family concern", "Staff concern", "Other"] };
    if (!c.whereDetail)
      return { field: "whereDetail", question: `Which site, house or unit does this relate to?` };
    if (!c.immediateRisk)
      return { field: "immediateRisk", question: `Is there an immediate risk to anyone right now?`,
        suggestions: ["No immediate risk", "Yes — immediate risk"] };
    if (!c.response)
      return { field: "response", question: `Has any action been taken already? If not, say "not yet".`,
        suggestions: ["Not yet", "Manager informed", `${getTerms().Singular} moved to safe area`, "PIC informed"] };
    if (!c.followUp)
      return { field: "followUp", question: `Any follow-up required? You can skip if not yet decided.`,
        suggestions: ["Skip", "Safeguarding referral", "Manager review", "Add to risk register"] };
    if (c.notes === undefined)
      return { field: "notes", question: `Anything else to add before submitting?`, suggestions: ["Nothing else"] };
    return { field: "done", question: `That covers the concern. You can submit for review whenever you're ready.` };
  }

  // === Compliment branch ===
  if (et === "Compliment") {
    if (!c.raisedBy)
      return { field: "raisedBy", question: `Who gave the compliment?`,
        suggestions: ["Family member", getTerms().Singular, "Visitor", "Anonymous"] };
    if (!c.relationship)
      return { field: "relationship", question: `What is their relationship to the service?`,
        suggestions: ["Family / NOK", getTerms().Singular, "Visitor", "Other"] };
    if (!c.staffMentioned)
      return { field: "staffMentioned", question: `Were any staff members or teams mentioned? You can skip if not.`,
        suggestions: ["Skip", "Care team generally", "Night team"] };
    if (!c.whereDetail)
      return { field: "whereDetail", question: `Which site, house or unit does this relate to?` };
    if (!c.shareInternally)
      return { field: "shareInternally", question: `Can this be shared internally with the team?`,
        suggestions: ["Yes — share with team", "No — keep private", "Not sure"] };
    if (c.notes === undefined)
      return { field: "notes", question: `Anything else to add before logging?`, suggestions: ["Nothing else"] };
    return { field: "done", question: `Great — that's the compliment captured. You can log it whenever you're ready.` };
  }

  // === Information / Records Request branch ===
  if (et === "Information Request / Records Request") {
    if (!c.raisedBy)
      return { field: "raisedBy", question: `Who is making the request? (requester name)` };
    if (!c.requesterContact)
      return { field: "requesterContact", question: `Their contact details — email or phone? You can skip if not provided.`,
        suggestions: ["Skip"] };
    if (!c.relationship)
      return { field: "relationship", question: `Their relationship to the service?`,
        suggestions: ["Family / NOK", getTerms().Singular, "Solicitor", "Regulator", "Internal", "Other"] };
    if (!c.requestType)
      return { field: "requestType", question: `What type of request is this?`,
        suggestions: ["Subject Access Request", "Records Request", "Family Request", "Regulator Request", "Solicitor / Legal Request", "Internal Governance Request", "Other"] };
    if (!c.whereDetail)
      return { field: "whereDetail", question: `Which site, house or unit does the request relate to?` };
    if (!c.when)
      return { field: "when", question: `When was the request received?`,
        suggestions: ["Today", "Yesterday", "This week"] };
    if (!c.documentsRequested)
      return { field: "documentsRequested", question: `Do you know what records or documents they're asking for? Skip if not specified.`,
        suggestions: ["Skip", "Full care record", "Specific incident records", "Medication records"] };
    if (!c.urgency)
      return { field: "urgency", question: `How urgent is this?`,
        suggestions: ["Standard", "Urgent", "Low"] };
    if (c.notes === undefined)
      return { field: "notes", question: `Anything else to add before logging?`, suggestions: ["Nothing else"] };
    return { field: "done", question: `That covers the request. It will now be reviewed by an authorised Manager or Admin.` };
  }

  // === Default: Incident / Accident (and other event types) — original flow ===
  if (!c.when) {
    return {
      field: "when",
      question: `Thanks. When did this happen? You can give an approximate time — e.g. "around 14:00 today" or "just before lunch".`,
      suggestions: ["Just now", "Earlier this morning", "After lunch", "Last night"],
    };
  }
  if (!c.whereDetail) {
    return {
      field: "whereDetail",
      question: `Where exactly did this happen? A specific spot helps a lot — e.g. "beside the bed in Room 14" or "the corridor outside the dining room".`,
    };
  }
  if (!c.staff) {
    return {
      field: "staff",
      question: `Were any other staff or ${getTerms().plural} involved or present? Just list names, or say "no one else".`,
      suggestions: ["No one else", "I was on my own", "CNM was nearby"],
    };
  }
  if (!c.injury) {
    return {
      field: "injury",
      question: `Did ${r} sustain any injury — even something small like a bruise or skin tear?`,
      suggestions: ["No injury", "Yes — minor", "Yes — needs review"],
    };
  }
  if (c.injury === "yes" && !c.injuryDetail) {
    return {
      field: "injuryDetail",
      question: `Can you describe the injury? Where on the body, what type (bruise, cut, swelling), and anything you noticed.`,
    };
  }
  if (!c.response) {
    return {
      field: "response",
      question: `What did you do straight after? E.g. "Called the nurse, took vitals, helped them into a chair, contacted the GP".`,
    };
  }
  // Severity is selected by the human reporter in the setup card —
  // the assistant never asks for or auto-fills severity here.
  if (!c.notifications) {
    return {
      field: "notifications",
      question: `Have you let anyone know yet — family, GP, the PIC? Just type who you've already informed, or "Not yet".`,
      suggestions: ["Not yet", "Family informed", "GP and family informed", "PIC informed"],
    };
  }
  if (c.notes === undefined) {
    return {
      field: "notes",
      question: `Anything else you want to add — context, contributing factors, what they were doing just before? Or you can say "nothing else" and I'll prepare the draft.`,
      suggestions: ["Nothing else", `${getTerms().Singular} was unsteady earlier`, "Similar incident last week"],
    };
  }
  return {
    field: "done",
    question: `That covers the main points. Some information may still be missing, but you can submit for review whenever you're ready — I'll flag anything unclear for the reviewer.`,
  };
};

// Parse a user reply into structured updates for the current field.
const interpret = (field: keyof Captured, raw: string): Partial<Captured> => {
  const text = raw.trim();
  const lower = text.toLowerCase();
  switch (field) {
    case "what":
      return { what: text };
    case "when": {
      const timeMatch = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
      const whenTime = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : undefined;
      let whenDate: string | undefined;
      if (/today|just now/i.test(text)) {
        const d = new Date();
        whenDate = `${d.getDate()} ${d.toLocaleString("en-IE", { month: "short" })}`;
      } else if (/yesterday/i.test(text)) {
        const d = new Date(); d.setDate(d.getDate() - 1);
        whenDate = `${d.getDate()} ${d.toLocaleString("en-IE", { month: "short" })}`;
      }
      return { when: text, whenTime, whenDate };
    }
    case "whereDetail":
      return { whereDetail: text };
    case "staff":
      return { staff: text };
    case "injury": {
      if (/^no/i.test(lower) || /no injury|none/.test(lower)) return { injury: "no" };
      return { injury: "yes" };
    }
    case "injuryDetail":
      return { injuryDetail: text };
    case "response":
      return { response: text };
    case "severity": {
      if (/death|fatal/.test(lower)) return { severity: "Death" };
      if (/severe|critical|high|serious/.test(lower)) return { severity: "Severe" };
      if (/moderate|medium/.test(lower)) return { severity: "Moderate" };
      if (/low|minor/.test(lower)) return { severity: "Low" };
      // "Not sure" → leave to PIC, default Moderate
      return { severity: "Moderate" };
    }
    case "notifications":
      return { notifications: text };
    case "notes":
      if (/^nothing|^none|^no\b/i.test(lower)) return { notes: "" };
      return { notes: text };

    // === New event-type fields ===
    case "raisedBy":
      return { raisedBy: text };
    case "relationship":
      return { relationship: text };
    case "desiredOutcome":
      if (/^skip|^none|^no\b/i.test(lower)) return { desiredOutcome: "" };
      return { desiredOutcome: text };
    case "followUp":
      if (/^skip|^none|^no\b/i.test(lower)) return { followUp: "" };
      return { followUp: text };
    case "concernCategory": {
      const map: Array<[RegExp, Captured["concernCategory"]]> = [
        [/safeguard/i, "safeguarding"],
        [/care quality|quality of care/i, "care quality"],
        [/staffing/i, "staffing"],
        [/environment/i, "environment"],
        [/behaviour/i, "behavioural"],
        [/medication|med\b/i, "medication"],
        [/family/i, "family concern"],
        [/staff/i, "staff concern"],
      ];
      for (const [re, val] of map) if (re.test(text)) return { concernCategory: val };
      return { concernCategory: "other" };
    }
    case "immediateRisk":
      if (/no immediate|^no\b|none/i.test(lower)) return { immediateRisk: "no" };
      return { immediateRisk: "yes" };
    case "staffMentioned":
      if (/^skip|^none|^no\b/i.test(lower)) return { staffMentioned: "" };
      return { staffMentioned: text };
    case "shareInternally":
      if (/no\b|private/i.test(lower)) return { shareInternally: "no" };
      if (/yes|share/i.test(lower)) return { shareInternally: "yes" };
      return { shareInternally: "yes" };
    case "requesterContact":
      if (/^skip|^none/i.test(lower)) return { requesterContact: "" };
      return { requesterContact: text };
    case "requestType": {
      const types: Captured["requestType"][] = [
        "Subject Access Request", "Records Request", "Family Request",
        "Regulator Request", "Solicitor / Legal Request",
        "Internal Governance Request", "Other",
      ];
      const match = types.find(t => t && lower.includes(t.toLowerCase()));
      if (match) return { requestType: match };
      if (/sar/i.test(text)) return { requestType: "Subject Access Request" };
      return { requestType: "Other" };
    }
    case "documentsRequested":
      if (/^skip|^none|don'?t know/i.test(lower)) return { documentsRequested: "" };
      return { documentsRequested: text };
    case "urgency":
      if (/urgent|asap|immediately/i.test(lower)) return { urgency: "Urgent" };
      if (/low/i.test(lower)) return { urgency: "Low" };
      return { urgency: "Standard" };

    default:
      return {};
  }
};

// Extract as many fields as possible from one free-text "what happened" message.
// Used on the first user turn so the assistant can light up multiple evidence
// items at once instead of asking field-by-field from a blank slate.
const extractAll = (raw: string): Partial<Captured> => {
  const text = raw.trim();
  if (!text) return {};
  const lower = text.toLowerCase();
  const out: Partial<Captured> = { what: text };

  // When
  const timeMatch = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (timeMatch) out.whenTime = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
  const approx = text.match(/\b(?:around|approx(?:imately)?|about|~)\s*([01]?\d|2[0-3])[:.]?([0-5]\d)?\b/i);
  if (!out.whenTime && approx) {
    out.whenTime = `${approx[1].padStart(2, "0")}:${(approx[2] || "00").padStart(2, "0")}`;
  }
  if (/\btoday|just now|this (morning|afternoon|evening)|tonight\b/i.test(text)) {
    const d = new Date();
    out.whenDate = `${d.getDate()} ${d.toLocaleString("en-IE", { month: "short" })}`;
  } else if (/\byesterday\b/i.test(text)) {
    const d = new Date(); d.setDate(d.getDate() - 1);
    out.whenDate = `${d.getDate()} ${d.toLocaleString("en-IE", { month: "short" })}`;
  }
  if (out.whenTime || out.whenDate) {
    out.when = [out.whenDate, out.whenTime && `approx. ${out.whenTime}`].filter(Boolean).join(", ");
  }

  // Where
  const whereMatch =
    text.match(/\b(?:in|at|beside|near|by|on)\s+(?:the\s+|her\s+|his\s+)?((?:room\s*\d+[a-z]?|bed(?:room|side)?|bathroom|corridor|hallway|dining(?: room)?|kitchen|garden|lounge|sitting room|en[- ]?suite|toilet)(?:\s+[^.,;\n]{0,40})?)/i);
  if (whereMatch) out.whereDetail = whereMatch[0].replace(/^\s*(?:in|at|beside|near|by|on)\s+/i, "").trim();
  else {
    const roomMatch = text.match(/\broom\s*\d+[a-z]?\b/i);
    if (roomMatch) out.whereDetail = roomMatch[0];
  }

  // Witnesses / staff present
  if (/\b(witness(ed)?|saw it|was present|was with (me|her|him)|colleague|nurse on duty|cnm)\b/i.test(text)) {
    const m = text.match(/[^.]*\b(witness(ed)?|saw it|was present|was with (me|her|him)|colleague|nurse on duty|cnm)\b[^.]*/i);
    if (m) out.staff = m[0].trim();
  } else if (/\b(on my own|alone|no one else|nobody else)\b/i.test(text)) {
    out.staff = "On my own — no other witnesses";
  }

  // Injury
  if (/\bno (visible )?injur(y|ies)|no harm|uninjured|no bruis|no cut\b/i.test(text)) {
    out.injury = "no";
  } else if (/\b(bruis|cut|laceration|skin tear|swell|bleed|fracture|wound|injur|hurt|pain|sore)\b/i.test(text)) {
    out.injury = "yes";
    const m = text.match(/[^.]*\b(bruis|cut|laceration|skin tear|swell|bleed|fracture|wound|injur|hurt|pain|sore)\w*[^.]*/i);
    if (m) out.injuryDetail = m[0].trim();
  }

  // Immediate response
  if (/\b(checked|assisted|helped|called|contacted|made comfortable|took vitals|obs|sat (her|him) up|repositioned|cleaned|dressed)\b/i.test(text)) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const respSent = sentences.filter(s =>
      /\b(checked|assisted|helped|called|contacted|made comfortable|took vitals|obs|sat (her|him) up|repositioned|cleaned|dressed)\b/i.test(s));
    if (respSent.length) out.response = respSent.join(" ").trim();
  }

  // Notifications
  if (/\b(informed|notified|told|let .* know|called the (gp|family|daughter|son|nok|pic)|family informed|gp informed)\b/i.test(text)) {
    const m = text.match(/[^.]*\b(informed|notified|told|let .* know|called the (gp|family|daughter|son|nok|pic)|family informed|gp informed)[^.]*/i);
    if (m) out.notifications = m[0].trim();
  }

  // Severity is selected by the human reporter in the setup card.
  // The AI must not auto-select it from the narrative.

  return out;
};

// Build a friendly bot acknowledgement before the next question.
const acknowledge = (field: keyof Captured, c: Captured): string => {
  switch (field) {
    case "what": return "Got it.";
    case "when": return c.whenTime ? `Noted — ${c.whenTime}${c.whenDate ? ` on ${c.whenDate}` : ""}.` : "Thanks.";
    case "whereDetail": return "Thanks, that's helpful.";
    case "staff": return "Noted.";
    case "injury": return c.injury === "yes" ? "Okay — I'll need a bit more on that." : "Good — no injury recorded.";
    case "injuryDetail": return "Thanks.";
    case "response": return "Great — that's the immediate response captured.";
    case "severity": return c.severity ? `Recorded as ${c.severity}.` : "Noted.";
    case "notifications": return "Thanks.";
    case "notes": return "Got it.";
    case "raisedBy": return "Noted.";
    case "relationship": return "Thanks.";
    case "desiredOutcome": return "Noted.";
    case "followUp": return "Noted.";
    case "concernCategory": return c.concernCategory ? `Categorised as ${c.concernCategory}.` : "Noted.";
    case "immediateRisk": return c.immediateRisk === "yes" ? "Okay — flagging immediate risk." : "Good — no immediate risk recorded.";
    case "staffMentioned": return "Noted.";
    case "shareInternally": return c.shareInternally === "yes" ? "Great — can be shared with the team." : "Noted — kept private.";
    case "requesterContact": return "Thanks.";
    case "requestType": return c.requestType ? `Logged as ${c.requestType}.` : "Noted.";
    case "documentsRequested": return "Noted.";
    case "urgency": return c.urgency ? `Marked as ${c.urgency} urgency.` : "Noted.";
    default: return "";
  }
};

// === Component ===============================================================

const Incidents = () => {
  const terms = useTerms();
  const role = useRole();
  const location = useLocation();
  const candidate = location.state?.visitNotePrefill as { visitId: string; clientId: string; text: string } | undefined;
  const linkedVisit = candidate ? accessibleVisit(candidate.visitId, role) : undefined;
  const prefill = candidate && linkedVisit?.clientId === candidate.clientId ? candidate : undefined;
  const prefillClient = prefill ? serviceUsersStore.getById(prefill.clientId) : undefined;
  // If only one site is in scope, default the capture to it.
  const SITE_OPTIONS = [
    { id: "oakfield",  name: "East Cork"  },
    { id: "riverside", name: "West Waterford" },
    { id: "elmgrove",  name: "West Waterford"  },
  ].filter(s => inScope(s.name, role.role, role.scope));
  const [site, setSite] = useState(prefillClient ? SITE_OPTIONS.find((s) => siteIdByName(s.name) === prefillClient.siteId)?.id ?? "" : SITE_OPTIONS.length === 1 ? SITE_OPTIONS[0].id : "");
  const [resident, setResident] = useState(prefill?.clientId ?? ""); // serviceUserId
  useServiceUsers();
  const siteId = siteIdByName(SITE_OPTIONS.find(s => s.id === site)?.name ?? "");
  const siteServiceUsers = serviceUsersStore.list(role).filter(u => u.siteId === siteId && u.status === "active");
  useEffect(() => { if (resident && !siteServiceUsers.some(u => u.id === resident)) setResident(""); }, [site]); // eslint-disable-line react-hooks/exhaustive-deps
  const [eventType, setEventType] = useState<EventType>(prefill ? "Concern" : DEFAULT_EVENT_TYPE);
  const [eventTypeConfirmed, setEventTypeConfirmed] = useState(!!prefill);
  const [incidentTypeKey, setIncidentTypeKey] = useState("");
  const [language, setLanguage] = useState<SourceLanguage | "auto">("auto");


  const [captured, setCaptured] = useState<Captured>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pendingField, setPendingField] = useState<keyof Captured | "done">("what");
  const [draft, setDraft] = useState(prefill?.text ?? "");
  const [voiceSource, setVoiceSource] = useState(false);
  const [originalTranscript, setOriginalTranscript] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceItem[]>(() => incidentsStore.getDraftEvidence());
  const knownEvidenceIds = useRef<Set<string>>(new Set(evidence.map(e => e.id)));
  useEffect(() => {
    const unsub = incidentsStore.subscribeDraftEvidence(setEvidence);
    return () => { unsub(); };
  }, []);

  // AI assistant awareness: when a new evidence item is attached during an
  // active chat, the bot acknowledges it and asks a kind-aware follow-up.
  useEffect(() => {
    const fresh = evidence.filter(e => !knownEvidenceIds.current.has(e.id));
    if (fresh.length === 0) return;
    fresh.forEach(e => knownEvidenceIds.current.add(e.id));
    // Only chime in after the chat has actually started.
    setMessages(prev => {
      if (prev.length === 0 || pendingField === "done") return prev;
      const item = fresh[fresh.length - 1];
      const prompt =
        item.kind === "image"
          ? `I can see a photo has been attached (${item.name}). Can you briefly describe what it shows — for example any injury, location or item?`
          : item.kind === "video"
            ? `Thanks — I've registered the video (${item.name}). Anything specific in it the reviewer should focus on?`
            : item.kind === "audio"
              ? `Thanks — the audio note (${item.name}) is attached. Is there anything in it that should be transcribed into the record?`
              : `Thanks — the document (${item.name}) is attached. What does it relate to — care plan, medication chart, witness statement, or something else?`;
      return [
        ...prev,
        { id: `b-ev-${item.id}`, role: "bot", text: prompt, ts: stamp() },
      ];
    });
  }, [evidence, pendingField]);

  const currentUser = role.displayName;
  const hasUserSent = messages.some(m => m.role === "user");


  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();

  const requiresIncidentSubType = eventType === "Incident / Accident";
  const requiresResident = eventType === "Incident / Accident";
  const effectiveIncidentTypeKey = requiresIncidentSubType ? incidentTypeKey : "other";
  const anchorsOk = !!(site && (!requiresResident || resident) && (!requiresIncidentSubType || incidentTypeKey));
  const residentName = serviceUsersStore.getById(resident)?.name || "";
  const pickResident = (id: string) => {
    setResident(id);
    if (id && id !== NO_SERVICE_USER) rememberRecentServiceUser(id);
  };
  const incidentTypeOption = INCIDENT_TYPE_OPTIONS.find(o => o.value === effectiveIncidentTypeKey);

  // Kick off the first bot message once anchors are set
  useEffect(() => {
    if (!anchorsOk) return;
    if (messages.length > 0) return;
    const step = nextStep({}, { residentName, eventType });
    setPendingField(step.field);
    setMessages([{ id: "m0", role: "bot", text: step.question, suggestions: step.suggestions, ts: stamp() }]);
  }, [anchorsOk, residentName, messages.length]);

  // Auto-scroll chat
  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-grow input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 140) + "px";
    }
  }, [draft]);

  // Detect language as the staff member types
  const detectedLang = useMemo(() => detectLanguage(draft), [draft]);
  const effectiveLang: SourceLanguage = language === "auto" ? detectedLang.language : language;

  // AI suggestion for Event Type — re-evaluates as the narrative grows.
  // The user can always override and confirms before submission.
  const suggestedEventType = useMemo<EventType>(() => {
    const narrative = [
      captured.what, captured.notes, captured.response,
      ...messages.filter(m => m.role === "user").map(m => m.text),
    ].filter(Boolean).join(" ");
    return inferEventType(narrative);
  }, [captured, messages]);

  // Auto-adopt the suggestion until the user explicitly confirms or changes it.
  useEffect(() => {
    if (eventTypeConfirmed) return;
    if (suggestedEventType !== eventType) setEventType(suggestedEventType);
  }, [suggestedEventType, eventTypeConfirmed, eventType]);

  const sendUserTurn = (raw: string, opts?: { voice?: boolean }) => {
    const text = raw.trim();
    if (!text || pendingField === "done") return;

    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      voice: opts?.voice,
      originalTranscript: opts?.voice ? originalTranscript : undefined,
      ts: stamp(),
    };
    const isFirstUserTurn = !messages.some(m => m.role === "user");
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");

    const updates = isFirstUserTurn
      ? extractAll(text)
      : interpret(pendingField as keyof Captured, text);
    const newCaptured: Captured = { ...captured, ...updates };
    setCaptured(newCaptured);

    // Bot replies after a short delay
    setTimeout(() => {
      const next = nextStep(newCaptured, { residentName, eventType });
      setPendingField(next.field);
      const ack = isFirstUserTurn
        ? "Thanks — I've captured the key details. Some information may still be missing, but you can add more or submit anyway. I'll flag any unclear items for the reviewer."
        : acknowledge(pendingField as keyof Captured, newCaptured);
      const botText = ack ? `${ack} ${next.question}` : next.question;
      setMessages((prev) => [
        ...prev,
        { id: `b-${Date.now()}`, role: "bot", text: botText, suggestions: next.suggestions, ts: stamp() },
      ]);
    }, 450);
  };

  const handleSend = () => {
    if (!anchorsOk) {
      toast("Complete the start details", { description: `Pick the site, ${terms.singular} and event type before starting.` });
      return;
    }
    sendUserTurn(draft, { voice: voiceSource });
    setVoiceSource(false);
    setOriginalTranscript("");
  };

  const handleSuggestion = (s: string) => sendUserTurn(s);

  const handleSubmitDraft = () => {
    if (incidentsStore.getDraft()) { toast("An Event draft is already open", { description: "Finish or discard that draft before starting another. Your capture remains here." }); return; }
    // Translate the longest narrative ("what" + "response") if needed
    const sourceLanguage: SourceLanguage =
      language === "auto" ? detectedLang.language : language;

    // Verbatim source evidence: every word the reporter actually typed/said,
    // preserved exactly as submitted so reviewers can compare against the
    // AI-polished draft.
    const verbatim = messages
      .filter(m => m.role === "user")
      .map(m => (m.voice ? `[Voice transcript] ${m.originalTranscript ?? m.text}${m.originalTranscript && m.originalTranscript !== m.text ? `\n[Reporter correction] ${m.text}` : ""}` : m.text))
      .join("\n\n")
      .trim();

    const narrative = [
      captured.what,
      captured.whereDetail && `Where: ${captured.whereDetail}.`,
      captured.staff && `Others present: ${captured.staff}.`,
      captured.notifications && `Notifications already made: ${captured.notifications}.`,
      captured.notes && `Other notes: ${captured.notes}.`,
    ].filter(Boolean).join(" ");

    const englishNarrative = sourceLanguage === "en"
      ? narrative
      : translateToEnglish(narrative, sourceLanguage);

    incidentsStore.setDraft({
      site,
      resident,
      serviceUserId: (serviceUsersStore.getById(resident)?.id),
      visitId: prefill?.visitId,
      // Severity is suggested on the review screen and confirmed by the reporter there.
      severity: "",
      location: captured.whereDetail || "",
      source: messages.some((m) => m.role === "user" && m.voice) ? "voice" : "text",
      eventType,
      incidentType: incidentTypeOption?.mapped,
      
      text: englishNarrative,
      sourceLanguage,
      languageAutoDetected: language === "auto",
      originalText: verbatim || narrative,
      translatedText: sourceLanguage === "en" ? undefined : englishNarrative,
      timeOfIncident: captured.whenTime,
      dateOfIncident: captured.whenDate,
      injurySustained: captured.injury === "yes",
      injuryNote: captured.injuryDetail,
      immediateActions: captured.response,
    });


    // Push every Q/A as a clarification record on the incident
    messages.forEach((m, i) => {
      if (m.role === "user" && i > 0) {
        const prev = messages[i - 1];
        if (prev?.role === "bot") {
          incidentsStore.addClarification(prev.text, m.text);
        }
      }
    });

    // Carry forward any unresolved evidence items as reviewer flags
    const unresolved = checklist.filter(i => i.status !== "captured");
    if (unresolved.length > 0) {
      incidentsStore.addClarification(
        "Submitted with LogUp flags",
        unresolved.map(i => `${i.label} — ${i.status === "review" ? "needs follow-up" : "still needed"}`).join("; "),
      );
    }

    navigate("/app/incidents/draft");
  };

  // Evidence checklist (per-incident-type)
  type EvStatus = "not-started" | "captured" | "review" | "missing";
  type EvItem = { id: string; label: string; status: EvStatus; hint?: string; snippet?: string };

  const has = (v?: string) => !!(v && v.trim().length > 0);
  const mentions = (v: string | undefined, re: RegExp) => !!v && re.test(v);
  const trim = (v: string, n = 90) => v.length > n ? v.slice(0, n - 1).trimEnd() + "…" : v;
  const extract = (v: string | undefined, re: RegExp) => {
    if (!v) return undefined;
    const m = v.match(re);
    return m ? trim(m[0].trim()) : undefined;
  };

  const buildChecklist = (): EvItem[] => {
    const c = captured;
    const obsRe = /[^.]*\b(vitals|obs(ervation)?s?|bp|pulse|neuro|sats|temperature)\b[^.]*/i;
    const followRe = /[^.]*\b(refer|gp|physio|review|care plan|risk assess|follow[- ]?up|monitor|24[- ]?hour)\b[^.]*/i;

    const timeStatus: EvStatus = has(c.when) ? "captured" : "not-started";
    const locStatus: EvStatus = has(c.whereDetail) ? "captured" : "not-started";

    const injuryStatus: EvStatus =
      c.injury === "no" ? "review"
      : c.injury === "yes" ? (has(c.injuryDetail) ? "captured" : "review")
      : "not-started";
    const injurySnippet =
      c.injury === "no" ? "No visible injury mentioned"
      : c.injury === "yes" ? (c.injuryDetail ? trim(c.injuryDetail) : "Injury reported — detail needed")
      : undefined;

    const notifStatus: EvStatus =
      !has(c.notifications) ? "missing"
      : /not yet|^no\b|^none/i.test(c.notifications!) ? "missing"
      : "captured";

    const obsSnippet = extract([c.what, c.response, c.notes].filter(Boolean).join(" "), obsRe);
    const obsStatus: EvStatus = obsSnippet ? "captured" : has(c.response) ? "review" : "not-started";

    const followSnippet = extract([c.response, c.notes].filter(Boolean).join(" "), followRe);
    const followStatus: EvStatus = followSnippet ? "captured" : has(c.response) ? "review" : "not-started";

    const witnessStatus: EvStatus =
      !has(c.staff) ? "missing"
      : /no one else|on my own|^none|^no\b|alone/i.test(c.staff!) ? "missing"
      : "captured";

    const fall: EvItem[] = [
      { id: "what",   label: "What happened",          status: has(c.what) ? "captured" : "not-started",
        snippet: c.what ? trim(c.what) : undefined },
      { id: "date",   label: "Date and time",          status: timeStatus,
        snippet: has(c.when) ? c.when : undefined },
      { id: "loc",    label: "Location",               status: locStatus,
        snippet: has(c.whereDetail) ? c.whereDetail : undefined },
      { id: "imm",    label: "Immediate action taken", status: has(c.response) ? "captured" : "not-started",
        snippet: c.response ? trim(c.response) : undefined },
      { id: "inj",    label: "Injury / harm level",    status: injuryStatus, snippet: injurySnippet },
      { id: "obs",    label: "Observations completed", status: obsStatus, hint: "Vitals, neuro, skin check",
        snippet: obsSnippet },
      { id: "wit",    label: "Witnesses / statements", status: witnessStatus,
        snippet: witnessStatus === "captured" ? trim(c.staff!) : undefined },
      { id: "notif",  label: "Notifications made",     status: notifStatus, hint: "Family, GP, PIC",
        snippet: notifStatus === "captured" ? trim(c.notifications!) : undefined },
      { id: "follow", label: "Follow-up actions",      status: followStatus, hint: "Referral, care plan update",
        snippet: followSnippet },
    ];

    // === Non-Incident event types: type-specific evidence checklists ===
    if (eventType === "Complaint") {
      return [
        { id: "what",   label: "Complaint summary",          status: has(c.what) ? "captured" : "not-started", snippet: c.what ? trim(c.what) : undefined },
        { id: "who",    label: "Who raised the complaint",   status: has(c.raisedBy) ? "captured" : "missing", snippet: c.raisedBy ? trim(c.raisedBy) : undefined },
        { id: "rel",    label: "Relationship to service",    status: has(c.relationship) ? "captured" : "missing", snippet: c.relationship },
        { id: "site",   label: "Site / house / unit",        status: has(c.whereDetail) ? "captured" : "missing", snippet: c.whereDetail },
        { id: "date",   label: "Date received",              status: timeStatus, snippet: c.when },
        { id: "imm",    label: "Immediate response",         status: has(c.response) ? "captured" : "review", snippet: c.response ? trim(c.response) : undefined },
        { id: "out",    label: "Desired outcome",            status: has(c.desiredOutcome) ? "captured" : "review", hint: "If mentioned", snippet: c.desiredOutcome ? trim(c.desiredOutcome) : undefined },
        { id: "follow", label: "Follow-up required",         status: has(c.followUp) ? "captured" : "review", snippet: c.followUp ? trim(c.followUp) : undefined },
      ];
    }
    if (eventType === "Concern") {
      return [
        { id: "what",   label: "Description of concern",     status: has(c.what) ? "captured" : "not-started", snippet: c.what ? trim(c.what) : undefined },
        { id: "who",    label: "Who raised the concern",     status: has(c.raisedBy) ? "captured" : "missing", snippet: c.raisedBy },
        { id: "cat",    label: "Concern category",           status: c.concernCategory ? "captured" : "missing", snippet: c.concernCategory },
        { id: "site",   label: "Site / house / unit",        status: has(c.whereDetail) ? "captured" : "missing", snippet: c.whereDetail },
        { id: "risk",   label: "Immediate risk",             status: c.immediateRisk ? "captured" : "missing", snippet: c.immediateRisk === "yes" ? "Yes — immediate risk" : c.immediateRisk === "no" ? "No immediate risk" : undefined },
        { id: "imm",    label: "Action already taken",       status: has(c.response) ? "captured" : "review", snippet: c.response ? trim(c.response) : undefined },
        { id: "follow", label: "Follow-up required",         status: has(c.followUp) ? "captured" : "review", snippet: c.followUp ? trim(c.followUp) : undefined },
      ];
    }
    if (eventType === "Compliment") {
      return [
        { id: "what",   label: "Compliment summary",         status: has(c.what) ? "captured" : "not-started", snippet: c.what ? trim(c.what) : undefined },
        { id: "who",    label: "Who gave the compliment",    status: has(c.raisedBy) ? "captured" : "missing", snippet: c.raisedBy },
        { id: "rel",    label: "Relationship to service",    status: has(c.relationship) ? "captured" : "review", snippet: c.relationship },
        { id: "staff",  label: "Staff / team mentioned",     status: has(c.staffMentioned) ? "captured" : "review", snippet: c.staffMentioned ? trim(c.staffMentioned) : undefined },
        { id: "site",   label: "Site / house / unit",        status: has(c.whereDetail) ? "captured" : "missing", snippet: c.whereDetail },
        { id: "share",  label: "Can be shared internally",   status: c.shareInternally ? "captured" : "review", snippet: c.shareInternally === "yes" ? "Yes — shareable" : c.shareInternally === "no" ? "Private" : undefined },
      ];
    }
    if (eventType === "Information Request / Records Request") {
      return [
        { id: "what",   label: "Request summary",            status: has(c.what) ? "captured" : "not-started", snippet: c.what ? trim(c.what) : undefined },
        { id: "who",    label: "Requester name",             status: has(c.raisedBy) ? "captured" : "missing", snippet: c.raisedBy },
        { id: "contact",label: "Requester contact",          status: has(c.requesterContact) ? "captured" : "review", snippet: c.requesterContact },
        { id: "rel",    label: "Relationship to service",    status: has(c.relationship) ? "captured" : "review", snippet: c.relationship },
        { id: "type",   label: "Request type",               status: c.requestType ? "captured" : "missing", snippet: c.requestType },
        { id: "site",   label: "Site / house / unit",        status: has(c.whereDetail) ? "captured" : "missing", snippet: c.whereDetail },
        { id: "date",   label: "Request received date",      status: timeStatus, snippet: c.when },
        { id: "docs",   label: "Documents requested",        status: has(c.documentsRequested) ? "captured" : "review", snippet: c.documentsRequested ? trim(c.documentsRequested) : undefined },
        { id: "urg",    label: "Urgency",                    status: c.urgency ? "captured" : "missing", snippet: c.urgency },
      ];
    }

    switch (incidentTypeKey) {
      case "fall": return fall;
      case "medication":
        return [
          { id: "what",   label: "What happened",            status: has(c.what) ? "captured" : "not-started" },
          { id: "tl",     label: "Time and location",        status: timeStatus },
          { id: "med",    label: "Medication / dose detail", status: mentions(c.what, /\b(med|dose|tablet|mg|ml|warfarin|insulin)\b/i) ? "captured" : "review", hint: "Drug, dose, route" },
          { id: "imm",    label: "Immediate action taken",   status: has(c.response) ? "captured" : "not-started" },
          { id: "harm",   label: `Harm to ${terms.singular}`,         status: injuryStatus },
          { id: "wit",    label: "Witnesses / statements",   status: witnessStatus },
          { id: "notif",  label: "Notifications made",       status: notifStatus, hint: "GP, family, pharmacy" },
          { id: "follow", label: "Follow-up actions",        status: followStatus, hint: "MAR review, audit" },
        ];
      case "behaviour":
        return [
          { id: "what",    label: "What happened",            status: has(c.what) ? "captured" : "not-started" },
          { id: "tl",      label: "Time and location",        status: timeStatus },
          { id: "trigger", label: "Trigger / antecedent",     status: mentions([c.what, c.notes].filter(Boolean).join(" "), /\b(before|trigger|earlier|upset|asked|refused)\b/i) ? "captured" : "review" },
          { id: "imm",     label: "Immediate action taken",   status: has(c.response) ? "captured" : "not-started" },
          { id: "harm",    label: "Harm / safeguarding risk", status: injuryStatus },
          { id: "wit",     label: "Witnesses / statements",   status: witnessStatus },
          { id: "notif",   label: "Notifications made",       status: notifStatus, hint: "PIC, safeguarding lead" },
          { id: "follow",  label: "Follow-up actions",        status: followStatus, hint: "Behaviour support plan" },
        ];
      case "skin":
        return [
          { id: "what",   label: "What happened",          status: has(c.what) ? "captured" : "not-started" },
          { id: "tl",     label: "Time and location",      status: timeStatus },
          { id: "wound",  label: "Wound description",      status: has(c.injuryDetail) ? "captured" : (c.injury ? "review" : "not-started"), hint: "Site, size, depth" },
          { id: "imm",    label: "Immediate action taken", status: has(c.response) ? "captured" : "not-started" },
          { id: "obs",    label: "Skin / pain assessment", status: obsStatus },
          { id: "wit",    label: "Witnesses / statements", status: witnessStatus },
          { id: "notif",  label: "Notifications made",     status: notifStatus, hint: "TVN, GP, family" },
          { id: "follow", label: "Follow-up actions",      status: followStatus, hint: "Dressing plan, photos" },
        ];
      case "missing":
        return [
          { id: "what",   label: "What happened",             status: has(c.what) ? "captured" : "not-started" },
          { id: "tl",     label: "Time last seen & location", status: timeStatus },
          { id: "search", label: "Search actions taken",      status: mentions(c.response, /\b(search|checked|looked|called|found)\b/i) ? "captured" : (has(c.response) ? "review" : "not-started") },
          { id: "harm",   label: "Condition on return",       status: injuryStatus },
          { id: "wit",    label: "Witnesses / statements",    status: witnessStatus },
          { id: "notif",  label: "Notifications made",        status: notifStatus, hint: "Family, Gardaí, HIQA" },
          { id: "follow", label: "Follow-up actions",         status: followStatus, hint: "Care plan, risk review" },
        ];
      case "complaint":
        return [
          { id: "what",   label: "Complaint summary",              status: has(c.what) ? "captured" : "not-started" },
          { id: "tl",     label: "Date and location",              status: timeStatus },
          { id: "who",    label: "Complainant identified",         status: witnessStatus, hint: "Name + relationship" },
          { id: "imm",    label: "Immediate response",             status: has(c.response) ? "captured" : "not-started" },
          { id: "notif",  label: "Acknowledgement to complainant", status: notifStatus },
          { id: "follow", label: "Investigation / follow-up",      status: followStatus },
        ];
      default:
        return [
          { id: "what",   label: "What happened",          status: has(c.what) ? "captured" : "not-started" },
          { id: "tl",     label: "Time and location",      status: timeStatus },
          { id: "imm",    label: "Immediate action taken", status: has(c.response) ? "captured" : "not-started" },
          { id: "harm",   label: "Injury / harm level",    status: injuryStatus },
          { id: "wit",    label: "Witnesses / statements", status: witnessStatus },
          { id: "notif",  label: "Notifications made",     status: notifStatus },
          { id: "follow", label: "Follow-up actions",      status: followStatus },
        ];
    }
  };

  const checklist = buildChecklist();
  const capturedCount = checklist.filter(i => i.status === "captured").length;
  const capturedReviewedCount = checklist.filter(i => i.status === "captured" || i.status === "review").length;
  const submitReady = checklist.length > 0 && checklist.every(i => i.status === "captured" || i.status === "review");

  const handleSaveDraft = () => {
    toast("Draft saved", { description: "You can come back and finish this capture later." });
  };

  // Unresolved items LogUp wants the reviewer to be aware of.
  const unresolvedReview = checklist.filter(i => i.status === "review");
  const unresolvedMissing = checklist.filter(i => i.status === "missing" || i.status === "not-started");
  const hasUnresolved = unresolvedReview.length + unresolvedMissing.length > 0;

  const handleSubmitClick = () => {
    if (!anchorsOk) return;
    if (hasUnresolved) {
      setShowConfirm(true);
      return;
    }
    handleSubmitDraft();
  };

  const handleConfirmSubmit = () => {
    setShowConfirm(false);
    handleSubmitDraft();
  };

  type DisplayStatus = EvStatus | "pending";
  // The AI never blocks submission, so missing/not-started both render as
  // a soft neutral "Still needed" before the user has typed anything, and
  // continue to render in muted tones afterwards. We never use red here —
  // unresolved items become reviewer flags after submission instead.
  const displayStatus = (s: EvStatus): DisplayStatus => {
    if (!hasUserSent) return "pending";
    if (s === "not-started" || s === "missing") return "pending";
    return s;
  };

  const STATUS_META: Record<DisplayStatus, { label: string; icon: typeof Circle; dot: string; text: string; bg: string }> = {
    "pending":     { label: "Still needed", icon: Circle,       dot: "bg-muted-foreground/30", text: "text-muted-foreground", bg: "bg-transparent" },
    "not-started": { label: "Still needed", icon: Circle,       dot: "bg-muted-foreground/30", text: "text-muted-foreground", bg: "bg-transparent" },
    "captured":    { label: "Captured",     icon: CheckCircle2, dot: "bg-success",             text: "text-success",          bg: "bg-success/10" },
    "review":      { label: "Needs follow-up", icon: Clock,     dot: "bg-warning",             text: "text-warning",          bg: "bg-warning/10" },
    "missing":     { label: "Missing",      icon: AlertCircle,  dot: "bg-destructive",         text: "text-destructive",      bg: "bg-destructive/10" },
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 pb-20 space-y-4">
      {/* Hero */}
      <motion.div {...fade} transition={{ duration: 0.4 }}>
        <h1 className="font-heading text-2xl font-bold text-foreground">Log an Event</h1>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed max-w-xl">
          Tell LogUp what happened in your own words. The assistant will help structure the record
          and prompt for any missing details — one question at a time.
        </p>
      </motion.div>

      {/* Anchors — compact, balanced */}
      <motion.div {...fade} transition={{ delay: 0.06, duration: 0.4 }} className="bg-card rounded-2xl shadow-soft border border-border p-4">
        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 min-h-[18px]">
              <Building2 className="h-3.5 w-3.5" /> Site <span className="text-destructive">*</span>
            </label>
            <Select value={site} onValueChange={setSite}>
              <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue placeholder="Select site" /></SelectTrigger>
              <SelectContent>
                {SITE_OPTIONS.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 min-h-[18px]">
              <UserIcon className="h-3.5 w-3.5" /> {terms.Singular} {requiresResident ? <span className="text-destructive">*</span> : <span className="text-muted-foreground/70 font-normal">(optional)</span>}
            </label>
            <ServiceUserPicker
              users={siteServiceUsers}
              value={resident}
              onChange={pickResident}
              siteChosen={!!site}
              singular={terms.singular}
              plural={terms.plural}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 min-h-[18px]">
              <Tag className="h-3.5 w-3.5" /> Event type <span className="text-destructive">*</span>
            </label>
            <Select
              value={eventType}
              onValueChange={(v) => { setEventType(v as EventType); setEventTypeConfirmed(true); }}
            >
              <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue placeholder="Select event type" /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground leading-snug">
              {eventTypeConfirmed
                ? "Confirmed by you."
                : hasUserSent
                  ? <>AI suggestion · <button type="button" onClick={() => setEventTypeConfirmed(true)} className="text-primary hover:underline">confirm</button></>
                  : "AI will suggest based on what you describe."}
            </p>
          </div>
          {requiresIncidentSubType && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 min-h-[18px]">
                <Shield className="h-3.5 w-3.5" /> Incident sub-type <span className="text-destructive">*</span>
              </label>
              <Select value={incidentTypeKey} onValueChange={setIncidentTypeKey}>
                <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {INCIDENT_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2 md:col-span-3 lg:col-span-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 min-h-[18px]">
              <Languages className="h-3.5 w-3.5" /> Capture language
            </label>
            <Select value={language} onValueChange={(v) => setLanguage(v as SourceLanguage | "auto")}>
              <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="pl">Polish</SelectItem>
                <SelectItem value="ro">Romanian</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="pt">Portuguese</SelectItem>
                <SelectItem value="fr">French</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground leading-snug">
              Auto-detect by default.
            </p>
          </div>
        </div>
      </motion.div>


      {/* Unified LogUp Assistant card: chat (left) + guidance rail (right) */}
      <motion.div
        {...fade}
        transition={{ delay: 0.12, duration: 0.4 }}
        className="bg-card rounded-2xl shadow-soft border border-border overflow-hidden"
      >
        {/* Header spans full width */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 bg-secondary/20">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-heading font-semibold text-foreground leading-tight">LogUp Assistant</p>
              <p className="text-[10px] text-muted-foreground">Guides you through what's needed</p>
            </div>
          </div>
          {hasUserSent && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {capturedCount}/{checklist.length} evidence captured
            </span>
          )}
        </div>

        <div className="grid lg:grid-cols-[7fr_3fr] items-stretch">
          {/* LEFT — chat conversation + input */}
          <div className="flex flex-col lg:border-r border-border">
            {/* Chat thread */}
            <div ref={scrollerRef} className="px-5 py-4 max-h-[420px] min-h-[220px] overflow-y-auto space-y-3">
              {!anchorsOk && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center py-8 px-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Select the site{requiresResident ? `, ${terms.singular} ` : " "}and event type to begin.</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
                    LogUp will then guide the capture and prompt for missing details.
                  </p>
                </div>
              )}


              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}
                  >
                    {m.role === "bot" && (
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[80%] ${m.role === "user" ? "items-end" : ""}`}>
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          m.role === "user"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-secondary/60 text-foreground rounded-bl-sm"
                        }`}
                      >
                        {m.role === "user" && m.voice && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold opacity-80 mr-1.5">
                            <Mic className="h-3 w-3" /> Voice
                          </span>
                        )}
                        {m.text}
                      </div>
                      {m.role === "bot" && m.suggestions && m.suggestions.length > 0 && pendingField !== "done" && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {m.suggestions.map((s) => (
                            <button
                              key={s}
                              onClick={() => handleSuggestion(s)}
                              className="text-[11px] px-2.5 py-1 rounded-full bg-background border border-border hover:bg-secondary/40 hover:border-primary/40 text-foreground transition-colors"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1 px-1">{m.ts}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {pendingField === "done" && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 mt-2 p-3 rounded-xl bg-success/10 border border-success/20">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                  <div className="flex-1 text-sm text-foreground">
                    {!hasUnresolved ? (
                      <>
                        <p className="font-medium">All evidence captured.</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Use “Submit for review” below to send the structured draft to the PIC.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">Ready to submit with flags.</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          LogUp will flag missing or unclear items for human review.
                        </p>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input bar */}
            <div className="px-3 py-3 border-t border-border bg-secondary/10 mt-auto">
              {prefill && <p className="mb-3 break-words text-sm font-semibold">Linked visit · {prefill.visitId}</p>}
              <div className="mb-3"><CareVoiceRecorder disabled={!anchorsOk || pendingField === "done"} onTranscript={(text) => { setDraft((old) => old ? `${old}\n${text}` : text); setOriginalTranscript((old) => old ? `${old}\n${text}` : text); setVoiceSource(true); inputRef.current?.focus(); }} /></div>
              <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={!anchorsOk}
                    placeholder={anchorsOk ? "Tell LogUp what happened…  (Enter to send, Shift+Enter for newline)" : `Select site, ${terms.singular} and event type to start.`}
                    rows={1}
                    className="flex-1 min-h-[40px] max-h-[140px] resize-none rounded-xl bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!anchorsOk || !draft.trim() || pendingField === "done"}
                    size="icon"
                    className="h-10 w-10 rounded-xl shrink-0"
                    aria-label="Send"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              {language === "auto" && draft.trim().length > 0 && detectedLang.language !== "en" && (
                <div className="mt-2 px-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Languages className="h-3 w-3" />
                  Detected: <span className="text-foreground font-medium">{LANGUAGE_LABELS[effectiveLang]}</span>
                  <span className="text-muted-foreground/60">·</span>
                  <button type="button" onClick={() => setLanguage(effectiveLang)} className="text-primary hover:underline">
                    confirm
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — built-in guidance / status rail */}
          <aside className="bg-secondary/10 px-4 py-4 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                <ListChecks className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-heading font-semibold text-foreground leading-tight">Evidence LogUp may prompt for</p>
                <p className="text-[10px] text-muted-foreground">
                  {eventType}{requiresIncidentSubType && incidentTypeOption ? ` · ${incidentTypeOption.label}` : ""}
                </p>
              </div>
            </div>

            {requiresIncidentSubType && !incidentTypeKey ? (
              <p className="text-xs text-muted-foreground py-6 px-2 text-center leading-relaxed">
                Evidence prompts will appear once an incident sub-type is selected.
              </p>

            ) : (
              <>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                  {hasUserSent
                    ? `${capturedCount}/${checklist.length} evidence items captured`
                    : "Tell LogUp what happened in your own words. It will mark these off automatically and ask only for anything still needed."}
                </p>
                <ul className="space-y-1">
                  {checklist.map((item) => {
                    const ds = displayStatus(item.status);
                    const meta = STATUS_META[ds];
                    const showSnippet = ds === "captured" || ds === "review";
                    return (
                      <li
                        key={item.id}
                        className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 ${meta.bg} border border-transparent`}
                      >
                        <span className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${meta.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs font-medium leading-snug ${ds === "pending" || ds === "not-started" ? "text-muted-foreground" : "text-foreground"}`}>
                              {item.label}
                            </p>
                            {hasUserSent && (
                              <span className={`text-[10px] font-medium ${meta.text} shrink-0`}>{meta.label}</span>
                            )}
                          </div>
                          {showSnippet && item.snippet ? (
                            <p className="text-[11px] text-foreground/80 leading-snug mt-0.5 italic">
                              “{item.snippet}”
                            </p>
                          ) : item.hint && (ds === "captured" || ds === "review") ? (
                            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{item.hint}</p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            <p className="mt-auto pt-4 text-[10px] text-muted-foreground leading-relaxed">
              AI can suggest likely evidence needs. A human reviews and approves before submission.
            </p>

          </aside>
        </div>
      </motion.div>

      {/* Evidence — first-class panel, always visible during capture */}
      <motion.div
        {...fade}
        transition={{ delay: 0.14, duration: 0.4 }}
        className="bg-card rounded-2xl shadow-soft border border-border p-4"
      >
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div>
            <p className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-primary" /> Evidence collection
              <span className="text-[10px] font-normal text-muted-foreground">(add any time before submitting)</span>
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
              Photos, documents, audio or video. Each item is timestamped, attributed to you and recorded in the incident audit trail.
            </p>
          </div>
          {evidence.length > 0 && (
            <span className="text-[10px] text-muted-foreground shrink-0 mt-1">
              {evidence.length} item{evidence.length === 1 ? "" : "s"} attached
            </span>
          )}
        </div>
        <EvidenceTray
          items={evidence}
          uploadedBy={currentUser}
          onAdd={(item) => incidentsStore.addDraftEvidence(item)}
          onRemove={(id) => incidentsStore.removeDraftEvidence(id)}
          compact
        />
      </motion.div>


      {/* Bottom actions */}

      {anchorsOk && (!requiresIncidentSubType || incidentTypeKey) && (
        <motion.div {...fade} transition={{ delay: 0.16, duration: 0.4 }} className="flex items-center justify-between gap-3 bg-card rounded-2xl border border-border p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">
            {!hasUnresolved && hasUserSent
              ? "All evidence captured — ready to submit."
              : hasUnresolved && hasUserSent
                ? "Some information may still be missing — you can submit anyway. LogUp will flag it for the reviewer."
                : "Start by describing what happened — or submit anyway and LogUp will flag what's still needed."}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl" onClick={handleSaveDraft}>
              Save draft
            </Button>
            <Button onClick={handleSubmitClick} disabled={!anchorsOk} className="rounded-xl gap-2">
              <Sparkles className="h-4 w-4" /> Submit for review
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}

      {/* Confirm-submit modal — shown when unresolved items remain */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit with missing information?</AlertDialogTitle>
            <AlertDialogDescription>
              LogUp has identified some information that may still be missing or unclear.
              You can still submit this incident for human review. The missing items will
              be flagged for the reviewer.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 max-h-[40vh] overflow-y-auto">
            {unresolvedReview.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-warning uppercase tracking-wide mb-1.5">
                  Needs follow-up
                </p>
                <ul className="space-y-1">
                  {unresolvedReview.map(i => (
                    <li key={i.id} className="flex items-start gap-2 text-sm text-foreground">
                      <Clock className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                      <span>{i.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {unresolvedMissing.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  Still needed
                </p>
                <ul className="space-y-1">
                  {unresolvedMissing.map(i => (
                    <li key={i.id} className="flex items-start gap-2 text-sm text-foreground">
                      <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <span>{i.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Go back and add details</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmSubmit}>Submit anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Incidents;
