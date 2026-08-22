# Word Kart Pro (Standalone)

A **standalone** sight-word racing game built with modern web tech:

| Layer | Tech |
|-------|------|
| Graphics | **Three.js r170** + bloom post-processing, PBR materials, shadows |
| Physics | **Rapier 3D** (WASM) track collider + dynamic kart body |
| Audio | **Web Audio API** engine, skid, collect & checkpoint sounds + speech |
| Dev / build | **Vite + TypeScript** — fast reload on Mac |
| iPad path | Static build → Safari PWA **or** Capacitor iOS wrapper |

This lives in `word-kart-standalone/` and does **not** depend on the main Reading Trainer app.

---

## Test on your Mac (2 minutes)

### Requirements
- [Node.js 20+](https://nodejs.org/) (`node -v`)

### Run the dev server

```bash
cd word-kart-standalone
npm install
npm run dev
```

Open the URL Vite prints (usually **http://localhost:5173**).

- **Steer:** ← → arrow keys, or click-drag on the track
- **Goal:** Drive through glowing word pads (12 words)
- **Checkpoint:** After word **10**, the race pauses — say the word into your Mac microphone (allow permission when prompted)

### Production-like preview (before iPad deploy)

```bash
npm run build
npm run preview
```

Open **http://localhost:4173** — this is the same bundle you would ship.

### Optional: jump straight to the say-check UI

```
http://localhost:5173/?demoSay=the
```

---

## Deploy to iPad

### Option A — Add to Home Screen (fastest)

1. Run `npm run build`
2. Host the `dist/` folder (Synology, GitHub Pages, or `npm run preview` on your LAN)
3. On iPad Safari, open the URL → **Share → Add to Home Screen**

Works offline if you add a service worker later.

### Option B — Native iOS app with Capacitor (App Store path)

From this folder after `npm run build`:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Word Kart Pro" com.yourname.wordkart --web-dir dist
npx cap add ios
npx cap copy ios
npx cap open ios
```

In Xcode on your Mac:
- Select your Team / signing
- Run on a connected iPad or simulator
- For microphone + tilt: add **Microphone** and **Motion** usage strings in `Info.plist`

---

## Gameplay

- Auto-accelerating kart on a continuous asphalt circuit (painted kerbs, guardrails, sky)
- Collect sight-word pads — each word is spoken aloud
- At **10 words**, pronunciation checkpoint (same as Reading Trainer Word Kart)
- Engine sound reacts to speed; skid noise when turning hard

---

## Project structure

```
word-kart-standalone/
  src/
    game/Game.ts      — main loop, rendering, input
    game/Track.ts     — track mesh + Rapier collider
    game/Kart.ts      — kart mesh + spline physics
    game/AudioEngine.ts
    game/SpeechCheck.ts
    game/WordPads.ts
  index.html
  vite.config.ts
```

---

## Troubleshooting (Mac)

| Issue | Fix |
|-------|-----|
| Microphone not working | Use **Chrome** or **Safari** (not all browsers support speech recognition). Allow mic when prompted. |
| Blank screen | Check terminal for errors; run `npm install` again. |
| Low FPS | Close other GPU-heavy apps; try Chrome with hardware acceleration on. |

---

Built for Ralf — test locally on Mac, ship to iPad when ready.
