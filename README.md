# scribble.io — a skribbl.io clone

A real-time multiplayer drawing and guessing game. Players join a room, take turns drawing a secret word, and everyone else races to guess it in the chat.

**Always a 4-player game, even alone:** every room (public or private) is topped up to 4 players with *automatic players*. They look like ordinary players: normal usernames, avatars, no "bot" label. They join one by one, guess (sometimes wrongly), chat, and draw real doodles on their turn. When a real friend joins, one automatic player leaves to make room.

**Live demo:** _add your deployed URL here, e.g. `https://scribble-clone.onrender.com`_ (see [Deploy](#deploy-render-single-service))

**Tech:** React + TypeScript + Vite · HTML5 Canvas · Node.js + Express · Socket.IO · Vitest + Testing Library

---

## Requirements checklist

Every item from the assignment brief, with where it lives and how it's tested.
✅ = implemented and covered by an automated test. ✅* = implemented; the deployment steps are documented but need your Render account.

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
- **Nice to have:** word categories ✅, eraser ✅, kick/ban ✅ (host kick; a kicked tab can't rejoin with its seat token), votekick ✅, multiple languages for the word list ✅ (English, Español, Deutsch, Hinglish)

### Bonus ideas

| Idea | Status |
|---|---|
| OOP WebSocket server (`Room`, `Game`, `Player`, `MessageHandler`, …) | ✅ |
| Room settings: draw time, rounds, word count, hints | ✅ |
| Word modes: Normal, Hidden, Combination | ✅ |
| Moderation: kick, ban, votekick, report | ✅ (plus a per-player **mute**, local to you) |
| Custom word list | ✅ |
| Avatars | ✅ (face + colour, 🎲 randomizer) |
| Spectator mode | ✅ (**Watch** from the public list, or tick "Just watch" on an invite link) |
| Replay last round's drawing | ✅ (**▶** in the top bar re-animates the previous turn) |

### Deliverables

| Deliverable | Status |
|---|---|
| Working app, locally and deployed | ✅ locally · ✅* deploy: `render.yaml` included; put your live URL at the top of this file |
| README with setup + live URL | ✅ (add the URL after deploying) |
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

**120 automated tests** run in CI on every push (`.github/workflows/ci.yml`: typecheck → test → build).

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

## Deploy (Render, single service)

1. Push this repo to GitHub.
2. On Render, choose **New → Blueprint** and select the repo. `render.yaml` sets everything up.
   Or create a **Web Service** by hand:
   - Build command: `npm ci --include=dev && npm run build`
   - Start command: `npm start`
   - Health check path: `/health`
3. Open the `onrender.com` URL and put it at the top of this README.

Express serves the React build from the same origin, so no CORS or extra config is needed, and Render supports WebSockets natively.

**Split deploy (Vercel/Netlify frontend + Render/Railway backend):** Vercel and Netlify can't hold long-lived WebSocket connections, so the Socket.IO server must still run on Render or Railway.
- Build the client with `VITE_SERVER_URL=https://<your-backend>` set.
- Set `CLIENT_ORIGIN=https://<your-frontend>` on the backend so CORS allows it.
- Add an SPA rewrite (`/* → /index.html`) on the frontend host so invite links work.

**Each folder is self-contained:** `client/` and `server/` import nothing from outside themselves, so either can be deployed on its own (e.g. `server/` as a Render web service and `client/` as a static site).

**Platform notes:**
- Game state is kept in memory, so a restart or redeploy ends games in progress, and the app runs as a single instance. To scale out you'd add Redis with `@socket.io/redis-adapter` and move room state to Redis.
- Render's free tier sleeps after about 15 min idle, so the first request can take about 30 s.

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
