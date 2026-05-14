import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import AuthPage from "./components/AuthPage";
import Dashboard from "./components/Dashboard";
import ValidatedPage from "./components/ValidatedPage";
import ReviewPage from "./components/ReviewPage";
import RejectedPage from "./components/RejectedPage";

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
    <div style={{ background: "#f4f6f9", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontFamily: "'IBM Plex Sans',sans-serif", fontSize: 14 }}>
      Chargement…
    </div>
  );

  const P = ({ children }) => <ProtectedRoute session={session}>{children}</ProtectedRoute>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={session ? <Navigate to="/" replace /> : <AuthPage />} />
        <Route path="/"         element={<P><Dashboard   user={session?.user} /></P>} />
        <Route path="/validated"element={<P><ValidatedPage user={session?.user} /></P>} />
        <Route path="/review"   element={<P><ReviewPage  user={session?.user} /></P>} />
        <Route path="/rejected" element={<P><RejectedPage user={session?.user} /></P>} />
        <Route path="*"         element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
