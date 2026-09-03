(function () {
  "use strict";

  var photoStatus = document.getElementById("photo-status");
  var newsStatus = document.getElementById("news-status");

  function api(path, options) {
    options = options || {};
    return fetch(path, options).then(function (res) {
      return res.text().then(function (text) {
        var body = {};
        try {
          body = text ? JSON.parse(text) : {};
        } catch (err) {
          if (res.status === 413) {
            throw new Error("Datei zu groß. Ein Foto nach dem anderen als JPG.");
          }
          throw new Error("Upload fehlgeschlagen (Status " + res.status + "). Seite neu laden und Foto als JPG versuchen.");
        }
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
    var ver = document.getElementById("app-version");
    if (ver && info.version) {
      var htmlVer = ver.getAttribute("data-html-version") || "";
      if (htmlVer && htmlVer !== String(info.version)) {
        ver.textContent = "HTML " + htmlVer + " · Server " + info.version + " — Dateien und Container passen nicht";
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

  function isProbablyImage(file) {
    var type = (file.type || "").toLowerCase();
    var name = (file.name || "").toLowerCase();
    if (name === ".ds_store" || name === "thumbs.db") {
      return false;
    }
    if (type.indexOf("image/") === 0) {
      return true;
    }
    if (/\.(jpe?g|png|gif|webp|bmp|heic|heif|tiff?)$/.test(name)) {
      return true;
    }
    if (!type && name && name.indexOf(".") === -1) {
      return true;
    }
    return false;
  }

  function convertImageFile(file, callback) {
    if (typeof URL === "undefined" || !URL.createObjectURL) {
      callback(file, file.name || "foto.jpg");
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if (!w || !h || !document.createElement("canvas").getContext) {
        URL.revokeObjectURL(url);
        callback(file, file.name || "foto.jpg");
        return;
      }
      var maxEdge = 1920;
      var scale = 1;
      if (Math.max(w, h) > maxEdge) {
        scale = maxEdge / Math.max(w, h);
      }
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      if (!canvas.toBlob) {
        callback(file, file.name || "foto.jpg");
        return;
      }
      canvas.toBlob(function (blob) {
        callback(blob || file, "foto.jpg");
      }, "image/jpeg", 0.85);
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
      if (isProbablyImage(fileList[i])) {
        files.push(fileList[i]);
      }
    }
    if (!files.length) {
      photoStatus.textContent = "Keine Bilddatei erkannt. Vom Mac als JPG oder PNG sichern und nochmal ziehen.";
      return;
    }
    photoStatus.textContent = "Lade hoch …";
    var added = 0;
    var idx = 0;
    var lastState = null;
    function finish(err) {
      if (inputEl) {
        inputEl.value = "";
      }
      if (err) {
        photoStatus.textContent = err.message || String(err);
        if (lastState) {
          render(lastState);
        }
        return;
      }
      photoStatus.textContent = added + " Foto(s) auf dem Kühlschrank.";
      if (lastState) {
        render(lastState);
      }
    }
    function next() {
      if (idx >= files.length) {
        finish(null);
        return;
      }
      convertImageFile(files[idx], function (blob, filename) {
        var data = new FormData();
        data.append("photos", blob, filename || ("foto-" + (idx + 1) + ".jpg"));
        api("/api/photos", { method: "POST", body: data }).then(function (body) {
          added += (body.added && body.added.length) ? body.added.length : 1;
          lastState = body.state || lastState;
          idx += 1;
          photoStatus.textContent = "Lade hoch … " + idx + "/" + files.length;
          next();
        }).catch(finish);
      });
    }
    next();
  }

  var SMB_URL = "smb://shalimar._smb._tcp.local/photo/BestGrok";
  var smbStatus = document.getElementById("smb-status");

  function copySmbPath(doneMsg) {
    function show(msg) {
      if (smbStatus) {
        smbStatus.textContent = msg;
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(SMB_URL).then(function () {
        show(doneMsg);
      }).catch(function () {
        show(SMB_URL);
      });
    } else {
      show(SMB_URL);
    }
  }

  var smbOpen = document.getElementById("smb-open");
  if (smbOpen) {
    smbOpen.addEventListener("click", function () {
      copySmbPath("Pfad kopiert. Safari öffnet Finder, Chrome oft nicht.");
    });
  }
  var smbCopy = document.getElementById("smb-copy");
  if (smbCopy) {
    smbCopy.addEventListener("click", function () {
      copySmbPath("Kopiert. Finder: Gehe zu → Server verbinden, dann einfügen.");
    });
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
  drop.addEventListener("dragenter", function (ev) {
    ev.preventDefault();
  });
  drop.addEventListener("dragover", function (ev) {
    ev.preventDefault();
  });
  drop.addEventListener("drop", function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) {
      uploadPhotoFiles(ev.dataTransfer.files, document.getElementById("photo-input"));
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
