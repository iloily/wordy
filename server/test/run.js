// Offline checks for Wordy: fake clock, in-memory backend and KV store.
// Run with `npm test` (builds first). Must end "=== 0 problem(s) ===".

const { mark, hardProblem, rowsOf, grid } = require("../dist/game");
const { dailyWord, dayOf, weekOf, EPOCH, dayStart } = require("../dist/daily");
const { answers, isWord } = require("../dist/words");
const { MemoryBackend, applyDaily, emptyPlayer } = require("../dist/backend");
const { MemoryStore } = require("../dist/store");
const { Wordy } = require("../dist/wordy");
const { handlers, dispatch, cleanName } = require("../dist/actions");

let problems = 0;
function check(label, ok, extra) {
  if (ok) console.log(`  ok   ${label}`);
  else {
    problems++;
    console.log(`  FAIL ${label}`, extra ?? "");
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function throws(label, p, text) {
  try {
    await p;
    check(label, false, "did not throw");
  } catch (e) {
    check(label, !text || String(e.message).includes(text), e.message);
  }
}

(async () => {
  console.log("marks");
  check("all right", eq(mark("crane", "crane"), ["h", "h", "h", "h", "h"]));
  check("none", eq(mark("bumpy", "crane"), ["m", "m", "m", "m", "m"]));
  check("wrong spot", eq(mark("nacre", "crane"), ["p", "p", "p", "p", "h"]));
  // the answer's one E is used by the green, so the other Es are misses
  check("double letter, one in answer", eq(mark("eerie", "crane"), ["m", "m", "p", "m", "h"]), mark("eerie", "crane"));
  check("stray repeat marked once", eq(mark("speed", "abide"), ["m", "m", "p", "m", "p"]), mark("speed", "abide"));
  check("green takes the letter first", eq(mark("geese", "those"), ["m", "m", "m", "h", "h"]), mark("geese", "those"));
  check("two in guess, two in answer", eq(mark("lolly", "llama"), ["h", "m", "p", "m", "m"]), mark("lolly", "llama"));

  console.log("hard mode");
  const rows = rowsOf(["crane"], "cider");
  check("must keep green", hardProblem(rows, "trace")?.includes("letter 1"), hardProblem(rows, "trace"));
  check("must reuse yellow", hardProblem(rows, "cloth")?.includes("R") || hardProblem(rows, "cloth")?.includes("E"), hardProblem(rows, "cloth"));
  check("ok guess passes", hardProblem(rows, "cried") === null, hardProblem(rows, "cried"));

  console.log("words");
  check("about 900 five-letter answers", answers(5).length > 850, answers(5).length);
  check("answers are guessable", answers(5).every(isWord));
  check("lowercase a-z only", [4, 5, 6, 7].every((L) => answers(L).every((w) => w.length === L && /^[a-z]+$/.test(w))));
  check("no blocked word", !answers(5).includes("bitch") && !answers(4).includes("shit"));
  check("not a word", !isWord("zzzzz") && isWord("crane"));

  console.log("daily order");
  check("day 0 is 1 Nov 2026", dayOf(Date.UTC(2026, 10, 1, 12)) === 0 && dayOf(Date.UTC(2026, 10, 2)) === 1);
  check("same seed, same word", dailyWord(5, "s1") === dailyWord(5, "s1"));
  check("other seed, other order", [0, 1, 2, 3, 4, 5, 6].some((d) => dailyWord(d, "s1") !== dailyWord(d, "s2")));
  const n = answers(5).length;
  const cycle = new Set(Array.from({ length: n }, (_, d) => dailyWord(d, "s1")));
  check("no repeat in one run of the list", cycle.size === n, cycle.size);
  check("weeks start Monday", weekOf(Date.UTC(2026, 10, 2)) === 0 && weekOf(Date.UTC(2026, 10, 8, 23)) === 0 && weekOf(Date.UTC(2026, 10, 9)) === 1);

  console.log("stats");
  let p = emptyPlayer("u", "u");
  p = applyDaily(p, 1, true, 3);
  p = applyDaily(p, 2, true, 4);
  check("streak grows", p.streak === 2 && p.bestStreak === 2);
  p = applyDaily(p, 4, true, 2);
  check("a missed day restarts it", p.streak === 1 && p.bestStreak === 2);
  p = applyDaily(p, 5, false, 7);
  check("a loss ends it", p.streak === 0 && p.played === 4 && p.wins === 3 && eq(p.dist, [0, 1, 1, 1, 0, 0, 1]));

  console.log("daily game");
  let t = Date.UTC(2026, 10, 3, 10); // day 2
  const backend = new MemoryBackend();
  const kv = new MemoryStore();
  const w = new Wordy({ backend, kv, seed: "test", now: () => t, random: () => 0.5 });
  const A = { userId: "alice", name: "alice", serverId: "s1", serverName: "Chill" };
  const B = { userId: "bob", name: "bob", serverId: "s1", serverName: "Chill" };
  const word = dailyWord(2, "test");
  const wrong = answers(5).filter((x) => x !== word);

  let v = await w.dailyGet("alice");
  check("not started yet", !v.started && v.rows.length === 0 && v.answer === null);
  await throws("can't guess before start", w.dailyGuess(A, "crane"), "start");
  v = await w.dailyStart(A);
  check("started", v.started && v.startedAt === t);
  t += 1000;
  await throws("needs 5 letters", w.dailyGuess(A, "cat"), "5 letters");
  await throws("needs a real word", w.dailyGuess(A, "zzzzz"), "word list");
  v = await w.dailyGuess(A, wrong[0]);
  check("guess recorded, answer hidden", v.rows.length === 1 && v.answer === null && !v.done);
  t += 41000;
  v = await w.dailyGuess(A, word.toUpperCase());
  check("win", v.done && v.won && v.score === 2 && v.seconds === 42 && v.answer === word, v);
  check("share grid has no letters", v.share.startsWith("wordy #2 2/6") && !/[a-z]{3}/.test(v.share.split("\n").slice(1).join("")), v.share);
  await throws("one try a day", w.dailyGuess(A, word), "already");
  const again = await w.dailyStart({ ...A, serverId: "s2", serverName: "Other" });
  check("starting in another server shows the same finished game", again.done && again.score === 2);

  await w.dailyStart(B);
  for (let i = 0; i < 6; i++) v = await w.dailyGuess(B, wrong[i]);
  check("six misses = loss scored 7", v.done && !v.won && v.score === 7 && v.answer === word, v);

  console.log("freeplay");
  await throws("length must be 4-7", w.freeNew("alice", 8, false), "4, 5, 6 or 7");
  let f = await w.freeNew("alice", 6, true);
  check("new 6-letter game", f.game.length === 6 && f.game.hard && f.game.rows.length === 0 && f.game.answer === null);
  const g = await kv.get("free:alice");
  check("freeplay never uses today's word", g.answer !== word);
  await throws("wrong length", w.freeGuess(A, "crane"), "6 letters");
  f = await w.freeGuess(A, g.answer);
  check("freeplay win counts for the week", f.game.won && f.weekWins === 1, f);
  await throws("finished game", w.freeGuess(A, g.answer), "over");
  const f4 = await w.freeNew("alice", 4, false);
  check("4 letters works", f4.game.length === 4);

  console.log("boards");
  const C = { userId: "cara", name: "cara", serverId: "s2", serverName: "Other" };
  await w.dailyStart(C);
  t += 5000;
  await w.dailyGuess(C, word);
  let b = await w.board("today", "global", A);
  check("today global: fewest guesses first", eq(b.rows.map((r) => r.id), ["cara", "alice", "bob"]), b.rows);
  b = await w.board("today", "server", A);
  check("today this server", eq(b.rows.map((r) => r.id), ["alice", "bob"]) && b.me?.id === "alice", b.rows);
  b = await w.board("streaks", "global", A);
  check("streaks: winners only", eq(b.rows.map((r) => r.id).sort(), ["alice", "cara"]));
  b = await w.board("freeplay", "global", A);
  check("freeplay week board", b.rows[0]?.id === "alice" && b.rows[0].value === 1);
  b = await w.board("servers", "global", A);
  check("servers need 3 players", b.rows.length === 0, b.rows);
  for (const u of ["dan", "eve"]) {
    const who = { userId: u, name: u, serverId: "s2", serverName: "Other" };
    await w.dailyStart(who);
    await w.dailyGuess(who, word);
  }
  b = await w.board("servers", "global", C);
  check("servers ranked by average", b.rows.length === 1 && b.rows[0].id === "s2" && b.rows[0].value === 1 && b.me?.id === "s2", b.rows);
  b = await w.board("alltime", "global", A);
  check("all time needs 10 games", b.rows.length === 0);

  console.log("next day");
  t = dayStart(3) + 1000;
  v = await w.dailyGet("alice");
  check("new day, fresh board", !v.started && v.day === 3);
  const s = await w.stats("alice");
  check("stats", s.played === 1 && s.wins === 1 && s.streak === 1 && s.dist[1] === 1, s);
  t = dayStart(5);
  check("streak shows 0 after a missed day", (await w.stats("alice")).streak === 0);

  console.log("actions");
  const names = { who: async (id) => ({ userId: id, name: id, serverId: "s1", serverName: "Chill" }) };
  const table = handlers(w, names);
  let r = await dispatch(table, { userId: "zed" }, "daily.start", "");
  check("dispatch ok", r.ok && JSON.parse(r.payload).started);
  r = await dispatch(table, { userId: "zed" }, "daily.guess", JSON.stringify({ word: "qqqqq" }));
  check("game errors reach the player", !r.ok && r.error.includes("word list"));
  r = await dispatch(table, { userId: "zed" }, "nope", "");
  check("unknown action", !r.ok);
  r = await dispatch(table, { userId: "zed" }, "daily.get", "{bad");
  check("bad json", !r.ok);
  check("names cleaned", cleanName("  a​‮b\n c ", "x") === "ab c" && cleanName("", "someone") === "someone" && [...cleanName("x".repeat(80), "")].length === 32);

  console.log(`\n=== ${problems} problem(s) ===`);
  process.exit(problems ? 1 : 0);
})().catch((e) => {
  console.error(e);
  console.log("\n=== 1 problem(s) ===");
  process.exit(1);
});
