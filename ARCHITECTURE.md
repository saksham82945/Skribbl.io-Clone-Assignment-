# Architecture

```
 Browser (React)                                   Node.js server
┌──────────────────────────────┐   Socket.IO   ┌──────────────────────────────────────┐
│ pages: Home / Lobby / Game   │  (WebSocket)  │ MessageHandler  validate + authorise │
│ Zustand store  ◄─ events ────┼───────────────┼─ Room          membership, broadcast│
│ canvasModel    ◄─ draw_data ─┼───────────────┼─ Game          state machine, timers│
│ Canvas (pointer → strokes) ──┼─ draw_* ─────►│  ├─ WordBank    word options         │
│ Chat (guess / chat) ─────────┼─ guess ──────►│  └─ utils       match, hints, score  │
└──────────────────────────────┘               │ RoomManager     rooms by code        │
                                               └──────────────────────────────────────┘
```

**Core rule: the server holds all the state.** Clients send *intents* (for example "I guessed X" or "I drew these points"). The server checks them, updates state, and tells clients what happened. The secret word is never sent to a player who shouldn't see it.

`shared/types.ts` defines every event name and payload. Socket.IO's generic `Server<ClientToServerEvents, ServerToClientEvents>` then makes client/server mismatches a compile error. The file lives in both packages (`server/src/shared/` and `client/src/shared/`), so each folder is self-contained and can be deployed on its own. `server/tests/sharedTypes.test.ts` fails if the two copies ever differ.

---

## 1. Drawing: capture → send → render

**Capture (drawer only)**, in `client/src/components/Canvas.tsx`:
1. Pointer events, so mouse, touch and pen all work. The canvas has `touch-action: none`.
2. Coordinates are **normalised to 0–1** (`(clientX - rect.left) / rect.width`). The canvas has a fixed 800×600 backing store and CSS scales it, so a stroke looks the same on a phone and on a 4K monitor.
3. `getCoalescedEvents()` recovers the high-frequency points browsers merge together. Points closer than 0.2% of the canvas to the previous one are dropped.

**Send.** A stroke becomes three kinds of event:

| event | payload | when |
|---|---|---|
| `draw_start` | `{ strokeId, x, y, color, size, tool }` | pointer down |
| `draw_move` | `{ strokeId, points: [x,y][] }` | batched every **30 ms** (not every mousemove). The single-point `{ x, y }` form from the brief is accepted too |
| `draw_end` | `{ strokeId }` | pointer up |

Batching cuts traffic from one message per ~4 ms mousemove to about 33 messages per second, and still looks live.

**Server.** `Game.drawStart/drawMove`:
- Rejects anyone who isn't the current drawer or isn't in the `drawing` phase.
- Clamps coordinates and size, and checks the colour is a valid hex value.
- Caps points per message, points per stroke, and strokes per turn.
- Appends the points to `strokes[]` and broadcasts them as `draw_data` to **everyone, including the drawer**, as the brief asks.

**Render.** `client/src/lib/canvasModel.ts` holds the stroke list outside React, so events that arrive before the canvas mounts aren't lost.
- New points are drawn **incrementally** (only the new segment).
- **Undo, clear and late-join** trigger a full redraw from the stroke list.
- The drawer's own strokes are drawn locally straight away (an optimistic update), so there's no round-trip lag. `canvasModel.startLocal` remembers their ids, and the echo that comes back in `draw_data` is skipped, so nothing is drawn twice.
- **Fill bucket** is a one-point stroke (`tool: 'fill'`). Rendering it runs a scanline flood fill on the pixels (`lib/floodFill.ts`). Because every client replays the same strokes in the same order, every client ends up with the same picture.
- **Eraser** is a normal stroke drawn with `globalCompositeOperation = 'destination-out'`.

**Undo / clear / late join.** The server's `strokes[]` is the single source of truth:
- `draw_undo` pops the last stroke and broadcasts `{ strokeId }` to everyone, including the drawer.
- `canvas_clear` empties the list.
- A player who joins or reconnects mid-turn receives `canvas_state { strokes }`.

## 2. Game state: rounds, turns and scoring

`server/src/models/Game.ts` is a state machine:

```
lobby ─start─► choosing ─word_chosen / 15 s auto-pick─► drawing ─┬─ time up ──────┐
                  ▲                                               ├─ all guessed ──┤
                  │                                               └─ drawer left ──┤
                  └──────────── next drawer (5 s) ◄──── turn_end ◄─────────────────┘
                                          │ no drawers left this round & round == max
                                          ▼
                                      game_over ─host─► lobby
```

- **Round vs turn.** A *round* means every connected player draws once. `drawQueue` is built at the start of each round, so players who join mid-game draw from the next round. Players who have disconnected are skipped.
- **Timers live only on the server.** A single `setTimeout` ends each phase, and a 500 ms ticker reveals hints. Clients receive `timeLeftMs` in `game_state` and count down locally. This avoids per-second broadcasts and clock-skew problems.
- **Personalised state.** `stateFor(player)` sends `word` only to the drawer, to players who have already guessed, and to everyone during `turn_end`. Everyone else gets `hints` (e.g. `__a__`), or nothing in Hidden mode.
- **Scoring** (`utils/scoring.ts`):
  - A guesser gets `max(50, 500 × timeLeft / drawTime)`, plus a bonus of +50, +25 or +10 for the first three correct guessers. Faster guesses earn more, and the first correct guess always earns the most.
  - The drawer gets `250 × correctGuessers / totalGuessers`, so they're rewarded for drawing something people can recognise.
- **Hints** (`utils/hints.ts`):
  - `n` hints are spread over `drawTime × i/(n+1)`. For example, 80 s with 2 hints reveals letters at about 27 s and 53 s.
  - Each hint reveals one random hidden letter. Hints never reveal more than half the letters.
- **Edge cases:**
  - Drawer leaves → the turn ends immediately (`drawer_left`).
  - A guesser leaves → the server re-checks whether everyone remaining has guessed.
  - Fewer than 2 seats left → `game_over`.
  - Host leaves → the next player becomes host.

## 3. How WebSockets are used

Socket.IO gives us rooms, reconnection, acks and automatic fallback to long-polling.

- Each game room is a Socket.IO room (`socket.join(roomId)`), so `io.to(roomId).emit` reaches everyone in it.
- Personalised messages are sent to a single `socketId`, e.g. `round_start` with the word options for the drawer only, and `game_state` with or without the word.
- **Acks** carry the result of `create_room`, `join_room` and `quick_play`: `{ ok, roomId, playerId, token }` or `{ ok:false, error }`.
- **Reconnect**:
  - Each seat has a secret `token`, which the client keeps in `sessionStorage` (per tab, survives a refresh).
  - When a socket disconnects, its seat is kept for 30 s. Rejoining with the token re-attaches the new socket and sends a snapshot (`game_state` + `canvas_state`).
  - The host crown and score survive.
- **Two-tier state sync**:
  - `room_state` (players, scores, host, settings) is broadcast whenever anything changes. It's small, so the whole thing is sent each time.
  - `game_state` is personalised and sent on phase changes and hint reveals.
  - Event-style messages (`round_end`, `guess_result`, `chat_message`, `draw_data`) drive the UI moments.
- **Security**:
  - `MessageHandler` resolves `socket → (room, player)` and checks the sender's role on every event: host-only for settings, start and kick; drawer-only for drawing and word choice.
  - All strings are sanitised and length-capped.
  - Chat is rate-limited to one message per 250 ms.

Full event list: see `ClientToServerEvents` / `ServerToClientEvents` in `server/src/shared/types.ts` (same file in `client/src/shared/`). It uses the event names from the assignment (`create_room`, `join_room`, `player_joined`, `player_left`, `start_game`, `game_state`, `round_start`, `word_chosen`, `round_end`, `game_over`, `draw_start`, `draw_move`, `draw_end`, `draw_data`, `canvas_clear`, `draw_undo`, `guess`, `guess_result`, `chat`, `chat_message`) plus a few extras (`canvas_state`, `player_ready`, `update_settings`, `kick_player`, `vote_kick`, `report_player`, `rate_drawing`, `quick_play`, `get_public_rooms`, `return_to_lobby`). The payloads match the brief: `game_state` carries `hints`, `round_end` carries `nextDrawer`, `game_over` carries `winner` (plus `winners` for ties), and a wrong guess sends `guess_result { correct: false }` to the guesser only.

## 3b. Automatic players (always a 4-player game)

- **Every room is topped up to 4 players** (`timing.targetPlayers`, capped by the room's max players). `Room.balanceBots()` runs whenever a real player joins or leaves, or the settings change.
  - **Filling up:** automatic players join one at a time, about 0.75–2.25 s apart, with a normal "X joined the room" message.
  - **Making room:** when a real player arrives, an automatic player leaves ("X left the room"). The current drawer is never the one picked to leave.
  - A room closes as soon as no real players are left.
- **They look like real players.** A bot is an ordinary `Player` with `isBot = true` and no socket, but `isBot` is **never sent to clients**. `PlayerDTO` has no such field, and bots get ordinary usernames (`priya_22`, `Liam`, `noah_draws`…) and random avatars. Bots are always "connected" and ready, and they count for turn order, scoring and "everyone guessed".
- **`BotController`** (one per room) receives hooks from `Game`: `onChoosing`, `onDrawing`, `onTurnEnd`. It acts only by calling the same `Game` methods a real player's socket events reach (`chooseWord`, `drawStart/Move/End`, `handleMessage`). That means bots go through the same validation, word matching and anti-leak rules as everyone else.
  - **Drawing:** when a bot draws, it is offered only words from its doodle library (`bots/drawings.ts`, 24 words). It picks one after 1–3 s, then replays the doodle a few points every ~28 ms, so viewers see it being drawn live.
  - **Guessing:** a bot can't see the canvas, so its guesses are simulated. Each bot plans 0–2 wrong guesses (sometimes a one-letter typo, which triggers "close!"). It has an 85% chance of the right answer at 20–75% of the draw time, plus occasional casual chat.
- **Timers:** all bot timers belong to the controller and are cleared at every turn end, game over or room shutdown. `timing.botSpeed` scales them, so tests run bots ~50× faster.
- **Public rooms** (`quick_play`) auto-start 4 s after the room reaches 4 players, and again after each game's results.

## 4. Word matching

`server/src/utils/wordMatch.ts`:

1. **Normalise** both the guess and the word:
   - Unicode NFD, then strip accents (`café` → `cafe`)
   - Lowercase
   - Turn `-` and `_` into spaces
   - Collapse whitespace and trim
2. **Correct** means an exact match after normalisation, so `"  ICE  cream "` matches `ice cream`.
3. **Partial matches are not accepted.** `ice` is not `ice cream`, and `app` is not `apple`.
4. **Close** means a Levenshtein distance of ≤ 1, or ≤ 2 for words of 8+ letters, with a similar length. The guess is shown in chat as normal, and only the guesser gets a private "'aple' is close!" message.
5. **No leaking:**
   - A correct guess is never broadcast as text. Everyone sees "Alice guessed the word!" instead.
   - The drawer, and players who already guessed, chat in a private channel.
   - Their messages are blocked if they contain the word, even with spaces in between (`a p p l e`).
   - `guess` and `chat` go through the same pipeline, so the `chat` event can't be used to bypass the check.

## 4b. Spectators, moderation, languages, replay

- **Spectators** (`join_room { spectator: true }`) are `Player`s with `isSpectator`. They don't take a seat (`Room.isFull` counts active players only) and never enter the draw queue. They're skipped when checking "everyone guessed" and left off the leaderboard. They can chat, but a message containing the word is dropped so they can't leak it.
- **Moderation:**
  - **Kick:** the host removes a player. Their seat token is blocked, so the old tab can't silently reclaim the seat, but they may join again.
  - **Ban:** the host removes a player *and* blocks their browser from the room. Each browser sends a random `deviceId` (localStorage) when joining; a banned one is refused even from a new tab. **Play!** never matches a browser into a room that banned it.
  - **Vote kick:** a majority of the other players removes someone.
  - **Report:** logged on the server; the reporter gets a private acknowledgement.
  - **Mute:** purely client-side. It hides that player's chat for you only.
- **Languages:** `settings.language` selects the word lists (`words/words.{json,es,de,hi}.json`, same categories). Automatic players look up their doodles through `bots/translations.ts`, so a bot draws *árbol* in a Spanish room.
- **Replay:** at `round_end` the client copies the turn's strokes (`lib/replay.ts`). **▶** replays them a few points per frame into a separate `CanvasModel` shown in a modal, so a replay never touches the live board.

## 5. Client state

- **Zustand store** (`client/src/lib/store.ts`): socket listeners are registered once and write into the store; components subscribe to slices of it.
- **Routing**:
  - `/room/:code` is the invite link. A new visitor sees a name/avatar form.
  - A refresh re-joins automatically using the saved token.
- **Countdown**: `useCountdown` turns `timeLeftMs` plus the local receive time into a ticking value.

## 6. Deployment

- **As deployed:** the frontend is on **Vercel** (https://skribbl-io-clone-assignment-client.vercel.app) and the Socket.IO backend is on **Render** (https://skribbl-io-clone-assignment.onrender.com).
  - **Why split:** Vercel and Netlify serve static files and short-lived serverless functions, which can't keep WebSocket connections open. The backend needs a long-running process, so it runs on Render.
  - **Frontend config:** `client/.env.production` gives the build the backend URL (`VITE_SERVER_URL`), and `client/vercel.json` rewrites every path to `index.html` so invite links work.
  - **Backend config:** `CLIENT_ORIGIN` lists the frontend origin so CORS allows the Socket.IO handshake. Without it, the browser blocks the connection and the page stays on "Connecting to server…".
- **Single-service alternative** (`render.yaml`): `npm run build` builds `client/dist` with Vite and bundles `server/dist/index.js` with esbuild. `npm start` runs Express, which serves the static build and Socket.IO on one port. Same origin means no CORS setup is needed.
- **Single instance.** State is in memory, which keeps things simple. Horizontal scaling would need the Socket.IO Redis adapter plus sticky sessions (or WebSocket-only transport), and room state moved out of process memory.

## 7. Testing

138 automated tests, run by `npm test` and in CI (`.github/workflows/ci.yml`).

- **Server unit tests** (`server/tests/*.unit.test.ts`, `utils.test.ts`) drive `Room` and `Game` directly through a `FakeIO` that records every emit (`tests/helpers.ts`), with Vitest fake timers controlling the clock. They cover:
  - every phase transition, auto-pick, the hint schedule, time-up vs all-guessed, scoring order and the drawer's share
  - turn rotation and rounds, tie ranks, and the return to the lobby
  - the anti-leak chat rules and the rate limit
  - draw permissions and input sanitising, undo/clear, late-join snapshots
  - drawer leaving, the reconnect grace period, spectators
  - host handover, vote-kick majority and ban, reports
  - automatic players filling, making way and auto-starting, bot guessing and drawing, languages
- **Server integration tests** (`*.integration.test.ts`) start the real Express + Socket.IO server on a random port and connect `socket.io-client` players.
  - `spec.integration` plays a full game while asserting **every event and payload listed in the brief**.
  - The others cover a 2-player game end to end, seat reclaim by token, solo **Play!** with automatic players, kick/ban, report, spectators, languages, the public room list and full rooms.
- **Client tests** (`client/src/**/*.test.ts(x)`, jsdom + React Testing Library):
  - pure logic: canvas model, echo de-dup, flood fill on raw pixels, replay, storage, room-code parsing
  - components with a mocked socket: top bar hint display, chat guess-vs-chat routing and mute, player ranking and the moderation menu, lobby Start/Ready/settings, the word-choice, turn-end and game-over overlays
 