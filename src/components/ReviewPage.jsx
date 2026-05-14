import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { exportCSV, exportXLSX } from "../lib/utils";
import NavBar from "./NavBar";
import { T } from "../theme";

function EditCell({ value, onChange, placeholder = "", width = 120 }) {
  return (
    <input value={value||""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ width, padding:"6px 9px", background:T.inputBg, border:`1px solid ${T.border}`, borderRadius:6, color:T.textPrimary, fontSize:12, outline:"none", boxSizing:"border-box" }}
      onFocus={(e) => e.target.style.borderColor=T.accent}
      onBlur={(e) => e.target.style.borderColor=T.border}
    />
  );
}

function ReviewRow({ row, onSave, onValidate, onSendBack, onReject, index }) {
  const [form, setForm]         = useState({ raison_sociale:row.raison_sociale||"", telephone:row.telephone||"", ville:row.ville||"", new_x:row.new_x!=null?String(row.new_x):(row.old_x!=null?String(row.old_x):""), new_y:row.new_y!=null?String(row.new_y):(row.old_y!=null?String(row.old_y):""), call_notes:row.call_notes||"" });
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [expanded, setExpanded] = useState(false);
  const set = (key) => (val) => setForm((prev) => ({ ...prev, [key]:val }));

  const handleSave = async () => { setSaving(true); await onSave(row.code_firme, form); setSaved(true); setSaving(false); setTimeout(() => setSaved(false), 2000); };
  const handleValidate = async () => { setSaving(true); await onValidate(row.code_firme, form); setSaving(false); };
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(row.raison_sociale+" "+row.ville+" Maroc")}`;

  return (<>
    <tr style={{ borderBottom: expanded?"none":`1px solid ${T.border}`, background: index%2===0?T.cardBg:T.rowAlt }}>
      <td style={{ padding:"9px 12px", color:T.textMuted, ...T.mono, fontSize:11, whiteSpace:"nowrap" }}>{row.code_firme}</td>
      <td style={{ padding:"9px 8px" }}>
        <EditCell value={form.raison_sociale} onChange={set("raison_sociale")} width={170}/>
        {row.maps_name && row.maps_name !== row.raison_sociale && <div style={{ fontSize:10, color:T.textMuted, marginTop:2 }}>Maps: {row.maps_name}</div>}
      </td>
      <td style={{ padding:"9px 8px" }}><EditCell value={form.ville} onChange={set("ville")} width={90}/></td>
      <td style={{ padding:"9px 12px", ...T.mono, fontSize:12, color:T.textSecondary, whiteSpace:"nowrap" }}>{row.telephone||"—"}</td>
      <td style={{ padding:"9px 8px" }}>
        <EditCell value={form.telephone} onChange={set("telephone")} placeholder="05 XX XX XX" width={130}/>
        {row.phone_diff && <div style={{ fontSize:10, color:T.redText, marginTop:2, fontWeight:500 }}>⚠ Maps: {row.maps_phone}</div>}
      </td>
      <td style={{ padding:"9px 8px" }}><EditCell value={form.new_x} onChange={set("new_x")} placeholder="-6.XXXX" width={90}/></td>
      <td style={{ padding:"9px 8px" }}><EditCell value={form.new_y} onChange={set("new_y")} placeholder="33.XXXX" width={90}/></td>
      <td style={{ padding:"9px 12px", ...T.mono, fontSize:12, whiteSpace:"nowrap" }}>
        {row.gap_km!=null ? <span style={{ color: row.gap_km>1?T.redText:row.gap_km>0.2?T.yellowText:T.greenText, fontWeight:600 }}>{parseFloat(row.gap_km).toFixed(2)}km</span> : "—"}
      </td>
      <td style={{ padding:"9px 12px", ...T.mono, fontSize:13, fontWeight:700 }}>
        {row.score!=null ? <span style={{ color: row.score>=80?T.greenText:row.score>=50?T.yellowText:T.redText }}>{row.score}</span> : "—"}
      </td>
      <td style={{ padding:"9px 8px" }}>
        <button onClick={() => setExpanded((p)=>!p)} style={{ background: expanded?T.accentBg:T.cardBg, border:`1px solid ${expanded?T.accent:T.border}`, color: expanded?T.accent:T.textSecondary, padding:"5px 10px", borderRadius:6, fontSize:11, cursor:"pointer" }}>
          {expanded?"▲":"▼"} Notes
        </button>
      </td>
      <td style={{ padding:"9px 8px", whiteSpace:"nowrap" }}>
        <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ background:T.accentBg, border:`1px solid ${T.blueBorder}`, color:T.accent, padding:"5px 9px", borderRadius:6, fontSize:11, textDecoration:"none", marginRight:4, fontWeight:500 }}>🗺</a>
        <button onClick={handleSave} disabled={saving} style={{ background: saved?T.greenBg:T.accentBg, border:`1px solid ${saved?T.greenBorder:T.blueBorder}`, color: saved?T.greenText:T.accent, padding:"5px 9px", borderRadius:6, fontSize:11, cursor:"pointer", marginRight:4, fontWeight:500 }}>
          {saving?"…":saved?"✓":"💾"}
        </button>
        <button onClick={handleValidate} disabled={saving} style={{ background:T.greenBg, border:`1px solid ${T.greenBorder}`, color:T.greenText, padding:"5px 12px", borderRadius:6, fontSize:11, cursor:"pointer", fontWeight:700, marginRight:4 }}>
          ✓ Validé
        </button>
        <button onClick={() => onReject(row.code_firme)} style={{ background:T.redBg, border:`1px solid ${T.redBorder}`, color:T.redText, padding:"5px 10px", borderRadius:6, fontSize:11, cursor:"pointer", fontWeight:700, marginRight:4 }}>
          ✗ Pas validé
        </button>
        <button onClick={() => onSendBack(row.code_firme)} style={{ background:T.yellowBg, border:`1px solid ${T.yellowBorder}`, color:T.yellowText, padding:"5px 9px", borderRadius:6, fontSize:11, cursor:"pointer" }}>↩</button>
      </td>
    </tr>
    {expanded && (
      <tr style={{ borderBottom:`1px solid ${T.border}`, background: index%2===0?T.cardBg:T.rowAlt }}>
        <td colSpan={11} style={{ padding:"0 12px 12px 12px" }}>
          <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
            <span style={{ fontSize:11, color:T.textMuted, paddingTop:8, minWidth:80, textTransform:"uppercase", letterSpacing:"0.04em", fontWeight:500 }}>Call notes</span>
            <textarea value={form.call_notes||""} onChange={(e) => set("call_notes")(e.target.value)} placeholder="What did the pharmacy confirm or update on the call?"
              style={{ flex:1, padding:"9px 12px", background:T.inputBg, border:`1px solid ${T.border}`, borderRadius:8, color:T.textPrimary, fontSize:13, outline:"none", minHeight:64, resize:"vertical", lineHeight:1.6 }}
              onFocus={(e) => e.target.style.borderColor=T.accent} onBlur={(e) => e.target.style.borderColor=T.border}
            />
          </div>
        </td>
      </tr>
    )}
  </>);
}

export default function ReviewPage({ user }) {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    let all = [], from = 0;
    while (true) {
      const { data, error } = await supabase.from("pharmacies").select("*").in("status",["review","notfound"]).order("imported_at",{ ascending:true }).range(from, from+999);
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < 1000) break;
      from += 1000;
    }
    setRows(all); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (code_firme, form) => {
    const update = { raison_sociale:form.raison_sociale, telephone:form.telephone, ville:form.ville, new_x:parseFloat(form.new_x)||null, new_y:parseFloat(form.new_y)||null, call_notes:form.call_notes, validated_at:new Date().toISOString() };
    await supabase.from("pharmacies").update(update).eq("code_firme", code_firme);
    setRows((prev) => prev.map((r) => r.code_firme===code_firme ? { ...r, ...update } : r));
  };

  const handleValidate = async (code_firme, form) => {
    const update = { raison_sociale:form.raison_sociale, telephone:form.telephone, ville:form.ville, new_x:parseFloat(form.new_x)||null, new_y:parseFloat(form.new_y)||null, call_notes:form.call_notes, status:"manual_validated", validated_at:new Date().toISOString() };
    await supabase.from("pharmacies").update(update).eq("code_firme", code_firme);
    setRows((prev) => prev.filter((r) => r.code_firme !== code_firme));
    setSelected((prev) => { const n = new Set(prev); n.delete(code_firme); return n; });
  };

  const handleSendBack = async (code_firme) => {
    await supabase.from("pharmacies").update({ status:"pending" }).eq("code_firme", code_firme);
    setRows((prev) => prev.filter((r) => r.code_firme !== code_firme));
  };

  const handleReject = async (code_firme) => {
    await supabase.from("pharmacies").update({ status:"rejected", validated_at:new Date().toISOString() }).eq("code_firme", code_firme);
    setRows((prev) => prev.filter((r) => r.code_firme !== code_firme));
    setSelected((prev) => { const n = new Set(prev); n.delete(code_firme); return n; });
  };

  const bulkValidate = async () => {
    if (!selected.size) return;
    const codes = [...selected];
    await supabase.from("pharmacies").update({ status:"manual_validated", validated_at:new Date().toISOString() }).in("code_firme", codes);
    setRows((prev) => prev.filter((r) => !selected.has(r.code_firme)));
    setSelected(new Set());
  };

  const displayRows = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.raison_sociale?.toLowerCase().includes(q) || r.code_firme?.toLowerCase().includes(q) || r.ville?.toLowerCase().includes(q);
  });

  const toggleOne = (code) => setSelected((prev) => { const n = new Set(prev); n.has(code)?n.delete(code):n.add(code); return n; });
  const toggleAll = () => { const all = displayRows.map((r) => r.code_firme); setSelected(all.every((c)=>selected.has(c))?new Set():new Set(all)); };
  const allChecked  = displayRows.length>0 && displayRows.every((r)=>selected.has(r.code_firme));
  const someChecked = displayRows.some((r)=>selected.has(r.code_firme));

  return (
    <div style={{ background:T.pageBg, minHeight:"100vh", color:T.textPrimary, paddingBottom:60, ...T.sans }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      <NavBar user={user}/>

      <div style={{ padding:"24px 28px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:T.yellowBg, border:`1px solid ${T.yellowBorder}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>⚠</div>
          <div>
            <div style={{ fontSize:20, fontWeight:700, color:T.textPrimary }}>To Review</div>
            <div style={{ fontSize:12, color:T.textMuted }}>{rows.length} pharmacies · call to confirm · edit inline · validate when done</div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
            <button onClick={() => exportCSV(displayRows)} style={{ background:T.greenBg, border:`1px solid ${T.greenBorder}`, color:T.greenText, padding:"9px 16px", borderRadius:8, fontSize:13, cursor:"pointer", fontWeight:600 }}>↓ CSV</button>
            <button onClick={() => exportXLSX(displayRows)} style={{ background:T.greenBg, border:`1px solid ${T.greenBorder}`, color:T.greenText, padding:"9px 16px", borderRadius:8, fontSize:13, cursor:"pointer", fontWeight:600 }}>↓ Excel</button>
          </div>
        </div>

        {/* Instructions */}
        <div style={{ background:T.yellowBg, border:`1px solid ${T.yellowBorder}`, borderRadius:10, padding:"12px 18px", marginBottom:16, fontSize:13, color:T.yellowText, lineHeight:1.7 }}>
          <strong>How to use:</strong> Edit cells directly · 💾 saves progress · ✓ Validate moves to Validated · ↩ sends back · 🗺 opens Maps · ▼ Notes expands call notes
        </div>

        {/* Toolbar */}
        <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍  Search name, code, ville…"
            style={{ background:T.cardBg, border:`1px solid ${T.border}`, borderRadius:8, color:T.textPrimary, padding:"8px 14px", fontSize:13, width:260, outline:"none" }}
            onFocus={(e) => e.target.style.borderColor=T.accent} onBlur={(e) => e.target.style.borderColor=T.border}/>
          {selected.size > 0 && (
            <div style={{ display:"flex", gap:6, alignItems:"center", background:T.accentBg, border:`1px solid ${T.blueBorder}`, borderRadius:10, padding:"7px 16px" }}>
              <span style={{ fontSize:13, color:T.accent, fontWeight:600, marginRight:6 }}>{selected.size} selected</span>
              <button onClick={bulkValidate} style={{ background:T.greenBg, border:`1px solid ${T.greenBorder}`, color:T.greenText, padding:"6px 16px", borderRadius:7, fontSize:12, cursor:"pointer", fontWeight:700 }}>✓ Bulk validate</button>
              <button onClick={() => setSelected(new Set())} style={{ background:T.cardBg, border:`1px solid ${T.border}`, color:T.textMuted, padding:"6px 10px", borderRadius:7, fontSize:12, cursor:"pointer" }}>✕</button>
            </div>
          )}
          <span style={{ fontSize:12, color:T.textMuted, marginLeft:"auto" }}>{displayRows.length} rows</span>
        </div>

        {loading ? <div style={{ textAlign:"center", padding:60, color:T.textMuted }}>Loading…</div>
        : displayRows.length === 0 ? (
          <div style={{ textAlign:"center", padding:80, background:T.cardBg, borderRadius:12, border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
            <div style={{ fontSize:18, color:T.greenText, fontWeight:700 }}>All done!</div>
            <div style={{ fontSize:13, color:T.textMuted, marginTop:8 }}>No pharmacies left to review</div>
          </div>
        ) : (
          <div style={{ overflowX:"auto", borderRadius:10, border:`1px solid ${T.border}`, boxShadow:T.shadow }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:T.theadBg }}>
                  <th style={{ padding:"10px 12px", borderBottom:`1px solid ${T.border}`, width:36 }}>
                    <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} style={{ cursor:"pointer", accentColor:T.accent, width:15, height:15 }}/>
                  </th>
                  {["Code","Name (editable)","Ville","Tel CSV","Tel confirmed","New X","New Y","Gap","Score","Notes","Actions"].map((h,i) => (
                    <th key={i} style={{ padding:"10px 12px", textAlign:"left", color:T.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600, whiteSpace:"nowrap", borderBottom:`1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row,i) => (
                  <ReviewRow key={row.code_firme} row={row} index={i} onSave={handleSave} onValidate={handleValidate} onSendBack={handleSendBack} onReject={handleReject}/>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
