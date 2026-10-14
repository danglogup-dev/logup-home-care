# LogUp Home Care

Build a high-fidelity web app prototype for a product called LogUp.

LogUp is an inspection-ready incident and evidence system for Irish regulated residential care services. The product is designed for frontline staff, PICs, CNMs, Unit Managers, Quality/Compliance, and leadership.

IMPORTANT:

This should feel like a real premium SaaS product prototype, not a generic admin dashboard.

The UX/UI quality is fundamental.

Use a calm, modern, mobile-first interface inspired by the usability quality of SafetyCulture and Heidi, but do not copy them.

The product should feel trusted, operational, warm, premium, and uncluttered.

DESIGN DIRECTION

Use this palette:

- Primary: #3B88C3

- Text / contrast: #2F3437

- Main background: #F6F5F2

- Secondary background: #E8E3DB

- Secondary accent: #5D73C9

- Soft accent: #A89BEA

Logo colour relationship:

- “Log” = #2F3437

- “Up” = #3B88C3

Visual tone:

- warm, light, modern

- soft surfaces

- generous spacing

- rounded cards

- clean typography

- subtle shadows

- not dark/slate-heavy

- not cluttered

- not “form machine”

- not generic enterprise

WHAT TO BUILD

Create a product prototype for LogUp focused on the Incidents workflow.

MAIN PRODUCT IDEA

LogUp helps care staff capture incidents and events naturally by text or voice, turns that into a structured draft, guides the user to confirm missing information, routes it into review/follow-up, and preserves an inspection-ready evidence trail.

This is NOT:

- a chatbot-only app

- a generic incident form

- a broad quality management suite

- a passive document repository

This IS:

- a guided capture workspace

- an evidence and oversight system

- a manager review and follow-up workflow

- an inspection-ready export product

BUILD THESE SCREENS / FLOWS

1. Sign-in screen

- clean, premium, minimal

- LogUp branding

- email + password

- “Sign in”

- soft background and trusted healthcare/care-tech feel

2. Internal app shell

- left sidebar navigation

- workspace summary card at top of sidebar

- sidebar items:

  - Board

  - Reporting

  - Team

  - Incidents

- Incidents should be highlighted as the active section

- main content area should feel open and calm

3. Incidents workspace (pre-draft state)

This is the most important screen.

At the top:

- a hero/workspace intro

- title: “Incidents”

- concise explanation that staff can start with text or voice and LogUp will create the first draft while preserving the original source evidence

Then a modular pre-draft layout with these sections:

A. Choose how to start

- two clear start paths:

  1. Describe what happened (typed note)

  2. Record or upload a voice note

- typed path should be the primary card

- voice path should be clearly visible with a microphone icon and short explanation

- both should feel first-class, not hidden

Typed note card:

- heading: “Describe what happened”

- textarea with placeholder like:

  “For example: Resident slipped beside the kitchen table after lunch. Staff attended immediately and checked for injury.”

- helper copy that natural language is fine and LogUp will structure the draft

Voice card:

- heading: “Record or upload a voice note”

- microphone icon

- short helper copy explaining staff can speak naturally and LogUp will create the first draft

- visible upload/record button

- visible CTA like “Create draft from voice note”

B. Supporting details

- site

- resident

- staff-indicated severity

- optional location

- these should feel secondary to starting capture

- show as clean supporting fields, not dominant form fields

C. What happens next

- a small calm reassurance card explaining:

  - the source note or voice note is preserved

  - LogUp creates the first structured draft

  - staff only confirm what is still missing before submit

4. Incidents workspace (post-draft conversational state)

Build a second version of the Incidents screen showing what happens after a draft is generated.

Layout should show:

- recap card first

- current assistant ask second

- reply box third

- secondary status/gate panel after that

Include:

- anchor summary cards for site, resident, severity, and location

- recap section with structured draft summary

- unresolved items chips

- assistant prompt asking for missing information

- reply textarea with helpful placeholder text

- a secondary section for:

  - resident match status

  - review confirmation

  - required checks

  - submit readiness

- a secondary expandable “Edit drafted details” section

- a secondary expandable “Conversation so far” section

Use example content like:

- resident had a fall in kitchen

- incident time still missing

- injury impact unclear

- immediate actions not fully stated

This should feel like a calm guided assistant, not like a chat app and not like a rigid form wizard.

5. Manager review / oversight screen

Create a screen for a PIC / manager reviewing submitted incidents.

Include:

- table or board/list of incidents awaiting review

- filters by status / severity / site / unit

- incident detail panel or detail page showing:

  - what happened

  - original source evidence references

  - review notes

  - follow-up actions

  - due dates

  - assigned owners

  - closure notes

- actions section with:

  - assign follow-up

  - mark reviewed

  - set due date

  - close incident

6. Leadership oversight / reporting screen

Create a dashboard-style screen for leadership across multiple sites.

Keep it practical, not vanity BI.

Include widgets for:

- incidents by category

- incidents by site

- incidents over time

- overdue reviews

- overdue actions

- hotspot units / categories

Also include drill-down behaviour in the UI:

- clicking a chart or metric opens a filtered incidents list

7. Evidence pack / export screen

Create a screen showing an export-ready incident pack.

Include:

- incident summary

- chronology

- who submitted it

- who reviewed it

- follow-up actions

- template/version reference

- attachments/evidence references

- export button

PRODUCT RULES TO REFLECT IN THE UI

Do not present AI as autonomous.

The UI should clearly suggest:

- AI helps structure the first draft

- humans review and submit

- original source evidence is preserved

- review and checks still matter

Do not make the prototype feel like:

- auto-deciding

- auto-submitting

- fuzzy resident matching

- silent editing

UX REQUIREMENTS

- mobile-first

- one-column interaction where appropriate

- excellent spacing and hierarchy

- clear cards/modules

- obvious primary action

- warm but serious tone

- premium quality

- minimal clutter

- modular workspace feel rather than “giant long form”

DATA / BEHAVIOUR

Use realistic mock data and interactions.

Do not build a real backend.

Use believable example residents/sites/incidents.

Make the prototype feel complete and clickable.

TECH STACK FOR THE PROTOTYPE

Use React with a polished component structure.

Use clean reusable components.

Use subtle animations and modern card layouts.

Prioritise responsive design.

OUTPUT

Generate a polished clickable multi-screen product prototype for LogUp focused on:

- incidents capture

- conversational draft completion

- manager review

- leadership oversight

- evidence export

The final result should look like a credible seed-stage care-tech SaaS product ready to show buyers and pilots.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a5767978-fb5b-4249-bb6d-3e225dbc0c62).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
