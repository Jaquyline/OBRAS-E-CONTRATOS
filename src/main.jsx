import React from "react";
import ReactDOM from "react-dom/client";
import instalarStorageShim from "./storage-shim.js";
import AuthGate from "./AuthGate.jsx";
import DashboardConstrutora from "./DashboardConstrutora.jsx";

// Precisa rodar antes do painel montar, já que ele usa window.storage assim
// que carrega os dados salvos.
instalarStorageShim();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthGate>
      <DashboardConstrutora />
    </AuthGate>
  </React.StrictMode>
);