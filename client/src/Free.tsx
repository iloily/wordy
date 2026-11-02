import { useEffect, useState } from "react";
import { act } from "./api";
import { Play } from "./Grid";
import { useAction } from "./ui";
import type { FreeState } from "./types";

const LENGTHS = [4, 5, 6, 7];

export function FreeTab() {
  const [s, setS] = useState<FreeState | null>(null);
  const [length, setLength] = useState(5);
  const [hard, setHard] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = useAction();

  useEffect(() => {
    run(() => act<FreeState>("free.get")).then((x) => {
      if (!x) return;
      setS(x);
      if (x.game) {
        setLength(x.game.length);
        setHard(x.game.hard);
      }
    });
  }, []);

  const start = async () => {
    setBusy(true);
    const x = await run(() => act<FreeState>("free.new", { length, hard }));
    setBusy(false);
    if (x) setS(x);
  };
  const guess = async (word: string) => {
    setBusy(true);
    const x = await run(() => act<FreeState>("free.guess", { word }));
    setBusy(false);
    if (x) setS(x);
    return !!x;
  };

  if (!s) return <p className="soft center">loading…</p>;
  const g = s.game;
  const picking = !g || g.done;

  return (
    <section>
      {picking && (
        <div className="card">
          <div className="row">
            <span className="soft">letters</span>
            <div className="chips">
              {LENGTHS.map((n) => (
                <button key={n} className={`chip ${length === n ? "on" : ""}`} onClick={() => setLength(n)}>{n}</button>
              ))}
            </div>
          </div>
          <label className="row check">
            <input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} />
            <span>hard mode <span className="soft small">(letters you find must be used again)</span></span>
          </label>
          <div className="row">
            <button className="btn big" disabled={busy} onClick={start}>{g ? "new word" : "play"}</button>
            <span className="soft small">{s.weekWins} {s.weekWins === 1 ? "win" : "wins"} this week</span>
          </div>
        </div>
      )}
      {g && (
        <>
          <div className="bar">
            <span>freeplay · {g.length} letters{g.hard ? " · hard" : ""}</span>
            <span className="soft">{s.weekWins} this week</span>
          </div>
          <Play rows={g.rows} length={g.length} done={g.done} busy={busy} onGuess={guess} />
          {g.done && (
            <p className="center">
              {g.won ? "nice one! " : "so close. "}the word was <b className="answer">{g.answer?.toUpperCase()}</b>
            </p>
          )}
        </>
      )}
    </section>
  );
}
