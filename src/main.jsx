import React from "react";
import ReactDOM from "react-dom/client";
import instalarStorageShim from "./storage-shim.js";
import DashboardConstrutora from "./DashboardConstrutora.jsx";

// Precisa rodar antes do componente montar, já que o componente usa
// window.storage assim que carrega os dados salvos.
instalarStorageShim();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DashboardConstrutora />
  </React.StrictMode>
);
