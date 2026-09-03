#!/bin/sh
# Auf der NAS ausführen (SSH oder DSM-Aufgabenplanung als root).
# Schiebt die Handy-Seite in den laufenden Container — ohne Stopp, ohne Build.
set -e
ROOT="${1:-/volume1/docker/family-hub}"
NAME="${2:-}"

if [ ! -f "$ROOT/static/admin.html" ]; then
  echo "FEHLER: $ROOT/static/admin.html fehlt."
  echo "Zip nach $ROOT entpacken. In File Station muss der Ordner static liegen."
  exit 1
fi

if ! grep -q "Jetzt Postfach prüfen" "$ROOT/static/admin.html"; then
  echo "FEHLER: Das Zip auf der NAS ist zu alt. Neu herunterladen und entpacken."
  exit 1
fi
if ! grep -q "Fotos in BestGrok öffnen" "$ROOT/static/admin.html"; then
  echo "FEHLER: BestGrok-Knopf fehlt in den NAS-Dateien. Zip neu entpacken."
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

echo "Kopiere static nach Container: $NAME"
sudo docker cp "$ROOT/static/." "$NAME:/app/static/"

echo "Im Container steht jetzt:"
sudo docker exec "$NAME" grep -F "Jetzt Postfach prüfen" /app/static/admin.html
sudo docker exec "$NAME" grep -F "Fotos in BestGrok öffnen" /app/static/admin.html
sudo docker exec "$NAME" cat /app/static/version.txt
echo "Handy in Safari neu öffnen (nicht das Homescreen-Icon):"
echo "  http://192.168.1.20:8755/?v=14"
echo "Oben muss stehen: Version 14 · Postfach + BestGrok"
