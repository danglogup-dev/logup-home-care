import { useMemo } from "react";
import { runPermissionsQA, qaSummary } from "@/lib/permissionsQA";
import { useRole } from "@/lib/roleStore";
import { Navigate } from "react-router-dom";

export default function PermissionsDebug() {
  const r = useRole();
  const rows = useMemo(() => runPermissionsQA(), []);
  const sum = qaSummary(rows);

  if (r.role !== "admin") return <Navigate to="/app" replace />;

  const grouped = rows.reduce<Record<string, typeof rows>>((acc, row) => {
    (acc[row.module] ??= []).push(row);
    return acc;
  }, {});

  return (
    <div className="p-6 md:p-8 space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Permissions QA harness</h1>
        <p className="text-sm text-muted-foreground">
          Sanity checks role + siteId scope across all modules against the shared demo registry.
        </p>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full border bg-emerald-50 border-emerald-200 text-emerald-800 px-2.5 py-0.5">Passed {sum.passed}</span>
          <span className={`rounded-full border px-2.5 py-0.5 ${sum.failed === 0 ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-red-50 border-red-200 text-red-800"}`}>Failed {sum.failed}</span>
          <span className="text-muted-foreground">of {sum.total}</span>
        </div>
      </header>

      {Object.entries(grouped).map(([module, moduleRows]) => (
        <section key={module} className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-2 bg-secondary/40 border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {module}
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Preset</th>
                <th className="text-left px-4 py-2 font-medium">Who</th>
                <th className="text-left px-4 py-2 font-medium">Scenario</th>
                <th className="text-left px-4 py-2 font-medium w-20">Expected</th>
                <th className="text-left px-4 py-2 font-medium w-20">Actual</th>
                <th className="text-left px-4 py-2 font-medium w-16">Result</th>
              </tr>
            </thead>
            <tbody>
              {moduleRows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.presetLabel}</td>
                  <td className="px-4 py-2">{r.who}</td>
                  <td className="px-4 py-2">{r.scenario}</td>
                  <td className="px-4 py-2 font-mono text-xs">{String(r.expected)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{String(r.actual)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[11px] rounded-full px-2 py-0.5 border ${r.pass ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                      {r.pass ? "PASS" : "FAIL"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
