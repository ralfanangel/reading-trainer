"""Camarillo weather for the fridge photo overlay. Open-Meteo, no API key."""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

DEFAULT_LAT = 34.2164
DEFAULT_LON = -119.0376
DEFAULT_PLACE = "Camarillo"
DEFAULT_TZ = "America/Los_Angeles"
CACHE_SECONDS = 600

WMO_DE = {
    0: "Klar",
    1: "Heiter",
    2: "Wolkig",
    3: "Bedeckt",
    45: "Nebel",
    48: "Nebel",
    51: "Niesel",
    53: "Niesel",
    55: "Niesel",
    56: "Niesel",
    57: "Niesel",
    61: "Regen",
    63: "Regen",
    65: "Regen",
    66: "Regen",
    67: "Regen",
    71: "Schnee",
    73: "Schnee",
    75: "Schnee",
    77: "Schnee",
    80: "Schauer",
    81: "Schauer",
    82: "Schauer",
    85: "Schneeschauer",
    86: "Schneeschauer",
    95: "Gewitter",
    96: "Gewitter",
    99: "Gewitter",
}

_lock = threading.Lock()
_mem: dict[str, Any] = {"at": 0.0, "data": None}


def reset_cache() -> None:
    with _lock:
        _mem["at"] = 0.0
        _mem["data"] = None


def location() -> dict[str, Any]:
    return {
        "lat": float(os.environ.get("FAMILY_HUB_WEATHER_LAT", DEFAULT_LAT)),
        "lon": float(os.environ.get("FAMILY_HUB_WEATHER_LON", DEFAULT_LON)),
        "place": (os.environ.get("FAMILY_HUB_WEATHER_PLACE", DEFAULT_PLACE) or DEFAULT_PLACE).strip(),
        "timezone": os.environ.get("FAMILY_HUB_WEATHER_TZ", DEFAULT_TZ) or DEFAULT_TZ,
    }


def wmo_label(code: int | None) -> str:
    if code is None:
        return "Wetter"
    return WMO_DE.get(int(code), "Wetter")


def forecast_url(cfg: dict[str, Any] | None = None) -> str:
    cfg = cfg or location()
    query = urllib.parse.urlencode(
        {
            "latitude": "%.4f" % cfg["lat"],
            "longitude": "%.4f" % cfg["lon"],
            "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
            "daily": "temperature_2m_max,temperature_2m_min,weather_code",
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
            "timezone": cfg["timezone"],
            "forecast_days": "1",
        }
    )
    return "https://api.open-meteo.com/v1/forecast?" + query


def _round_temp(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def parse_forecast(raw: dict[str, Any], place: str = DEFAULT_PLACE) -> dict[str, Any]:
    current = raw.get("current") or {}
    daily = raw.get("daily") or {}
    temp = _round_temp(current.get("temperature_2m"))
    if temp is None:
        raise ValueError("no temperature")
    highs = daily.get("temperature_2m_max") or []
    lows = daily.get("temperature_2m_min") or []
    high = _round_temp(highs[0] if highs else None)
    low = _round_temp(lows[0] if lows else None)
    code = current.get("weather_code")
    try:
        code_i = int(code) if code is not None else None
    except (TypeError, ValueError):
        code_i = None
    range_label = ""
    if high is not None and low is not None:
        range_label = "Hoch %s° · Tief %s°" % (high, low)
    elif high is not None:
        range_label = "Hoch %s°" % high
    return {
        "ok": True,
        "place": place,
        "temp": temp,
        "temp_label": "%s°F" % temp,
        "unit": "F",
        "condition": wmo_label(code_i),
        "weather_code": code_i,
        "high": high,
        "low": low,
        "range_label": range_label,
        "feels_like": _round_temp(current.get("apparent_temperature")),
        "updated_at": current.get("time"),
    }


def cached() -> dict[str, Any] | None:
    with _lock:
        data = _mem.get("data")
        return dict(data) if isinstance(data, dict) else None


def _read_disk(path: Path) -> dict[str, Any] | None:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if isinstance(raw, dict) and raw.get("ok"):
        return raw
    return None


def _write_disk(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def fetch_forecast(
    url: str,
    opener: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": "FamilyHubDisplay/1.0"})
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=15) as resp:
        body = resp.read()
    return json.loads(body.decode("utf-8"))


def current_weather(
    cache_path: str | Path | None = None,
    force: bool = False,
    opener: Callable[..., Any] | None = None,
    now: float | None = None,
) -> dict[str, Any]:
    """Return Camarillo weather, cached for CACHE_SECONDS. Never raises."""
    path = Path(cache_path) if cache_path else None
    stamp = time.time() if now is None else now
    with _lock:
        data = _mem.get("data")
        age = stamp - float(_mem.get("at") or 0)
        if not force and isinstance(data, dict) and data.get("ok") and age < CACHE_SECONDS:
            return dict(data)

    cfg = location()
    try:
        raw = fetch_forecast(forecast_url(cfg), opener=opener)
        payload = parse_forecast(raw, place=cfg["place"])
        payload["fetched_at"] = stamp
        with _lock:
            _mem["at"] = stamp
            _mem["data"] = payload
        if path is not None:
            try:
                _write_disk(path, payload)
            except OSError:
                pass
        return dict(payload)
    except Exception:
        fallback = None
        with _lock:
            if isinstance(_mem.get("data"), dict):
                fallback = dict(_mem["data"])
        if fallback is None and path is not None:
            fallback = _read_disk(path)
            if fallback:
                with _lock:
                    _mem["data"] = fallback
                    _mem["at"] = stamp
        if fallback:
            out = dict(fallback)
            out["stale"] = True
            return out
        return {"ok": False, "place": cfg["place"], "reason": "weather_unavailable"}
