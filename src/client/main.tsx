import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

// Agent mode: an agent driving a browser gets bigger targets and no hover-only affordances.
const q = new URLSearchParams(window.location.search);
if (q.has("agent") || q.get("mode") === "agent") document.documentElement.dataset.agent = "";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
