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
  var newsPage = 0;
  var lastPopupAt = 0;
  var pollTimer = null;

  var photoA = document.getElementById("photo-a");
  var photoB = document.getElementById("photo-b");
  var empty = document.getElementById("empty");
  var clockEl = document.getElementById("clock");
  var dateEl = document.getElementById("date");
  var noteEl = document.getElementById("note");
  var noteAuthor = document.getElementById("note-author");
  var noteText = document.getElementById("note-text");
  var pausedEl = document.getElementById("paused");
  var newsEl = document.getElementById("newsletter");
  var newsTitle = document.getElementById("news-title");
  var newsImg = document.getElementById("news-page");
  var newsCount = document.getElementById("news-count");

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
    for (i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
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
    incoming.onload = function () {
      incoming.className = "show";
      outgoing.className = "";
      showA = !showA;
    };
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

  function newsPages() {
    if (!state || !state.newsletter || !state.newsletter.pages) {
      return [];
    }
    return state.newsletter.pages;
  }

  function renderNewsPage() {
    var pages = newsPages();
    if (!pages.length) {
      return;
    }
    if (newsPage < 0) {
      newsPage = 0;
    }
    if (newsPage >= pages.length) {
      newsPage = pages.length - 1;
    }
    newsTitle.textContent = state.newsletter.title || "Schulnewsletter";
    newsImg.src = "/media/newsletter/" + pages[newsPage] + "?t=" + encodeURIComponent(state.newsletter.id);
    newsCount.textContent = (newsPage + 1) + " / " + pages.length;
  }

  function sameDay(iso) {
    if (!iso) {
      return false;
    }
    var then = new Date(iso);
    var now = new Date();
    return then.getFullYear() === now.getFullYear() &&
      then.getMonth() === now.getMonth() &&
      then.getDate() === now.getDate();
  }

  function shouldPopup() {
    if (!state || !state.newsletter || !state.newsletter.pages || !state.newsletter.pages.length) {
      return false;
    }
    var settings = state.settings || {};
    var mode = settings.popup_mode || "start_and_interval";
    if (mode === "off") {
      return false;
    }
    if (mode === "always") {
      return true;
    }
    if (mode === "once_per_day") {
      return !sameDay(state.newsletter_dismissed_at);
    }
    if (lastPopupAt === 0) {
      return true;
    }
    var minutes = settings.popup_minutes || 30;
    return (Date.now() - lastPopupAt) >= minutes * 60 * 1000;
  }

  function openNewsletter() {
    if (!newsPages().length) {
      return;
    }
    newsPage = 0;
    renderNewsPage();
    newsEl.className = "";
    newsEl.setAttribute("aria-hidden", "false");
    lastPopupAt = Date.now();
    setPaused(true);
  }

  function closeNewsletter() {
    newsEl.className = "hidden";
    newsEl.setAttribute("aria-hidden", "true");
    setPaused(false);
    fetch("/api/newsletter/dismiss", { method: "POST" }).catch(function () {});
  }

  function maybePopup(force) {
    if (newsEl.className.indexOf("hidden") === -1) {
      return;
    }
    if (force || shouldPopup()) {
      openNewsletter();
    }
  }

  function applyState(next, isFirst) {
    var oldNewsId = state && state.newsletter ? state.newsletter.id : null;
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
    var newNewsId = state.newsletter ? state.newsletter.id : null;
    if (isFirst || (newNewsId && newNewsId !== oldNewsId)) {
      lastPopupAt = 0;
      maybePopup(true);
    }
  }

  function loadState(isFirst) {
    fetch("/api/state")
      .then(function (res) { return res.json(); })
      .then(function (data) { applyState(data, isFirst); })
      .catch(function () {});
  }

  function onTap(ev) {
    if (newsEl.className.indexOf("hidden") === -1) {
      return;
    }
    var now = Date.now();
    if (onTap._last && now - onTap._last < 350) {
      return;
    }
    onTap._last = now;
    var x = 0;
    if (ev.changedTouches && ev.changedTouches[0]) {
      x = ev.changedTouches[0].clientX;
    } else {
      x = ev.clientX;
    }
    var stage = document.getElementById("stage");
    var rect = stage.getBoundingClientRect();
    var rel = x - rect.left;
    var w = rect.width || 1;
    if (rel < w * 0.24) {
      prevPhoto();
      schedule();
    } else if (rel > w * 0.76) {
      nextPhoto();
      schedule();
    } else {
      setPaused(!paused);
    }
  }

  applyHubZoom();
  tickClock();
  setInterval(tickClock, 10000);
  loadState(true);
  pollTimer = setInterval(function () {
    loadState(false);
    maybePopup(false);
  }, 15000);

  document.getElementById("stage").addEventListener("click", onTap);
  document.getElementById("stage").addEventListener("touchend", onTap);
  document.getElementById("news-close").addEventListener("click", function (ev) {
    ev.stopPropagation();
    closeNewsletter();
  });
  document.getElementById("news-prev").addEventListener("click", function (ev) {
    ev.stopPropagation();
    newsPage -= 1;
    renderNewsPage();
  });
  document.getElementById("news-next").addEventListener("click", function (ev) {
    ev.stopPropagation();
    newsPage += 1;
    renderNewsPage();
  });
})();
