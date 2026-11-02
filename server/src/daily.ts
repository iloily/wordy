// Which word is today's. Days start at 00:00 UTC. The order is a shuffle keyed
// by a secret seed (WORDY_SEED, baked in at build time), so reading this code
// doesn't tell anyone tomorrow's word. Each run through the list is shuffled
// again, so no word repeats until all of them have been used.

import { createHmac } from "crypto";
import { answers } from "./words";

const DAY = 86_400_000;
export const EPOCH = Date.UTC(2026, 10, 1); // day 0 = 1 Nov 2026
export const dayOf = (now: number) => Math.floor((now - EPOCH) / DAY);
export const dayStart = (day: number) => EPOCH + day * DAY;
// weeks start Monday 00:00 UTC; 2 Nov 2026 is a Monday (day 1)
export const weekOf = (now: number) => Math.floor((dayOf(now) - 1) / 7);
export const weekEnd = (week: number) => dayStart(1 + (week + 1) * 7);

const cycles = new Map<string, string[]>();

function cycle(seed: string, k: number): string[] {
  const key = `${seed}:${k}`;
  let list = cycles.get(key);
  if (list) return list;
  list = [...answers(5)];
  // Fisher-Yates with HMAC-SHA256 as the random source
  let n = 0;
  let buf = Buffer.alloc(0);
  const next = () => {
    if (buf.length < 4) buf = createHmac("sha256", seed).update(`${k}:${n++}`).digest();
    const v = buf.readUInt32BE(0);
    buf = buf.subarray(4);
    return v / 2 ** 32;
  };
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  if (cycles.size > 4) cycles.clear();
  cycles.set(key, list);
  return list;
}

export function dailyWord(day: number, seed: string): string {
  const n = answers(5).length;
  const k = Math.floor(day / n);
  return cycle(seed, k)[((day % n) + n) % n];
}
