// Visibility & compliance guardrails for LogUp Events.
//
// LogUp is used in regulated care environments. Event records may contain
// sensitive personal data, health/care information, safeguarding info,
// complaints, staffing concerns, family details and records requests.
//
// Frontline staff can capture sensitive Events quickly via AI-assisted
// voice/text, but Managers/Admins control visibility, review, action,
// reporting and closure. This module defines the per-record visibility
// settings, the default per Event Type, and the access helpers.

import type { EventType } from "./eventTypes";
import type { Role } from "./roleStore";

export type VisibilityMode =
  | "submitter_full"     // Submitter can view full submitted record
  | "submitter_status"   // Submitter can view status only
  | "submitter_hidden"   // Submitter cannot view after submission
  | "manager_only"       // Manager/Admin only
  | "custom";            // Custom access (managed in detail dialog)

export interface VisibilityChange {
  id: string;
  from: VisibilityMode;
  to: VisibilityMode;
  changedBy: string;
  changedAt: string; // friendly stamp
  reason?: string;
}

export const VISIBILITY_OPTIONS: { value: VisibilityMode; label: string; description: string }[] = [
  { value: "submitter_full",   label: "Submitter can view full record",       description: "Submitter sees their own submitted record in full." },
  { value: "submitter_status", label: "Submitter can view status only",       description: "Submitter sees only the status of their submission." },
  { value: "submitter_hidden", label: "Submitter cannot view after submission", description: "Submitter cannot view the record once submitted." },
  { value: "manager_only",     label: "Manager / Admin only",                 description: "Only Managers and Admins (within scope) can view." },
  { value: "custom",           label: "Custom access",                        description: "Managed per-record by an authorised Manager or Admin." },
];

export const VISIBILITY_LABEL: Record<VisibilityMode, string> = Object.fromEntries(
  VISIBILITY_OPTIONS.map(o => [o.value, o.label]),
) as Record<VisibilityMode, string>;

/**
 * Default visibility per Event Type — applied automatically on submission.
 * Managers/Admins can change visibility on any record afterwards.
 */
export function getDefaultVisibility(eventType: EventType | undefined): VisibilityMode {
  switch (eventType) {
    case "Complaint":
    case "Concern":
      return "submitter_full"; // restricted, submitter can view own submission
    case "Information Request / Records Request":
      return "submitter_status"; // restricted, submitter sees limited record
    case "Safeguarding Concern":
      return "submitter_status"; // restricted, configurable by Manager/Admin
    case "Regulatory Notification":
    case "Inspection / Regulatory Visit":
      return "manager_only";
    case "Compliment":
      return "submitter_full"; // not restricted by default
    case "Incident / Accident":
    default:
      return "submitter_full"; // configurable, submitter sees own by default
  }
}

/**
 * Visibility modes that count as "restricted" — i.e. should be excluded from
 * frontline dashboards, aggregate stats, trend widgets and general feeds.
 * Frontline staff do not access Board / Reporting / Insights at the route
 * level today, but this helper future-proofs any frontline aggregate view.
 */
export const RESTRICTED_MODES: VisibilityMode[] = [
  "submitter_status",
  "submitter_hidden",
  "manager_only",
  "custom",
];

export function isRestricted(mode: VisibilityMode | undefined): boolean {
  if (!mode) return false;
  return RESTRICTED_MODES.includes(mode);
}

/** Manager / Admin can manage visibility on records they're authorised for. */
export function canManageVisibility(role: Role): boolean {
  return role === "admin" || role === "manager";
}

/**
 * Whether a viewer can see the full submitted record.
 * - Admin always.
 * - Manager: if the record's site is in their scope.
 * - Frontline: only if they are the submitter AND visibility allows full view.
 */
export function canViewFullRecord(args: {
  role: Role;
  scope: string[];
  viewerStaffId: string | undefined;
  recordSite: string;
  submitterStaffId: string | undefined;
  visibility: VisibilityMode | undefined;
}): boolean {
  const { role, scope, viewerStaffId, recordSite, submitterStaffId, visibility } = args;
  if (role === "admin") return true;
  if (role === "manager") return !recordSite || scope.includes(recordSite);
  // viewonly: respect the same access rules as restricted (no full record)
  if (role === "viewonly") return !isRestricted(visibility);
  // frontline
  if (visibility === "submitter_full" && submitterStaffId && submitterStaffId === viewerStaffId) {
    return true;
  }
  return false;
}

/**
 * Whether the viewer should see internal/manager-only sections — manager
 * review notes, internal investigation notes, governance notes, legal/privacy
 * notes, regulator escalation notes, restricted attachments, other people's
 * statements, etc.
 */
export function canViewInternalNotes(role: Role): boolean {
  return role === "admin" || role === "manager";
}

/** Site-level event (no resident by nature): fire alarm / environmental, or logged with "No service user involved". */
export function isSiteLevelEvent(e: { category?: string; eventType?: string; noServiceUserInvolved?: boolean }): boolean {
  if (e.noServiceUserInvolved) return true;
  return /fire|environment/i.test(`${e.category ?? ""} ${e.eventType ?? ""}`);
}
