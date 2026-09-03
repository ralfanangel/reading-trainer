#!/bin/sh
# Auf der NAS ausführen. Kopiert die Handy-Seite in den laufenden Container,
# ohne ihn zu stoppen oder neu zu bauen.
set -e
ROOT="${1:-/volume1/docker/family-hub}"
NAME="${2:-family-hub}"

if [ ! -f "$ROOT/static/admin.html" ]; then
  echo "static/admin.html fehlt in $ROOT — zuerst das Zip dorthin entpacken."
  exit 1
fi

sudo docker cp "$ROOT/static/." "$NAME:/app/static/"
echo "Fertig. Am Handy öffnen:"
echo "  http://192.168.1.20:8755/?v=11"
echo "Oben muss stehen: Version 11"
