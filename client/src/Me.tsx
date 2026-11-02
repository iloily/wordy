import { useEffect, useState } from "react";
import { act } from "./api";
import { useAction } from "./ui";
import type { Stats } from "./types";

export function MeTab() {
  const [s, setS] = useState<Stats | null>(null);
  const run = useAction();
  useEffect(() => void run(() => act<Stats>("me.stats")).then((x) => x && setS(x)), []);
  if (!s) return <p className="soft center">loading…</p>;
  const most = Math.max(1, ...s.dist);
  const tiles: [string, string | number][] = [
    ["played", s.played],
    ["win %", s.winRate],
    ["streak", s.streak],
    ["best streak", s.bestStreak],
    ["average", s.average === null ? "–" : s.average.toFixed(2)],
    ["freeplay wins this week", s.weekWins],
  ];
  return (
    <section>
      <div className="tiles">
        {tiles.map(([label, v]) => (
          <div key={label} className="tile-stat">
            <b>{v}</b>
            <span className="soft small">{label}</span>
          </div>
        ))}
      </div>
      <h3>guesses</h3>
      <div className="dist">
        {s.dist.map((n, i) => (
          <div key={i} className="dline">
            <span className="dlabel">{i === 6 ? "X" : i + 1}</span>
            <span className="dbar" style={{ width: `${Math.max(6, (n / most) * 100)}%` }}>{n}</span>
          </div>
        ))}
      </div>
      {s.played === 0 && <p className="soft small center">play today's wordy to start your stats</p>}
    </section>
  );
}
