import React from "react";

import ReactDOM from "react-dom/client";
import "@fontsource/fredoka/400.css";
import "@fontsource/fredoka/500.css";
import "@fontsource/fredoka/600.css";
import "./styles.css";
import App from "./App";
import { connect } from "./api";

async function theme() {
  const set = (mode: string) => document.documentElement.setAttribute("data-theme", mode);
  try {
    const { rootClient, RootClientThemeEvent } = await import("@rootsdk/client-app");
    set(rootClient.theme.getTheme());
    rootClient.theme.on(RootClientThemeEvent.ThemeUpdate, set);
  } catch {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    set(mq.matches ? "dark" : "light");
  }
}

(async () => {
  const params = new URLSearchParams(location.search);
  if (!params.has("mock")) await theme();
  else document.documentElement.setAttribute("data-theme", params.get("theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  await connect();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
})();
