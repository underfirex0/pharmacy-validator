import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { exportCSV, exportXLSX } from "../lib/utils";
import NavBar from "./NavBar";
import { T } from "../theme";

export default function RejectedPage({ user }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [selected, setSelected] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    let all = [], from = 0;
    while (true) {
      const { data, error } = await supabase.from("pharmacies").select("*")
        .eq("status", "rejected")
        .order("validated_at", { ascending: false })
        .range(from, from + 999);
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < 1000) break;
      from += 1000;
    }
    setRows(all); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sendToReview = async (code_firme) => {
    await supabase.from("pharmacies").update({ status: "review" }).eq("code_firme", code_firme);
    setRows((prev) => prev.filter((r) => r.code_firme !== code_firme));
    setSelected((prev) => { const n = new Set(prev); n.delete(code_firme); return n; });
  };

  const bulkSendToReview = async () => {
    if (!selected.size) return;
    const codes = [...selected];
    await supabase.from("pharmacies").update({ status: "review" }).in("code_firme", codes);
    setRows((prev) => prev.filter((r) => !selected.has(r.code_firme)));
    setSelected(new Set());
  };

  const filteredRows = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.raison_sociale?.toLowerCase().includes(q) || r.code_firme?.toLowerCase().includes(q) || r.ville?.toLowerCase().includes(q);
  });

  const toggleOne = (code) => setSelected((prev) => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const toggleAll = () => { const all = filteredRows.map((r) => r.code_firme); setSelected(all.every((c) => selected.has(c)) ? new Set() : new Set(all)); };
  const allChecked  = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.code_firme));
  const someChecked = filteredRows.some((r) => selected.has(r.code_firme));

  return (
    <div style={{ background: T.pageBg, minHeight: "100vh", color: T.textPrimary, paddingBottom: 60, ...T.sans }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      <NavBar user={user}/>

      <div style={{ padding: "24px 28px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: T.redBg, border: `1px solid ${T.redBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>✗</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.textPrimary }}>Pas validé</div>
            <div style={{ fontSize: 12, color: T.textMuted }}>{rows.length} pharmacies rejetées · peuvent être renvoyées en révision</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={() => exportCSV(filteredRows)} style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}`, color: T.greenText, padding: "9px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>↓ CSV ({filteredRows.length})</button>
            <button onClick={() => exportXLSX(filteredRows)} style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}`, color: T.greenText, padding: "9px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>↓ Excel ({filteredRows.length})</button>
          </div>
        </div>

        {/* Info box */}
        <div style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 10, padding: "12px 18px", marginBottom: 20, fontSize: 13, color: T.redText, lineHeight: 1.7 }}>
          <strong>Pharmacies rejetées</strong> — marquées "Pas validé" depuis la page À Revoir. Vous pouvez les renvoyer en révision si nécessaire.
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍  Rechercher nom, code, ville…"
            style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.textPrimary, padding: "8px 14px", fontSize: 13, width: 280, outline: "none" }}
            onFocus={(e) => e.target.style.borderColor = T.accent}
            onBlur={(e) => e.target.style.borderColor = T.border}/>

          {selected.size > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", background: T.yellowBg, border: `1px solid ${T.yellowBorder}`, borderRadius: 10, padding: "7px 16px" }}>
              <span style={{ fontSize: 13, color: T.yellowText, fontWeight: 600, marginRight: 6 }}>{selected.size} sélectionnées</span>
              <button onClick={bulkSendToReview} style={{ background: T.yellowBg, border: `1px solid ${T.yellowBorder}`, color: T.yellowText, padding: "6px 16px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                ⚠ Renvoyer en révision
              </button>
              <button onClick={() => setSelected(new Set())} style={{ background: T.cardBg, border: `1px solid ${T.border}`, color: T.textMuted, padding: "6px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          )}

          <span style={{ fontSize: 12, color: T.textMuted, marginLeft: "auto" }}>{filteredRows.length} lignes</span>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: T.textMuted }}>Chargement…</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 80, background: T.cardBg, borderRadius: 12, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 18, color: T.greenText, fontWeight: 700 }}>Aucune pharmacie rejetée</div>
            <div style={{ fontSize: 13, color: T.textMuted, marginTop: 8 }}>Les pharmacies marquées "Pas validé" apparaîtront ici</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.theadBg }}>
                  <th style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, width: 36 }}>
                    <input type="checkbox" checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      onChange={toggleAll} style={{ cursor: "pointer", accentColor: T.accent, width: 15, height: 15 }}/>
                  </th>
                  {["Code","Nom","Ville","Tel CSV","Tel Maps","Old X/Y","New X/Y","Gap","Score","Notes d'appel","Rejeté le","Actions"].map((h, i) => (
                    <th key={i} style={{ padding: "10px 12px", textAlign: "left", color: T.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, whiteSpace: "nowrap", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => (
                  <tr key={row.code_firme} style={{ borderBottom: `1px solid ${T.border}`, background: selected.has(row.code_firme) ? T.rowSel : i % 2 === 0 ? T.cardBg : T.rowAlt }}>
                    <td style={{ padding: "9px 12px" }}>
                      <input type="checkbox" checked={selected.has(row.code_firme)} onChange={() => toggleOne(row.code_firme)} style={{ cursor: "pointer", accentColor: T.accent, width: 15, height: 15 }}/>
                    </td>
                    <td style={{ padding: "9px 12px", color: T.textMuted, ...T.mono, fontSize: 11, whiteSpace: "nowrap" }}>{row.code_firme}</td>
                    <td style={{ padding: "9px 12px", maxWidth: 200 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500, color: T.textPrimary }}>{row.raison_sociale}</div>
                      {row.maps_name && row.maps_name !== row.raison_sociale && <div style={{ fontSize: 11, color: T.textMuted }}>↳ {row.maps_name}</div>}
                    </td>
                    <td style={{ padding: "9px 12px", color: T.textSecondary, fontSize: 12 }}>{row.ville}</td>
                    <td style={{ padding: "9px 12px", ...T.mono, fontSize: 12, color: T.textSecondary, whiteSpace: "nowrap" }}>{row.telephone || "—"}</td>
                    <td style={{ padding: "9px 12px", ...T.mono, fontSize: 12, whiteSpace: "nowrap" }}>
                      {row.maps_phone ? <span style={{ color: row.phone_diff ? T.redText : T.greenText, fontWeight: 500 }}>{row.maps_phone}</span> : "—"}
                    </td>
                    <td style={{ padding: "9px 12px", ...T.mono, fontSize: 11, color: T.textMuted, whiteSpace: "nowrap" }}>
                      {row.old_x ? <>{row.old_x?.toFixed(4)}<br/>{row.old_y?.toFixed(4)}</> : "—"}
                    </td>
                    <td style={{ padding: "9px 12px", ...T.mono, fontSize: 11, whiteSpace: "nowrap" }}>
                      {row.new_x ? <span style={{ color: T.accentDark, fontWeight: 500 }}>{parseFloat(row.new_x).toFixed(4)}<br/>{parseFloat(row.new_y).toFixed(4)}</span> : "—"}
                    </td>
                    <td style={{ padding: "9px 12px", ...T.mono, fontSize: 12, whiteSpace: "nowrap" }}>
                      {row.gap_km != null ? <span style={{ color: row.gap_km > 1 ? T.redText : row.gap_km > 0.2 ? T.yellowText : T.greenText, fontWeight: 600 }}>{parseFloat(row.gap_km).toFixed(3)}km</span> : "—"}
                    </td>
                    <td style={{ padding: "9px 12px", ...T.mono, fontSize: 13, fontWeight: 700 }}>
                      {row.score != null ? <span style={{ color: row.score >= 80 ? T.greenText : row.score >= 50 ? T.yellowText : T.redText }}>{row.score}</span> : "—"}
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: 12, color: T.textSecondary, maxWidth: 180 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.call_notes || "—"}</div>
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: 12, color: T.textMuted, whiteSpace: "nowrap" }}>
                      {row.validated_at ? new Date(row.validated_at).toLocaleDateString("fr-FR") : "—"}
                    </td>
                    <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                      <button onClick={() => sendToReview(row.code_firme)} style={{ background: T.yellowBg, border: `1px solid ${T.yellowBorder}`, color: T.yellowText, padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                        ⚠ Renvoyer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
