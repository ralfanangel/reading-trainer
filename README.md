# Luma Reads — offline on iPad (no server)

Grade‑1 heart words + picture words. Five minutes, surprise story, Pip the parrot.

## iPad: install once, use offline forever

You do **not** need a Mac server or `python -m http.server`. Install as a home-screen app:

1. On iPad, open **Safari** and go to:
   **https://ralfanangel.github.io/reading-trainer/**
2. Wait for the page to load fully (one time, while online).
3. Tap **Share** (square with arrow) → **Add to Home Screen** → **Add**.
4. Open **Luma** from your home screen. Practice works in **Airplane Mode** after that.

Speech (read-aloud) uses the iPad’s built-in voice — no internet needed.

### Why not open files from Files?

iOS does not run this kind of web app from a folder on the device. The home-screen install caches everything locally via the service worker.

## Develop locally (optional)

```bash
python3 -m http.server 8080
# open http://127.0.0.1:8080
node test-smoke.mjs
```

## Deploy / update the public iPad URL

```bash
chmod +x scripts/deploy-gh-pages.sh
./scripts/deploy-gh-pages.sh origin
```

## Files

- `index.html`, `style.css`, `app.js` — app
- `fonts/` — bundled Fredoka + Nunito (no Google CDN)
- `service-worker.js` — offline-first cache for iPad PWA
- `manifest.json` — install metadata
