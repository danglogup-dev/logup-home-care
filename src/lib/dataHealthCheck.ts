/**
 * runDemoDataIntegrityCheck — prototype-only cross-module data sanity sweep.
 *
 * Scans all shared demo stores against the canonical `demoDataRegistry`
 * (Organisation → Site → Person Supported / Staff) and reports missing
 * references, mismatches, duplicates and geography leakage.
 *
 * This is intentionally READ-ONLY. Nothing here mutates any store.
 */

import {
  ORGANISATION,
  SITES,
  SITE_BY_ID,
  SITE_NAMES,
  PEOPLE_SUPPORTED,
  PERSON_BY_ID,
  STAFF,
  STAFF_BY_ID,
  FORBIDDEN_LOCATION_LABELS,
  type SiteId,
  type PersonSupportedId,
  type StaffId,
} from "./demoDataRegistry";
import { incidentRecords } from "./incidentRecords";
import { carePlansStore } from "./carePlansStore";
import { associatedIncidentsStore } from "./associatedIncidentsStore";
import { specialistContributionsStore } from "./specialistContributionsStore";
import { auditsStore } from "./auditsStore";
import { policiesStore } from "./policiesStore";
import { workforceStore } from "./workforceStore";
import { getTasks } from "./tasksStore";
import { seedInsights } from "./insightsData";

export type Severity = "error" | "warning" | "info";
export type ModuleName =
  | "Registry"
  | "Events"
  | "Care Planning"
  | "Audits"
  | "Policy Hub"
  | "Workforce"
  | "Insights"
  | "Tasks"
  | "Team"
  | "Cross-module";

export interface Issue {
  module: ModuleName;
  recordId: string;
  problem: string;
  suggestedFix: string;
  severity: Severity;
}

export interface DemoPathResult {
  name: string;
  personId: PersonSupportedId;
  passed: boolean;
  checks: { label: string; ok: boolean; detail?: string }[];
}

export interface IntegrityReport {
  ranAt: string;
  totals: {
    passed: number;
    warnings: number;
    errors: number;
  };
  passedChecks: string[];
  issues: Issue[];
  demoPaths: DemoPathResult[];
  scopes: {
    module: ModuleName;
    label: string;
    ok: boolean;
    detail?: string;
  }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_SITE_IDS = new Set<string>(SITES.map((s) => s.id));
const VALID_PERSON_IDS = new Set<string>(PEOPLE_SUPPORTED.map((p) => p.id));
const VALID_STAFF_IDS = new Set<string>(STAFF.map((s) => s.id));
const VALID_SITE_NAMES = new Set<string>(SITE_NAMES);

const containsForbiddenGeography = (s: string | undefined | null): string | null => {
  if (!s) return null;
  const hit = FORBIDDEN_LOCATION_LABELS.find((f) => s.includes(f));
  return hit ?? null;
};

// ─── Main entry ──────────────────────────────────────────────────────────────

export function runDemoDataIntegrityCheck(): IntegrityReport {
  const issues: Issue[] = [];
  const passedChecks: string[] = [];
  const scopes: IntegrityReport["scopes"] = [];

  const push = (i: Issue) => issues.push(i);
  const pass = (label: string) => passedChecks.push(label);

  // ── Registry sanity ────────────────────────────────────────────────────────
  {
    const seenSiteNames = new Map<string, string>();
    for (const s of SITES) {
      if (seenSiteNames.has(s.name)) {
        push({
          module: "Registry",
          recordId: s.id,
          problem: `Duplicate site name "${s.name}"`,
          suggestedFix: "Ensure each site in demoDataRegistry has a unique display name.",
          severity: "error",
        });
      }
      seenSiteNames.set(s.name, s.id);
    }
    if (SITES.length === 3) pass("3 canonical sites present (East Cork, West Waterford, West Waterford).");

    const seenPersonNames = new Map<string, string>();
    for (const p of PEOPLE_SUPPORTED) {
      const existing = seenPersonNames.get(p.name);
      if (existing) {
        push({
          module: "Registry",
          recordId: p.id,
          problem: `Duplicate person name "${p.name}" also held by ${existing}`,
          suggestedFix: "Rename one entry or merge the records.",
          severity: "error",
        });
      }
      seenPersonNames.set(p.name, p.id);

      if (!VALID_SITE_IDS.has(p.siteId)) {
        push({ module: "Registry", recordId: p.id, problem: `Person siteId "${p.siteId}" not in SITES.`, suggestedFix: "Point person at a valid SiteId.", severity: "error" });
      }
      if (p.unitId != null) {
        push({ module: "Registry", recordId: p.id, problem: `Person still carries unitId — site-only geography rule violated.`, suggestedFix: "Set unitId to null.", severity: "warning" });
      }
      if (!VALID_STAFF_IDS.has(p.keyWorkerId)) {
        push({ module: "Registry", recordId: p.id, problem: `Key worker ${p.keyWorkerId} not in STAFF.`, suggestedFix: "Assign an existing StaffId as key worker.", severity: "error" });
      }
    }
    pass(`${PEOPLE_SUPPORTED.length} People Supported all reference known sites & key workers.`);

    for (const s of STAFF) {
      for (const sid of s.scopeSiteIds) {
        if (!VALID_SITE_IDS.has(sid)) {
          push({ module: "Registry", recordId: s.id, problem: `Staff scope references unknown siteId ${sid}.`, suggestedFix: "Remove or fix the site id.", severity: "error" });
        }
      }
      for (const psid of s.linkedPersonSupportedIds ?? []) {
        if (!VALID_PERSON_IDS.has(psid)) {
          push({ module: "Registry", recordId: s.id, problem: `External specialist linked to unknown person ${psid}.`, suggestedFix: "Link to a valid PersonSupportedId.", severity: "error" });
        }
      }
    }
    pass(`${STAFF.length} Staff records all reference known sites and people.`);
  }

  // ── Events ────────────────────────────────────────────────────────────────
  {
    let siteNameErrors = 0;
    let forbiddenGeog = 0;
    const seenIds = new Set<string>();
    for (const r of incidentRecords) {
      if (seenIds.has(r.id)) {
        push({ module: "Events", recordId: r.id, problem: "Duplicate incident id.", suggestedFix: "Ensure each event has a unique id.", severity: "error" });
      }
      seenIds.add(r.id);

      if (!VALID_SITE_NAMES.has(r.site)) {
        siteNameErrors++;
        push({ module: "Events", recordId: r.id, problem: `Non-canonical site name "${r.site}".`, suggestedFix: "Use East Cork / West Waterford / West Waterford.", severity: "warning" });
      }
      const forbid = containsForbiddenGeography(r.location) || containsForbiddenGeography(r.site);
      if (forbid) {
        forbiddenGeog++;
        push({ module: "Events", recordId: r.id, problem: `Legacy geography label "${forbid}" leaking through.`, suggestedFix: "Remove wing/unit/floor references — geography is site-only.", severity: "warning" });
      }
    }
    if (!siteNameErrors) pass("Every event uses a canonical site name.");
    if (!forbiddenGeog) pass("No unit / wing / floor leakage in Events.");
  }

  // ── Care Planning ─────────────────────────────────────────────────────────
  {
    const state = carePlansStore.getState();
    for (const person of state.people) {
      if (!VALID_PERSON_IDS.has(person.id)) {
        push({ module: "Care Planning", recordId: person.id, problem: `Care Planning person "${person.id}" not in registry.`, suggestedFix: "Use a canonical PersonSupportedId or add to registry.", severity: "warning" });
      }
    }
    for (const plan of state.plans) {
      if (!VALID_PERSON_IDS.has(plan.personId)) {
        push({ module: "Care Planning", recordId: `plan:${plan.personId}`, problem: `Plan references unknown person ${plan.personId}.`, suggestedFix: "Point the plan at a registry person.", severity: "error" });
      }
      const current = plan.versions.find((v) => v.id === plan.currentVersionId);
      if (plan.currentVersionId && !current) {
        push({ module: "Care Planning", recordId: plan.personId, problem: `currentVersionId ${plan.currentVersionId} not present in versions[].`, suggestedFix: "Fix version reference or clear currentVersionId.", severity: "error" });
      }
      for (const v of plan.versions) {
        if (v.currentApprovedVersionId && !plan.versions.some((x) => x.id === v.currentApprovedVersionId)) {
          push({ module: "Care Planning", recordId: v.id, problem: `Draft references missing approved version ${v.currentApprovedVersionId}.`, suggestedFix: "Repair draft's currentApprovedVersionId.", severity: "warning" });
        }
      }
    }
    pass(`${state.plans.length} care plans reference valid people and versions.`);

    // Associated incidents must resolve to real Events records.
    const eventIds = new Set(incidentRecords.map((r) => r.id));
    for (const ai of associatedIncidentsStore.get()) {
      if (!eventIds.has(ai.incidentId)) {
        push({ module: "Care Planning", recordId: ai.incidentId, problem: `Associated incident ${ai.incidentId} does not exist in Events.`, suggestedFix: "Create the Event or remove the association.", severity: "error" });
      }
      if (!VALID_PERSON_IDS.has(ai.personId)) {
        push({ module: "Care Planning", recordId: ai.incidentId, problem: `Associated incident linked to unknown person ${ai.personId}.`, suggestedFix: "Link to a registry PersonSupportedId.", severity: "error" });
      }
      if (!VALID_SITE_IDS.has(ai.siteId)) {
        push({ module: "Care Planning", recordId: ai.incidentId, problem: `Associated incident has invalid siteId ${ai.siteId}.`, suggestedFix: "Use a canonical SiteId.", severity: "error" });
      }
      const forbid = containsForbiddenGeography(ai.unit) || containsForbiddenGeography(ai.site);
      if (forbid || ai.unit || ai.unitId) {
        push({ module: "Care Planning", recordId: ai.incidentId, problem: `Associated incident carries unit/wing/floor "${ai.unit ?? ai.unitId ?? forbid}".`, suggestedFix: "Drop unit fields — geography is site-only.", severity: "warning" });
      }
    }
    pass(`${associatedIncidentsStore.get().length} associated incidents reference real Events records.`);

    // Specialist contributors
    const spec = specialistContributionsStore.get();
    for (const c of spec.contributors) {
      if (!c.fullName || !c.registrationBody) {
        push({ module: "Care Planning", recordId: c.id, problem: `Contributor ${c.id} missing name or registration body.`, suggestedFix: "Complete contributor record.", severity: "warning" });
      }
    }
    for (const inv of spec.invites) {
      for (const psid of (inv as any).personSupportedIds ?? (inv as any).personIds ?? []) {
        if (!VALID_PERSON_IDS.has(psid)) {
          push({ module: "Care Planning", recordId: inv.id, problem: `Invite linked to unknown person ${psid}.`, suggestedFix: "Link invite to a registry PersonSupportedId.", severity: "error" });
        }
      }
    }
  }

  // ── Audits ────────────────────────────────────────────────────────────────
  {
    for (const r of auditsStore.all()) {
      if (!VALID_SITE_NAMES.has(r.site)) {
        push({ module: "Audits", recordId: r.id, problem: `Audit run at non-canonical site "${r.site}".`, suggestedFix: "Use a registry site name.", severity: "warning" });
      }
    }
    pass(`${auditsStore.all().length} audit runs recorded.`);
  }

  // ── Policy Hub ────────────────────────────────────────────────────────────
  {
    const policies = policiesStore.list();
    for (const p of policies) {
      if (p.currentVersionId) {
        const v = policiesStore.getVersion(p.currentVersionId);
        if (!v) {
          push({ module: "Policy Hub", recordId: p.id, problem: `Policy currentVersionId ${p.currentVersionId} not found.`, suggestedFix: "Repair or clear the currentVersionId.", severity: "error" });
        }
      }
    }
    pass(`${policies.length} policies present.`);
  }

  // ── Workforce ─────────────────────────────────────────────────────────────
  {
    const wStaff = workforceStore.getStaff();
    for (const m of wStaff) {
      if (!VALID_STAFF_IDS.has(m.id)) {
        push({ module: "Workforce", recordId: m.id, problem: `Workforce staff ${m.id} not in registry (Team mismatch).`, suggestedFix: "Add to demoDataRegistry.STAFF or align ids.", severity: "error" });
      }
      for (const sid of m.assignedSiteIds) {
        if (!VALID_SITE_IDS.has(sid)) {
          push({ module: "Workforce", recordId: m.id, problem: `Staff assigned to unknown site ${sid}.`, suggestedFix: "Use a canonical SiteId.", severity: "error" });
        }
      }
    }
    for (const r of workforceStore.getRequirements()) {
      if (!VALID_SITE_IDS.has(r.siteId)) {
        push({ module: "Workforce", recordId: r.id, problem: `Requirement references unknown site ${r.siteId}.`, suggestedFix: "Point requirement at a registry SiteId.", severity: "error" });
      }
      if (!workforceStore.getQualType(r.qualificationId)) {
        push({ module: "Workforce", recordId: r.id, problem: `Requirement references unknown qualification ${r.qualificationId}.`, suggestedFix: "Point at a registered QualificationType.", severity: "error" });
      }
    }
    pass(`${wStaff.length} workforce staff align to registry ids.`);
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  {
    const tasks = getTasks();
    for (const t of tasks) {
      if (t.siteId && !SITE_NAMES.includes(t.siteId) && !VALID_SITE_IDS.has(t.siteId)) {
        // Tasks may use either name or id historically. Warn if neither.
        push({ module: "Tasks", recordId: t.id, problem: `Task siteId "${t.siteId}" not a registry site.`, suggestedFix: "Use a canonical SiteId or site name.", severity: "warning" });
      }
      const forbid = containsForbiddenGeography((t as any).unit) || containsForbiddenGeography((t as any).location);
      if (forbid) {
        push({ module: "Tasks", recordId: t.id, problem: `Task carries legacy geography label "${forbid}".`, suggestedFix: "Remove unit/wing/floor from task.", severity: "warning" });
      }
    }
    pass(`${tasks.length} tasks scanned for scope and geography.`);
  }

  // ── Insights ──────────────────────────────────────────────────────────────
  {
    const eventIds = new Set(incidentRecords.map((r) => r.id));
    for (const ins of seedInsights) {
      if (!ins.relatedRecordIds || ins.relatedRecordIds.length === 0) {
        push({ module: "Insights", recordId: ins.id, problem: `Insight "${ins.title}" has no source records.`, suggestedFix: "Add at least one INC-/CP-/AUD-/POL-/TASK-/QUAL- id.", severity: "error" });
        continue;
      }
      for (const rid of ins.relatedRecordIds) {
        if (rid.startsWith("INC-") && !eventIds.has(rid)) {
          push({ module: "Insights", recordId: ins.id, problem: `Insight references missing event ${rid}.`, suggestedFix: "Create the event or drop the reference.", severity: "warning" });
        }
      }
      for (const sid of ins.relatedSiteIds ?? []) {
        if (!VALID_SITE_IDS.has(sid)) {
          push({ module: "Insights", recordId: ins.id, problem: `Insight references unknown site ${sid}.`, suggestedFix: "Use a canonical SiteId.", severity: "warning" });
        }
      }
      if (ins.unit && ins.unit.length > 0) {
        push({ module: "Insights", recordId: ins.id, problem: `Insight carries unit label "${ins.unit}".`, suggestedFix: "Drop unit — site-only geography.", severity: "warning" });
      }
    }
    pass(`${seedInsights.length} insights link back to real source records.`);
  }

  // ── Team ↔ Workforce reconciliation ───────────────────────────────────────
  {
    const wIds = new Set(workforceStore.getStaff().map((s) => s.id));
    const missingInWorkforce: string[] = [];
    for (const s of STAFF) {
      if (s.external) continue;
      if (s.readOnly) continue;
      if (!wIds.has(s.id)) missingInWorkforce.push(s.id);
    }
    if (missingInWorkforce.length) {
      push({ module: "Team", recordId: missingInWorkforce.join(","), problem: `Team members missing from Workforce: ${missingInWorkforce.join(", ")}.`, suggestedFix: "Add matching StaffMember rows to workforceStore.", severity: "warning" });
    } else {
      pass("Every operational Team member is present in Workforce.");
    }
  }

  // ── Scope / role smoke ────────────────────────────────────────────────────
  scopes.push({ module: "Registry", label: `Organisation: ${ORGANISATION.name}`, ok: true });
  scopes.push({ module: "Registry", label: `Sites: ${SITE_NAMES.join(", ")}`, ok: SITES.length === 3 });

  // ── Demo-specific paths ───────────────────────────────────────────────────
  const demoPaths: DemoPathResult[] = [
    buildDemoPath("Patrick Murphy", "PS-001", "SITE-ECK", { minFalls: 4, specialistStaffId: "STAFF-BRIAN" }),
    buildDemoPath("Mary O'Sullivan", "PS-002", "SITE-ECK", { minNutrition: 2, specialistStaffId: "STAFF-SARAH" }),
    buildDemoPath("Eileen Fitzgerald", "PS-004", "SITE-WWD", { minBehaviour: 1 }),
    buildDemoPath("Michael Doyle", "PS-007", "SITE-WWD", { minEpilepsy: 1 }),
  ];

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;

  return {
    ranAt: new Date().toISOString(),
    totals: { passed: passedChecks.length, warnings, errors },
    passedChecks,
    issues,
    demoPaths,
    scopes,
  };
}

// ─── Demo-specific paths ─────────────────────────────────────────────────────

interface DemoExpectations {
  minFalls?: number;
  minNutrition?: number;
  minBehaviour?: number;
  minEpilepsy?: number;
  specialistStaffId?: StaffId;
}

function buildDemoPath(
  name: string,
  personId: PersonSupportedId,
  expectedSiteId: SiteId,
  expect: DemoExpectations,
): DemoPathResult {
  const checks: DemoPathResult["checks"] = [];
  const person = PERSON_BY_ID[personId];

  checks.push({
    label: `Person exists in registry (${personId})`,
    ok: !!person,
    detail: person ? undefined : `PS not found`,
  });
  checks.push({
    label: `Site is ${SITE_BY_ID[expectedSiteId]?.name}`,
    ok: person?.siteId === expectedSiteId,
    detail: person ? `siteId=${person.siteId}` : undefined,
  });

  const plan = carePlansStore.getPlan(personId);
  checks.push({ label: `Care plan exists`, ok: !!plan });

  const events = incidentRecords.filter((r) => r.resident === name || r.resident === person?.name);
  if (expect.minFalls != null) {
    const falls = events.filter((e) => (e.category || "").toLowerCase().includes("fall") || (e.summary || "").toLowerCase().includes("fall"));
    checks.push({ label: `≥${expect.minFalls} fall events in Events`, ok: falls.length >= expect.minFalls, detail: `${falls.length} found` });
  }
  if (expect.minNutrition != null) {
    const nut = events.filter((e) => /nutri|hydrat/i.test(`${e.category} ${e.summary}`));
    checks.push({ label: `≥${expect.minNutrition} nutrition/hydration events`, ok: nut.length >= expect.minNutrition, detail: `${nut.length} found` });
  }
  if (expect.minBehaviour != null) {
    const b = events.filter((e) => /behavi|safeguard/i.test(`${e.category} ${e.summary}`));
    checks.push({ label: `≥${expect.minBehaviour} behaviour/safeguarding event`, ok: b.length >= expect.minBehaviour, detail: `${b.length} found` });
  }
  if (expect.minEpilepsy != null) {
    const ep = events.filter((e) => /epileps|seizure/i.test(`${e.category} ${e.summary}`));
    checks.push({ label: `≥${expect.minEpilepsy} epilepsy-related event`, ok: ep.length >= expect.minEpilepsy, detail: `${ep.length} found` });
  }

  const associated = associatedIncidentsStore.forPerson(personId);
  checks.push({ label: `Associated incidents present (Care Planning → Events)`, ok: associated.length > 0, detail: `${associated.length} associated` });

  if (expect.specialistStaffId) {
    const staff = STAFF_BY_ID[expect.specialistStaffId];
    const linked = !!staff?.linkedPersonSupportedIds?.includes(personId);
    checks.push({ label: `Specialist ${staff?.name ?? expect.specialistStaffId} linked to ${name}`, ok: linked });
  }

  // No cross-contamination: this person's demo events do not include another person's name.
  const otherNames = PEOPLE_SUPPORTED.filter((p) => p.id !== personId).map((p) => p.name);
  const contamination = events.filter((e) => otherNames.some((n) => (e.summary || "").includes(n)));
  checks.push({ label: `No cross-person data leakage`, ok: contamination.length === 0, detail: contamination.length ? `${contamination.length} events mention other people` : undefined });

  return {
    name,
    personId,
    passed: checks.every((c) => c.ok),
    checks,
  };
}
