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
    assert parsed["temp_c"] == 22
    assert parsed["temp_label_c"] == "22°C"
    assert parsed["condition"] == "Heiter"
    assert parsed["high"] == 79
    assert parsed["low"] == 58
    assert parsed["high_c"] == 26
    assert parsed["low_c"] == 14
    assert "Max 79°" in parsed["range_label"]
    assert "Min 58°" in parsed["range_label"]
    assert parsed["range_label_c"] == "Max 26° · Min 14°"


def test_parse_nws_camarillo():
    parsed = weather.parse_nws(NWS_HOURLY, NWS_FORECAST, place="Camarillo")
    assert parsed["ok"] is True
    assert parsed["source"] == "nws"
    assert parsed["temp"] == 63
    assert parsed["temp_label"] == "63°F"
    assert parsed["temp_c"] == 17
    assert parsed["temp_label_c"] == "17°C"
    assert parsed["condition"] == "Klar"
    assert parsed["high"] == 77
    assert parsed["low"] == 58
    assert parsed["high_c"] == 25
    assert parsed["low_c"] == 14
    assert parsed["range_label"] == "Max 77° · Min 58°"
    assert parsed["range_label_c"] == "Max 25° · Min 14°"


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

    monkeypatch.setattr(weather, "fetch_open_meteo", fake_nws)
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


def test_open_meteo_used_first(tmp_path: Path, monkeypatch):
    weather.reset_cache()
    calls = {"nws": 0}

    def nws(cfg=None, opener=None):
        calls["nws"] += 1
        raise AssertionError("nws should not run when open-meteo works")

    monkeypatch.setattr(weather, "fetch_nws", nws)
    monkeypatch.setattr(
        weather,
        "fetch_open_meteo",
        lambda cfg=None, opener=None: weather.parse_forecast(SAMPLE, place="Camarillo"),
    )
    out = weather.current_weather(tmp_path / "weather.json", now=10.0)
    assert out["source"] == "open-meteo"
    assert out["temp"] == 72
    assert calls["nws"] == 0


def test_nws_used_when_open_meteo_fails(tmp_path: Path, monkeypatch):
    weather.reset_cache()

    def boom(cfg=None, opener=None):
        raise OSError("open-meteo down")

    monkeypatch.setattr(weather, "fetch_open_meteo", boom)
    monkeypatch.setattr(
        weather,
        "fetch_nws",
        lambda cfg=None, opener=None: weather.parse_nws(NWS_HOURLY, NWS_FORECAST, "Camarillo"),
    )
    out = weather.current_weather(tmp_path / "weather.json", now=10.0)
    assert out["source"] == "nws"
    assert out["temp"] == 63


def test_api_weather_camarillo(client, monkeypatch):
    weather.reset_cache()
    monkeypatch.setattr(
        weather,
        "fetch_open_meteo",
        lambda cfg=None, opener=None: weather.parse_forecast(SAMPLE, place="Camarillo"),
    )
    res = client.get("/api/weather")
    assert res.status_code == 200
    body = res.get_json()
    assert body["ok"] is True
    assert body["place"] == "Camarillo"
    assert body["temp_label"].endswith("°F")
    assert body["temp_label_c"].endswith("°C")
    state = client.get("/api/state").get_json()
    assert state["weather"]["place"] == "Camarillo"


def test_fridge_page_has_weather_overlay(client):
    html = client.get("/fridge").get_data(as_text=True)
    assert 'id="weather"' in html
    assert "Camarillo" in html
    assert "v29" in html
    assert 'id="weather-temp-c"' in html
    assert 'id="weather-range-c"' in html
    assert "newsletter" not in html.lower()
    assert 'id="tap-prev"' in html
    assert 'id="tap-next"' in html
    assert 'id="frame-a"' in html
    assert "Play" in html
    assert "Läuft" not in html
    assert 'id="slide-remain"' in html
    assert "Zur Seite wischen" in html
    assert "Links am Rand" in html
    css = client.get("/static/css/fridge.css").get_data(as_text=True)
    assert "#weather-temp-c" in css
    assert "font-size: 96px" in css
    assert "font-size: 36px" in css
    assert "#weather-c" in css
    assert "#tap-prev" in css
    assert "#play-pause" in css
    assert "width: 36%" in css
    assert "body.hub" in css
    assert "zoom: 0.5" in css
    assert "transform: scale(0.5)" not in css
    assert "object-fit: cover" in css
    assert "photo-frame" in css
    assert "infinite alternate" not in css
    js = client.get("/static/js/fridge.js").get_data(as_text=True)
    assert "function intervalSeconds()" in js
    assert "function armSlideClock" in js
    assert "function maybeAdvance" in js
    assert "tickSlideClock" in js
    assert "setInterval(nextPhoto" not in js
    assert "function sizeToCover" in js
    assert "translate3d(" in js
    assert "requestAnimationFrame" in js
    assert "function stopMotion" in js
    assert "touchstart" in js
    assert "prevPhoto" in js
    assert "nextPhoto" in js
    assert "tap-prev" in js
    assert "togglePaused" in js
    assert "dismissCurrentNote" in js
    assert "pickPan" in js
    assert "x0: cx, y0: cy" in js
    assert "landscape ? 1.3" in js
    assert "transformOrigin" in js
    assert 'indexOf("hub")' in js
    assert "Max " in js
    assert "Min " in js
    assert "shiftPhoto" in js
    assert "document.documentElement.style.zoom" in js
    assert "function reveal()" in js
    assert "api.open-meteo.com" in js
    assert "parseOpenMeteo" in js
    assert "function fToC(" in js
    assert "weather-temp-c" in js
    assert "openNewsletter" not in js
