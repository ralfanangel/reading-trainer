# Holzlabyrinth

Entspanntes 3D-Holzlabyrinth fürs iPhone. Die Kugel navigierst du mit dem Gyroskop über ein warmes Holzbrett — inspiriert von der Ruhe von Monument Valley, aber taktil und handwerklich statt unmöglich-architektonisch.

## Level 1 — Der erste Pfad

- Holzbretter-Labyrinth mit sanften Wänden
- Ziel-Loch am Ende
- 3 Leben; fällt die Kugel vom Brett, verlierst du eines
- Authentisches Rollgeräusch (Web Audio)
- Gyroskop auf dem iPhone; Desktop: Ziehen oder Pfeiltasten

## Lokal starten

```bash
cd wooden-labyrinth
python3 -m http.server 8765
```

Dann im Browser öffnen: `http://localhost:8765`

Auf dem iPhone am besten über HTTPS oder als zum Home-Bildschirm hinzugefügte PWA — Safari verlangt eine Nutzeraktion für die Gyroskop-Berechtigung (Button „Beginnen“).
