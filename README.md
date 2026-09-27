# Second Brain

A private personal planning app with tasks, freeform tags, events, a journal, configurable trackers, markdown memory, and Gemini-assisted plans. Built with React 19, TypeScript, Vinext, Tailwind, Radix primitives, Motion, Cloudflare Workers and D1. An Android app shares the interface and keeps its data in local SQLite.

## Version 1.2

Tracker replaces All tasks in navigation. Track quantity, duration, count, score, events, yes/no, or time intervals with units, goals, daily/weekly/monthly frequency, notes and tags. Aggregations include sum, average, count, latest, maximum, streak and percentage. View day, week, month, year or custom periods, filter by category, and compare previous periods. Charts and summaries include progress, trends, calendar heatmaps, distributions, streaks, consistency and goal completion; selected metric pairs provide accuracy or a rate per hour.

Today keeps completed tasks visible with their checkboxes checked. Upcoming normally shows pending current, future and undated tasks; select a past calendar date to see tasks from that date, including completed tasks. Task labels use relative dates such as Tomorrow or Completed yesterday. The floating button opens chat, and chat places user and assistant messages on opposite sides.

Settings includes a memory editor with markdown import/export. Memory files are named markdown documents stored in the database, not automatically synchronized files on disk. The assistant receives a small metadata catalog and can recall relevant contents; the chat attachment button can include selected memories explicitly. The assistant can propose creating, changing or deleting tasks, journal entries, trackers, measurements and memories. Changes take effect when the user applies the proposal. Every request includes its sent timestamp and timezone; `/t` shows the current local date and time.

## Run locally

Use Node 22.13+ and install the locked dependencies with `npm run install:ci`. Copy `.env.example` to `.dev.vars`, supply a strong random `KEY_ENCRYPTION_SECRET`, and leave `GEMINI_API_KEY` empty if you want to connect a user key in Settings. Keep `.dev.vars` and `.env` private.

1. `npm run build`
2. Apply each pending migration once with `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_plain_starfox.sql`, then run the same command with `--file drizzle/0001_metrics_memory.sql`. Existing databases need only their pending migrations.
3. `npm run dev`, then open the printed URL. Local development has an explicit local-only sign-in simulation. Hosted identity comes from the trusted Sites dispatcher.

On Windows, if the npm launcher cannot find its installation, run npm's `npm-cli.js` with Node directly, or use `node scripts/run-framework.mjs dev` / `build`.

## Gemini

Connect a Gemini key in Settings. The backend checks it with Google and stores AES-GCM ciphertext bound to the current user. The original key is never returned to the client, put in browser storage, or bundled into client code. `KEY_ENCRYPTION_SECRET` is a server runtime secret and must be backed up and preserved across deployments. Rotating it requires re-encrypting keys or asking users to reconnect.

`GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`; it is configurable server-side. The service supplies bounded profile, task, journal, history, follow-up, tracker and memory metadata context, plus recalled or attached memory contents. Google receives this context only when the user sends a message. Structured responses are validated again before appearing as proposed changes. Accepting a proposal runs all changes in a single D1 transaction; duplicate and concurrent acceptance cannot duplicate objects.

## Data and security

Every read and write is scoped to the authenticated user. Missing identity is rejected. Mutation requests reject cross-origin browser calls. SQL uses prepared statements and schema changes use Drizzle migrations. Key validation and AI calls are rate limited. Tasks and journal entries survive sessions; browser storage is not authoritative for product data. Private Sites restrict the app audience to its owner.

Reminders appear while the app is open. Closed-app push notifications and offline editing are not included. The app needs a connection to save. Forms retain input on save errors. The journal view shows the latest 100 entries and assistant history the latest 40 messages; older records remain in D1.

## Verification

- `node --test tests/domain.test.mjs tests/crypto.test.mjs tests/task-views.test.mjs tests/tracking.test.mjs`
- `node node_modules/typescript/bin/tsc --noEmit`
- Build, then run the built Worker locally on port 8787 with `npm start -- --port 8787`.
- `node --test tests/api.test.mjs tests/apply.test.mjs` checks actual local Worker/D1 behavior, per-user isolation, validation, persistence, errors, and concurrent proposal application. It uses synthetic users and local-only fixture records. Never point these tests at a live deployment.
- Desktop, tablet and Android-size browser checks cover capture, completion, reload, journal, Settings, keyboard focus, reduced motion, and layout overflow. Version 1.2 also has eight Android integration tests for migration, tracker and memory operations, timestamps, proposal application and rollback; all passed on the connected device. Live Gemini network generation was not exercised for this update.

See DESIGN.md and THIRD_PARTY_NOTICES.md for the visual system and reference attribution.
