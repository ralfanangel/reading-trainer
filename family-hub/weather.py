"""Camarillo weather for the fridge photo overlay. No API key.

Uses the US National Weather Service first (Camarillo is in their LOX grid),
then Open-Meteo if weather.gov is unreachable.
"""

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
UA = "FamilyHubDisplay/1.0 (family-hub)"

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

NWS_PHRASE_DE = (
    ("thunder", "Gewitter"),
    ("fog", "Nebel"),
    ("snow", "Schnee"),
    ("shower", "Schauer"),
    ("rain", "Regen"),
    ("drizzle", "Niesel"),
    ("overcast", "Bedeckt"),
    ("cloud", "Wolkig"),
    ("sunny", "Sonnig"),
    ("clear", "Klar"),
    ("fair", "Heiter"),
    ("wind", "Wind"),
)

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


def english_condition_de(text: str | None) -> str:
    low = (text or "").lower()
    for key, label in NWS_PHRASE_DE:
        if key in low:
            return label
    return (text or "Wetter").strip() or "Wetter"


def forecast_url(cfg: dict[str, Any] | None = None) -> str:
    cfg = cfg or location()
    # Open-Meteo rejects comma-encoded current=/daily= lists (empty or hanging response).
    return (
        "https://api.open-meteo.com/v1/forecast"
        "?latitude=%.4f&longitude=%.4f"
        "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m"
        "&daily=temperature_2m_max,temperature_2m_min,weather_code"
        "&temperature_unit=fahrenheit"
        "&wind_speed_unit=mph"
        "&timezone=%s"
        "&forecast_days=1"
    ) % (cfg["lat"], cfg["lon"], urllib.parse.quote(str(cfg["timezone"]), safe="/"))


def nws_points_url(cfg: dict[str, Any] | None = None) -> str:
    cfg = cfg or location()
    return "https://api.weather.gov/points/%.4f,%.4f" % (cfg["lat"], cfg["lon"])


def _round_temp(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _range_label(high: int | None, low: int | None) -> str:
    if high is not None and low is not None:
        return "Hoch %s° · Tief %s°" % (high, low)
    if high is not None:
        return "Hoch %s°" % high
    if low is not None:
        return "Tief %s°" % low
    return ""


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
    return {
        "ok": True,
        "place": place,
        "source": "open-meteo",
        "temp": temp,
        "temp_label": "%s°F" % temp,
        "unit": "F",
        "condition": wmo_label(code_i),
        "weather_code": code_i,
        "high": high,
        "low": low,
        "range_label": _range_label(high, low),
        "feels_like": _round_temp(current.get("apparent_temperature")),
        "updated_at": current.get("time"),
    }


def parse_nws(
    hourly: dict[str, Any],
    forecast: dict[str, Any],
    place: str = DEFAULT_PLACE,
) -> dict[str, Any]:
    periods_h = (hourly.get("properties") or {}).get("periods") or []
    if not periods_h:
        raise ValueError("no hourly periods")
    current = periods_h[0]
    temp = _round_temp(current.get("temperature"))
    if temp is None:
        raise ValueError("no temperature")
    high = None
    low = None
    for period in (forecast.get("properties") or {}).get("periods") or []:
        value = _round_temp(period.get("temperature"))
        if value is None:
            continue
        if period.get("isDaytime") and high is None:
            high = value
        if (not period.get("isDaytime")) and low is None:
            low = value
        if high is not None and low is not None:
            break
    return {
        "ok": True,
        "place": place,
        "source": "nws",
        "temp": temp,
        "temp_label": "%s°F" % temp,
        "unit": "F",
        "condition": english_condition_de(str(current.get("shortForecast") or "")),
        "weather_code": None,
        "high": high,
        "low": low,
        "range_label": _range_label(high, low),
        "feels_like": None,
        "updated_at": current.get("startTime"),
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


def fetch_json(
    url: str,
    opener: Callable[..., Any] | None = None,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    hdrs = {"User-Agent": UA, "Accept": "application/json"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    open_fn = opener or urllib.request.urlopen
    with open_fn(req, timeout=15) as resp:
        body = resp.read()
    text = body.decode("utf-8", errors="replace").strip()
    if not text or text[0] not in "{[":
        raise ValueError("weather response was not JSON")
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("weather response was not an object")
    return parsed


def fetch_nws(cfg: dict[str, Any] | None = None, opener: Callable[..., Any] | None = None) -> dict[str, Any]:
    cfg = cfg or location()
    points = fetch_json(nws_points_url(cfg), opener=opener, headers={"Accept": "application/geo+json"})
    props = points.get("properties") or {}
    hourly_url = props.get("forecastHourly")
    forecast_url_nws = props.get("forecast")
    if not hourly_url or not forecast_url_nws:
        raise ValueError("nws points missing forecast urls")
    loc = ((props.get("relativeLocation") or {}).get("properties") or {}).get("city") or cfg["place"]
    hourly = fetch_json(str(hourly_url), opener=opener, headers={"Accept": "application/geo+json"})
    forecast = fetch_json(str(forecast_url_nws), opener=opener, headers={"Accept": "application/geo+json"})
    return parse_nws(hourly, forecast, place=str(loc))


def fetch_open_meteo(cfg: dict[str, Any] | None = None, opener: Callable[..., Any] | None = None) -> dict[str, Any]:
    cfg = cfg or location()
    raw = fetch_json(forecast_url(cfg), opener=opener)
    return parse_forecast(raw, place=cfg["place"])


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
    payload: dict[str, Any] | None = None
    try:
        payload = fetch_nws(cfg, opener=opener)
    except Exception:
        try:
            payload = fetch_open_meteo(cfg, opener=opener)
        except Exception:
            payload = None

    if payload and payload.get("ok"):
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
