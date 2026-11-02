// The letter grid plus the on-screen keyboard. Physical keys work too.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Mark, Row } from "./types";

const KEYS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const RANK: Record<Mark, number> = { m: 1, p: 2, h: 3 };
const LABEL: Record<Mark, string> = { h: "right spot", p: "wrong spot", m: "not in the word" };

export function Play({
  rows, length, done, busy, onGuess,
}: { rows: Row[]; length: number; done: boolean; busy: boolean; onGuess: (word: string) => Promise<boolean> }) {
  const [typed, setTyped] = useState("");
  const [shake, setShake] = useState(false);
  const state = useRef({ typed, done, busy, length });
  state.current = { typed, done, busy, length };

  // reset the typing row whenever a new game starts or a guess lands
  useEffect(() => setTyped(""), [rows.length, length]);

  const keyState = useMemo(() => {
    const k = new Map<string, Mark>();
    for (const r of rows) r.word.split("").forEach((c, i) => {
      const m = r.marks[i];
      if (!k.has(c) || RANK[m] > RANK[k.get(c)!]) k.set(c, m);
    });
    return k;
  }, [rows]);

  const press = async (key: string) => {
    const s = state.current;
    if (s.done || s.busy) return;
    if (key === "enter") {
      if (s.typed.length !== s.length) {
        setShake(true);
        window.setTimeout(() => setShake(false), 400);
        return;
      }
      const ok = await onGuess(s.typed);
      if (!ok) {
        setShake(true);
        window.setTimeout(() => setShake(false), 400);
      }
      return;
    }
    if (key === "back") return setTyped((t) => t.slice(0, -1));
    if (/^[a-z]$/.test(key)) setTyped((t) => (t.length < s.length ? t + key : t));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Enter") press("enter");
      else if (e.key === "Backspace") press("back");
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lines: { word: string; marks?: Mark[]; current?: boolean }[] = rows.map((r) => ({ word: r.word, marks: r.marks }));
  if (!done && lines.length < 6) lines.push({ word: typed, current: true });
  while (lines.length < 6) lines.push({ word: "" });

  return (
    <div className="play">
      <div className="grid" style={{ ["--cols" as string]: length }}>
        {lines.map((l, r) => (
          <div key={r} className={`line ${l.current && shake ? "shake" : ""}`} aria-label={l.marks ? `guess ${r + 1}: ${l.word}` : undefined}>
            {Array.from({ length }, (_, i) => {
              const c = l.word[i] ?? "";
              const m = l.marks?.[i];
              return (
                <div key={i} className={`tile ${m ?? (c ? "typed" : "")}`} style={{ animationDelay: m ? `${i * 90}ms` : undefined }} title={m ? LABEL[m] : undefined}>
                  {c.toUpperCase()}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {!done && (
        <div className="keys" aria-label="keyboard">
          {KEYS.map((row, i) => (
            <div key={i} className="krow">
              {i === 2 && <button className="key wide" onClick={() => press("enter")}>enter</button>}
              {row.split("").map((c) => (
                <button key={c} className={`key ${keyState.get(c) ?? ""}`} onClick={() => press(c)}>{c.toUpperCase()}</button>
              ))}
              {i === 2 && <button className="key wide" onClick={() => press("back")} aria-label="delete">⌫</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
