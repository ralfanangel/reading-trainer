"""V6 voice synthesis — ElevenLabs (Ralf clone) with edge-tts fallback."""
from __future__ import annotations

import asyncio
import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

from build_short_v2 import probe_duration, run
from pipeline_config import VO_V6, elevenlabs_api_key

# ElevenLabs voice ID for Ralf (set via env or default placeholder)
ELEVEN_VOICE_ID = os.environ.get(
    "ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB"
)  # Adam fallback; replace with Ralf clone ID

VOICES_EDGE = {
    "de": "de-DE-KillianNeural",  # deeper, less TikTok than Conrad
    "en": "en-US-GuyNeural",
}


async def _edge_tts_save(text: str, voice: str, out_mp3: Path) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice, rate="-5%")
    await communicate.save(str(out_mp3))


def _elevenlabs_tts(text: str, out_mp3: Path, api_key: str) -> None:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE_ID}"
    body = json.dumps(
        {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.45,
                "similarity_boost": 0.85,
                "style": 0.15,
                "use_speaker_boost": True,
            },
        }
    ).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        out_mp3.write_bytes(r.read())


def synthesize_narration(
    script: str,
    lang: str,
    out_wav: Path,
    *,
    prefer_elevenlabs: bool = True,
) -> tuple[Path, str]:
    """Generate continuous narration WAV. Returns (path, engine_used)."""
    VO_V6.mkdir(parents=True, exist_ok=True)
    mp3 = out_wav.with_suffix(".mp3")
    engine = "edge-tts"

    api_key = elevenlabs_api_key() if prefer_elevenlabs else None
    if api_key:
        try:
            _elevenlabs_tts(script, mp3, api_key)
            engine = "elevenlabs"
        except Exception as e:
            print(f"ElevenLabs failed ({e}), falling back to edge-tts")

    if engine == "edge-tts":
        voice = VOICES_EDGE["de" if lang.startswith("de") else "en"]
        asyncio.run(_edge_tts_save(script, voice, mp3))

    run(
        [
            "ffmpeg", "-y", "-i", str(mp3),
            "-ac", "2", "-ar", "44100",
            "-af", "highpass=f=80,compand=attacks=0.1:decays=0.3:points=-80/-80|-20/-15|0/-5",
            str(out_wav),
        ]
    )
    return out_wav, engine
