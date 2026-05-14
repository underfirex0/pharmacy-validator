import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { searchGooglePlaces } from "../lib/places";
import { haversineKm, normalizePhone, scoreCandidate, decideStatus, parseCSV } from "../lib/utils";
import NavBar from "./NavBar";
import { T } from "../theme";

const ST = {
  approved:         { bg:T.greenBg,  text:T.greenText,  border:T.greenBorder,  label:"✓ Approved" },
  manual_validated: { bg:T.tealBg,   text:T.tealText,   border:T.tealBorder,   label:"✓ Validated" },
  review:           { bg:T.yellowBg, text:T.yellowText,  border:T.yellowBorder, label:"⚠ Review" },
  notfound:         { bg:T.redBg,    text:T.redText,    border:T.redBorder,    label:"✗ Not found" },
  pending:          { bg:T.blueBg,   text:T.blueText,   border:T.blueBorder,   label:"⋯ Pending" },
  running:          { bg:T.blueBg,   text:T.accent,     border:T.blueBorder,   label:"↻ Running" },
  error:            { bg:T.redBg,    text:T.redText,    border:T.redBorder,    label:"! Error" },
};

function Badge({ status }) {
  const s = ST[status] || ST.pending;
  return <span style={{ background:s.bg, color:s.text, border:`1px solid ${s.border}`, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>{s.label}</span>;
}

export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [running, setRunning]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [subTab, setSubTab]     = useState("dashboard");
  const [filter, setFilter]     = useState("all");
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(new Set());
  const [apiKey, setApiKey]     = useState(() => localStorage.getItem("gplaceskey") || "");
  const [saveMsg, setSaveMsg]   = useState("");
  const fileRef  = useRef();
  const abortRef = useRef(false);

  useEffect(() => { if (apiKey) localStorage.setItem("gplaceskey", apiKey); }, [apiKey]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    let all = [], from = 0;
    while (true) {
      const { data, error } = await supabase.from("pharmacies").select("*").order("imported_at", { ascending: false }).range(from, from + 999);
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < 1000) break;
      from += 1000;
    }
    setRows(all); setLoading(false);
  }, []);

  useEffect(() => { loadRows(); }, [loadRows]);

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const tryRead = (enc) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const text = ev.target.result;
        if (enc === "utf-8" && (text.includes("Ã©") || text.includes("Ã"))) { tryRead("windows-1252"); return; }
        const parsed = parseCSV(text);
        if (!parsed.length) { alert("No rows found."); return; }
        const toInsert = parsed.map((r) => ({ code_firme:r.code_firme, raison_sociale:r.raison_sociale, ville:r.ville, telephone:r.telephone, old_x:r.old_x, old_y:r.old_y, status:"pending" }));
        const chunkSize = 500;
        let error = null;
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const { error: err } = await supabase.from("pharmacies").upsert(toInsert.slice(i, i+chunkSize), { onConflict:"code_firme", ignoreDuplicates:false });
          if (err) { error = err; break; }
        }
        if (error) { alert("Import error: " + error.message); return; }
        await loadRows(); setSubTab("dashboard"); e.target.value = "";
        alert(`✓ ${parsed.length} pharmacies imported`);
      };
      reader.readAsText(file, enc);
    };
    tryRead("utf-8");
  };

  const runValidation = useCallback(async (targetRows) => {
    if (!apiKey.trim()) { alert("Enter your Google Places API key in Settings."); return; }
    const toProcess = targetRows || rows.filter((r) => r.status === "pending" || r.status === "error");
    if (!toProcess.length) { alert("No pending rows to process."); return; }
    setRunning(true); abortRef.current = false;
    const codes = new Set(toProcess.map((r) => r.code_firme));
    setRows((prev) => prev.map((r) => codes.has(r.code_firme) ? { ...r, status:"running" } : r));
    for (let i = 0; i < toProcess.length; i++) {
      if (abortRef.current) break;
      const row = toProcess[i];
      try {
        const candidates = await searchGooglePlaces(apiKey, row);
        let update;
        if (!candidates.length) {
          update = { status:"notfound", score:0, notes:"No results", validated_at:new Date().toISOString() };
        } else {
          const scored = candidates.map((c) => scoreCandidate(c, row)).sort((a,b) => b.score - a.score);
          const best = scored[0];
          const dist = (row.old_x && row.old_y && best.candidate.lat && best.candidate.lng) ? haversineKm(row.old_y, row.old_x, best.candidate.lat, best.candidate.lng) : null;
          const cp = normalizePhone(best.candidate.phone), rp = normalizePhone(row.telephone);
          update = {
            status: decideStatus(best, row, dist), score: best.score,
            new_x: best.candidate.lng, new_y: best.candidate.lat,
            gap_km: dist !== null ? parseFloat(dist.toFixed(3)) : null,
            phone_diff: !!(cp && rp && cp !== rp),
            maps_phone: best.candidate.phone, maps_name: best.candidate.name,
            maps_address: best.candidate.address, validated_at: new Date().toISOString(), notes: null,
          };
        }
        const { error: dbErr } = await supabase.from("pharmacies").update(update).eq("code_firme", row.code_firme);
        if (dbErr) { console.error("Save failed:", row.code_firme, dbErr.message); await new Promise((r) => setTimeout(r, 800)); await supabase.from("pharmacies").update(update).eq("code_firme", row.code_firme); }
        setRows((prev) => prev.map((r) => r.code_firme === row.code_firme ? { ...r, ...update } : r));
      } catch (err) {
        const update = { status:"error", score:0, notes:err.message };
        await supabase.from("pharmacies").update(update).eq("code_firme", row.code_firme);
        setRows((prev) => prev.map((r) => r.code_firme === row.code_firme ? { ...r, ...update } : r));
      }
      setProgress(Math.round(((i+1)/toProcess.length)*100));
      await new Promise((res) => setTimeout(res, 350));
    }
    setRunning(false);
  }, [apiKey, rows]);

  const setRowStatus = async (code_firme, status) => {
    await supabase.from("pharmacies").update({ status, validated_at:new Date().toISOString() }).eq("code_firme", code_firme);
    setRows((prev) => prev.map((r) => r.code_firme === code_firme ? { ...r, status } : r));
    setSelected((prev) => { const n = new Set(prev); n.delete(code_firme); return n; });
  };

  const bulkAction = async (status) => {
    if (!selected.size) return;
    const codes = [...selected];
    await supabase.from("pharmacies").update({ status, validated_at:new Date().toISOString() }).in("code_firme", codes);
    setRows((prev) => prev.map((r) => selected.has(r.code_firme) ? { ...r, status } : r));
    setSelected(new Set());
    if (status === "approved" || status === "manual_validated") navigate("/validated");
    else if (status === "review") navigate("/review");
  };

  const deleteRow = async (code_firme) => {
    await supabase.from("pharmacies").delete().eq("code_firme", code_firme);
    setRows((prev) => prev.filter((r) => r.code_firme !== code_firme));
  };

  const clearAll = async () => {
    if (!window.confirm("Delete ALL pharmacies?")) return;
    await supabase.from("pharmacies").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setRows([]); setSelected(new Set());
  };

  const filteredRows = rows.filter((r) => {
    const mf = filter === "all" || r.status === filter;
    const q  = search.toLowerCase();
    return mf && (!q || r.raison_sociale?.toLowerCase().includes(q) || r.code_firme?.toLowerCase().includes(q) || r.ville?.toLowerCase().includes(q));
  });

  const toggleOne = (code) => setSelected((prev) => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const toggleAll = () => { const all = filteredRows.map((r) => r.code_firme); setSelected(all.every((c) => selected.has(c)) ? new Set() : new Set(all)); };
  const allChecked  = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.code_firme));
  const someChecked = filteredRows.some((r) => selected.has(r.code_firme));

  const stats = { total:rows.length, approved:rows.filter((r) => r.status==="approved"||r.status==="manual_validated").length, review:rows.filter((r) => r.status==="review").length, notfound:rows.filter((r) => r.status==="notfound").length, pending:rows.filter((r) => r.status==="pending").length, error:rows.filter((r) => r.status==="error").length };

  const filterBtn = (f, label) => (
    <button onClick={() => setFilter(f)} style={{ background: filter===f ? T.accentBg : T.cardBg, border:`1px solid ${filter===f ? T.accent : T.border}`, color: filter===f ? T.accent : T.textSecondary, padding:"6px 14px", borderRadius:8, fontSize:12, cursor:"pointer", fontWeight: filter===f ? 600 : 400 }}>{label}</button>
  );

  return (
    <div style={{ background:T.pageBg, minHeight:"100vh", color:T.textPrimary, paddingBottom:60, ...T.sans }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      <NavBar user={user} counts={{ "/validated":stats.approved, "/review":stats.review }}/>

      {/* Sub-tabs */}
      <div style={{ background:T.cardBg, borderBottom:`1px solid ${T.border}`, padding:"0 28px", display:"flex", gap:4 }}>
        {["dashboard","import","settings"].map((t) => (
          <button key={t} onClick={() => setSubTab(t)} style={{ background:"transparent", border:"none", borderBottom: subTab===t?`2px solid ${T.accent}`:"2px solid transparent", color: subTab===t?T.accent:T.textSecondary, padding:"12px 16px", fontSize:13, cursor:"pointer", fontWeight: subTab===t?600:400, textTransform:"capitalize" }}>{t}</button>
        ))}
      </div>

      <div style={{ padding:"24px 28px" }}>
        {subTab === "dashboard" && (<>

          {/* Stat cards */}
          <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
            {[["Total",stats.total,T.textPrimary,"all"],["Validated",stats.approved,T.greenText,"approved"],["Review",stats.review,T.yellowText,"review"],["Not found",stats.notfound,T.redText,"notfound"],["Pending",stats.pending,T.blueText,"pending"],["Error",stats.error,T.redText,"error"]].map(([label,val,color,f]) => (
              <div key={label} onClick={() => setFilter(f)} style={{ background:T.cardBg, border:`2px solid ${filter===f?T.accent:T.border}`, borderRadius:12, padding:"14px 20px", minWidth:100, cursor:"pointer", boxShadow:T.shadow }}>
                <div style={{ fontSize:11, color:T.textMuted, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4, fontWeight:500 }}>{label}</div>
                <div style={{ fontSize:26, fontWeight:700, color }}>{val}</div>
              </div>
            ))}
            {running && (
              <div style={{ background:T.cardBg, border:`1px solid ${T.border}`, borderRadius:12, padding:"14px 20px", minWidth:180, boxShadow:T.shadow }}>
                <div style={{ fontSize:11, color:T.textMuted, marginBottom:8, fontWeight:500 }}>API PROGRESS</div>
                <div style={{ background:T.pageBg, borderRadius:4, height:6 }}>
                  <div style={{ background:T.accent, borderRadius:4, height:6, width:`${progress}%`, transition:"width 0.3s" }}/>
                </div>
                <div style={{ fontSize:12, color:T.accent, marginTop:4, fontWeight:600 }}>{progress}%</div>
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
            <button onClick={() => runValidation()} disabled={running} style={{ background: running?T.grayBg:T.accent, border:"none", color: running?T.textMuted:"#fff", padding:"9px 20px", borderRadius:8, fontSize:13, cursor: running?"not-allowed":"pointer", fontWeight:600 }}>
              {running ? `⚙ Running… ${progress}%` : `⚙ Auto-validate via API (${stats.pending} pending)`}
            </button>
            {running && <button onClick={() => { abortRef.current=true; setRunning(false); }} style={{ background:T.redBg, border:`1px solid ${T.redBorder}`, color:T.redText, padding:"9px 16px", borderRadius:8, fontSize:13, cursor:"pointer", fontWeight:500 }}>■ Stop</button>}

            {selected.size > 0 && (
              <div style={{ display:"flex", gap:6, alignItems:"center", background:T.accentBg, border:`1px solid ${T.blueBorder}`, borderRadius:10, padding:"7px 16px" }}>
                <span style={{ fontSize:13, color:T.accent, fontWeight:600, marginRight:6 }}>{selected.size} selected</span>
                <button onClick={() => bulkAction("approved")} style={{ background:T.greenBg, border:`1px solid ${T.greenBorder}`, color:T.greenText, padding:"6px 14px", borderRadius:7, fontSize:12, cursor:"pointer", fontWeight:600 }}>✓ Bulk validate</button>
                <button onClick={() => bulkAction("review")}   style={{ background:T.yellowBg, border:`1px solid ${T.yellowBorder}`, color:T.yellowText, padding:"6px 14px", borderRadius:7, fontSize:12, cursor:"pointer", fontWeight:600 }}>⚠ Bulk to review</button>
                <button onClick={() => setSelected(new Set())} style={{ background:T.cardBg, border:`1px solid ${T.border}`, color:T.textMuted, padding:"6px 10px", borderRadius:7, fontSize:12, cursor:"pointer" }}>✕</button>
              </div>
            )}
            <button onClick={clearAll} style={{ background:T.redBg, border:`1px solid ${T.redBorder}`, color:T.redText, padding:"9px 16px", borderRadius:8, fontSize:13, cursor:"pointer", fontWeight:500, marginLeft:"auto" }}>🗑 Clear all</button>
          </div>

          {/* Search + filters */}
          <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍  Search name, code, ville…"
              style={{ background:T.cardBg, border:`1px solid ${T.border}`, borderRadius:8, color:T.textPrimary, padding:"8px 14px", fontSize:13, width:260, outline:"none" }}
              onFocus={(e) => e.target.style.borderColor=T.accent} onBlur={(e) => e.target.style.borderColor=T.border}/>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {filterBtn("all","All")}
              {filterBtn("approved","✓ Validated")}
              {filterBtn("review","⚠ Review")}
              {filterBtn("notfound","✗ Not found")}
              {filterBtn("pending","⋯ Pending")}
              {filterBtn("error","! Error")}
            </div>
            <span style={{ fontSize:12, color:T.textMuted, marginLeft:4 }}>{filteredRows.length} rows</span>
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ textAlign:"center", padding:60, color:T.textMuted }}>Loading…</div>
          ) : (
            <div style={{ overflowX:"auto", borderRadius:10, border:`1px solid ${T.border}`, boxShadow:T.shadow }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead>
                  <tr style={{ background:T.theadBg }}>
                    <th style={{ padding:"10px 12px", borderBottom:`1px solid ${T.border}`, width:36 }}>
                      <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} style={{ cursor:"pointer", accentColor:T.accent, width:15, height:15 }}/>
                    </th>
                    {["Code","Name","Ville","Old X/Y","New X/Y","Gap","Tel CSV","Maps Phone","Status","Score","Actions"].map((h,i) => (
                      <th key={i} style={{ padding:"10px 12px", textAlign:"left", color:T.textMuted, fontSize:11, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:600, whiteSpace:"nowrap", borderBottom:`1px solid ${T.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <tr key={row.code_firme} style={{ borderBottom:`1px solid ${T.border}`, background: selected.has(row.code_firme)?T.rowSel: i%2===0?T.cardBg:T.rowAlt }}>
                      <td style={{ padding:"9px 12px" }}>
                        <input type="checkbox" checked={selected.has(row.code_firme)} onChange={() => toggleOne(row.code_firme)} style={{ cursor:"pointer", accentColor:T.accent, width:15, height:15 }}/>
                      </td>
                      <td style={{ padding:"9px 12px", color:T.textMuted, ...T.mono, fontSize:11, whiteSpace:"nowrap" }}>{row.code_firme}</td>
                      <td style={{ padding:"9px 12px", color:T.textPrimary, maxWidth:200 }}>
                        <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:500 }}>{row.raison_sociale}</div>
                        {row.maps_name && <div style={{ fontSize:11, color:T.textMuted, marginTop:1 }}>↳ {row.maps_name}</div>}
                      </td>
                      <td style={{ padding:"9px 12px", color:T.textSecondary, fontSize:12 }}>{row.ville}</td>
                      <td style={{ padding:"9px 12px", ...T.mono, fontSize:11, color:T.textMuted, whiteSpace:"nowrap" }}>
                        {row.old_x ? <>{row.old_x?.toFixed(4)}<br/>{row.old_y?.toFixed(4)}</> : "—"}
                      </td>
                      <td style={{ padding:"9px 12px", ...T.mono, fontSize:11, whiteSpace:"nowrap" }}>
                        {row.new_x ? <span style={{ color:T.accentDark, fontWeight:500 }}>{parseFloat(row.new_x).toFixed(4)}<br/>{parseFloat(row.new_y).toFixed(4)}</span> : "—"}
                      </td>
                      <td style={{ padding:"9px 12px", ...T.mono, fontSize:12, whiteSpace:"nowrap" }}>
                        {row.gap_km != null ? <span style={{ color: row.gap_km>1?T.redText:row.gap_km>0.2?T.yellowText:T.greenText, fontWeight:600 }}>{parseFloat(row.gap_km).toFixed(3)}km</span> : "—"}
                      </td>
                      <td style={{ padding:"9px 12px", ...T.mono, fontSize:12, color:T.textSecondary, whiteSpace:"nowrap" }}>{row.telephone || "—"}</td>
                      <td style={{ padding:"9px 12px", ...T.mono, fontSize:12, whiteSpace:"nowrap" }}>
                        {row.maps_phone ? <span style={{ color: row.phone_diff?T.redText:T.greenText, fontWeight:500 }}>{row.maps_phone}{row.phone_diff && <span style={{ display:"block", fontSize:10, color:T.redText }}>⚠ DIFF</span>}</span> : (row.status!=="pending"?"—":"")}
                      </td>
                      <td style={{ padding:"9px 12px" }}><Badge status={row.status}/></td>
                      <td style={{ padding:"9px 12px", ...T.mono, fontSize:13, fontWeight:700 }}>
                        {row.score != null ? <span style={{ color: row.score>=80?T.greenText:row.score>=50?T.yellowText:T.redText }}>{row.score}</span> : "—"}
                      </td>
                      <td style={{ padding:"9px 8px", whiteSpace:"nowrap" }}>
                        <button onClick={() => { setRowStatus(row.code_firme,"approved"); navigate("/validated"); }} style={{ background:T.greenBg, border:`1px solid ${T.greenBorder}`, color:T.greenText, padding:"5px 10px", borderRadius:6, fontSize:11, cursor:"pointer", fontWeight:600, marginRight:4 }}>✓ Validate</button>
                        <button onClick={() => { setRowStatus(row.code_firme,"review"); navigate("/review"); }} style={{ background:T.yellowBg, border:`1px solid ${T.yellowBorder}`, color:T.yellowText, padding:"5px 10px", borderRadius:6, fontSize:11, cursor:"pointer", fontWeight:600, marginRight:4 }}>⚠ Review</button>
                        <button onClick={() => runValidation([row])} disabled={running} style={{ background:T.accentBg, border:`1px solid ${T.blueBorder}`, color:T.accent, padding:"5px 8px", borderRadius:6, fontSize:11, cursor:"pointer", marginRight:4 }}>↻</button>
                        <button onClick={() => deleteRow(row.code_firme)} style={{ background:T.redBg, border:`1px solid ${T.redBorder}`, color:T.redText, padding:"5px 8px", borderRadius:6, fontSize:11, cursor:"pointer" }}>✕</button>
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr><td colSpan={12} style={{ padding:60, textAlign:"center", color:T.textMuted, fontSize:14 }}>
                      {rows.length === 0 ? "No pharmacies yet — go to Import tab" : "No rows match this filter"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {subTab === "import" && (
          <div style={{ maxWidth:600 }}>
            <div style={{ background:T.blueBg, border:`1px solid ${T.blueBorder}`, borderRadius:10, padding:"16px 20px", marginBottom:24, lineHeight:2, fontSize:13, color:T.blueText }}>
              <strong>ℹ How import works</strong><br/>
              • New pharmacies → added as pending<br/>
              • Existing ones (same Code firme) → info updated, validation kept<br/>
              • Safe to re-upload multiple times
            </div>
            <div onClick={() => fileRef.current.click()} style={{ border:`2px dashed ${T.border}`, borderRadius:12, padding:"60px 20px", textAlign:"center", cursor:"pointer", background:T.cardBg }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor=T.accent}
              onMouseLeave={(e) => e.currentTarget.style.borderColor=T.border}>
              <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
              <div style={{ fontSize:15, color:T.textSecondary, fontWeight:500 }}>Click to upload CSV</div>
              <div style={{ fontSize:12, color:T.textMuted, marginTop:8 }}>Required: Code firme · Raison Sociale · Ville · Téléphone · X · Y</div>
              {rows.length > 0 && <div style={{ marginTop:16, fontSize:13, color:T.greenText, fontWeight:600 }}>✓ {rows.length} pharmacies in database</div>}
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:"none" }} onChange={handleFile}/>
          </div>
        )}

        {subTab === "settings" && (
          <div style={{ maxWidth:520 }}>
            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:13, color:T.textLabel, fontWeight:600, display:"block", marginBottom:8 }}>Google Places API Key</label>
              <div style={{ display:"flex", gap:8 }}>
                <input type="password" placeholder="AIza…" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  style={{ flex:1, padding:"11px 14px", background:T.inputBg, border:`1px solid ${T.border}`, borderRadius:8, color:T.textPrimary, fontSize:13, outline:"none" }}
                  onFocus={(e) => e.target.style.borderColor=T.accent} onBlur={(e) => e.target.style.borderColor=T.border}/>
                <button onClick={() => { localStorage.setItem("gplaceskey", apiKey); setSaveMsg("Saved!"); setTimeout(() => setSaveMsg(""), 2000); }}
                  style={{ padding:"11px 20px", background:T.accent, border:"none", borderRadius:8, color:"#fff", fontSize:13, cursor:"pointer", fontWeight:600 }}>
                  {saveMsg || "Save"}
                </button>
              </div>
              <div style={{ fontSize:12, color:T.textMuted, marginTop:8, lineHeight:1.8 }}>
                Stored in your browser only. Enable "Places API (New)" at console.cloud.google.com
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
