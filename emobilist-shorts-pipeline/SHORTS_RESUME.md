# Resume: EMOBILIST Shorts

## Privacy policy (Ralf) — always unlisted first for review

**New Shorts uploads default to `unlisted` immediately** (no `private` + scheduled `publishAt`) so Ralf can open the link and give feedback. Only use private+schedule when he explicitly asks.

- Pipeline default: `upload_short.py` → `privacyStatus=unlisted` unless `--publish-at` / `SCHEDULE_PUBLISH=1`
- Live V4 pilots set unlisted 2026-08-26 (schedule cleared); see `v4_unlisted_status.json`

## V4 SHIPPED (2026-08-26) — visual-text alignment

Ralf V3 feedback: caption size OK, but **picture ≠ text** and **same music reused**.

### Fix (V4)
- **Beat→clip matching**: each caption interval paired with a verified clip (`build_short_v4.py` curated tags + `visual_plan`)
- **Captions unchanged sizing**: ASS PlayRes 1080×1920, FontSize=56 (~5% two-line block)
- **Music variance**: 6 distinct AlumoMusic beds (Synology `Schnitt/Musik`)
- **Evidence**: per-beat labeled frames `/opt/cursor/artifacts/v4_*`

### Manifest
- Uploads: `/opt/cursor/artifacts/pilot_uploads_v4.json`
- Unlisted verify: `/opt/cursor/artifacts/v4_unlisted_status.json`
- Deletes: `/opt/cursor/artifacts/v4_deleted_ids.json`
- Music map: `/opt/cursor/artifacts/v4_music_map.json`
- Strategy: `/opt/cursor/artifacts/EMOBILIST_SHORTS_V4_STRATEGY.md`
- Pipeline: `/tmp/shorts_pipeline/build_short_v4.py` + `rebuild_pilots_v4.py`
- Repo branch: `cursor/emobilist-shorts-v4-2675`

### Live V4 (unlisted — review links)
| ID | Channel | videoId | URL |
|----|---------|---------|-----|
| DE-01 | de | `ck_KlN9PPFo` | https://youtu.be/ck_KlN9PPFo |
| EN-01 | usa | `DyrFz7x7vvw` | https://youtu.be/DyrFz7x7vvw |
| DE-02 | de | `K_NrnpQZdTQ` | https://youtu.be/K_NrnpQZdTQ |
| EN-02 | usa | `Izz46ndxreM` | https://youtu.be/Izz46ndxreM |
| DE-03 | de | `enbc732k7ns` | https://youtu.be/enbc732k7ns |
| EN-03 | usa | `c5B9qJ0Xxk0` | https://youtu.be/c5B9qJ0Xxk0 |
| DE-04 | de | `oNI4Mc_cVhk` | https://youtu.be/oNI4Mc_cVhk |
| EN-04 | usa | `m5xN80B-vAw` | https://youtu.be/m5xN80B-vAw |
| DE-05 | de | `3-Cfqu8DL8E` | https://youtu.be/3-Cfqu8DL8E |
| EN-05 | usa | `KBpHx14VhS4` | https://youtu.be/KBpHx14VhS4 |
| DE-06 | de | `_PDsvnSXKgI` | https://youtu.be/_PDsvnSXKgI |
| EN-06 | usa | `ib8clUN6gHM` | https://youtu.be/ib8clUN6gHM |

Older V1–V3 agent Shorts: deleted / already gone (`v4_deleted_ids.json`). None still live.

### Deleted (this run)
- V3 12 IDs deleted OK
- See `v4_deleted_ids.json` — 12 deleted, 24 already gone

## Continue (days 7–50)
```bash
python3 /tmp/shorts_pipeline/rebuild_pilots_v4.py
# Default: unlisted, no schedule. Optional: SCHEDULE_PUBLISH=1 for private+publishAt
# Extend STORIES + visual_plan per theme; keep FontSize≤56
```
