#!/usr/bin/env python3
"""Batch produce + upload Shorts from calendar_100.json using Synology clips."""
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, "/tmp/shorts_pipeline")
from build_short import build_short
from upload_short import upload_short

ROOT = Path("/tmp/shorts_pipeline")
CAL = ROOT / "meta" / "calendar_100.json"
STATE = ROOT / "meta" / "batch_state.json"
FOUND = Path("/tmp/synology_found_videos.json")
SESS = Path("/tmp/synology_session.json")


def syno_download(remote_path: str, local: Path) -> bool:
    if local.exists() and local.stat().st_size > 1000:
        return True
    sess = json.load(open(SESS))
    base, sid = sess["base"], sess["sid"]
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    params = {
        "api": "SYNO.FileStation.Download",
        "version": "2",
        "method": "download",
        "_sid": sid,
        "path": remote_path,
        "mode": "download",
    }
    url = f"{base}/webapi/entry.cgi?{urllib.parse.urlencode(params)}"
    local.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=600, context=ctx) as r, open(
            local, "wb"
        ) as fo:
            while True:
                chunk = r.read(1024 * 1024)
                if not chunk:
                    break
                fo.write(chunk)
        return local.stat().st_size > 1000
    except Exception as e:
        print("download fail", remote_path, e)
        return False


def clips_for_project(project: str, n: int = 6) -> list[Path]:
    found = json.load(open(FOUND))
    files = [
        f
        for f in found
        if f["project"] == project
        and 20e6 <= f.get("size", 0) <= 150e6
        and f["name"].lower().endswith((".mov", ".mp4"))
    ]
    files = sorted(files, key=lambda x: -x["size"])[:n]
    out = []
    raw_dir = ROOT / "raw" / project.replace(" ", "_")
    for f in files:
        safe = f["name"].replace(" ", "_").replace("/", "")
        local = raw_dir / safe
        if syno_download(f["path"], local):
            out.append(local)
    return out


def load_state():
    if STATE.exists():
        return json.load(open(STATE))
    return {"completed": [], "uploads": []}


def save_state(state):
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")


def process_one(day: dict, lang: str, state: dict, upload: bool):
    key = f"day{day['day']}_{lang}"
    if key in state["completed"]:
        print("skip", key)
        return
    c = day[lang]
    pub = day["de_publishAt" if lang == "de" else "en_publishAt"]
    channel = "de" if lang == "de" else "usa"
    clips = clips_for_project(c["raw"], n=6)
    if len(clips) < 3:
        print("not enough clips", c["raw"], len(clips))
        return
    out = ROOT / "out" / f"{c['id']}_{c['raw'].replace(' ', '_')}.mp4"
    captions = c.get("beats", [])[1:4] if isinstance(c.get("beats"), list) else []
    build_short(
        clips,
        captions or ["EMOBILIST"],
        out,
        target_sec=42.0,
        hook_caption=c.get("hook"),
    )
    entry = {
        "key": key,
        "id": c["id"],
        "channel": channel,
        "title": c["title"],
        "out": str(out),
        "raw": c["raw"],
        "publishAt": pub,
    }
    if upload:
        tags = [
            t.strip("# ")
            for t in c.get("tags", "#Shorts").replace("#", " ").split()
            if t.strip("# ")
        ]
        desc = (
            f"{c['title']}\n\n{c.get('cta','')}\n\nBrands: the.emobilist@gmail.com\n"
            f"RAW: {c['raw']}\n{c.get('tags','')}"
        )
        res = upload_short(channel, str(out), c["title"], desc, tags or ["Shorts"], pub)
        entry["videoId"] = res.get("id")
        entry["url"] = f"https://youtu.be/{res.get('id')}"
        entry["shorts_url"] = f"https://youtube.com/shorts/{res.get('id')}"
        print("uploaded", entry["url"])
    state["completed"].append(key)
    state["uploads"].append(entry)
    save_state(state)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-day", type=int, default=1)
    ap.add_argument("--to-day", type=int, default=50)
    ap.add_argument("--langs", default="de,en")
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--limit", type=int, default=100)
    args = ap.parse_args()
    cal = json.load(open(CAL))
    state = load_state()
    # mark pilots done
    for k in ("day1_de", "day1_en", "day2_de", "day2_en"):
        if k not in state["completed"]:
            # only if pilots already uploaded separately
            pass
    n = 0
    langs = [x.strip() for x in args.langs.split(",")]
    for day in cal:
        if day["day"] < args.from_day or day["day"] > args.to_day:
            continue
        for lang in langs:
            if n >= args.limit:
                return
            print(f"\n=== Day {day['day']} {lang.upper()} ===")
            try:
                process_one(day, lang, state, upload=args.upload)
                n += 1
            except Exception as e:
                print("ERR", e)
                save_state(state)


if __name__ == "__main__":
    main()
