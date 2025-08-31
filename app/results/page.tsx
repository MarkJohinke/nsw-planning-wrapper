// app/results/page.tsx
"use client";
import { useState } from "react";

export default function Results() {
  const [lat, setLat] = useState("-33.8688");
  const [lon, setLon] = useState("151.2093");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const r = await fetch(`/api/nswPlanningAtPoint?lat=${lat}&lon=${lon}`);
    const j = await r.json();
    setData(j);
    setLoading(false);
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">NSW Planning Report</h1>

      <div className="flex gap-2">
        <input className="border p-2 rounded" value={lat} onChange={e=>setLat(e.target.value)} placeholder="lat"/>
        <input className="border p-2 rounded" value={lon} onChange={e=>setLon(e.target.value)} placeholder="lon"/>
        <button className="px-4 py-2 rounded bg-black text-white" onClick={run} disabled={loading}>
          {loading ? "Loading…" : "Run"}
        </button>
      </div>

      {data && data.ok && (
        <div className="grid md:grid-cols-2 gap-4">
          <section className="p-4 rounded border">
            <h2 className="font-medium mb-2">Core Controls</h2>
            <ul className="space-y-1 text-sm">
              <li><b>Address:</b> {String(data.address ?? "—")}</li>
              <li><b>Zoning:</b> {String(data.zoning ?? "—")}</li>
              <li><b>FSR:</b> {String(data.fsr ?? "—")}</li>
              <li><b>HOB:</b> {String(data.hob ?? "—")}</li>
            </ul>
          </section>

          <section className="p-4 rounded border">
            <h2 className="font-medium mb-2">Overlays</h2>
            <ul className="text-sm">
              {Object.entries(data.overlays || {}).map(([k,v]) => (
                <li key={k}><b>{k}:</b> {String(v ?? "—")}</li>
              ))}
            </ul>
          </section>

          <section className="p-4 rounded border md:col-span-2">
            <h2 className="font-medium mb-2">SEPP Compliance</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {Object.entries(data.sepp_compliance || {}).map(([typology, rules]: any) => (
                <div key={typology} className="border rounded p-3">
                  <div className="font-medium mb-1">{typology}</div>
                  <ul className="text-sm space-y-1">
                    {rules?.map((r:any, i:number) => (
                      <li key={i}>{r.pass ? "✅" : "❌"} {r.label} {r.details ? `(${r.details})` : ""}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="p-4 rounded border md:col-span-2">
            <h2 className="font-medium mb-2">Feasibility</h2>
            <table className="text-sm w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Option</th>
                  <th className="text-left p-2">GDV</th>
                  <th className="text-left p-2">Build Cost</th>
                  <th className="text-left p-2">Margin</th>
                  <th className="text-left p-2">%</th>
                  <th className="text-left p-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {(data.feasibility || []).map((row:any, i:number)=>(
                  <tr key={i} className="border-b">
                    <td className="p-2">{row.option}</td>
                    <td className="p-2">{String(row.gdv ?? "—")}</td>
                    <td className="p-2">{String(row.build_cost ?? "—")}</td>
                    <td className="p-2">{String(row.margin ?? "—")}</td>
                    <td className="p-2">{String(row.margin_pct ?? "—")}</td>
                    <td className="p-2">{row.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {data && !data.ok && (
        <pre className="p-3 bg-red-50 border text-xs">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}