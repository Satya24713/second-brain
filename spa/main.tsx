import React from "react";
import ReactDOM from "react-dom/client";
import Workspace from "@/components/workspace";
import "@/app/globals.css";
import "@/app/task-workspace.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Workspace />
    </React.StrictMode>
  );
}
