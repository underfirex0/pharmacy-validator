import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { exportCSV, exportXLSX } from "../lib/utils";
import NavBar from "./NavBar";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

function EditCell({ value, onChange, placeholder = "", width = 120 }) {
  return (
    <input
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width, padding: "5px 8px", background: "#060810",
        border: "1px solid #2a3050", borderRadius: 5,
        color: "#c8ccd8", fontSize: 11, outline: "none", ...mono,
        boxSizing: "border-box",
      }}
      onFocus={(e) => e.target.style.borderColor = "#3a5a9e"}
      onBlur={(e) => e.target.style.borderColor = "#2a3050"}
    />
  );
}

function ReviewRow({ row, onSave, onValidate, onSendBack, index }) {
  const [form, setForm]     = useState({
    raison_sociale: row.raison_sociale || "",
    telephone:      row.telephone      || "",
    ville:          row.ville          || "",
    new_x:          row.new_x != null  ? String(row.new_x) : (row.old_x != null ? String(row.old_x) : ""),
    new_y:          row.new_y != null  ? String(row.new_y) : (row.old_y != null ? String(row.old_y) : ""),
    call_notes:     row.call_notes     || "",
  });
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [expanded, setExpanded] = useState(false);

  const set = (key) => (val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    await onSave(row.code_firme, form);
    setSaved(true); setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleValidate = async () => {
    setSaving(true);
    await onValidate(row.code_firme, form);
    setSaving(false);
  };

  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(row.raison_sociale + " " + row.ville + " Maroc")}`;

  return (
    <>
      <tr style={{ borderBottom: expanded ? "none" : "1px solid #0d1020", background: index % 2 === 0 ? "#09090f" : "transparent" }}>
        {/* Code */}
        <td style={{ padding: "10px 10px", color: "#4a6090", ...mono, fontSize: 11, whiteSpace: "nowrap" }}>{row.code_firme}</td>

        {/* Name — editable */}
        <td style={{ padding: "10px 8px" }}>
          <EditCell value={form.raison_sociale} onChange={set("raison_sociale")} width={170}/>
          {row.maps_name && row.maps_name !== row.raison_sociale && (
            <div style={{ fontSize: 9, color: "#4a5068", marginTop: 3, ...mono }}>Maps: {row.maps_name}</div>
          )}
        </td>

        {/* Ville — editable */}
        <td style={{ padding: "10px 8px" }}>
          <EditCell value={form.ville} onChange={set("ville")} width={90}/>
        </td>

        {/* Tel CSV */}
        <td style={{ padding: "10px 10px", ...mono, fontSize: 11, color: "#8890a8", whiteSpace: "nowrap" }}>{row.telephone || "—"}</td>

        {/* Tel confirmed — editable */}
        <td style={{ padding: "10px 8px" }}>
          <EditCell value={form.telephone} onChange={set("telephone")} placeholder="05 XX XX XX" width={130}/>
          {row.phone_diff && <div style={{ fontSize: 9, color: "#f87171", marginTop: 3, ...mono }}>⚠ Maps: {row.maps_phone}</div>}
        </td>

        {/* New X — editable */}
        <td style={{ padding: "10px 8px" }}>
          <EditCell value={form.new_x} onChange={set("new_x")} placeholder="-6.XXXX" width={90}/>
        </td>

        {/* New Y — editable */}
        <td style={{ padding: "10px 8px" }}>
          <EditCell value={form.new_y} onChange={set("new_y")} placeholder="33.XXXX" width={90}/>
        </td>

        {/* Gap */}
        <td style={{ padding: "10px 10px", ...mono, fontSize: 11, whiteSpace: "nowrap" }}>
          {row.gap_km != null ? <span style={{ color: row.gap_km > 1 ? "#f87171" : row.gap_km > 0.2 ? "#fbbf24" : "#4ade80" }}>{parseFloat(row.gap_km).toFixed(2)}km</span> : "—"}
        </td>

        {/* Score */}
        <td style={{ padding: "10px 10px", ...mono, fontSize: 12, whiteSpace: "nowrap" }}>
          {row.score != null ? <span style={{ color: row.score >= 80 ? "#4ade80" : row.score >= 50 ? "#fbbf24" : "#f87171" }}>{row.score}</span> : "—"}
        </td>

        {/* Notes toggle */}
        <td style={{ padding: "10px 8px" }}>
          <button onClick={() => setExpanded((p) => !p)} style={{ background: expanded ? "#1a1a2e" : "transparent", border: "1px solid #2a3050", color: "#818cf8", padding: "4px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", ...mono }}>
            {expanded ? "▲ Notes" : "▼ Notes"}
          </button>
        </td>

        {/* Actions */}
        <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
          <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ background: "#0f1a2e", border: "1px solid #2a4060", color: "#60a5fa", padding: "4px 8px", borderRadius: 5, fontSize: 10, textDecoration: "none", ...mono, marginRight: 4 }}>🗺</a>
          <button onClick={handleSave} disabled={saving} style={{ background: "#0f1a2e", border: "1px solid #2a4a8e", color: saved ? "#4ade80" : "#60a5fa", padding: "4px 9px", borderRadius: 5, fontSize: 10, cursor: "pointer", ...mono, marginRight: 4 }}>
            {saving ? "…" : saved ? "✓" : "💾"}
          </button>
          <button onClick={handleValidate} disabled={saving} style={{ background: "linear-gradient(135deg,#0a2a0a,#0f3a0f)", border: "1px solid #1a5a1a", color: "#22c55e", padding: "4px 12px", borderRadius: 5, fontSize: 10, cursor: "pointer", ...mono, fontWeight: 600, marginRight: 4 }}>
            ✓ Validate
          </button>
          <button onClick={() => onSendBack(row.code_firme)} style={{ background: "transparent", border: "1px solid #3a2a00", color: "#fbbf24", padding: "4px 8px", borderRadius: 5, fontSize: 10, cursor: "pointer", ...mono }}>
            ↩
          </button>
        </td>
      </tr>

      {/* Expandable notes row */}
      {expanded && (
        <tr style={{ borderBottom: "1px solid #0d1020", background: index % 2 === 0 ? "#09090f" : "transparent" }}>
          <td colSpan={11} style={{ padding: "0 10px 12px 10px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ fontSize: 10, color: "#3a4060", ...mono, textTransform: "uppercase", letterSpacing: "0.05em", paddingTop: 8, minWidth: 80 }}>Call notes</span>
              <textarea
                value={form.call_notes || ""}
                onChange={(e) => set("call_notes")(e.target.value)}
                placeholder="What did the pharmacy confirm or update on the call?"
                style={{ flex: 1, padding: "8px 12px", background: "#060810", border: "1px solid #2a3050", borderRadius: 6, color: "#c8ccd8", fontSize: 12, outline: "none", minHeight: 60, resize: "vertical", lineHeight: 1.6 }}
                onFocus={(e) => e.target.style.borderColor = "#3a5a9e"}
                onBlur={(e) => e.target.style.borderColor = "#2a3050"}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ReviewPage({ user }) {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pharmacies").select("*").eq("status", "review")
      .order("imported_at", { ascending: true });
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (code_firme, form) => {
    const update = {
      raison_sociale: form.raison_sociale, telephone: form.telephone, ville: form.ville,
      new_x: parseFloat(form.new_x) || null, new_y: parseFloat(form.new_y) || null,
      call_notes: form.call_notes, validated_at: new Date().toISOString(),
    };
    await supabase.from("pharmacies").update(update).eq("code_firme", code_firme);
    setRows((prev) => prev.map((r) => r.code_firme === code_firme ? { ...r, ...update } : r));
  };

  const handleValidate = async (code_firme, form) => {
    const update = {
      raison_sociale: form.raison_sociale, telephone: form.telephone, ville: form.ville,
      new_x: parseFloat(form.new_x) || null, new_y: parseFloat(form.new_y) || null,
      call_notes: form.call_notes, status: "manual_validated", validated_at: new Date().toISOString(),
    };
    await supabase.from("pharmacies").update(update).eq("code_firme", code_firme);
    setRows((prev) => prev.filter((r) => r.code_firme !== code_firme));
    setSelected((prev) => { const n = new Set(prev); n.delete(code_firme); return n; });
  };

  const handleSendBack = async (code_firme) => {
    await supabase.from("pharmacies").update({ status: "pending" }).eq("code_firme", code_firme);
    setRows((prev) => prev.filter((r) => r.code_firme !== code_firme));
    setSelected((prev) => { const n = new Set(prev); n.delete(code_firme); return n; });
  };

  // Bulk validate selected
  const bulkValidate = async () => {
    if (!selected.size) return;
    const codes = [...selected];
    await supabase.from("pharmacies").update({ status: "manual_validated", validated_at: new Date().toISOString() }).in("code_firme", codes);
    setRows((prev) => prev.filter((r) => !selected.has(r.code_firme)));
    setSelected(new Set());
  };

  const displayRows = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.raison_sociale?.toLowerCase().includes(q) || r.code_firme?.toLowerCase().includes(q) || r.ville?.toLowerCase().includes(q);
  });

  const toggleOne = (code) => setSelected((prev) => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const toggleAll = () => {
    const all = displayRows.map((r) => r.code_firme);
    const allSel = all.every((c) => selected.has(c));
    setSelected(allSel ? new Set() : new Set(all));
  };
  const allChecked  = displayRows.length > 0 && displayRows.every((r) => selected.has(r.code_firme));
  const someChecked = displayRows.some((r) => selected.has(r.code_firme));

  return (
    <div style={{ fontFamily:"'IBM Plex Sans',sans-serif", background:"#0a0c14", minHeight:"100vh", color:"#c8ccd8", paddingBottom:60 }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      <NavBar user={user} />

      <div style={{ padding:"24px 28px" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:"#1f1a00", border:"1px solid #4a3a00", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>⚠</div>
          <div>
            <div style={{ fontSize:18, fontWeight:600, color:"#e8eaf0" }}>To Review</div>
            <div style={{ fontSize:11, color:"#3a4060", ...mono }}>{rows.length} pharmacies · call to confirm · edit inline · validate when done</div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
            <button onClick={() => exportCSV(displayRows)} style={{ background:"#0f1a10", border:"1px solid #1a3a1a", color:"#4ade80", padding:"8px 14px", borderRadius:7, fontSize:12, cursor:"pointer", ...mono }}>↓ CSV</button>
            <button onClick={() => exportXLSX(displayRows)} style={{ background:"#0f1a10", border:"1px solid #1a3a1a", color:"#4ade80", padding:"8px 14px", borderRadius:7, fontSize:12, cursor:"pointer", ...mono }}>↓ Excel</button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, ville…"
            style={{ background:"#0c0f1c", border:"1px solid #1e2236", borderRadius:7, color:"#c8ccd8", padding:"7px 12px", fontSize:12, ...mono, width:240, outline:"none" }}/>

          {selected.size > 0 && (
            <div style={{ display:"flex", gap:6, alignItems:"center", background:"#0c0f1c", border:"1px solid #2a4a8e", borderRadius:8, padding:"6px 14px" }}>
              <span style={{ fontSize:12, color:"#60a5fa", ...mono, marginRight:6 }}>{selected.size} selected</span>
              <button onClick={bulkValidate} style={{ background:"linear-gradient(135deg,#0a2a0a,#0f3a0f)", border:"1px solid #1a5a1a", color:"#22c55e", padding:"5px 14px", borderRadius:6, fontSize:11, cursor:"pointer", ...mono, fontWeight:600 }}>✓ Bulk validate</button>
              <button onClick={() => setSelected(new Set())} style={{ background:"transparent", border:"1px solid #2a3050", color:"#4a5068", padding:"5px 10px", borderRadius:6, fontSize:11, cursor:"pointer", ...mono }}>✕</button>
            </div>
          )}

          <span style={{ fontSize:11, color:"#3a4060", ...mono, marginLeft:"auto" }}>{displayRows.length} rows</span>
        </div>

        {/* How to use */}
        <div style={{ background:"#0c0f1c", border:"1px solid #1e2236", borderRadius:8, padding:"10px 16px", marginBottom:16, fontSize:11, color:"#4a5068", lineHeight:1.7 }}>
          <span style={{ color:"#fbbf24", ...mono }}>HOW TO USE  </span>
          Edit cells directly in the table · 💾 saves progress · ✓ Validate moves to Validated · ↩ sends back to Dashboard · 🗺 opens Google Maps · ▼ Notes expands call notes field
        </div>

        {loading ? (
          <div style={{ textAlign:"center", padding:60, color:"#3a4060", ...mono }}>Loading…</div>
        ) : displayRows.length === 0 ? (
          <div style={{ textAlign:"center", padding:60 }}>
            <div style={{ fontSize:40, marginBottom:16 }}>🎉</div>
            <div style={{ fontSize:16, color:"#4ade80", fontWeight:600 }}>All done!</div>
            <div style={{ fontSize:12, color:"#3a4060", marginTop:8 }}>No pharmacies left to review</div>
          </div>
        ) : (
          <div style={{ overflowX:"auto", borderRadius:8, border:"1px solid #1e2236" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"#0c0f1c" }}>
                  <th style={{ padding:"9px 10px", borderBottom:"1px solid #1e2236", width:36 }}>
                    <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      onChange={toggleAll} style={{ cursor:"pointer", accentColor:"#60a5fa" }}/>
                  </th>
                  {["Code","Name (editable)","Ville","Tel CSV","Tel confirmed","New X","New Y","Gap","Score","Notes","Actions"].map((h,i) => (
                    <th key={i} style={{ padding:"9px 10px", textAlign:"left", color:"#2a3060", ...mono, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:500, whiteSpace:"nowrap", borderBottom:"1px solid #1e2236" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => (
                  <ReviewRow
                    key={row.code_firme}
                    row={row}
                    index={i}
                    onSave={handleSave}
                    onValidate={handleValidate}
                    onSendBack={handleSendBack}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
