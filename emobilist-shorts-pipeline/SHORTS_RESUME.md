# Resume: EMOBILIST Shorts

## Privacy policy (Ralf) — always unlisted first for review

**New Shorts uploads default to `unlisted` immediately** (no `private` + scheduled `publishAt`) so Ralf can open the link and give feedback.

## V5 SHIPPED — viral remake (STOP→CURIOSITY→ESCALATION→PAYOFF→LOOP)

Binding playbook: `EMOBILIST_VIRAL_SHORTS_PLAYBOOK.md`

### V5 rules (hard)
- Hook ≤2.0s; every visual segment ≤3.0s
- Informative VO (facts: speed/power/fold/blinker/legal/compare) — CTA only at end
- Motion-scored RAW preference (action > static talking-head)
- Captions FontSize=56 + keyword highlight; visual↔text match
- Music variance + duck under VO; original ride SFX kept
- Upload: **unlisted** only

### Pipeline
- `/tmp/shorts_pipeline/build_short_v5.py`
- `/tmp/shorts_pipeline/rebuild_pilots_v5.py --upload`
- Templates: `v5_story_templates.json`
- Deletes log: `/opt/cursor/artifacts/v5_deleted_ids.json`
- Uploads: `/opt/cursor/artifacts/pilot_uploads_v5.json`

### Branch
`cursor/emobilist-shorts-v5-2675`
