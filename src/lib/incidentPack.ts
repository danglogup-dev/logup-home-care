// Builds the Incident Pack — an inspection-ready governance export
// that mirrors exactly the filtered set currently shown in Reporting.
import type { IncidentRecord } from "./incidentRecords";

export interface PackFilterSummary {
  site: string;
  location: string;
  timeframe: string;
  status: string;
  severity: string;
  category: string;
  resident: string;
  followUp: string;
  hotspot: string;
  theme: string;
  shift: string;
  month: string;
  dateRange: string;
}

export interface PackOptions {
  aiSummary: boolean;
  index: boolean;
  fullDetails: boolean;
  followUps: boolean;
  attachments: boolean;
  reviewHistory: boolean;
}

const SHIFTS = (h: number) =>
  h >= 22 || h < 6 ? "Night (22:00–06:00)"
  : h < 14 ? "Morning (06:00–14:00)"
  : "Evening (14:00–22:00)";

// ---------- AI-assisted governance summary -------------------------------
export function buildAiSummary(
  records: IncidentRecord[],
  filters: PackFilterSummary,
): { paragraph: string; bullets: string[] } {
  if (records.length === 0) {
    return {
      paragraph: "No incidents matched the current filters, so no patterns can be suggested.",
      bullets: [],
    };
  }

  const total = records.length;
  const sites = new Set(records.map(r => r.site));
  const cats = new Set(records.map(r => r.category));
  const siteLabel = sites.size === 1 ? `for ${[...sites][0]}` : `across ${sites.size} sites`;
  const catLabel = cats.size === 1 ? `${[...cats][0].toLowerCase()} incidents` : "incidents";

  // location counts
  const locCount = new Map<string, number>();
  records.forEach(r => locCount.set(r.location, (locCount.get(r.location) || 0) + 1));
  const repeatLocs = [...locCount.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);

  // resident repeats
  const resCount = new Map<string, number>();
  records.forEach(r => resCount.set(r.resident, (resCount.get(r.resident) || 0) + 1));
  const repeatRes = [...resCount.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);

  // shift pattern
  const shiftCount = new Map<string, number>();
  records.forEach(r => {
    const s = SHIFTS(r.dateObj.getHours());
    shiftCount.set(s, (shiftCount.get(s) || 0) + 1);
  });
  const topShift = [...shiftCount.entries()].sort((a, b) => b[1] - a[1])[0];

  // follow-up status
  const openActions = records.filter(r => r.actions.some(a => !a.done));
  const completedAll = records.filter(r => r.actions.length > 0 && r.actions.every(a => a.done));
  const overdue = records.filter(r => r.status === "Overdue");
  const missingEvidence = records.filter(r => (r.attachments?.length ?? 0) === 0);
  const highCritical = records.filter(r => r.severity === "High" || r.severity === "Critical").length;

  // paragraph
  const parts: string[] = [];
  parts.push(`This pack contains ${total} ${catLabel} ${siteLabel} during ${filters.timeframe.toLowerCase()}.`);

  if (repeatLocs.length > 0) {
    const top = repeatLocs.slice(0, 2).map(([loc, n]) => `${n} in or near ${loc}`).join(" and ");
    parts.push(`Possible location pattern: ${top}.`);
  }
  if (topShift && topShift[1] >= 2) {
    parts.push(`${topShift[1]} incidents occurred during ${topShift[0].toLowerCase()} hours.`);
  }
  if (repeatRes.length > 0) {
    const r = repeatRes[0];
    parts.push(`${r[1]} incidents involved ${r[0]} — may indicate a need to review their care plan.`);
  }
  if (openActions.length > 0 || completedAll.length > 0) {
    parts.push(`Follow-up actions appear completed for ${completedAll.length} incidents, while ${openActions.length} still have open actions for manager review.`);
  }
  parts.push("Suggested areas for manager review include supervision in repeat locations, care plan updates for repeat residents, and whether shift-specific controls are required.");

  // bullets
  const bullets: string[] = [];
  bullets.push(`Total in pack: ${total} (High/Critical: ${highCritical})`);
  if (repeatLocs.length) bullets.push(`Repeat locations: ${repeatLocs.map(([l, n]) => `${l} (${n})`).join(", ")}`);
  if (repeatRes.length) bullets.push(`Repeat residents: ${repeatRes.map(([l, n]) => `${l} (${n})`).join(", ")}`);
  if (topShift) bullets.push(`Most common shift: ${topShift[0]} (${topShift[1]} of ${total})`);
  if (openActions.length) bullets.push(`Open follow-up actions on ${openActions.length} incident${openActions.length === 1 ? "" : "s"}`);
  if (overdue.length) bullets.push(`Overdue: ${overdue.length} incident${overdue.length === 1 ? "" : "s"}`);
  if (missingEvidence.length) bullets.push(`Possible evidence gap: ${missingEvidence.length} incident${missingEvidence.length === 1 ? "" : "s"} without attachments`);

  return { paragraph: parts.join(" "), bullets };
}

// ---------- Snapshot metrics ---------------------------------------------
export function buildMetrics(records: IncidentRecord[]) {
  const total = records.length;
  const open = records.filter(r => r.status !== "Closed").length;
  const closed = records.filter(r => r.status === "Closed").length;
  const highCrit = records.filter(r => r.severity === "High" || r.severity === "Critical").length;
  const moderate = records.filter(r => r.severity === "Moderate").length;
  const low = records.filter(r => r.severity === "Low").length;
  const overdue = records.reduce(
    (n, r) => n + r.actions.filter(a => !a.done && /overdue|due/i.test(a.due)).length,
    0,
  );
  const residents = new Set(records.map(r => r.resident)).size;
  const locations = new Set(records.map(r => r.location)).size;
  const dates = records.map(r => r.dateObj.getTime()).sort((a, b) => a - b);
  const range = dates.length
    ? `${new Date(dates[0]).toLocaleDateString("en-GB")} – ${new Date(dates[dates.length - 1]).toLocaleDateString("en-GB")}`
    : "—";
  return { total, open, closed, highCrit, moderate, low, overdue, residents, locations, range };
}

// ---------- Pattern review -----------------------------------------------
export function buildPatterns(records: IncidentRecord[]) {
  const tally = (key: (r: IncidentRecord) => string) => {
    const m = new Map<string, number>();
    records.forEach(r => { const k = key(r); m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  return {
    byLocation: tally(r => r.location),
    byShift:    tally(r => SHIFTS(r.dateObj.getHours())),
    byResident: tally(r => r.resident),
    bySeverity: tally(r => r.severity),
    byFollowUp: tally(r => r.actions.length === 0 ? "No actions"
      : r.actions.every(a => a.done) ? "All complete" : "Open actions"),
  };
}

// ---------- HTML pack -----------------------------------------------------
const esc = (s: unknown) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function followUpStatus(r: IncidentRecord) {
  if (r.actions.length === 0) return "No actions";
  if (r.actions.every(a => a.done)) return "All complete";
  const open = r.actions.filter(a => !a.done).length;
  return `${open} open`;
}

export function buildPackHtml(args: {
  records: IncidentRecord[];
  filters: PackFilterSummary;
  options: PackOptions;
  organisation: string;
  generatedBy: string;
}): string {
  const { records, filters, options, organisation, generatedBy } = args;
  const generatedAt = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const ai = buildAiSummary(records, filters);
  const metrics = buildMetrics(records);
  const patterns = buildPatterns(records);

  const filterRows = [
    ["Organisation / Site", filters.site],
    ["Location", filters.location],
    ["Category", filters.category],
    ["Severity", filters.severity],
    ["Status", filters.status],
    ["Timeframe", filters.timeframe],
    ["Resident / person", filters.resident],
    ["Follow-up status", filters.followUp],
    ["Theme", filters.theme],
    ["Shift", filters.shift],
    ["Hotspot filter", filters.hotspot],
    ["Date range", filters.dateRange],
  ].filter(([, v]) => v && v !== "—" && v !== "All");

  const patternBlock = (title: string, rows: [string, number][]) => {
    const shown = rows.filter(([, n]) => n >= 1).slice(0, 6);
    if (shown.length === 0) return "";
    return `
      <div class="pattern-card">
        <h4>${esc(title)}</h4>
        <ul>${shown.map(([k, n]) => `<li><span>${esc(k)}</span><strong>${n}</strong></li>`).join("")}</ul>
      </div>`;
  };

  const showPatterns = records.length >= 3;

  const indexRows = records.map(r => `
    <tr>
      <td class="mono">${esc(r.id)}</td>
      <td>${esc(r.date)}</td>
      <td>${esc(r.site)}</td>
      <td>${esc(r.location)}</td>
      <td>${esc(r.resident)}</td>
      <td>${esc(r.category)}</td>
      <td>${esc(r.severity)}</td>
      <td>${esc(r.status)}</td>
      <td>${esc(followUpStatus(r))}</td>
    </tr>`).join("");

  const fullRecords = records.map(r => {
    const inv = r.investigation;
    const cl = r.closure;
    return `
      <section class="incident">
        <header>
          <h3>${esc(r.id)} — ${esc(r.summary)}</h3>
          <div class="meta">
            <span><strong>Date:</strong> ${esc(r.date)}</span>
            <span><strong>Site:</strong> ${esc(r.site)} · ${esc(r.location)}</span>
            <span><strong>Resident:</strong> ${esc(r.resident)}</span>
            <span><strong>Category:</strong> ${esc(r.category)}</span>
            <span class="sev sev-${r.severity.toLowerCase()}"><strong>Severity:</strong> ${esc(r.severity)}</span>
            <span><strong>Status:</strong> ${esc(r.status)}</span>
          </div>
        </header>

        <div class="grid-2">
          <div>
            <h5>Description of what happened</h5>
            <p>${esc(r.summary)}</p>
            <h5>Chronology</h5>
            <ol class="chrono">
              ${r.chronology.map(c => `<li><span class="mono">${esc(c.time)}</span> ${esc(c.event)}</li>`).join("")}
            </ol>
          </div>
          <div>
            <h5>People involved</h5>
            <ul class="plain">
              ${r.people.map(p => `<li><strong>${esc(p.name)}</strong> — ${esc(p.role)} (${esc(p.title)})</li>`).join("")}
            </ul>
            <h5>Submitted / Reviewed</h5>
            <ul class="plain">
              <li>Created by: ${esc(r.submittedBy)}</li>
              <li>Reviewed by: ${esc(r.reviewedBy)}</li>
              <li>Last updated: ${esc(r.date)}</li>
            </ul>
          </div>
        </div>

        ${options.followUps ? `
          <h5>Follow-up actions</h5>
          <table class="data">
            <thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              ${r.actions.length === 0 ? `<tr><td colspan="4" class="muted">No follow-up actions recorded.</td></tr>` :
                r.actions.map(a => `
                  <tr>
                    <td>${esc(a.action)}</td>
                    <td>${esc(a.owner)}</td>
                    <td>${esc(a.due)}</td>
                    <td>${a.done ? "Complete" : "Open"}</td>
                  </tr>`).join("")}
            </tbody>
          </table>` : ""}

        ${options.attachments ? `
          <h5>Evidence &amp; attachments</h5>
          ${r.attachments.length === 0 ? `<p class="muted">No attachments linked.</p>` : `
            <table class="data">
              <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Linked incident</th></tr></thead>
              <tbody>
                ${r.attachments.map(a => `
                  <tr>
                    <td>${esc(a.name)}</td>
                    <td>${esc(a.type)}</td>
                    <td>${esc(a.size)}</td>
                    <td class="mono">${esc(r.id)}</td>
                  </tr>`).join("")}
              </tbody>
            </table>`}` : ""}

        ${options.reviewHistory ? `
          <h5>Review &amp; closure</h5>
          <ul class="plain">
            ${inv?.findings ? `<li><strong>Investigation findings:</strong> ${esc(inv.findings)}</li>` : ""}
            ${inv?.rootCause ? `<li><strong>Root cause:</strong> ${esc(inv.rootCause)}</li>` : ""}
            ${inv?.recommendations ? `<li><strong>Recommendations:</strong> ${esc(inv.recommendations)}</li>` : ""}
            ${cl?.summary ? `<li><strong>Closure summary:</strong> ${esc(cl.summary)}</li>` : ""}
            ${cl?.closedBy ? `<li><strong>Closed by:</strong> ${esc(cl.closedBy)} on ${esc(cl.closedAt)}</li>` : ""}
            ${!inv && !cl ? `<li class="muted">No formal review or closure record yet.</li>` : ""}
          </ul>` : ""}
      </section>`;
  }).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Incident Pack — ${esc(organisation)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111827; font-size: 11pt; line-height: 1.45; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 6pt; }
  h2 { font-size: 15pt; margin: 22pt 0 8pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 4pt; }
  h3 { font-size: 12pt; margin: 0 0 6pt; }
  h4 { font-size: 11pt; margin: 0 0 6pt; }
  h5 { font-size: 10.5pt; margin: 10pt 0 4pt; color: #1f2937; }
  p  { margin: 0 0 6pt; }
  .muted { color: #6b7280; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5pt; }
  .cover { padding: 12mm 0; }
  .cover .org { color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em; font-size: 9pt; }
  .cover .count { margin-top: 14pt; padding: 10pt 12pt; background: #f3f4f6; border-radius: 8pt; display: inline-block; }
  .filter-table { width: 100%; border-collapse: collapse; margin-top: 10pt; }
  .filter-table td { padding: 4pt 8pt; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  .filter-table td:first-child { color: #6b7280; width: 38%; }
  .safety { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; padding: 8pt 10pt; border-radius: 6pt; font-size: 10pt; margin: 6pt 0 12pt; }
  .summary p { margin-bottom: 8pt; }
  .summary ul { margin: 0; padding-left: 18pt; }
  .summary ul li { margin-bottom: 3pt; }
  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-top: 8pt; }
  .metric { border: 1px solid #e5e7eb; border-radius: 6pt; padding: 8pt; }
  .metric .k { font-size: 8.5pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; }
  .metric .v { font-size: 15pt; font-weight: 700; margin-top: 2pt; }
  .patterns { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10pt; }
  .pattern-card { border: 1px solid #e5e7eb; border-radius: 6pt; padding: 8pt 10pt; }
  .pattern-card h4 { margin-bottom: 6pt; }
  .pattern-card ul { list-style: none; padding: 0; margin: 0; }
  .pattern-card li { display: flex; justify-content: space-between; padding: 2pt 0; border-bottom: 1px dotted #f3f4f6; font-size: 10pt; }
  table.data { width: 100%; border-collapse: collapse; margin-top: 4pt; font-size: 9.5pt; }
  table.data th, table.data td { border: 1px solid #e5e7eb; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  table.data th { background: #f9fafb; font-weight: 600; }
  .incident { page-break-inside: avoid; border: 1px solid #e5e7eb; border-radius: 8pt; padding: 10pt 12pt; margin-top: 10pt; }
  .incident header .meta { display: flex; flex-wrap: wrap; gap: 4pt 12pt; font-size: 10pt; color: #374151; margin-bottom: 4pt; }
  .incident .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12pt; }
  ol.chrono { padding-left: 16pt; margin: 0; }
  ol.chrono li { margin-bottom: 2pt; font-size: 10pt; }
  ul.plain { list-style: none; padding: 0; margin: 0 0 6pt; font-size: 10pt; }
  ul.plain li { padding: 2pt 0; }
  .sev strong { font-weight: 600; }
  .sev-high, .sev-critical { color: #b91c1c; }
  .sev-moderate { color: #b45309; }
  .sev-low { color: #166534; }
  .page-break { page-break-after: always; }
  @media print { .no-print { display: none; } }
  .toolbar { position: sticky; top: 0; background: #111827; color: white; padding: 8pt 14pt; display: flex; gap: 10pt; align-items: center; font-size: 10pt; }
  .toolbar button { background: white; color: #111827; border: 0; padding: 6pt 12pt; border-radius: 6pt; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
  <div class="no-print toolbar">
    <span>Incident Pack — ${esc(organisation)} · ${records.length} incident${records.length === 1 ? "" : "s"}</span>
    <button onclick="window.print()">Save as PDF</button>
  </div>

  <!-- A. Cover -->
  <section class="cover">
    <div class="org">LogUp · Inspection-ready evidence</div>
    <h1>Incident Pack</h1>
    <p class="muted">${esc(organisation)}</p>
    <table class="filter-table">
      ${filterRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}
      <tr><td>Generated by</td><td>${esc(generatedBy)}</td></tr>
      <tr><td>Generated</td><td>${esc(generatedAt)}</td></tr>
    </table>
    <div class="count"><strong>${records.length}</strong> incident${records.length === 1 ? "" : "s"} included</div>
  </section>

  ${options.aiSummary ? `
    <section>
      <h2>AI-assisted governance summary</h2>
      <p class="safety">Suggested observations only — not conclusions. Human review required before use in governance, inspection or external reporting.</p>
      <div class="summary">
        <p>${esc(ai.paragraph)}</p>
        ${ai.bullets.length ? `<ul>${ai.bullets.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      </div>
    </section>` : ""}

  <!-- C. Snapshot metrics -->
  <section>
    <h2>Snapshot metrics</h2>
    <div class="metrics">
      <div class="metric"><div class="k">Total</div><div class="v">${metrics.total}</div></div>
      <div class="metric"><div class="k">Open</div><div class="v">${metrics.open}</div></div>
      <div class="metric"><div class="k">Closed</div><div class="v">${metrics.closed}</div></div>
      <div class="metric"><div class="k">High / Critical</div><div class="v">${metrics.highCrit}</div></div>
      <div class="metric"><div class="k">Moderate</div><div class="v">${metrics.moderate}</div></div>
      <div class="metric"><div class="k">Low</div><div class="v">${metrics.low}</div></div>
      <div class="metric"><div class="k">Overdue actions</div><div class="v">${metrics.overdue}</div></div>
      <div class="metric"><div class="k">Residents involved</div><div class="v">${metrics.residents}</div></div>
      <div class="metric"><div class="k">Locations</div><div class="v">${metrics.locations}</div></div>
      <div class="metric" style="grid-column: span 3;"><div class="k">Date range</div><div class="v" style="font-size:11pt;">${esc(metrics.range)}</div></div>
    </div>
  </section>

  ${showPatterns ? `
    <section>
      <h2>Pattern review</h2>
      <div class="patterns">
        ${patternBlock("By location", patterns.byLocation)}
        ${patternBlock("By shift", patterns.byShift)}
        ${patternBlock("By resident / person", patterns.byResident)}
        ${patternBlock("By severity", patterns.bySeverity)}
        ${patternBlock("By follow-up status", patterns.byFollowUp)}
      </div>
    </section>` : ""}

  ${options.index ? `
    <section>
      <h2>Incident index</h2>
      <table class="data">
        <thead>
          <tr><th>ID</th><th>Date</th><th>Site</th><th>Location</th><th>Resident</th><th>Category</th><th>Severity</th><th>Status</th><th>Follow-up</th></tr>
        </thead>
        <tbody>${indexRows}</tbody>
      </table>
    </section>` : ""}

  ${options.fullDetails ? `
    <section>
      <h2>Full incident records</h2>
      ${fullRecords}
    </section>` : ""}

</body></html>`;
}

export function openIncidentPack(html: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
