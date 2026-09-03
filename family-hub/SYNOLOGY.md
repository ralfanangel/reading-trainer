# Synology: Kühlschrank-Wand starten

Klick-Anleitung für DSM (deutsch). Ziel: der Dienst läuft auf der NAS, der Mac darf aus sein.

Danach am Kühlschrank:

`http://emobilist.local:8755/fridge?hub=1`

Am Handy:

`http://emobilist.local:8755/`

Steht File Station unter **volume2** statt volume1, in der Compose-Datei `volume1` durch `volume2` ersetzen.

## 1. Container Manager installieren

1. DSM öffnen (`http://emobilist.local:5000` oder `:5001` für HTTPS).
2. **Paket-Zentrum** öffnen.
3. Nach `Container Manager` suchen (nicht das alte Paket „Docker“ mit Wal).
4. **Installieren**.
5. Wenn nach einem Ordner gefragt wird: **docker** wählen bzw. anlegen.

Erscheint Container Manager nicht im Paket-Zentrum, kann dieses NAS-Modell keine Container — dann hier stoppen.

## 2. Ordner anlegen

1. **Datei-Station** öffnen.
2. Den Freigabeordner **docker** öffnen. Fehlt er: **Systemsteuerung → Freigegebener Ordner → Erstellen**, Name `docker`.
3. In `docker` einen Ordner **family-hub** erstellen.
4. In `family-hub` einen Ordner **data** erstellen.

Pfad danach: `/volume1/docker/family-hub/` (Volume-Nummer in Datei-Station unter Eigenschaften prüfen).

## 3. Dateien hochladen

In `/volume1/docker/family-hub/` müssen liegen:

- `Dockerfile`
- `requirements.txt`
- `server.py`
- `mail_inbox.py`
- `weather.py`
- Ordner `static/` (komplett, mit `css/`, `js/`, `admin.html`, `fridge.html`)

Diese Dateien stehen im GitHub-Repo im Ordner `family-hub/`.

Vom Mac: Datei-Station → `docker` → `family-hub` → **Hochladen**, oder Finder: Gehe zu → Server verbinden → `smb://emobilist.local/docker` und die Dateien dorthin kopieren.

Nicht hochladen: `.venv`, `tests`, `__pycache__`.

## 4. Projekt bauen

1. **Container Manager** öffnen.
2. Links **Projekt**.
3. **Erstellen**.
4. Projektname: `family-hub`
5. Pfad: `/volume1/docker/family-hub` (genau dieser Ordner, in dem `Dockerfile` liegt).
6. Quelle: **docker-compose.yml erstellen** (Editor).
7. Diesen Text **vollständig** einfügen (alten Inhalt ersetzen):

```yaml
services:
  family-hub:
    container_name: family-hub
    build: .
    ports:
      - "8755:8755"
    volumes:
      - /volume1/docker/family-hub/data:/data
    environment:
      FAMILY_HUB_DATA: /data
      FAMILY_HUB_HOST: 0.0.0.0
      FAMILY_HUB_PORT: "8755"
      FAMILY_HUB_PUBLIC_HOST: emobilist.local
      TZ: Europe/Berlin
    restart: unless-stopped
```

8. **Web-Portal über Web Station einrichten**: Haken **raus**.
9. **Weiter**.
10. Haken **Projekt nach der Erstellung starten** setzen.
11. **Fertig**.

Erstes Bauen dauert ein paar Minuten (Image `python:3.12-slim` wird geladen). Am Ende muss stehen: **Exit Code: 0**.

## 5. Prüfen

1. Container Manager → **Container**: `family-hub` mit Status **Wird ausgeführt**.
2. Am Handy (WLAN, nicht LTE): **http://emobilist.local:8755/**
3. Die Seite „Kühlschrank-Wand“ muss laden.

Lädt sie nicht:

- **Systemsteuerung → Info-Center**: LAN-IP notieren, dann `http://<LAN-IP>:8755/` versuchen.
- **Systemsteuerung → Sicherheit → Firewall**: wenn aktiv, Port **8755** für LAN erlauben.
- Container-Logs: Container → `family-hub` → **Protokoll**.

## 6. Kühlschrank

1. Family Hub: **Apps → Internet**
2. Adresse: `http://emobilist.local:8755/fridge?hub=1`
3. Plus neben der Adresszeile → App-Icon oder Karte auf den Homescreen.

Wenn die Seite nicht lädt: dieselbe URL mit der LAN-IP aus dem Info-Center statt `emobilist.local`.

## 7. Peachjar-Mails (IMAP)

In der Compose-Datei (Projekt → Bearbeiten) diese Zeilen setzen, Werte eintragen, dann Build:

```yaml
      FAMILY_HUB_IMAP_HOST: imap.gmail.com
      FAMILY_HUB_IMAP_PORT: "993"
      FAMILY_HUB_IMAP_USER: deine@gmail.com
      FAMILY_HUB_IMAP_PASSWORD: "app-passwort"
```

Gmail: 2-Faktor an, dann App-Passwort. Absender `school@peachjar.com` ist schon eingetragen; weitere Adressen auf der Handy-Seite ganz oben unter **Postfach prüfen**. Der rote Knopf **Jetzt Postfach prüfen** sitzt direkt unter der Überschrift — nicht weiter unten bei den Fotos.

Am Kühlschrank steht das Wetter von **Camarillo** oben rechts über den Fotos (US-Wetterdienst, °F). Dafür braucht die NAS Internetzugang; ein Extra-Konto ist nicht nötig.

Nach dem Kopieren neuer Dateien: Container Manager → Projekt `family-hub` → **Stoppen** → **Erstellen** (Build), danach am Handy die Seite hart neu laden (Adresse neu eingeben oder Cache leeren). Am Kühlschrank die Internet-Seite ebenfalls neu laden.

## 8. Container stoppt nicht

Nicht das Projekt in der Endlosschleife lassen — den Container selbst hart beenden.

**In der Oberfläche**

1. Container Manager links **Container** (nicht Projekt).
2. Haken bei `family-hub`.
3. Oben **Aktion → Anhalten**.
4. Bleibt der Status auf „Wird angehalten“: **Aktion → Beenden** (manchmal **Kill** / **Forcieren**).

**Wenn die Oberfläche hängt: SSH**

1. DSM → **Systemsteuerung → Terminal & SNMP → Terminal**: Haken **SSH-Dienst aktivieren**.
2. Am Mac im Terminal:

```bash
ssh shalimar@192.168.1.20
sudo docker kill family-hub
sudo docker ps
```

`family-hub` darf danach nicht mehr unter „Up“ stehen. SSH danach wieder ausmachen, wenn du ihn sonst nicht brauchst.

Dann Container Manager → Projekt `family-hub` → **Erstellen** (Build), nicht nochmal Stoppen.

