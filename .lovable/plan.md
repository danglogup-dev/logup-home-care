# LogUp prototype audit and improvement plan

This is an audit only. Nothing gets built until you pick an item from the backlog. It comes from reading the code. I haven't clicked through it in a browser for this audit.

## 1. Executive summary

LogUp is a large, mostly working fictional demo. Rostering, live visits, client records, care plans, the carer visit screen, typed visit notes and the eMAR (simulated) all work, and they share one set of client, staff and visit records. Everything resets on reload.

The main gaps, in order:
- **Blocked in the demo:** three visible features say "switched off in this prototype": the visit AI summary, voice notes and family summary approval. The demo also skips the "missing information" questions.
- **Demo story mismatch:** the carer you sign in as (Emma) isn't the carer used in the eMAR walkthrough (Aisling), and the default carer persona is Liam.
- **Home isn't operational:** the manager Home page is the Insights page with a new title. Its figures come from a mix of seeded insights and live data, not from today's visits, notes or medicines.
- **Not connected:** Tasks can't come from medication exceptions. The client chronology leaves out visit notes and medication records. Evidence packs only show a "generated" message.
- **Hidden but open:** hidden modules (Events, Tasks, Care Planning, Insights) can still be opened from links. The home care menu has no way to reach Events or Tasks.

## 2. Module-by-module audit

| Module | Status | Notes |
|---|---|---|
| Sign-in / demo access | Working (simulated) | No password needed; picks a role. No real session, so live AI stays off. |
| Role switching | Working, small bug | Switching doesn't move you off a page the new role can't see. |
| Admin/Manager Home | Partial | Insights page renamed; not driven by visits, notes or medicines. |
| Frontline Today / visit | Working demo | Check-in, tasks, typed note, medicines, concern, checkout, status updates. |
| View Only | Partial | Read-only rules exist; not tested page by page. |
| Roster / Live visits | Working demo | Eligibility, conflicts, overrides, alerts. |
| Clients | Working | 6-tab record. Visit History can show a sign-in error for notes. |
| Care Plans | Working, desktop-only | The carer gets short excerpts; "View care plan" opens the desktop page. |
| AI care notes | Partial | Typed notes are drafted by simulation; voice is blocked; demo skips missing-info questions. |
| eMAR | Working (simulated) | Outcomes, corrections, exceptions, second-person check. |
| Incidents / Events | Partial | Works; can be raised from a visit; not in the home care menu. |
| Tasks & Follow-up | Partial | Only manual, incident, audit and recurring tasks. No medication link; the source shows as text, not a link. |
| AI Insights | Partial | Mix of seeded and live; links to evidence; exports insight data only. |
| Reports / chronology | Partial | Chronology prints, but has no visits, notes or medicines. Evidence packs only show a toast. |
| Policy Hub / Help | Working | Falls back to the approved policy wording when signed out. |
| Workforce | Working | Team, qualifications, coverage. |
| Family | Partial | The portal works, but approving summaries is blocked in the demo, so family never sees one. |

## 3. Frontline journey (carer)

| Step | Status |
|---|---|
| 1. Enter the demo | Works |
| 2. See today's visits | Works, but the sign-in carer (Emma) differs from the eMAR walkthrough carer (Aisling) |
| 3. Open a visit | Works |
| 4. Care instructions | Partial: excerpts inline; full plan only on the desktop page |
| 5. Record care activities | Works |
| 6. Speak or type a note | Typing works; Speak is blocked |
| 7. Review an AI draft | Simulated (sorts the carer's own sentences) |
| 8. Missing-information questions | Missing in the demo |
| 9. Medication outcome | Works (the visit doesn't need medicines finished before checkout) |
| 10. Raise a concern | Works, pre-filled |
| 11. Review and complete | Works |
| 12. Back to Today with status | Works |

The note editor says a note "stays on this screen only", but it does in fact appear to managers until you reload.

## 4. Manager journey

| Capability | Status |
|---|---|
| Assigned service areas | Works (coordinator scope, filters) |
| Documentation status | Missing as a single view |
| Submitted visit notes | Works, per client in Visit History |
| Medication exceptions | Works in eMAR oversight |
| Repeated concerns | Partial: Insights only, mixed with seeded data |
| Review incidents | Works, but not in the home care menu |
| Assign and track follow-up | Partial: Tasks hidden; no medication link |
| Care plan information | Works |
| AI insights with evidence | Partial |
| Evidence chronology | Partial: no visits, notes or medicines |

## 5. Broken or disconnected experiences

1. The visit AI summary, voice notes and family summary approval all say "switched off".
2. Family never sees a summary in the demo.
3. The sign-in carer persona doesn't match the eMAR walkthrough.
4. The Home figures aren't from live operations.
5. Medication exceptions can't become Tasks.
6. The chronology and evidence packs leave out care delivery.
7. Events and Tasks can't be reached from the home care menu.
8. Role switching can leave you on a page you can't see.
9. Client Visit History can show a "sign in" error.
10. Checkout doesn't check that due medicines were recorded.

## 6. Prioritised backlog

### P0: Broken or blocking
| # | Item | Affects | Now / Should | Type | Complexity | Risk | Order |
|---|---|---|---|---|---|---|---|
| P0-1 | Simulated AI in demo | VisitBrief, CareVoiceRecorder, FamilySummaryReview | Now "switched off". Should show a labelled, simulated output from real records (brief from plan, notes and events; voice uses a sample transcript; family summary from the day's notes), with approval allowed | Extend | Medium | Low | 1 |
| P0-2 | Carer persona consistency | SignIn, roleStore, visitsStore | Now: Emma, Liam and Aisling don't line up. Should: one demo carer with a full, realistic day, including Mary's eMAR visit | Fix | Low | Low | 2 |
| P0-3 | Remove the sign-in error in Visit History | HomeCareClients | Now shows an error in the demo. Should show demo notes | Fix | Low | Low | 3 |
| P0-4 | Role switch redirect | RoleSwitcher | Now can strand you on a page. Should go to the new role's home | Fix | Low | Low | 4 |

### P1: Essential for customer discovery
| # | Item | Affects | Type | Complexity | Risk | Order |
|---|---|---|---|---|---|---|
| P1-1 | Operational Home: today's visits (done, late, missed), notes awaiting confirmation, open medication exceptions, open concerns, overdue follow-ups. Each links to its record | Home (new section above Insights) | Extend | Medium | Low | 5 |
| P1-2 | Missing-info questions in the demo note draft (rule-based: e.g. no fluid or mood mentioned) | VisitNoteEditor, demoVisitNote | Extend | Low | Low | 6 |
| P1-3 | Medication exception → "Create follow-up task", with a link back | tasksStore, MedicationOversight, TaskDetail | Connect | Medium | Medium | 7 |
| P1-4 | Chronology includes visits, confirmed notes and medication outcomes | serviceUserTimeline, Chronology | Connect | Medium | Low | 8 |
| P1-5 | Concerns & Follow-up in the home care menu (Events + Tasks) | AppSidebar | Connect | Low | Low | 9 |
| P1-6 | Carer care-plan view, mobile, in the visit (the relevant published sections) | VisitDetail | Extend | Medium | Low | 10 |

### P2: Polish
- Checkout warns if due medicines aren't recorded (Low)
- Fix the "stays on this screen only" wording (Low)
- Task source shown as a link (Low)
- Evidence pack produces a printable client pack instead of a toast (Medium)
- Insights: label seeded examples or remove them from Home (Low)
- "Add a client" still uses residential "Admit" wording (Low)
- Page-by-page check that View Only can't change anything (Medium)

### P3: Defer
- Real authentication and staff provisioning
- Live AI on real accounts
- Persistent storage (everything resets on reload)
- Payroll, invoicing, advanced rostering, travel optimisation
- Production eMAR (MAR printing, stock, pharmacy)
- Residential modules (Audits, Organisation, Shift coverage)

## 7. Recommended first three
1. **P0-1 Simulated AI in the demo:** removes every "switched off" message and unlocks family summaries.
2. **P0-2 plus P0-3 plus P0-4 Demo access tidy-up:** one carer with a convincing day, no stray sign-in errors, and role switching that works.
3. **P1-1 Operational Home:** gives the manager demo a real "what needs my attention" view that links back to the carer's records.

## 8. Must remain untouched
- One-step demo sign-in, with no eMAR login (mem eMAR rule)
- Shared stores: visitsStore, serviceUsersStore, workforceStore, staffAvailabilityStore, medicationDemoStore, visitNotesStore
- Roster eligibility, override audit and save-before-assign
- Care plan publish and approval chain, and plan-fed visit schedules
- Event provenance and human confirmation of AI drafts
- eMAR second-person check, and corrections that keep the original
- Feature flags, hidden-but-kept residential modules, the design system, all routes and tables
- Real-auth code paths (kept, just off in the prototype)

Tell me which item or items to implement.
