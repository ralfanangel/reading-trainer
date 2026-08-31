# Resume: EMOBILIST Shorts

## Privacy policy (Ralf) — always unlisted first for review

**New Shorts uploads default to `unlisted` immediately** so Ralf can open the link and give feedback.

## V6 IN PROGRESS (2026-08-31) — Qualitäts-Upgrade 3/10 → 8/10

**Strategie:** `emobilist-shorts-pipeline/EMOBILIST_SHORTS_V6_STRATEGY.md`

### Warum V5 noch ~3/10
- Roboter-Stimme (edge-tts, nicht Ralf)
- Keine Karaoke-Captions (word-by-word)
- Zu lang (38s, 13 Beats)
- Kein Sounddesign bei Schnitten

### V6 Fixes
- ElevenLabs Ralf-Voice (oder besserer edge-tts Fallback)
- Word-by-word Karaoke via faster-whisper
- 8 Beats × ≤2.5s = ~30s
- Whoosh-SFX bei Cuts, Zoom-Punch, Kontrast-Boost
- Quality Gate: Score ≥7/10 vor Upload
- Pipeline persistent im Repo (nicht `/tmp`)

### Blockiert durch fehlende Credentials
- `SYNOLOGY_PASSWORD` — RAW/Musik/SFX
- `ELEVENLABS_API_KEY` — Ralf Voice Clone
- `YOUTUBE_OAUTH_DE` / `YOUTUBE_OAUTH_USA` — Upload

### Pipeline starten
```bash
cd emobilist-shorts-pipeline
pip install -r requirements.txt
python3 setup_nas.py
python3 rebuild_pilots_v6.py --id DE-01        # Pilot
python3 rebuild_pilots_v6.py --all --upload  # Alle 12
```

### Letzte live Version (V5 unlisted)
Siehe `artifacts/pilot_uploads_v5.json` — 12 Shorts auf YouTube unlisted.

Branch: `cursor/emobilist-shorts-v6-6023`
