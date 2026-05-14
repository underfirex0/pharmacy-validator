import { useState } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../theme";

export default function AuthPage() {
  const [mode, setMode]         = useState("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [msg, setMsg]           = useState("");

  const handle = async (e) => {
    e.preventDefault();
    setError(""); setMsg(""); setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Account created! Check your email to confirm, then log in.");
        setMode("login");
      }
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const inp = {
    width: "100%", padding: "11px 14px", background: T.inputBg,
    border: `1px solid ${T.border}`, borderRadius: 8, color: T.textPrimary,
    fontSize: 14, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ background: T.pageBg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", ...T.sans }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>

      <div style={{ width: 400, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 16, padding: "40px 36px", boxShadow: T.shadowMd }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: T.accentBg, border: `1px solid ${T.blueBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⚕</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>Pharmacy Geo Validator</div>
            <div style={{ fontSize: 11, color: T.textMuted, ...T.mono }}>Coordinate validation platform</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: T.pageBg, borderRadius: 8, padding: 4 }}>
          {["login","signup"].map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(""); setMsg(""); }} style={{
              flex: 1, padding: "9px", borderRadius: 6, border: "none",
              background: mode === m ? T.cardBg : "transparent",
              color: mode === m ? T.accent : T.textMuted,
              fontSize: 13, cursor: "pointer", fontWeight: mode === m ? 600 : 400,
              boxShadow: mode === m ? T.shadow : "none",
            }}>{m === "login" ? "Sign in" : "Create account"}</button>
          ))}
        </div>

        <form onSubmit={handle}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: T.textLabel, fontWeight: 500, display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" style={inp}
              onFocus={(e) => e.target.style.borderColor = T.accent}
              onBlur={(e) => e.target.style.borderColor = T.border}/>
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 12, color: T.textLabel, fontWeight: 500, display: "block", marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" minLength={6} style={inp}
              onFocus={(e) => e.target.style.borderColor = T.accent}
              onBlur={(e) => e.target.style.borderColor = T.border}/>
          </div>

          {error && <div style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 8, padding: "10px 14px", color: T.redText, fontSize: 13, marginBottom: 16 }}>{error}</div>}
          {msg   && <div style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}`, borderRadius: 8, padding: "10px 14px", color: T.greenText, fontSize: 13, marginBottom: 16 }}>{msg}</div>}

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "12px", borderRadius: 8,
            background: loading ? T.grayBg : T.accent,
            border: "none", color: loading ? T.textMuted : "#fff",
            fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
          }}>
            {loading ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
