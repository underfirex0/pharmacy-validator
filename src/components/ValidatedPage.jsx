import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { exportCSV, exportXLSX } from "../lib/utils";
import NavBar from "./NavBar";
import { T } from "../theme";

export default function ValidatedPage({ user }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    let all = [], from = 0;
    while (true) {
      const { data, error } = await supabase.from("pharmacies").select("*").in("status",["approved","manual_validated"]).order("validated_at",{ ascending:false }).range(from, from+999);
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < 1000) break;
      from += 1000;
    }
    setRows(all); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const unvalidate = async (code_firme) => {
    await supabase.from("pharmacies").update({ status:"pending" }).eq("code_firme", code_firme);
    setRows((prev) => prev.filter((r) => r.code_firme !== code_firme));
  };

  const filteredRows = rows.filter((r) => {
    const mf = filter === "all" || r.status === filter;
    const q  = search.toLowerCase();
    return mf && (!q || r.raison_sociale?.toLowerCase().includes(q) || r.code_firme?.toLowerCase().includes(q) || r.ville?.toLowerCase().includes(q));
  });

  const TypeBadge = ({ status }) => (
    <span style={{ background: status==="approved"?T.greenBg:T.tealBg, color: status==="approved"?T.greenText:T.tealText, border:`1px solid ${status==="approved"?T.greenBorder:T.tealBorder}`, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>
      {status === "approved" ? "✓ Auto" : "✓ Manual"}
    </span>
  );

  return (
    <div style={{ background:T.pageBg, minHeight:"100vh", color:T.textPrimary, paddingBottom:60, ...T.sans }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      <NavBar user={user}/>

      <div style={{ padding:"24px 28px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:24 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:T.greenBg, border:`1px solid ${T.greenBorder}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>✓</div>
          <div>
            <div style={{ fontSize:20, fontWeight:700, color:T.textPrimary }}>Validated Pharmacies</div>
            <div style={{ fontSize:12, color:T.textMuted }}>{rows.length} total · auto + manual validation</div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
            <button onClick={() => exportCSV(filteredRows)} style={{ background:T.greenBg, border:`1px solid ${T.greenBorder}`, color:T.greenText, padding:"9px 18px", borderRadius:8, fontSize:13, cursor:"pointer", fontWeight:600 }}>↓ CSV ({filteredRows.length})</button>
            <button onClick={() => exportXLSX(filteredRows)} style={{ background:T.greenBg, border:`1px solid ${T.greenBorder}`, color:T.greenText, padding:"9px 18px", borderRadius:8, fontSize:13, cursor:"pointer", fontWeight:600 }}>↓ Excel ({filteredRows.length})</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"flex", gap:12, marginBottom:20 }}>
          {[["Total",rows.length,T.textPrimary],["Auto-validated",rows.filter((r)=>r.status==="approved").length,T.greenText],["Manual",rows.filter((r)=>r.status==="manual_validated").length,T.tealText]].map(([l,v,c]) => (
            <div key={l} style={{ background:T.cardBg, border:`1px solid ${T.border}`, borderRadius:10, padding:"12px 20px", minWidth:130, boxShadow:T.shadow }}>
              <div style={{ fontSize:11, color:T.textMuted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4, fontWeight:500 }}>{l}</div>
              <div style={{ fontSize:24, fontWeight:700, color:c }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Search + filter */}
        <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍  Search name, code, ville…"
            style={{ background:T.cardBg, border:`1px solid ${T.border}`, borderRadius:8, color:T.textPrimary, padding:"8px 14px", fontSize:13, width:260, outline:"none" }}
            onFocus={(e) => e.target.style.borderColor=T.accent} onBlur={(e) => e.target.style.borderColor=T.border}/>
          {["all","approved","manual_validated"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{ background: filter===f?T.accentBg:T.cardBg, border:`1px solid ${filter===f?T.accent:T.border}`, color: filter===f?T.accent:T.textSecondary, padding:"7px 14px", borderRadius:8, fontSize:12, cursor:"pointer", fontWeight: filter===f?600:400 }}>
              {f==="all"?"All":f==="approved"?"Auto":"Manual"}
            </button>
          ))}
          <span style={{ fontSize:12, color:T.textMuted }}>{filteredRows.length} rows</span>
        </div>

        {loading ? <div style={{ textAlign:"center", padding:60, color:T.textMuted }}>Loading…</div> : (
          <div style={{ overflowX:"auto", borderRadius:10, border:`1px solid ${T.border}`, boxShadow:T.shadow }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:T.theadBg }}>
                  {["Code","Name","Ville","Tel CSV","Maps Phone","Old X/Y","New X/Y","Gap","Score","Type","Validated",""].map((h,i) => (
                    <th key={i} style={{ padding:"10px 12px", textAlign:"left", color:T.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600, whiteSpace:"nowrap", borderBottom:`1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={row.code_firme} style={{ borderBottom:`1px solid ${T.border}`, background: i%2===0?T.cardBg:T.rowAlt }}>
                    <td style={{ padding:"9px 12px", color:T.textMuted, ...T.mono, fontSize:11, whiteSpace:"nowrap" }}>{row.code_firme}</td>
                    <td style={{ padding:"9px 12px", maxWidth:200 }}>
                      <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:500, color:T.textPrimary }}>{row.raison_sociale}</div>
                      {row.maps_name && row.maps_name !== row.raison_sociale && <div style={{ fontSize:11, color:T.textMuted }}>↳ {row.maps_name}</div>}
                    </td>
                    <td style={{ padding:"9px 12px", color:T.textSecondary, fontSize:12 }}>{row.ville}</td>
                    <td style={{ padding:"9px 12px", ...T.mono, fontSize:12, color:T.textSecondary, whiteSpace:"nowrap" }}>{row.telephone||"—"}</td>
                    <td style={{ padding:"9px 12px", ...T.mono, fontSize:12, whiteSpace:"nowrap" }}>
                      {row.maps_phone ? <span style={{ color: row.phone_diff?T.redText:T.greenText, fontWeight:500 }}>{row.maps_phone}</span> : "—"}
                    </td>
                    <td style={{ padding:"9px 12px", ...T.mono, fontSize:11, color:T.textMuted, whiteSpace:"nowrap" }}>
                      {row.old_x ? <>{row.old_x?.toFixed(4)}<br/>{row.old_y?.toFixed(4)}</> : "—"}
                    </td>
                    <td style={{ padding:"9px 12px", ...T.mono, fontSize:11, whiteSpace:"nowrap" }}>
                      {row.new_x ? <span style={{ color:T.accentDark, fontWeight:500 }}>{parseFloat(row.new_x).toFixed(4)}<br/>{parseFloat(row.new_y).toFixed(4)}</span> : "—"}
                    </td>
                    <td style={{ padding:"9px 12px", ...T.mono, fontSize:12, whiteSpace:"nowrap" }}>
                      {row.gap_km!=null ? <span style={{ color: row.gap_km>1?T.redText:row.gap_km>0.2?T.yellowText:T.greenText, fontWeight:600 }}>{parseFloat(row.gap_km).toFixed(3)}km</span> : "—"}
                    </td>
                    <td style={{ padding:"9px 12px", ...T.mono, fontSize:13, fontWeight:700 }}>
                      {row.score!=null ? <span style={{ color: row.score>=80?T.greenText:row.score>=50?T.yellowText:T.redText }}>{row.score}</span> : "—"}
                    </td>
                    <td style={{ padding:"9px 12px" }}><TypeBadge status={row.status}/></td>
                    <td style={{ padding:"9px 12px", fontSize:12, color:T.textMuted, whiteSpace:"nowrap" }}>
                      {row.validated_at ? new Date(row.validated_at).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td style={{ padding:"9px 12px" }}>
                      <button onClick={() => unvalidate(row.code_firme)} style={{ background:T.yellowBg, border:`1px solid ${T.yellowBorder}`, color:T.yellowText, padding:"4px 10px", borderRadius:6, fontSize:11, cursor:"pointer", fontWeight:500 }}>↩ Undo</button>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && <tr><td colSpan={12} style={{ padding:60, textAlign:"center", color:T.textMuted, fontSize:14 }}>No validated pharmacies yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
