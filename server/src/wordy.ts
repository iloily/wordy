// The game: daily (one ranked try per person, shared by every server) and
// freeplay (any length 4-7, as many as you like). No Root SDK imports, so
// tests can drive it with a fake clock and MemoryBackend.

import { Backend, BOARD_KINDS, BoardKind, BoardRow, Who, liveStreak, emptyPlayer } from "./backend";
import { dailyWord, dayOf, dayStart, weekOf, weekEnd } from "./daily";
import { MAX_GUESSES, Row, grid, hardProblem, rowsOf, scoreOf } from "./game";
import { Locks, Store } from "./store";
import { answers, isLength, isWord, Length } from "./words";

export class GameError extends Error {}
const no = (msg: string): never => {
  throw new GameError(msg);
};

export type DailyView = {
  day: number;
  number: number; // "wordy #12"
  started: boolean;
  startedAt: number | null;
  rows: Row[];
  done: boolean;
  won: boolean;
  score: number;
  seconds: number;
  answer: string | null; // only once you're done
  share: string | null;
  nextAt: number;
};

type FreeGame = { length: Length; hard: boolean; answer: string; guesses: string[]; done: boolean; won: boolean };
export type FreeView = { length: Length; hard: boolean; rows: Row[]; done: boolean; won: boolean; answer: string | null; weekWins: number } | null;

export type Deps = {
  backend: Backend;
  kv: Store; // this community's Root KV store (freeplay games in progress)
  seed: string;
  now: () => number;
  random?: () => number;
};

export const cleanGuess = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "");

export class Wordy {
  private locks = new Locks();
  private random: () => number;
  constructor(private d: Deps) {
    this.random = d.random ?? Math.random;
  }

  // ── daily ──────────────────────────────────────────────────────────────
  private view(day: number, r: { guesses: string[]; startedAt: number; done: boolean; won: boolean; score: number; seconds: number } | null): DailyView {
    const word = dailyWord(day, this.d.seed);
    const rows = r ? rowsOf(r.guesses, word) : [];
    const done = !!r?.done;
    return {
      day,
      number: day,
      started: !!r,
      startedAt: r?.startedAt ?? null,
      rows,
      done,
      won: !!r?.won,
      score: r?.score ?? 0,
      seconds: r?.seconds ?? 0,
      answer: done ? word : null,
      share: done ? grid(`wordy #${day}`, rows, !!r?.won) : null,
      nextAt: dayStart(day + 1),
    };
  }

  async dailyGet(userId: string): Promise<DailyView> {
    const day = dayOf(this.d.now());
    return this.view(day, await this.d.backend.getDaily(day, userId));
  }

  // the clock starts here, not on the first guess
  async dailyStart(who: Who): Promise<DailyView> {
    const day = dayOf(this.d.now());
    return this.locks.run(`d:${who.userId}`, async () => this.view(day, await this.d.backend.startDaily(day, who, this.d.now())));
  }

  async dailyGuess(who: Who, raw: unknown, day?: number): Promise<DailyView> {
    const guess = cleanGuess(raw);
    return this.locks.run(`d:${who.userId}`, async () => {
      const today = dayOf(this.d.now());
      // a guess typed just before midnight still counts for the day it was played
      const d = typeof day === "number" && (day === today || day === today - 1) ? day : today;
      const r = await this.d.backend.getDaily(d, who.userId);
      if (!r) no("press start first");
      if (r!.done) no("you've already played today's wordy");
      if (guess.length !== 5) no("guesses are 5 letters");
      if (!isWord(guess)) no("not in the word list");
      const word = dailyWord(d, this.d.seed);
      const guesses = [...r!.guesses, guess];
      const won = guess === word;
      if (won || guesses.length >= MAX_GUESSES) {
        const seconds = Math.max(0, Math.round((this.d.now() - r!.startedAt) / 100) / 10);
        const score = scoreOf(won, guesses.length);
        await this.d.backend.finishDaily(d, who.userId, guesses, won, score, seconds);
      } else await this.d.backend.saveGuesses(d, who.userId, guesses);
      return this.view(d, await this.d.backend.getDaily(d, who.userId));
    });
  }

  // ── freeplay ───────────────────────────────────────────────────────────
  private freeKey = (userId: string) => `free:${userId}`;

  private async freeView(userId: string, g: FreeGame | undefined): Promise<FreeView> {
    const weekWins = await this.d.backend.freeplayWins(weekOf(this.d.now()), userId);
    if (!g) return null;
    return { length: g.length, hard: g.hard, rows: rowsOf(g.guesses, g.answer), done: g.done, won: g.won, answer: g.done ? g.answer : null, weekWins };
  }

  async freeGet(userId: string) {
    const g = await this.d.kv.get<FreeGame>(this.freeKey(userId));
    return { game: await this.freeView(userId, g), weekWins: await this.d.backend.freeplayWins(weekOf(this.d.now()), userId) };
  }

  async freeNew(userId: string, length: unknown, hard: unknown) {
    const L = isLength(length) ? length : no("pick 4, 5, 6 or 7 letters");
    return this.locks.run(`f:${userId}`, async () => {
      const list = answers(L);
      const today = dailyWord(dayOf(this.d.now()), this.d.seed);
      let answer = today;
      while (answer === today) answer = list[Math.floor(this.random() * list.length)];
      const g: FreeGame = { length: L, hard: hard === true, answer, guesses: [], done: false, won: false };
      await this.d.kv.set(this.freeKey(userId), g);
      return { game: await this.freeView(userId, g), weekWins: await this.d.backend.freeplayWins(weekOf(this.d.now()), userId) };
    });
  }

  async freeGuess(who: Who, raw: unknown) {
    const guess = cleanGuess(raw);
    return this.locks.run(`f:${who.userId}`, async () => {
      const g = await this.d.kv.get<FreeGame>(this.freeKey(who.userId));
      if (!g) no("start a game first");
      if (g!.done) no("that game's over, start a new one");
      if (guess.length !== g!.length) no(`guesses are ${g!.length} letters`);
      if (!isWord(guess)) no("not in the word list");
      if (g!.hard) {
        const p = hardProblem(rowsOf(g!.guesses, g!.answer), guess);
        if (p) no(`hard mode: ${p}`);
      }
      g!.guesses.push(guess);
      if (guess === g!.answer) g!.done = g!.won = true;
      else if (g!.guesses.length >= MAX_GUESSES) g!.done = true;
      await this.d.kv.set(this.freeKey(who.userId), g);
      if (g!.won) await this.d.backend.freeplayWin(weekOf(this.d.now()), who);
      return { game: await this.freeView(who.userId, g!), weekWins: await this.d.backend.freeplayWins(weekOf(this.d.now()), who.userId) };
    });
  }

  // ── boards and stats ───────────────────────────────────────────────────
  async board(kind: unknown, scope: unknown, who: Who): Promise<{ kind: BoardKind; scope: "global" | "server"; rows: BoardRow[]; me: BoardRow | null; resetsAt: number | null }> {
    const k = BOARD_KINDS.includes(kind as BoardKind) ? (kind as BoardKind) : "today";
    const s = scope === "server" ? "server" : "global";
    const now = this.d.now();
    const day = dayOf(now);
    const week = weekOf(now);
    const rows = await this.d.backend.board(k, s === "server" && k !== "servers" ? who.serverId : null, day, week, 50);
    const meId = k === "servers" ? who.serverId : who.userId;
    return {
      kind: k,
      scope: k === "servers" ? "global" : s,
      rows,
      me: rows.find((r) => r.id === meId) ?? null,
      resetsAt: k === "today" || k === "servers" ? dayStart(day + 1) : k === "freeplay" ? weekEnd(week) : null,
    };
  }

  async stats(userId: string) {
    const p = (await this.d.backend.player(userId)) ?? emptyPlayer(userId, "");
    const day = dayOf(this.d.now());
    return {
      played: p.played,
      wins: p.wins,
      winRate: p.played ? Math.round((p.wins / p.played) * 100) : 0,
      streak: liveStreak(p, day),
      bestStreak: p.bestStreak,
      average: p.played ? Math.round((p.totalScore / p.played) * 100) / 100 : null,
      dist: p.dist,
      weekWins: await this.d.backend.freeplayWins(weekOf(this.d.now()), userId),
    };
  }
}
