// Writes server/src/config.ts before each server build. The values come from
// .wordy.env (on a PC) or the environment (GitHub Actions secrets). Without
// them the server runs on an in-memory board with a dev seed, which is fine
// for tests and the devhost but must never be uploaded (the upload workflow
// checks). Never commit config.ts or .wordy.env.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const env = {};
const file = path.join(root, ".wordy.env");
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
for (const k of ["WORDY_SEED", "SUPABASE_URL", "SUPABASE_KEY"]) if (!env[k] && process.env[k]) env[k] = process.env[k].trim();

const out = `// made by scripts/config.js; do not commit
export const WORDY_SEED = ${JSON.stringify(env.WORDY_SEED || "")};
export const SUPABASE_URL = ${JSON.stringify((env.SUPABASE_URL || "").replace(/\/+$/, ""))};
export const SUPABASE_KEY = ${JSON.stringify(env.SUPABASE_KEY || "")};
`;
fs.writeFileSync(path.join(root, "server", "src", "config.ts"), out);
console.log(`config: seed ${env.WORDY_SEED ? "set" : "missing (dev seed)"}, supabase ${env.SUPABASE_URL && env.SUPABASE_KEY ? "set" : "missing (memory board)"}`);
