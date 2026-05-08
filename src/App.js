import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import AuthPage from "./components/AuthPage";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ background:"#0a0c14", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", color:"#3a4060", fontFamily:"'IBM Plex Mono',monospace", fontSize:13 }}>
        Loading…
      </div>
    );
  }

  if (!session) return <AuthPage />;
  return <Dashboard user={session.user} />;
}
