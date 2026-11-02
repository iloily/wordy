// Shapes the server sends (see server/src/wordy.ts).
export type Mark = "h" | "p" | "m";
export type Row = { word: string; marks: Mark[] };
export type DailyView = {
  day: number; number: number; started: boolean; startedAt: number | null; rows: Row[];
  done: boolean; won: boolean; score: number; seconds: number; answer: string | null; share: string | null; nextAt: number;
};
export type FreeGame = { length: number; hard: boolean; rows: Row[]; done: boolean; won: boolean; answer: string | null; weekWins: number } | null;
export type FreeState = { game: FreeGame; weekWins: number };
export type BoardKind = "today" | "streaks" | "alltime" | "freeplay" | "servers";
export type BoardRow = { rank: number; id: string; name: string; server?: string; value: number; extra: number };
export type Board = { kind: BoardKind; scope: "global" | "server"; rows: BoardRow[]; me: BoardRow | null; resetsAt: number | null };
export type Stats = {
  played: number; wins: number; winRate: number; streak: number; bestStreak: number; average: number | null; dist: number[]; weekWins: number;
};
