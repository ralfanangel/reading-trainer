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

NWS_HOURLY = {
    "properties": {
        "periods": [
            {
                "startTime": "2026-09-02T21:00:00-07:00",
                "temperature": 63,
                "temperatureUnit": "F",
                "shortForecast": "Clear",
            }
        ]
    }
}

NWS_FORECAST = {
    "properties": {
        "periods": [
            {"name": "Tonight", "isDaytime": False, "temperature": 58, "shortForecast": "Clear"},
            {"name": "Thursday", "isDaytime": True, "temperature": 77, "shortForecast": "Sunny"},
        ]
    }
}


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


def test_parse_nws_camarillo():
    parsed = weather.parse_nws(NWS_HOURLY, NWS_FORECAST, place="Camarillo")
    assert parsed["ok"] is True
    assert parsed["source"] == "nws"
    assert parsed["temp"] == 63
    assert parsed["temp_label"] == "63°F"
    assert parsed["condition"] == "Klar"
    assert parsed["high"] == 77
    assert parsed["low"] == 58
    assert parsed["range_label"] == "Hoch 77° · Tief 58°"


def test_forecast_url_keeps_open_meteo_commas():
    url = weather.forecast_url()
    assert "current=temperature_2m,apparent_temperature" in url
    assert "%2C" not in url
    assert "34.2164" in url
    assert "-119.0376" in weather.nws_points_url()
    assert weather.wmo_label(1234) == "Wetter"
    assert weather.wmo_label(0) == "Klar"
    assert weather.english_condition_de("Patchy Fog then Mostly Sunny") == "Nebel"


def test_current_weather_uses_cache(tmp_path: Path, monkeypatch):
    weather.reset_cache()
    monkeypatch.setenv("FAMILY_HUB_WEATHER_PLACE", "Camarillo")
    calls = {"n": 0}
    parsed = weather.parse_nws(NWS_HOURLY, NWS_FORECAST, place="Camarillo")

    def fake_nws(cfg=None, opener=None):
        calls["n"] += 1
        return parsed

    monkeypatch.setattr(weather, "fetch_nws", fake_nws)
    cache = tmp_path / "weather.json"
    first = weather.current_weather(cache, now=1000.0)
    second = weather.current_weather(cache, now=1300.0)
    assert calls["n"] == 1
    assert first["temp"] == 63
    assert second["place"] == "Camarillo"
    assert json.loads(cache.read_text())["place"] == "Camarillo"


def test_weather_falls_back_to_disk_when_fetch_fails(tmp_path: Path, monkeypatch):
    weather.reset_cache()
    cache = tmp_path / "weather.json"
    stale = weather.parse_nws(NWS_HOURLY, NWS_FORECAST, place="Camarillo")
    cache.write_text(json.dumps(stale), encoding="utf-8")

    def boom(cfg=None, opener=None):
        raise OSError("offline")

    monkeypatch.setattr(weather, "fetch_nws", boom)
    monkeypatch.setattr(weather, "fetch_open_meteo", boom)
    out = weather.current_weather(cache, now=5000.0)
    assert out["ok"] is True
    assert out["stale"] is True
    assert out["temp_label"] == "63°F"


def test_open_meteo_used_when_nws_fails(tmp_path: Path, monkeypatch):
    weather.reset_cache()

    def boom(cfg=None, opener=None):
        raise OSError("nws down")

    monkeypatch.setattr(weather, "fetch_nws", boom)
    monkeypatch.setattr(
        weather,
        "fetch_open_meteo",
        lambda cfg=None, opener=None: weather.parse_forecast(SAMPLE, place="Camarillo"),
    )
    out = weather.current_weather(tmp_path / "weather.json", now=10.0)
    assert out["source"] == "open-meteo"
    assert out["temp"] == 72


def test_api_weather_camarillo(client, monkeypatch):
    weather.reset_cache()
    monkeypatch.setattr(
        weather,
        "fetch_nws",
        lambda cfg=None, opener=None: weather.parse_nws(NWS_HOURLY, NWS_FORECAST, "Camarillo"),
    )
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
    assert "v10" in html
