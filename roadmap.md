# Roadmap

- [x] Prompt 1: feature flags, role homes, frontline submit redirect, guard unguarded routes
- [x] Prompt 2: shared sites + service users record (registry fields, serviceUsersStore, Events wiring, key worker by staff id, reporter identity)
- [x] Prompt 3: Organisation area (Sites, Service users, profile, timeline, lifecycle actions)
- [x] Mobile visits: separate layout and Today / Clients / Log event / Me pages; wire frontline home and ID-based access; verify at 390px and desktop.
- [ ] Visit recording: detail page, location check-in, task/medication outcomes, checkout log, urgent SOS event and late/missed thresholds; test and verify at 390px.
- Visit recording scope: visitsStore + new visit rules/actions/location helper/detail page/tests (care recording), VisitPages + VisitsLayout + App (navigation and SOS), event model/store as required (visit/location link), index.css + Tailwind tokens (SOS red), AGENTS.md and roadmap.md (rules and tracking).
- Files in scope: `src/App.tsx` (routes), `src/components/RoleHomeRedirect.tsx` (frontline home), `src/lib/roleStore.ts` (visit permissions), new visit layout/pages/helpers/tests (mobile experience), `AGENTS.md` (layout rule), `roadmap.md` (task tracking). Existing desktop pages and visit records stay unchanged.
