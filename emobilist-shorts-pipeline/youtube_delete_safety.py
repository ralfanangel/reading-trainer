#!/usr/bin/env python3
"""EMOBILIST YouTube delete safety — HARD RULES (Ralf).

NEVER DELETE RULES (binding for ALL agents/pipelines):
1. Never delete anything on Ralf's YouTube channels that this agent/pipeline
   did not create.
2. Anything with more than 3 views must NEVER be deleted (even if agent-created).
   If views > 3: leave it (or set unlisted) and create a NEW unlisted short.

Before every videos.delete:
- videos.list with part=statistics,snippet
- Abort if viewCount > 3
- Abort if videoId is NOT in the agent-created allowlist
- Log skipped deletes with reason (views / not_agent_owned / not_found)

Allowlist: /opt/cursor/artifacts/agent_created_video_ids.json
Docs: /opt/cursor/artifacts/YOUTUBE_DELETE_SAFETY.md
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ART = Path("/opt/cursor/artifacts")
ALLOWLIST_PATH = ART / "agent_created_video_ids.json"
SKIP_LOG_PATH = ART / "youtube_delete_skip_log.jsonl"
MAX_VIEWS_FOR_DELETE = 3

TOKEN_PATHS = {
    "de": "/tmp/youtube_oauth_tokens_de.json",
    "usa": "/tmp/youtube_oauth_tokens_usa.json",
}

# Extra manifest globs used to rebuild the allowlist
MANIFEST_GLOBS = [
    "pilot_uploads.json",
    "pilot_uploads_v*.json",
    "v*_deleted_ids.json",
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log_skip(entry: dict[str, Any]) -> None:
    ART.mkdir(parents=True, exist_ok=True)
    row = {"ts": _now(), **entry}
    with SKIP_LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    reason = entry.get("reason", "unknown")
    vid = entry.get("videoId", "?")
    print(f"DELETE_SKIPPED {vid} reason={reason} {entry.get('detail', '')}".strip())


def refresh_token(channel: str) -> str:
    path = TOKEN_PATHS["de" if channel == "de" else "usa"]
    data = json.load(open(path))
    body = urllib.parse.urlencode(
        {
            "client_id": data["client_id"],
            "client_secret": data["client_secret"],
            "refresh_token": data["refresh_token"],
            "grant_type": "refresh_token",
        }
    ).encode()
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token", data=body, method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        tok = json.loads(r.read())
    data["access_token"] = tok["access_token"]
    json.dump(data, open(path, "w"))
    return data["access_token"]


def load_allowlist() -> set[str]:
    """Load agent-created video IDs. Rebuilds from manifests if file missing."""
    if ALLOWLIST_PATH.exists():
        try:
            data = json.loads(ALLOWLIST_PATH.read_text(encoding="utf-8"))
            ids = data.get("videoIds") or list((data.get("byId") or {}).keys())
            return {str(x) for x in ids if isinstance(x, str) and len(x) == 11}
        except Exception as e:
            print("allowlist load warn", e)
    return rebuild_allowlist()


def rebuild_allowlist() -> set[str]:
    """Rebuild allowlist from known agent upload/delete manifests."""
    ids: dict[str, dict[str, Any]] = {}

    def add(vid: str | None, meta: dict | None = None, source: str = "") -> None:
        if not vid or not isinstance(vid, str) or len(vid) != 11:
            return
        if vid not in ids:
            ids[vid] = {
                "videoId": vid,
                "sources": [],
                "channel": None,
                "storyId": None,
                "title": None,
                "versions": [],
            }
        if source and source not in ids[vid]["sources"]:
            ids[vid]["sources"].append(source)
        meta = meta or {}
        if meta.get("channel") and not ids[vid]["channel"]:
            ids[vid]["channel"] = meta["channel"]
        sid = meta.get("sid") or (
            meta.get("id")
            if isinstance(meta.get("id"), str) and "-" in str(meta.get("id", ""))
            else None
        )
        if sid and not ids[vid]["storyId"]:
            ids[vid]["storyId"] = sid
        if meta.get("title") and not ids[vid]["title"]:
            ids[vid]["title"] = meta["title"]
        ver = meta.get("version")
        if ver and ver not in ids[vid]["versions"]:
            ids[vid]["versions"].append(ver)

    ART.mkdir(parents=True, exist_ok=True)
    seen_files: set[Path] = set()
    for pattern in MANIFEST_GLOBS:
        for p in ART.glob(pattern):
            if p in seen_files or "summary" in p.name or "partial" in p.name:
                continue
            seen_files.add(p)
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            ver = None
            for v in ("v5", "v4", "v3", "v2", "v1"):
                if f"_{v}" in p.name or p.name.startswith(f"{v}_"):
                    ver = v
                    break
            if p.name == "pilot_uploads.json":
                ver = "v1"
            if isinstance(data, list):
                for row in data:
                    if isinstance(row, dict) and row.get("videoId"):
                        m = dict(row)
                        if ver:
                            m["version"] = ver
                        add(row["videoId"], m, p.name)
            elif isinstance(data, dict):
                for key in (
                    "deleted_ok",
                    "v2_requested",
                    "v3_ids_requested",
                    "v3_partial_deleted",
                    "already_gone",
                    "videoIds",
                ):
                    items = data.get(key) or []
                    if key in ("v2_requested", "v3_ids_requested", "videoIds"):
                        for vid in items:
                            add(vid if isinstance(vid, str) else None, {}, f"{p.name}:{key}")
                        continue
                    for item in items:
                        if isinstance(item, str):
                            add(item, {}, f"{p.name}:{key}")
                        elif isinstance(item, dict):
                            add(
                                item.get("videoId") or item.get("id"),
                                item,
                                f"{p.name}:{key}",
                            )
                for k, v in (data.get("ids") or {}).items():
                    if isinstance(v, str) and len(v) == 11:
                        add(v, {"id": k}, p.name)

    payload = {
        "generated_at": _now(),
        "rule": (
            "ONLY these IDs may ever be considered for videos.delete by the "
            "agent pipeline. viewCount must also be <= "
            f"{MAX_VIEWS_FOR_DELETE}."
        ),
        "max_views_for_delete": MAX_VIEWS_FOR_DELETE,
        "count": len(ids),
        "videoIds": sorted(ids.keys()),
        "byId": ids,
    }
    ALLOWLIST_PATH.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"allowlist rebuilt count={len(ids)} -> {ALLOWLIST_PATH}")
    return set(ids.keys())


def register_agent_upload(
    video_id: str,
    *,
    channel: str | None = None,
    story_id: str | None = None,
    title: str | None = None,
    version: str | None = None,
    source: str = "upload_short",
) -> None:
    """Call after a successful pipeline upload so the ID is allowlisted."""
    if not video_id or len(video_id) != 11:
        return
    allow = load_allowlist()
    data: dict[str, Any]
    if ALLOWLIST_PATH.exists():
        data = json.loads(ALLOWLIST_PATH.read_text(encoding="utf-8"))
    else:
        data = {"videoIds": [], "byId": {}, "max_views_for_delete": MAX_VIEWS_FOR_DELETE}
    by_id = data.setdefault("byId", {})
    entry = by_id.get(video_id) or {
        "videoId": video_id,
        "sources": [],
        "channel": None,
        "storyId": None,
        "title": None,
        "versions": [],
    }
    if source not in entry["sources"]:
        entry["sources"].append(source)
    if channel:
        entry["channel"] = channel
    if story_id:
        entry["storyId"] = story_id
    if title:
        entry["title"] = title
    if version and version not in entry["versions"]:
        entry["versions"].append(version)
    by_id[video_id] = entry
    vids = set(data.get("videoIds") or [])
    vids.add(video_id)
    data["videoIds"] = sorted(vids)
    data["count"] = len(vids)
    data["updated_at"] = _now()
    data["max_views_for_delete"] = MAX_VIEWS_FOR_DELETE
    ALLOWLIST_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    allow.add(video_id)
    print(f"allowlist registered {video_id} source={source}")


def videos_list(channel: str, video_id: str) -> dict[str, Any] | None:
    """videos.list with statistics + snippet. Returns None if not found."""
    token = refresh_token(channel)
    url = (
        "https://www.googleapis.com/youtube/v3/videos"
        f"?part=statistics,snippet,status&id={urllib.parse.quote(video_id)}"
    )
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
    items = data.get("items") or []
    return items[0] if items else None


def evaluate_delete(
    channel: str,
    video_id: str,
    *,
    allowlist: set[str] | None = None,
) -> dict[str, Any]:
    """Pre-delete gate. Never performs delete.

    Returns dict with keys: ok (bool), reason, views, title, snippet, etc.
    """
    allow = allowlist if allowlist is not None else load_allowlist()
    result: dict[str, Any] = {
        "ok": False,
        "videoId": video_id,
        "channel": channel,
        "reason": None,
        "views": None,
        "title": None,
        "privacy": None,
        "agent_owned": video_id in allow,
        "max_views": MAX_VIEWS_FOR_DELETE,
    }

    if video_id not in allow:
        result["reason"] = "not_agent_owned"
        result["detail"] = (
            "videoId not in agent_created_video_ids.json allowlist — "
            "refusing delete of non-pipeline content"
        )
        return result

    try:
        item = videos_list(channel, video_id)
    except Exception as e:
        result["reason"] = "list_failed"
        result["detail"] = str(e)
        return result

    if not item:
        result["reason"] = "not_found"
        result["detail"] = "videos.list returned no item (already gone)"
        result["ok"] = False
        return result

    snippet = item.get("snippet") or {}
    stats = item.get("statistics") or {}
    status = item.get("status") or {}
    views = int(stats.get("viewCount") or 0)
    result["views"] = views
    result["title"] = snippet.get("title")
    result["privacy"] = status.get("privacyStatus")
    result["channelId"] = snippet.get("channelId")
    result["publishedAt"] = snippet.get("publishedAt")

    if views > MAX_VIEWS_FOR_DELETE:
        result["reason"] = "views"
        result["detail"] = (
            f"viewCount={views} > {MAX_VIEWS_FOR_DELETE} — "
            "leave live/unlisted; remake as NEW video instead"
        )
        return result

    result["ok"] = True
    result["reason"] = "allowed"
    result["detail"] = f"agent-owned and views={views}<={MAX_VIEWS_FOR_DELETE}"
    return result


def safe_delete_video(
    channel: str,
    video_id: str,
    *,
    dry_run: bool = False,
    force_log: bool = True,
) -> dict[str, Any]:
    """Gate + optional videos.delete. Default dry_run=False performs delete only if allowed.

    Always calls videos.list first. Aborts on views>3 or not in allowlist.
    """
    gate = evaluate_delete(channel, video_id)
    out = {
        "videoId": video_id,
        "channel": channel,
        "dry_run": dry_run,
        "gate": gate,
        "deleted": False,
        "skipped": False,
        "http": None,
        "error": None,
    }

    if not gate.get("ok"):
        out["skipped"] = True
        out["status"] = "skipped"
        if force_log:
            _log_skip(
                {
                    "videoId": video_id,
                    "channel": channel,
                    "reason": gate.get("reason"),
                    "detail": gate.get("detail"),
                    "views": gate.get("views"),
                    "title": gate.get("title"),
                    "dry_run": dry_run,
                }
            )
        return out

    if dry_run:
        out["status"] = "would_delete"
        out["detail"] = gate.get("detail")
        print(
            f"DELETE_DRY_RUN would_delete {video_id} "
            f"views={gate.get('views')} title={gate.get('title')!r}"
        )
        return out

    token = refresh_token(channel)
    req = urllib.request.Request(
        f"https://www.googleapis.com/youtube/v3/videos?id={urllib.parse.quote(video_id)}",
        method="DELETE",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            out["http"] = r.status
            out["deleted"] = True
            out["status"] = "deleted"
            print(f"deleted {video_id} http={r.status} views={gate.get('views')}")
            return out
    except urllib.error.HTTPError as e:
        out["http"] = e.code
        out["error"] = f"HTTP Error {e.code}: {e.reason}"
        out["status"] = "fail"
        if e.code == 404:
            out["status"] = "already_gone"
        print("delete fail", video_id, out["error"])
        return out
    except Exception as e:
        out["error"] = str(e)
        out["status"] = "fail"
        print("delete fail", video_id, e)
        return out


def set_unlisted_instead(channel: str, video_id: str) -> dict[str, Any]:
    """Preferred alternative when delete is blocked by views: keep as unlisted."""
    gate = evaluate_delete(channel, video_id)
    # Even if not deletable, we may still unlisted agent-owned videos
    allow = load_allowlist()
    if video_id not in allow:
        _log_skip(
            {
                "videoId": video_id,
                "channel": channel,
                "reason": "not_agent_owned",
                "detail": "refusing privacy update on non-agent video",
                "action": "set_unlisted",
            }
        )
        return {"status": "skipped", "reason": "not_agent_owned", "videoId": video_id}

    token = refresh_token(channel)
    body = json.dumps(
        {"id": video_id, "status": {"privacyStatus": "unlisted", "selfDeclaredMadeForKids": False}}
    ).encode()
    req = urllib.request.Request(
        "https://www.googleapis.com/youtube/v3/videos?part=status",
        data=body,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())
    print(f"set_unlisted {video_id} (delete blocked? views={gate.get('views')})")
    return {"status": "unlisted", "videoId": video_id, "gate": gate, "response": data.get("status")}


def main():
    import argparse

    ap = argparse.ArgumentParser(description="Safe YouTube delete (EMOBILIST hard rules)")
    ap.add_argument("--channel", choices=["de", "usa"], required=True)
    ap.add_argument("--video-id", required=True)
    ap.add_argument("--dry-run", action="store_true", help="Evaluate only; never delete")
    ap.add_argument("--rebuild-allowlist", action="store_true")
    ap.add_argument("--register", action="store_true", help="Register video-id into allowlist")
    ap.add_argument("--title", default=None)
    ap.add_argument("--story-id", default=None)
    args = ap.parse_args()

    if args.rebuild_allowlist:
        rebuild_allowlist()
    if args.register:
        register_agent_upload(
            args.video_id,
            channel=args.channel,
            story_id=args.story_id,
            title=args.title,
            source="cli_register",
        )
        return

    # Default: dry-run unless explicitly deleting (require SHORTS_ALLOW_DELETE=1)
    dry = args.dry_run or os.environ.get("SHORTS_ALLOW_DELETE") != "1"
    if not args.dry_run and dry:
        print("Refusing real delete without SHORTS_ALLOW_DELETE=1 — running dry-run")
    result = safe_delete_video(args.channel, args.video_id, dry_run=dry)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
