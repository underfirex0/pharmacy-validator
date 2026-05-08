import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import NavBar from "./NavBar";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 10, color: "#4a5068", ...mono, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>{label}</label>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", padding: "9px 12px", background: "#0a0c14", border: "1px solid #2a3050", borderRadius: 7, color: "#c8ccd8", fontSize: 13, outline: "none", boxSizing: "border-box", ...mono }}
        onFocus={(e) => e.target.style.borderColor = "#3a5a9e"}
        onBlur={(e) => e.target.style.borderColor = "#2a3050"}
      />
    </div>
  );
}

function CRMCard({ row, onSave, onValidate, onSkip }) {
  const [form, setForm] = useState({
    raison_sociale: row.raison_sociale || "",
    telephone:      row.telephone      || "",
    ville:          row.ville          || "",
    new_x:          row.new_x          || row.old_x || "",
    new_y:          row.new_y          || row.old_y || "",
    notes:          row.notes          || "",
    call_notes:     row.call_notes     || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

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
    <div style={{ background: "#0c0f1c", border: "1px solid #1e2236", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
      {/* Card header */}
      <div style={{ background: "#0a0e1a", borderBottom: "1px solid #1e2236", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#e8eaf0" }}>{row.raison_sociale}</div>
          <div style={{ fontSize: 11, color: "#4a5068", ...mono, marginTop: 2 }}>{row.code_firme} · {row.ville}</div>
        </div>
        <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ background: "#0f2040", border: "1px solid #2a4a8e", color: "#60a5fa", padding: "6px 12px", borderRadius: 6, fontSize: 11, textDecoration: "none", ...mono, whiteSpace: "nowrap" }}>
          🗺 Open Maps
        </a>
        <button onClick={() => onSkip(row.code_firme)} style={{ background: "transparent", border: "1px solid #2a3050", color: "#4a5068", padding: "6px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", ...mono }}>
          Skip →
        </button>
      </div>

      <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Left — current data from CSV/API */}
        <div>
          <div style={{ fontSize: 11, color: "#3a4060", ...mono, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #1e2236" }}>
            Current data
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              ["Code firme",   row.code_firme],
              ["Raison sociale", row.raison_sociale],
              ["Ville",        row.ville],
              ["Tel (CSV)",    row.telephone],
              ["Tel (Maps)",   row.maps_phone || "—"],
              ["Maps name",    row.maps_name  || "—"],
              ["Score",        row.score != null ? `${row.score}/100` : "—"],
              ["Gap",          row.gap_km != null ? `${parseFloat(row.gap_km).toFixed(3)} km` : "—"],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 10, color: "#3a4060", ...mono, minWidth: 100, paddingTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
                <span style={{ fontSize: 12, color: "#8890a8" }}>{value || "—"}</span>
              </div>
            ))}
            {/* Old coordinates */}
            <div style={{ display: "flex", gap: 8 }}>
              <span style={{ fontSize: 10, color: "#3a4060", ...mono, minWidth: 100, paddingTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Old X/Y</span>
              <span style={{ fontSize: 12, color: "#4a5068", ...mono }}>{row.old_x?.toFixed(5) || "—"}<br/>{row.old_y?.toFixed(5) || "—"}</span>
            </div>
            {row.maps_phone && row.telephone && row.maps_phone !== row.telephone && (
              <div style={{ background: "#1a0808", border: "1px solid #4a1010", borderRadius: 6, padding: "8px 12px", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: "#f87171", ...mono }}>⚠ Phone mismatch — verify on call</span>
              </div>
            )}
          </div>
        </div>

        {/* Right — editable fields */}
        <div>
          <div style={{ fontSize: 11, color: "#3a4060", ...mono, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #1e2236" }}>
            Update after call
          </div>
          <Field label="Raison Sociale (confirmed)" value={form.raison_sociale} onChange={set("raison_sociale")}/>
          <Field label="Telephone (confirmed)" value={form.telephone} onChange={set("telephone")} placeholder="05 XX XX XX XX"/>
          <Field label="Ville" value={form.ville} onChange={set("ville")}/>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="New X (longitude)" value={form.new_x} onChange={set("new_x")} placeholder="-6.XXXX"/>
            <Field label="New Y (latitude)"  value={form.new_y} onChange={set("new_y")} placeholder="33.XXXX"/>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, color: "#4a5068", ...mono, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Call notes</label>
            <textarea value={form.call_notes || ""} onChange={(e) => set("call_notes")(e.target.value)}
              placeholder="What did the pharmacy say? Any updates?"
              style={{ width: "100%", padding: "9px 12px", background: "#0a0c14", border: "1px solid #2a3050", borderRadius: 7, color: "#c8ccd8", fontSize: 12, outline: "none", boxSizing: "border-box", minHeight: 70, resize: "vertical", lineHeight: 1.6 }}
              onFocus={(e) => e.target.style.borderColor = "#3a5a9e"}
              onBlur={(e) => e.target.style.borderColor = "#2a3050"}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ borderTop: "1px solid #1e2236", padding: "14px 20px", display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={handleSave} disabled={saving} style={{ background: "#0f1a2e", border: "1px solid #2a4a8e", color: "#60a5fa", padding: "9px 20px", borderRadius: 7, fontSize: 12, cursor: "pointer", ...mono }}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "💾 Save draft"}
        </button>
        <button onClick={handleValidate} disabled={saving} style={{ background: "linear-gradient(135deg,#0a2a0a,#0f3a0f)", border: "1px solid #1a5a1a", color: "#22c55e", padding: "9px 24px", borderRadius: 7, fontSize: 12, cursor: "pointer", ...mono, fontWeight: 500 }}>
          ✓ Validate & move to Validated
        </button>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "#3a4060", ...mono }}>
          {row.validated_at ? `Last updated: ${new Date(row.validated_at).toLocaleDateString("fr-FR")}` : "Not yet processed"}
        </div>
      </div>
    </div>
  );
}

export default function ReviewPage({ user }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [skipped, setSkipped] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pharmacies")
      .select("*")
      .eq("status", "review")
      .order("imported_at", { ascending: true });
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (code_firme, form) => {
    const update = {
      raison_sociale: form.raison_sociale,
      telephone:      form.telephone,
      ville:          form.ville,
      new_x:          parseFloat(form.new_x) || null,
      new_y:          parseFloat(form.new_y) || null,
      notes:          form.notes,
      call_notes:     form.call_notes,
      validated_at:   new Date().toISOString(),
    };
    await supabase.from("pharmacies").update(update).eq("code_firme", code_firme);
    setRows((prev) => prev.map((r) => r.code_firme === code_firme ? { ...r, ...update } : r));
  };

  const handleValidate = async (code_firme, form) => {
    const update = {
      raison_sociale:   form.raison_sociale,
      telephone:        form.telephone,
      ville:            form.ville,
      new_x:            parseFloat(form.new_x) || null,
      new_y:            parseFloat(form.new_y) || null,
      notes:            form.notes,
      call_notes:       form.call_notes,
      status:           "manual_validated",
      validated_at:     new Date().toISOString(),
    };
    await supabase.from("pharmacies").update(update).eq("code_firme", code_firme);
    setRows((prev) => prev.filter((r) => r.code_firme !== code_firme));
  };

  const handleSkip = (code_firme) => {
    setSkipped((prev) => new Set([...prev, code_firme]));
  };

  const displayRows = rows.filter((r) => {
    if (skipped.has(r.code_firme)) return false;
    const q = search.toLowerCase();
    return !q || r.raison_sociale?.toLowerCase().includes(q) || r.code_firme?.toLowerCase().includes(q) || r.ville?.toLowerCase().includes(q);
  });

  return (
    <div style={{ fontFamily:"'IBM Plex Sans',sans-serif", background:"#0a0c14", minHeight:"100vh", color:"#c8ccd8", paddingBottom:60 }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      <NavBar user={user} />

      <div style={{ padding:"24px 28px" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:24 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:"#1f1a00", border:"1px solid #4a3a00", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>⚠</div>
          <div>
            <div style={{ fontSize:18, fontWeight:600, color:"#e8eaf0" }}>To Review</div>
            <div style={{ fontSize:11, color:"#3a4060", ...mono }}>{rows.length} pharmacies to call · {displayRows.length} showing</div>
          </div>
        </div>

        {/* Instructions */}
        <div style={{ background:"#0c0f1c", border:"1px solid #1e2236", borderRadius:8, padding:"14px 20px", marginBottom:24, fontSize:12, color:"#6a7090", lineHeight:1.8 }}>
          <span style={{ color:"#fbbf24", ...mono, fontSize:11 }}>HOW TO USE  </span>
          Call the pharmacy · Confirm name, phone, and address · Update the fields on the right · Click <strong style={{ color:"#22c55e" }}>Validate</strong> to move to Validated list · Use <strong style={{ color:"#60a5fa" }}>Save draft</strong> to save progress without validating · <strong>Skip</strong> to come back to it later
        </div>

        {/* Search */}
        <div style={{ marginBottom:20 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, ville…"
            style={{ background:"#0c0f1c", border:"1px solid #1e2236", borderRadius:7, color:"#c8ccd8", padding:"8px 14px", fontSize:12, ...mono, width:300, outline:"none" }}/>
          {skipped.size > 0 && (
            <button onClick={() => setSkipped(new Set())} style={{ marginLeft:10, background:"transparent", border:"1px solid #2a3050", color:"#4a5068", padding:"8px 14px", borderRadius:7, fontSize:11, cursor:"pointer", ...mono }}>
              Show {skipped.size} skipped
            </button>
          )}
        </div>

        {/* CRM cards */}
        {loading ? (
          <div style={{ textAlign:"center", padding:60, color:"#3a4060", ...mono }}>Loading…</div>
        ) : displayRows.length === 0 ? (
          <div style={{ textAlign:"center", padding:60 }}>
            <div style={{ fontSize:40, marginBottom:16 }}>🎉</div>
            <div style={{ fontSize:16, color:"#4ade80", fontWeight:600 }}>All done!</div>
            <div style={{ fontSize:12, color:"#3a4060", marginTop:8 }}>No pharmacies left to review{skipped.size > 0 ? ` (${skipped.size} skipped)` : ""}</div>
          </div>
        ) : (
          displayRows.map((row) => (
            <CRMCard
              key={row.code_firme}
              row={row}
              onSave={handleSave}
              onValidate={handleValidate}
              onSkip={handleSkip}
            />
          ))
        )}
      </div>
    </div>
  );
}
