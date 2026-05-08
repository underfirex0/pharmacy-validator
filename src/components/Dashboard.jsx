import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { searchGooglePlaces } from "../lib/places";
import { haversineKm, normalizePhone, scoreCandidate, decideStatus, parseCSV } from "../lib/utils";
import NavBar from "./NavBar";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

const ST = {
  approved:         { bg:"#0a2a0a",  text:"#22c55e", label:"✓ Approved" },
  manual_validated: { bg:"#0a2a14",  text:"#34d399", label:"✓ Validated" },
  review:           { bg:"#3a2e00",  text:"#fbbf24", label:"⚠ Review" },
  notfound:         { bg:"#3a0f0f",  text:"#f87171", label:"✗ Not found" },
  pending:          { bg:"#1a1a2e",  text:"#818cf8", label:"⋯ Pending" },
  running:          { bg:"#0f1f3a",  text:"#60a5fa", label:"↻ Running" },
  error:            { bg:"#2a1010",  text:"#f87171", label:"! Error" },
};

function Badge({ status }) {
  const s = ST[status] || ST.pending;
  return <span style={{ background:s.bg, color:s.text, padding:"2px 10px", borderRadius:6, fontSize:11, ...mono, fontWeight:500, whiteSpace:"nowrap" }}>{s.label}</span>;
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
    const { data } = await supabase.from("pharmacies").select("*").order("imported_at", { ascending: false });
    setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadRows(); }, [loadRows]);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const tryRead = (enc) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const text = ev.target.result;
        if (enc === "utf-8" && (text.includes("Ã©") || text.includes("Ã"))) { tryRead("windows-1252"); return; }
        const parsed = parseCSV(text);
        if (!parsed.length) { alert("No rows found."); return; }
        const toInsert = parsed.map((r) => ({
          code_firme: r.code_firme, raison_sociale: r.raison_sociale,
          ville: r.ville, telephone: r.telephone,
          old_x: r.old_x, old_y: r.old_y, status: "pending",
        }));
        const { error } = await supabase.from("pharmacies").upsert(toInsert, { onConflict: "code_firme", ignoreDuplicates: false });
        if (error) { alert("Import error: " + error.message); return; }
        await loadRows();
        setSubTab("dashboard");
        e.target.value = "";
        alert(`✓ ${parsed.length} pharmacies imported`);
      };
      reader.readAsText(file, enc);
    };
    tryRead("utf-8");
  };

  // Auto-validate via API — only when user explicitly clicks the button
  const runValidation = useCallback(async (targetRows) => {
    if (!apiKey.trim()) { alert("Enter your Google Places API key in Settings."); return; }
    const toProcess = targetRows || rows.filter((r) => r.status === "pending" || r.status === "error");
    if (!toProcess.length) { alert("No pending rows to process."); return; }
    setRunning(true); abortRef.current = false;
    const codes = new Set(toProcess.map((r) => r.code_firme));
    setRows((prev) => prev.map((r) => codes.has(r.code_firme) ? { ...r, status: "running" } : r));
    for (let i = 0; i < toProcess.length; i++) {
      if (abortRef.current) break;
      const row = toProcess[i];
      try {
        const candidates = await searchGooglePlaces(apiKey, row);
        let update;
        if (!candidates.length) {
          update = { status:"notfound", score:0, notes:"No results", validated_at: new Date().toISOString() };
        } else {
          const scored = candidates.map((c) => scoreCandidate(c, row)).sort((a,b) => b.score - a.score);
          const best = scored[0];
          const dist = (row.old_x && row.old_y && best.candidate.lat && best.candidate.lng)
            ? haversineKm(row.old_y, row.old_x, best.candidate.lat, best.candidate.lng) : null;
          // API result stays as "approved" or "review" — NOT auto-sent to validated page
          // User must manually click Validate to move to validated page
          const autoStatus = decideStatus(best, row, dist);
          const cp = normalizePhone(best.candidate.phone), rp = normalizePhone(row.telephone);
          update = {
            status: autoStatus, score: best.score,
            new_x: best.candidate.lng, new_y: best.candidate.lat,
            gap_km: dist !== null ? parseFloat(dist.toFixed(3)) : null,
            phone_diff: cp && rp && cp !== rp,
            maps_phone: best.candidate.phone, maps_name: best.candidate.name,
            maps_address: best.candidate.address, validated_at: new Date().toISOString(), notes: null,
          };
        }
        const { error: dbErr } = await supabase.from("pharmacies").update(update).eq("code_firme", row.code_firme);
        if (dbErr) {
          console.error("DB save failed for", row.code_firme, dbErr.message);
          await new Promise((r) => setTimeout(r, 800));
          await supabase.from("pharmacies").update(update).eq("code_firme", row.code_firme);
        }
        setRows((prev) => prev.map((r) => r.code_firme === row.code_firme ? { ...r, ...update } : r));
      } catch (err) {
        const update = { status:"error", score:0, notes: err.message };
        await supabase.from("pharmacies").update(update).eq("code_firme", row.code_firme);
        setRows((prev) => prev.map((r) => r.code_firme === row.code_firme ? { ...r, ...update } : r));
      }
      setProgress(Math.round(((i+1)/toProcess.length)*100));
      await new Promise((res) => setTimeout(res, 350));
    }
    setRunning(false);
  }, [apiKey, rows]);

  // Single row manual action
  const setRowStatus = async (code_firme, status) => {
    await supabase.from("pharmacies").update({ status, validated_at: new Date().toISOString() }).eq("code_firme", code_firme);
    setRows((prev) => prev.map((r) => r.code_firme === code_firme ? { ...r, status } : r));
    setSelected((prev) => { const n = new Set(prev); n.delete(code_firme); return n; });
  };

  // Bulk actions on selected rows
  const bulkAction = async (status) => {
    if (!selected.size) return;
    const codes = [...selected];
    await supabase.from("pharmacies").update({ status, validated_at: new Date().toISOString() }).in("code_firme", codes);
    setRows((prev) => prev.map((r) => selected.has(r.code_firme) ? { ...r, status } : r));
    setSelected(new Set());
    if (status === "approved" || status === "manual_validated") navigate("/validated");
    else if (status === "review") navigate("/review");
  };

  const deleteRow = async (code_firme) => {
    await supabase.from("pharmacies").delete().eq("code_firme", code_firme);
    setRows((prev) => prev.filter((r) => r.code_firme !== code_firme));
    setSelected((prev) => { const n = new Set(prev); n.delete(code_firme); return n; });
  };

  const clearAll = async () => {
    if (!window.confirm("Delete ALL pharmacies?")) return;
    await supabase.from("pharmacies").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setRows([]); setSelected(new Set());
  };

  const filteredRows = rows.filter((r) => {
    const mf = filter === "all" || r.status === filter;
    const q  = search.toLowerCase();
    const ms = !q || r.raison_sociale?.toLowerCase().includes(q) || r.code_firme?.toLowerCase().includes(q) || r.ville?.toLowerCase().includes(q);
    return mf && ms;
  });

  // Select/deselect
  const toggleOne = (code) => setSelected((prev) => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const toggleAll = () => {
    const allCodes = filteredRows.map((r) => r.code_firme);
    const allSelected = allCodes.every((c) => selected.has(c));
    setSelected(allSelected ? new Set() : new Set(allCodes));
  };
  const allChecked = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.code_firme));
  const someChecked = filteredRows.some((r) => selected.has(r.code_firme));

  const stats = {
    total:    rows.length,
    approved: rows.filter((r) => r.status === "approved" || r.status === "manual_validated").length,
    review:   rows.filter((r) => r.status === "review").length,
    notfound: rows.filter((r) => r.status === "notfound").length,
    pending:  rows.filter((r) => r.status === "pending").length,
    error:    rows.filter((r) => r.status === "error").length,
  };

  const card = { background:"#0c0f1c", border:"1px solid #1e2236", borderRadius:8, padding:"12px 18px" };
  const btn  = (on, color) => ({ background: on?"#1a2540":"transparent", border:`1px solid ${on?(color||"#2a4a8e"):"#1e2236"}`, color: on?(color||"#60a5fa"):"#4a5068", padding:"6px 14px", borderRadius:6, fontSize:12, cursor:"pointer", ...mono });

  return (
    <div style={{ fontFamily:"'IBM Plex Sans',sans-serif", background:"#0a0c14", minHeight:"100vh", color:"#c8ccd8", paddingBottom:60 }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      <NavBar user={user} counts={{ "/validated": stats.approved, "/review": stats.review }} />

      {/* Sub-tabs */}
      <div style={{ borderBottom:"1px solid #1e2236", padding:"0 28px", display:"flex", gap:4 }}>
        {["dashboard","import","settings"].map((t) => (
          <button key={t} onClick={() => setSubTab(t)} style={{ background:"transparent", border:"none", borderBottom: subTab===t?"2px solid #60a5fa":"2px solid transparent", color: subTab===t?"#60a5fa":"#4a5068", padding:"12px 16px", fontSize:12, cursor:"pointer", ...mono, textTransform:"capitalize" }}>{t}</button>
        ))}
      </div>

      <div style={{ padding:"24px 28px" }}>
        {subTab === "dashboard" && (<>

          {/* Stats */}
          <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
            {[["Total",stats.total,"#8890a8","all"],["Validated",stats.approved,"#22c55e","approved"],["Review",stats.review,"#fbbf24","review"],["Not found",stats.notfound,"#f87171","notfound"],["Pending",stats.pending,"#818cf8","pending"],["Error",stats.error,"#f87171","error"]].map(([label,val,color,f]) => (
              <div key={label} style={{ ...card, minWidth:90, cursor:"pointer", outline: filter===f?"1px solid #2a4a8e":"none" }} onClick={() => setFilter(f)}>
                <div style={{ fontSize:10, color:"#3a4060", ...mono, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:22, fontWeight:600, color }}>{val}</div>
              </div>
            ))}
            {running && (
              <div style={{ ...card, minWidth:160 }}>
                <div style={{ fontSize:10, color:"#3a4060", ...mono, marginBottom:6 }}>API PROGRESS</div>
                <div style={{ background:"#1e2236", borderRadius:4, height:5 }}>
                  <div style={{ background:"#3a7ad4", borderRadius:4, height:5, width:`${progress}%`, transition:"width 0.3s" }}/>
                </div>
                <div style={{ fontSize:11, color:"#60a5fa", ...mono, marginTop:4 }}>{progress}%</div>
              </div>
            )}
          </div>

          {/* Toolbar */}
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
            <button onClick={() => runValidation()} disabled={running} style={{ background: running?"#0a1020":"linear-gradient(135deg,#1a3a6e,#0f2a55)", border:`1px solid ${running?"#1e2236":"#2a5a9e"}`, color: running?"#3a5070":"#90c0f0", padding:"8px 18px", borderRadius:7, fontSize:12, cursor: running?"not-allowed":"pointer", ...mono }}>
              {running ? `API running… ${progress}%` : `⚙ Auto-validate via API (${stats.pending} pending)`}
            </button>
            {running && <button onClick={() => { abortRef.current=true; setRunning(false); }} style={{ background:"#1a0f0f", border:"1px solid #4a1010", color:"#f87171", padding:"8px 14px", borderRadius:7, fontSize:12, cursor:"pointer", ...mono }}>■ Stop</button>}

            {/* Bulk actions — shown when rows are selected */}
            {selected.size > 0 && (
              <div style={{ display:"flex", gap:6, alignItems:"center", background:"#0c0f1c", border:"1px solid #2a4a8e", borderRadius:8, padding:"6px 14px" }}>
                <span style={{ fontSize:12, color:"#60a5fa", ...mono, marginRight:6 }}>{selected.size} selected</span>
                <button onClick={() => bulkAction("approved")} style={{ background:"#0a1f0a", border:"1px solid #1a4a1a", color:"#4ade80", padding:"5px 12px", borderRadius:6, fontSize:11, cursor:"pointer", ...mono }}>✓ Bulk validate</button>
                <button onClick={() => bulkAction("review")}   style={{ background:"#1f1a00", border:"1px solid #4a3a00", color:"#fbbf24", padding:"5px 12px", borderRadius:6, fontSize:11, cursor:"pointer", ...mono }}>⚠ Bulk to review</button>
                <button onClick={() => setSelected(new Set())} style={{ background:"transparent", border:"1px solid #2a3050", color:"#4a5068", padding:"5px 10px", borderRadius:6, fontSize:11, cursor:"pointer", ...mono }}>✕ Clear</button>
              </div>
            )}

            <button onClick={clearAll} style={{ background:"#1a0808", border:"1px solid #3a1010", color:"#f87171", padding:"8px 14px", borderRadius:7, fontSize:12, cursor:"pointer", ...mono, marginLeft:"auto" }}>🗑 Clear all</button>
          </div>

          {/* Search + filter */}
          <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, ville…"
              style={{ background:"#0c0f1c", border:"1px solid #1e2236", borderRadius:7, color:"#c8ccd8", padding:"7px 12px", fontSize:12, ...mono, width:240, outline:"none" }}/>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {["all","approved","manual_validated","review","notfound","pending","error"].map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{ ...btn(filter===f), padding:"5px 11px", fontSize:11, textTransform:"capitalize" }}>
                  {f === "manual_validated" ? "manual" : f}
                </button>
              ))}
            </div>
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
                    <th style={{ padding:"9px 10px", borderBottom:"1px solid #1e2236", width:36 }}>
                      <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                        onChange={toggleAll} style={{ cursor:"pointer", accentColor:"#60a5fa" }}/>
                    </th>
                    {["Code","Name","Ville","Old X/Y","New X/Y","Gap","Tel CSV","Maps Phone","Status","Score","Actions"].map((h,i) => (
                      <th key={i} style={{ padding:"9px 10px", textAlign:"left", color:"#2a3060", ...mono, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:500, whiteSpace:"nowrap", borderBottom:"1px solid #1e2236" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <tr key={row.code_firme} style={{ borderBottom:"1px solid #0d1020", background: selected.has(row.code_firme)?"#0c1428": i%2===0?"#09090f":"transparent" }}>
                      <td style={{ padding:"8px 10px" }}>
                        <input type="checkbox" checked={selected.has(row.code_firme)} onChange={() => toggleOne(row.code_firme)} style={{ cursor:"pointer", accentColor:"#60a5fa" }}/>
                      </td>
                      <td style={{ padding:"8px 10px", color:"#4a6090", ...mono, whiteSpace:"nowrap", fontSize:11 }}>{row.code_firme}</td>
                      <td style={{ padding:"8px 10px", color:"#b0b8d0", maxWidth:180 }}>
                        <div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{row.raison_sociale}</div>
                        {row.maps_name && <div style={{ fontSize:10, color:"#4a5068", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>↳ {row.maps_name}</div>}
                      </td>
                      <td style={{ padding:"8px 10px", color:"#8890a8", whiteSpace:"nowrap", fontSize:11 }}>{row.ville}</td>
                      <td style={{ padding:"8px 10px", ...mono, fontSize:10, color:"#4a5068", whiteSpace:"nowrap" }}>
                        {row.old_x && row.old_y ? <>{row.old_x?.toFixed(4)}<br/>{row.old_y?.toFixed(4)}</> : "—"}
                      </td>
                      <td style={{ padding:"8px 10px", ...mono, fontSize:10, whiteSpace:"nowrap" }}>
                        {row.new_x ? <span style={{ color:"#60a5fa" }}>{parseFloat(row.new_x).toFixed(4)}<br/>{parseFloat(row.new_y).toFixed(4)}</span> : "—"}
                      </td>
                      <td style={{ padding:"8px 10px", ...mono, whiteSpace:"nowrap" }}>
                        {row.gap_km != null ? <span style={{ color: row.gap_km>1?"#f87171":row.gap_km>0.2?"#fbbf24":"#4ade80" }}>{parseFloat(row.gap_km).toFixed(3)}km</span> : "—"}
                      </td>
                      <td style={{ padding:"8px 10px", ...mono, fontSize:11, color:"#8890a8", whiteSpace:"nowrap" }}>{row.telephone || "—"}</td>
                      <td style={{ padding:"8px 10px", ...mono, fontSize:11, whiteSpace:"nowrap" }}>
                        {row.maps_phone ? <span style={{ color: row.phone_diff?"#f87171":"#4ade80" }}>{row.maps_phone}{row.phone_diff && <span style={{ display:"block", fontSize:9, color:"#f87171" }}>⚠ DIFF</span>}</span> : (row.status !== "pending" ? "—" : "")}
                      </td>
                      <td style={{ padding:"8px 10px" }}><Badge status={row.status}/></td>
                      <td style={{ padding:"8px 10px", ...mono, fontSize:12 }}>
                        {row.score != null ? <span style={{ color: row.score>=80?"#4ade80":row.score>=50?"#fbbf24":"#f87171" }}>{row.score}</span> : "—"}
                      </td>
                      <td style={{ padding:"8px 6px", whiteSpace:"nowrap" }}>
                        <button onClick={() => { setRowStatus(row.code_firme, "approved"); navigate("/validated"); }} style={{ background:"#0a1f0a", border:"1px solid #1a4a1a", color:"#4ade80", padding:"4px 9px", borderRadius:5, fontSize:10, cursor:"pointer", ...mono }}>✓ Validate</button>
                        <button onClick={() => { setRowStatus(row.code_firme, "review"); navigate("/review"); }} style={{ background:"#1f1a00", border:"1px solid #4a3a00", color:"#fbbf24", padding:"4px 9px", borderRadius:5, fontSize:10, cursor:"pointer", ...mono, marginLeft:4 }}>⚠ Review</button>
                        <button onClick={() => runValidation([row])} disabled={running} style={{ background:"transparent", border:"1px solid #2a3050", color:"#4a6090", padding:"4px 7px", borderRadius:5, fontSize:10, cursor:"pointer", ...mono, marginLeft:4 }}>↻</button>
                        <button onClick={() => deleteRow(row.code_firme)} style={{ background:"transparent", border:"1px solid #3a1010", color:"#f87171", padding:"4px 7px", borderRadius:5, fontSize:10, cursor:"pointer", ...mono, marginLeft:4 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr><td colSpan={12} style={{ padding:40, textAlign:"center", color:"#2a3050", fontSize:12 }}>
                      {rows.length === 0 ? "No pharmacies yet — go to Import tab" : "No rows match this filter"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {subTab === "import" && (
          <div style={{ maxWidth:580 }}>
            <div style={{ background:"#0c0f1c", border:"1px solid #1e2236", borderRadius:8, padding:"14px 18px", marginBottom:20, lineHeight:1.9, fontSize:12, color:"#6a7090" }}>
              <div style={{ color:"#4ade80", ...mono, fontSize:11, marginBottom:8 }}>ℹ HOW IMPORT WORKS</div>
              • New pharmacies → added as pending<br/>
              • Existing ones (same Code firme) → info updated, validation kept<br/>
              • Safe to re-upload multiple times
            </div>
            <div onClick={() => fileRef.current.click()} style={{ border:"1px dashed #2a3050", borderRadius:10, padding:"50px 20px", textAlign:"center", cursor:"pointer", background:"#0c0f1c", marginBottom:20 }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor="#2a4a8e"}
              onMouseLeave={(e) => e.currentTarget.style.borderColor="#2a3050"}>
              <div style={{ fontSize:36, marginBottom:10 }}>📋</div>
              <div style={{ fontSize:13, color:"#6a7090" }}>Click to upload CSV</div>
              <div style={{ fontSize:11, color:"#3a4060", marginTop:6 }}>Required: Code firme · Raison Sociale · Ville · Téléphone · X · Y</div>
              {rows.length > 0 && <div style={{ marginTop:14, fontSize:12, color:"#4ade80", ...mono }}>✓ {rows.length} pharmacies in database</div>}
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:"none" }} onChange={handleFile}/>
          </div>
        )}

        {subTab === "settings" && (
          <div style={{ maxWidth:520 }}>
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:12, color:"#4a5068", marginBottom:8, ...mono, textTransform:"uppercase", letterSpacing:"0.04em" }}>Google Places API Key</div>
              <div style={{ display:"flex", gap:8 }}>
                <input type="password" placeholder="AIza…" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                  style={{ flex:1, padding:"10px 14px", background:"#0c0f1c", border:"1px solid #1e2236", borderRadius:8, color:"#c8ccd8", ...mono, fontSize:13, outline:"none" }}/>
                <button onClick={() => { localStorage.setItem("gplaceskey", apiKey); setSaveMsg("Saved!"); setTimeout(() => setSaveMsg(""), 2000); }}
                  style={{ padding:"10px 18px", background:"#0f2040", border:"1px solid #2a4a8e", borderRadius:8, color:"#60a5fa", fontSize:12, cursor:"pointer", ...mono }}>
                  {saveMsg || "Save"}
                </button>
              </div>
              <div style={{ fontSize:11, color:"#3a4060", marginTop:8, lineHeight:1.8 }}>
                Stored in your browser only. Enable "Places API (New)" at console.cloud.google.com
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
