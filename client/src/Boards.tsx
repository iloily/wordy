import { useEffect, useState } from "react";
import { act } from "./api";
import { Countdown, clock, useAction } from "./ui";
import type { Board, BoardKind, BoardRow } from "./types";

const KINDS: [BoardKind, string][] = [["today", "today"], ["streaks", "streaks"], ["alltime", "all time"], ["freeplay", "freeplay"], ["servers", "servers"]];

const NOTE: Record<BoardKind, string> = {
  today: "fewest guesses wins, time breaks ties",
  streaks: "daily wins in a row",
  alltime: "average guesses, 10+ dailies to show up (a miss counts as 7)",
  freeplay: "freeplay wins this week",
  servers: "average of each server's best 10 today, 3+ players to show up",
};

function value(kind: BoardKind, r: BoardRow) {
  if (kind === "today") return <>{r.value >= 7 ? "X" : r.value}/6 <span className="soft">{clock(r.extra)}</span></>;
  if (kind === "streaks") return <>{r.value} <span className="soft">best {r.extra}</span></>;
  if (kind === "alltime") return <>{r.value.toFixed(2)} <span className="soft">{r.extra} played</span></>;
  if (kind === "freeplay") return <>{r.value} {r.value === 1 ? "win" : "wins"}</>;
  return <>{r.value.toFixed(2)} <span className="soft">{r.extra} played</span></>;
}

export function BoardsTab() {
  const [kind, setKind] = useState<BoardKind>("today");
  const [scope, setScope] = useState<"global" | "server">("global");
  const [b, setB] = useState<Board | null>(null);
  const run = useAction();

  useEffect(() => {
    setB(null);
    run(() => act<Board>("board.get", { kind, scope })).then((x) => x && setB(x));
  }, [kind, scope]);

  return (
    <section>
      <div className="chips wrap">
        {KINDS.map(([k, label]) => (
          <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>{label}</button>
        ))}
      </div>
      {kind !== "servers" && (
        <div className="toggle">
          <button className={scope === "global" ? "on" : ""} onClick={() => setScope("global")}>global</button>
          <button className={scope === "server" ? "on" : ""} onClick={() => setScope("server")}>this server</button>
        </div>
      )}
      <p className="soft small">{NOTE[kind]}</p>
      {!b && <p className="soft center">loading…</p>}
      {b && b.rows.length === 0 && <p className="card center soft">nobody here yet. be the first!</p>}
      {b && b.rows.length > 0 && (
        <ol className="board">
          {b.rows.map((r) => (
            <li key={r.id} className={b.me?.id === r.id ? "me" : ""}>
              <span className="rank">{r.rank}</span>
              <span className="who">
                {r.name}
                {r.server && kind === "today" && scope === "global" && <span className="soft small"> · {r.server}</span>}
              </span>
              <span className="val">{value(kind, r)}</span>
            </li>
          ))}
        </ol>
      )}
      {b && !b.me && b.rows.length > 0 && <p className="soft small center">{kind === "servers" ? "this server isn't on the board yet" : "you're not on this board yet"}</p>}
      {b?.resetsAt && <div className="center"><Countdown to={b.resetsAt} label="resets in" /></div>}
    </section>
  );
}
