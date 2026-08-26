# Resume: EMOBILIST Shorts

## V4 SHIPPED (2026-08-26) — visual-text alignment

Ralf V3 feedback: caption size OK, but **picture ≠ text** and **same music reused**.

### Fix (V4)
- **Beat→clip matching**: each caption interval paired with a verified clip (`build_short_v4.py` curated tags + `visual_plan`)
- **Captions unchanged sizing**: ASS PlayRes 1080×1920, FontSize=56 (~5% two-line block)
- **Music variance**: 6 distinct AlumoMusic beds (Synology `Schnitt/Musik`)
- **Evidence**: per-beat labeled frames `/opt/cursor/artifacts/v4_*`

### Manifest
- Uploads: `/opt/cursor/artifacts/pilot_uploads_v4.json`
- Deletes: `/opt/cursor/artifacts/v4_deleted_ids.json`
- Music map: `/opt/cursor/artifacts/v4_music_map.json`
- Strategy: `/opt/cursor/artifacts/EMOBILIST_SHORTS_V4_STRATEGY.md`
- Pipeline: `/tmp/shorts_pipeline/build_short_v4.py` + `rebuild_pilots_v4.py`
- Repo branch: `cursor/emobilist-shorts-v4-2675`

### Schedule (UTC) — private until publishAt
| Day | DE 15:00Z | USA 22:00Z |
|-----|-----------|------------|
| Aug 26 | DE-01 `ck_KlN9PPFo` | EN-01 `DyrFz7x7vvw` |
| Aug 27 | DE-02 `K_NrnpQZdTQ` | EN-02 `Izz46ndxreM` |
| Aug 28 | DE-03 `enbc732k7ns` | EN-03 `c5B9qJ0Xxk0` |
| Aug 29 | DE-04 `oNI4Mc_cVhk` | EN-04 `m5xN80B-vAw` |
| Aug 30 | DE-05 `3-Cfqu8DL8E` | EN-05 `KBpHx14VhS4` |
| Aug 31 | DE-06 `_PDsvnSXKgI` | EN-06 `ib8clUN6gHM` |

### Deleted (this run)
- V3 12 IDs deleted OK: 
- See `v4_deleted_ids.json` — 12 deleted, 24 already gone

## Continue (days 7–50)
```bash
python3 /tmp/shorts_pipeline/rebuild_pilots_v4.py
# Extend STORIES + visual_plan per theme; keep FontSize≤56
```
