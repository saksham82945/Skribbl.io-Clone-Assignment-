# scribble.io — a skribbl.io clone

A real-time multiplayer drawing and guessing game. Players join a room, take turns drawing a secret word, and everyone else races to guess it in the chat.

**Always a 4-player game, even alone:** every room (public or private) is topped up to 4 players with *automatic players*. They look like ordinary players: normal usernames, avatars, no "bot" label. They join one by one, guess (sometimes wrongly), chat, and draw real doodles on their turn. When a real friend joins, one automatic player leaves to make room.

**▶ Play it live: https://skribbl-io-clone-assignment-client.vercel.app**

- Backend: https://skribbl-io-clone-assignment.onrender.com (health check: `/health`); see [Deployment](#deployment)
- Repository: https://github.com/saksham82945/Skribbl.io-Clone-Assignment-
- The backend is on Render's free tier: if the page says *Connecting to server…*, it is waking up; give it ~30 seconds.

**Tech:** React + TypeScript + Vite · HTML5 Canvas · Node.js + Express · Socket.IO · Vitest + Testing Library

---

## Requirements checklist

Every item from the assignment brief, with where it lives and how it's tested.
✅ = implemented and covered by an automated test.

### Core requirements

| # | Requirement | Status | Where | Tested in |
|---|---|---|---|---|
| 1 | Multiplayer rooms: create/join, public & private | ✅ | `RoomManager`, `Room`, `MessageHandler` | `spec.integration` (Room & Lobby) |
| 2 | Turn-based drawing: one drawer, others guess | ✅ | `Game` state machine | `game.unit` (turn flow) |
| 3 | Real-time canvas sync via WebSockets | ✅ | `Canvas.tsx` → `draw_*` → `draw_data` | `spec.integration`, `game.integration` |
| 4 | Word system: drawer picks from a list; others see hints/blanks | ✅ | `WordBank`, `Game.stateFor` | `game.unit`, `TopBar.test` |
| 5 | Scoring, leaderboard, winner | ✅ | `utils/scoring`, `Game.endGame` | `game.unit`, `utils.test`, `BoardOverlay.test` |
| 6 | WebSockets for drawing, guesses, chat, game state | ✅ | Socket.IO, `shared/types.ts` contract | `spec.integration` |

### Room & lobby

| Feature | Status | Notes |
|---|---|---|
| Create room with settings | ✅ | players, rounds, draw time, word count, hints, word mode, language, category, custom words, visibility |
| Join via link or room code | ✅ | `/room/ABC123`; codes are case-insensitive; a pasted link works too |
| Lobby: players, ready-up, host starts | ✅ | automatic players are always ready; spectators don't need to be |
| Private room (invite-only link) | ✅ | not listed publicly |
| Public room (join random/open) | ✅ | **Play!** matchmaking + public room list with **Join** / **Watch** |

### Game flow

| Feature | Status | Notes |
|---|---|---|
| Word selection (1 of N, 1–5) | ✅ | auto-pick after 15 s if the drawer is AFK |
| Drawing synced in real time | ✅ | batched every 30 ms, normalised coordinates |
| Guessing in chat; first correct guess scores | ✅ | first guesser gets the most (speed + order bonus) |
| Hints: reveal letters over time | ✅ | evenly spaced, never more than half the word |
| Round end: time out or word guessed → next drawer | ✅ | ends early when everyone guessed |
| Game end: winner + leaderboard | ✅ | ties share a rank; auto-return to lobby after 12 s |

### Drawing tools

| Brush | Colours | Sizes | Eraser | Undo | Clear (drawer only) | Fill bucket (extra) |
|---|---|---|---|---|---|---|
| ✅ | ✅ 22 | ✅ 4 | ✅ | ✅ Ctrl+Z | ✅ server-enforced | ✅ |

### Chat & guessing

| Feature | Status | Notes |
|---|---|---|
| Guess input checked on the server | ✅ | case/space/accent-insensitive, no partial matches |
| General chat | ✅ | drawer + players who guessed have a private channel so the word can't leak |
| "PlayerX guessed the word!" | ✅ | the word itself is never broadcast |
| Hint display | ✅ | `_ _ a _ _` with letter counts |

### Room settings (host-configurable)

| Max players 2–20 | Rounds 2–10 | Draw time 15–240 s | Word count 1–5 | Hints 0–5 / off | Word mode Normal/Hidden/Combination |
|---|---|---|---|---|---|
| ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

All values are clamped on the server, whatever the client sends (`utils/sanitize`, tested).

### WebSocket events (all from the brief, same names and payloads)

`create_room {hostName, settings}` · `join_room {roomId, playerName}` · `player_joined {player, players}` · `player_left {playerId, players}` · `start_game` · `game_state {phase, round, drawerId, word, hints}` · `round_start {drawerId, wordOptions, drawTime}` · `word_chosen {word}` · `round_end {word, scores, nextDrawer}` · `game_over {winner, leaderboard}` · `draw_start {x, y, color, size}` · `draw_move {x, y}` (a batched `{strokeId, points}` form is also accepted) · `draw_end` · `draw_data` (to everyone, including the drawer) · `canvas_clear` · `draw_undo` · `guess {text}` · `guess_result {correct, playerId, playerName, points}` · `chat {text}` · `chat_message {playerId, playerName, text}`

`server/tests/spec.integration.test.ts` plays a whole game and checks every one of these payloads.

### Functional checklist

- **Must have:** all ✅
- **Should have:** hints ✅, chat ✅, draw-time countdown ✅, private rooms ✅
- **Nice to have:** word categories ✅, eraser ✅, kick/ban ✅ (host **Kick** removes a player; host **Ban** also blocks that browser from rejoining the room), votekick ✅, multiple languages for the word list ✅ (English, Español, Deutsch, Hinglish)

### Bonus ideas

| Idea | Status |
|---|---|
| OOP WebSocket server (`Room`, `Game`, `Player`, `MessageHandler`, …) | ✅ |
| Room settings: draw time, rounds, word count, hints | ✅ |
| Word modes: Normal, Hidden, Combination | ✅ |
| Moderation: kick, ban, votekick, report | ✅ player **⋯** menu: Kick / Ban (host), Vote kick, Report, plus a local-only **Mute** |
| Custom word list | ✅ |
| Avatars | ✅ customiser with 48 faces, 16 colours, 6 patterns, 8 hats and 5 idle animations; slot-machine 🎲 randomizer, fun-name 🎲, animated picker; shown in the lobby, game and podium |
| Spectator mode | ✅ (**Watch** from the public list, or tick "Just watch" on an invite link) |
| Replay last round's drawing | ✅ (**▶** in the top bar re-animates the previous turn) |

### Deliverables

| Deliverable | Status |
|---|---|
| Working app, locally and deployed | ✅ locally (`npm run dev`) · ✅ live at https://skribbl-io-clone-assignment-client.vercel.app |
| README with setup + live URL | ✅ this file |
| Architecture overview | ✅ [ARCHITECTURE.md](ARCHITECTURE.md) |
| Code walkthrough readiness | ✅ ARCHITECTURE.md has one section per "Code Understanding" topic |

---

## Run locally

Requires Node 18.18+ (20 LTS recommended).

```bash
npm install
npm run dev
```

- Client: http://localhost:5173 (Vite, which proxies `/socket.io` to the server)
- Server: http://localhost:3001

Click **Play!** and automatic players fill the room so you can play straight away. To test with real people, open the invite link in another tab or browser. Each tab gets its own seat.

### Scripts

| Command | What it does |
|---|---|
| `npm test` | Runs **all tests**: server (unit + socket integration) and client (unit + component) |
| `npm run test:server` / `npm run test:client` | One side only |
| `npm run typecheck` | Type-checks client and server |
| `npm run build` | Builds the client (`client/dist`) and bundles the server (`server/dist`) |
| `npm start` | Runs the production server on `$PORT` (default 3001); it also serves the built client |

## Testing

**138 automated tests** run in CI on every push (`.github/workflows/ci.yml`: typecheck → test → build).

| Suite | Kind | What it covers |
|---|---|---|
| `server/tests/utils.test.ts` | unit | word matching (case/trim/accents/partial/close), hints, scoring, settings clamping, word bank |
| `server/tests/game.unit.test.ts` | unit | the game state machine with fake timers: word choice, auto-pick, hint schedule, time-up, scoring order, early end, rotation, rounds, ties, anti-leak chat, rate limit, draw permissions & sanitising, undo/clear, late join, drawer leaving, reconnect grace, spectators |
| `server/tests/room.unit.test.ts` | unit | host handover, settings clamping, vote-kick majority + ban, reports, automatic players filling/leaving, public auto-start |
| `server/tests/bots.unit.test.ts` | unit | automatic players guessing through the chat pipeline, drawing doodles, languages, translation round-trips |
| `server/tests/spec.integration.test.ts` | integration | **every event in the brief** with its payload, over real sockets; full game; kick, report, spectators, languages, public room list, full rooms |
| `server/tests/game.integration.test.ts` | integration | a complete 2-player game over sockets; rejoin with token |
| `server/tests/bots.integration.test.ts` | integration | solo **Play!** fills to 4 and auto-starts; automatic players guess and draw |
| `client/src/lib/*.test.ts` | unit | canvas model, flood fill (pure pixels), replay, storage, room-code parsing |
| `client/src/components/__tests__/*` | component | top bar hints/word display, chat guess-vs-chat routing and mute, player ranking + moderation menu, lobby start/ready/settings, word-choice/turn-end/game-over overlays |

The server unit tests drive `Room` and `Game` through a `FakeIO` that records every emit (`server/tests/helpers.ts`), so they run in milliseconds with fake timers.

## Deployment

**Live:** frontend on **Vercel**, backend (Socket.IO server) on **Render**.

| Part | URL | Host |
|---|---|---|
| Game (frontend) | https://skribbl-io-clone-assignment-client.vercel.app | Vercel |
| Backend (Socket.IO) | https://skribbl-io-clone-assignment.onrender.com (health check: [`/health`](https://skribbl-io-clone-assignment.onrender.com/health)) | Render |

### Backend: Render web service
- **Root Directory:** `server`
- **Build command:** `npm install --include=dev && npm run build`
- **Start command:** `npm start` (Render provides `$PORT`)
- **Environment:** `CLIENT_ORIGIN=https://skribbl-io-clone-assignment-client.vercel.app` (the frontend's origin, allowed by CORS; no trailing slash) and `NODE_VERSION=20`

### Frontend: Vercel
- **Root Directory:** `client` (Vite preset, output `dist`)
- **Backend URL:** `client/.env.production` sets `VITE_SERVER_URL=https://skribbl-io-clone-assignment.onrender.com`, which Vite bakes into the build
- **Invite links:** `client/vercel.json` rewrites every path to `index.html`, so `/room/ABC123` works

### Why split hosting?
Vercel (like Netlify) serves static files and short-lived serverless functions, which **can't keep WebSocket connections open**. So the Socket.IO server runs on Render as a long-running process, and the static frontend runs on Vercel. Because they're on different origins, the backend must allow the frontend via CORS (`CLIENT_ORIGIN`). `client/` and `server/` import nothing from outside themselves, so each deploys on its own.

### Alternative: one Render service
`render.yaml` also describes a single-service deploy: Express serves the built React app and Socket.IO on one origin (build `npm ci --include=dev && npm run build`, start `npm start`, from the repo root). No CORS setup is needed in that case.

### Platform notes
- Game state is kept in memory, so a restart or redeploy ends games in progress, and the backend runs as a single instance. To scale out you'd add Redis with `@socket.io/redis-adapter` and move room state to Redis.
- Render's free tier **sleeps after ~15 minutes idle**. The first visit can then show "Connecting to server…" for ~30 s while the backend wakes up.

## Project structure

```
server/src/
  shared/types.ts          socket event contract + payload types (identical copy in client/src/shared/)
  app.ts                   Express + Socket.IO bootstrap, serves client/dist
  MessageHandler.ts        socket events → Room/Game calls (validation + permissions)
  RoomManager.ts           create / find / list rooms, quick-play matchmaking
  models/Room.ts           membership, host, spectators, moderation, automatic players, broadcasting
  models/Game.ts           state machine: turns, timers, hints, guessing, scoring, strokes
  models/Player.ts         player data + reconnect token
  bots/BotController.ts    automatic players: word choice, animated drawing, guessing & chat
  bots/drawings.ts         the doodle library (shape helpers → normalised strokes)
  bots/translations.ts     doodle words in every supported language
  words/                   WordBank + categorised word lists (en, es, de, hi)
  utils/                   wordMatch, hints, scoring, sanitize (pure functions)
server/tests/              unit tests (FakeIO) + socket integration tests
client/src/
  shared/types.ts          same contract as the server copy (a test keeps them identical)
  lib/store.ts             Zustand store; socket listeners → state; join/leave actions
  lib/canvasModel.ts       stroke list the canvas renders from (outside React)
  lib/floodFill.ts         bucket fill on raw pixels
  lib/replay.ts            replay of the previous turn's drawing
  components/              Canvas, Toolbar, Chat, PlayerList, TopBar, LobbyPanel, BoardOverlay, ReplayModal…
  pages/                   Home, RoomPage (routing/rejoin), GameView
```

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for how WebSockets, the canvas and the game logic fit together.
