import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { T } from "../theme";

export default function NavBar({ user, counts = {} }) {
  const navigate = useNavigate();
  const location = useLocation();
  const path     = location.pathname;

  const navBtn = (label, to, activeColor) => {
    const active = path === to;
    return (
      <button onClick={() => navigate(to)} style={{
        background: active ? T.accentBg : "transparent",
        border: `1px solid ${active ? T.blueBorder : "transparent"}`,
        color: active ? (activeColor || T.accent) : T.textSecondary,
        padding: "7px 16px", borderRadius: 8, fontSize: 13,
        cursor: "pointer", fontWeight: active ? 600 : 400,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {label}
        {counts[to] !== undefined && (
          <span style={{ background: active ? T.accent : T.grayBg, color: active ? "#fff" : T.textMuted, borderRadius: 10, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>
            {counts[to]}
          </span>
        )}
      </button>
    );
  };

  return (
    <div style={{ background: T.headerBg, borderBottom: `1px solid ${T.border}`, padding: "12px 28px", display: "flex", alignItems: "center", gap: 14, boxShadow: T.shadow, position: "sticky", top: 0, zIndex: 100 }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: T.accentBg, border: `1px solid ${T.blueBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, cursor: "pointer" }}
        onClick={() => navigate("/")}>⚕</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>Pharmacy Geo Validator</div>
        <div style={{ fontSize: 11, color: T.textMuted, ...T.mono }}>{user?.email}</div>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
        {navBtn("Dashboard", "/")}
        {navBtn("✓ Validated", "/validated", T.greenText)}
        {navBtn("⚠ To Review", "/review", T.yellowText)}
        <button onClick={() => supabase.auth.signOut()} style={{
          background: T.redBg, border: `1px solid ${T.redBorder}`, color: T.redText,
          padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 500,
        }}>Sign out</button>
      </div>
    </div>
  );
}
