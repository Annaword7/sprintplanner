import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SprintPlanner from "./SprintPlanner.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SprintPlanner />
  </StrictMode>
);
