#!/usr/bin/env python3
"""Upload a Short to YouTube (DE or USA) with optional schedule."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

TOKEN_PATHS = {
    "de": "/tmp/youtube_oauth_tokens_de.json",
    "usa": "/tmp/youtube_oauth_tokens_usa.json",
}


def refresh(path: str) -> str:
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


def upload_short(
    channel: str,
    video_path: str,
    title: str,
    description: str,
    tags: list[str],
    publish_at: str | None = None,
    privacy_status: str = "unlisted",
    category_id: str = "2",  # Autos & Vehicles
):
    """Upload a Short. Default privacy is unlisted for review (no schedule).

    Only pass publish_at when an explicit scheduled publish is requested; that
    forces privacyStatus=private + publishAt (YouTube API requirement).
    """
    path = TOKEN_PATHS[channel]
    token = refresh(path)
    lang = "de" if channel == "de" else "en"
    # Policy: always unlisted first for Ralf review unless schedule explicitly requested.
    status = {
        "privacyStatus": privacy_status or "unlisted",
        "selfDeclaredMadeForKids": False,
        "madeForKids": False,
    }
    if publish_at:
        status["privacyStatus"] = "private"
        status["publishAt"] = publish_at
    meta = {
        "snippet": {
            "title": title[:100],
            "description": description[:5000],
            "tags": tags[:15],
            "categoryId": category_id,
            "defaultLanguage": lang,
            "defaultAudioLanguage": lang,
        },
        "status": status,
    }

    # Resumable upload
    init_body = json.dumps(meta).encode()
    boundary_req = urllib.request.Request(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        data=init_body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "video/*",
            "X-Upload-Content-Length": str(os.path.getsize(video_path)),
        },
    )
    with urllib.request.urlopen(boundary_req, timeout=60) as r:
        upload_url = r.headers["Location"]

    size = os.path.getsize(video_path)
    with open(video_path, "rb") as f:
        data = f.read()
    put = urllib.request.Request(
        upload_url,
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "video/*",
            "Content-Length": str(size),
        },
    )
    with urllib.request.urlopen(put, timeout=600) as r:
        result = json.loads(r.read())
    # Register in agent allowlist so future deletes can prove ownership
    try:
        try:
            from youtube_delete_safety import register_agent_upload
        except ImportError:
            import sys
            from pathlib import Path as _P
            sys.path.insert(0, str(_P(__file__).resolve().parent))
            sys.path.insert(0, "/tmp/shorts_pipeline")
            from youtube_delete_safety import register_agent_upload

        vid = result.get("id")
        if vid:
            register_agent_upload(
                vid,
                channel=channel,
                title=(result.get("snippet") or {}).get("title") or title,
                source="upload_short",
            )
    except Exception as e:
        print("allowlist register warn", e)
    return result


def main():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", choices=["de", "usa"], required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--description", default="")
    ap.add_argument("--tags", default="Shorts,ebike,emobilist")
    ap.add_argument("--publish-at", default=None, help="Optional schedule (forces private). Default: unlisted now.")
    ap.add_argument(
        "--privacy",
        default="unlisted",
        choices=["unlisted", "private", "public"],
        help="Default unlisted for review. Ignored if --publish-at is set.",
    )
    args = ap.parse_args()
    tags = [t.strip() for t in args.tags.split(",") if t.strip()]
    if "Shorts" not in tags and "#Shorts" not in args.title:
        tags = ["Shorts"] + tags
    res = upload_short(
        args.channel,
        args.video,
        args.title,
        args.description,
        tags,
        args.publish_at,
        privacy_status=args.privacy,
    )
    print(json.dumps({"id": res.get("id"), "title": res.get("snippet", {}).get("title"), "status": res.get("status")}, indent=2))
    Path("/tmp/shorts_pipeline/meta/last_upload.json").write_text(
        json.dumps(res, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
