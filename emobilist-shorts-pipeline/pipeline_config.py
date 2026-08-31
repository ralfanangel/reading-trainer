"""Central paths and credentials for EMOBILIST Shorts pipeline (V5+)."""
from __future__ import annotations

import json
import os
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parent
DATA_ROOT = Path(os.environ.get("SHORTS_DATA_ROOT", PIPELINE_ROOT / "data"))
ARTIFACTS = Path(os.environ.get("SHORTS_ARTIFACTS", "/opt/cursor/artifacts"))

# Runtime dirs (created on demand)
ROOT = DATA_ROOT
OUT_V6 = DATA_ROOT / "out_v6"
SUBS_V6 = DATA_ROOT / "subs_v6"
VO_V6 = DATA_ROOT / "vo_v6"
MUSIC_DIR = DATA_ROOT / "music"
SFX_DIR = DATA_ROOT / "sfx"
RAW_DIR = DATA_ROOT / "raw"

NAS_BASE = "https://emobilist.synology.me:5001"
NAS_USER = "ralf.schuengel"

LOCAL_RAW_MAP = {
    "241217_OneWheel": RAW_DIR / "pilot_onewheel",
    "250906_Ohlala Kids Dirt Bike": RAW_DIR / "pilot_ohlala",
    "250413_TST_002 Fatbike": RAW_DIR / "pilot_tst",
    "250322_VitilanV3": RAW_DIR / "pilot_vitilan",
    "250513_Invanti_Tide2": RAW_DIR / "250513_Invanti_Tide2",
    "250103_LUMOS_Hemlet": RAW_DIR / "250103_LUMOS_Hemlet",
}

NAS_RAW_PATHS = {
    "241217_OneWheel": "/usbshare1-2/Schnitt/RAW/241217_OneWheel",
    "250906_Ohlala Kids Dirt Bike": "/usbshare1-2/Schnitt/RAW/250906_Ohlala Kids Dirt Bike",
    "250413_TST_002 Fatbike": "/usbshare1-2/Schnitt/RAW/250413_TST_002 Fatbike",
    "250322_VitilanV3": "/usbshare1-2/Schnitt/RAW/250322_VitilanV3",
    "250513_Invanti_Tide2": "/usbshare1-2/Schnitt/RAW/250513_Invanti_Tide2",
    "250103_LUMOS_Hemlet": "/usbshare1-2/Schnitt/RAW/250103_LUMOS_Hemlet",
}

NAS_MUSIC_DIR = "/usbshare1-2/Schnitt/Musik/YouTube_Audio"
NAS_SFX_DIR = "/usbshare1-2/Schnitt/FX_Sound"


def ensure_dirs() -> None:
    for d in (DATA_ROOT, OUT_V6, SUBS_V6, VO_V6, MUSIC_DIR, SFX_DIR, RAW_DIR):
        d.mkdir(parents=True, exist_ok=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)


def synology_password() -> str | None:
    env = os.environ.get("SYNOLOGY_PASSWORD") or os.environ.get("NAS_PASSWORD")
    if env:
        return env
    for p in (DATA_ROOT / "synology_creds.json", Path("/tmp/synology_creds.json")):
        if p.exists():
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                return data.get("password") or data.get("passwd")
            except Exception:
                pass
    return None


def elevenlabs_api_key() -> str | None:
    return os.environ.get("ELEVENLABS_API_KEY")


def youtube_token_path(channel: str) -> Path:
    suffix = "de" if channel == "de" else "usa"
    env_key = f"YOUTUBE_OAUTH_{suffix.upper()}"
    raw = os.environ.get(env_key)
    p = DATA_ROOT / f"youtube_oauth_tokens_{suffix}.json"
    if raw:
        try:
            data = json.loads(raw)
            p.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except json.JSONDecodeError:
            p.write_text(raw, encoding="utf-8")
    # Fallback: legacy /tmp paths from prior agent sessions
    legacy = Path(f"/tmp/youtube_oauth_tokens_{suffix}.json")
    if legacy.exists() and not p.exists():
        p.write_text(legacy.read_text(encoding="utf-8"), encoding="utf-8")
    return legacy if legacy.exists() else p
