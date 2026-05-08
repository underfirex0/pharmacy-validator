// ─── Geo ──────────────────────────────────────────────────────────────────────

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Phone ────────────────────────────────────────────────────────────────────

export function normalizePhone(p) {
  return (p || "").replace(/\D/g, "").replace(/^0/, "212");
}

// ─── Text ─────────────────────────────────────────────────────────────────────

export function normalizeText(s) {
  return (s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/pharmacie\s*/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function stringSimilarity(a, b) {
  a = normalizeText(a); b = normalizeText(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = new Set(a.split(" ")), setB = new Set(b.split(" "));
  const inter = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? inter / union : 0;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export function scoreCandidate(candidate, row) {
  let score = 0;
  const cp = normalizePhone(candidate.phone);
  const rp = normalizePhone(row.telephone);
  if (cp && rp && cp === rp)                         { score += 50; }
  else if (cp && rp && cp.endsWith(rp.slice(-8)))    { score += 30; }
  score += Math.round(stringSimilarity(candidate.name, row.raison_sociale) * 30);
  if (row.old_x && row.old_y && candidate.lat && candidate.lng) {
    const dist = haversineKm(row.old_y, row.old_x, candidate.lat, candidate.lng);
    if (dist < 0.5) score += 20;
    else if (dist < 2) score += 10;
  }
  return { score, candidate };
}

export function decideStatus(best, row, dist) {
  const cp = normalizePhone(best.candidate.phone);
  const rp = normalizePhone(row.telephone);
  const phoneMatch = cp && rp && cp === rp;
  const phoneDiff  = cp && rp && cp !== rp;
  if (phoneMatch && dist !== null && dist < 0.5) return "approved";
  if (best.score >= 80 && !phoneDiff)            return "approved";
  if (best.score >= 50)                          return "review";
  return "notfound";
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSVLine(line, sep) {
  const result = []; let cur = "", inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === sep && !inQ) { result.push(cur.trim().replace(/^"|"$/g, "")); cur = ""; }
    else { cur += c; }
  }
  result.push(cur.trim().replace(/^"|"$/g, ""));
  return result;
}

export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const strip = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/"/g, "");
  const headers = parseCSVLine(lines[0], sep).map(strip);
  const col = {
    code_firme:     headers.findIndex((h) => h.includes("code")),
    raison_sociale: headers.findIndex((h) => h.includes("raison") || h.includes("social")),
    ville:          headers.findIndex((h) => h.includes("ville")),
    telephone:      headers.findIndex((h) => h.includes("tel") || h.includes("phone") || h.includes("gsm")),
    x:              headers.findIndex((h) => h === "x"),
    y:              headers.findIndex((h) => h === "y"),
  };
  return lines.slice(1).map((line) => {
    const c = parseCSVLine(line, sep);
    return {
      code_firme:     c[col.code_firme]     || "",
      raison_sociale: c[col.raison_sociale] || "",
      ville:          c[col.ville]          || "",
      telephone:      c[col.telephone]      || "",
      old_x:          parseFloat(c[col.x])  || null,
      old_y:          parseFloat(c[col.y])  || null,
    };
  }).filter((r) => r.raison_sociale && r.code_firme);
}

// ─── Export ───────────────────────────────────────────────────────────────────

function toMatrix(rows) {
  const H = ["Code firme","Raison Sociale","Ville","Tel CSV","Old X","Old Y","New X","New Y","Gap km","Maps Phone","Phone Diff","Maps Name","Status","Score","Imported","Validated"];
  const D = rows.map((r) => [
    r.code_firme, r.raison_sociale, r.ville, r.telephone,
    r.old_x ?? "", r.old_y ?? "",
    r.new_x ?? "", r.new_y ?? "",
    r.gap_km ?? "",
    r.maps_phone ?? "",
    r.phone_diff ? "YES" : (r.status !== "pending" ? "NO" : ""),
    r.maps_name ?? "",
    r.status ?? "pending",
    r.score ?? "",
    r.imported_at ? r.imported_at.slice(0,10) : "",
    r.validated_at ? r.validated_at.slice(0,10) : "",
  ]);
  return [H, ...D];
}

export function exportCSV(rows) {
  const csv = toMatrix(rows)
    .map((row) => row.map((v) => `"${String(v).replace(/"/g,'""')}"`).join(","))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF"+csv], { type:"text/csv;charset=utf-8;" }));
  a.download = `pharmacies_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

export function exportXLSX(rows) {
  const load = () => {
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(toMatrix(rows));
    ws["!cols"] = [12,32,14,16,10,10,10,10,8,16,10,32,10,6,10,10].map((w) => ({ wch:w }));
    window.XLSX.utils.book_append_sheet(wb, ws, "Pharmacies");
    window.XLSX.writeFile(wb, `pharmacies_${new Date().toISOString().slice(0,10)}.xlsx`);
  };
  if (window.XLSX) { load(); return; }
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  s.onload = load;
  document.head.appendChild(s);
}
