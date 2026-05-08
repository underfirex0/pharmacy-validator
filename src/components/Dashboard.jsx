import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { searchGooglePlaces } from "../lib/places";
import { haversineKm, normalizePhone, scoreCandidate, decideStatus, parseCSV, exportCSV, exportXLSX } from "../lib/utils";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

const ST = {
  approved: { bg:"#0a2a0a", text:"#22c55e", label:"✓ Approved" },
  review:   { bg:"#3a2e00", text:"#fbbf24", label:"⚠ Review" },
  notfound: { bg:"#3a0f0f", text:"#f87171", label:"✗ Not found" },
  pending:  { bg:"#1a1a2e", text:"#818cf8", label:"⋯ Pending" },
  running:  { bg:"#0f1f3a", text:"#60a5fa", label:"↻ Running" },
  error:    { bg:"#2a1010", text:"#f87171", label:"! Error" },
};

function Badge({ status }) {
  const s = ST[status] || ST.pending;
  return <span style={{ background:s.bg, color:s.text, padding:"2px 10px", borderRadius:6, fontSize:11, ...mono, fontWeight:500, whiteSpace:"nowrap" }}>{s.label}</span>;
}

export default function Dashboard({ user }) {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [running, setRunning]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [tab, setTab]           = useState("dashboard");
  const [filter, setFilter]     = useState("all");
  const [search, setSearch]     = useState("");
  const [apiKey, setApiKey]     = useState(() => localStorage.getItem("gplaceskey") || "");
  const [saveMsg, setSaveMsg]   = useState("");
  const fileRef  = useRef();
  const abortRef = useRef(false);

  useEffect(() => { if (apiKey) localStorage.setItem("gplaceskey", apiKey); }, [apiKey]);

  // Load from Supabase
  const loadRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pharmacies")
      .select("*")
      .order("imported_at", { ascending: false });
    if (!error) setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadRows(); }, [loadRows]);

  // File upload
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const tryRead = (enc) => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const text = ev.target.result;
        if (enc === "utf-8" && (text.includes("Ã©") || text.includes("Ã"))) {
          tryRead("windows-1252"); return;
        }
        const parsed = parseCSV(text);
        if (!parsed.length) { alert("No rows found — check CSV format."); return; }

        // Upsert into Supabase (on conflict code_firme + created_by → update basic info only)
        const toInsert = parsed.map((r) => ({
          code_firme:     r.code_firme,
          raison_sociale: r.raison_sociale,
          ville:          r.ville,
          telephone:      r.telephone,
          old_x:          r.old_x,
          old_y:          r.old_y,
          status:         "pending",
          created_by:     user.id,
        }));

        const { error } = await supabase
          .from("pharmacies")
          .upsert(toInsert, { onConflict: "code_firme", ignoreDuplicates: false });

        if (error) { alert("Import error: " + error.message); return; }
        await loadRows();
        setTab("dashboard");
        e.target.value = "";
        alert(`✓ ${parsed.length} pharmacies imported/updated`);
      };
      reader.readAsText(file, enc);
    };
    tryRead("utf-8");
  };

  // Validate
  const runValidation = useCallback(async (targetRows) => {
    if (!apiKey.trim()) { alert("Enter your Google Places API key in Settings."); return; }
    const toProcess = targetRows || rows.filter((r) => r.status === "pending" || r.status === "error");
    if (!toProcess.length) { alert("No pending rows to process."); return; }
    setRunning(true); abortRef.current = false;

    // Mark as running in UI
    const codes = new Set(toProcess.map((r) => r.code_firme));
    setRows((prev) => prev.map((r) => codes.has(r.code_firme) ? { ...r, status: "running" } : r));

    for (let i = 0; i < toProcess.length; i++) {
      if (abortRef.current) break;
      const row = toProcess[i];
      try {
        const candidates = await searchGooglePlaces(apiKey, row);
        let update;
        if (!candidates.length) {
          update = { status:"notfound", score:0, notes:"No results from API", validated_at: new Date().toISOString() };
        } else {
          const scored = candidates.map((c) => scoreCandidate(c, row)).sort((a,b) => b.score - a.score);
          const best = scored[0];
          const dist = (row.old_x && row.old_y && best.candidate.lat && best.candidate.lng)
            ? haversineKm(row.old_y, row.old_x, best.candidate.lat, best.candidate.lng) : null;
          const status = decideStatus(best, row, dist);
          const phoneDiff = (() => {
            const cp = normalizePhone(best.candidate.phone);
            const rp = normalizePhone(row.telephone);
            return cp && rp && cp !== rp;
          })();
          update = {
            status,
            score:       best.score,
            new_x:       best.candidate.lng,
            new_y:       best.candidate.lat,
            gap_km:      dist !== null ? parseFloat(dist.toFixed(3)) : null,
            phone_diff:  phoneDiff,
            maps_phone:  best.candidate.phone,
            maps_name:   best.candidate.name,
            maps_address:best.candidate.address,
            validated_at:new Date().toISOString(),
            notes:       null,
          };
        }
        // Update Supabase
        await supabase.from("pharmacies").update(update).eq("code_firme", row.code_firme).eq("created_by", user.id);
        setRows((prev) => prev.map((r) => r.code_firme === row.code_firme ? { ...r, ...update } : r));
      } catch (err) {
        const update = { status:"error", score:0, notes: err.message };
        await supabase.from("pharmacies").update(update).eq("code_firme", row.code_firme).eq("created_by", user.id);
        setRows((prev) => prev.map((r) => r.code_firme === row.code_firme ? { ...r, ...update } : r));
      }
      setProgress(Math.round(((i+1)/toProcess.length)*100));
      await new Promise((res) => setTimeout(res, 220));
    }
    setRunning(false);
  }, [apiKey, rows, user.id]);

  const deleteRow = async (code_firme) => {
    await supabase.from("pharmacies").delete().eq("code_firme", code_firme).eq("created_by", user.id);
    setRows((prev) => prev.filter((r) => r.code_firme !== code_firme));
  };

  const clearAll = async () => {
    if (!window.confirm("Delete ALL pharmacies from your database?")) return;
    await supabase.from("pharmacies").delete().eq("created_by", user.id);
    setRows([]);
  };

  const signOut = () => supabase.auth.signOut();

  const filteredRows = rows.filter((r) => {
    const mf = filter === "all" || r.status === filter;
    const q  = search.toLowerCase();
    const ms = !q || r.raison_sociale?.toLowerCase().includes(q) || r.code_firme?.toLowerCase().includes(q) || r.ville?.toLowerCase().includes(q);
    return mf && ms;
  });

  const stats = {
    total:    rows.length,
    approved: rows.filter((r) => r.status === "approved").length,
    review:   rows.filter((r) => r.status === "review").length,
    notfound: rows.filter((r) => r.status === "notfound").length,
    pending:  rows.filter((r) => r.status === "pending").length,
    error:    rows.filter((r) => r.status === "error").length,
  };

  const card = { background:"#0c0f1c", border:"1px solid #1e2236", borderRadius:8, padding:"12px 18px" };
  const btn  = (on) => ({ background: on?"#1a2540":"transparent", border:`1px solid ${on?"#2a4a8e":"#1e2236"}`, color: on?"#60a5fa":"#4a5068", padding:"6px 14px", borderRadius:6, fontSize:12, cursor:"pointer", ...mono });

  return (
    <div style={{ fontFamily:"'IBM Plex Sans',sans-serif", background:"#0a0c14", minHeight:"100vh", color:"#c8ccd8", paddingBottom:60 }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{ borderBottom:"1px solid #1e2236", padding:"14px 28px", display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:34, height:34, borderRadius:8, background:"#0f2040", border:"1px solid #2a4a8e", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>⚕</div>
        <div>
          <div style={{ fontSize:15, fontWeight:600, color:"#e8eaf0" }}>Pharmacy Geo Validator</div>
          <div style={{ fontSize:10, color:"#3a4060", ...mono }}>{rows.length} pharmacies · {user.email}</div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          {["dashboard","import","settings"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ ...btn(tab===t), textTransform:"capitalize" }}>{t}</button>
          ))}
          <button onClick={signOut} style={{ ...btn(false), color:"#f87171", borderColor:"#3a1010" }}>Sign out</button>
        </div>
      </div>

      <div style={{ padding:"24px 28px" }}>

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (<>
          <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
            {[["Total",stats.total,"#8890a8","all"],["Approved",stats.approved,"#22c55e","approved"],["Review",stats.review,"#fbbf24","review"],["Not found",stats.notfound,"#f87171","notfound"],["Pending",stats.pending,"#818cf8","pending"],["Error",stats.error,"#f87171","error"]].map(([label,val,color,f]) => (
              <div key={label} style={{ ...card, minWidth:90, cursor:"pointer", outline: filter===f?"1px solid #2a4a8e":"none" }} onClick={() => setFilter(f)}>
                <div style={{ fontSize:10, color:"#3a4060", ...mono, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:22, fontWeight:600, color }}>{val}</div>
              </div>
            ))}
            {running && (
              <div style={{ ...card, minWidth:160 }}>
                <div style={{ fontSize:10, color:"#3a4060", ...mono, marginBottom:6 }}>PROGRESS</div>
                <div style={{ background:"#1e2236", borderRadius:4, height:5 }}>
                  <div style={{ background:"#3a7ad4", borderRadius:4, height:5, width:`${progress}%`, transition:"width 0.3s" }}/>
                </div>
                <div style={{ fontSize:11, color:"#60a5fa", ...mono, marginTop:4 }}>{progress}%</div>
              </div>
            )}
          </div>

          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
            <button onClick={() => runValidation()} disabled={running} style={{ background: running?"#0a1020":"linear-gradient(135deg,#1a3a6e,#0f2a55)", border:`1px solid ${running?"#1e2236":"#2a5a9e"}`, color: running?"#3a5070":"#90c0f0", padding:"8px 18px", borderRadius:7, fontSize:12, cursor: running?"not-allowed":"pointer", ...mono }}>
              {running ? `Running… ${progress}%` : `▶ Run pending (${stats.pending})`}
            </button>
            {running && <button onClick={() => { abortRef.current=true; setRunning(false); }} style={{ background:"#1a0f0f", border:"1px solid #4a1010", color:"#f87171", padding:"8px 14px", borderRadius:7, fontSize:12, cursor:"pointer", ...mono }}>■ Stop</button>}
            <button onClick={() => exportCSV(filteredRows)} style={{ background:"#0f1a10", border:"1px solid #1a3a1a", color:"#4ade80", padding:"8px 14px", borderRadius:7, fontSize:12, cursor:"pointer", ...mono }}>↓ CSV ({filteredRows.length})</button>
            <button onClick={() => exportXLSX(filteredRows)} style={{ background:"#0f1a10", border:"1px solid #1a3a1a", color:"#4ade80", padding:"8px 14px", borderRadius:7, fontSize:12, cursor:"pointer", ...mono }}>↓ Excel ({filteredRows.length})</button>
            <button onClick={clearAll} style={{ background:"#1a0808", border:"1px solid #3a1010", color:"#f87171", padding:"8px 14px", borderRadius:7, fontSize:12, cursor:"pointer", ...mono, marginLeft:"auto" }}>🗑 Clear all</button>
          </div>

          <div style={{ display:"flex", gap:8, marginBottom:14, alignItems:"center", flexWrap:"wrap" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code, ville…"
              style={{ background:"#0c0f1c", border:"1px solid #1e2236", borderRadius:7, color:"#c8ccd8", padding:"7px 12px", fontSize:12, ...mono, width:240, outline:"none" }}/>
            <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {["all","approved","review","notfound","pending","error"].map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{ ...btn(filter===f), padding:"5px 11px", fontSize:11, textTransform:"capitalize" }}>{f}</button>
              ))}
            </div>
            <span style={{ fontSize:11, color:"#3a4060", ...mono }}>{filteredRows.length} rows</span>
          </div>

          {loading ? (
            <div style={{ textAlign:"center", padding:60, color:"#3a4060", ...mono }}>Loading from database…</div>
          ) : (
            <div style={{ overflowX:"auto", borderRadius:8, border:"1px solid #1e2236" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"#0c0f1c" }}>
                    {["Code","Name","Ville","Old X/Y","New X/Y","Gap","Tel CSV","Maps Phone","Status","Score",""].map((h,i) => (
                      <th key={i} style={{ padding:"9px 10px", textAlign:"left", color:"#2a3060", ...mono, fontSize:10, textTransform:"uppercase", letterSpacing:"0.05em", fontWeight:500, whiteSpace:"nowrap", borderBottom:"1px solid #1e2236" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <tr key={row.code_firme} style={{ borderBottom:"1px solid #0d1020", background: i%2===0?"#09090f":"transparent" }}>
                      <td style={{ padding:"8px 10px", color:"#4a6090", ...mono, whiteSpace:"nowrap", fontSize:11 }}>{row.code_firme}</td>
                      <td style={{ padding:"8px 10px", color:"#b0b8d0", maxWidth:200 }}>
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
                        {row.maps_phone
                          ? <span style={{ color: row.phone_diff?"#f87171":"#4ade80" }}>{row.maps_phone}{row.phone_diff && <span style={{ display:"block", fontSize:9, color:"#f87171" }}>⚠ DIFF</span>}</span>
                          : (row.status !== "pending" ? "—" : "")}
                      </td>
                      <td style={{ padding:"8px 10px" }}><Badge status={row.status}/></td>
                      <td style={{ padding:"8px 10px", ...mono, fontSize:12 }}>
                        {row.score != null ? <span style={{ color: row.score>=80?"#4ade80":row.score>=50?"#fbbf24":"#f87171" }}>{row.score}</span> : "—"}
                      </td>
                      <td style={{ padding:"8px 10px", whiteSpace:"nowrap" }}>
                        <button onClick={() => runValidation([row])} disabled={running} title="Re-validate" style={{ background:"transparent", border:"1px solid #2a3050", color:"#4a6090", padding:"3px 8px", borderRadius:5, fontSize:10, cursor:"pointer", ...mono }}>↻</button>
                        <button onClick={() => deleteRow(row.code_firme)} title="Delete" style={{ background:"transparent", border:"1px solid #3a1010", color:"#f87171", padding:"3px 8px", borderRadius:5, fontSize:10, cursor:"pointer", ...mono, marginLeft:4 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr><td colSpan={11} style={{ padding:40, textAlign:"center", color:"#2a3050", fontSize:12 }}>
                      {rows.length === 0 ? "No pharmacies yet — go to Import to upload your CSV" : "No rows match this filter"}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {/* ── IMPORT ── */}
        {tab === "import" && (
          <div style={{ maxWidth:580 }}>
            <div style={{ ...card, marginBottom:20, lineHeight:1.9, fontSize:12, color:"#6a7090" }}>
              <div style={{ color:"#4ade80", ...mono, fontSize:11, marginBottom:8 }}>ℹ HOW IMPORT WORKS</div>
              • New pharmacies → added to your database as pending<br/>
              • Existing ones (same Code firme) → basic info updated, validation results kept<br/>
              • Safe to re-upload the same file multiple times<br/>
              • Data is stored in Supabase — accessible from any device
            </div>
            <div onClick={() => fileRef.current.click()} style={{ border:"1px dashed #2a3050", borderRadius:10, padding:"50px 20px", textAlign:"center", cursor:"pointer", background:"#0c0f1c", marginBottom:20 }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor="#2a4a8e"}
              onMouseLeave={(e) => e.currentTarget.style.borderColor="#2a3050"}>
              <div style={{ fontSize:36, marginBottom:10 }}>📋</div>
              <div style={{ fontSize:13, color:"#6a7090" }}>Click to upload CSV</div>
              <div style={{ fontSize:11, color:"#3a4060", marginTop:6 }}>Required: Code firme · Raison Sociale · Ville · Téléphone · X · Y</div>
              <div style={{ fontSize:11, color:"#3a4060", marginTop:3 }}>French Excel (;) and UTF-8 (,) both supported</div>
              {rows.length > 0 && <div style={{ marginTop:14, fontSize:12, color:"#4ade80", ...mono }}>✓ {rows.length} pharmacies in database</div>}
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:"none" }} onChange={handleFile}/>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === "settings" && (
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
                Stored in your browser only — never sent to our servers.<br/>
                Enable "Places API (New)" at console.cloud.google.com<br/>
                Cost: ~$17/1000 reqs · 1500 pharmacies × 3 = ~$76 max (free with $200 credit)
              </div>
            </div>

            <div style={{ ...card, marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#4a5068", ...mono, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:10 }}>CORS Proxy (local only)</div>
              <div style={{ fontSize:11, color:"#3a4060", lineHeight:1.8 }}>
                The CORS proxy is only needed when running locally.<br/>
                When deployed on Vercel, you'll use a Vercel serverless function instead — no proxy needed.
              </div>
              <div style={{ fontSize:11, color:"#60a5fa", ...mono, background:"#060810", padding:"8px 12px", borderRadius:6, marginTop:8 }}>
                node C:\Users\User\cors-proxy\server.js
              </div>
            </div>

            <div style={{ ...card }}>
              <div style={{ fontSize:11, color:"#4a5068", ...mono, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:10 }}>Scoring logic</div>
              {[["Phone exact match","50 pts","#4ade80"],["Phone partial (last 8)","30 pts","#86efac"],["Name similarity","0–30 pts","#60a5fa"],["Proximity < 500m","20 pts","#a78bfa"],["Proximity < 2km","10 pts","#c4b5fd"]].map(([l,p,c]) => (
                <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #0e1020" }}>
                  <span style={{ fontSize:12, color:"#6a7090" }}>{l}</span>
                  <span style={{ fontSize:12, ...mono, color:c }}>{p}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
