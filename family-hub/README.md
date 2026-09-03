# Family Hub Display

Lokale Kühlschrank-Wand für den **Samsung Bespoke AI Family Hub** (Modell `RS27T5561SR`, 21,5" 1080×1920, Tizen 4).

Samsung lässt keine eigenen Apps auf dem Family Hub zu. Es gibt auch keine öffentliche API, um Fotos oder Nachrichten auf das Display zu schieben. Der eingebaute **Internet-Browser** kann aber eine Seite im Heimnetz öffnen und als Icon auf den Homescreen legen. Genau das macht diese App.

## Was sie zeigt

- Fotos in **zufälliger Reihenfolge** (kein direktes Wiederholen des letzten Bildes)
- **Wetter von Camarillo** oben rechts über den Fotos (aktuell, Hoch/Tief, °F)
- Familien-Nachrichten als Karte über den Fotos
- Schulnewsletter / Elternbrief als Popup (PDF oder Fotos), der beim Start und danach wieder aufgeht

Steuerung vom Handy, Anzeige am Kühlschrank.

## Adressen (Synology `emobilist`)

Nach dem Start im Container Manager:

- Kühlschrank: **http://emobilist.local:8755/fridge?hub=1**
- Handy (Fotos, Nachrichten, Newsletter): **http://emobilist.local:8755/**

Nicht `localhost`, nicht die Mac-IP, nicht `emobilist.synology.me` (das ist die öffentliche WAN-Adresse — Fotos nicht ins Internet legen).

Löst der Family-Hub-Browser `emobilist.local` nicht auf: DSM → Systemsteuerung → Info-Center → Netzwerk → LAN-IP, dann `http://<LAN-IP>:8755/fridge?hub=1`.

## Auf der Synology hosten

Klick für Klick in DSM: **`family-hub/SYNOLOGY.md`**.

Lokal zum Entwickeln weiterhin:

```bash
cd family-hub
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python server.py
```

## Am Family Hub anheften

1. Kühlschrank-Display: **Apps → Internet**
2. Adresse **http://emobilist.local:8755/fridge?hub=1** eingeben
3. Plus-Symbol neben der Adresszeile: **App-Icon** oder Webpage-Shortcut auf den Homescreen
4. Danach reicht ein Tipp auf das Icon

`?hub=1` setzt den Zoom auf 50 %. Der Family-Hub-Browser rechnet intern mit 200 %; ohne den Parameter wirkt alles zu groß.

Falls das Bild den Rand schneidet: `?hub=1&zoom=0.5` oder `zoom=0.45` ausprobieren.

Handy und Kühlschrank müssen im **selben WLAN** sein. Manche Router trennen 2,4-GHz- und 5-GHz-Geräte.

## Bedienung am Display

- Mitte tippen: Pause
- Linker Rand: vorheriges Foto
- Rechter Rand: nächstes Foto
- Newsletter schließen: „Fotos weiterlaufen lassen“ — je nach Einstellung kommt er später wieder

## Schulnewsletter

In der Handy-Steuerung PDF oder Fotos des Elternbriefs hochladen. Der Kühlschrank holt den Stand alle 15 Sekunden. Popup-Modi:

- Beim Start und regelmäßig (Standard, alle 30 Minuten)
- Einmal pro Tag
- Immer wieder sofort
- Aus

Es gibt keine Anbindung an IServ/WebUntis o. Ä. Den Brief einmal exportieren und hier ablegen reicht.

## Was der Kühlschrank selbst kann (ohne diese App)

- SmartThings: Fotos hochladen, in der Gallery **Play Slideshow** — Reihenfolge ist nicht zuverlässig zufällig, und Nachrichten/Newsletter gehen so nicht.
- USB-Stick an der Family-Hub-USB-Buchse: Fotos lokal, ebenfalls ohne Nachrichten.
- Google Photos, falls auf dem Gerät noch verfügbar: Alben, aber keine eigene Zufalls-App.

Deshalb die lokale Wand im Browser.
