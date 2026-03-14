import React from "react";
import ReactDOM from "react-dom/client";
import { OverlayApp } from "./OverlayApp";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import "./assets/styles/index.css";

// Override theme body background for overlay transparency.
// The inline style in overlay.html is blocked by CSP (style-src 'self')
// in production builds, so we set it via JS DOM API which bypasses CSP.
document.body.style.background = "transparent";

ReactDOM.createRoot(document.getElementById("overlay-root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <OverlayApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
