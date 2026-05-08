import { useState } from "react";
import { supabase } from "../lib/supabase";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };

export default function AuthPage() {
  const [mode, setMode]       = useState("login"); // login | signup
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [msg, setMsg]         = useState("");

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
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ background: "#0a0c14", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>

      <div style={{ width: 380, background: "#0c0f1c", border: "1px solid #1e2236", borderRadius: 14, padding: "36px 32px" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "#0f2040", border: "1px solid #2a4a8e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚕</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#e8eaf0" }}>Pharmacy Geo Validator</div>
            <div style={{ fontSize: 10, color: "#3a4060", ...mono }}>Coordinate validation platform</div>
          </div>
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "#060810", borderRadius: 8, padding: 4 }}>
          {["login","signup"].map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(""); setMsg(""); }} style={{
              flex: 1, padding: "8px", borderRadius: 6, border: "none",
              background: mode === m ? "#1a2540" : "transparent",
              color: mode === m ? "#60a5fa" : "#4a5068",
              fontSize: 12, cursor: "pointer", ...mono,
              textTransform: "capitalize",
            }}>{m === "login" ? "Sign in" : "Create account"}</button>
          ))}
        </div>

        <form onSubmit={handle}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: "#4a5068", ...mono, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com"
              style={{ width: "100%", padding: "10px 14px", background: "#060810", border: "1px solid #1e2236", borderRadius: 8, color: "#c8ccd8", fontSize: 13, outline: "none", boxSizing: "border-box", ...mono }}/>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 11, color: "#4a5068", ...mono, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" minLength={6}
              style={{ width: "100%", padding: "10px 14px", background: "#060810", border: "1px solid #1e2236", borderRadius: 8, color: "#c8ccd8", fontSize: 13, outline: "none", boxSizing: "border-box", ...mono }}/>
          </div>

          {error && <div style={{ background: "#1a0808", border: "1px solid #4a1010", borderRadius: 7, padding: "10px 14px", color: "#f87171", fontSize: 12, marginBottom: 16, ...mono }}>{error}</div>}
          {msg   && <div style={{ background: "#0a1a0a", border: "1px solid #1a4a1a", borderRadius: 7, padding: "10px 14px", color: "#4ade80", fontSize: 12, marginBottom: 16, ...mono }}>{msg}</div>}

          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "11px", borderRadius: 8,
            background: loading ? "#0a1020" : "linear-gradient(135deg, #1a3a6e, #0f2a55)",
            border: "1px solid #2a5a9e", color: loading ? "#3a5070" : "#90c0f0",
            fontSize: 13, cursor: loading ? "not-allowed" : "pointer", ...mono,
          }}>
            {loading ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
