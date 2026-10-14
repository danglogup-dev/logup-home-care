# Workforce Compliance & Skills Matrix — demo alignment (amended)

Make the Workforce module demo-ready using shared staff and site IDs from `demoDataRegistry` and site-only geography. No module is rebuilt and no separate staff records are created.

## Core rules

- Identity source of truth = `staffId` (`STAFF-*`). Names are labels only.
- Geography source of truth = `SiteId` (`SITE-OAK`, `SITE-RIV`, `SITE-ELM`). Legacy `site-oak/riv/elm` strings are removed from the store surface; any legacy internals are hidden behind an adapter in `workforceStore.ts`.
- Permissions go through `roleStore` helpers only (`role.staffId`, `role.scopeSiteIds`, `inScopeSite`). No display-name matching.
- External specialists (`STAFF-SARAH`, `STAFF-BRIAN`) are not Workforce staff.

## Operational vs non-operational staff (guardrail)

Introduce an explicit **operational profile** per staff member that governs the Workforce compliance denominator and skills matrix visibility.

- `StaffMember.operationalProfile: "frontline" | "leadership" | "governance_view_only"`
  - `frontline` — expected to meet site care/support requirements. Counted in compliance denominator.
  - `leadership` — site/multi-site managers who may hold some clinical rails (e.g. Safeguarding, Fire) but not all frontline care rails. Counted only for the rails they are actually required to hold (see `expectedQualificationIds`).
  - `governance_view_only` — non-operational; excluded from Workforce compliance denominator and from the skills-matrix care-delivery view.

- Additional field `expectedQualificationIds: string[]` overrides the site requirement expansion for that staff member. Empty array = no care-delivery expectations.

Mapping:

- `STAFF-LIAM`, `STAFF-EMMA`, `STAFF-AISLING`, `STAFF-ORLA`, `STAFF-AOIFE`, `STAFF-CLAIRE`, `STAFF-NIAMH` → `frontline`.
- `STAFF-SIOBHAN` (Multi-site Manager) and `STAFF-DANIEL` (Single-site Manager) → `leadership`. Expected rails: Safeguarding, Fire Safety, First Aid, Manual Handling. Not expected: Meds, Epilepsy Meds, PBS, Dysphagia, Epilepsy Awareness unless explicitly assigned.
- `STAFF-CIARAN` (View Only / governance) → `governance_view_only`. `expectedQualificationIds: []`.
- If Aoife is later treated as leadership, only the profile flag changes — no other data moves.

Skills matrix behaviour:

- Default matrix view = frontline + leadership only. Cells for rails not in a staff member's `expectedQualificationIds` render as **"Not required"** (neutral chip), never as red/missing.
- A toggle "Show governance / view-only users" reveals `governance_view_only` rows, always with all care-delivery rails marked "Not required". Never shown as missing frontline care quals.

Compliance % (requirement-based, guardrail-aware):

- Denominator = sum over `frontline` and `leadership` staff of `|expectedQualificationIds ∩ site requirement rails for their assigned sites|`.
- Numerator = same set, counting records where the staff currently holds the qualification (green or amber).
- `governance_view_only` staff contribute 0 to both numerator and denominator.
- High-risk gap count and "Site requirements not met" tiles use the same filtered population.

## 1. Workforce seed (`src/lib/workforceStore.ts`)

- Sites: `SITE-OAK`, `SITE-RIV`, `SITE-ELM` (names via `getSiteName`).
- 9 qualification rails: `q-firstaid`, `q-handling`, `q-safeguarding`, `q-fire`, `q-meds`, `q-epilepsy-aware`, `q-epilepsy-meds`, `q-pbs`, `q-dysphagia` (critical flag on First Aid, Manual Handling, Safeguarding, Fire, Meds, Epilepsy Meds).
- Site requirements seeded per Part 3 of the brief; conditional rails added so Dysphagia (OAK), Meds (RIV), Epilepsy Meds (ELM) appear in the matrix.
- Staff rebuilt from `STAFF` in `demoDataRegistry` excluding `external === true`. Each `StaffMember` uses:
  - `id: StaffId`, `name`, `role`, `primarySiteId` = first of `scopeSiteIds`, `assignedSiteIds` = `scopeSiteIds`.
  - `operationalProfile` and `expectedQualificationIds` per the guardrail mapping above.
- Qualification expiry offsets to produce the required statuses:
  - `STAFF-SIOBHAN` — First Aid Expired (−20d); other expected rails Current.
  - `STAFF-EMMA` — First Aid Due Soon (+20d); others Current.
  - `STAFF-ORLA` — Epilepsy Meds Due Soon (+20d); others Current.
  - `STAFF-AISLING` — Dysphagia Due Soon (+20d); others Current.
  - Remaining frontline/leadership staff Current on their expected rails.
- Shift schedule keeps existing shape but references `STAFF-*` ids.

## 2. Stable qualification source ids

`qualificationSourceId(staffId, qualificationId)` → e.g. `QUAL-FIRSTAID-STAFF-SIOBHAN`, `QUAL-FIRSTAID-STAFF-EMMA`, `QUAL-EPILEPSYMEDS-STAFF-ORLA`, `QUAL-DYSPHAGIA-STAFF-AISLING`. `resolveQualificationSource(id)` used by Insights/Tasks. `/app/workforce/qualifications?source=QUAL-…` expands the matching row. Update `crossModuleLinks.ts` `QUAL_KEYS.FIRSTAID_EMMA` to `QUAL-FIRSTAID-STAFF-EMMA` and re-point `TASK-WF-001`.

## 3. Overview KPIs (`WorkforceOverview.tsx`)

Three tiles using the guardrail-aware population:

- **Overall compliance %** (definition above).
- **High-risk competency gaps** — count of `(staff × critical expected requirement)` where status is Expired or Missing.
- **Site requirements not met** — `(siteId, requirement)` pairs with zero currently-compliant assigned frontline/leadership staff.

Existing site compliance summary and needs-attention list remain, with governance_view_only rows excluded.

## 4. Permissions (`roleStore`)

- Use `role.staffId` and `role.scopeSiteIds`. Replace any display-name matching with `role.staffId === s.id`.
- Frontline users see only their own row on Workforce pages.
- View Only: read-only; Workforce still visible, but denominator excludes them.

## 5. Insights (`insightsData.ts`, `Insights.tsx`)

- Add `"Workforce"` to `InsightType`.
- Extend `Insight` with optional `relatedSiteIds: SiteId[]`; scope filter uses it when present.
- Seed four cards:
  - `INS-WF-001` First Aid expired — Siobhán. `relatedSiteIds: [SITE-OAK, SITE-RIV]`. `relatedRecordIds: [QUAL-FIRSTAID-STAFF-SIOBHAN]`.
  - `INS-WF-002` First Aid due soon — Emma. `[SITE-OAK]`. `QUAL-FIRSTAID-STAFF-EMMA`.
  - `INS-WF-003` Epilepsy Meds due soon — Orla (mentions Michael). `[SITE-ELM]`. `QUAL-EPILEPSYMEDS-STAFF-ORLA`.
  - `INS-WF-004` Dysphagia due soon — Aisling (mentions Mary). `[SITE-OAK]`. `QUAL-DYSPHAGIA-STAFF-AISLING`.
- All route to `/app/workforce/qualifications?source=<QUAL-…>`. Extend `resolveLinkedRecord` to recognise `QUAL-*`.

## 6. Care Planning coverage notes (`PersonDetail.tsx`)

Non-blocking info banner on "Care at a Glance" when the person's key worker has a relevant Due Soon / Expired rail:

- PS-001 Patrick + STAFF-EMMA First Aid Due Soon.
- PS-002 Mary + STAFF-AISLING Dysphagia Due Soon.
- PS-007 Michael + STAFF-ORLA Epilepsy Meds Due Soon.

Banner labelled "Coverage note (governance only)"; links to `/app/workforce/qualifications?source=<QUAL-…>`. Does not gate editing, drafts, approval, or publication.

## 7. Audits

`AUD-001` finding "Medication competency evidence missing for one staff member." already present. Verify render only.

## 8. External specialists

Sarah, Brian excluded from Workforce staff — remain specialist contributors.

## 9. Verification

- `bunx tsgo --noEmit` clean.
- Extend `permissionsQA.ts`:
  - STAFF-EMMA sees only own qualifications.
  - STAFF-DANIEL cannot see Riverside qualifications.
  - STAFF-SIOBHAN sees Oakfield + Riverside, not Elm Grove.
  - STAFF-CIARAN (View Only) is excluded from compliance denominator.
  - Workforce insight for Siobhán in scope for Siobhán, not for Claire.
- Manual spot-check: KPI trio, matrix with "Not required" chips for out-of-scope rails, governance-user toggle hides Ciarán by default, four insights, coverage banners on Patrick/Mary/Michael only.

## Technical notes

- Legacy site strings stay behind an internal adapter in `workforceStore.ts`; store exports use `SiteId`.
- Shift ids reshaped to `sh-SITE-<id>-YYYY-MM-DD-<slot>`.
- No units, wings, or floors introduced.
