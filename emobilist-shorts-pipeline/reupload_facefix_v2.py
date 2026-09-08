#!/usr/bin/env python3
"""Re-upload DE-05/EN-05/DE-06/EN-06 with headless crop + YuNet QA."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, "/tmp/shorts_pipeline")
import build_short_v2 as b

# force fresh YuNet
b._YUNET = None

from build_short_v2 import build_short_v2, face_score, lint_srt_file, probe_duration
from rebuild_pilots_v2 import STORIES, clips_for, delete_video, syno_login, verify_built
from upload_short import upload_short

ART = Path("/opt/cursor/artifacts")
OUT = Path("/tmp/shorts_pipeline/out_v2")
REPLACE = ["DE-05", "EN-05", "DE-06", "EN-06"]


def main():
    syno_login()
    results = json.load(open(ART / "pilot_uploads_v2.json"))
    by_id = {r["id"]: r for r in results}

    for sid in REPLACE:
        cfg = STORIES[sid]
        print(f"\n======== REBUILD {sid} ========")
        clips = clips_for(cfg["raw"], n=16)
        print("clips", len(clips))
        scored = sorted(((face_score(c, samples=6), c) for c in clips), key=lambda x: x[0])
        print("scores", [(round(s, 2), c.name) for s, c in scored[:10]])
        # Prefer lowest-face; headless crop handles residual faces
        chosen = [c for s, c in scored if s < 0.5][:7] or [c for _, c in scored[:6]]
        if len(chosen) < 4:
            chosen = [c for _, c in scored[:6]]
        out = OUT / f"{sid}_v2.mp4"
        out.unlink(missing_ok=True)
        (OUT / f"{sid}_v2.srt").unlink(missing_ok=True)
        build_short_v2(
            chosen,
            cfg["story"],
            out,
            lang=cfg["lang"],
            target_sec=28.0,
            allow_face=False,
            max_face=0.5,
        )
        qa = verify_built(sid, cfg, out)
        print("QA", {k: qa[k] for k in ("duration", "face_score", "cta_ok", "lang_ok", "pass")})
        if qa["face_score"] >= 0.5:
            raise RuntimeError(f"{sid} still has faces after headless crop")

        old = by_id.get(sid, {}).get("videoId") or cfg.get("old_id")
        if old:
            delete_video(cfg["channel"], old)

        desc = (
            f"{cfg['title']}\n\n"
            + "\n".join(cfg["story"]["beats"])
            + f"\n\n{cfg['story']['cta']}\nBrands: the.emobilist@gmail.com\n#Shorts"
        )
        res = upload_short(
            cfg["channel"], str(out), cfg["title"], desc, cfg["tags"], cfg["publishAt"]
        )
        entry = {
            "id": sid,
            "channel": cfg["channel"],
            "lang": cfg["lang"],
            "videoId": res.get("id"),
            "title": cfg["title"],
            "publishAt": cfg["publishAt"],
            "privacy": "private",
            "url": f"https://youtu.be/{res.get('id')}",
            "shorts_url": f"https://youtube.com/shorts/{res.get('id')}",
            "old_id": old,
            "v": 2,
            "qa": qa,
            "defaultLanguage": cfg["lang"],
            "face_fix": "yunet+headless",
        }
        print("uploaded", entry["videoId"])
        by_id[sid] = entry
        # preserve order
        ordered = []
        for k in STORIES:
            if k in by_id:
                ordered.append(by_id[k])
        json.dump(ordered, open(ART / "pilot_uploads_v2.json", "w"), indent=2, ensure_ascii=False)

    print("DONE replacements")


if __name__ == "__main__":
    main()
