import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initSentry } from "./integrations/sentry";
import "./index.css";

// Monitoring des erreurs : no-op si VITE_SENTRY_DSN n'est pas défini.
initSentry();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Failed to find the root element");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
