import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import App from "./app/App";

registerSW({ immediate: true });

const routerBasename = normalizeRouterBasename(import.meta.env.BASE_URL);
migrateHashRoute(routerBasename);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

function normalizeRouterBasename(base: string) {
  if (!base || base === "/" || base === "./") return undefined;
  return base.replace(/\/$/, "");
}

function migrateHashRoute(basename?: string) {
  const hashPath = window.location.hash.match(/^#(\/.*)$/)?.[1];
  if (!hashPath) return;
  const nextPath = `${basename ?? ""}${hashPath}`;
  const url = new URL(window.location.href);
  url.pathname = nextPath.replace(/\/{2,}/g, "/");
  url.hash = "";
  window.history.replaceState(null, "", url);
}
