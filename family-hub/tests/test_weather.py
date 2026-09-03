from __future__ import annotations

import json
from pathlib import Path

import weather


SAMPLE = {
    "current": {
        "time": "2026-09-02T21:45",
        "temperature_2m": 72.4,
        "apparent_temperature": 70.1,
        "weather_code": 1,
        "wind_speed_10m": 6.2,
    },
    "daily": {
        "temperature_2m_max": [78.6],
        "temperature_2m_min": [58.2],
        "weather_code": [1],
    },
}


class _FakeResp:
    def __init__(self, payload):
        self._payload = payload

    def read(self):
        return json.dumps(self._payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def test_parse_camarillo_forecast():
    parsed = weather.parse_forecast(SAMPLE, place="Camarillo")
    assert parsed["ok"] is True
    assert parsed["place"] == "Camarillo"
    assert parsed["temp"] == 72
    assert parsed["temp_label"] == "72°F"
    assert parsed["condition"] == "Heiter"
    assert parsed["high"] == 79
    assert parsed["low"] == 58
    assert "Hoch 79°" in parsed["range_label"]
    assert "Tief 58°" in parsed["range_label"]


def test_unknown_wmo_still_readable():
    assert weather.wmo_label(1234) == "Wetter"
    assert weather.wmo_label(0) == "Klar"


def test_current_weather_uses_cache(tmp_path: Path, monkeypatch):
    weather.reset_cache()
    monkeypatch.setenv("FAMILY_HUB_WEATHER_PLACE", "Camarillo")
    calls = {"n": 0}

    def opener(_req, timeout=8):
        calls["n"] += 1
        return _FakeResp(SAMPLE)

    cache = tmp_path / "weather.json"
    first = weather.current_weather(cache, opener=opener, now=1000.0)
    second = weather.current_weather(cache, opener=opener, now=1300.0)
    assert calls["n"] == 1
    assert first["temp"] == 72
    assert second["temp"] == 72
    assert json.loads(cache.read_text())["place"] == "Camarillo"


def test_weather_falls_back_to_disk_when_fetch_fails(tmp_path: Path):
    weather.reset_cache()
    cache = tmp_path / "weather.json"
    stale = weather.parse_forecast(SAMPLE, place="Camarillo")
    cache.write_text(json.dumps(stale), encoding="utf-8")

    def opener(_req, timeout=8):
        raise OSError("offline")

    out = weather.current_weather(cache, opener=opener, now=5000.0)
    assert out["ok"] is True
    assert out["stale"] is True
    assert out["temp_label"] == "72°F"


def test_api_weather_camarillo(client, tmp_path, monkeypatch):
    weather.reset_cache()

    def opener(_req, timeout=8):
        return _FakeResp(SAMPLE)

    monkeypatch.setattr(weather, "fetch_forecast", lambda url, opener=None: SAMPLE)
    res = client.get("/api/weather")
    assert res.status_code == 200
    body = res.get_json()
    assert body["ok"] is True
    assert body["place"] == "Camarillo"
    assert body["temp_label"].endswith("°F")
    state = client.get("/api/state").get_json()
    assert state["weather"]["place"] == "Camarillo"


def test_fridge_page_has_weather_overlay(client):
    html = client.get("/fridge").get_data(as_text=True)
    assert 'id="weather"' in html
    assert "Camarillo" in html
