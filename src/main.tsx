import { createRoot } from "react-dom/client";
import "./index.css";
import { loadRemoteCSVs } from "./data/remoteCsv";

const rootEl = document.getElementById("root")!;

(async () => {
  try {
    await loadRemoteCSVs();
    const { default: App } = await import("./App.tsx");
    createRoot(rootEl).render(<App />);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    createRoot(rootEl).render(
      <div style={{ padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>No se pudo cargar la data del dashboard.</h2>
        <p style={{ marginTop: 8, color: "#666" }}>{message}</p>
      </div>,
    );
  }
})();
