# EMOBILIST Shorts Pipeline

Linux ffmpeg + YouTube Data API pipeline for bilingual (DE/USA) YouTube Shorts.

## What it does
- Downloads clips from Synology File Station RAW projects
- Crops to 9:16 (1080x1920), hook zoom, caption burn-in, music bed
- Uploads + schedules via YouTube API (`publishAt`)

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
See `/opt/cursor/artifacts/EMOBILIST_SHORTS_100_IDEAS.md` (100 concepts + 50-day calendar).

## Music
Uses an original ffmpeg-generated bed by default. Prefer replacing with a YouTube Audio Library track before wide publishing.
