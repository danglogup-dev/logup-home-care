## Product context

This project is LogUp Home Care: software for Irish home support providers whose carers visit clients in their own homes.

All existing rules below still apply — one source of truth, IDs not names, AI drafts must be human-confirmed, feature flags hide modules without deleting code.

## Rules

- Release modules are switched on/off in src/lib/featureFlags.ts; Guarded and AppSidebar read it — keeps unreleased module code intact while hiding it.
- Service users come from src/lib/serviceUsersStore.ts (seeded from demoDataRegistry); Events and Care Planning reference them by serviceUserId and derive names from it — one record, no drift.
- Site history is derived from lifecycle events via getSiteHistory, never stored separately — avoids two sources disagreeing.
- Key worker permissions compare keyWorkerStaffId with role.staffId — display names are labels only.
- User-facing names for service users come from useTerms() (src/hooks/useTerms.ts, backed by orgSettingsStore); pages never build plurals or possessives from the label — grammar is defined once per preset.
- Event field provenance (Source / AI draft / Human confirmed, with confirmedByStaffId and time) is stored on the submitted IncidentCard and never rewritten; later changes are amendments — keeps an honest trail of who confirmed what.
- Event-to-care-plan review rules live only in src/lib/carePlanReviewRules.ts; src/lib/carePlanReviewTrigger.ts wires incidentsStore.submit to associatedIncidentsStore and carePlansStore ReviewSuggestions — one suggestion system, and a suggestion never edits plan text.
- Care plan templates are versioned (src/lib/carePlanTemplateModel.ts, state in carePlansStore); sections carry a hidden standard category that rules and reporting use instead of display names, and template changes reach plans only through a draft's "Use latest template" — so renaming never breaks rules and published plans never change silently.
- Ask LogUp proposals come only from proposeCarePlanChanges (src/lib/carePlanAssistant.ts) as a ChangeSet; carePlansStore.acceptAssistantChange is the only path into a draft and records the original proposal — so a real model can replace the rules without touching the UI, and nothing enters a plan unaccepted. Section order lives on the version (sectionOrderOverride) and changes only via drafts; templates are never touched.
- Assessments are records in src/lib/assessmentsStore.ts (results of the provider's own tool, never scored by LogUp); "Consider reassessment" is decided only by reassessmentsForEvent in carePlanReviewRules.ts and each line stores its trigger(s) — so every suggestion can say why it exists.
- Insights Events/Care Planning cards are calculated live in src/lib/insightSignals.ts from the source stores (never seeded); dismissals and missing-link resolutions are append-only there, and names in a narrative never link a service user automatically — so every card can be traced to the records it counts.
- Care plan approvers and event submitters are matched by staffId (ApprovalPerson.staffId, createdByStaffId), never by name or email — names are labels only.
- Residents are admitted through the Admit flow; Directory of Residents fields, required flags and the admission care plan deadline live only in src/lib/residentDirectory.ts, and document pre-fill comes only from extractAdmissionDetails (src/lib/admissionAssistant.ts) as AI drafts that must be confirmed — so regulatory wording changes in one place and a real model can replace the simulation.
- Home support mode is decided by centreType "home_support" (isHomeSupport / isHomeSupportOrg in demoDataRegistry and sitesStore); UI hides HIQA OSV ID, registered capacity, rooms and the Directory of Residents from that flag rather than deleting the code — so residential support can return without rework.
