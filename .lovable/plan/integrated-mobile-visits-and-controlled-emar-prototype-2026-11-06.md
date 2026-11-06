# Integrated mobile visits and controlled eMAR prototype

## What you will see

- **My Visits** gains Today, Upcoming and Completed views. Each card shows approved care activities and a medication indicator, with a clear **Open visit** action.
- **One visit workspace** brings care instructions, activities, notes, medication, concerns and a progress overview together. Medication can be recorded before or after the note; unfinished work stays visible when returning.
- **Medication inside the visit** shows only authorised instructions and outcomes appropriate to prompting, assistance or administration. Nothing is preselected. Saving is independent of the visit note and is confirmed only after the backend accepts it.
- **Review and finish** lists recorded activities, note status, medication outcomes, concerns and outstanding documentation. Finishing never silently completes a task or medication record.
- **Manager oversight** adds medication records/MAR, deterministic exceptions, acknowledgement and follow-up, plus instruction history. Filters respect service-area scope.
- A persistent notice identifies this as a **fictional controlled-testing prototype, not approved for live medication use**. Required medication-safety, regulatory, privacy, security, failure, usability and provider-policy reviews remain outstanding.

## Smallest safe extension

1. **Preserve the existing visit and client sources of truth.** Reuse `visitsStore`, `serviceUsersStore`, published care-plan schedules, Events and the mobile layout. Do not duplicate people, visits, tasks, authentication or rostering.
2. **Replace only the medication-recording path.** Existing template medication text remains scheduling/display input; new medication instructions are separately versioned and linked by IDs. Old visit medication records remain readable as legacy history but cannot be edited as new eMAR records.
3. **Add a backend medication ledger.** Store authorised instruction versions, scheduled medication tasks, manually submitted outcomes, append-only corrections, deterministic exceptions, acknowledgements/follow-up and audit events. Use idempotency keys and wrong-client/version validation. Never infer a missed dose solely from missing documentation.
4. **Enforce access on the server.** Signed-in staff need a trusted staff-ID, organisation, role and service-area mapping. Client-side demo role switching remains display/demo state and never grants medication privileges. Managers can configure/verify/activate/suspend/discontinue instructions only within authorised scope; carers cannot alter instructions.
5. **Integrate without coupling records.** Medication saves independently. Refusal/not-completed rules create an exception immediately; acknowledgement requires a manager action. Notification failure stays unresolved with a manual contact fallback. No AI participates in medication setup, outcomes, escalation or closure.
6. **Improve notes without changing their provenance.** Add AI missing-information questions as optional prompts and preserve the carer’s answers alongside original input, AI draft, edits and final human-confirmed note. Medication submission never depends on note completion.
7. **Test the acceptance paths.** Fictional Mary 09:30 medication visit and a no-medication visit; backend failure and retry; duplicate submission; wrong role/client; instruction update after outcomes; deterministic refusal exception → scoped manager acknowledgement → follow-up → MAR/evidence readback.

## Technical work

- New `src/lib/medicationRules.ts` for permitted outcomes, validation and deterministic exception derivation; new `src/lib/medicationStore.ts` for explicit loading/saving/failed states.
- New backend migration for access mappings, versioned instructions, scheduled tasks, outcome/correction ledgers, exceptions, reviews and audit history. Every table receives explicit grants, RLS and scoped policies in the same migration.
- New `medication-workspace` edge function using the existing authenticated function pattern plus server-side staff/role/area checks; no service-role response secrets or client-authorised role values.
- Update `VisitDetail.tsx`, `VisitPages.tsx`, `VisitsLayout.tsx`, `App.tsx`, `roleStore.ts`, `AppSidebar.tsx` and `featureFlags.ts` for integrated views and manager routes. Add focused visit/medication components rather than a separate carer medication module.
- Add `MedicationOversight.tsx` and medication instruction/review components for authorised desktop/tablet users.
- Extend the existing note schema/function/editor only for optional missing-information questions and preserved answers; keep human confirmation mandatory.
- Add focused Vitest coverage and edge-function validation tests. Run the full test suite, typecheck, build review and phone/desktop browser checks. Authenticated backend scenarios require a signed-in account with an authorised staff mapping; anything not exercised will be reported plainly.

## Files expected to change

New medication rules/store/components/pages/tests, one migration and one edge function; the existing visit detail/list/layout, note editor/schema/function, routes, permissions, sidebar, feature flags, `src/lib/AGENTS.md`, root `AGENTS.md` if budget permits, and `roadmap.md`. Existing roster, payroll, invoicing and care-plan records remain unchanged.

## Conflicts and boundaries resolved

- The existing medication buttons save to the in-memory visit log and use broad labels such as “Given”; they cannot safely serve as eMAR and will be replaced in the active workflow.
- Existing role presets and the current sign-in page are demonstration navigation, not server authorisation. Medication access therefore requires real signed-in staff mapping and will deny access rather than pretend to save.
- Existing Cloud visit notes are account-owned, while manager oversight needs scoped record access. Medication records will use organisation/staff/area server checks from the outset; no widening of existing note access is assumed.
- No offline medication entry, automatic escalation resolution, AI clinical decision-making, payroll, invoicing, route optimisation or production-compliance claim is included.
