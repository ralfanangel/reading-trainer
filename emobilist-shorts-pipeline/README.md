# EMOBILIST Shorts Pipeline

Linux ffmpeg + YouTube Data API pipeline for bilingual (DE/USA) YouTube Shorts.

## What it does
- Downloads clips from Synology File Station RAW projects
- Crops to 9:16 (1080x1920), hook zoom, caption burn-in, music bed
- Uploads + schedules via YouTube API (`publishAt`)

## Caption sizing (V3 — required)
Use `build_short_v2.py` ASS burn with **explicit PlayRes 1080×1920** and `FontSize≤56`
(~3% glyph / ~5% two-line block). Do **not** use SRT `force_style FontSize=48`
(that hits default PlayResY≈288 → giant top-pinned text).

Rebuild pilots:
```bash
python3 /tmp/shorts_pipeline/rebuild_pilots_v3.py
```

## Setup (secrets stay in `/tmp`, never commit)
```bash
# Expected local secrets (not in git):
# /tmp/synology_session.json
# /tmp/youtube_oauth_tokens_de.json
# /tmp/youtube_oauth_tokens_usa.json
# /tmp/synology_found_videos.json  (inventory cache)

python3 /tmp/shorts_pipeline/batch_produce.py --from-day 5 --to-day 50 --upload --limit 10
```

## Strategy doc
See `/opt/cursor/artifacts/EMOBILIST_SHORTS_100_IDEAS.md` (100 concepts + 50-day calendar)
and `/opt/cursor/artifacts/EMOBILIST_SHORTS_V3_STRATEGY.md` (caption size fix).

## Music
Uses an original ffmpeg-generated bed by default. Prefer replacing with a YouTube Audio Library track before wide publishing.
