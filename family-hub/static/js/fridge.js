(function () {
  "use strict";

  var state = null;
  var queue = [];
  var queuePos = -1;
  var lastId = null;
  var showA = true;
  var timer = null;
  var noteTimer = null;
  var noteIndex = 0;
  var paused = false;
  var pollTimer = null;
  var touchStartX = 0;
  var touchStartY = 0;
  var touchActive = false;
  var swiped = false;
  var lastNavAt = 0;

  var photoA = document.getElementById("photo-a");
  var photoB = document.getElementById("photo-b");
  var empty = document.getElementById("empty");
  var clockEl = document.getElementById("clock");
  var dateEl = document.getElementById("date");
  var noteEl = document.getElementById("note");
  var noteAuthor = document.getElementById("note-author");
  var noteText = document.getElementById("note-text");
  var pausedEl = document.getElementById("paused");
  var weatherEl = document.getElementById("weather");
  var weatherPlace = document.getElementById("weather-place");
  var weatherTemp = document.getElementById("weather-temp");
  var weatherCond = document.getElementById("weather-cond");
  var weatherRange = document.getElementById("weather-range");
  var stage = document.getElementById("stage");

  function qs(name) {
    var search = window.location.search || "";
    var parts = search.replace(/^\?/, "").split("&");
    var i;
    for (i = 0; i < parts.length; i++) {
      var pair = parts[i].split("=");
      if (decodeURIComponent(pair[0] || "") === name) {
        return decodeURIComponent(pair[1] || "");
      }
    }
    return "";
  }

  var weatherOk = false;
  var WMO = {
    0: "Klar",
    1: "Heiter",
    2: "Wolkig",
    3: "Bedeckt",
    45: "Nebel",
    48: "Nebel",
    51: "Niesel",
    53: "Niesel",
    55: "Niesel",
    61: "Regen",
    63: "Regen",
    65: "Regen",
    71: "Schnee",
    73: "Schnee",
    75: "Schnee",
    80: "Schauer",
    81: "Schauer",
    82: "Schauer",
    95: "Gewitter",
    96: "Gewitter",
    99: "Gewitter"
  };

  function renderWeather(data) {
    if (!weatherEl) {
      return;
    }
    weatherPlace.textContent = (data && data.place) ? data.place : "Camarillo";
    if (data && data.ok) {
      weatherOk = true;
      weatherTemp.textContent = data.temp_label || "";
      weatherCond.textContent = data.condition || "";
      weatherRange.textContent = data.range_label || "";
    } else if (!weatherOk) {
      weatherTemp.textContent = "—";
      weatherCond.textContent = "wird geladen";
      weatherRange.textContent = "";
    }
    weatherEl.className = "";
  }

  function openMeteoUrl() {
    return "https://api.open-meteo.com/v1/forecast"
      + "?latitude=34.2164&longitude=-119.0376"
      + "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m"
      + "&daily=temperature_2m_max,temperature_2m_min,weather_code"
      + "&temperature_unit=fahrenheit"
      + "&wind_speed_unit=mph"
      + "&timezone=America/Los_Angeles"
      + "&forecast_days=1";
  }

  function parseOpenMeteo(raw) {
    var current = (raw && raw.current) ? raw.current : {};
    var daily = (raw && raw.daily) ? raw.daily : {};
    if (current.temperature_2m == null) {
      return { ok: false, place: "Camarillo" };
    }
    var temp = Math.round(Number(current.temperature_2m));
    var highs = daily.temperature_2m_max || [];
    var lows = daily.temperature_2m_min || [];
    var high = highs.length ? Math.round(Number(highs[0])) : null;
    var low = lows.length ? Math.round(Number(lows[0])) : null;
    var cond = WMO[current.weather_code] || "Wetter";
    var range = "";
    if (high != null && low != null) {
      range = "Hoch " + high + "° · Tief " + low + "°";
    } else if (high != null) {
      range = "Hoch " + high + "°";
    }
    return {
      ok: true,
      place: "Camarillo",
      source: "open-meteo",
      temp: temp,
      temp_label: temp + "°F",
      condition: cond,
      range_label: range
    };
  }

  function loadWeatherFromOpenMeteo() {
    fetch(openMeteoUrl())
      .then(function (res) { return res.json(); })
      .then(function (raw) { renderWeather(parseOpenMeteo(raw)); })
      .catch(function () {
        if (!weatherOk) {
          renderWeather({ ok: false, place: "Camarillo" });
        }
      });
  }

  function loadWeather() {
    loadWeatherFromOpenMeteo();
    fetch("/api/weather")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.ok) {
          renderWeather(data);
        }
      })
      .catch(function () {});
  }

  function applyHubZoom() {
    var zoom = qs("zoom");
    var forceHub = qs("hub") === "1";
    var ua = navigator.userAgent || "";
    if (zoom) {
      document.documentElement.style.zoom = zoom;
      document.body.className += " hub";
    } else if (forceHub || ua.indexOf("Tizen") !== -1 || ua.indexOf("FamilyHub") !== -1) {
      document.body.className += " hub";
    }
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function tickClock() {
    var now = new Date();
    clockEl.textContent = pad(now.getHours()) + ":" + pad(now.getMinutes());
    try {
      var label = now.toLocaleDateString("de-DE", {
        weekday: "long",
        day: "numeric",
        month: "long"
      });
      if (state && state.settings && state.settings.family_name) {
        label = state.settings.family_name + "  ·  " + label;
      }
      dateEl.textContent = label;
    } catch (e) {
      dateEl.textContent = now.toDateString();
    }
  }

  function shuffle(ids) {
    var copy = ids.slice();
    var i;
    var tmp;
    for (i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    if (lastId && copy.length > 1 && copy[0] === lastId) {
      tmp = copy[0];
      copy[0] = copy[1];
      copy[1] = tmp;
    }
    return copy;
  }

  function refillQueue() {
    var ids = [];
    var i;
    if (!state || !state.photos) {
      queue = [];
      return;
    }
    for (i = 0; i < state.photos.length; i++) {
      ids.push(state.photos[i].id);
    }
    queue = shuffle(ids);
    queuePos = -1;
  }

  function showPhoto(url) {
    var incoming = showA ? photoB : photoA;
    var outgoing = showA ? photoA : photoB;
    function reveal() {
      incoming.onload = null;
      incoming.className = "show";
      outgoing.className = "";
      showA = !showA;
    }
    incoming.onload = reveal;
    var current = incoming.getAttribute("src") || incoming.src || "";
    if (current === url || current.indexOf(url) !== -1) {
      reveal();
      return;
    }
    incoming.src = url;
  }

  function nextPhoto() {
    if (!queue.length) {
      empty.className = "show";
      photoA.className = "";
      photoB.className = "";
      return;
    }
    empty.className = "";
    queuePos += 1;
    if (queuePos >= queue.length) {
      refillQueue();
      queuePos = 0;
    }
    lastId = queue[queuePos];
    showPhoto("/media/photos/" + lastId);
  }

  function prevPhoto() {
    if (!queue.length) {
      return;
    }
    queuePos -= 1;
    if (queuePos < 0) {
      queuePos = queue.length - 1;
    }
    lastId = queue[queuePos];
    showPhoto("/media/photos/" + lastId);
  }

  function intervalMs() {
    var seconds = 12;
    if (state && state.settings && state.settings.photo_seconds) {
      seconds = state.settings.photo_seconds;
    }
    return seconds * 1000;
  }

  function schedule() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (!paused) {
      timer = setInterval(nextPhoto, intervalMs());
    }
  }

  function setPaused(value) {
    paused = value;
    pausedEl.className = paused ? "" : "hidden";
    schedule();
  }

  function renderNote() {
    if (!state || !state.messages || !state.messages.length) {
      noteEl.className = "hidden";
      return;
    }
    if (noteIndex >= state.messages.length) {
      noteIndex = 0;
    }
    var msg = state.messages[noteIndex];
    noteAuthor.textContent = msg.author || "Nachricht";
    noteText.textContent = msg.text || "";
    noteEl.className = "";
  }

  function scheduleNotes() {
    if (noteTimer) {
      clearInterval(noteTimer);
    }
    renderNote();
    noteTimer = setInterval(function () {
      if (!state || !state.messages || !state.messages.length) {
        return;
      }
      noteIndex = (noteIndex + 1) % state.messages.length;
      renderNote();
    }, 14000);
  }

  function applyState(next, isFirst) {
    var oldPhotoCount = state && state.photos ? state.photos.length : 0;
    state = next;
    if (!queue.length || (state.photos && state.photos.length !== oldPhotoCount)) {
      refillQueue();
      if (isFirst || oldPhotoCount === 0) {
        nextPhoto();
      }
    }
    schedule();
    scheduleNotes();
    if (state.weather) {
      renderWeather(state.weather);
    }
  }

  function loadState(isFirst) {
    fetch("/api/state")
      .then(function (res) { return res.json(); })
      .then(function (data) { applyState(data, isFirst); })
      .catch(function () {});
  }

  function pointX(ev) {
    if (ev.changedTouches && ev.changedTouches[0]) {
      return ev.changedTouches[0].clientX;
    }
    if (ev.touches && ev.touches[0]) {
      return ev.touches[0].clientX;
    }
    return ev.clientX || 0;
  }

  function pointY(ev) {
    if (ev.changedTouches && ev.changedTouches[0]) {
      return ev.changedTouches[0].clientY;
    }
    if (ev.touches && ev.touches[0]) {
      return ev.touches[0].clientY;
    }
    return ev.clientY || 0;
  }

  function resumeAfterNav() {
    if (paused) {
      setPaused(false);
    } else {
      schedule();
    }
  }

  function canNav() {
    var now = Date.now();
    if (now - lastNavAt < 400) {
      return false;
    }
    lastNavAt = now;
    return true;
  }

  function goPrev() {
    if (!canNav()) {
      return;
    }
    prevPhoto();
    resumeAfterNav();
  }

  function goNext() {
    if (!canNav()) {
      return;
    }
    nextPhoto();
    resumeAfterNav();
  }

  function onTouchStart(ev) {
    touchActive = true;
    swiped = false;
    touchStartX = pointX(ev);
    touchStartY = pointY(ev);
  }

  function onTouchMove(ev) {
    if (!touchActive) {
      return;
    }
    var dx = pointX(ev) - touchStartX;
    if (Math.abs(dx) > 24) {
      swiped = true;
      if (ev.preventDefault) {
        ev.preventDefault();
      }
    }
  }

  function onTouchEnd(ev) {
    if (!touchActive) {
      return;
    }
    touchActive = false;
    var dx = pointX(ev) - touchStartX;
    var dy = pointY(ev) - touchStartY;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
      swiped = true;
      if (dx < 0) {
        goNext();
      } else {
        goPrev();
      }
      if (ev.preventDefault) {
        ev.preventDefault();
      }
    }
  }

  function bindSide(el, action) {
    if (!el) {
      return;
    }
    el.addEventListener("click", function (ev) {
      if (swiped) {
        swiped = false;
        return;
      }
      if (ev.preventDefault) {
        ev.preventDefault();
      }
      action();
    }, false);
    el.addEventListener("touchend", function (ev) {
      if (swiped) {
        return;
      }
      if (ev.preventDefault) {
        ev.preventDefault();
      }
      action();
    }, false);
  }

  applyHubZoom();
  tickClock();
  setInterval(tickClock, 10000);
  renderWeather({ ok: false, place: "Camarillo" });
  loadState(true);
  loadWeather();
  pollTimer = setInterval(function () {
    loadState(false);
  }, 15000);
  setInterval(loadWeather, 10 * 60 * 1000);

  bindSide(document.getElementById("tap-prev"), goPrev);
  bindSide(document.getElementById("tap-next"), goNext);
  stage.addEventListener("touchstart", onTouchStart, false);
  stage.addEventListener("touchmove", onTouchMove, false);
  stage.addEventListener("touchend", onTouchEnd, false);
})();
