// The shared Supabase project (one for all of ilo's puzzle apps; this app's
// tables start with words_). Only this server talks to it, with the service
// key baked in at build time; players' screens never see the key or the
// database. SQL lives in supabase/migrations.

import { Backend, BoardKind, BoardRow, DailyRow, Player, Who } from "./backend";

type Json = any;

export class SupabaseBackend implements Backend {
  constructor(private url: string, private key: string) {}

  private async call(path: string, init: { method?: string; body?: Json; prefer?: string } = {}): Promise<Json> {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`${this.url}/rest/v1/${path}`, {
          method: init.method ?? "POST",
          headers: {
            apikey: this.key,
            Authorization: `Bearer ${this.key}`,
            "Content-Type": "application/json",
            ...(init.prefer ? { Prefer: init.prefer } : {}),
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          signal: AbortSignal.timeout(8000),
        });
        const text = await res.text();
        if (!res.ok) {
          if (res.status >= 500 && attempt < 3) throw new Error(`retry ${res.status}`);
          throw new Error(`supabase ${res.status}: ${text.slice(0, 200)}`);
        }
        return text ? JSON.parse(text) : null;
      } catch (e) {
        if (attempt >= 3 || (e instanceof Error && e.message.startsWith("supabase "))) throw e;
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
  }
  private rpc = (fn: string, args: Json) => this.call(`rpc/${fn}`, { body: args });

  private toDaily(r: Json): DailyRow | null {
    if (!r) return null;
    return {
      day: r.day,
      userId: r.user_id,
      serverId: r.server_id,
      guesses: r.guesses ?? [],
      startedAt: Date.parse(r.started_at),
      done: r.done,
      won: r.won,
      score: r.score ?? 0,
      seconds: Number(r.seconds ?? 0),
    };
  }

  async getDaily(day: number, userId: string) {
    const rows = await this.call(`words_daily?day=eq.${day}&user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: "GET" });
    return this.toDaily(rows?.[0]);
  }
  async startDaily(day: number, who: Who, now: number) {
    const r = await this.rpc("words_start_daily", {
      p_day: day, p_user: who.userId, p_name: who.name, p_server: who.serverId, p_server_name: who.serverName, p_started: new Date(now).toISOString(),
    });
    return this.toDaily(Array.isArray(r) ? r[0] : r)!;
  }
  async saveGuesses(day: number, userId: string, guesses: string[]) {
    await this.call(`words_daily?day=eq.${day}&user_id=eq.${encodeURIComponent(userId)}&done=eq.false`, { method: "PATCH", body: { guesses } });
  }
  async finishDaily(day: number, userId: string, guesses: string[], won: boolean, score: number, seconds: number) {
    return !!(await this.rpc("words_finish_daily", { p_day: day, p_user: userId, p_guesses: guesses, p_won: won, p_score: score, p_seconds: seconds }));
  }
  async player(userId: string): Promise<Player | null> {
    const rows = await this.call(`words_players?user_id=eq.${encodeURIComponent(userId)}&select=*`, { method: "GET" });
    const p = rows?.[0];
    if (!p) return null;
    return {
      userId: p.user_id, name: p.name, played: p.played, wins: p.wins, streak: p.streak, bestStreak: p.best_streak,
      lastDay: p.last_day, dist: p.dist, totalScore: p.total_score,
    };
  }
  async freeplayWin(week: number, who: Who) {
    await this.rpc("words_freeplay_win", { p_week: week, p_user: who.userId, p_name: who.name, p_server: who.serverId, p_server_name: who.serverName });
  }
  async freeplayWins(week: number, userId: string) {
    const rows = await this.call(`words_freeplay?week=eq.${week}&user_id=eq.${encodeURIComponent(userId)}&select=wins`, { method: "GET" });
    return rows?.[0]?.wins ?? 0;
  }
  async board(kind: BoardKind, serverId: string | null, day: number, week: number, limit: number): Promise<BoardRow[]> {
    const rows: Json[] = await this.rpc("words_board", { p_kind: kind, p_server: serverId, p_day: day, p_week: week, p_limit: limit });
    return (rows ?? []).map((r) => ({
      rank: Number(r.rank), id: r.id, name: r.name, server: r.server ?? undefined, value: Number(r.value), extra: Number(r.extra),
    }));
  }
}
