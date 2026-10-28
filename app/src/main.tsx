import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./styles.css";
import { AppProvider } from "./app/AppContext";
import { App } from "./app/App";
import { boot, Booted } from "./app/boot";

function Root() {
  const [booted, setBooted] = useState<Booted | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    boot().then(setBooted, (e) => { console.error(e); setError(e instanceof Error ? e.message : String(e)); });
  }, []);
  if (error) {
    return (
      <div className="splash"><div className="stack" style={{ maxWidth: 420 }}>
        <h2>SmartManager Loyalty</h2>
        <p className="err">Could not open the local database.</p>
        <p className="muted small">{error}</p>
        <p className="muted small">Your data has not been changed. Close and reopen the app. If this continues, contact support before reinstalling.</p>
      </div></div>
    );
  }
  if (!booted) return <div className="splash"><div className="spinner" role="status" aria-label="Loading" /></div>;
  return (
    <AppProvider svc={booted.svc} license={booted.license} initialSettings={booted.settings} platform={booted.platform}>
      <HashRouter><App /></HashRouter>
    </AppProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
