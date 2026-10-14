// Lightweight in-memory store for audit templates so the Templates section
// can create and edit templates that persist within a session.

import { useSyncExternalStore } from "react";

export type Recurrence = "Weekly" | "Monthly" | "Quarterly" | "Annually";

export interface AuditTemplate {
  id: string;
  name: string;
  category?: string;
  items: string[];
  recurring: boolean;
  recurrence?: Recurrence;
  guidance?: string;
  updatedAt: string;
}

const seed: AuditTemplate[] = [
  { id: "t1", name: "Infection Prevention & Control (IPC) Audit", category: "Clinical / Care", items: ["Hand hygiene stations stocked", "PPE available and accessible", "Waste segregation correct", "Laundry handling compliant", "Clean and dirty utility rooms separated", "Outbreak management plan accessible", "Staff IPC training up to date", "Resident isolation protocols in place"], recurring: true, recurrence: "Monthly", guidance: "Based on HIQA Standards 2024 — Regulation 27", updatedAt: new Date().toISOString() },
  { id: "t2", name: "Care Plan Audit", category: "Clinical / Care", items: ["Care plan in place for each resident", "Care plans reviewed within 4 months", "Person-centred goals documented", "Family/resident input documented", "Risk assessments up to date", "Multi-disciplinary input recorded"], recurring: true, recurrence: "Quarterly", guidance: "Regulation 5 — Individual assessment and care plan", updatedAt: new Date().toISOString() },
  { id: "t3", name: "Medication Management Audit", category: "Medication", items: ["Prescription sheets legible and signed", "Controlled drugs register accurate", "Medication fridge temperature logged", "PRN protocols documented", "Medication errors reported and reviewed", "Staff competency records current"], recurring: true, recurrence: "Monthly", guidance: "Regulation 29 — Medicines and pharmaceutical services", updatedAt: new Date().toISOString() },
  { id: "t4", name: "Falls Management Audit", category: "Clinical / Care", items: ["Falls risk assessment completed", "Post-fall protocol followed", "Environmental hazards addressed", "Mobility aids available", "Falls prevention care plan in place", "Falls data reviewed monthly"], recurring: true, recurrence: "Monthly", updatedAt: new Date().toISOString() },
  { id: "t5", name: "Health & Safety / Environment Audit", category: "Safety", items: ["Fire exits unobstructed", "Emergency lighting functional", "Risk assessments current", "Maintenance log reviewed", "CCTV signage in place", "Outdoor areas safe and accessible"], recurring: true, recurrence: "Monthly", updatedAt: new Date().toISOString() },
  { id: "t6", name: "Restraint Audit", category: "Safeguarding", items: ["Restraint register maintained", "Consent obtained and documented", "Least restrictive practice evidenced", "Regular review schedule in place", "Staff training records current"], recurring: true, recurrence: "Quarterly", updatedAt: new Date().toISOString() },
  { id: "t7", name: "Complaints Register Audit", category: "Governance", items: ["Complaints policy accessible", "Complaints logged within 24h", "Investigation timeline met", "Outcomes communicated to complainant", "Learning actions documented"], recurring: true, recurrence: "Quarterly", updatedAt: new Date().toISOString() },
  { id: "t8", name: "Fire Safety Check", category: "Safety", items: ["Fire alarm panel checked", "Fire doors closing correctly", "Extinguishers in date and accessible", "Evacuation plan displayed", "Staff fire drill completed this quarter", "Fire register up to date", "Emergency grab bags checked"], recurring: true, recurrence: "Weekly", guidance: "Fire Services Act 1981 & 2003 — Regulation 28", updatedAt: new Date().toISOString() },
];

export const TEMPLATE_CATEGORIES = [
  "Clinical / Care",
  "Medication",
  "Safety",
  "Safeguarding",
  "Governance",
  "Site Operations",
  "Staff / HR",
] as const;

let state: AuditTemplate[] = [...seed];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const auditTemplatesStore = {
  getAll(): AuditTemplate[] {
    return state;
  },
  get(id: string): AuditTemplate | undefined {
    return state.find((t) => t.id === id);
  },
  create(input: Omit<AuditTemplate, "id" | "updatedAt">): AuditTemplate {
    const t: AuditTemplate = {
      ...input,
      id: `t${Date.now().toString(36)}`,
      updatedAt: new Date().toISOString(),
    };
    state = [t, ...state];
    emit();
    return t;
  },
  update(id: string, patch: Partial<Omit<AuditTemplate, "id">>): AuditTemplate | undefined {
    let updated: AuditTemplate | undefined;
    state = state.map((t) => {
      if (t.id !== id) return t;
      updated = { ...t, ...patch, updatedAt: new Date().toISOString() };
      return updated;
    });
    emit();
    return updated;
  },
  remove(id: string): void {
    state = state.filter((t) => t.id !== id);
    emit();
  },
  duplicate(id: string): AuditTemplate | undefined {
    const src = state.find((t) => t.id === id);
    if (!src) return undefined;
    return this.create({
      name: `${src.name} (copy)`,
      category: src.category,
      items: [...src.items],
      recurring: src.recurring,
      recurrence: src.recurrence,
      guidance: src.guidance,
    });
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useAuditTemplates(): AuditTemplate[] {
  return useSyncExternalStore(
    (cb) => auditTemplatesStore.subscribe(cb),
    () => auditTemplatesStore.getAll(),
    () => auditTemplatesStore.getAll(),
  );
}
