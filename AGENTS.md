## Product context

This project is LogUp Home Care: software for Irish home support providers whose carers visit clients in their own homes.

All existing rules below still apply — one source of truth, IDs not names, AI drafts must be human-confirmed, feature flags hide modules without deleting code.

## Rules

Subdirectories have their own AGENTS.md; read it before changing files there.

- Release modules are switched on/off in src/lib/featureFlags.ts; Guarded and AppSidebar read it — keeps unreleased module code intact while hiding it.
- Service users come from src/lib/serviceUsersStore.ts (seeded from demoDataRegistry); Events and Care Planning reference them by serviceUserId and derive names from it — one record, no drift.
- Site history is derived from lifecycle events via getSiteHistory, never stored separately — avoids two sources disagreeing.
- Key worker permissions compare keyWorkerStaffId with role.staffId — display names are labels only.
- User-facing names for service users come from useTerms() (src/hooks/useTerms.ts, backed by orgSettingsStore); pages never build plurals or possessives from the label — grammar is defined once per preset.
- Event field provenance (Source / AI draft / Human confirmed, with confirmedByStaffId and time) is stored on the submitted IncidentCard and never rewritten; later changes are amendments — keeps an honest trail of who confirmed what.
- Care plan approvers and event submitters are matched by staffId (ApprovalPerson.staffId, createdByStaffId), never by name or email — names are labels only.
- Home support mode is decided by centreType "home_support" (isHomeSupport / isHomeSupportOrg in demoDataRegistry and sitesStore); UI hides HIQA OSV ID, registered capacity, rooms, the Directory of Residents and Shift coverage (NotForHomeSupport) from that flag rather than deleting the code — so residential support can return without rework.
- Roster scheduling lives on the same Visit records (rosterRules.ts + visitsStore roster actions): assignment status is derived, roster/delivery statuses stay separate, changes append rosterHistory, never auto-assign.
- Roster dialogs preview availability from edited times but gate all carer changes until an explicit time save — prevents assignment against unsaved schedules without silently saving.
- visitsStore owns ID-based visits gated by visits flag. Plan schedule sections record staff-confirmed draft templates; only publication feeds visitsStore, versioning templates and attributing cancellations of untouched future calls while preserving recorded care. liveVisitRules derives scoped alerts, never submits Events; calls use direct numbers. Coordinator access is demo manager access, not Cloud authorization.
- visitNotesStore reads append-only Cloud notes with transcript/draft and Events-shaped provenance; authenticated ownership secures records, prototype staff IDs are demo attribution, not authorization.
- CareVoiceRecorder shares Events WAV; visitNoteRules offers capture, not submission. Briefs fingerprint accessible published plans/notes/Events and stream speech; never alter records.
- Frontline visits use a separate `/app/visits` layout with bottom navigation; visit visibility uses the roleStore permission and staff/site IDs, and client labels/addresses join serviceUsersStore — keeps carer navigation independent of the desktop sidebar without duplicating records.
- visitRules derives timing; outcomes append with staff ID/time, checkout freezes logs. SOS independently submits visit/location-linked Events, preserves drafts and never implies emergency services were contacted — no fabricated care or harm.
- Family role sees only /family for linkedPersonSupportedIds; family summaries live in src/lib/familySummariesStore.ts as immutable AI drafts and reach family only after an in-scope coordinator approves by staffId — no unreviewed AI text to relatives.
- Delivered vs approved hours are derived live in src/lib/hoursReport.ts from visitsStore (scheduled length of completed visits) — never stored.
- Home Care Clients/Workforce views (HomeCareClients, HomeCareWorkforce, clientRecord.ts) are read-only lenses chosen by HomeSupportSwitch; residential pages stay intact — no second client or staff store.
