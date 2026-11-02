// The action table the client calls through Act. No Root SDK imports, so
// tests can load it. Who's asking always comes from Root's Client.

import { Who } from "./backend";
import { GameError, Wordy } from "./wordy";

export type Caller = { userId: string };
export type Names = { who(userId: string): Promise<Who> };
export type Handler = (c: Caller, p: any) => Promise<unknown>;

export function handlers(w: Wordy, names: Names): Record<string, Handler> {
  return {
    "daily.get": (c) => w.dailyGet(c.userId),
    "daily.start": async (c) => w.dailyStart(await names.who(c.userId)),
    "daily.guess": async (c, p) => w.dailyGuess(await names.who(c.userId), p?.word, p?.day),
    "free.get": (c) => w.freeGet(c.userId),
    "free.new": (c, p) => w.freeNew(c.userId, p?.length, p?.hard),
    "free.guess": async (c, p) => w.freeGuess(await names.who(c.userId), p?.word),
    "board.get": async (c, p) => w.board(p?.kind, p?.scope, await names.who(c.userId)),
    "me.stats": (c) => w.stats(c.userId),
  };
}

export type Result = { ok: boolean; error: string; payload: string };

export async function dispatch(table: Record<string, Handler>, c: Caller, action: string, payload: string): Promise<Result> {
  const fn = table[action];
  if (!fn) return { ok: false, error: "unknown action", payload: "" };
  let p: unknown = {};
  try {
    p = payload ? JSON.parse(payload) : {};
  } catch {
    return { ok: false, error: "bad request", payload: "" };
  }
  try {
    const out = await fn(c, p);
    return { ok: true, error: "", payload: JSON.stringify(out ?? null) };
  } catch (e) {
    if (e instanceof GameError) return { ok: false, error: e.message, payload: "" };
    console.error(`[wordy] ${action}:`, e);
    return { ok: false, error: "something went wrong, try again", payload: "" };
  }
}

// Names shown on the global boards: no control characters or zero-width
// tricks, squashed spaces, at most 32 characters.
export function cleanName(s: unknown, fallback: string): string {
  const t = String(s ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return [...t].slice(0, 32).join("") || fallback;
}
