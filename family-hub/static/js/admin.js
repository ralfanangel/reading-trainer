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
    var photos = state.photos || [];
    var libCount = 0;
    var libShown = 0;
    photos.forEach(function (photo) {
      if (photo.library) {
        libCount += 1;
      }
    });
    if (libCount) {
      photoStatus.textContent = libCount + " Fotos aus bestgrok, zufällige Reihenfolge am Kühlschrank.";
    }
    photos.forEach(function (photo) {
      if (photo.library) {
        if (libShown >= 6) {
          return;
        }
        libShown += 1;
      }
      var wrap = document.createElement("div");
      wrap.className = "thumb";
      var img = document.createElement("img");
      img.src = "/media/photos/" + photo.id;
      img.alt = "";
      wrap.appendChild(img);
      if (!photo.library) {
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
        wrap.appendChild(del);
      }
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

    var senders = settings.newsletter_senders || [];
    var senderList = document.getElementById("sender-list");
    if (!senderList) {
      return;
    }
    senderList.innerHTML = "";
    senders.forEach(function (addr) {
      var li = document.createElement("li");
      var text = document.createElement("span");
      text.textContent = addr;
      var del = document.createElement("button");
      del.type = "button";
      del.textContent = "Weg";
      del.addEventListener("click", function () {
        api("/api/senders", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: addr })
        }).then(function (body) {
          render(body.state);
        });
      });
      li.appendChild(text);
      li.appendChild(del);
      senderList.appendChild(li);
    });
  }

  function load() {
    api("/api/state").then(render).catch(function (err) {
      photoStatus.textContent = err.message;
    });
  }

  function needsJpegConvert(file) {
    var type = (file.type || "").toLowerCase();
    var name = (file.name || "").toLowerCase();
    if (type === "image/heic" || type === "image/heif") {
      return true;
    }
    if (name.indexOf(".heic") !== -1 || name.indexOf(".heif") !== -1) {
      return true;
    }
    if (!type && name.indexOf(".") === -1) {
      return true;
    }
    return false;
  }

  function convertImageFile(file, callback) {
    if (!needsJpegConvert(file) || typeof URL === "undefined" || !URL.createObjectURL) {
      callback(file, file.name || "foto.jpg");
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement("canvas");
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (!w || !h || !canvas.getContext) {
        URL.revokeObjectURL(url);
        callback(file, file.name || "foto.jpg");
        return;
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      if (!canvas.toBlob) {
        callback(file, file.name || "foto.jpg");
        return;
      }
      canvas.toBlob(function (blob) {
        callback(blob || file, "foto.jpg");
      }, "image/jpeg", 0.88);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      callback(file, file.name || "foto.jpg");
    };
    img.src = url;
  }

  function uploadPhotoFiles(fileList, inputEl) {
    var files = [];
    var i;
    if (!fileList || !fileList.length) {
      return;
    }
    for (i = 0; i < fileList.length; i++) {
      files.push(fileList[i]);
    }
    photoStatus.textContent = "Lade hoch …";
    var converted = [];
    var names = [];
    var idx = 0;
    function send() {
      var data = new FormData();
      var j;
      for (j = 0; j < converted.length; j++) {
        data.append("photos", converted[j], names[j] || ("foto-" + (j + 1) + ".jpg"));
      }
      api("/api/photos", { method: "POST", body: data }).then(function (body) {
        photoStatus.textContent = body.added.length + " Foto(s) auf dem Kühlschrank.";
        render(body.state);
        if (inputEl) {
          inputEl.value = "";
        }
      }).catch(function (err) {
        photoStatus.textContent = err.message;
      });
    }
    function next() {
      if (idx >= files.length) {
        send();
        return;
      }
      convertImageFile(files[idx], function (blob, filename) {
        converted.push(blob);
        names.push(filename);
        idx += 1;
        next();
      });
    }
    next();
  }

  document.getElementById("photo-input").addEventListener("change", function (ev) {
    uploadPhotoFiles(ev.target.files, ev.target);
  });

  var photoForm = document.getElementById("photo-form");
  if (photoForm) {
    photoForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
    });
  }

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

  document.getElementById("sender-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    api("/api/senders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: document.getElementById("sender-email").value })
    }).then(function (body) {
      document.getElementById("sender-email").value = "";
      document.getElementById("sender-status").textContent = "Adresse gespeichert.";
      render(body.state);
    }).catch(function (err) {
      document.getElementById("sender-status").textContent = err.message;
    });
  });

  var mailPoll = document.getElementById("mail-poll");
  if (mailPoll) {
    mailPoll.addEventListener("click", function () {
      document.getElementById("sender-status").textContent = "Prüfe Postfach …";
      api("/api/mail/poll", { method: "POST" }).then(function (body) {
        if (body.reason === "imap_not_configured") {
          document.getElementById("sender-status").textContent = "IMAP ist noch nicht eingerichtet (in der Synology-Compose Host, User, Passwort setzen).";
        } else {
          document.getElementById("sender-status").textContent = (body.imported || 0) + " neue(r) Newsletter.";
        }
        if (body.state) {
          render(body.state);
        }
      }).catch(function (err) {
        document.getElementById("sender-status").textContent = err.message;
      });
    });
  }

  load();
})();
