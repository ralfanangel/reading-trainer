#!/usr/bin/env python3
"""Bootstrap credentials from prior agent session files (not committed)."""
from __future__ import annotations

import json
import os
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
TMP = Path("/tmp")


def bootstrap_synology_from_legacy() -> bool:
    """Ensure synology_creds.json exists for setup_nas.py."""
    for src in (TMP / "synology_creds.json", DATA / "synology_creds.json"):
        if src.exists():
            data = json.loads(src.read_text(encoding="utf-8"))
            for dst in (TMP / "synology_creds.json", DATA / "synology_creds.json"):
                dst.parent.mkdir(parents=True, exist_ok=True)
                dst.write_text(json.dumps(data), encoding="utf-8")
                dst.chmod(0o600)
            if data.get("password"):
                os.environ["SYNOLOGY_PASSWORD"] = data["password"]
            return True
    return False


if __name__ == "__main__":
    print("synology:", bootstrap_synology_from_legacy())
