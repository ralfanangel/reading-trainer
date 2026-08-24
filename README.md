# Luma Reads (Reading Trainer)

A simple, beautiful iPad-first reading practice app for kids.

## Modes

1. **Sight Words** — one first-grade sight word at a time, with reading.com-style letter underlines. The child reads aloud (mic or “I said it”), earns a point, hears “Well done, {name}!”, then gets the next word.
2. **Picture Words** — show a grade-1 word (e.g. *ship*) with underlines and four picture choices. Tap the matching symbol.

Each practice lasts **5 minutes**, then unlocks a **surprise short story** that reuses the words the child just practiced. Pip the 3D parrot buddy cheers with funny-but-wise lines.

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` (Safari / Chrome). On iPad: Share → Add to Home Screen.

## Files

- `index.html` — structure
- `style.css` — meadow visual design + motions
- `app.js` — practice logic, speech, timer, surprise story
- `animals.json` — legacy picture catalog (picture words are curated in `app.js`)
