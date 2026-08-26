# Resume: EMOBILIST Shorts

## BINDING — Viral playbook for next remake (V5+)

**Playbook:** `/opt/cursor/artifacts/EMOBILIST_VIRAL_SHORTS_PLAYBOOK.md`  
**V5 strategy:** `/opt/cursor/artifacts/EMOBILIST_SHORTS_V5_STRATEGY.md`  
**Formula:** STOP → CURIOSITY → ESCALATION → PAYOFF → LOOP

The playbook is **binding** for every next remake/rebuild. Do not ship V5 pilots that violate hook≤2s, beat≤3s, visual-text match, small captions + keyword highlight, music duck/variance, unlisted-first, or face-without-VO rules.

### Wait for Ralf on V4 before mass remake

- All **12 V4 pilots are unlisted** for review (schedule cleared).
- **Do not** mass-delete/reupload all Shorts unless Ralf asks to remake now.
- Optional: one unlisted DE V5 demo as structure proof; leave other 11 as V4 unlisted.

### Retention checklist (every short before upload)

- [ ] Hook ≤2.0s (no “Hey Leute…”)
- [ ] One idea / one question answered
- [ ] Open loop by ~5–10s
- [ ] Visual change every ≤3s
- [ ] Caption ↔ on-screen match (evidence frames)
- [ ] Captions FontSize≤56 + keyword color/bold (no giant top text)
- [ ] Music quiet under VO/ride; distinct bed vs recent shorts
- [ ] Original sound audible when it matters
- [ ] 30–45s ideal (≤60)
- [ ] No face without real Ralf VO
- [ ] Upload **unlisted**, no publishAt (unless Ralf requested schedule)
- [ ] Ending loops / CTA without killing pace

---

## Privacy policy — unlisted first for review

Uploads default to `unlisted` immediately (no private+`publishAt`) so Ralf can open the link. Schedule only when he explicitly asks.

- Pipeline: `upload_short.py` → `privacyStatus=unlisted` unless `--publish-at`
- Live V4 verify: `/opt/cursor/artifacts/v4_unlisted_status.json` (+ live re-check 2026-08-26)

---

## V4 SHIPPED (2026-08-26) — visual-text alignment

Ralf V3 feedback: caption size OK, but **picture ≠ text** and **same music reused**.

### Fix (V4)
- Beat→clip matching (`build_short_v4.py` + `visual_plan`)
- Captions FontSize=56 (~5% two-line block)
- Music variance: 6 AlumoMusic beds
- Evidence: `/opt/cursor/artifacts/v4_*`

### Manifest
- Uploads: `/opt/cursor/artifacts/pilot_uploads_v4.json`
- Unlisted verify: `/opt/cursor/artifacts/v4_unlisted_status.json`
- Strategy: `/opt/cursor/artifacts/EMOBILIST_SHORTS_V4_STRATEGY.md`
- Repo (V4): `cursor/emobilist-shorts-v4-2675`

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

---

## V5 readiness

```bash
# Templates (6 themes DE+EN, viral structure)
python3 -c "import json; json.load(open('/tmp/shorts_pipeline/v5_story_templates.json'))"

# Build one short (demo)
python3 /tmp/shorts_pipeline/rebuild_pilots_v5.py --only DE-06

# Upload defaults unlisted
python3 /tmp/shorts_pipeline/upload_short.py --channel de --video ... --title "..."
```

- Playbook: `/opt/cursor/artifacts/EMOBILIST_VIRAL_SHORTS_PLAYBOOK.md`
- Strategy: `/opt/cursor/artifacts/EMOBILIST_SHORTS_V5_STRATEGY.md`
- Builder: `/tmp/shorts_pipeline/build_short_v5.py`
- Templates: `/tmp/shorts_pipeline/v5_story_templates.json`
- Repo branch: `cursor/emobilist-shorts-v5-2675`
