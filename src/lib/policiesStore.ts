// In-memory Policy Hub store for the LogUp prototype.
// Mirrors the pattern of incidentsStore — no backend, subscription based.

import { notificationsStore } from "./notifications";

export type PolicyCategory = "Policy" | "Procedure" | "Template" | "Operational" | "Guidance";
export type PolicyDocStatus = "live" | "draft_in_progress" | "in_review" | "returned" | "approved_pending_publish" | "archived";
export type VersionStatus = "draft" | "in_review" | "approved" | "published" | "archived" | "returned";

export type TopicGroup = string;

// Mutable in-place — admins can add and reorder topics. Keep the same array
// reference so consumers re-reading TOPIC_GROUPS see updates after emit().
export const TOPIC_GROUPS: TopicGroup[] = [
  "Safety",
  "Governance",
  "Clinical / Care",
  "Safeguarding",
  "Medication",
  "Staff / HR",
  "Templates & Forms",
  "Site Operations",
];


export interface Attachment {
  id: string;
  name: string;
  sizeKb: number;
  kind: "pdf" | "docx" | "xlsx" | "form" | "template";
}

export interface SourceUpload {
  id: string;
  filename: string;
  sizeKb: number;
  uploadedAt: string;
  uploadedBy: string;
}

export type ApprovalStepStatus = "pending" | "approved" | "returned" | "skipped";

export interface ApprovalStep {
  id: string;
  role: string;       // e.g. "Director of Nursing" — primary approver role
  name: string;       // e.g. "Marie Doherty" — primary approver
  status: ApprovalStepStatus;
  decidedAt?: string;
  note?: string;
  // Optional co-approvers at this same level. Any ONE of {primary, ...coApprovers}
  // can approve this step ("either/or" sign-off). Useful when a colleague can
  // cover for the named approver to keep the chain moving.
  coApprovers?: { role: string; name: string }[];
  // Records who actually approved when not the primary (e.g. a co-approver).
  decidedBy?: string;
}

export interface ApprovalChainTemplate {
  id: string;
  name: string;
  description?: string;
  // Each level is a step; co-approvers within a level can substitute for each other.
  levels: { role: string; name: string; coApprovers?: { role: string; name: string }[] }[];
  // Auto-assignment rules — match by topic and/or document category.
  topics: TopicGroup[];      // empty = no topic restriction
  categories: PolicyCategory[]; // empty = no category restriction
  isDefault?: boolean;       // fallback when nothing else matches
  createdAt: string;
  updatedAt: string;
}

export interface PolicyVersion {
  id: string;
  docId: string;
  versionNumber: string; // e.g. "3.2"
  status: VersionStatus;
  bodyHtml: string;
  attachments: Attachment[];
  changeSummary: string;
  editedBy: string;
  editedAt: string;
  submittedAt?: string;
  approvedBy?: string;        // final approver (kept for compatibility)
  approvedAt?: string;
  publishedAt?: string;
  publishedBy?: string;
  returnedNote?: string;
  derivedFromUploadId?: string;
  approvalChain?: ApprovalStep[];
}

export const DEFAULT_APPROVERS: { role: string; name: string }[] = [
  { role: "Director of Nursing", name: "Marie Doherty" },
  { role: "Chief Governance / Quality Officer", name: "Conor Hughes" },
  { role: "Chief Executive Officer", name: "Patrick Lenihan" },
  { role: "Person in Charge", name: "Áine Ryan" },
  { role: "Clinical Lead", name: "Dr. Niamh Walsh" },
  { role: "Board of Management", name: "Board Chair" },
];

export interface PolicyDoc {
  id: string;
  title: string;
  category: PolicyCategory;
  topicGroup: TopicGroup;
  owner: string;
  tags: string[];
  currentVersionId: string | null; // pointer to latest published version
  livePublishedAt?: string;
  nextReviewDate?: string;
  sourceUpload?: SourceUpload;
  description?: string;
}

type Listener = () => void;

let docs: PolicyDoc[] = [];
let versions: PolicyVersion[] = [];
let chainTemplates: ApprovalChainTemplate[] = [];
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;
const nowDisplay = () => {
  const d = new Date();
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
};
const nowTimestamp = () => {
  const d = new Date();
  return `${d.toLocaleDateString("en-IE", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}`;
};

const bumpVersion = (v: string, kind: "minor" | "major" = "minor") => {
  const [maj, min] = v.split(".").map((n) => parseInt(n, 10));
  if (kind === "major") return `${maj + 1}.0`;
  return `${maj}.${(min || 0) + 1}`;
};

// ---------- Rich content helpers ----------
type Section =
  | { h: string; p: string }
  | { h: string; ul: string[] }
  | { h: string; ol: string[] }
  | { h: string; mixed: Array<{ p?: string; ul?: string[]; ol?: string[]; h3?: string }> };

const richBody = (title: string, sections: Section[]) => {
  const renderSection = (s: Section) => {
    let inner = `<h2>${s.h}</h2>`;
    if ("p" in s) inner += `<p>${s.p}</p>`;
    else if ("ul" in s) inner += `<ul>${s.ul.map((i) => `<li>${i}</li>`).join("")}</ul>`;
    else if ("ol" in s) inner += `<ol>${s.ol.map((i) => `<li>${i}</li>`).join("")}</ol>`;
    else if ("mixed" in s) {
      inner += s.mixed
        .map((m) => {
          let out = "";
          if (m.h3) out += `<h3>${m.h3}</h3>`;
          if (m.p) out += `<p>${m.p}</p>`;
          if (m.ul) out += `<ul>${m.ul.map((i) => `<li>${i}</li>`).join("")}</ul>`;
          if (m.ol) out += `<ol>${m.ol.map((i) => `<li>${i}</li>`).join("")}</ol>`;
          return out;
        })
        .join("");
    }
    return inner;
  };
  return `<h1>${title}</h1>${sections.map(renderSection).join("")}`;
};

// Short body kept for archived/draft historic versions
const seedDocBody = (title: string, sections: { h: string; p: string }[]) =>
  `<h1>${title}</h1>${sections.map((s) => `<h2>${s.h}</h2><p>${s.p}</p>`).join("")}`;

// ---------- Seed ----------
const seed = () => {
  const mk = (
    doc: Omit<PolicyDoc, "currentVersionId">,
    versionList: Omit<PolicyVersion, "docId" | "id">[],
  ) => {
    const docId = doc.id;
    const vs: PolicyVersion[] = versionList.map((v) => ({
      ...v,
      id: uid("ver"),
      docId,
    }));
    versions.push(...vs);
    const published = [...vs].reverse().find((v) => v.status === "published");
    docs.push({
      ...doc,
      currentVersionId: published?.id ?? null,
      livePublishedAt: published?.publishedAt,
    });
  };

  // ---------- SAFEGUARDING ----------
  mk(
    {
      id: "doc-safeguarding",
      title: "Safeguarding Vulnerable Adults Policy",
      category: "Policy",
      topicGroup: "Safeguarding",
      owner: "Áine Ryan, PIC",
      tags: ["Safeguarding", "HIQA", "Adults at Risk"],
      nextReviewDate: "18 Sep 2026",
      description: "Framework for prevention, identification and reporting of suspected abuse or neglect.",
    },
    [
      {
        versionNumber: "3.2",
        status: "published",
        bodyHtml: richBody("Safeguarding Vulnerable Adults Policy", [
          { h: "1. Purpose", p: "This policy sets out our commitment to protect adults at risk from all forms of abuse, neglect and exploitation. It is aligned with the HSE National Policy on Safeguarding Vulnerable Persons at Risk of Abuse, the Assisted Decision-Making (Capacity) Act 2015, and HIQA National Standards for Residential Care Settings for Older People." },
          { h: "2. Scope", p: "This policy applies to all employees, agency staff, volunteers, students on placement and contractors working in or visiting any of our designated centres. It covers all residents and any visiting adult who may be at risk." },
          { h: "3. Policy statement", p: "We operate a zero-tolerance approach to abuse. Every person has a right to be safe, to be treated with dignity and respect, and to live free from fear, harm or coercion. All staff have a duty to recognise, respond to and report safeguarding concerns without delay." },
          {
            h: "4. Definitions",
            ul: [
              "<strong>Adult at risk:</strong> a person aged 18 or over who, due to disability, illness or frailty, may be unable to protect themselves from harm.",
              "<strong>Abuse:</strong> physical, psychological, financial, sexual, discriminatory, institutional or neglect-based harm.",
              "<strong>Designated Officer:</strong> the named senior person responsible for receiving and managing safeguarding concerns.",
              "<strong>Preliminary screening:</strong> the initial assessment to decide whether a concern requires a full safeguarding plan.",
            ],
          },
          {
            h: "5. Roles and responsibilities",
            mixed: [
              { h3: "All staff", ul: ["Recognise the signs of abuse and neglect.", "Report any concern to the Person in Charge or Designated Officer immediately.", "Record the concern factually using the resident's own words where possible."] },
              { h3: "Person in Charge", ul: ["Conduct preliminary screening within 24 hours.", "Take immediate action to ensure resident safety.", "Liaise with the HSE Safeguarding and Protection Team where required."] },
              { h3: "Designated Officer", ul: ["Lead the internal safeguarding plan.", "Notify HIQA via NF06 where the threshold is met.", "Maintain the safeguarding register and present it at the Quality & Safety Committee."] },
            ],
          },
          {
            h: "6. Key principles",
            ul: [
              "Empowerment — supporting the person to make their own decisions and give informed consent.",
              "Prevention — acting before harm occurs through training, supervision and risk assessment.",
              "Proportionality — the least intrusive response appropriate to the risk presented.",
              "Protection — providing support and representation to those in greatest need.",
              "Partnership — working with residents, families, advocates and statutory agencies.",
              "Accountability — transparency and clear governance in delivering safeguarding.",
            ],
          },
          {
            h: "7. Reporting and escalation",
            ol: [
              "Ensure the immediate safety of the resident.",
              "Report verbally to the Person in Charge within the same shift.",
              "Record the concern in LogUp Incidents within the same shift, including factual detail and any disclosure verbatim.",
              "The PIC completes preliminary screening within 24 hours.",
              "Where the threshold is met, the Designated Officer notifies the HSE Safeguarding and Protection Team and HIQA (NF06) within 3 working days.",
              "Trigger Open Disclosure where applicable under the Patient Safety Act 2023.",
            ],
          },
          { h: "8. Monitoring and review", p: "All safeguarding concerns are reviewed monthly at the Quality & Safety meeting. Themes and learning are fed into staff supervision and the annual training plan. This policy is reviewed every 12 months or sooner where legislation, guidance or learning from incidents requires it." },
          { h: "9. Related documents", p: "Incident Reporting Procedure · Open Disclosure Policy · Restraint Policy · Complaints Management Procedure · Staff Induction & Mandatory Training Policy." },
        ]),
        attachments: [
          { id: uid("att"), name: "HSE Safeguarding Reporting Form.pdf", sizeKb: 184, kind: "form" },
          { id: uid("att"), name: "Safeguarding decision tree.pdf", sizeKb: 96, kind: "pdf" },
        ],
        changeSummary: "Updated Designated Officer contact details and aligned reporting timelines with HSE 2023 guidance.",
        editedBy: "Áine Ryan",
        editedAt: "12 Jan 2025",
        approvedBy: "Marie Doherty, Director",
        approvedAt: "18 Jan 2025",
        publishedAt: "20 Jan 2025",
      },
      {
        versionNumber: "3.3",
        status: "in_review",
        bodyHtml: seedDocBody("Safeguarding Vulnerable Adults Policy", [
          { h: "1. Purpose", p: "Updated to reference the Patient Safety (Notifiable Incidents and Open Disclosure) Act 2023." },
          { h: "2. Scope", p: "Applies to all employees, agency staff, volunteers and contractors working across our designated centres." },
          { h: "3. Reporting concerns", p: "Concerns must now be reported within 2 hours and trigger an Open Disclosure assessment." },
          { h: "4. Roles and responsibilities", p: "Adds Quality & Safety Lead as second Designated Officer." },
        ]),
        attachments: [
          { id: uid("att"), name: "HSE Safeguarding Reporting Form.pdf", sizeKb: 184, kind: "form" },
        ],
        changeSummary: "Aligned with Patient Safety Act 2023; added Open Disclosure trigger and second Designated Officer.",
        editedBy: "Áine Ryan",
        editedAt: "8 Apr 2025",
        submittedAt: "9 Apr 2025",
      },
      {
        versionNumber: "3.1",
        status: "archived",
        bodyHtml: "<h1>Safeguarding Vulnerable Adults Policy</h1><p>Previous version.</p>",
        attachments: [],
        changeSummary: "Annual review, no material changes.",
        editedBy: "Áine Ryan",
        editedAt: "10 Jan 2024",
        approvedBy: "Marie Doherty",
        approvedAt: "15 Jan 2024",
        publishedAt: "16 Jan 2024",
      },
    ],
  );

  // ---------- MEDICATION ----------
  mk(
    {
      id: "doc-medication",
      title: "Medication Management Procedure",
      category: "Procedure",
      topicGroup: "Medication",
      owner: "Dr. Niamh Walsh, Clinical Lead",
      tags: ["Clinical", "Medication", "HIQA Reg 29"],
      nextReviewDate: "10 Aug 2026",
      description: "Safe administration, storage and recording of medicinal products.",
    },
    [
      {
        versionNumber: "2.1",
        status: "published",
        bodyHtml: richBody("Medication Management Procedure", [
          { h: "1. Purpose", p: "To ensure that all medicinal products are prescribed, stored, administered, recorded and disposed of safely, in line with the Medicinal Products (Prescription and Control of Supply) Regulations, the Misuse of Drugs Acts, NMBI Guidance to Nurses and Midwives on Medication Management, and HIQA Regulation 29." },
          { h: "2. When this procedure applies", p: "At every stage of the medication cycle within the designated centre: prescription receipt, stock control, administration round, PRN use, refusal, omission, transfer, and disposal." },
          {
            h: "3. Roles and responsibilities",
            mixed: [
              { h3: "Prescriber", p: "Only registered medical or nurse prescribers may issue prescriptions. Verbal orders are accepted only in exceptional circumstances and must be confirmed in writing within 24 hours." },
              { h3: "Registered Nurse", p: "Responsible for safe administration, contemporaneous recording on the eMAR, and identification of any contraindication or adverse reaction." },
              { h3: "Healthcare Assistant", p: "Does not administer medication. May support residents with self-administration once a self-medication assessment is in place." },
              { h3: "Person in Charge", p: "Oversees medication governance, completes monthly medication audit, and leads error reviews." },
            ],
          },
          {
            h: "4. Step-by-step administration",
            ol: [
              "Wash hands and prepare the medication trolley in a quiet, well-lit area.",
              "Confirm resident identity using two identifiers (name and date of birth or photo).",
              "Check the eMAR against the original prescription: right resident, right drug, right dose, right route, right time, right documentation.",
              "Two-person check is mandatory for controlled drugs, insulin, warfarin, methotrexate and any high-risk medication.",
              "Administer the medication and remain with the resident until it is taken.",
              "Record administration on the eMAR contemporaneously. Use the standard omission codes for any dose not given.",
              "Lock the trolley before leaving the bay.",
            ],
          },
          {
            h: "5. Storage",
            ul: [
              "All medications stored in locked trolleys or cabinets, accessible only to nurses on duty.",
              "Controlled drugs stored in a CD cabinet that meets the Misuse of Drugs Regulations specification.",
              "Refrigerated medications kept between 2°C and 8°C; fridge temperature checked and logged daily.",
              "Stock rotated using first-in-first-out and checked weekly for expiry.",
            ],
          },
          {
            h: "6. Documentation required",
            ul: [
              "Signed eMAR for every administration.",
              "Controlled Drugs Register entry, signed by two nurses, for every CD transaction.",
              "Self-medication risk assessment for any resident managing their own medication.",
              "Medication reconciliation form on admission, transfer and discharge.",
            ],
          },
          {
            h: "7. Errors and escalation",
            ol: [
              "Ensure the resident is clinically safe; seek medical review if any concern.",
              "Inform the Person in Charge and the prescriber.",
              "Report the error in LogUp Incidents within the same shift.",
              "Open Disclosure conversation held with the resident or representative.",
              "Pharmacy notified for review of stock and process.",
            ],
          },
          { h: "8. Exceptions", p: "Crushing or covert administration is permitted only with documented capacity assessment, multidisciplinary agreement, pharmacist sign-off and written care plan reviewed monthly." },
          { h: "9. Review", p: "Reviewed annually or following any significant medication incident, change in NMBI guidance, or HIQA inspection finding." },
        ]),
        attachments: [
          { id: uid("att"), name: "Controlled Drugs Register Template.xlsx", sizeKb: 42, kind: "template" },
          { id: uid("att"), name: "Self-Medication Risk Assessment.docx", sizeKb: 58, kind: "docx" },
        ],
        changeSummary: "Added insulin to two-person check list and clarified covert administration requirements.",
        editedBy: "Niamh Walsh",
        editedAt: "2 Feb 2025",
        approvedBy: "Marie Doherty",
        approvedAt: "9 Feb 2025",
        publishedAt: "10 Feb 2025",
      },
      {
        versionNumber: "2.2",
        status: "draft",
        bodyHtml: seedDocBody("Medication Management Procedure", [
          { h: "1. Prescribing", p: "Adds nurse-prescriber pathway." },
          { h: "2. Administration", p: "Two-person check required for controlled drugs and high-risk medications." },
        ]),
        attachments: [],
        changeSummary: "Working draft — adding nurse-prescriber pathway.",
        editedBy: "Niamh Walsh",
        editedAt: "18 Apr 2025",
      },
    ],
  );

  // ---------- INCIDENT REPORTING (Governance) ----------
  mk(
    {
      id: "doc-incident-reporting",
      title: "Incident Reporting Procedure",
      category: "Procedure",
      topicGroup: "Governance",
      owner: "Áine Ryan, PIC",
      tags: ["Governance", "HIQA", "NIMS"],
      nextReviewDate: "14 Nov 2026",
      description: "How incidents are captured, escalated and reported through LogUp and to external bodies.",
    },
    [
      {
        versionNumber: "4.0",
        status: "published",
        bodyHtml: richBody("Incident Reporting Procedure", [
          { h: "1. Purpose", p: "To ensure that all incidents, near-misses and adverse events are captured, escalated, investigated and reported in a consistent, timely and learning-focused way, in line with the HSE Incident Management Framework, the Patient Safety Act 2023 and HIQA notification requirements." },
          { h: "2. When this procedure applies", p: "To any unplanned event involving a resident, staff member, visitor or contractor that resulted in, or had the potential to result in, harm, loss or damage." },
          {
            h: "3. Step-by-step process",
            ol: [
              "Make the situation safe — provide first aid or clinical intervention as required.",
              "Notify the Person in Charge or senior nurse on duty immediately.",
              "Open a new incident in LogUp within the shift in which the event occurred.",
              "Capture the facts: date, time, location, persons involved, witnesses, immediate actions taken.",
              "Categorise severity using the HSE matrix (Negligible · Minor · Moderate · Major · Extreme).",
              "PIC reviews within 24 hours and assigns investigation lead and target close-out date.",
              "Severe / Death events escalated immediately by phone to the Director and clinical lead.",
              "Notifiable events submitted via NIMS within 72 hours and to HIQA on the relevant NF form.",
              "Investigation completed using systems analysis or aggregate review as appropriate.",
              "Open Disclosure offered where the event meets the threshold under the 2023 Act.",
              "Close incident in LogUp with root cause, learning and corrective actions assigned.",
            ],
          },
          {
            h: "4. Roles and responsibilities",
            ul: [
              "<strong>All staff:</strong> report any incident or near-miss before end of shift.",
              "<strong>Person in Charge:</strong> triage, escalation, investigation oversight, family communication.",
              "<strong>Quality & Safety Lead:</strong> trend analysis, NIMS submission, learning dissemination.",
              "<strong>Director:</strong> notifiable event sign-off, board reporting, regulator liaison.",
            ],
          },
          {
            h: "5. Documentation required",
            ul: [
              "LogUp Incident record (mandatory within shift).",
              "Witness statements where applicable.",
              "Body Map for any observed injury or unexplained mark.",
              "Investigation report for Moderate and above.",
              "Open Disclosure record where triggered.",
              "NF01–NF06 submission record where notifiable.",
            ],
          },
          {
            h: "6. Escalation triggers",
            ul: [
              "Any death of a resident → immediate verbal escalation to Director and PIC.",
              "Suspected abuse → safeguarding pathway activated in parallel.",
              "Medication error reaching the resident → clinical review within 1 hour.",
              "Cluster of three or more similar events in 30 days → aggregate review opened.",
            ],
          },
          { h: "7. Learning and review", p: "A quarterly thematic review is presented to the Quality & Safety Committee. Learning is communicated to staff via team huddles, supervision and the monthly safety bulletin. This procedure is reviewed annually." },
        ]),
        attachments: [
          { id: uid("att"), name: "HIQA NF Forms checklist.pdf", sizeKb: 78, kind: "pdf" },
          { id: uid("att"), name: "HSE Severity Matrix.pdf", sizeKb: 64, kind: "pdf" },
        ],
        changeSummary: "Major revision — aligned with LogUp digital capture workflow.",
        editedBy: "Áine Ryan",
        editedAt: "5 Mar 2025",
        approvedBy: "Marie Doherty",
        approvedAt: "12 Mar 2025",
        publishedAt: "14 Mar 2025",
      },
    ],
  );

  // ---------- OPEN DISCLOSURE (Governance) ----------
  mk(
    {
      id: "doc-open-disclosure",
      title: "Open Disclosure Policy",
      category: "Policy",
      topicGroup: "Governance",
      owner: "Marie Doherty, Director",
      tags: ["Patient Safety Act 2023", "Disclosure"],
      nextReviewDate: "12 Oct 2026",
      description: "Open communication with residents and families following adverse events.",
    },
    [
      {
        versionNumber: "1.4",
        status: "published",
        bodyHtml: richBody("Open Disclosure Policy", [
          { h: "1. Purpose", p: "To ensure that residents, and where appropriate their families or representatives, are communicated with openly, honestly and compassionately following any patient safety incident, in line with the Patient Safety (Notifiable Incidents and Open Disclosure) Act 2023 and the HSE/SCA Open Disclosure Framework." },
          { h: "2. Scope", p: "Applies to every patient safety incident, near-miss and adverse event that occurs in the course of providing care, regardless of whether the harm is judged to have been preventable." },
          { h: "3. Policy statement", p: "We are committed to a culture of openness. Residents have the right to be told what happened, why it happened, what is being done to put things right, and what is being done to prevent it happening again. Open disclosure is a core element of safe, person-centred care." },
          {
            h: "4. Key principles",
            ul: [
              "Acknowledgement of the event without delay.",
              "A sincere and meaningful expression of regret.",
              "A factual account based on the information available at the time.",
              "An explanation of what will happen next, including investigation and follow-up.",
              "An assurance that learning will be shared and improvements made.",
            ],
          },
          {
            h: "5. Triggers for mandatory open disclosure",
            ul: [
              "Any notifiable patient safety incident under the 2023 Act.",
              "Death or serious harm associated with the provision of care.",
              "Medication error reaching the resident with clinical impact.",
              "Falls resulting in fracture or hospital admission.",
              "Pressure injury Category 3 or above acquired in the centre.",
            ],
          },
          {
            h: "6. Roles and responsibilities",
            mixed: [
              { h3: "Person in Charge", p: "Identifies the trigger, convenes the disclosure meeting and leads the conversation with the resident and family." },
              { h3: "Clinical Lead", p: "Provides clinical context, supports the conversation and answers clinical questions." },
              { h3: "Director", p: "Oversees compliance with the 2023 Act and signs off on the written summary." },
            ],
          },
          {
            h: "7. Process",
            ol: [
              "Identify the trigger and notify the PIC and Director within 24 hours.",
              "Plan the disclosure meeting — who attends, when, where, support persons.",
              "Hold the meeting in a private, comfortable setting with adequate time.",
              "Document the conversation in LogUp using the Open Disclosure record.",
              "Issue a written summary to the resident or representative within 5 working days.",
              "Offer a follow-up meeting once any investigation is complete.",
            ],
          },
          { h: "8. Monitoring and review", p: "All open disclosure events are reviewed quarterly by the Quality & Safety Committee. The policy is reviewed annually, or sooner if legislation changes." },
        ]),
        attachments: [
          { id: uid("att"), name: "Open Disclosure Meeting Record.docx", sizeKb: 72, kind: "docx" },
        ],
        changeSummary: "Aligned triggers with Patient Safety Act 2023 commencement.",
        editedBy: "Marie Doherty",
        editedAt: "2 Mar 2025",
        approvedBy: "Board of Management",
        approvedAt: "10 Mar 2025",
        publishedAt: "12 Mar 2025",
      },
    ],
  );

  // ---------- NO ACCESS / MISSED VISIT (Home support) ----------
  mk(
    {
      id: "doc-no-access",
      title: "No Access / Missed Visit Policy",
      category: "Policy",
      topicGroup: "Clinical / Care",
      owner: "Home Support Manager",
      tags: ["Home support", "No access", "Missed visit", "Lone working"],
      nextReviewDate: "30 Jun 2027",
    },
    [
      {
        versionNumber: "4.0",
        status: "archived",
        bodyHtml: seedDocBody("No Access / Missed Visit Policy", [
          { h: "1. No reply at the door", p: "Wait five minutes, then leave and record the visit as missed." },
        ]),
        attachments: [],
        changeSummary: "Previous version.",
        editedBy: "Home Support Manager",
        editedAt: "2 Feb 2025",
        approvedBy: "Home Support Manager",
        approvedAt: "4 Feb 2025",
        publishedAt: "5 Feb 2025",
      },
      {
        versionNumber: "4.1",
        status: "published",
        bodyHtml: richBody("No Access / Missed Visit Policy", [
          { h: "1. Purpose", p: "To make sure a client's welfare is checked and escalated when a carer cannot gain access to the home or a visit is missed." },
          {
            h: "2. If nobody answers the door",
            ol: [
              "Knock and ring again, and check the access notes for the key safe or agreed entry arrangement.",
              "Follow the agreed contact procedure: phone the client using the number on their record.",
              "Contact the coordinator or on-call contact and tell them you cannot gain access.",
              "Stay at the property until the coordinator or on-call contact tells you what to do next.",
              "If there is concern for the person's welfare, follow the escalation process in section 4.",
            ],
          },
          {
            h: "3. Missed visits",
            ul: [
              "The coordinator contacts the client or their next of kin as soon as a visit is known to be missed.",
              "Every missed visit is recorded in LogUp as a Missed visit event.",
            ],
          },
          { h: "4. Escalation for welfare concerns", p: "The coordinator or on-call contact decides whether to contact next of kin, the GP or emergency services. If you see or hear signs that the person is in immediate danger, call 112 or 999 and then tell the coordinator." },
          { h: "5. Lone worker safety", p: "Do not force entry or put yourself at risk. Keep your phone charged and tell the coordinator when you leave the property." },
        ]),
        attachments: [],
        changeSummary: "Added stay-at-property step and lone worker safety.",
        editedBy: "Home Support Manager",
        editedAt: "10 Sep 2026",
        approvedBy: "Home Support Manager",
        approvedAt: "14 Sep 2026",
        publishedAt: "15 Sep 2026",
      },
      {
        versionNumber: "4.2",
        status: "draft",
        bodyHtml: seedDocBody("No Access / Missed Visit Policy", [
          { h: "2. If nobody answers the door", p: "DRAFT ONLY: proposed new wait time of ten minutes before contacting the coordinator." },
        ]),
        attachments: [],
        changeSummary: "Draft: proposed wait time change.",
        editedBy: "Home Support Manager",
        editedAt: "18 Oct 2026",
      },
    ],
  );

  // ---------- FALLS (Clinical / Care) ----------
  mk(
    {
      id: "doc-falls",
      title: "Falls Management Procedure",
      category: "Procedure",
      topicGroup: "Clinical / Care",
      owner: "Dr. Niamh Walsh, Clinical Lead",
      tags: ["Clinical", "Falls", "Risk"],
      nextReviewDate: "27 Jul 2026",
    },
    [
      {
        versionNumber: "2.0",
        status: "published",
        bodyHtml: richBody("Falls Management Procedure", [
          { h: "1. Purpose", p: "To reduce the incidence and severity of falls, ensure consistent assessment and post-fall management, and promote resident mobility and independence in line with HSE National Falls Policy and HIQA standards." },
          { h: "2. When this procedure applies", p: "On admission for every resident, after any change in mobility or medication, and immediately following any fall, witnessed or unwitnessed." },
          {
            h: "3. Assessment",
            ul: [
              "Falls Risk Assessment completed within 24 hours of admission using the centre's validated tool.",
              "Reassessment after every fall, change in condition, new psychotropic medication, or every 3 months as a minimum.",
              "Lying and standing blood pressure recorded for any resident at high risk.",
              "Vision, footwear, environment and continence considered as part of the multifactorial assessment.",
            ],
          },
          {
            h: "4. Step-by-step post-fall response",
            ol: [
              "Do not move the resident until injury is excluded. Reassure and keep warm.",
              "Carry out an ABCDE check and record observations.",
              "Complete neurological observations every 15 minutes for the first hour following any unwitnessed fall or any fall with head strike, then hourly for 4 hours, then 4-hourly for 24 hours.",
              "Notify the GP or out-of-hours service for any suspected injury, head strike on anticoagulants, or change in baseline.",
              "Notify the family in line with the resident's communication preferences.",
              "Open a LogUp Incident before end of shift, including a Body Map for any visible injury.",
              "Reassess falls risk and update the care plan.",
              "MDT review within 72 hours for any fall resulting in injury.",
            ],
          },
          {
            h: "5. Documentation required",
            ul: [
              "Updated Falls Risk Assessment.",
              "LogUp Incident with severity rating.",
              "Body Map for any observed injury.",
              "Neurological observation chart where indicated.",
              "Updated care plan reflecting new interventions.",
            ],
          },
          { h: "6. Escalation", p: "Any fall resulting in fracture, hospital transfer, or death must be escalated immediately to the PIC and Director. Notifiable under HIQA NF03 where applicable." },
          { h: "7. Review", p: "Falls trends reviewed monthly at the Quality & Safety meeting. Procedure reviewed annually." },
        ]),
        attachments: [
          { id: uid("att"), name: "Falls Risk Assessment.docx", sizeKb: 56, kind: "docx" },
          { id: uid("att"), name: "Post-fall Neuro Obs Chart.pdf", sizeKb: 48, kind: "pdf" },
        ],
        changeSummary: "Updated post-fall observation frequency.",
        editedBy: "Niamh Walsh",
        editedAt: "20 Feb 2025",
        approvedBy: "Marie Doherty",
        approvedAt: "25 Feb 2025",
        publishedAt: "27 Feb 2025",
      },
    ],
  );

  // ---------- RESTRAINT (Safeguarding) ----------
  mk(
    {
      id: "doc-restraint",
      title: "Restraint Policy",
      category: "Policy",
      topicGroup: "Safeguarding",
      owner: "Áine Ryan, PIC",
      tags: ["HIQA", "Rights", "Restraint"],
      nextReviewDate: "16 Jan 2026",
    },
    [
      {
        versionNumber: "1.2",
        status: "published",
        bodyHtml: richBody("Restraint Policy", [
          { h: "1. Purpose", p: "To set out our commitment to a restraint-free environment as the default position, and to ensure that any use of restraint is the least restrictive intervention, used only as a last resort, in line with the HSE National Policy on the Use of Restraint and HIQA standards." },
          { h: "2. Scope", p: "All forms of restraint — physical, environmental, chemical and psychological — across every part of the designated centre." },
          { h: "3. Policy statement", p: "We will work proactively to avoid restraint through person-centred care planning, environmental design, meaningful activity and skilled de-escalation. Restraint is never used as a substitute for adequate staffing or care." },
          {
            h: "4. Definitions",
            ul: [
              "<strong>Physical restraint:</strong> any manual method that restricts a person's movement.",
              "<strong>Environmental restraint:</strong> use of locked doors, bedrails, low beds or chair belts that limit movement.",
              "<strong>Chemical restraint:</strong> use of medication primarily to control behaviour rather than treat a clinical condition.",
              "<strong>Psychological restraint:</strong> language, rules or routines that limit a person's choice or freedom.",
            ],
          },
          {
            h: "5. Key principles",
            ul: [
              "Restraint-free is the default and stated goal.",
              "Any restraint is the least restrictive option and used for the shortest possible time.",
              "Informed consent obtained from the resident or their representative.",
              "Multidisciplinary review and clear clinical rationale recorded.",
              "Continuous observation while restraint is in use.",
              "Regular review and removal as soon as safe to do so.",
            ],
          },
          {
            h: "6. Process for any use of restraint",
            ol: [
              "Document all alternatives tried and why they were not effective.",
              "MDT discussion and decision recorded in the care plan.",
              "Consent obtained and documented; capacity assessment where required.",
              "Risk assessment completed.",
              "Care plan updated with frequency of observation, review date and removal criteria.",
              "Each episode logged in LogUp and reviewed weekly by the PIC.",
            ],
          },
          { h: "7. Reporting and escalation", p: "Every new use of restraint is reported to the PIC within the shift and reviewed by the Quality & Safety Committee monthly. Any restraint resulting in injury is reported as an incident and considered for HIQA notification." },
          { h: "8. Monitoring and review", p: "Restraint register audited monthly. Policy reviewed annually or sooner where guidance changes." },
        ]),
        attachments: [],
        changeSummary: "Annual review.",
        editedBy: "Áine Ryan",
        editedAt: "10 Jan 2025",
        approvedBy: "Marie Doherty",
        approvedAt: "15 Jan 2025",
        publishedAt: "16 Jan 2025",
      },
      {
        versionNumber: "1.3",
        status: "returned",
        bodyHtml: seedDocBody("Restraint Policy", [
          { h: "1. Position", p: "Updated definition of environmental restraint." },
        ]),
        attachments: [],
        changeSummary: "Adds environmental restraint definition.",
        editedBy: "Áine Ryan",
        editedAt: "1 Apr 2025",
        submittedAt: "2 Apr 2025",
        returnedNote: "Please reference the latest HIQA guidance on environmental restraint and add resident consent steps.",
      },
    ],
  );

  // ---------- ADMISSION CHECKLIST (Templates) ----------
  mk(
    {
      id: "doc-admission-checklist",
      title: "Resident Admission Checklist",
      category: "Template",
      topicGroup: "Templates & Forms",
      owner: "Áine Ryan, PIC",
      tags: ["Template", "Admissions"],
      nextReviewDate: "9 Sep 2026",
    },
    [
      {
        versionNumber: "1.1",
        status: "published",
        bodyHtml: richBody("Resident Admission Checklist", [
          { h: "Purpose", p: "A standardised checklist to ensure every new admission is supported, safe and fully assessed within agreed timeframes." },
          {
            h: "Header fields",
            ul: [
              "Resident name:",
              "Date of birth:",
              "Date of admission:",
              "Room number:",
              "Key worker:",
              "Admitting nurse:",
            ],
          },
          {
            h: "Pre-admission (within 7 days prior)",
            ul: [
              "☐ Pre-admission care needs assessment completed",
              "☐ Funding / contract of care signed",
              "☐ Room prepared and cleaned",
              "☐ Medication reconciliation requested from previous setting",
              "☐ Equipment in place (bed, mattress, hoist if required)",
            ],
          },
          {
            h: "Day of admission",
            ul: [
              "☐ Welcome and orientation to room and unit",
              "☐ Welcome pack and resident guide provided",
              "☐ Photograph taken for MAR (with consent)",
              "☐ Falls Risk Assessment completed",
              "☐ MUST nutritional screening completed",
              "☐ Skin integrity check and Body Map completed",
              "☐ Personal property inventory recorded",
              "☐ Next of kin contact details verified",
              "☐ Initial care plan started",
            ],
          },
          {
            h: "Within 72 hours",
            ul: [
              "☐ Full care plan completed and signed by resident or representative",
              "☐ Key worker assigned and introduced",
              "☐ MDT review documented",
              "☐ Activities preferences captured",
              "☐ Communication and capacity assessment if indicated",
            ],
          },
          {
            h: "Worked example",
            p: "Mary K. admitted 14 Mar from St James's Hospital. Day-one tasks completed by 16:00. Falls Risk: high (recent stroke, unsteady gait). MUST: 2 (medium risk). Body Map: bruise to left forearm noted, photographed and discussed with daughter at admission meeting. Care plan signed by daughter as next of kin on day 2.",
          },
          { h: "Guidance for completion", p: "Tick each item as completed. Initial and date the bottom of each section. Any item not applicable should be marked N/A with a brief rationale. File the completed checklist in the resident's care record under 'Admissions'." },
          { h: "Where to file", p: "Resident care record → Admissions tab. Copy retained in LogUp Admissions module. PIC reviews weekly." },
        ]),
        attachments: [
          { id: uid("att"), name: "Admission Checklist Printable.pdf", sizeKb: 124, kind: "template" },
        ],
        changeSummary: "Added MUST score to day-one tasks.",
        editedBy: "Áine Ryan",
        editedAt: "4 Feb 2025",
        approvedBy: "Marie Doherty",
        approvedAt: "8 Feb 2025",
        publishedAt: "9 Feb 2025",
      },
    ],
  );

  // ---------- BODY MAP TEMPLATE ----------
  mk(
    {
      id: "doc-body-map",
      title: "Body Map Template",
      category: "Template",
      topicGroup: "Templates & Forms",
      owner: "Dr. Niamh Walsh, Clinical Lead",
      tags: ["Template", "Clinical"],
      nextReviewDate: "6 Jun 2026",
    },
    [
      {
        versionNumber: "1.0",
        status: "published",
        bodyHtml: richBody("Body Map Template", [
          { h: "Purpose", p: "A standardised front-and-back body diagram used to record the location, size, type and appearance of any observed injury, skin condition, pressure injury, bruise, skin tear or unexplained mark." },
          {
            h: "When to complete",
            ul: [
              "On admission as part of the skin integrity baseline.",
              "Following any fall, suspected injury or safeguarding concern.",
              "When any new mark is observed during personal care.",
              "On transfer back from hospital.",
            ],
          },
          {
            h: "Header fields",
            ul: [
              "Resident name and DOB",
              "Date and time observed",
              "Observed by (name and role)",
              "Witnessed by",
              "Linked LogUp Incident reference",
            ],
          },
          {
            h: "For each mark, record",
            ul: [
              "Location (mark on diagram with a number)",
              "Type — bruise / skin tear / pressure injury / rash / laceration / other",
              "Size in cm",
              "Colour and stage where relevant",
              "Pain score reported by resident",
              "Possible cause if known",
              "Action taken and clinical review",
            ],
          },
          {
            h: "Worked example",
            p: "1: Left forearm — 3cm purple bruise, no break in skin, resident reports tenderness 2/10, possibly knocked on bedrail overnight. GP informed at morning round. Bedrail use reviewed.",
          },
          { h: "Guidance", p: "Use only objective, factual descriptions. Photograph where consent has been obtained and store the image with the resident's record. Any unexplained mark must be reported to the PIC and considered as a potential safeguarding concern." },
          { h: "Where to file", p: "Resident clinical record → Skin & Wounds. Linked from the related LogUp Incident." },
        ]),
        attachments: [
          { id: uid("att"), name: "Body Map (front and back).pdf", sizeKb: 88, kind: "template" },
        ],
        changeSummary: "Initial publication.",
        editedBy: "Niamh Walsh",
        editedAt: "1 Jun 2024",
        approvedBy: "Marie Doherty",
        approvedAt: "5 Jun 2024",
        publishedAt: "6 Jun 2024",
      },
    ],
  );

  // ---------- FIRE SAFETY (Safety / Operational) ----------
  mk(
    {
      id: "doc-fire-safety",
      title: "Fire Safety Operational Document",
      category: "Operational",
      topicGroup: "Safety",
      owner: "John Brennan, Maintenance Lead",
      tags: ["Fire", "Operational", "HIQA Reg 28"],
      nextReviewDate: "21 Dec 2026",
    },
    [
      {
        versionNumber: "3.0",
        status: "published",
        bodyHtml: richBody("Fire Safety Operational Document", [
          { h: "Purpose", p: "To set out the day-to-day operational checks, drills, equipment maintenance and record-keeping required to maintain compliance with HIQA Regulation 28 and the Fire Services Acts." },
          {
            h: "Daily checks (every shift handover)",
            ul: [
              "Fire exits free of obstruction, both internally and externally.",
              "Fire doors closed and not wedged open.",
              "Escape routes clear of trip hazards or stored equipment.",
              "Fire panel checked — no faults showing, all zones healthy.",
              "Emergency lighting visually checked.",
              "Resident PEEP folder accessible at the nurses' station.",
            ],
          },
          {
            h: "Weekly checks",
            ul: [
              "Fire alarm test from a different call point each week, recorded in the fire log.",
              "Fire extinguishers visually inspected — seal, gauge, mounting.",
              "Smoke vents and door release mechanisms tested.",
            ],
          },
          {
            h: "Monthly checks",
            ul: [
              "Emergency lighting full discharge test on a sample of fittings.",
              "Fire blanket and kitchen suppression system check.",
              "Review of all PEEPs against current resident mobility.",
            ],
          },
          {
            h: "Quarterly drills",
            ul: [
              "Simulated evacuation drill on each unit.",
              "At least one night-time drill every 12 months.",
              "Drill report logged in LogUp with attendance, time to evacuate and learning.",
            ],
          },
          {
            h: "Responsibilities",
            ul: [
              "<strong>Maintenance Lead:</strong> overall fire safety oversight, contractor management, annual servicing.",
              "<strong>Person in Charge:</strong> ensures daily checks happen, reviews PEEPs, leads drills.",
              "<strong>Nurse in Charge:</strong> conducts handover fire walk, escalates any defect.",
              "<strong>All staff:</strong> familiar with evacuation routes, assembly point and PEEPs for assigned residents.",
            ],
          },
          {
            h: "Records to keep",
            ul: [
              "Fire log book — daily, weekly, monthly entries.",
              "Drill reports.",
              "Servicing certificates for alarm, extinguishers, emergency lighting, suppression.",
              "PEEPs for every resident, dated and signed.",
            ],
          },
          {
            h: "Escalation triggers",
            ul: [
              "Any fault on the fire panel → contact contractor within 1 hour and notify PIC.",
              "Any obstructed fire exit not resolved at the time → immediate escalation to Maintenance Lead.",
              "Failed drill (evacuation time > target) → root cause review and re-drill within 14 days.",
            ],
          },
          {
            h: "Equipment list",
            ul: [
              "Addressable fire alarm panel (annual service contract)",
              "CO₂ and water-mist extinguishers — every corridor",
              "Fire blankets — every kitchen and resident kitchenette",
              "Kitchen wet-chemical suppression system",
              "Emergency lighting throughout escape routes",
              "Evacuation chairs — one per stairwell",
            ],
          },
        ]),
        attachments: [
          { id: uid("att"), name: "Fire Drill Record Sheet.xlsx", sizeKb: 36, kind: "xlsx" },
          { id: uid("att"), name: "PEEP Template.docx", sizeKb: 44, kind: "docx" },
        ],
        changeSummary: "Added night-time drill requirement.",
        editedBy: "John Brennan",
        editedAt: "12 Mar 2025",
        approvedBy: "Marie Doherty",
        approvedAt: "20 Mar 2025",
        publishedAt: "21 Mar 2025",
      },
    ],
  );

  // ---------- HIQA NF06 GUIDANCE ----------
  mk(
    {
      id: "doc-hiqa-nf06",
      title: "HIQA NF06 Guidance Note",
      category: "Guidance",
      topicGroup: "Governance",
      owner: "Áine Ryan, PIC",
      tags: ["HIQA", "Guidance", "Notifications"],
      nextReviewDate: "16 Jan 2026",
    },
    [
      {
        versionNumber: "1.0",
        status: "published",
        bodyHtml: richBody("HIQA NF06 Guidance Note", [
          { h: "Context", p: "HIQA requires designated centres for older people to submit a quarterly notification (NF06) covering a defined list of events that are not captured under the immediate notifications NF01–NF05. This guidance explains when and how to use NF06 in practice." },
          {
            h: "When to use NF06",
            ul: [
              "End-of-quarter summary of all notifiable events not already submitted under NF01–NF05.",
              "Any event listed in Schedule 4 of the Care and Welfare Regulations occurring in the quarter.",
              "Includes: any allegation of misconduct, any outbreak of infectious disease, any unexplained absence of a resident, any unexpected death, any safeguarding referral.",
            ],
          },
          {
            h: "When NOT to use NF06",
            ul: [
              "Immediate notifiables (use NF01–NF05 within 3 working days).",
              "Routine incidents that do not meet a Schedule 4 trigger.",
              "Concerns already submitted via the safeguarding pathway as a separate notification.",
            ],
          },
          {
            h: "Step-through",
            ol: [
              "On the last day of each quarter, the PIC runs the LogUp 'Quarterly NF06 report'.",
              "Cross-check against the safeguarding register and complaints log.",
              "Complete the NF06 form on the HIQA Portal.",
              "Sign-off by the Director before submission.",
              "Submit within 10 working days of quarter end.",
              "Save the submission receipt in the Governance folder.",
            ],
          },
          { h: "Operational implications", p: "The PIC should diary the four NF06 deadlines at the start of the year. The Quality & Safety Committee should review the NF06 submission at the first meeting after each quarter end as a standing agenda item." },
          {
            h: "Related documents",
            ul: [
              "Incident Reporting Procedure",
              "Safeguarding Vulnerable Adults Policy",
              "Complaints Management Procedure",
              "HIQA Portal user guide (external)",
            ],
          },
          { h: "Worked example", p: "Q1 2025: 14 incidents reviewed, of which 2 met Schedule 4 triggers — one allegation of staff misconduct (resolved with no finding) and one outbreak of norovirus affecting 6 residents over 9 days. Both included in NF06 submitted on 8 April, 6 working days after quarter end." },
        ]),
        attachments: [],
        changeSummary: "Initial guidance.",
        editedBy: "Áine Ryan",
        editedAt: "10 Jan 2025",
        approvedBy: "Marie Doherty",
        approvedAt: "15 Jan 2025",
        publishedAt: "16 Jan 2025",
      },
    ],
  );

  // ---------- HAND HYGIENE (Clinical / Care) ----------
  mk(
    {
      id: "doc-hand-hygiene",
      title: "Hand Hygiene Procedure",
      category: "Procedure",
      topicGroup: "Clinical / Care",
      owner: "Dr. Niamh Walsh, Clinical Lead",
      tags: ["IPC", "Clinical", "WHO 5 Moments"],
      nextReviewDate: "5 Oct 2026",
    },
    [
      {
        versionNumber: "1.2",
        status: "published",
        bodyHtml: richBody("Hand Hygiene Procedure", [
          { h: "1. Purpose", p: "To prevent the transmission of healthcare-associated infections by ensuring all staff perform hand hygiene correctly and consistently, in line with the WHO 'My 5 Moments for Hand Hygiene' and HSE National Hand Hygiene Guidelines." },
          { h: "2. When this procedure applies", p: "To all clinical and non-clinical staff, students, agency staff, contractors and visitors at every point of resident care." },
          {
            h: "3. The 5 moments",
            ol: [
              "Before touching a resident.",
              "Before a clean or aseptic procedure.",
              "After a body fluid exposure risk.",
              "After touching a resident.",
              "After touching resident surroundings.",
            ],
          },
          {
            h: "4. Step-by-step technique",
            ol: [
              "Remove wristwatch, jewellery (plain band only), and roll up sleeves to the elbow.",
              "Wet hands with warm water before applying soap (or apply alcohol-based handrub to dry hands).",
              "Apply enough product to cover all surfaces of the hands.",
              "Rub palm to palm, then between fingers, backs of fingers, thumbs, and fingertips.",
              "Rinse thoroughly (if soap and water) and dry with single-use paper towel.",
              "Use the paper towel to turn off the tap.",
              "Total time: 40–60 seconds for soap and water; 20–30 seconds for handrub.",
            ],
          },
          { h: "5. When soap and water must be used", p: "When hands are visibly soiled, after caring for a resident with C. difficile or norovirus, after using the toilet, and before handling food. Alcohol handrub is not effective against spore-forming organisms." },
          {
            h: "6. Roles and responsibilities",
            ul: [
              "<strong>All staff:</strong> perform hand hygiene at the 5 moments without exception.",
              "<strong>Nurse in Charge:</strong> challenge and correct any breach of technique.",
              "<strong>IPC Link Nurse:</strong> conduct monthly hand hygiene audit using the WHO observation tool.",
              "<strong>Person in Charge:</strong> review audit results and act on areas below 90% compliance.",
            ],
          },
          {
            h: "7. Documentation required",
            ul: [
              "Monthly hand hygiene audit record (minimum 30 observations).",
              "Annual hand hygiene training attendance.",
              "Skin integrity assessment for any staff member with work-related dermatitis.",
            ],
          },
          { h: "8. Escalation", p: "Any cluster of healthcare-associated infection triggers an immediate hand hygiene re-audit and a refresher session for the affected unit." },
          { h: "9. Review", p: "Reviewed annually or following any IPC outbreak." },
        ]),
        attachments: [
          { id: uid("att"), name: "WHO 5 Moments Poster.pdf", sizeKb: 92, kind: "pdf" },
          { id: uid("att"), name: "Hand Hygiene Audit Tool.xlsx", sizeKb: 38, kind: "xlsx" },
        ],
        changeSummary: "Aligned with HSE 2024 hand hygiene guidance update.",
        editedBy: "Niamh Walsh",
        editedAt: "1 Apr 2025",
        approvedBy: "Marie Doherty",
        approvedAt: "4 Apr 2025",
        publishedAt: "5 Apr 2025",
      },
    ],
  );

  // ---------- STAFF INDUCTION (Staff / HR) ----------
  mk(
    {
      id: "doc-staff-induction",
      title: "Staff Induction & Mandatory Training Policy",
      category: "Policy",
      topicGroup: "Staff / HR",
      owner: "Linda McCarthy, HR Lead",
      tags: ["HR", "Training", "Induction"],
      nextReviewDate: "12 Feb 2026",
    },
    [
      {
        versionNumber: "2.0",
        status: "published",
        bodyHtml: richBody("Staff Induction & Mandatory Training Policy", [
          { h: "1. Purpose", p: "To ensure that every new starter completes a structured induction and that all staff hold up-to-date mandatory training, supporting safe care delivery and HIQA compliance." },
          { h: "2. Scope", p: "All employees, agency staff and long-term contractors. Volunteers and students complete a tailored induction proportionate to their role." },
          { h: "3. Policy statement", p: "No member of staff will work unsupervised in a clinical or care role until induction is complete and mandatory training is in date. Compliance is monitored monthly and reported to the Board." },
          {
            h: "4. Induction structure (first 4 weeks)",
            mixed: [
              { h3: "Day 1 — Welcome", ul: ["HR onboarding, Garda vetting confirmation, contract sign-off.", "Tour of the centre, introductions, locker, ID badge.", "Fire safety walk-through and assembly point.", "Hand hygiene and PPE refresher."] },
              { h3: "Week 1 — Core training", ul: ["Safeguarding adults at risk.", "Manual handling — theory and practical.", "CPR (BLS) and choking response.", "LogUp incident reporting walkthrough.", "Dementia-care principles."] },
              { h3: "Weeks 2–4 — Supernumerary", ul: ["Shadow shifts on day, evening and night.", "Competency sign-off by preceptor for each core skill.", "Care planning and documentation orientation."] },
            ],
          },
          {
            h: "5. Mandatory training matrix",
            ul: [
              "Safeguarding — every 2 years",
              "Manual Handling — annually (people handling), every 2 years (object)",
              "Fire Safety — annually",
              "CPR / BLS — annually",
              "Hand Hygiene & IPC — annually",
              "Children First (where applicable) — every 3 years",
              "Medication management (nurses) — every 2 years",
              "Dementia care — every 2 years",
              "Restraint and de-escalation — every 2 years",
            ],
          },
          {
            h: "6. Roles and responsibilities",
            ul: [
              "<strong>HR Lead:</strong> maintains the training matrix, sends renewal reminders, reports compliance monthly.",
              "<strong>Person in Charge:</strong> ensures no out-of-date staff are rostered to clinical duties.",
              "<strong>Line manager:</strong> protects time for training and supports completion.",
              "<strong>All staff:</strong> attend training as scheduled and notify HR of any external CPD.",
            ],
          },
          { h: "7. Reporting and escalation", p: "Compliance below 95% on any mandatory module triggers a recovery plan within 14 days. Compliance is reported at the monthly Quality & Safety meeting and to the Board quarterly." },
          { h: "8. Review", p: "Policy reviewed every 2 years or earlier where regulation, guidance or learning from incidents requires." },
        ]),
        attachments: [
          { id: uid("att"), name: "Induction Checklist.docx", sizeKb: 64, kind: "docx" },
          { id: uid("att"), name: "Training Matrix.xlsx", sizeKb: 46, kind: "xlsx" },
        ],
        changeSummary: "Restructured induction into weekly blocks and added dementia care to mandatory list.",
        editedBy: "Linda McCarthy",
        editedAt: "5 Feb 2025",
        approvedBy: "Marie Doherty",
        approvedAt: "10 Feb 2025",
        publishedAt: "12 Feb 2025",
      },
    ],
  );

  // ---------- COMPLAINTS (Governance) ----------
  mk(
    {
      id: "doc-complaints",
      title: "Complaints Management Procedure",
      category: "Procedure",
      topicGroup: "Governance",
      owner: "Marie Doherty, Director",
      tags: ["Complaints", "Governance", "HIQA"],
      nextReviewDate: "18 Aug 2026",
    },
    [
      {
        versionNumber: "1.3",
        status: "published",
        bodyHtml: richBody("Complaints Management Procedure", [
          { h: "1. Purpose", p: "To ensure that every complaint is welcomed, acknowledged, investigated fairly and resolved as close to the point of care as possible, in line with HIQA Regulation 34 and the HSE 'Your Service Your Say' framework." },
          { h: "2. When this procedure applies", p: "To any expression of dissatisfaction — verbal or written — by a resident, family member, advocate, visitor, contractor or member of staff, regardless of how minor it may appear." },
          {
            h: "3. Step-by-step process",
            ol: [
              "Acknowledge the complaint at the point it is made — listen, do not defend.",
              "Where possible, resolve immediately at point of care and record as a 'point of care' resolution.",
              "If not resolved, log the complaint in LogUp Complaints within the same shift.",
              "Acknowledge in writing within 5 working days, naming the Complaints Officer handling it.",
              "Investigate fairly: gather facts, speak to all parties, review records.",
              "Issue a written response within 30 working days, setting out findings and any action taken.",
              "Offer a face-to-face meeting where helpful.",
              "Inform the complainant of their right to escalate to the Ombudsman or HIQA.",
            ],
          },
          {
            h: "4. Roles and responsibilities",
            ul: [
              "<strong>All staff:</strong> receive complaints courteously and pass them to the Complaints Officer.",
              "<strong>Complaints Officer (PIC):</strong> manages each complaint end-to-end.",
              "<strong>Director:</strong> reviews findings on any complaint involving safeguarding or serious harm.",
              "<strong>Quality & Safety Committee:</strong> reviews trends quarterly.",
            ],
          },
          {
            h: "5. Documentation required",
            ul: [
              "Complaint record in LogUp, including the original complaint verbatim where possible.",
              "Acknowledgement and final response letters.",
              "Investigation notes and any supporting evidence.",
              "Action plan with assigned owners and target dates.",
            ],
          },
          {
            h: "6. Escalation",
            ul: [
              "Any complaint indicating abuse → safeguarding pathway opened in parallel.",
              "Any complaint about clinical care → Clinical Lead involved.",
              "Any complaint not resolved within 30 days → escalated to Director with written rationale.",
              "Complainant retains the right to refer to HIQA or the Office of the Ombudsman at any time.",
            ],
          },
          { h: "7. Exceptions", p: "Anonymous complaints are still investigated where there is sufficient information to do so. Vexatious or repeat complaints are managed in line with the Director's discretion and recorded with rationale." },
          { h: "8. Review", p: "Procedure reviewed every 2 years. Complaints data reviewed quarterly to identify themes and improvement opportunities." },
        ]),
        attachments: [
          { id: uid("att"), name: "Complaint Acknowledgement Letter Template.docx", sizeKb: 38, kind: "docx" },
          { id: uid("att"), name: "Your Service Your Say leaflet.pdf", sizeKb: 96, kind: "pdf" },
        ],
        changeSummary: "Aligned timelines with HSE 'Your Service Your Say' 2024 update.",
        editedBy: "Marie Doherty",
        editedAt: "10 Mar 2025",
        approvedBy: "Board of Management",
        approvedAt: "17 Mar 2025",
        publishedAt: "18 Mar 2025",
      },
    ],
  );

  // ---------- HANDOVER (Site Operations) ----------
  mk(
    {
      id: "doc-handover",
      title: "End of Shift Handover Operational Document",
      category: "Operational",
      topicGroup: "Site Operations",
      owner: "Áine Ryan, PIC",
      tags: ["Operational", "Handover", "Communication"],
      nextReviewDate: "8 Nov 2026",
    },
    [
      {
        versionNumber: "1.1",
        status: "published",
        bodyHtml: richBody("End of Shift Handover Operational Document", [
          { h: "Purpose", p: "To ensure safe, structured and consistent communication of resident and operational information at every shift change." },
          {
            h: "When handover happens",
            ul: [
              "Day to evening — 14:30 in the staff room, 15 minutes per unit.",
              "Evening to night — 21:00 at the nurses' station.",
              "Night to day — 07:30 at the nurses' station.",
              "Any unplanned cover change — verbal handover plus written note in the resident's record.",
            ],
          },
          {
            h: "Structure (SBAR)",
            mixed: [
              { h3: "S — Situation", p: "Resident name, room, current presentation in one sentence." },
              { h3: "B — Background", p: "Relevant history, baseline, recent events on the previous shift." },
              { h3: "A — Assessment", p: "Current observations, mood, intake, mobility, any change of concern." },
              { h3: "R — Recommendation", p: "Specific tasks for the incoming shift, time-critical actions, escalation triggers." },
            ],
          },
          {
            h: "Operational items to cover",
            ul: [
              "New admissions and planned discharges in the next 24 hours.",
              "Any open LogUp incidents requiring follow-up.",
              "Medication changes since last shift.",
              "PRN medications given and effect.",
              "Outstanding GP, dietitian or AHP requests.",
              "Visitors expected and any safeguarding restrictions.",
              "Maintenance issues, IPC alerts, fire panel status.",
            ],
          },
          {
            h: "Daily checks at handover",
            ul: [
              "Resident headcount confirmed against unit sheet.",
              "Controlled drugs balance check (two-nurse signature).",
              "Resus trolley seal intact.",
              "Fridge temperatures logged.",
              "Fire walk completed and recorded.",
            ],
          },
          {
            h: "Responsibilities",
            ul: [
              "<strong>Outgoing nurse in charge:</strong> leads handover, ensures all SBAR items covered.",
              "<strong>Incoming nurse in charge:</strong> takes notes, asks clarifying questions, signs handover sheet.",
              "<strong>HCAs:</strong> attend the unit-level handover relevant to their assignment.",
              "<strong>PIC:</strong> attends day handover at least 3 times per week and audits handover quality monthly.",
            ],
          },
          {
            h: "Records to keep",
            ul: [
              "Signed handover sheet for each shift retained for 3 months.",
              "Updated resident status board on each unit.",
              "Any new entry in LogUp where action is required.",
            ],
          },
          {
            h: "Escalation triggers",
            ul: [
              "Any resident requiring clinical review during the next shift → flagged red on the board.",
              "Any staffing shortfall → escalated to PIC before handover ends.",
              "Any safeguarding or open disclosure follow-up → named owner agreed before incoming team starts.",
            ],
          },
        ]),
        attachments: [
          { id: uid("att"), name: "SBAR Handover Sheet.docx", sizeKb: 40, kind: "docx" },
        ],
        changeSummary: "Clarified PIC attendance expectation and added IPC/fire items.",
        editedBy: "Áine Ryan",
        editedAt: "3 Apr 2025",
        approvedBy: "Marie Doherty",
        approvedAt: "7 Apr 2025",
        publishedAt: "8 Apr 2025",
      },
    ],
  );

  // ---------- Uploaded-source document — IPC ----------
  const uploadedDocId = "doc-infection-control";
  docs.push({
    id: uploadedDocId,
    title: "Infection Prevention & Control Policy (uploaded)",
    category: "Policy",
    topicGroup: "Clinical / Care",
    owner: "Dr. Niamh Walsh, Clinical Lead",
    tags: ["IPC", "HIQA", "Uploaded"],
    description: "Original PDF uploaded from previous policy library — ready to be brought into the editable workflow.",
    currentVersionId: null,
    sourceUpload: {
      id: uid("upl"),
      filename: "IPC Policy 2024 v1.pdf",
      sizeKb: 412,
      uploadedAt: "15 Apr 2025",
      uploadedBy: "Áine Ryan",
    },
  });
};

seed();

// ---------- Post-seed: backfill approval chains so docs feel governed ----------
const buildChain = (
  steps: { role: string; name: string; status: ApprovalStepStatus; decidedAt?: string; note?: string }[],
): ApprovalStep[] =>
  steps.map((s) => ({
    id: uid("step"),
    role: s.role,
    name: s.name,
    status: s.status,
    decidedAt: s.decidedAt,
    note: s.note,
  }));

versions.forEach((v) => {
  if (v.approvalChain) return;
  if (v.status === "published") {
    v.publishedBy = v.publishedBy || "Áine Ryan, PIC";
    v.approvalChain = buildChain([
      { role: "Person in Charge", name: "Áine Ryan", status: "approved", decidedAt: v.editedAt },
      { role: "Director of Nursing", name: v.approvedBy?.split(",")[0] || "Marie Doherty", status: "approved", decidedAt: v.approvedAt },
      { role: "Chief Governance / Quality Officer", name: "Conor Hughes", status: "approved", decidedAt: v.approvedAt },
    ]);
  } else if (v.status === "in_review") {
    v.approvalChain = buildChain([
      { role: "Person in Charge", name: "Áine Ryan", status: "approved", decidedAt: v.submittedAt || v.editedAt },
      { role: "Director of Nursing", name: "Marie Doherty", status: "pending" },
      { role: "Chief Governance / Quality Officer", name: "Conor Hughes", status: "pending" },
    ]);
  } else if (v.status === "approved") {
    v.approvalChain = buildChain([
      { role: "Person in Charge", name: "Áine Ryan", status: "approved", decidedAt: v.editedAt },
      { role: "Director of Nursing", name: "Marie Doherty", status: "approved", decidedAt: v.approvedAt },
    ]);
  } else if (v.status === "returned") {
    v.approvalChain = buildChain([
      { role: "Person in Charge", name: "Áine Ryan", status: "approved", decidedAt: v.editedAt },
      { role: "Director of Nursing", name: "Marie Doherty", status: "returned", decidedAt: v.editedAt, note: v.returnedNote },
    ]);
  }
});

// ---------- Seed default approval-chain templates ----------
const seedTemplates = () => {
  const ts = nowDisplay();
  chainTemplates.push(
    {
      id: "tpl-default",
      name: "Standard governance",
      description: "Default 3-step chain used when no topic-specific template matches.",
      levels: [
        { role: "Person in Charge", name: "Áine Ryan" },
        {
          role: "Director of Nursing",
          name: "Marie Doherty",
          coApprovers: [{ role: "Clinical Lead", name: "Dr. Niamh Walsh" }],
        },
        { role: "Chief Governance / Quality Officer", name: "Conor Hughes" },
      ],
      topics: [],
      categories: [],
      isDefault: true,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: "tpl-clinical",
      name: "Clinical & medication",
      description: "For clinical care and medication policies — Clinical Lead can co-approve with the Director of Nursing.",
      levels: [
        { role: "Person in Charge", name: "Áine Ryan" },
        {
          role: "Director of Nursing",
          name: "Marie Doherty",
          coApprovers: [{ role: "Clinical Lead", name: "Dr. Niamh Walsh" }],
        },
        { role: "Chief Executive Officer", name: "Patrick Lenihan" },
      ],
      topics: ["Clinical / Care", "Medication"],
      categories: [],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: "tpl-safeguarding",
      name: "Safeguarding & governance",
      description: "Adds Board sign-off for safeguarding and governance documents.",
      levels: [
        { role: "Person in Charge", name: "Áine Ryan" },
        { role: "Director of Nursing", name: "Marie Doherty" },
        {
          role: "Chief Governance / Quality Officer",
          name: "Conor Hughes",
          coApprovers: [{ role: "Chief Executive Officer", name: "Patrick Lenihan" }],
        },
        { role: "Board of Management", name: "Board Chair" },
      ],
      topics: ["Safeguarding", "Governance"],
      categories: [],
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: "tpl-operational",
      name: "Operational fast-track",
      description: "Lighter chain for operational documents and templates.",
      levels: [
        { role: "Person in Charge", name: "Áine Ryan" },
        {
          role: "Director of Nursing",
          name: "Marie Doherty",
          coApprovers: [{ role: "Clinical Lead", name: "Dr. Niamh Walsh" }],
        },
      ],
      topics: ["Site Operations", "Templates & Forms"],
      categories: ["Operational", "Template", "Guidance"],
      createdAt: ts,
      updatedAt: ts,
    },
  );
};
seedTemplates();

// ---------- API ----------
export const policiesStore = {
  list(): PolicyDoc[] {
    return [...docs];
  },
  get(id: string): PolicyDoc | undefined {
    return docs.find((d) => d.id === id);
  },
  getVersions(docId: string): PolicyVersion[] {
    return versions
      .filter((v) => v.docId === docId)
      .sort((a, b) => b.versionNumber.localeCompare(a.versionNumber, undefined, { numeric: true }));
  },
  getVersion(versionId: string): PolicyVersion | undefined {
    return versions.find((v) => v.id === versionId);
  },
  getLiveVersion(docId: string): PolicyVersion | undefined {
    const doc = docs.find((d) => d.id === docId);
    if (!doc?.currentVersionId) return undefined;
    return versions.find((v) => v.id === doc.currentVersionId);
  },
  getActiveDraft(docId: string): PolicyVersion | undefined {
    return versions.find(
      (v) => v.docId === docId && (v.status === "draft" || v.status === "in_review" || v.status === "returned" || v.status === "approved"),
    );
  },
  docStatus(docId: string): PolicyDocStatus {
    const draft = this.getActiveDraft(docId);
    if (draft) {
      if (draft.status === "in_review") return "in_review";
      if (draft.status === "returned") return "returned";
      if (draft.status === "approved") return "approved_pending_publish";
      return "draft_in_progress";
    }
    const doc = this.get(docId);
    if (doc?.currentVersionId) return "live";
    return "archived";
  },
  // Aggregations
  awaitingApproval(): PolicyVersion[] {
    return versions.filter((v) => v.status === "in_review");
  },
  returnedForChanges(): PolicyVersion[] {
    return versions.filter((v) => v.status === "returned");
  },
  approvedPendingPublish(): PolicyVersion[] {
    return versions.filter((v) => v.status === "approved");
  },
  recentlyApproved(): PolicyVersion[] {
    return versions
      .filter((v) => v.status === "published" && v.approvedAt)
      .sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""))
      .slice(0, 5);
  },
  recentlyPublished(): PolicyDoc[] {
    return [...docs]
      .filter((d) => d.livePublishedAt)
      .sort((a, b) => (b.livePublishedAt || "").localeCompare(a.livePublishedAt || ""))
      .slice(0, 6);
  },
  recentlyUpdated(): PolicyDoc[] {
    return [...docs]
      .map((d) => {
        const allV = versions.filter((v) => v.docId === d.id);
        const latest = allV.sort((a, b) => (b.editedAt || "").localeCompare(a.editedAt || ""))[0];
        return { d, latestEdit: latest?.editedAt || "" };
      })
      .sort((a, b) => b.latestEdit.localeCompare(a.latestEdit))
      .slice(0, 6)
      .map((x) => x.d);
  },
  draftsInProgress(): { doc: PolicyDoc; version: PolicyVersion }[] {
    return versions
      .filter((v) => v.status === "draft" || v.status === "returned")
      .map((v) => ({ doc: docs.find((d) => d.id === v.docId)!, version: v }))
      .filter((x) => x.doc);
  },

  // ---------- Topic group management ----------
  topicGroups(): TopicGroup[] {
    return [...TOPIC_GROUPS];
  },

  addTopicGroup(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (TOPIC_GROUPS.some((g) => g.toLowerCase() === trimmed.toLowerCase())) return false;
    TOPIC_GROUPS.push(trimmed);
    emit();
    return true;
  },

  renameTopicGroup(oldName: string, newName: string): boolean {
    const trimmed = newName.trim();
    if (!trimmed) return false;
    const idx = TOPIC_GROUPS.indexOf(oldName);
    if (idx === -1) return false;
    if (TOPIC_GROUPS.some((g, i) => i !== idx && g.toLowerCase() === trimmed.toLowerCase())) return false;
    TOPIC_GROUPS[idx] = trimmed;
    docs.forEach((d) => {
      if (d.topicGroup === oldName) d.topicGroup = trimmed;
    });
    emit();
    return true;
  },

  removeTopicGroup(name: string, reassignTo?: TopicGroup): boolean {
    const idx = TOPIC_GROUPS.indexOf(name);
    if (idx === -1) return false;
    if (TOPIC_GROUPS.length <= 1) return false;
    const target = reassignTo && TOPIC_GROUPS.includes(reassignTo) && reassignTo !== name
      ? reassignTo
      : TOPIC_GROUPS.find((g) => g !== name)!;
    docs.forEach((d) => {
      if (d.topicGroup === name) d.topicGroup = target;
    });
    TOPIC_GROUPS.splice(idx, 1);
    emit();
    return true;
  },

  moveTopicGroup(name: string, direction: "up" | "down"): boolean {
    const idx = TOPIC_GROUPS.indexOf(name);
    if (idx === -1) return false;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= TOPIC_GROUPS.length) return false;
    [TOPIC_GROUPS[idx], TOPIC_GROUPS[swapWith]] = [TOPIC_GROUPS[swapWith], TOPIC_GROUPS[idx]];
    emit();
    return true;
  },

  // ---------- Mutations ----------
  createDraft(input: { title: string; category: PolicyCategory; topicGroup?: TopicGroup; owner: string; tags: string[] }): { docId: string; versionId: string } {
    const docId = uid("doc");
    const versionId = uid("ver");
    const v: PolicyVersion = {
      id: versionId,
      docId,
      versionNumber: "0.1",
      status: "draft",
      bodyHtml: `<h1>${input.title}</h1><p>Start writing the policy content here…</p>`,
      attachments: [],
      changeSummary: "Initial draft.",
      editedBy: input.owner,
      editedAt: nowDisplay(),
    };
    docs.push({
      id: docId,
      title: input.title,
      category: input.category,
      topicGroup: input.topicGroup || "Governance",
      owner: input.owner,
      tags: input.tags,
      currentVersionId: null,
    });
    versions.push(v);
    emit();
    return { docId, versionId };
  },

  uploadDocument(input: { filename: string; sizeKb: number; uploadedBy: string; suggestedTitle?: string; category?: PolicyCategory; topicGroup?: TopicGroup }): string {
    const docId = uid("doc");
    docs.push({
      id: docId,
      title: input.suggestedTitle || input.filename.replace(/\.[^.]+$/, ""),
      category: input.category || "Policy",
      topicGroup: input.topicGroup || "Governance",
      owner: input.uploadedBy,
      tags: ["Uploaded"],
      currentVersionId: null,
      sourceUpload: {
        id: uid("upl"),
        filename: input.filename,
        sizeKb: input.sizeKb,
        uploadedAt: nowDisplay(),
        uploadedBy: input.uploadedBy,
      },
    });
    emit();
    return docId;
  },

  createDraftFromUpload(docId: string, editedBy: string): string | null {
    const doc = docs.find((d) => d.id === docId);
    if (!doc?.sourceUpload) return null;
    const live = this.getLiveVersion(docId);
    const baseVersion = live ? bumpVersion(live.versionNumber, "minor") : "1.0";
    const v: PolicyVersion = {
      id: uid("ver"),
      docId,
      versionNumber: baseVersion,
      status: "draft",
      bodyHtml: `
        <h1>${doc.title}</h1>
        <p><em>Editable draft created from <strong>${doc.sourceUpload.filename}</strong>. Replace this placeholder content with the structured policy text. The original upload is retained in version history.</em></p>
        <h2>1. Purpose</h2>
        <p>Describe the purpose of this policy.</p>
        <h2>2. Scope</h2>
        <p>Describe who and what this policy applies to.</p>
        <h2>3. Procedure</h2>
        <p>Outline the operational steps.</p>
        <h2>4. Responsibilities</h2>
        <p>Identify roles and accountabilities.</p>
        <h2>5. Review</h2>
        <p>State the review cycle and owner.</p>
      `,
      attachments: [
        {
          id: uid("att"),
          name: doc.sourceUpload.filename,
          sizeKb: doc.sourceUpload.sizeKb,
          kind: "pdf",
        },
      ],
      changeSummary: `Editable draft created from uploaded source: ${doc.sourceUpload.filename}.`,
      editedBy,
      editedAt: nowDisplay(),
      derivedFromUploadId: doc.sourceUpload.id,
    };
    versions.push(v);
    emit();
    return v.id;
  },

  saveDraft(versionId: string, patch: Partial<Pick<PolicyVersion, "bodyHtml" | "changeSummary" | "attachments">> & { title?: string; category?: PolicyCategory; tags?: string[] }) {
    const v = versions.find((x) => x.id === versionId);
    if (!v) return;
    if (patch.bodyHtml !== undefined) v.bodyHtml = patch.bodyHtml;
    if (patch.changeSummary !== undefined) v.changeSummary = patch.changeSummary;
    if (patch.attachments !== undefined) v.attachments = patch.attachments;
    v.editedAt = nowDisplay();
    const doc = docs.find((d) => d.id === v.docId);
    if (doc) {
      if (patch.title !== undefined) doc.title = patch.title;
      if (patch.category !== undefined) doc.category = patch.category;
      if (patch.tags !== undefined) doc.tags = patch.tags;
    }
    emit();
  },

  submitForReview(
    versionId: string,
    submittedBy: string,
    chain?: { role: string; name: string; coApprovers?: { role: string; name: string }[] }[],
  ) {
    const v = versions.find((x) => x.id === versionId);
    if (!v) return;
    v.status = "in_review";
    v.submittedAt = nowDisplay();
    v.editedBy = submittedBy;
    if (chain && chain.length) {
      v.approvalChain = chain.map((c) => ({
        id: uid("step"),
        role: c.role,
        name: c.name,
        status: "pending",
        coApprovers: c.coApprovers && c.coApprovers.length ? c.coApprovers : undefined,
      }));
    } else if (!v.approvalChain || v.approvalChain.length === 0) {
      const doc = docs.find((d) => d.id === v.docId);
      const tpl = doc ? this.matchTemplateForDoc(doc) : undefined;
      const levels = tpl?.levels || DEFAULT_APPROVERS.slice(0, 2);
      v.approvalChain = levels.map((c) => ({
        id: uid("step"),
        role: c.role,
        name: c.name,
        status: "pending",
        coApprovers: (c as any).coApprovers,
      }));
    } else {
      v.approvalChain = v.approvalChain.map((s) =>
        s.status === "returned" ? { ...s, status: "pending", note: undefined, decidedAt: undefined } : s,
      );
    }
    const doc = docs.find((d) => d.id === v.docId);
    const firstApprover = v.approvalChain[0];
    notificationsStore.add({
      kind: "policy",
      tone: "info",
      title: `${doc?.title} v${v.versionNumber} awaiting your approval`,
      body: `Submitted by ${submittedBy} · ${v.changeSummary.slice(0, 80)}`,
      href: "/app/policies/approvals",
      incidentId: v.docId,
      actionId: v.id,
      assignee: firstApprover?.name || "Approver",
      createdAt: nowTimestamp(),
    });
    emit();
  },

  setApprovalChain(
    versionId: string,
    chain: { role: string; name: string; coApprovers?: { role: string; name: string }[] }[],
  ) {
    const v = versions.find((x) => x.id === versionId);
    if (!v) return;
    v.approvalChain = chain.map((c) => ({
      id: uid("step"),
      role: c.role,
      name: c.name,
      status: "pending",
      coApprovers: c.coApprovers && c.coApprovers.length ? c.coApprovers : undefined,
    }));
    emit();
  },

  approve(versionId: string, approvedBy: string) {
    const v = versions.find((x) => x.id === versionId);
    if (!v) return;
    const chain = v.approvalChain || [];
    const nextPending = chain.find((s) => s.status === "pending");
    if (nextPending) {
      nextPending.status = "approved";
      nextPending.decidedAt = nowDisplay();
      nextPending.decidedBy = approvedBy;
      const isPrimary = approvedBy === nextPending.name;
      const isCo = nextPending.coApprovers?.some((c) => c.name === approvedBy);
      if (!isPrimary && isCo) {
        nextPending.note = `Approved by co-approver ${approvedBy}`;
      } else if (!isPrimary) {
        nextPending.note = `Decided by ${approvedBy}`;
      }
    }
    const stillPending = chain.some((s) => s.status === "pending");
    if (stillPending) {
      const next = chain.find((s) => s.status === "pending");
      const doc = docs.find((d) => d.id === v.docId);
      notificationsStore.add({
        kind: "policy",
        tone: "info",
        title: `${doc?.title} v${v.versionNumber} awaiting your approval`,
        body: `Previous approver: ${nextPending?.name || approvedBy}`,
        href: "/app/policies/approvals",
        incidentId: v.docId,
        actionId: v.id,
        assignee: next?.name || "Approver",
        createdAt: nowTimestamp(),
      });
      emit();
      return;
    }
    // All steps approved → moves to publish queue (admin publishes)
    v.status = "approved";
    v.approvedBy = approvedBy;
    v.approvedAt = nowDisplay();
    const doc = docs.find((d) => d.id === v.docId);
    notificationsStore.add({
      kind: "policy",
      tone: "success",
      title: `${doc?.title} v${v.versionNumber} fully approved — ready to publish`,
      body: `Final approver ${approvedBy} · awaiting admin to publish`,
      href: "/app/policies/library?tab=queue",
      incidentId: v.docId,
      actionId: v.id,
      assignee: "Admin",
      createdAt: nowTimestamp(),
    });
    emit();
  },

  // ---------- Approval-chain templates ----------
  listTemplates(): ApprovalChainTemplate[] {
    return [...chainTemplates];
  },
  getTemplate(id: string): ApprovalChainTemplate | undefined {
    return chainTemplates.find((t) => t.id === id);
  },
  addTemplate(input: Omit<ApprovalChainTemplate, "id" | "createdAt" | "updatedAt">): string {
    const ts = nowDisplay();
    const id = uid("tpl");
    if (input.isDefault) chainTemplates.forEach((t) => (t.isDefault = false));
    chainTemplates.push({ ...input, id, createdAt: ts, updatedAt: ts });
    emit();
    return id;
  },
  updateTemplate(id: string, patch: Partial<Omit<ApprovalChainTemplate, "id" | "createdAt">>): boolean {
    const t = chainTemplates.find((x) => x.id === id);
    if (!t) return false;
    if (patch.isDefault) chainTemplates.forEach((x) => x.id !== id && (x.isDefault = false));
    Object.assign(t, patch, { updatedAt: nowDisplay() });
    emit();
    return true;
  },
  deleteTemplate(id: string): boolean {
    const idx = chainTemplates.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    chainTemplates.splice(idx, 1);
    emit();
    return true;
  },
  /**
   * Match the most specific template for a document.
   * Priority: topic+category > topic-only > category-only > isDefault.
   */
  matchTemplateForDoc(doc: PolicyDoc): ApprovalChainTemplate | undefined {
    const both = chainTemplates.find(
      (t) => t.topics.includes(doc.topicGroup) && t.categories.includes(doc.category),
    );
    if (both) return both;
    const byTopic = chainTemplates.find((t) => t.topics.includes(doc.topicGroup));
    if (byTopic) return byTopic;
    const byCat = chainTemplates.find(
      (t) => t.categories.includes(doc.category) && t.topics.length === 0,
    );
    if (byCat) return byCat;
    return chainTemplates.find((t) => t.isDefault);
  },

  returnForChanges(versionId: string, note: string, returnedBy: string) {
    const v = versions.find((x) => x.id === versionId);
    if (!v) return;
    v.status = "returned";
    v.returnedNote = note;
    const chain = v.approvalChain || [];
    const currentStep = chain.find((s) => s.status === "pending");
    if (currentStep) {
      currentStep.status = "returned";
      currentStep.decidedAt = nowDisplay();
      currentStep.note = note;
    }
    const doc = docs.find((d) => d.id === v.docId);
    notificationsStore.add({
      kind: "policy",
      tone: "warning",
      title: `${doc?.title} v${v.versionNumber} returned for changes`,
      body: `${returnedBy}: ${note.slice(0, 80)}`,
      href: `/app/policies/${v.docId}/edit`,
      incidentId: v.docId,
      actionId: v.id,
      assignee: doc?.owner || "Owner",
      createdAt: nowTimestamp(),
    });
    emit();
  },

  publish(versionId: string, publishedBy: string = "Áine Ryan") {
    const v = versions.find((x) => x.id === versionId);
    if (!v) return;
    const doc = docs.find((d) => d.id === v.docId);
    if (!doc) return;
    // Archive previous live version
    if (doc.currentVersionId) {
      const prev = versions.find((x) => x.id === doc.currentVersionId);
      if (prev) prev.status = "archived";
    }
    v.status = "published";
    v.publishedAt = nowDisplay();
    v.publishedBy = publishedBy;
    doc.currentVersionId = v.id;
    doc.livePublishedAt = v.publishedAt;
    notificationsStore.add({
      kind: "policy",
      tone: "success",
      title: `${doc.title} v${v.versionNumber} published`,
      body: `Now live for all staff · supersedes previous version`,
      href: `/app/policies/${doc.id}`,
      incidentId: doc.id,
      actionId: v.id,
      assignee: "All staff",
      createdAt: nowTimestamp(),
    });
    emit();
  },

  archive(docId: string) {
    const doc = docs.find((d) => d.id === docId);
    if (!doc) return;
    versions.filter((v) => v.docId === docId).forEach((v) => (v.status = "archived"));
    doc.currentVersionId = null;
    emit();
  },

  subscribe(l: Listener): () => void {
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  },
};

// ---------- UI helpers ----------
export const versionStatusMeta: Record<VersionStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  in_review: { label: "In review", className: "bg-amber-100 text-amber-900 border-amber-200" },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-900 border-blue-200" },
  published: { label: "Published", className: "bg-emerald-100 text-emerald-900 border-emerald-200" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground border-border" },
  returned: { label: "Returned for changes", className: "bg-red-100 text-red-900 border-red-200" },
};

export const docStatusMeta: Record<PolicyDocStatus, { label: string; className: string }> = {
  live: { label: "Live", className: "bg-emerald-100 text-emerald-900 border-emerald-200" },
  draft_in_progress: { label: "Draft in progress", className: "bg-muted text-muted-foreground border-border" },
  in_review: { label: "Awaiting approval", className: "bg-amber-100 text-amber-900 border-amber-200" },
  returned: { label: "Returned for changes", className: "bg-red-100 text-red-900 border-red-200" },
  approved_pending_publish: { label: "Ready to publish", className: "bg-blue-100 text-blue-900 border-blue-200" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground border-border" },
};
