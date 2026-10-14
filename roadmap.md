# Roadmap

- [x] Coordinator: manager-equivalent demo permissions scoped by service-area IDs; live home, status-prioritised today's visits, direct contact actions, combined SOS/timing/new visit Event alerts, seven home-support event types and inference. All 28 visit tests pass; preview typecheck/build OK; browser verified home redirect, area exclusion/switching, live Event appearance/deep link, temporary telephone targets, frontline denial and 390px no overflow. Direct carer/client numbers are absent in demo records; call actions remain disabled until provided. Existing manager-only gates use roleStore's shared helper without restyling; no Cloud authorization changes.

- [x] Visit brief implementation: accessible published care plan + access notes + latest three confirmed notes + visible open Events; source-change refresh, 3–5 factual lines and streamed read aloud. Fifteen client tests pass; real model summary and speech calls succeed; signed-out phone/desktop display verified.
- [ ] Visit brief authenticated end-to-end verification: blocked by no Cloud auth users; first sign-in required. Existing prototype Events and care plans remain client-side; notes remain account-owned, so cross-carer note access is not enabled.

- [x] Visit notes implementation: bounded WAV recording / typed source, authenticated transcription and AI drafting, explicit confirmation, append-only provenance, risk-to-Events prefill, shared Events voice control; 11 client tests and edge schema test pass, checkout verified at 390px.
- [ ] Authenticated live verification: real spoken audio → transcript → AI draft → edited human-confirmed save → readback → linked Events capture. Blocker: new Cloud project has no auth users; first Google sign-in is required. Staff attribution remains explicitly demo identity until a separate trusted staff-account mapping is requested.
- Visit notes scope: new visitNotesStore, note rules/AI client, shared audio/sign-in controls, visit note editor, edge functions and append-only Cloud tables/tests; VisitDetail.tsx (checkout), Incidents.tsx (real voice + linked prefill), AGENTS.md and roadmap.md only, plus Cloud-generated integrations/dependencies.

- [x] Prompt 1: feature flags, role homes, frontline submit redirect, guard unguarded routes
- [x] Prompt 2: shared sites + service users record (registry fields, serviceUsersStore, Events wiring, key worker by staff id, reporter identity)
- [x] Prompt 3: Organisation area (Sites, Service users, profile, timeline, lifecycle actions)
- [x] Mobile visits: separate layout and Today / Clients / Log event / Me pages; wire frontline home and ID-based access; verify at 390px and desktop.
- [x] Visit recording: detail page, location check-in, task/medication outcomes, checkout log, urgent SOS event and late/missed thresholds; test and verify at 390px.
- Visit recording scope: visitsStore + new visit rules/actions/location helper/detail page/tests (care recording), VisitPages + VisitsLayout + App (navigation and SOS), event model/store as required (visit/location link), index.css + Tailwind tokens (SOS red), AGENTS.md and roadmap.md (rules and tracking).
- Files in scope: `src/App.tsx` (routes), `src/components/RoleHomeRedirect.tsx` (frontline home), `src/lib/roleStore.ts` (visit permissions), new visit layout/pages/helpers/tests (mobile experience), `AGENTS.md` (layout rule), `roadmap.md` (task tracking). Existing desktop pages and visit records stay unchanged.
