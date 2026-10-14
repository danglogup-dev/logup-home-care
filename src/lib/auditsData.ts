// Shared mock data for the Audits module (Overview + Reporting).
// This is the canonical demo dataset — all tab counts, badges and tables
// across Audit Overview, My Audits and Audit Reporting derive from it.
//
// Composition (per LogUp demo spec):
//   - In progress: 5  (status === "On Track" || "Due Soon")
//   - Overdue:     3  (status === "Overdue")
//   - Completed:   3  (status === "Complete")
//   - Total:      11

export type AuditStatus = "On Track" | "Due Soon" | "Overdue" | "Complete";

export interface AuditFinding {
  id: string;
  title: string;
  severity: "Low" | "Medium" | "High";
  raisedAt: string;
  raisedBy: string;
}

export interface AuditAction {
  id: string;
  description: string;
  owner: string;
  due: string;
  status: "Open" | "In Progress" | "Closed";
}

export interface AuditTimelineEntry {
  at: string;
  by: string;
  event: string;
}

export interface AuditAttachment {
  id: string;
  name: string;
  type: "photo" | "document";
  dataUrl?: string;
  linkedItem?: string;
  addedBy?: string;
  addedAt?: string;
}

export interface AuditRecord {
  id: string;
  templateName: string;
  category: string;
  site: string;
  assignedTo: string;
  dueDate: string;
  daysUntilDue: number;
  status: AuditStatus;
  progress: number;
  totalItems: number;
  completedItems: number;
  findings: number;
  photos: number;
  notes: string;
  completedAt?: string;
  signedOffBy?: string;
  findingsList?: AuditFinding[];
  actions?: AuditAction[];
  timeline?: AuditTimelineEntry[];
  attachments?: AuditAttachment[];
}

export const auditTemplatesSeed = [
  { id: "t1", name: "Infection Prevention Audit", category: "Clinical", items: ["Hand hygiene stations stocked", "PPE available and accessible", "Waste segregation correct", "Laundry handling compliant", "Clean and dirty utility rooms separated", "Outbreak management plan accessible", "Staff IPC training up to date", "Resident isolation protocols in place"] },
  { id: "t2", name: "Care Plan Review Audit", category: "Clinical", items: ["Care plan in place for each resident", "Care plans reviewed within 4 months", "Person-centred goals documented", "Family/resident input documented", "Risk assessments up to date", "Multi-disciplinary input recorded"] },
  { id: "t3", name: "Medication Management Audit", category: "Medication", items: ["Prescription sheets legible and signed", "Controlled drugs register accurate", "Medication fridge temperature logged", "PRN protocols documented", "Medication errors reported and reviewed", "Staff competency records current"] },
  { id: "t4", name: "Falls Prevention Audit", category: "Clinical", items: ["Falls risk assessment completed", "Post-fall protocol followed", "Environmental hazards addressed", "Mobility aids available", "Falls prevention care plan in place", "Falls data reviewed monthly"] },
  { id: "t5", name: "Health & Safety / Environment Audit", category: "Health & Safety", items: ["Fire exits unobstructed", "Emergency lighting functional", "Risk assessments current", "Maintenance log reviewed", "CCTV signage in place", "Outdoor areas safe and accessible"] },
  { id: "t6", name: "Safeguarding Audit", category: "Governance", items: ["Safeguarding policy displayed", "Staff safeguarding training current", "Allegations register reviewed", "Resident advocacy access documented", "Restrictive practice register reviewed"] },
  { id: "t7", name: "Complaints Register Audit", category: "Governance", items: ["Complaints policy accessible", "Complaints logged within 24h", "Investigation timeline met", "Outcomes communicated to complainant", "Learning actions documented"] },
  { id: "t8", name: "Fire Safety Check", category: "Health & Safety", items: ["Fire alarm panel checked", "Fire doors closing correctly", "Extinguishers in date and accessible", "Evacuation plan displayed", "Staff fire drill completed this quarter", "Fire register up to date", "Emergency grab bags checked"] },
  { id: "t9", name: "Environmental Safety Audit", category: "Health & Safety", items: ["Slip/trip hazards addressed", "Outdoor lighting working", "Hot water temperatures within range", "Window restrictors in place", "Cleaning chemicals secured"] },
  { id: "t10", name: "Staff Training Records Audit", category: "Governance", items: ["Mandatory training matrix current", "Induction records complete", "Specialist training tracked", "Refresher schedule reviewed"] },
  { id: "t11", name: "Documentation Control Audit", category: "Governance", items: ["Document version control in place", "Obsolete documents withdrawn", "Master document register maintained", "Approval signatures present"] },
];

export const sitePICs: Record<string, string> = {
  "East Cork": "Mark Byrne",
  "West Waterford": "Siobhán Kelly",
};

export const audits: AuditRecord[] = [
  // 1) AUD-001 — Overdue
  {
    id: "AUD-001", templateName: "Fire Safety Check", category: "Health & Safety",
    site: "East Cork", assignedTo: "Gráinne Lynch",
    dueDate: "13 Apr 2026", daysUntilDue: -36, status: "Overdue",
    progress: 57, totalItems: 7, completedItems: 4, findings: 1, photos: 2,
    notes: "Missing fire blanket signage in kitchen.",
    findingsList: [
      { id: "F-1", title: "Missing fire blanket signage in kitchen", severity: "High", raisedAt: "13 Apr 2026", raisedBy: "Gráinne Lynch" },
    ],
    actions: [
      { id: "A-1", description: "Replace missing fire blanket signage in kitchen", owner: "Mark Byrne", due: "16 Apr 2026", status: "Open" },
    ],
    timeline: [
      { at: "13 Apr 2026 09:14", by: "Gráinne Lynch", event: "Audit started" },
      { at: "13 Apr 2026 09:42", by: "Gráinne Lynch", event: "Finding raised: fire blanket signage" },
    ],
    attachments: [
      { id: "att-1", name: "fire-blanket-area.jpg", type: "photo" },
      { id: "att-2", name: "kitchen-wall.jpg", type: "photo" },
    ],
  },

  // 2) AUD-002 — In progress
  {
    id: "AUD-002", templateName: "Falls Prevention Audit", category: "Clinical",
    site: "West Waterford", assignedTo: "Siobhán Kelly",
    dueDate: "18 Apr 2026", daysUntilDue: -31, status: "On Track",
    progress: 50, totalItems: 6, completedItems: 3, findings: 2, photos: 1,
    notes: "Two residents missing updated falls risk assessment.",
    findingsList: [
      { id: "F-2a", title: "Patrick Murphy — falls risk assessment overdue review", severity: "Medium", raisedAt: "18 Apr 2026", raisedBy: "Siobhán Kelly" },
      { id: "F-2b", title: "Corridor handrail loose in main corridor", severity: "Medium", raisedAt: "18 Apr 2026", raisedBy: "Siobhán Kelly" },
    ],
    actions: [
      { id: "A-2a", description: "Complete updated falls risk assessment for Patrick Murphy", owner: "Daniel Walsh", due: "22 Apr 2026", status: "In Progress" },
      { id: "A-2b", description: "Maintenance to refix handrail in main corridor", owner: "Brendan Tierney", due: "20 Apr 2026", status: "Open" },
    ],
  },

  // 3) AUD-003 — In progress
  {
    id: "AUD-003", templateName: "Infection Prevention Audit", category: "Clinical",
    site: "East Cork", assignedTo: "Joanne Walsh",
    dueDate: "19 Apr 2026", daysUntilDue: -30, status: "On Track",
    progress: 33, totalItems: 8, completedItems: 3, findings: 0, photos: 0, notes: "",
  },

  // 4) AUD-004 — In progress
  {
    id: "AUD-004", templateName: "Medication Management Audit", category: "Medication",
    site: "West Waterford", assignedTo: "Niamh Connolly",
    dueDate: "20 Apr 2026", daysUntilDue: -29, status: "Due Soon",
    progress: 50, totalItems: 6, completedItems: 3, findings: 1, photos: 1,
    notes: "PRN protocol missing for one resident.",
    findingsList: [
      { id: "F-4", title: "PRN protocol missing for Eileen Fitzgerald", severity: "Medium", raisedAt: "20 Apr 2026", raisedBy: "Niamh Connolly" },
    ],
    actions: [
      { id: "A-4", description: "GP to review and sign PRN protocol for Eileen Fitzgerald", owner: "Niamh Connolly", due: "23 Apr 2026", status: "In Progress" },
    ],
    attachments: [{ id: "att-3", name: "medication-fridge-log.jpg", type: "photo" }],
  },

  // 5) AUD-005 — Completed
  {
    id: "AUD-005", templateName: "Care Plan Review Audit", category: "Clinical",
    site: "West Waterford", assignedTo: "Siobhán Kelly",
    dueDate: "21 Apr 2026", daysUntilDue: -28, status: "Complete",
    progress: 100, totalItems: 6, completedItems: 6, findings: 1, photos: 0,
    notes: "All care plans reviewed within 4-month window.",
    completedAt: "18 Apr 2026", signedOffBy: "Siobhán Kelly (PIC)",
    findingsList: [
      { id: "F-5", title: "Family input section sparse on 2 care plans", severity: "Low", raisedAt: "17 Apr 2026", raisedBy: "Siobhán Kelly" },
    ],
    timeline: [
      { at: "17 Apr 2026 10:00", by: "Siobhán Kelly", event: "Audit started" },
      { at: "18 Apr 2026 15:40", by: "Siobhán Kelly", event: "Submitted for sign-off" },
      { at: "18 Apr 2026 16:10", by: "Siobhán Kelly", event: "PIC signed off" },
    ],
  },

  // 6) AUD-006 — Completed
  {
    id: "AUD-006", templateName: "Safeguarding Audit", category: "Governance",
    site: "East Cork", assignedTo: "Mark Byrne",
    dueDate: "22 Apr 2026", daysUntilDue: -27, status: "Complete",
    progress: 100, totalItems: 5, completedItems: 5, findings: 0, photos: 0,
    notes: "All safeguarding records compliant.",
    completedAt: "20 Apr 2026", signedOffBy: "Mark Byrne (PIC)",
  },

  // 7) AUD-007 — Overdue
  {
    id: "AUD-007", templateName: "Environmental Safety Audit", category: "Health & Safety",
    site: "West Waterford", assignedTo: "Tom Reed",
    dueDate: "15 Apr 2026", daysUntilDue: -34, status: "Overdue",
    progress: 60, totalItems: 5, completedItems: 3, findings: 2, photos: 2,
    notes: "Outdoor lighting fault and unsecured cleaning store.",
    findingsList: [
      { id: "F-7a", title: "Outdoor lighting fault at rear entrance", severity: "Medium", raisedAt: "15 Apr 2026", raisedBy: "Tom Reed" },
      { id: "F-7b", title: "Cleaning store left unsecured during day shift", severity: "Medium", raisedAt: "15 Apr 2026", raisedBy: "Tom Reed" },
    ],
    actions: [
      { id: "A-7a", description: "Maintenance to repair rear-entrance lighting", owner: "Brendan Tierney", due: "20 Apr 2026", status: "Open" },
      { id: "A-7b", description: "Reinforce cleaning store key protocol with day staff", owner: "Ciarán Walsh", due: "18 Apr 2026", status: "In Progress" },
    ],
  },

  // 8) AUD-008 — Overdue
  {
    id: "AUD-008", templateName: "Health & Safety / Environment Audit", category: "Health & Safety",
    site: "West Waterford", assignedTo: "Brendan Tierney",
    dueDate: "10 Apr 2026", daysUntilDue: -39, status: "Overdue",
    progress: 80, totalItems: 6, completedItems: 5, findings: 2, photos: 3,
    notes: "Emergency lighting on corridor B flickering; waste store unlocked overnight.",
    findingsList: [
      { id: "F-8a", title: "Emergency lighting on corridor B flickering", severity: "High", raisedAt: "10 Apr 2026", raisedBy: "Brendan Tierney" },
      { id: "F-8b", title: "External waste store unlocked overnight", severity: "Medium", raisedAt: "10 Apr 2026", raisedBy: "Brendan Tierney" },
    ],
    actions: [
      { id: "A-8", description: "Replace emergency lighting battery pack on corridor B", owner: "Brendan Tierney", due: "17 Apr 2026", status: "In Progress" },
    ],
    attachments: [
      { id: "att-4", name: "emergency-light-corridor-b.jpg", type: "photo" },
      { id: "att-5", name: "waste-store-door.jpg", type: "photo" },
      { id: "att-6", name: "h&s-walkaround-notes.pdf", type: "document" },
    ],
  },

  // 9) AUD-009 — In progress
  {
    id: "AUD-009", templateName: "Staff Training Records Audit", category: "Governance",
    site: "East Cork", assignedTo: "Daniel Walsh",
    dueDate: "24 Apr 2026", daysUntilDue: -25, status: "On Track",
    progress: 40, totalItems: 4, completedItems: 2, findings: 1, photos: 0,
    notes: "Two staff missing refresher dates in training matrix.",
    findingsList: [
      { id: "F-9", title: "Refresher dates missing for 2 HCAs in training matrix", severity: "Low", raisedAt: "23 Apr 2026", raisedBy: "Daniel Walsh" },
    ],
    actions: [
      { id: "A-9", description: "Update training matrix with refresher dates for affected staff", owner: "Mark Byrne", due: "28 Apr 2026", status: "Open" },
    ],
  },

  // 10) AUD-010 — In progress
  {
    id: "AUD-010", templateName: "Complaints Register Audit", category: "Governance",
    site: "West Waterford", assignedTo: "Mark Byrne",
    dueDate: "25 Apr 2026", daysUntilDue: -24, status: "On Track",
    progress: 25, totalItems: 5, completedItems: 1, findings: 0, photos: 0, notes: "",
  },

  // 11) AUD-011 — Completed
  {
    id: "AUD-011", templateName: "Documentation Control Audit", category: "Governance",
    site: "East Cork", assignedTo: "Daniel Walsh",
    dueDate: "16 Apr 2026", daysUntilDue: -33, status: "Complete",
    progress: 100, totalItems: 4, completedItems: 4, findings: 1, photos: 0,
    notes: "Obsolete moving & handling SOP still in circulation.",
    completedAt: "15 Apr 2026", signedOffBy: "Mark Byrne (PIC)",
    findingsList: [
      { id: "F-11", title: "Obsolete moving & handling SOP still in circulation", severity: "Low", raisedAt: "14 Apr 2026", raisedBy: "Daniel Walsh" },
    ],
    actions: [
      { id: "A-11", description: "Withdraw obsolete SOP and reissue current version", owner: "Daniel Walsh", due: "18 Apr 2026", status: "Closed" },
    ],
  },
];

export const statusColor = (s: AuditStatus) => {
  if (s === "Overdue") return { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/20" };
  if (s === "Due Soon") return { bg: "bg-warning/10", text: "text-warning", border: "border-warning/20" };
  return { bg: "bg-success/10", text: "text-success", border: "border-success/20" };
};

export const progressColor = (status: AuditStatus) => {
  if (status === "Overdue") return "bg-destructive";
  if (status === "Due Soon") return "bg-warning";
  return "bg-success";
};
