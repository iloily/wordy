// Where results live. The global boards need one database shared by every
// community, so the real one is Supabase (supabase.ts). MemoryBackend does the
// same thing in memory for tests and for running without secrets.

export type DailyRow = {
  day: number;
  userId: string;
  serverId: string;
  guesses: string[];
  startedAt: number; // ms
  done: boolean;
  won: boolean;
  score: number;
  seconds: number;
};

export type Player = {
  userId: string;
  name: string;
  played: number;
  wins: number;
  streak: number;
  bestStreak: number;
  lastDay: number; // last daily finished
  dist: number[]; // [1..6 guesses, miss]
  totalScore: number;
};

export type BoardKind = "today" | "streaks" | "alltime" | "freeplay" | "servers";
export const BOARD_KINDS: BoardKind[] = ["today", "streaks", "alltime", "freeplay", "servers"];

// one line on a board; `value` is the main number, `extra` the tie-break
export type BoardRow = { rank: number; id: string; name: string; server?: string; value: number; extra: number };

export type Who = { userId: string; name: string; serverId: string; serverName: string };

export const ALLTIME_MIN_GAMES = 10;
export const SERVER_TOP = 10;
export const SERVER_MIN_PLAYERS = 3;

export interface Backend {
  getDaily(day: number, userId: string): Promise<DailyRow | null>;
  // creates the row if it isn't there yet and returns whichever row is stored
  startDaily(day: number, who: Who, now: number): Promise<DailyRow>;
  saveGuesses(day: number, userId: string, guesses: string[]): Promise<void>;
  // marks the row done and counts it in the player's stats, once; false if it was already done
  finishDaily(day: number, userId: string, guesses: string[], won: boolean, score: number, seconds: number): Promise<boolean>;
  player(userId: string): Promise<Player | null>;
  freeplayWin(week: number, who: Who): Promise<void>;
  freeplayWins(week: number, userId: string): Promise<number>;
  board(kind: BoardKind, serverId: string | null, day: number, week: number, limit: number): Promise<BoardRow[]>;
}

export const emptyPlayer = (userId: string, name: string): Player => ({
  userId, name, played: 0, wins: 0, streak: 0, bestStreak: 0, lastDay: -1, dist: [0, 0, 0, 0, 0, 0, 0], totalScore: 0,
});

// The streak shown today: a streak only lives while you finish every day.
export const liveStreak = (p: Player, today: number) => (p.lastDay >= today - 1 ? p.streak : 0);

// Applies one finished daily to a player's stats (same rule as words_finish_daily in SQL).
export function applyDaily(p: Player, day: number, won: boolean, score: number): Player {
  const q = { ...p, dist: [...p.dist] };
  q.played++;
  q.totalScore += score;
  q.dist[Math.min(score, 7) - 1]++;
  if (won) {
    q.wins++;
    q.streak = p.lastDay === day - 1 ? p.streak + 1 : 1;
    q.bestStreak = Math.max(q.bestStreak, q.streak);
  } else q.streak = 0;
  q.lastDay = day;
  return q;
}

const rank = (rows: Omit<BoardRow, "rank">[]): BoardRow[] => rows.map((r, i) => ({ ...r, rank: i + 1 }));

export class MemoryBackend implements Backend {
  daily = new Map<string, DailyRow>();
  players = new Map<string, Player>();
  members = new Set<string>(); // `${userId}|${serverId}`
  servers = new Map<string, string>();
  free = new Map<string, { week: number; userId: string; wins: number }>();

  private touch(who: Who) {
    const p = this.players.get(who.userId) ?? emptyPlayer(who.userId, who.name);
    this.players.set(who.userId, { ...p, name: who.name });
    this.members.add(`${who.userId}|${who.serverId}`);
    this.servers.set(who.serverId, who.serverName);
  }
  private member = (userId: string, serverId: string | null) => !serverId || this.members.has(`${userId}|${serverId}`);

  async getDaily(day: number, userId: string) {
    const r = this.daily.get(`${day}|${userId}`);
    return r ? { ...r, guesses: [...r.guesses] } : null;
  }
  async startDaily(day: number, who: Who, now: number) {
    this.touch(who);
    const key = `${day}|${who.userId}`;
    if (!this.daily.has(key)) {
      this.daily.set(key, { day, userId: who.userId, serverId: who.serverId, guesses: [], startedAt: now, done: false, won: false, score: 0, seconds: 0 });
    }
    return (await this.getDaily(day, who.userId))!;
  }
  async saveGuesses(day: number, userId: string, guesses: string[]) {
    const r = this.daily.get(`${day}|${userId}`);
    if (r && !r.done) r.guesses = [...guesses];
  }
  async finishDaily(day: number, userId: string, guesses: string[], won: boolean, score: number, seconds: number) {
    const r = this.daily.get(`${day}|${userId}`);
    if (!r || r.done) return false;
    Object.assign(r, { guesses: [...guesses], done: true, won, score, seconds });
    const p = this.players.get(userId) ?? emptyPlayer(userId, userId);
    this.players.set(userId, applyDaily(p, day, won, score));
    return true;
  }
  async player(userId: string) {
    const p = this.players.get(userId);
    return p ? { ...p, dist: [...p.dist] } : null;
  }
  async freeplayWin(week: number, who: Who) {
    this.touch(who);
    const key = `${week}|${who.userId}`;
    const r = this.free.get(key) ?? { week, userId: who.userId, wins: 0 };
    r.wins++;
    this.free.set(key, r);
  }
  async freeplayWins(week: number, userId: string) {
    return this.free.get(`${week}|${userId}`)?.wins ?? 0;
  }
  async board(kind: BoardKind, serverId: string | null, day: number, week: number, limit: number): Promise<BoardRow[]> {
    const name = (id: string) => this.players.get(id)?.name ?? "someone";
    if (kind === "today") {
      return rank(
        [...this.daily.values()]
          .filter((r) => r.day === day && r.done && this.member(r.userId, serverId))
          .sort((a, b) => a.score - b.score || a.seconds - b.seconds)
          .slice(0, limit)
          .map((r) => ({ id: r.userId, name: name(r.userId), server: this.servers.get(r.serverId), value: r.score, extra: r.seconds })),
      );
    }
    if (kind === "streaks") {
      return rank(
        [...this.players.values()]
          .filter((p) => liveStreak(p, day) > 0 && this.member(p.userId, serverId))
          .sort((a, b) => b.streak - a.streak || b.bestStreak - a.bestStreak)
          .slice(0, limit)
          .map((p) => ({ id: p.userId, name: p.name, value: p.streak, extra: p.bestStreak })),
      );
    }
    if (kind === "alltime") {
      return rank(
        [...this.players.values()]
          .filter((p) => p.played >= ALLTIME_MIN_GAMES && this.member(p.userId, serverId))
          .map((p) => ({ p, avg: Math.round((p.totalScore / p.played) * 100) / 100 }))
          .sort((a, b) => a.avg - b.avg || b.p.played - a.p.played)
          .slice(0, limit)
          .map(({ p, avg }) => ({ id: p.userId, name: p.name, value: avg, extra: p.played })),
      );
    }
    if (kind === "freeplay") {
      return rank(
        [...this.free.values()]
          .filter((r) => r.week === week && this.member(r.userId, serverId))
          .sort((a, b) => b.wins - a.wins)
          .slice(0, limit)
          .map((r) => ({ id: r.userId, name: name(r.userId), value: r.wins, extra: 0 })),
      );
    }
    // servers: average daily score of each server's best 10 today, 3+ players
    const by = new Map<string, number[]>();
    for (const r of this.daily.values()) {
      if (r.day !== day || !r.done) continue;
      by.set(r.serverId, [...(by.get(r.serverId) ?? []), r.score]);
    }
    return rank(
      [...by]
        .filter(([, s]) => s.length >= SERVER_MIN_PLAYERS)
        .map(([id, s]) => {
          const top = [...s].sort((a, b) => a - b).slice(0, SERVER_TOP);
          return { id, name: this.servers.get(id) ?? "a server", value: Math.round((top.reduce((x, y) => x + y, 0) / top.length) * 100) / 100, extra: s.length };
        })
        .sort((a, b) => a.value - b.value || b.extra - a.extra)
        .slice(0, limit),
    );
  }
}
