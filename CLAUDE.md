# wordy — notes for Claude

Root app (rootapp.com), daily word game with global boards. Read README.md first.

- Never commit `server/src/config.ts` or `.wordy.env` (secrets). Never print them.
- Don't upload or release without ilo saying so. Upload = GitHub Actions workflow.
- Root app servers run one per community: `rootServer.community.communities.get()` is "this server".
- Never change `WORDY_SEED` or `EPOCH` in daily.ts after launch: it changes every day's word.
- The SQL in supabase/migrations must follow the same rules as `MemoryBackend` in
  server/src/backend.ts; `server/test/sql.mjs` checks both. Change both together.
- The Supabase project is shared with ilo's other puzzle apps (puzzles, Block Blitz,
  Crowned). Only touch tables and functions named `words_*`.
- Not Wordle: own name, colours and word list. Don't use the Wordle name or its answers.
