# YOUTUBE DELETE SAFETY — EMOBILIST (Ralf) HARD RULES

**Binding for ALL future YouTube operations by this agent/pipeline.**

## NEVER DELETE RULES

1. **Never delete anything on Ralf's YouTube channels that this agent/pipeline did not create.**
2. **Anything with more than 3 views must NEVER be deleted** — even if agent-created.
   - If `viewCount > 3`: leave it (or set **unlisted**) and create a **NEW** unlisted short.
   - Do not overwrite history that already has audience signal.

## Channels

| Market | Channel ID |
|--------|------------|
| DE (`the.emobilist`) | `UCjmo6CPUpdc05l2C7lf1hrQ` |
| USA (`EMOBILIST USA`) | `UCRxf82ZRnLwE72QhgVo9-mw` |

OAuth: `/tmp/youtube_oauth_tokens_de.json`, `/tmp/youtube_oauth_tokens_usa.json`

## Mandatory pre-delete gate

Before **every** `videos.delete`:

1. Call `videos.list` with `part=statistics,snippet` (and `status`).
2. **Abort** if `viewCount > 3`.
3. **Abort** if `videoId` is **NOT** in the agent-created allowlist.
4. **Log** skipped deletes with reason (`views` / `not_agent_owned` / `not_found`).

Implementation: `/tmp/shorts_pipeline/youtube_delete_safety.py`  
Allowlist: `/opt/cursor/artifacts/agent_created_video_ids.json`  
Skip log: `/opt/cursor/artifacts/youtube_delete_skip_log.jsonl`

```bash
# Dry-run only (default without SHORTS_ALLOW_DELETE=1)
python3 /tmp/shorts_pipeline/youtube_delete_safety.py \
  --channel de --video-id VIDEO_ID --dry-run

# Real delete (still gated): allowlisted AND views<=3
SHORTS_ALLOW_DELETE=1 python3 /tmp/shorts_pipeline/youtube_delete_safety.py \
  --channel de --video-id VIDEO_ID
```

## Allowlist sources

IDs this pipeline uploaded / previously retired, merged from:

- `pilot_uploads.json`, `pilot_uploads_v2.json` … `pilot_uploads_v5.json`
- `v3_deleted_ids.json`, `v4_deleted_ids.json`, `v5_deleted_ids.json`
- Live registration on every successful `upload_short()`

Rebuild:

```bash
python3 /tmp/shorts_pipeline/youtube_delete_safety.py \
  --channel de --video-id _ --rebuild-allowlist
```

## V5 remake policy

When remaking V4 (or earlier) shorts:

- Prefer **leave unlisted** + upload **new** V5 video.
- `--delete-old` only deletes if allowlisted **and** `viewCount <= 3`.
- If views > 3: skip delete, keep unlisted, remake as new ID.

```bash
python3 /tmp/shorts_pipeline/rebuild_pilots_v5.py --only DE-06 --delete-dry-run
```

## Audit notes (2026-08-26)

- Successful deletes in `v3`/`v4`/`v5_deleted_ids.json` all matched agent allowlist IDs.
- No evidence of a **successful** non-agent delete.
- V3 run had delete **attempts** on ~10 IDs not in pilot manifests; all returned **404** (already gone) — flagged in `delete_safety_audit.json`.
- All 12 V4 pilots were deleted by a prior V5 remake pass (`v5_deleted_ids.json`); they were agent-owned. View counts at delete time were **not** recorded (pre-guard).
- Live agent short remaining: V5 DE-06 `nKfxYIV8Fzg` (unlisted, 0 views) — deletable under rules if needed.
