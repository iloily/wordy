# wordy

A Root app: guess the hidden word in 6 tries. Everyone in every server gets the
same daily 5-letter word, and the boards are global as well as per server.
Freeplay has 4, 5, 6 and 7-letter words with an optional hard mode.
Pink tile = right spot, lavender = in the word but wrong spot, gray = not in it
(a dot and a triangle on the tiles too, for colorblind players).

## How it fits together

- `networking/src/wordy.proto`: one RPC, `Act(action, JSON payload)`.
- `server/src/`
  - `game.ts`: marking guesses, hard mode, scores, the share grid.
  - `words.ts` + `data/words.json`: the word lists (`npm run words` rebuilds them; see below).
  - `daily.ts`: today's word. Days start 00:00 UTC (day 0 = 1 Nov 2026). The order is a shuffle
    keyed by the secret `WORDY_SEED`, so the public code doesn't give tomorrow's word away.
    No word repeats until every answer has been used.
  - `wordy.ts`: the game. Daily: press start (the clock starts), one ranked try per person
    across all servers. Freeplay games in progress live in Root's KV store.
  - `backend.ts`: what's stored, and `MemoryBackend` (tests, and dev without secrets).
  - `supabase.ts`: the real backend, the shared puzzle-apps Supabase project. Only this
    server talks to it, with the service role key; players' screens never do.
  - `actions.ts`, `service.ts`, `main.ts`: Root wiring. Who's asking always comes from Root's `Client`.
- `supabase/migrations/`: wordy's tables and functions (all named `words_*`).
- `client/src/`: React. `Daily.tsx`, `Free.tsx`, `Boards.tsx`, `Me.tsx`, `Grid.tsx` (tiles + keyboard).
  `?mock` in dev (`npm run client`, then open `/?mock`) runs a fake server in the browser.

## Scoring and boards

A daily score is guesses used (1-6, a miss counts as 7), then seconds. Boards, each global or
this server: **today**, **streaks** (daily wins in a row), **all time** (average score, 10+
dailies), **freeplay** (wins this week, weeks start Monday 00:00 UTC) and **servers** (average
score of a server's best 10 today, 3+ players). "This server" means players who have played here.

## Words

From SCOWL via the `wordlist-english` package (see `NOTICE-words.txt`). Answers are everyday
words (SCOWL levels 10 and 20) without plurals or "-ed" forms of other common words, minus a
blocklist; any word up to level 70 is accepted as a guess. 893 five-letter answers, about 2.4
years of dailies before the order reshuffles. Edit the blocklists in `scripts/make-words.js`
and run `npm run words`.

## Secrets (never commit them)

`scripts/config.js` writes `server/src/config.ts` before every server build from `.wordy.env`
(PC) or the environment (GitHub Actions):
- `WORDY_SEED`: long random text. Never change it after launch, or the daily order reshuffles.
- `SUPABASE_URL`, `SUPABASE_KEY`: the shared project's URL and service role key.

Without them the server uses a dev seed and an in-memory board (fine for the devhost and tests).

## Test

`npm run build && npm test` must end `=== 0 problem(s) ===` twice: `server/test/run.js` (game,
boards, actions) and `server/test/sql.mjs` (the migrations in PGlite, same rules as `MemoryBackend`).

## Publish

Uploads go through GitHub Actions ("upload to root", `.github/workflows/upload.yml`), since
the cloud can't reach Root's upload service. It needs the repo secrets `ROOT_AUTH_TOKEN`,
`WORDY_SEED`, `SUPABASE_URL` and `SUPABASE_KEY`, and refuses to upload without them. Start it from
the Actions tab, by pushing to the `upload` branch, or with a `v*` tag. Bump `version` in
`root-manifest.json` and `package.json` for every upload. Uploading doesn't release: press
Release in the developer portal. Ask ilo before any upload.
