import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { exportCSV, exportXLSX } from "../lib/utils";
import NavBar from "./NavBar";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

const ST = {
  approved:         { bg:"#0a2a0a", text:"#22c55e", label:"✓ Auto-validated" },
  manual_validated: { bg:"#0a2a14", text:"#34d399", label:"✓ Manual" },
};

function Badge({ status }) {
  const s = ST[status] || ST.approved;
  return <span style={{ background:s.bg, color:s.text, padding:"2px 10px", borderRadius:6, fontSize:11, ...mono, fontWeight:500, whiteSpace:"nowrap" }}>{s.label}</span>;
}

export default function ValidatedPage({ user }) {
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    let all = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("pharmacies").select("*")
        .in("status", ["approved", "manual_validated"])
        .order("validated_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < pageSize) break;
      from += pageSize;
    }
    setRows(all);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const unvalidate = async (code_firme) => {
    await supabase.from("pharmacies").update({ status: "pending" }).eq("code_firme", code_firme);
    setRows((prev) => prev.filter((r) => r.code_firme !== code_firme));
  };

  const filteredRows = rows.filter((r) => {
    const mf = filter === "all" || r.status === filter;
    const q  = search.toLowerCase();
    const ms = !q || r.raison_sociale?.toLowerCase().includes(q) || r.code_firme?.toLowerCase().includes(q) || r.ville?.toLowerCase().includes(q);
    return mf && ms;
  });

  const card = { background:"#0c0f1c", border:"1px solid #1e2236", borderRadius:8, padding:"12px 18px" };

  return (
    <div style={{ fontFamily:"'IBM Plex Sans',sans-serif", background:"#0a0c14", minHeight:"100vh", color:"#c8ccd8", paddingBottom:60 }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      <NavBar user={user} />

      <div style={{ padding:"24px 28px" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:24 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:"#0a2a0a", border:"1px solid #1a4a1a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>✓</div>
          <div>
            <div style={{ fontSize:18, fontWeight:600, color:"#e8eaf0" }}>Validated Pharmacies</div>
            <div style={{ fontSize:11, color:"#3a4060", ...mono }}>{rows.length} total · auto + manual validation</div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
            <button onClick={() => exportCSV(filteredRows)} style={{ background:"#0f1a10", border:"1px solid #1a3a1a", color:"#4ade80", padding:"8px 16px", borderRadius:7, fontSize:12, cursor:"pointer", ...mono }}>
              ↓ CSV ({filteredRows.length})
            </button>
            <button onClick={() => exportXLSX(filteredRows)} style={{ background:"#0f1a10", border:"1px solid #1a3a1a", color:"#4ade80", padding:"8px 16px", borderRadius:7, fontSize:12, cursor:"pointer", ...mono }}>
              ↓ Excel ({filteredRows.length})
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"flex", gap:10, marginBottom:20 }}>
          {[
            ["Total", rows.length, "#22c55e"],
            ["Auto-validated", rows.filter((r) => r.status==="approved").length, "#4ade80"],
            ["Manual", rows.filter((r) => r.status==="manual_validated").length, "#34d399"],
          ].map(([l,v,c]) => (
            <div key={l} style={{ ...card, minWidth:120 }}>
              <div style={{ fontSize:10, color:"#3a4060", ...mono, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>{l}</div>
              <div style={{ fontSize:22, fontWeight:600, color:c }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Search + filter */}
        <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, ville…"
            style={{ background:"#0c0f1c", border:"1px solid #1e2236", borderRadius:7, color:"#c8ccd8", padding:"7px 12px", fontSize:12, ...mono, width:240, outline:"none" }}/>
          {["all","approved","manual_validated"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter===f?"#1a2540":"transparent",
              border: `1px solid ${filter===f?"#2a4a8e":"#1e2236"}`,
              color: filter===f?"#60a5fa":"#4a5068",
              padding:"5px 12px", borderRadius:6, fontSize:11, cursor:"pointer", ...mono,
            }}>{f === "all" ? "All" : f === "approved" ? "Auto" : "Manual"}</button>
          ))}
          <span style={{ fontSize:11, color:"#3a4060", ...mono }}>{filteredRows.length} rows</span>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign:"center", padding:60, color:"#3a4060", ...mono }}>Loading…</div>
        ) : (
          <div style={{ overflowX:"auto", borderRadius:8, border:"1px solid #1e2236" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"#0c0f1c" }}>
                  {["Code","Name","Ville","Tel CSV","Maps Phone","Old X/Y","New X/Y","Gap","Score","Type","Validated",""].map((h,i) => (
                    <th key={i} style={{ padding:"9px 10px", textAlign:"left", color:"#2a3060", ...mono, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:500, whiteSpace:"nowrap", borderBottom:"1px solid #1e2236" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={row.code_firme} style={{ borderBottom:"1px solid #0d1020", background: i%2===0?"#09090f":"transparent" }}>
                    <td style={{ padding:"8px 10px", color:"#4a6090", ...mono, fontSize:11, whiteSpace:"nowrap" }}>{row.code_firme}</td>
                    <td style={{ padding:"8px 10px", color:"#b0b8d0", maxWidth:200 }}>
                      <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{row.raison_sociale}</div>
                      {row.maps_name && row.maps_name !== row.raison_sociale && (
                        <div style={{ fontSize:10, color:"#4a5068", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>↳ {row.maps_name}</div>
                      )}
                    </td>
                    <td style={{ padding:"8px 10px", color:"#8890a8", fontSize:11, whiteSpace:"nowrap" }}>{row.ville}</td>
                    <td style={{ padding:"8px 10px", ...mono, fontSize:11, color:"#8890a8", whiteSpace:"nowrap" }}>{row.telephone || "—"}</td>
                    <td style={{ padding:"8px 10px", ...mono, fontSize:11, whiteSpace:"nowrap" }}>
                      {row.maps_phone ? <span style={{ color: row.phone_diff?"#f87171":"#4ade80" }}>{row.maps_phone}</span> : "—"}
                    </td>
                    <td style={{ padding:"8px 10px", ...mono, fontSize:10, color:"#4a5068", whiteSpace:"nowrap" }}>
                      {row.old_x ? <>{row.old_x?.toFixed(4)}<br/>{row.old_y?.toFixed(4)}</> : "—"}
                    </td>
                    <td style={{ padding:"8px 10px", ...mono, fontSize:10, whiteSpace:"nowrap" }}>
                      {row.new_x ? <span style={{ color:"#60a5fa" }}>{parseFloat(row.new_x).toFixed(4)}<br/>{parseFloat(row.new_y).toFixed(4)}</span> : "—"}
                    </td>
                    <td style={{ padding:"8px 10px", ...mono, whiteSpace:"nowrap" }}>
                      {row.gap_km != null ? <span style={{ color: row.gap_km>1?"#f87171":row.gap_km>0.2?"#fbbf24":"#4ade80" }}>{parseFloat(row.gap_km).toFixed(3)}km</span> : "—"}
                    </td>
                    <td style={{ padding:"8px 10px", ...mono, fontSize:12 }}>
                      {row.score != null ? <span style={{ color: row.score>=80?"#4ade80":row.score>=50?"#fbbf24":"#f87171" }}>{row.score}</span> : "—"}
                    </td>
                    <td style={{ padding:"8px 10px" }}><Badge status={row.status}/></td>
                    <td style={{ padding:"8px 10px", ...mono, fontSize:10, color:"#4a5068", whiteSpace:"nowrap" }}>
                      {row.validated_at ? new Date(row.validated_at).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                      <button onClick={() => unvalidate(row.code_firme)} title="Move back to pending"
                        style={{ background:"transparent", border:"1px solid #3a3010", color:"#fbbf24", padding:"3px 8px", borderRadius:5, fontSize:10, cursor:"pointer", ...mono }}>
                        ↩ Undo
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={12} style={{ padding:40, textAlign:"center", color:"#2a3050", fontSize:12 }}>
                    No validated pharmacies yet
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
