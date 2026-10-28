# Logisim Circuit Bot (React web app)

React + Vite version of the circuit bot. Type what circuit you need, watch it
build step by step, click pins to simulate it live, then save a Logisim
`.circ` file. When a Gemini API key is configured, a small server function
lets the bot understand looser wording and answer questions; without one it
uses keyword matching.

## Run locally

```
cd frontend
npm install
cp .env.example .env   # then paste your Gemini key into .env (optional)
npm run dev            # http://localhost:5173 -- serves the app and /api/chat
```

Get a free Gemini key at https://aistudio.google.com/apikey. Without a key the
app still works, using keyword matching only.

## Deploy (GitHub + Vercel)

The code lives on GitHub; Vercel builds the site and runs `api/chat.js` as a
serverless function, redeploying on every push.

1. Push this repo to GitHub.
2. On vercel.com, **Add New → Project**, import the GitHub repo.
3. Set **Root Directory** to `frontend` (Vercel detects Vite automatically).
4. Under **Environment Variables**, add `GEMINI_API_KEY` (and optionally
   `GEMINI_MODEL`). Never put the key in code or in a `VITE_` variable.
5. Deploy. Every later `git push` redeploys automatically.

Keep the Gemini project on the free tier (no billing enabled): anyone who finds
the site can send messages, so the free quota is the spending cap. (A Google AI
Pro / Gemini app subscription doesn't change API limits -- the API is billed
separately.)

### Usage limits

- `api/chat.js` allows each visitor 6 AI messages a minute and 60 a day
  (`LIMITS`). Counts are kept in memory, so they're best-effort; for a hard
  limit add a Vercel **Firewall → Rate limiting** rule on `/api/chat`.
- When a visitor is limited, or Gemini's own quota runs out, the bot says so and
  answers with the keyword matcher instead. Circuits, simulation and `.circ`
  files never need the AI.

## Other builds

```
npm run build          # static build into dist/ (no AI: keyword matching only)
npm run build:single   # also writes dist/logisim-circuit-bot.html
```

`dist/logisim-circuit-bot.html` is the whole app in one file: double-click it
to open it in any browser, or send it to someone. No Node, server or internet
needed. Static hosts (GitHub Pages, Netlify Drop) can serve `dist/` too, but
without the AI, since they can't run `api/chat.js`.

## Layout

```
api/
  chat.js                    POST /api/chat: holds the Gemini key, returns {reply, intent, circuitKey}
src/
  App.jsx                    top-level state: chat messages, current circuit, input pins
  components/
    TopBar.jsx               title + theme toggle
    ChatPanel.jsx            chat log + input box
    CircuitPanel.jsx         right-hand panel (canvas, caption, controls, pseudocode, save)
    CircuitCanvas.jsx        SVG schematic: build animation + live simulation
    PlaybackControls.jsx     play / pause / step / skip / speed
  hooks/
    useBuildPlayback.js      step-by-step build animation state + timers
    useTheme.js              light/dark theme (follows the OS until toggled)
  lib/
    simulator.js             gate-level simulator + build-stage ordering (no React)
    aiChat.js                calls /api/chat; throws so callers can fall back
    chatbot.js               keyword matcher: message -> reply + circuit
    download.js              save a text file to the user's downloads
  data/
    circuits.json            circuit library dumped from app/circuits.py -- don't hand-edit
    index.js                 exports the library
vite.config.js               also serves api/chat.js during `npm run dev`
```

Where new features usually go:

- **New circuit**: add it to `src/data/circuits.json` (components, wires,
  size, `.circ` XML, meta, build steps, info) and a keyword rule in
  `lib/chatbot.js`. The AI picks it up automatically from the library.
- **Smarter chat**: change the prompt or response fields in `api/chat.js`.
  Keep the keyword fallback in `lib/chatbot.js` working.
- **New page or panel**: add a component in `components/` and render it from
  `App.jsx`. Add `react-router` once there is more than one page.
