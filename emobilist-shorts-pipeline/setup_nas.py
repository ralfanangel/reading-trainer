#!/usr/bin/env python3
"""Download RAW footage, music, and SFX from Synology NAS."""
from __future__ import annotations

import json
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from pipeline_config import (
    DATA_ROOT,
    LOCAL_RAW_MAP,
    MUSIC_DIR,
    NAS_BASE,
    NAS_MUSIC_DIR,
    NAS_RAW_PATHS,
    NAS_SFX_DIR,
    NAS_USER,
    RAW_DIR,
    SFX_DIR,
    ensure_dirs,
    synology_password,
)

CTX = ssl._create_unverified_context()
SESSION_FILE = DATA_ROOT / "synology_session.json"


def login() -> str:
    pw = synology_password()
    if not pw:
        raise RuntimeError("SYNOLOGY_PASSWORD not set")
    params = urllib.parse.urlencode({
        "api": "SYNO.API.Auth", "version": "3", "method": "login",
        "account": NAS_USER, "passwd": pw,
        "session": "FileStation", "format": "sid",
    })
    with urllib.request.urlopen(f"{NAS_BASE}/webapi/auth.cgi?{params}", context=CTX, timeout=60) as r:
        data = json.load(r)
    if not data.get("success"):
        raise RuntimeError(f"NAS login failed: {data}")
    sid = data["data"]["sid"]
    SESSION_FILE.write_text(json.dumps({"sid": sid, "base": NAS_BASE}), encoding="utf-8")
    return sid


def _sid() -> str:
    if SESSION_FILE.exists():
        return json.loads(SESSION_FILE.read_text())["sid"]
    return login()


def list_folder(remote_path: str) -> list[dict]:
    sid = _sid()
    params = urllib.parse.urlencode({
        "api": "SYNO.FileStation.List", "version": "2", "method": "list",
        "folder_path": remote_path, "_sid": sid,
    })
    with urllib.request.urlopen(f"{NAS_BASE}/webapi/entry.cgi?{params}", context=CTX, timeout=120) as r:
        data = json.load(r)
    if not data.get("success"):
        raise RuntimeError(f"list failed: {data}")
    return data["data"]["files"]


def download_file(remote_path: str, local_path: Path) -> None:
    sid = _sid()
    local_path.parent.mkdir(parents=True, exist_ok=True)
    if local_path.exists() and local_path.stat().st_size > 1_000_000:
        print(f"  skip (exists) {local_path.name}")
        return
    params = urllib.parse.urlencode({
        "api": "SYNO.FileStation.Download", "version": "2", "method": "download",
        "path": remote_path, "mode": "download", "_sid": sid,
    })
    url = f"{NAS_BASE}/webapi/entry.cgi?{params}"
    print(f"  download {local_path.name}...")
    with urllib.request.urlopen(url, context=CTX, timeout=600) as r:
        local_path.write_bytes(r.read())


def sync_raw(project_key: str, max_clips: int = 12) -> int:
    remote = NAS_RAW_PATHS.get(project_key)
    local_dir = LOCAL_RAW_MAP.get(project_key)
    if not remote or not local_dir:
        return 0
    local_dir.mkdir(parents=True, exist_ok=True)
    files = list_folder(remote)
    videos = [
        f for f in files
        if f.get("isdir") is False
        and f["name"].lower().endswith((".mov", ".mp4", ".m4v"))
    ]
    # NAS list API often returns size=0; still download by extension
    videos.sort(key=lambda f: f.get("additional", {}).get("size", 0) or 0, reverse=True)
    count = 0
    for f in videos[:max_clips]:
        download_file(f"{remote}/{f['name']}", local_dir / f["name"])
        count += 1
    return count


def sync_music(max_tracks: int = 8) -> int:
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    files = list_folder(NAS_MUSIC_DIR)
    tracks = [
        f for f in files
        if not f.get("isdir") and f["name"].lower().endswith((".mp3", ".wav", ".m4a"))
    ]
    count = 0
    for f in tracks[:max_tracks]:
        download_file(f"{NAS_MUSIC_DIR}/{f['name']}", MUSIC_DIR / f["name"])
        count += 1
    return count


def sync_sfx(max_files: int = 5) -> int:
    SFX_DIR.mkdir(parents=True, exist_ok=True)
    try:
        files = list_folder(NAS_SFX_DIR)
    except Exception as e:
        print(f"SFX list warn: {e}")
        return 0
    sfx = [
        f for f in files
        if not f.get("isdir")
        and any(k in f["name"].lower() for k in ("whoosh", "swoosh", "hit", "impact", "transition"))
    ]
    count = 0
    for f in sfx[:max_files]:
        download_file(f"{NAS_SFX_DIR}/{f['name']}", SFX_DIR / f["name"])
        count += 1
    return count


def main():
    ensure_dirs()
    print("NAS sync starting...")
    try:
        login()
    except Exception as e:
        print(f"NAS login failed: {e}", file=sys.stderr)
        sys.exit(1)

    total_raw = 0
    for key in NAS_RAW_PATHS:
        n = sync_raw(key)
        print(f"  {key}: {n} clips")
        total_raw += n

    n_music = sync_music()
    n_sfx = sync_sfx()
    print(f"Done: {total_raw} RAW clips, {n_music} music, {n_sfx} SFX")


if __name__ == "__main__":
    main()
