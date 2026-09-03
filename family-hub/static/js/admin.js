(function () {
  "use strict";

  var photoStatus = document.getElementById("photo-status");
  var newsStatus = document.getElementById("news-status");

  function api(path, options) {
    options = options || {};
    return fetch(path, options).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) {
          throw new Error(body.error || "Fehler");
        }
        return body;
      });
    });
  }

  function fridgeUrl() {
    return window.location.origin + "/fridge?hub=1";
  }

  api("/api/info").then(function (info) {
    if (info.fridge_url) {
      document.getElementById("fridge-url").textContent = info.fridge_url;
    }
    if (info.admin_url) {
      var adminEl = document.getElementById("admin-url");
      if (adminEl) {
        adminEl.textContent = info.admin_url;
      }
    }
  }).catch(function () {
    document.getElementById("fridge-url").textContent = fridgeUrl();
  });

  function render(state) {
    var grid = document.getElementById("photo-grid");
    grid.innerHTML = "";
    (state.photos || []).forEach(function (photo) {
      var wrap = document.createElement("div");
      wrap.className = "thumb";
      var img = document.createElement("img");
      img.src = "/media/photos/" + photo.id;
      img.alt = "";
      var del = document.createElement("button");
      del.type = "button";
      del.textContent = "×";
      del.addEventListener("click", function () {
        api("/api/photos/" + photo.id, { method: "DELETE" }).then(function (body) {
          render(body.state);
        }).catch(function (err) {
          photoStatus.textContent = err.message;
        });
      });
      wrap.appendChild(img);
      wrap.appendChild(del);
      grid.appendChild(wrap);
    });

    var list = document.getElementById("note-list");
    list.innerHTML = "";
    (state.messages || []).forEach(function (msg) {
      var li = document.createElement("li");
      var text = document.createElement("span");
      text.textContent = (msg.author ? msg.author + ": " : "") + msg.text;
      var del = document.createElement("button");
      del.type = "button";
      del.textContent = "Weg";
      del.addEventListener("click", function () {
        api("/api/messages/" + msg.id, { method: "DELETE" }).then(function (body) {
          render(body.state);
        });
      });
      li.appendChild(text);
      li.appendChild(del);
      list.appendChild(li);
    });

    var preview = document.getElementById("news-preview");
    preview.innerHTML = "";
    if (state.newsletter && state.newsletter.pages && state.newsletter.pages.length) {
      var title = document.createElement("p");
      title.textContent = state.newsletter.title + " · " + state.newsletter.pages.length + " Seite(n)";
      preview.appendChild(title);
      var img = document.createElement("img");
      img.src = "/media/newsletter/" + state.newsletter.pages[0] + "?t=" + encodeURIComponent(state.newsletter.id);
      img.alt = "Newsletter-Vorschau";
      preview.appendChild(img);
    }

    var settings = state.settings || {};
    document.getElementById("photo-seconds").value = settings.photo_seconds || 12;
    document.getElementById("popup-mode").value = settings.popup_mode || "start_and_interval";
    document.getElementById("popup-minutes").value = settings.popup_minutes || 30;
    document.getElementById("family-name").value = settings.family_name || "";
  }

  function load() {
    api("/api/state").then(render).catch(function (err) {
      photoStatus.textContent = err.message;
    });
  }

  document.getElementById("photo-input").addEventListener("change", function (ev) {
    var files = ev.target.files;
    if (!files || !files.length) {
      return;
    }
    var data = new FormData();
    var i;
    for (i = 0; i < files.length; i++) {
      data.append("photos", files[i]);
    }
    photoStatus.textContent = "Lade hoch …";
    api("/api/photos", { method: "POST", body: data }).then(function (body) {
      photoStatus.textContent = body.added.length + " Foto(s) auf dem Kühlschrank.";
      render(body.state);
      ev.target.value = "";
    }).catch(function (err) {
      photoStatus.textContent = err.message;
    });
  });

  var drop = document.getElementById("photo-drop");
  drop.addEventListener("dragover", function (ev) {
    ev.preventDefault();
  });
  drop.addEventListener("drop", function (ev) {
    ev.preventDefault();
    var input = document.getElementById("photo-input");
    if (ev.dataTransfer && ev.dataTransfer.files) {
      input.files = ev.dataTransfer.files;
      var change = document.createEvent("HTMLEvents");
      change.initEvent("change", true, false);
      input.dispatchEvent(change);
    }
  });

  document.getElementById("note-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    api("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author: document.getElementById("note-author").value,
        text: document.getElementById("note-text").value
      })
    }).then(function (body) {
      document.getElementById("note-text").value = "";
      render(body.state);
    }).catch(function (err) {
      photoStatus.textContent = err.message;
    });
  });

  document.getElementById("news-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var files = document.getElementById("news-files").files;
    if (!files || !files.length) {
      newsStatus.textContent = "Bitte PDF oder Fotos wählen.";
      return;
    }
    var data = new FormData();
    data.append("title", document.getElementById("news-title").value);
    var i;
    for (i = 0; i < files.length; i++) {
      data.append("files", files[i]);
    }
    newsStatus.textContent = "Lade Newsletter …";
    api("/api/newsletter", { method: "POST", body: data }).then(function (body) {
      newsStatus.textContent = "Newsletter sitzt auf dem Kühlschrank.";
      document.getElementById("news-files").value = "";
      render(body.state);
    }).catch(function (err) {
      newsStatus.textContent = err.message;
    });
  });

  document.getElementById("news-clear").addEventListener("click", function () {
    api("/api/newsletter", { method: "DELETE" }).then(function (body) {
      newsStatus.textContent = "Newsletter entfernt.";
      render(body.state);
    });
  });

  document.getElementById("settings-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    api("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photo_seconds: Number(document.getElementById("photo-seconds").value),
        popup_mode: document.getElementById("popup-mode").value,
        popup_minutes: Number(document.getElementById("popup-minutes").value),
        family_name: document.getElementById("family-name").value
      })
    }).then(function (body) {
      render(body.state);
    }).catch(function (err) {
      photoStatus.textContent = err.message;
    });
  });

  load();
})();
