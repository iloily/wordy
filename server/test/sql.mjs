// Runs supabase/migrations in PGlite (Postgres in WASM) and checks the SQL
// functions follow the same rules as MemoryBackend (backend.ts).
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "..", "supabase", "migrations");
const db = new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role;");
for (const f of fs.readdirSync(dir).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
// running them twice must be harmless
for (const f of fs.readdirSync(dir).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));

let problems = 0;
const check = (label, ok, extra) => {
  if (ok) console.log(`  ok   ${label}`);
  else { problems++; console.log(`  FAIL ${label}`, extra ?? ""); }
};
const q = async (s, p = []) => (await db.query(s, p)).rows;
const start = (d, u, s) => q("select * from words_start_daily($1,$2,$3,$4,$5,now())", [d, u, u, s, s + " name"]);
const fin = async (d, u, won, score, sec) => (await q("select words_finish_daily($1,$2,'{a}',$3,$4,$5) as ok", [d, u, won, score, sec]))[0].ok;
const board = (k, s, d, w) => q("select * from words_board($1,$2,$3,$4,50)", [k, s, d, w]);

console.log("sql");
await start(1, "alice", "s1");
check("finish once", (await fin(1, "alice", true, 3, 10)) === true);
check("not twice", (await fin(1, "alice", true, 3, 10)) === false);
const r = await start(1, "alice", "s2");
check("start again returns the finished row", r[0].done && r[0].server_id === "s1");
await start(2, "alice", "s1"); await fin(2, "alice", true, 2, 5);
await start(2, "bob", "s1"); await fin(2, "bob", false, 7, 50);
await start(2, "cara", "s2"); await fin(2, "cara", true, 1, 5);
await start(2, "dan", "s1"); await fin(2, "dan", true, 4, 5);
const [a] = await q("select * from words_players where user_id='alice'");
check("stats match applyDaily", a.played === 2 && a.wins === 2 && a.streak === 2 && a.best_streak === 2 && JSON.stringify(a.dist) === "[0,1,1,0,0,0,0]" && a.total_score === 5, a);
const [b] = await q("select * from words_players where user_id='bob'");
check("loss counted as miss", b.streak === 0 && JSON.stringify(b.dist) === "[0,0,0,0,0,0,1]");
check("today global", (await board("today", null, 2, 0)).map((x) => x.id).join() === "cara,alice,dan,bob");
check("today this server", (await board("today", "s1", 2, 0)).map((x) => x.id).join() === "alice,dan,bob");
check("streaks", (await board("streaks", null, 2, 0)).map((x) => x.id).join() === "alice,cara,dan");
check("streak gone after a missed day", (await board("streaks", null, 4, 0)).length === 0);
check("all time needs 10", (await board("alltime", null, 2, 0)).length === 0);
const sv = await board("servers", null, 2, 0);
check("servers: 3+ players, average of best 10", sv.length === 1 && sv[0].id === "s1" && Number(sv[0].value) === 4.33, sv);
await q("select words_freeplay_win(0,'eve','eve','s3','s3 name')");
await q("select words_freeplay_win(0,'eve','eve','s3','s3 name')");
const fp = await board("freeplay", null, 2, 0);
check("freeplay wins", fp.length === 1 && fp[0].id === "eve" && Number(fp[0].value) === 2);
check("freeplay this server", (await board("freeplay", "s1", 2, 0)).length === 0);
console.log(`\n=== ${problems} problem(s) ===`);
process.exit(problems ? 1 : 0);
