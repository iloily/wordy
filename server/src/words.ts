// Word lists (made by scripts/make-words.js from SCOWL; see NOTICE-words.txt).

import data from "./data/words.json";

export const LENGTHS = [4, 5, 6, 7] as const;
export type Length = (typeof LENGTHS)[number];

type Lists = Record<string, { answers: string[]; guesses: string[] }>;
const lists = data as Lists;
const allowed = new Map<number, Set<string>>();
for (const L of LENGTHS) allowed.set(L, new Set([...lists[L].answers, ...lists[L].guesses]));

export const isLength = (n: unknown): n is Length => typeof n === "number" && (LENGTHS as readonly number[]).includes(n);
export const answers = (L: Length): string[] => lists[L].answers;
export const isWord = (w: string): boolean => allowed.get(w.length)?.has(w) ?? false;
