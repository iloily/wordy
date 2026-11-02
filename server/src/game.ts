// The guessing rules, with no Root or database code so tests can load them.
// Marks: "h" = right letter, right spot; "p" = in the word, wrong spot; "m" = not in it.

export type Mark = "h" | "p" | "m";
export type Row = { word: string; marks: Mark[] };

export const MAX_GUESSES = 6;
export const MISS_SCORE = 7; // a lost daily counts as 7 guesses

export function mark(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(guess.length).fill("m");
  const left = new Map<string, number>();
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) marks[i] = "h";
    else left.set(answer[i], (left.get(answer[i]) ?? 0) + 1);
  }
  // a repeated letter only counts as many times as the answer has it
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === "h") continue;
    const n = left.get(guess[i]) ?? 0;
    if (n > 0) {
      marks[i] = "p";
      left.set(guess[i], n - 1);
    }
  }
  return marks;
}

// Hard mode: every letter you've found must be used again, greens in place.
export function hardProblem(rows: Row[], guess: string): string | null {
  for (const r of rows) {
    for (let i = 0; i < r.word.length; i++) {
      if (r.marks[i] === "h" && guess[i] !== r.word[i]) return `letter ${i + 1} has to be ${r.word[i].toUpperCase()}`;
    }
    const need = new Map<string, number>();
    r.word.split("").forEach((c, i) => {
      if (r.marks[i] !== "m") need.set(c, (need.get(c) ?? 0) + 1);
    });
    for (const [c, n] of need) {
      const have = guess.split("").filter((g) => g === c).length;
      if (have < n) return `your guess has to use ${c.toUpperCase()}`;
    }
  }
  return null;
}

export const rowsOf = (guesses: string[], answer: string): Row[] => guesses.map((word) => ({ word, marks: mark(word, answer) }));

// Score for the boards: guesses used, or MISS_SCORE for a loss. Lower is better.
export const scoreOf = (won: boolean, guesses: number) => (won ? guesses : MISS_SCORE);

// Spoiler-free result grid people can paste in chat.
export function grid(title: string, rows: Row[], won: boolean): string {
  const sq: Record<Mark, string> = { h: "🩷", p: "💜", m: "🤍" };
  const head = `${title} ${won ? rows.length : "X"}/${MAX_GUESSES}`;
  return [head, ...rows.map((r) => r.marks.map((m) => sq[m]).join(""))].join("\n");
}
