import { useEffect, useState } from "react";
import { act } from "./api";
import { Play } from "./Grid";
import { Countdown, clock, copyText, useAction, useTick, useToast } from "./ui";
import type { DailyView } from "./types";

export function DailyTab() {
  const [v, setV] = useState<DailyView | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useAction();
  const load = () => run(() => act<DailyView>("daily.get")).then((x) => x && setV(x));
  useEffect(() => void load(), []);

  // a new word at 00:00 UTC
  useTick(30_000);
  useEffect(() => {
    if (v && Date.now() >= v.nextAt && (v.done || !v.started)) void load();
  });

  if (!v) return <p className="soft center">loading…</p>;

  if (!v.started) {
    return (
      <section className="card center">
        <h2>wordy #{v.number}</h2>
        <p>Guess today's 5-letter word in 6 tries. Everyone in every server gets the same word.</p>
        <p className="soft small">One ranked try a day. The timer starts when you press start, and fewer guesses beats a faster time.</p>
        <button className="btn big" disabled={busy} onClick={async () => {
          setBusy(true);
          const x = await run(() => act<DailyView>("daily.start"));
          setBusy(false);
          if (x) setV(x);
        }}>start</button>
        <Countdown to={v.nextAt} label="new word in" />
      </section>
    );
  }

  const guess = async (word: string) => {
    setBusy(true);
    const x = await run(() => act<DailyView>("daily.guess", { word, day: v.day }));
    setBusy(false);
    if (x) setV(x);
    return !!x;
  };

  return (
    <section>
      <div className="bar">
        <span>wordy #{v.number}</span>
        {!v.done && v.startedAt && <Timer from={v.startedAt} />}
        {v.done && <span>{clock(v.seconds)}</span>}
      </div>
      <Play rows={v.rows} length={5} done={v.done} busy={busy} onGuess={guess} />
      {v.done && <Result v={v} />}
    </section>
  );
}

function Timer({ from }: { from: number }) {
  useTick(500);
  return <span className="soft">{clock((Date.now() - from) / 1000)}</span>;
}

function Result({ v }: { v: DailyView }) {
  const toast = useToast();
  return (
    <div className="card center result">
      <h2>{v.won ? (v.rows.length === 1 ? "first try!" : `got it in ${v.rows.length}`) : "not this time"}</h2>
      <p>
        the word was <b className="answer">{v.answer?.toUpperCase()}</b>
        {v.won && <> · {clock(v.seconds)}</>}
      </p>
      {v.share && (
        <>
          <pre className="share">{v.share}</pre>
          <button className="btn" onClick={async () => toast((await copyText(v.share!)) ? "copied, paste it in chat" : "couldn't copy, select the squares instead")}>
            copy result
          </button>
        </>
      )}
      <Countdown to={v.nextAt} label="next wordy in" />
    </div>
  );
}
