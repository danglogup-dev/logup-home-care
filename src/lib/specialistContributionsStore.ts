// Specialist Contributor invitations — in-memory store.
// AI must never approve or publish care plans. Specialists contribute; managers review;
// changes still go through the normal approval chain.

import { useSyncExternalStore } from "react";
import type { Role } from "@/lib/roleStore";

export type RegistrationBody =
  | "CORU"
  | "NMBI"
  | "Medical Council"
  | "PSI"
  | "Other"
  | "Not applicable / family advocate / non-registered contributor";

export const REGISTRATION_BODIES: RegistrationBody[] = [
  "CORU",
  "NMBI",
  "Medical Council",
  "PSI",
  "Other",
  "Not applicable / family advocate / non-registered contributor",
];

export const REGULATED_BODIES: RegistrationBody[] = ["CORU", "NMBI", "Medical Council", "PSI", "Other"];

export type AccessLevel =
  | "view_only"
  | "contributory_notes"
  | "propose_section_update"
  | "upload_supporting_document";

export const ACCESS_LEVELS: { value: AccessLevel; label: string; description: string }[] = [
  { value: "view_only", label: "View only", description: "Can view selected care plan sections only." },
  { value: "contributory_notes", label: "Contributory notes", description: "Can add professional notes. Notes do not change the approved care plan." },
  { value: "propose_section_update", label: "Propose section update", description: "Can propose wording changes to selected sections. Proposed changes require Manager/PIC review." },
  { value: "upload_supporting_document", label: "Upload supporting document", description: "Can upload or attach supporting information such as an assessment or report." },
];

export type CarePlanSectionKey =
  | "about"
  | "communication"
  | "personalCare"
  | "mobility"
  | "fallsRisk"
  | "nutrition"
  | "medication"
  | "health"
  | "safeguarding"
  | "risksControls"
  | "goals"
  | "family"
  | "reviewNotes";

export const CARE_PLAN_SECTIONS: { key: CarePlanSectionKey; label: string }[] = [
  { key: "about", label: "About Me / What Matters to Me" },
  { key: "communication", label: "Communication" },
  { key: "personalCare", label: "Personal Care" },
  { key: "mobility", label: "Mobility" },
  { key: "fallsRisk", label: "Falls Risk" },
  { key: "nutrition", label: "Nutrition and Hydration" },
  { key: "medication", label: "Medication Support" },
  { key: "health", label: "Health Conditions" },
  { key: "safeguarding", label: "Safeguarding" },
  { key: "risksControls", label: "Risks and Controls" },
  { key: "goals", label: "Goals and Outcomes" },
  { key: "family", label: "Family / Advocate Involvement" },
  { key: "reviewNotes", label: "Review Notes" },
];

export type AccessScopeType = "person" | "selected_people" | "unit" | "site";

export type InviteStatus = "pending" | "active" | "expired" | "revoked";

export interface SpecialistContributor {
  id: string;
  fullName: string;
  email: string;
  profession: string;
  organisation: string;
  registrationBody: RegistrationBody;
  registrationNumber: string;
  createdAt: string;
}

export interface SpecialistInvite {
  id: string;
  contributorId: string;
  contributorName: string;
  contributorEmail: string;
  profession: string;
  organisation: string;
  registrationBody: RegistrationBody;
  registrationNumber: string;
  invitedBy: string;
  invitedAt: string;
  openedAt?: string;
  status: InviteStatus;
  accessScopeType: AccessScopeType;
  accessScopeLabel: string;
  personIds: string[];
  siteId?: string;
  unitId?: string;
  sectionAccess: CarePlanSectionKey[];
  accessLevel: AccessLevel[];
  expiryDate?: string;
  reasonForAccess: string;
  message?: string;
  inviteLink: string;
}

export type ContributionType = "professional_note" | "proposed_section_update" | "supporting_document";
export type ContributionStatus =
  | "submitted"
  | "under_manager_review"
  | "accepted_note_only"
  | "accepted_into_draft"
  | "partially_accepted"
  | "clarification_requested"
  | "rejected"
  | "archived";

export const CONTRIBUTION_STATUS_LABEL: Record<ContributionStatus, string> = {
  submitted: "Submitted",
  under_manager_review: "Under manager review",
  accepted_note_only: "Accepted as note",
  accepted_into_draft: "Accepted into draft",
  partially_accepted: "Partially accepted",
  clarification_requested: "Clarification requested",
  rejected: "Rejected",
  archived: "Archived",
};

export type ReviewDecisionKind =
  | "accepted_note_only"
  | "accepted_into_draft"
  | "merged_into_draft"
  | "clarification_requested"
  | "rejected"
  | "archived";

export interface ReviewDecision {
  id: string;
  decision: ReviewDecisionKind;
  reviewerName: string;
  reviewerRole: string;
  decidedAt: string;
  note?: string;
  draftVersionId?: string;
  draftVersionNumber?: number;
}

export interface SpecialistContribution {
  id: string;
  inviteId: string;
  personId: string;
  contributorName: string;
  contributorEmail: string;
  profession: string;
  organisation: string;
  registrationBody: RegistrationBody;
  registrationNumber: string;
  contributionType: ContributionType;
  affectedSections: CarePlanSectionKey[];
  note?: string;
  proposedText?: string;
  rationale?: string;
  documentTitle?: string;
  documentType?: string;
  status: ContributionStatus;
  submittedAt: string;
  linkedDraftVersionId?: string;
  linkedDraftVersionNumber?: number;
  decisions: ReviewDecision[];
}

interface State {
  contributors: SpecialistContributor[];
  invites: SpecialistInvite[];
  contributions: SpecialistContribution[];
}

const STORAGE_KEY = "logup.specialistContributions.v3";

function seed(): State {
  const now = new Date();
  const contributors: SpecialistContributor[] = [
    {
      id: "SC-001",
      fullName: "Sarah Keane",
      email: "sarah.keane@communitydietetics.ie",
      profession: "Dietitian",
      organisation: "Community Dietetics Team",
      registrationBody: "CORU",
      registrationNumber: "DT12345",
      createdAt: now.toISOString(),
    },
    {
      id: "SC-002",
      fullName: "Brian O'Donnell",
      email: "brian.odonnell@communityphysio.ie",
      profession: "Physiotherapist",
      organisation: "Community Physiotherapy",
      registrationBody: "CORU",
      registrationNumber: "PT67890",
      createdAt: now.toISOString(),
    },
  ];
  const invites: SpecialistInvite[] = [
    {
      id: "SI-001",
      contributorId: "SC-001",
      contributorName: "Sarah Keane",
      contributorEmail: "sarah.keane@communitydietetics.ie",
      profession: "Dietitian",
      organisation: "Community Dietetics Team",
      registrationBody: "CORU",
      registrationNumber: "DT12345",
      invitedBy: "Siobhán Kelly",
      invitedAt: now.toISOString(),
      status: "active",
      accessScopeType: "person",
      accessScopeLabel: "Mary O'Sullivan only",
      personIds: ["PS-002"],
      sectionAccess: ["nutrition", "health", "risksControls", "reviewNotes"],
      accessLevel: ["contributory_notes", "propose_section_update", "upload_supporting_document"],
      reasonForAccess: "Dietetic input to nutrition and hydration plan following weight loss.",
      inviteLink: "/external/care-plan-contribution/SI-001",
    },
    {
      id: "SI-002",
      contributorId: "SC-002",
      contributorName: "Brian O'Donnell",
      contributorEmail: "brian.odonnell@communityphysio.ie",
      profession: "Physiotherapist",
      organisation: "Community Physiotherapy",
      registrationBody: "CORU",
      registrationNumber: "PT67890",
      invitedBy: "Siobhán Kelly",
      invitedAt: now.toISOString(),
      status: "active",
      accessScopeType: "person",
      accessScopeLabel: "Patrick Murphy only",
      personIds: ["PS-001"],
      sectionAccess: ["mobility", "fallsRisk", "risksControls", "goals"],
      accessLevel: ["contributory_notes", "propose_section_update"],
      reasonForAccess: "Physiotherapy review following recent fall — mobility and falls risk sections.",
      inviteLink: "/external/care-plan-contribution/SI-002",
    },
  ];
  const contributions: SpecialistContribution[] = [
    {
      id: "SPC-001",
      inviteId: "SI-001",
      personId: "PS-002",
      contributorName: "Sarah Keane",
      contributorEmail: "sarah.keane@communitydietetics.ie",
      profession: "Dietitian",
      organisation: "Community Dietetics Team",
      registrationBody: "CORU",
      registrationNumber: "DT12345",
      contributionType: "proposed_section_update",
      affectedSections: ["nutrition"],
      note: "Mary's oral intake appears reduced. Recommend 7-day food and fluid chart, fortified snacks twice daily, and review after one week.",
      proposedText: "Offer Mary fortified snacks twice daily and encourage preferred fluids. Staff should record food and fluid intake for 7 days. Escalate to dietitian if intake remains low.",
      rationale: "Reduced oral intake observed over the past week — proactive nutrition support recommended.",
      status: "under_manager_review",
      submittedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      decisions: [],
    },
    {
      id: "SPC-002",
      inviteId: "SI-002",
      personId: "PS-001",
      contributorName: "Brian O'Donnell",
      contributorEmail: "brian.odonnell@communityphysio.ie",
      profession: "Physiotherapist",
      organisation: "Community Physiotherapy",
      registrationBody: "CORU",
      registrationNumber: "PT67890",
      contributionType: "proposed_section_update",
      affectedSections: ["mobility", "fallsRisk"],
      note: "Patrick should be reminded to use his four-wheeled walking frame for transfers and should have footwear and walking aid within reach before evening and night routines.",
      proposedText: "Staff should ensure Patrick's walking aid and suitable footwear are within reach before evening and night routines. Patrick should be reminded to request assistance before mobilising if he feels unsteady.",
      rationale: "Post-fall physiotherapy review — mitigations to reduce recurrence risk.",
      status: "accepted_into_draft",
      submittedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      linkedDraftVersionNumber: 4,
      decisions: [
        {
          id: "RD-DEMO-1",
          decision: "accepted_into_draft",
          reviewerName: "Siobhán Kelly",
          reviewerRole: "manager",
          decidedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
          note: "Aligns with post-fall care plan review — accepted into Draft v4 for PIC approval.",
          draftVersionNumber: 4,
        },
      ],
    },
  ];
  return { contributors, invites, contributions };
}

function load(): State {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch { /* ignore */ }
  const s = seed();
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  return s;
}

let state: State = load();
const listeners = new Set<() => void>();
function emit() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export const specialistContributionsStore = {
  get(): State { return state; },
  subscribe(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; },
  reset() { state = seed(); emit(); },
  invitesForPerson(personId: string): SpecialistInvite[] {
    return state.invites.filter((i) =>
      i.accessScopeType === "person" || i.accessScopeType === "selected_people"
        ? i.personIds.includes(personId)
        : false, // site/unit-scoped are matched separately if needed
    );
  },
  createInvite(input: Omit<SpecialistInvite, "id" | "invitedAt" | "status" | "inviteLink" | "contributorId"> & { contributorId?: string }): SpecialistInvite {
    const id = `SI-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    // ensure contributor
    let contributorId = input.contributorId;
    if (!contributorId) {
      const existing = state.contributors.find((c) => c.email.toLowerCase() === input.contributorEmail.toLowerCase());
      if (existing) contributorId = existing.id;
      else {
        contributorId = `SC-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        state.contributors = [
          ...state.contributors,
          {
            id: contributorId,
            fullName: input.contributorName,
            email: input.contributorEmail,
            profession: input.profession,
            organisation: input.organisation,
            registrationBody: input.registrationBody,
            registrationNumber: input.registrationNumber,
            createdAt: new Date().toISOString(),
          },
        ];
      }
    }
    const invite: SpecialistInvite = {
      ...input,
      contributorId,
      id,
      invitedAt: new Date().toISOString(),
      status: "pending",
      inviteLink: `/external/care-plan-contribution/${id}`,
    };
    state = { ...state, invites: [invite, ...state.invites] };
    emit();
    return invite;
  },
  revoke(inviteId: string) {
    state = {
      ...state,
      invites: state.invites.map((i) => (i.id === inviteId ? { ...i, status: "revoked" as InviteStatus } : i)),
    };
    emit();
  },
  extendExpiry(inviteId: string, newExpiryDate: string) {
    state = {
      ...state,
      invites: state.invites.map((i) => {
        if (i.id !== inviteId) return i;
        const next = { ...i, expiryDate: newExpiryDate };
        // If it was expired and new date is in the future, reactivate to previous 'active' state
        if (i.status === "expired" && new Date(newExpiryDate).getTime() > Date.now()) {
          next.status = "active" as InviteStatus;
        }
        return next;
      }),
    };
    emit();
  },
  getInvite(inviteId: string): SpecialistInvite | undefined {
    return state.invites.find((i) => i.id === inviteId);
  },
  contributionsForInvite(inviteId: string): SpecialistContribution[] {
    return state.contributions.filter((c) => c.inviteId === inviteId);
  },
  contributionsForPerson(personId: string): SpecialistContribution[] {
    return state.contributions.filter((c) => c.personId === personId);
  },
  submitContribution(input: Omit<SpecialistContribution, "id" | "submittedAt" | "status" | "decisions">): SpecialistContribution {
    const c: SpecialistContribution = {
      ...input,
      id: `SPC-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      submittedAt: new Date().toISOString(),
      status: "submitted",
      decisions: [],
    };
    state = { ...state, contributions: [c, ...state.contributions] };
    // First contribution activates pending invite
    if (state.invites.find((i) => i.id === input.inviteId)?.status === "pending") {
      state = {
        ...state,
        invites: state.invites.map((i) => (i.id === input.inviteId ? { ...i, status: "active" as InviteStatus } : i)),
      };
    }
    emit();
    return c;
  },

  markInviteOpened(inviteId: string) {
    state = {
      ...state,
      invites: state.invites.map((i) => (i.id === inviteId && !i.openedAt ? { ...i, openedAt: new Date().toISOString() } : i)),
    };
    emit();
  },

  // ---- Manager review actions ----
  _recordDecision(
    contributionId: string,
    decision: ReviewDecisionKind,
    reviewer: { name: string; role: string },
    opts?: { note?: string; nextStatus?: ContributionStatus; draftVersionId?: string; draftVersionNumber?: number },
  ) {
    const d: ReviewDecision = {
      id: `RD-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      decision,
      reviewerName: reviewer.name,
      reviewerRole: reviewer.role,
      decidedAt: new Date().toISOString(),
      note: opts?.note,
      draftVersionId: opts?.draftVersionId,
      draftVersionNumber: opts?.draftVersionNumber,
    };
    state = {
      ...state,
      contributions: state.contributions.map((c) => c.id === contributionId ? {
        ...c,
        status: opts?.nextStatus ?? c.status,
        decisions: [...(c.decisions ?? []), d],
        linkedDraftVersionId: opts?.draftVersionId ?? c.linkedDraftVersionId,
        linkedDraftVersionNumber: opts?.draftVersionNumber ?? c.linkedDraftVersionNumber,
      } : c),
    };
    emit();
    return d;
  },

  acceptAsNote(contributionId: string, reviewer: { name: string; role: string }, note?: string) {
    return this._recordDecision(contributionId, "accepted_note_only", reviewer, { note, nextStatus: "accepted_note_only" });
  },
  requestClarification(contributionId: string, reviewer: { name: string; role: string }, note: string) {
    return this._recordDecision(contributionId, "clarification_requested", reviewer, { note, nextStatus: "clarification_requested" });
  },
  rejectContribution(contributionId: string, reviewer: { name: string; role: string }, reason: string) {
    return this._recordDecision(contributionId, "rejected", reviewer, { note: reason, nextStatus: "rejected" });
  },
  archiveContribution(contributionId: string, reviewer: { name: string; role: string }, note?: string) {
    return this._recordDecision(contributionId, "archived", reviewer, { note, nextStatus: "archived" });
  },

  /**
   * Accept a proposed section update into a care plan draft. Creates a new draft
   * version if none exists, else updates the existing draft. Never touches
   * the published plan — Manager/PIC approval chain still required.
   */
  async acceptIntoDraft(
    contributionId: string,
    reviewer: { name: string; role: string },
    opts?: { note?: string; sectionKey?: CarePlanSectionKey; merge?: boolean },
  ) {
    const c = state.contributions.find((x) => x.id === contributionId);
    if (!c) return;
    const sectionKey = opts?.sectionKey ?? c.affectedSections[0];
    if (!sectionKey || !c.proposedText) {
      return this._recordDecision(contributionId, "accepted_note_only", reviewer, { note: opts?.note, nextStatus: "accepted_note_only" });
    }
    const mod = await import("./carePlansStore");
    const { versionId, versionNumber } = mod.carePlansStore.applySpecialistUpdateToDraft({
      personId: c.personId,
      sectionKey,
      body: c.proposedText,
      contributionId: c.id,
      actor: reviewer.name,
    }) ?? { versionId: undefined, versionNumber: undefined };
    return this._recordDecision(
      contributionId,
      opts?.merge ? "merged_into_draft" : "accepted_into_draft",
      reviewer,
      {
        note: opts?.note,
        nextStatus: "accepted_into_draft",
        draftVersionId: versionId,
        draftVersionNumber: versionNumber,
      },
    );
  },
};

export function useSpecialistContributions() {
  return useSyncExternalStore(
    specialistContributionsStore.subscribe,
    specialistContributionsStore.get,
    specialistContributionsStore.get,
  );
}

export function canInviteSpecialists(role: Role): boolean {
  return role === "admin" || role === "manager";
}
