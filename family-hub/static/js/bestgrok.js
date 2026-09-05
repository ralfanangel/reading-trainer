(function () {
  "use strict";

  var statusEl = document.getElementById("lib-status");
  var grid = document.getElementById("photo-grid");

  fetch("/api/info").then(function (res) { return res.json(); }).then(function (info) {
    return fetch("/api/state").then(function (res) { return res.json(); }).then(function (state) {
      var photos = state.photos || [];
      var lib = [];
      var i;
      for (i = 0; i < photos.length; i++) {
        if (photos[i].library) {
          lib.push(photos[i]);
        }
      }
      if (!info.library_ok) {
        statusEl.textContent = "Der Ordner BestGrok ist im Container nicht eingehängt. In der Compose-Datei braucht es die Zeile /volume1/photo/bestgrok:/library:ro, danach einmal Erstellen. Bis dahin: am Mac Finder → Server verbinden → smb://192.168.1.20/photo/BestGrok";
        return;
      }
      if (!lib.length) {
        statusEl.textContent = "Ordner ist da, aber keine Bilder gefunden (JPG/PNG).";
        return;
      }
      statusEl.textContent = lib.length + " Foto(s) aus BestGrok.";
      for (i = 0; i < lib.length; i++) {
        var wrap = document.createElement("div");
        wrap.className = "thumb";
        var img = document.createElement("img");
        img.src = "/media/photos/" + lib[i].id;
        img.alt = lib[i].filename || "";
        wrap.appendChild(img);
        grid.appendChild(wrap);
      }
    });
  }).catch(function (err) {
    statusEl.textContent = err.message || "Laden fehlgeschlagen. Script auf der NAS muss den Python-Server neu starten.";
  });
})();
