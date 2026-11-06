# Restore simple access and rebuild eMAR for the demo

## Goal
You open LogUp, tap Sign in, and you're in. No second login anywhere. As Admin, the eMAR is fully clickable: open a client (e.g. Patrick Murphy), see each medication, what was given and when and by whom, and edit it.

## 1. Sign-in page (prototype mode)
- One card: LogUp logo, Email and Password fields (optional, nothing checked), and a "Sign in" button.
- A "Sign in as" picker (Admin, Manager, Coordinator, Carer, Family), Admin by default. Tapping Sign in sets that view and opens its home page.
- Remove the "Explore fictional demo" card, "Staff sign-in", Google/Lovable buttons and all "you need an account" wording.
- Sign out returns to this page.

## 2. eMAR: no login, always works
- eMAR always uses the in-app demo records. Remove the "Real medication records need a signed-in LogUp account" banner, "Medication access unavailable" and "Check access again".
- What you can do follows the demo view (Admin/Manager edit and verify, Coordinator reviews, Carer records at visits, view-only reads).
- One small grey line at the bottom: "Prototype data — resets on reload."

## 3. eMAR redesign (manager side)
```text
eMAR
 ├─ Overview: summary tiles (Due today · Given · Refused/missed · Exceptions open · Awaiting verification)
 │   └─ Client list (cards): name, area, meds count, today's status, open exceptions  → tap
 └─ Client eMAR page (e.g. Patrick Murphy)
     ├─ Header: name, area, allergies/notes, "Add medication"
     ├─ Medications: name, strength, dose, times, support level, status (Active/Draft/Stopped)
     │    tap → medication detail: current instructions, version history (who changed, when),
     │          Edit (creates new draft) · Verify (second person) · Stop
     ├─ MAR chart: 7-day grid, each dose cell coloured (given/prompted/refused/not available/due)
     │    tap a cell → who recorded it, when, at which visit, reason; "Add correction" (append, never overwrite)
     └─ Exceptions: open/resolved, acknowledge + follow-up note
```
- Every row and card is a real link or button with clear hover/focus states.
- Exceptions and Evidence tabs fold into the client page; a cross-client "Exceptions" list stays on the overview.
- Carer visit screen medication panel: same outcomes, drop the "demo only" labels.

## 4. Check it end to end
Sign in as Admin → eMAR → Patrick Murphy → open a dose (see who/when) → edit a medication → verify → record an exception. Also check as Carer at 390px.

## Technical details
- SignIn.tsx: remove auth calls; set role preset via roleStore then navigate to role home. Keep logupAuth.ts/backend medication code in place but unused (prototype flag `REAL_AUTH_ENABLED=false` in featureFlags.ts) so real accounts can return later.
- MedicationSourceGate: return medicationDemoStore whenever the flag is off; no banner.
- medicationDemoStore: add per-client queries, instruction version history, verify/stop, correction outcomes (append-only), seed a week of history for every client with meds, with staffId/time.
- New routes: `/app/visits/medication` (overview) and `/app/visits/medication/:clientId` (client eMAR); split MedicationOversight into Overview, ClientEmar, MedicationDetail, MarChart components.
- Remove "LogUp account required" gate on medication screens; VisitNoteEditor/briefs keep demo behaviour.
- Update src/lib/AGENTS.md rule, emar-auth memory, tests (sign-in enters without credentials; demo eMAR edits append versions; corrections never overwrite).
