import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import AuthPage from "./components/AuthPage";
import Dashboard from "./components/Dashboard";
import ValidatedPage from "./components/ValidatedPage";
import ReviewPage from "./components/ReviewPage";

function ProtectedRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return (
    <div style={{ background:"#0a0c14", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:"#3a4060", fontFamily:"'IBM Plex Mono',monospace", fontSize:13 }}>
      Loading…
    </div>
  );

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <AuthPage />} />
        <Route path="/" element={<ProtectedRoute session={session}><Dashboard user={session?.user} /></ProtectedRoute>} />
        <Route path="/validated" element={<ProtectedRoute session={session}><ValidatedPage user={session?.user} /></ProtectedRoute>} />
        <Route path="/review" element={<ProtectedRoute session={session}><ReviewPage user={session?.user} /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
