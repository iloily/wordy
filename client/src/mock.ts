// Dev-only stand-in for the server (?mock): a fixed daily word and a few
// fake board rows, so the screens can be tried without a Root install.
import type { Backend } from "./api";
import type { Mark, Row } from "./types";

function mark(guess: string, answer: string): Mark[] {
  const m: Mark[] = Array(guess.length).fill("m");
  const left = new Map<string, number>();
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) m[i] = "h";
    else left.set(answer[i], (left.get(answer[i]) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (m[i] === "h") continue;
    const n = left.get(guess[i]) ?? 0;
    if (n > 0) { m[i] = "p"; left.set(guess[i], n - 1); }
  }
  return m;
}
const rows = (g: string[], a: string): Row[] => g.map((word) => ({ word, marks: mark(word, a) }));

export function mockBackend(): Backend {
  const word = "petal";
  const free: Record<number, string> = { 4: "bird", 5: "crane", 6: "garden", 7: "blossom" };
  let daily: { guesses: string[]; startedAt: number; done: boolean; won: boolean; seconds: number } | null = null;
  let fg: { length: number; hard: boolean; answer: string; guesses: string[]; done: boolean; won: boolean } | null = null;
  let weekWins = 3;
  const nextAt = new Date().setUTCHours(24, 0, 0, 0);
  const dv = () => ({
    day: 12, number: 12, started: !!daily, startedAt: daily?.startedAt ?? null, rows: daily ? rows(daily.guesses, word) : [],
    done: !!daily?.done, won: !!daily?.won, score: daily?.done ? (daily.won ? daily.guesses.length : 7) : 0, seconds: daily?.seconds ?? 0,
    answer: daily?.done ? word : null, nextAt,
    share: daily?.done ? `wordy #12 ${daily.won ? daily.guesses.length : "X"}/6\n` + rows(daily.guesses, word).map((r) => r.marks.map((m) => ({ h: "🩷", p: "💜", m: "🤍" })[m]).join("")).join("\n") : null,
  });
  const fv = () => ({ game: fg && { length: fg.length, hard: fg.hard, rows: rows(fg.guesses, fg.answer), done: fg.done, won: fg.won, answer: fg.done ? fg.answer : null, weekWins }, weekWins });
  const names = ["mochi", "sunny", "kit", "bean", "luna", "pip", "rory", "juno"];
  const fail = (m: string) => { throw new Error(m); };
  const table: Record<string, (p: any) => unknown> = {
    "daily.get": () => dv(),
    "daily.start": () => { daily ??= { guesses: [], startedAt: Date.now(), done: false, won: false, seconds: 0 }; return dv(); },
    "daily.guess": (p) => {
      const g = String(p.word).toLowerCase();
      if (!daily) fail("press start first");
      if (daily!.done) fail("you've already played today's wordy");
      if (g.length !== 5) fail("guesses are 5 letters");
      if (g === "zzzzz") fail("not in the word list");
      daily!.guesses.push(g);
      if (g === word || daily!.guesses.length >= 6) Object.assign(daily!, { done: true, won: g === word, seconds: Math.round((Date.now() - daily!.startedAt) / 100) / 10 });
      return dv();
    },
    "free.get": () => fv(),
    "free.new": (p) => { fg = { length: p.length, hard: !!p.hard, answer: free[p.length], guesses: [], done: false, won: false }; return fv(); },
    "free.guess": (p) => {
      const g = String(p.word).toLowerCase();
      if (!fg) fail("start a game first");
      if (g.length !== fg!.length) fail(`guesses are ${fg!.length} letters`);
      fg!.guesses.push(g);
      if (g === fg!.answer) { fg!.done = fg!.won = true; weekWins++; } else if (fg!.guesses.length >= 6) fg!.done = true;
      return fv();
    },
    "board.get": (p) => {
      const kind = p.kind ?? "today";
      const rs = names.map((n, i) => ({
        rank: i + 1, id: n, name: n, server: kind === "today" ? (i % 2 ? "Chill." : "cozy corner") : undefined,
        value: kind === "today" ? Math.min(2 + Math.floor(i / 2), 7) : kind === "streaks" ? 30 - i * 3 : kind === "alltime" ? 3.1 + i * 0.2 : kind === "freeplay" ? 40 - i * 4 : 2.8 + i * 0.3,
        extra: kind === "today" ? 31 + i * 17 : kind === "alltime" ? 80 - i * 5 : kind === "streaks" ? 40 : 12,
      }));
      if (kind === "servers") rs.forEach((r, i) => (r.name = ["Chill.", "cozy corner", "ily hub", "night owls", "the garden", "pixel cafe", "study hall", "book club"][i]));
      return { kind, scope: p.scope ?? "global", rows: rs, me: rs[2], resetsAt: nextAt };
    },
    "me.stats": () => ({ played: 23, wins: 21, winRate: 91, streak: 6, bestStreak: 11, average: 3.87, dist: [0, 2, 7, 8, 3, 1, 2], weekWins }),
  };
  return {
    me: "you",
    async act(action, payload) {
      await new Promise((r) => setTimeout(r, 120));
      return structuredClone(table[action]?.(payload ?? {}) ?? null);
    },
  };
}
