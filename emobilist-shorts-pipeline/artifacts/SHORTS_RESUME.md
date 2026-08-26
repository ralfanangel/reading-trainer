# Resume: EMOBILIST Shorts

## Privacy policy (Ralf) — always unlisted first for review

**New Shorts uploads default to `unlisted` immediately** so Ralf can open the link and give feedback.

## V5 SHIPPED (2026-08-26) — full remake

Binding playbook: `/opt/cursor/artifacts/EMOBILIST_VIRAL_SHORTS_PLAYBOOK.md`

### What changed vs V4
- STOP→CURIOSITY→ESCALATION→PAYOFF→LOOP structure
- Hook ≤2.0s; every visual segment ≤3.0s (verified)
- Informative edge-tts VO with product facts (speed/fold/blinker/legal/compare); CTA only at end
- Motion-scored RAW preference (action > static)
- Captions FontSize=56 + keyword highlight; visual↔text match kept
- Music variance + duck under VO; original ride SFX kept
- Upload: **unlisted** (live verified)

### Manifests
- Uploads: `/opt/cursor/artifacts/pilot_uploads_v5.json`
- Unlisted verify: `/opt/cursor/artifacts/v5_unlisted_verify_live.json`
- Deletes: `/opt/cursor/artifacts/v5_deleted_ids.json` (12 V4 deleted, 36 older already gone)
- Action scores: `/opt/cursor/artifacts/v5_action_scene_scores.json`
- VO scripts: `/opt/cursor/artifacts/v5_vo_scripts/`
- Evidence frames: `/opt/cursor/artifacts/v5_frames/` + `v5_*_cap*.jpg`
- Pipeline: `/tmp/shorts_pipeline/build_short_v5.py` + `run_v5_upload_all.py`
- Branch: `cursor/emobilist-shorts-v5-2675`

### Live V5 (unlisted — review links)
| ID | Channel | videoId | Duration | URL |
|----|---------|---------|----------|-----|
| DE-01 | de | `69jHnRlYlP8` | 38.0s | https://youtu.be/69jHnRlYlP8 |
| EN-01 | usa | `9d93DtxMtwo` | 38.0s | https://youtu.be/9d93DtxMtwo |
| DE-02 | de | `e9fR10vMOx8` | 38.0s | https://youtu.be/e9fR10vMOx8 |
| EN-02 | usa | `CU8-K1lEs8s` | 37.2s | https://youtu.be/CU8-K1lEs8s |
| DE-03 | de | `gxjMcf1S-k0` | 38.0s | https://youtu.be/gxjMcf1S-k0 |
| EN-03 | usa | `HLxxN1dgphg` | 37.5s | https://youtu.be/HLxxN1dgphg |
| DE-04 | de | `tIGoXLZVAX0` | 37.2s | https://youtu.be/tIGoXLZVAX0 |
| EN-04 | usa | `0GpI8Mj10Xw` | 37.0s | https://youtu.be/0GpI8Mj10Xw |
| DE-05 | de | `jxo7zuQ6Lcc` | 37.9s | https://youtu.be/jxo7zuQ6Lcc |
| EN-05 | usa | `DKrLA-MMsIY` | 37.2s | https://youtu.be/DKrLA-MMsIY |
| DE-06 | de | `uyxrvvS_E18` | 34.8s | https://youtu.be/uyxrvvS_E18 |
| EN-06 | usa | `eVNe8b9GoCc` | 34.3s | https://youtu.be/eVNe8b9GoCc |

### Deleted (this run)
- All 12 V4 agent Shorts deleted
- V1–V3 IDs already gone (see `v5_deleted_ids.json`)

### Continue
```bash
python3 /tmp/shorts_pipeline/run_v5_upload_all.py
# or: python3 /tmp/shorts_pipeline/rebuild_pilots_v5.py --upload
```
