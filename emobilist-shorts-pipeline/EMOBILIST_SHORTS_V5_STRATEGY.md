# EMOBILIST Shorts V5 — Viral Structure Strategy

**Binding guide:** `/opt/cursor/artifacts/EMOBILIST_VIRAL_SHORTS_PLAYBOOK.md`  
**Formula:** STOP → CURIOSITY → ESCALATION → PAYOFF → LOOP

## How V5 differs from V4

| Area | V4 | V5 |
|------|----|----|
| Story arc | Flat beat list (hook + 4 beats + CTA) | Explicit structure phases with open loops + mini tension curves |
| Hook timing | First caption ~4.7s slot | Hook must land in **≤2.0s**; first visual is the interesting thing |
| Cut pace | ~4.5–5s per beat | **≤3.0s** per visual beat (enforce in builder) |
| Ending | Soft CTA | **Loop** beat that echoes hook / invites rewatch + short CTA |
| Music | Variance (6 beds) @ volume≈0.18 | Variance **kept** + **ducking** under ride/VO (~0.08–0.12 base) |
| Voice | Caption-only typical | Prefer **real RAW VO** when present; else punchy captions + original sound |
| Captions | FontSize=56, plain white | FontSize=56 + **keyword highlight** (color/bold) — no size bloat |
| Visual match | Beat→clip tags (hard rule) | **Same hard rule** + structure labels on every beat |
| Publish | Private + publishAt (later flipped unlisted) | **Default unlisted**, no publishAt |
| Remake policy | Remade all 12 | Wait for Ralf V4 feedback before mass remake; optional 1 demo proof |

## Structure markers in story scripts

Every V5 story uses `structure` + `visual_plan` aligned to captions:

```json
{
  "hook": "...",
  "beats": ["...", "..."],
  "cta": "...",
  "loop": "...",
  "structure": [
    {"phase": "STOP", "max_sec": 2.0},
    {"phase": "CURIOSITY", "max_sec": 3.0},
    {"phase": "ESCALATION", "max_sec": 3.0},
    {"phase": "ESCALATION", "max_sec": 3.0},
    {"phase": "PAYOFF", "max_sec": 3.0},
    {"phase": "LOOP", "max_sec": 2.5}
  ],
  "keywords": [["Blinker"], ["Remote"], ["Helm"], ["Firefly"], ["Signale"], ["Test"]],
  "visual_plan": [ {"label": "stop", "need": [...]}, ... ]
}
```

## Open loops & escalation

- Plant the unanswered question by ~5–10s (“Was passiert wenn…?”, “Warte ab…”).
- Middle: small win → new doubt → harder test → surprise.
- Payoff answers **one** question only.
- Loop: last 2–4s echo the hook visual or line so rewatch feels natural.

## Voice & sound

1. Scan RAW for Ralf speech → extract & duck music under VO windows.
2. Else: original ride/product audio mixed over quiet bed.
3. Never face-on without real VO.

## Captions

- Keep V3/V4 sizing (FontSize≈56, lower-third).
- Highlight 1–3 keywords per beat via ASS override tags (not larger fonts).
- Short punchy lines — not transcripts.

## Unlisted-first

`upload_short.py` defaults `privacyStatus=unlisted`, no `publishAt`.  
Public only after Ralf says go.

## Remake gate

- V4 pilots stay unlisted for feedback.
- Do **not** mass-delete/reupload all 12 until Ralf asks or V5 demo + templates are approved.
- Optional: one unlisted DE demo (e.g. DE-06 Lumos) as structure proof.

## Pipeline

- `build_short_v5.py` — hook≤2s, beat≤3s, keyword ASS, music duck, structure lint
- `rebuild_pilots_v5.py` — loads `v5_story_templates.json`
- `v5_story_templates.json` — 6 themes × DE+EN viral scripts
- `upload_short.py` — unlisted default
