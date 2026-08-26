# Resume: EMOBILIST Shorts

## ⛔ HARD SAFETY — NEVER DELETE (Ralf / binding)

**Full policy:** `/opt/cursor/artifacts/YOUTUBE_DELETE_SAFETY.md`  
**Allowlist:** `/opt/cursor/artifacts/agent_created_video_ids.json`  
**Code:** `/tmp/shorts_pipeline/youtube_delete_safety.py`

1. **Never delete** anything on DE/USA channels that this agent/pipeline did **not** create.
2. **Never delete** any video with **viewCount > 3** (even if agent-created). Leave it / set unlisted and upload a **new** short instead.
3. Before every `videos.delete`: `videos.list(statistics,snippet)` → abort if views>3 or ID not in allowlist → log skips.

---

## BINDING — Viral playbook for next remake (V5+)

**Playbook:** `/opt/cursor/artifacts/EMOBILIST_VIRAL_SHORTS_PLAYBOOK.md`  
**V5 strategy:** `/opt/cursor/artifacts/EMOBILIST_SHORTS_V5_STRATEGY.md`  
**Formula:** STOP → CURIOSITY → ESCALATION → PAYOFF → LOOP

The playbook is **binding** for every next remake/rebuild. Do not ship V5 pilots that violate hook≤2s, beat≤3s, visual-text match, small captions + keyword highlight, music duck/variance, unlisted-first, or face-without-VO rules.

### Wait for Ralf before further mass remake

- **V4 status (2026-08-26):** all 12 V4 pilot IDs are **already gone** (`v5_deleted_ids.json` — agent-owned; pre-guard remake). Do not delete other channel content.
- Only live agent short currently: V5 DE-06 `nKfxYIV8Fzg` (unlisted).
- Further remakes: leave any short with views>3 unlisted; upload NEW IDs only.
- Optional: continue unlisted V5 demos; no mass deletes.

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

### Live V4 (unlisted — review links) — SUPERSEDED
> **2026-08-26:** These 12 V4 IDs were deleted by a prior V5 remake pass (`v5_deleted_ids.json`). They were **agent-owned** allowlist IDs. View counts at delete time were not recorded (pre-guard). Do not resurrect deletes of non-allowlist content.

| ID | Channel | videoId | URL | Live now |
|----|---------|---------|-----|----------|
| DE-01 | de | `ck_KlN9PPFo` | https://youtu.be/ck_KlN9PPFo | GONE |
| EN-01 | usa | `DyrFz7x7vvw` | https://youtu.be/DyrFz7x7vvw | GONE |
| DE-02 | de | `K_NrnpQZdTQ` | https://youtu.be/K_NrnpQZdTQ | GONE |
| EN-02 | usa | `Izz46ndxreM` | https://youtu.be/Izz46ndxreM | GONE |
| DE-03 | de | `enbc732k7ns` | https://youtu.be/enbc732k7ns | GONE |
| EN-03 | usa | `c5B9qJ0Xxk0` | https://youtu.be/c5B9qJ0Xxk0 | GONE |
| DE-04 | de | `oNI4Mc_cVhk` | https://youtu.be/oNI4Mc_cVhk | GONE |
| EN-04 | usa | `m5xN80B-vAw` | https://youtu.be/m5xN80B-vAw | GONE |
| DE-05 | de | `3-Cfqu8DL8E` | https://youtu.be/3-Cfqu8DL8E | GONE |
| EN-05 | usa | `KBpHx14VhS4` | https://youtu.be/KBpHx14VhS4 | GONE |
| DE-06 | de | `_PDsvnSXKgI` | https://youtu.be/_PDsvnSXKgI | GONE |
| EN-06 | usa | `ib8clUN6gHM` | https://youtu.be/ib8clUN6gHM | GONE |

### Live V5 (unlisted)
| ID | Channel | videoId | views | safe_to_delete |
|----|---------|---------|-------|----------------|
| DE-06 | de | `nKfxYIV8Fzg` | 0 | yes (agent + views≤3) |

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
