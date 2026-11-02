import { useState } from "react";
import { ToastHost } from "./ui";
import { DailyTab } from "./Daily";
import { FreeTab } from "./Free";
import { BoardsTab } from "./Boards";
import { MeTab } from "./Me";

type Tab = "daily" | "free" | "boards" | "me";
const TABS: [Tab, string][] = [["daily", "daily"], ["free", "freeplay"], ["boards", "boards"], ["me", "me"]];

const App = () => {
  const [tab, setTab] = useState<Tab>("daily");
  return (
    <ToastHost>
      <main className="shell">
        <header className="top">
          <h1 className="logo">wordy</h1>
          <nav className="tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
        </header>
        {tab === "daily" && <DailyTab />}
        {tab === "free" && <FreeTab />}
        {tab === "boards" && <BoardsTab />}
        {tab === "me" && <MeTab />}
      </main>
    </ToastHost>
  );
};

export default App;
