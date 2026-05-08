import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

export default function NavBar({ user, counts = {} }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const path      = location.pathname;

  const navBtn = (label, to, color) => {
    const active = path === to;
    return (
      <button onClick={() => navigate(to)} style={{
        background: active ? "#1a2540" : "transparent",
        border: `1px solid ${active ? "#2a4a8e" : "#1e2236"}`,
        color: active ? (color || "#60a5fa") : "#4a5068",
        padding: "6px 16px", borderRadius: 6, fontSize: 12,
        cursor: "pointer", ...mono, display: "flex", alignItems: "center", gap: 6,
      }}>
        {label}
        {counts[to] !== undefined && (
          <span style={{ background: active ? "#0f2040" : "#0c0f1c", color: active ? (color||"#60a5fa") : "#3a4060", borderRadius: 10, padding: "1px 7px", fontSize: 10 }}>
            {counts[to]}
          </span>
        )}
      </button>
    );
  };

  return (
    <div style={{ borderBottom: "1px solid #1e2236", padding: "14px 28px", display: "flex", alignItems: "center", gap: 14, background: "#0a0c14" }}>
      <div style={{ width: 34, height: 34, borderRadius: 8, background: "#0f2040", border: "1px solid #2a4a8e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "pointer" }}
        onClick={() => navigate("/")}>⚕</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#e8eaf0" }}>Pharmacy Geo Validator</div>
        <div style={{ fontSize: 10, color: "#3a4060", ...mono }}>{user?.email}</div>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
        {navBtn("Dashboard", "/")}
        {navBtn("✓ Validated", "/validated", "#22c55e")}
        {navBtn("⚠ To Review", "/review", "#fbbf24")}
        <button onClick={() => supabase.auth.signOut()} style={{
          background: "transparent", border: "1px solid #3a1010", color: "#f87171",
          padding: "6px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer", ...mono,
        }}>Sign out</button>
      </div>
    </div>
  );
}
