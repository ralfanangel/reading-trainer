#!/bin/sh
# Einziger NAS-Schritt: Python + Handy-Seite in den laufenden Container,
# dann Kill/Start (kein Image-Build). Als root ausführen.
set -e
ROOT="${1:-/volume1/docker/family-hub}"
NAME="${2:-}"

need() {
  if [ ! -f "$ROOT/$1" ]; then
    echo "FEHLER: $ROOT/$1 fehlt. Zip nach $ROOT entpacken."
    exit 1
  fi
}

need static/admin.html
need server.py
need mail_inbox.py
need weather.py

if ! grep -q "Jetzt Postfach prüfen" "$ROOT/static/admin.html"; then
  echo "FEHLER: Zip auf der NAS ist zu alt."
  exit 1
fi
if ! grep -q 'href="/bestgrok"' "$ROOT/static/admin.html"; then
  echo "FEHLER: BestGrok-Browserseite fehlt im Zip. Neu herunterladen."
  exit 1
fi

if [ -z "$NAME" ]; then
  NAME=$(sudo docker ps --format '{{.Names}}' | grep -i family-hub | head -n 1 || true)
fi
if [ -z "$NAME" ]; then
  echo "FEHLER: Kein laufender Container mit family-hub im Namen."
  sudo docker ps
  exit 1
fi

echo "Container: $NAME"
echo "Kopiere Python …"
sudo docker cp "$ROOT/server.py" "$NAME:/app/server.py"
sudo docker cp "$ROOT/mail_inbox.py" "$NAME:/app/mail_inbox.py"
sudo docker cp "$ROOT/weather.py" "$NAME:/app/weather.py"

echo "Kopiere static …"
if ! sudo docker cp "$ROOT/static/." "$NAME:/app/static/" 2>/tmp/family-hub-cp-static.err; then
  echo "Hinweis: /app/static ist vermutlich ein Volume (read-only). File Station reicht für HTML."
  cat /tmp/family-hub-cp-static.err 2>/dev/null || true
fi

echo "Python neu starten (kill + start, kein Build) …"
sudo docker kill "$NAME" >/dev/null
sudo docker start "$NAME" >/dev/null

i=0
ver=""
while [ "$i" -lt 25 ]; do
  ver=$(sudo docker exec "$NAME" python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8755/static/version.txt').read().decode().strip())" 2>/dev/null || true)
  if [ "$ver" = "16" ]; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

echo "version.txt im Container: ${ver:-unbekannt}"
sudo docker exec "$NAME" python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8755/api/info').read().decode())" || true
echo
echo "Fertig. Handy (Safari, nicht Homescreen-Icon):"
echo "  http://192.168.1.20:8755/?v=16"
echo "BestGrok-Fotos:"
echo "  http://192.168.1.20:8755/bestgrok"
echo "Oben muss stehen: Version 16. HTML und Server beide 16."
