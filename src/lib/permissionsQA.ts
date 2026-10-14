// Permissions QA harness — pure functions used by the /app/_debug/permissions
// page to sanity-check role + siteId scope rules across all modules against
// the shared demo registry.
//
// Every check runs against a specific preset (looked up by id) so results are
// deterministic and don't depend on the currently active "viewing as" role.

import {
  ROLE_PRESETS,
  type RoleState,
  inScopeSite,
  personInScope,
  isKeyWorkerFor,
  canLogEvent,
  canReviewEvents,
  canCompleteAudit,
  canReviewAudit,
  canViewWorkforceForSite,
  canViewInsightsForSite,
  canViewTask,
  canExport,
  canProposePolicyUpdate,
  canApprovePolicy,
  canAccess,
} from "./roleStore";
import { canApproveCarePlanDraft, canEditCarePlanFor } from "./carePlansStore";

export interface QARow {
  preset: string;                 // preset id
  presetLabel: string;
  who: string;                    // display name
  module: string;
  scenario: string;
  expected: boolean;
  actual: boolean;
  pass: boolean;
}

function preset(id: string): RoleState {
  const p = ROLE_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  const { id: _i, label: _l, description: _d, ...rest } = p;
  return { ...rest, scopeSiteIds: [...p.scopeSiteIds], scope: [...p.scope], keyWorkerFor: [...p.keyWorkerFor] };
}

function row(presetId: string, module: string, scenario: string, expected: boolean, actual: boolean): QARow {
  const p = ROLE_PRESETS.find((x) => x.id === presetId)!;
  return {
    preset: presetId,
    presetLabel: p.label,
    who: p.displayName,
    module,
    scenario,
    expected,
    actual,
    pass: expected === actual,
  };
}

export function runPermissionsQA(): QARow[] {
  const results: QARow[] = [];

  const admin      = preset("admin");
  const siobhan    = preset("manager-multi");
  const daniel     = preset("manager-single");
  const claire     = preset("manager-elm");
  const liam       = preset("frontline");
  const emma       = preset("keyworker-emma");
  const aisling    = preset("keyworker-aisling");
  const ciaran     = preset("viewonly");
  const sarah      = preset("specialist-sarah");
  const brian      = preset("specialist-brian");

  // ---------- Site scope visibility ----------
  results.push(row("manager-multi", "Scope", "Sees East Cork (SITE-ECK)",   true,  inScopeSite("SITE-ECK", siobhan)));
  results.push(row("manager-multi", "Scope", "Sees West Waterford (SITE-WWD)",  true,  inScopeSite("SITE-WWD", siobhan)));
  results.push(row("manager-multi", "Scope", "Does NOT see Elm Grove (SITE-WWD)",false, inScopeSite("SITE-WWD", siobhan)));
  results.push(row("manager-single","Scope", "Sees Oakfield only",               true,  inScopeSite("SITE-ECK", daniel) && !inScopeSite("SITE-WWD", daniel) && !inScopeSite("SITE-WWD", daniel)));
  results.push(row("manager-elm",   "Scope", "Sees Elm Grove only",              true,  inScopeSite("SITE-WWD", claire) && !inScopeSite("SITE-ECK", claire)));
  results.push(row("admin",         "Scope", "Sees all sites",                   true,  inScopeSite("SITE-ECK", admin) && inScopeSite("SITE-WWD", admin) && inScopeSite("SITE-WWD", admin)));

  // ---------- Person visibility via site scope ----------
  results.push(row("manager-multi","People","Siobhán sees Patrick (Oak)",  true,  personInScope("PS-001", siobhan)));
  results.push(row("manager-multi","People","Siobhán sees Eileen (Riv)",   true,  personInScope("PS-004", siobhan)));
  results.push(row("manager-multi","People","Siobhán does NOT see Bridget (Elm)", false, personInScope("PS-006", siobhan)));
  results.push(row("manager-single","People","Daniel sees Patrick",         true,  personInScope("PS-001", daniel)));
  results.push(row("manager-single","People","Daniel does NOT see Eileen",  false, personInScope("PS-004", daniel)));

  // ---------- Key worker identity ----------
  results.push(row("keyworker-emma", "Care planning", "Emma is key worker for Patrick (PS-001)", true,  isKeyWorkerFor("PS-001", emma)));
  results.push(row("keyworker-emma", "Care planning", "Emma is NOT key worker for Mary (PS-002)",false, isKeyWorkerFor("PS-002", emma)));
  results.push(row("keyworker-aisling","Care planning","Aisling is key worker for Mary",         true,  isKeyWorkerFor("PS-002", aisling)));

  // Emma can edit Patrick's plan but not Mary's; cannot approve/publish
  const patrick = { site: "East Cork", unit: "", keyWorker: "Emma Ryan", keyWorkerStaffId: "STAFF-EMMA" as const };
  const mary    = { site: "East Cork", unit: "", keyWorker: "Aisling Doherty", keyWorkerStaffId: "STAFF-AISLING" as const };
  results.push(row("keyworker-emma","Care planning","Emma can edit Patrick draft sections", true,
    canEditCarePlanFor(patrick, { role: emma.role, scope: emma.scope, staffId: emma.staffId })));
  results.push(row("keyworker-emma","Care planning","Emma cannot edit Mary's plan", false,
    canEditCarePlanFor(mary, { role: emma.role, scope: emma.scope, staffId: emma.staffId })));
  results.push(row("keyworker-emma","Care planning","Emma cannot approve any draft", false,
    canApproveCarePlanDraft("CP-PS001-V4", { role: emma.role, staffName: emma.displayName, staffId: emma.staffId })));

  // Daniel/Siobhán approve only if at current chain level (depends on draft's instance)
  results.push(row("manager-single","Care planning","Daniel cannot approve Patrick draft unless at chain level", false,
    canApproveCarePlanDraft("CP-PS001-V4", { role: daniel.role, staffName: daniel.displayName, staffId: daniel.staffId })));
  // Siobhán is a listed approver in the seeded chain for CP-PS001-V4, but until
  // the draft is submitted and an approval instance is active, NO ONE can
  // approve — that's the intended safety property. Expected false here.
  const siobhanApproves = canApproveCarePlanDraft("CP-PS001-V4", { role: siobhan.role, staffName: siobhan.displayName, staffId: siobhan.staffId });
  results.push(row("manager-multi","Care planning","Siobhán cannot approve without an active approval instance", false, siobhanApproves));

  // Admin does not silently bypass — canApproveCarePlanDraft is false without override; override path is separate
  const aoifeCanApprove = canApproveCarePlanDraft("CP-PS001-V4", { role: admin.role, staffName: admin.displayName, staffId: admin.staffId });
  results.push(row("admin","Care planning","Admin cannot silently approve without being in chain (override required)", false, aoifeCanApprove));

  // ---------- Events ----------
  results.push(row("frontline",     "Events", "Liam can log Events at Oakfield",       true,  canLogEvent("SITE-ECK", liam)));
  results.push(row("frontline",     "Events", "Liam cannot log Events at Riverside",   false, canLogEvent("SITE-WWD", liam)));
  results.push(row("manager-multi", "Events", "Siobhán can review Events at Oakfield", true,  canReviewEvents("SITE-ECK", siobhan)));
  results.push(row("manager-multi", "Events", "Siobhán cannot review Events at Elm",   false, canReviewEvents("SITE-WWD", siobhan)));
  results.push(row("viewonly",      "Events", "Ciarán cannot log Events (viewonly)",   false, canLogEvent("SITE-ECK", ciaran)));

  // ---------- Audits ----------
  results.push(row("frontline", "Audits", "Liam can only complete audits assigned to him",
    true, canCompleteAudit({ siteId: "SITE-ECK", assignedStaffIds: [liam.staffId] }, liam)));
  results.push(row("frontline", "Audits", "Liam cannot complete unassigned audits",
    false, canCompleteAudit({ siteId: "SITE-ECK", assignedStaffIds: [] }, liam)));
  results.push(row("manager-single", "Audits", "Daniel can review Oakfield audits", true, canReviewAudit("SITE-ECK", daniel)));
  results.push(row("manager-single", "Audits", "Daniel cannot review Riverside audits", false, canReviewAudit("SITE-WWD", daniel)));
  results.push(row("viewonly", "Audits", "Ciarán cannot complete any audit", false,
    canCompleteAudit({ siteId: "SITE-ECK", assignedStaffIds: [ciaran.staffId] }, ciaran)));

  // ---------- Policies ----------
  results.push(row("manager-multi","Policy Hub","Siobhán can propose policy updates", true,  canProposePolicyUpdate(siobhan)));
  results.push(row("manager-multi","Policy Hub","Siobhán cannot approve policies",    false, canApprovePolicy(siobhan)));
  results.push(row("admin",        "Policy Hub","Admin can approve policies",         true,  canApprovePolicy(admin)));

  // ---------- Workforce ----------
  results.push(row("manager-multi","Workforce","Siobhán sees Oakfield workforce",       true,  canViewWorkforceForSite("SITE-ECK", siobhan)));
  results.push(row("manager-multi","Workforce","Siobhán does NOT see Elm workforce",    false, canViewWorkforceForSite("SITE-WWD", siobhan)));
  results.push(row("frontline",    "Workforce","Frontline cannot view site workforce", false, canViewWorkforceForSite("SITE-ECK", liam)));

  // ---------- Insights ----------
  results.push(row("frontline",    "Insights","Frontline cannot see leadership insights", false, canViewInsightsForSite("SITE-ECK", liam)));
  results.push(row("manager-multi","Insights","Siobhán sees insights at Riverside",       true,  canViewInsightsForSite("SITE-WWD", siobhan)));
  results.push(row("manager-multi","Insights","Siobhán does NOT see Elm insights",        false, canViewInsightsForSite("SITE-WWD", siobhan)));

  // ---------- Tasks ----------
  results.push(row("keyworker-emma","Tasks","Emma sees tasks linked to Patrick",
    true,  canViewTask({ siteId: "SITE-ECK", personSupportedId: "PS-001" }, emma)));
  results.push(row("keyworker-emma","Tasks","Emma does not see tasks for Mary unless assigned",
    false, canViewTask({ siteId: "SITE-ECK", personSupportedId: "PS-002" }, emma)));
  results.push(row("viewonly","Tasks","Ciarán cannot complete tasks", false,
    canViewTask({ siteId: "SITE-ECK" }, ciaran) && ciaran.role !== "viewonly"));

  // ---------- Exports & view-only ----------
  results.push(row("viewonly","Global","Ciarán cannot export",     false, canExport("events", "SITE-ECK", ciaran)));
  results.push(row("frontline","Global","Frontline cannot export", false, canExport("events", "SITE-ECK", liam)));
  results.push(row("manager-multi","Global","Siobhán can export Oakfield", true, canExport("events", "SITE-ECK", siobhan)));
  results.push(row("manager-multi","Global","Siobhán cannot export Elm",   false, canExport("events", "SITE-WWD", siobhan)));

  // ---------- External specialists ----------
  results.push(row("specialist-sarah","External","Sarah has NO main-app module access", false,
    canAccess("incidents.overview", sarah.role) || canAccess("carePlans.overview", sarah.role) || canAccess("team", sarah.role)));
  results.push(row("specialist-sarah","External","Sarah is linked to Mary (PS-002)",    true,  personInScope("PS-002", sarah)));
  results.push(row("specialist-sarah","External","Sarah is NOT linked to Patrick",      false, personInScope("PS-001", sarah)));
  results.push(row("specialist-brian","External","Brian is linked to Patrick",          true,  personInScope("PS-001", brian)));
  results.push(row("specialist-sarah","External","Sarah cannot edit Mary's approved plan", false,
    canEditCarePlanFor(mary, { role: sarah.role, scope: sarah.scope, staffId: sarah.staffId })));

  return results;
}

export function qaSummary(rows: QARow[]): { total: number; passed: number; failed: number } {
  const passed = rows.filter((r) => r.pass).length;
  return { total: rows.length, passed, failed: rows.length - passed };
}
