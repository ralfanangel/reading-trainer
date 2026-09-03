"""Family Hub kitchen display: photos, notes, school newsletter."""

from __future__ import annotations

import hashlib
import io
import json
import os
import random
import shutil
import threading
import time
import uuid
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import (
    Flask,
    Response,
    jsonify,
    request,
    send_from_directory,
    send_file,
)
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

import mail_inbox
import weather

try:
    import pypdfium2 as pdfium
except ImportError:  # pragma: no cover
    pdfium = None

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
PIN = os.environ.get("FAMILY_HUB_PIN", "").strip()
APP_VERSION = "10"


class Paths:
    data = ROOT / "data"
    photos = data / "photos"
    news = data / "newsletter"
    state = data / "state.json"
    library: Path | None = None


SKIP_LIBRARY_DIRS = {"@eaDir", "#recycle", "@Recycle", ".Trash-1000", "#snapshot"}


def configure(
    data_dir: str | Path | None = None,
    pin: str | None = None,
    library_dir: str | Path | None = None,
) -> None:
    Paths.data = Path(data_dir or os.environ.get("FAMILY_HUB_DATA", ROOT / "data"))
    Paths.photos = Paths.data / "photos"
    Paths.news = Paths.data / "newsletter"
    Paths.state = Paths.data / "state.json"
    lib = library_dir if library_dir is not None else os.environ.get("FAMILY_HUB_LIBRARY", "").strip()
    Paths.library = Path(lib) if lib else None
    global PIN
    if pin is not None:
        PIN = pin
    else:
        PIN = os.environ.get("FAMILY_HUB_PIN", "").strip()

ALLOWED_IMAGE = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
ALLOWED_PDF = {".pdf"}
MAX_EDGE = 1920
FRIDGE_SIZE = (1080, 1920)
NEWSLETTER_WIDTH = 1080
NEWSLETTER_MAX_HEIGHT = 2400
PHOTO_QUALITY = 82

_lock = threading.RLock()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def ensure_dirs() -> None:
    Paths.photos.mkdir(parents=True, exist_ok=True)
    Paths.news.mkdir(parents=True, exist_ok=True)
    Paths.data.mkdir(parents=True, exist_ok=True)


def default_state() -> dict[str, Any]:
    return {
        "photos": [],
        "messages": [],
        "newsletter": None,
        "settings": {
            "photo_seconds": 12,
            "popup_mode": "start_and_interval",
            "popup_minutes": 30,
            "family_name": "Familie",
            "newsletter_senders": ["school@peachjar.com"],
        },
        "newsletter_dismissed": {},
        "mail_seen_ids": [],
    }


def load_state() -> dict[str, Any]:
    ensure_dirs()
    with _lock:
        if not Paths.state.exists():
            state = default_state()
            _write_state(state)
            return state
        try:
            raw = json.loads(Paths.state.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raw = {}
        base = default_state()
        base.update({k: raw[k] for k in base if k in raw})
        if isinstance(raw.get("settings"), dict):
            base["settings"].update(raw["settings"])
        if not base["settings"].get("newsletter_senders"):
            base["settings"]["newsletter_senders"] = ["school@peachjar.com"]
        if not isinstance(base.get("mail_seen_ids"), list):
            base["mail_seen_ids"] = []
        return base


def _write_state(state: dict[str, Any]) -> None:
    tmp = Paths.state.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(Paths.state)


def save_state(state: dict[str, Any]) -> None:
    ensure_dirs()
    with _lock:
        _write_state(state)


def scan_library() -> list[dict[str, Any]]:
    root = Paths.library
    if root is None or not root.exists() or not root.is_dir():
        return []
    items: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(part in SKIP_LIBRARY_DIRS for part in path.parts):
            continue
        if path.suffix.lower() not in ALLOWED_IMAGE:
            continue
        rel = path.relative_to(root).as_posix()
        photo_id = "lib-" + hashlib.sha1(rel.encode("utf-8")).hexdigest()[:12]
        try:
            mtime = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()
        except OSError:
            mtime = utc_now()
        items.append(
            {
                "id": photo_id,
                "filename": rel,
                "library": True,
                "created_at": mtime,
            }
        )
    return items


def library_file(rel: str) -> Path | None:
    root = Paths.library
    if root is None or not rel or rel.startswith("/") or ".." in Path(rel).parts:
        return None
    path = (root / rel).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError:
        return None
    if not path.is_file():
        return None
    return path


def combined_photos(state: dict[str, Any]) -> list[dict[str, Any]]:
    stored = list(state.get("photos") or [])
    library = scan_library()
    if library:
        stored = [p for p in stored if not p.get("sample")]
    return library + stored


def shuffled_ids(ids: list[str], last_id: str | None = None) -> list[str]:
    """Shuffle photo ids. Avoid starting with the last shown id when possible."""
    items = list(ids)
    random.shuffle(items)
    if last_id and len(items) > 1 and items[0] == last_id:
        items[0], items[1] = items[1], items[0]
    return items


def _font(size: int) -> ImageFont.ImageFont:
    for name in ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf"):
        path = Path("/usr/share/fonts/truetype/dejavu") / name
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def _paint_sample_photo(index: int, width: int = 1080, height: int = 1920) -> Image.Image:
    palettes = [
        ((28, 22, 48), (214, 122, 74), (255, 214, 154)),
        ((12, 42, 58), (46, 139, 132), (232, 221, 176)),
        ((48, 18, 28), (176, 72, 92), (244, 196, 164)),
        ((18, 32, 18), (92, 140, 72), (216, 228, 168)),
        ((24, 24, 40), (88, 92, 168), (188, 208, 232)),
        ((40, 24, 12), (168, 96, 48), (240, 200, 120)),
    ]
    top, mid, hi = palettes[index % len(palettes)]
    img = Image.new("RGB", (width, height), top)
    draw = ImageDraw.Draw(img)
    for y in range(height):
        t = y / max(height - 1, 1)
        if t < 0.55:
            u = t / 0.55
            r = int(top[0] + (mid[0] - top[0]) * u)
            g = int(top[1] + (mid[1] - top[1]) * u)
            b = int(top[2] + (mid[2] - top[2]) * u)
        else:
            u = (t - 0.55) / 0.45
            r = int(mid[0] + (hi[0] - mid[0]) * u)
            g = int(mid[1] + (hi[1] - mid[1]) * u)
            b = int(mid[2] + (hi[2] - mid[2]) * u)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    # Soft orbs so the slideshow is visibly different between photos.
    rng = random.Random(index + 7)
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for _ in range(6):
        cx, cy = rng.randint(0, width), rng.randint(0, height)
        rad = rng.randint(120, 420)
        col = (*hi, rng.randint(40, 90))
        od.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=col)
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    img = img.filter(ImageFilter.GaussianBlur(radius=8))
    img = ImageEnhance.Contrast(img).enhance(1.08)
    caption = ImageDraw.Draw(img)
    title = "Familienfoto %d" % (index + 1)
    font = _font(64)
    caption.text((64, height - 220), title, fill=(255, 255, 255), font=font)
    caption.text((64, height - 140), "Beispielbild", fill=(255, 255, 255), font=_font(36))
    return img


def seed_sample_photos(count: int = 6) -> list[dict[str, Any]]:
    ensure_dirs()
    photos = []
    for i in range(count):
        photo_id = "sample%02d" % (i + 1)
        path = Paths.photos / ("%s.jpg" % photo_id)
        if not path.exists():
            _paint_sample_photo(i).save(path, "JPEG", quality=PHOTO_QUALITY, optimize=True)
        photos.append(
            {
                "id": photo_id,
                "filename": path.name,
                "created_at": utc_now(),
                "sample": True,
            }
        )
    return photos


def _paint_sample_newsletter() -> Image.Image:
    width, height = 1080, 1520
    img = Image.new("RGB", (width, height), (247, 241, 227))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, width, 160], fill=(140, 28, 36))
    draw.text((64, 48), "Elternbrief", fill=(255, 255, 255), font=_font(56))
    draw.text((64, 200), "Grundschule Beispiel", fill=(40, 28, 24), font=_font(40))
    draw.text((64, 260), "KW 36  ·  Schulnewsletter", fill=(90, 70, 60), font=_font(28))
    body = [
        "Liebe Familien,",
        "",
        "am Freitag findet der Sporttag statt.",
        "Bitte Sportkleidung und ein Getränk",
        "mitgeben.",
        "",
        "Nächste Woche: Elternabend Klasse 2",
        "Dienstag, 18:30 Uhr in der Aula.",
        "",
        "Der Hort hat am Brückentag geschlossen.",
        "",
        "Herzliche Grüße",
        "Die Schulleitung",
    ]
    y = 360
    font = _font(34)
    for line in body:
        draw.text((64, y), line, fill=(40, 28, 24), font=font)
        y += 52
    draw.rectangle([48, height - 120, width - 48, height - 48], outline=(140, 28, 36), width=4)
    draw.text((72, height - 100), "Beispiel-Newsletter zum Testen", fill=(140, 28, 36), font=_font(28))
    return img


def seed_sample_newsletter() -> dict[str, Any]:
    ensure_dirs()
    page_name = "page-01.jpg"
    path = Paths.news / page_name
    _paint_sample_newsletter().save(path, "JPEG", quality=88, optimize=True)
    return {
        "id": "sample-news",
        "title": "Schulnewsletter (Beispiel)",
        "pages": [page_name],
        "created_at": utc_now(),
        "sample": True,
    }


def _open_rgb(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA"):
        background = Image.new("RGB", img.size, (12, 12, 14))
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")
    return img


def _jpeg_bytes_from(img: Image.Image) -> bytes:
    out = io.BytesIO()
    img.save(out, "JPEG", quality=PHOTO_QUALITY, optimize=True, progressive=True)
    return out.getvalue()


def fit_newsletter_page(img: Image.Image) -> Image.Image:
    """Scale a flyer/PDF page to fridge width so text stays readable. No crop."""
    if img.mode != "RGB":
        img = img.convert("RGB")
    width, height = img.size
    if width <= 0 or height <= 0:
        return img
    scale = NEWSLETTER_WIDTH / float(width)
    new_h = max(1, int(round(height * scale)))
    if new_h > NEWSLETTER_MAX_HEIGHT:
        scale = NEWSLETTER_MAX_HEIGHT / float(height)
        new_w = max(1, int(round(width * scale)))
        img = img.resize((new_w, NEWSLETTER_MAX_HEIGHT), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (NEWSLETTER_WIDTH, NEWSLETTER_MAX_HEIGHT), (255, 255, 255))
        canvas.paste(img, ((NEWSLETTER_WIDTH - new_w) // 2, 0))
        return canvas
    return img.resize((NEWSLETTER_WIDTH, new_h), Image.Resampling.LANCZOS)


def prepare_newsletter_image(data: bytes) -> bytes:
    return _jpeg_bytes_from(fit_newsletter_page(_open_rgb(data)))


def prepare_image(data: bytes, fill_fridge: bool = False) -> bytes:
    img = _open_rgb(data)
    if fill_fridge:
        img = ImageOps.fit(
            img,
            FRIDGE_SIZE,
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        )
    else:
        img.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    return _jpeg_bytes_from(img)


def pdf_to_jpegs(data: bytes) -> list[bytes]:
    if pdfium is None:
        raise RuntimeError("PDF-Unterstützung fehlt (pypdfium2).")
    doc = pdfium.PdfDocument(data)
    pages = []
    try:
        for i in range(len(doc)):
            page = doc[i]
            # ~150 dpi on A4-ish pages, capped for the fridge.
            pil = page.render(scale=2.2).to_pil()
            page.close()
            if pil.mode != "RGB":
                pil = pil.convert("RGB")
            pages.append(_jpeg_bytes_from(fit_newsletter_page(pil)))
    finally:
        doc.close()
    if not pages:
        raise RuntimeError("PDF hat keine Seiten.")
    return pages


def install_newsletter(pages_bytes: list[bytes], title: str, source: str | None = None) -> dict[str, Any]:
    if Paths.news.exists():
        shutil.rmtree(Paths.news)
    Paths.news.mkdir(parents=True, exist_ok=True)
    pages = []
    for i, blob in enumerate(pages_bytes, start=1):
        name = "page-%02d.jpg" % i
        (Paths.news / name).write_bytes(blob)
        pages.append(name)
    news = {
        "id": new_id(),
        "title": title or "Schulnewsletter",
        "pages": pages,
        "created_at": utc_now(),
    }
    if source:
        news["source"] = source
    state = load_state()
    state["newsletter"] = news
    save_state(state)
    return news


def fetch_url_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "FamilyHubDisplay/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read()


def ingest_mailbox() -> dict[str, Any]:
    settings = mail_inbox.imap_settings()
    if not settings:
        return {"ok": False, "reason": "imap_not_configured"}
    state = load_state()
    allowlist = list(state.get("settings", {}).get("newsletter_senders") or ["school@peachjar.com"])
    seen = list(state.get("mail_seen_ids") or [])
    imported = 0
    last_news = None
    for raw in mail_inbox.fetch_unseen_raw(settings):
        msg = mail_inbox.parse_raw(raw)
        mid = mail_inbox.message_id(msg)
        if mid in seen:
            continue
        try:
            result = mail_inbox.ingest_message(
                msg,
                allowlist,
                pdf_to_pages=pdf_to_jpegs,
                image_to_page=prepare_newsletter_image,
                fetch_url=fetch_url_bytes,
            )
        except Exception:
            seen.append(mid)
            continue
        seen.append(mid)
        if not result:
            continue
        last_news = install_newsletter(result["pages"], result["title"], source=result["from"])
        imported += 1
    state = load_state()
    state["mail_seen_ids"] = seen[-300:]
    save_state(state)
    return {"ok": True, "imported": imported, "newsletter": last_news}


def start_mail_poller(app: Flask) -> None:
    if not mail_inbox.imap_settings():
        return
    interval = max(60, int(os.environ.get("FAMILY_HUB_IMAP_POLL", "180")))

    def loop() -> None:
        time.sleep(8)
        while True:
            try:
                with app.app_context():
                    ingest_mailbox()
            except Exception:
                pass
            time.sleep(interval)

    threading.Thread(target=loop, name="family-hub-mail", daemon=True).start()


def public_urls() -> dict[str, str]:
    host = (os.environ.get("FAMILY_HUB_PUBLIC_HOST") or "emobilist.local").strip()
    port = (os.environ.get("FAMILY_HUB_PUBLIC_PORT") or os.environ.get("FAMILY_HUB_PORT") or "8755").strip()
    origin = "http://%s:%s" % (host, port)
    return {
        "host": host,
        "origin": origin,
        "admin_url": origin + "/",
        "fridge_url": origin + "/fridge?hub=1",
        "version": APP_VERSION,
    }


def public_state(state: dict[str, Any]) -> dict[str, Any]:
    settings = dict(state.get("settings") or {})
    newsletter = state.get("newsletter")
    dismissed = state.get("newsletter_dismissed") or {}
    news_id = newsletter["id"] if newsletter else None
    return {
        "photos": combined_photos(state),
        "messages": list(state.get("messages") or []),
        "newsletter": newsletter,
        "settings": settings,
        "newsletter_dismissed_at": dismissed.get(news_id) if news_id else None,
        "server_time": utc_now(),
        "weather": weather.cached(),
    }


def pin_ok() -> bool:
    if not PIN:
        return True
    provided = (request.headers.get("X-Family-Hub-Pin") or request.cookies.get("family_hub_pin") or "").strip()
    if not provided:
        provided = (request.args.get("pin") or "").strip()
    if request.is_json and request.json:
        provided = provided or str(request.json.get("pin") or "").strip()
    return provided == PIN


def require_pin() -> Response | None:
    if pin_ok():
        return None
    return jsonify({"error": "PIN erforderlich"}), 401


def create_app(
    seed_if_empty: bool = True,
    data_dir: str | Path | None = None,
    pin: str | None = None,
    library_dir: str | Path | None = None,
) -> Flask:
    configure(data_dir, pin=pin, library_dir=library_dir)
    ensure_dirs()
    app = Flask(__name__, static_folder=str(STATIC), static_url_path="/static")
    app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024

    if seed_if_empty:
        state = load_state()
        if not state["photos"] and not scan_library():
            state["photos"] = seed_sample_photos()
            save_state(state)
        if not state["newsletter"]:
            state["newsletter"] = seed_sample_newsletter()
            save_state(state)

    @app.after_request
    def no_cache_html(resp: Response) -> Response:
        if request.path in ("/", "/fridge", "/admin") or request.path.startswith("/api/") or request.path.startswith("/static/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.get("/")
    def admin_page() -> Response:
        return send_from_directory(STATIC, "admin.html")

    @app.get("/admin")
    def admin_alias() -> Response:
        return send_from_directory(STATIC, "admin.html")

    @app.get("/fridge")
    def fridge_page() -> Response:
        return send_from_directory(STATIC, "fridge.html")

    @app.get("/api/state")
    def api_state() -> Response:
        return jsonify(public_state(load_state()))

    @app.get("/api/info")
    def api_info() -> Response:
        return jsonify(public_urls())

    @app.get("/api/shuffle")
    def api_shuffle() -> Response:
        state = load_state()
        ids = [p["id"] for p in combined_photos(state)]
        last_id = request.args.get("last") or None
        return jsonify({"ids": shuffled_ids(ids, last_id)})

    @app.post("/api/photos")
    def api_upload_photos() -> Response:
        denied = require_pin()
        if denied:
            return denied
        files = request.files.getlist("photos") or request.files.getlist("photo")
        if not files:
            return jsonify({"error": "Keine Datei"}), 400
        state = load_state()
        added = []
        for fh in files:
            name = (fh.filename or "").lower()
            ext = Path(name).suffix
            raw = fh.read()
            if ext and ext not in ALLOWED_IMAGE and ext not in {".heic", ".heif"}:
                return jsonify({"error": "Nur Bilder (JPG, PNG, WebP, HEIC)."}), 400
            try:
                jpeg = prepare_image(raw, fill_fridge=True)
            except Exception:
                if ext in {".heic", ".heif"} or b"ftypheic" in raw[:32] or b"ftypheif" in raw[:32] or b"ftypmif1" in raw[:32]:
                    return jsonify({"error": "HEIC konnte nicht gelesen werden. Nochmal versuchen oder als JPG speichern."}), 400
                return jsonify({"error": "Bild konnte nicht gelesen werden: %s" % (fh.filename or "")}), 400
            photo_id = new_id()
            filename = "%s.jpg" % photo_id
            (Paths.photos / filename).write_bytes(jpeg)
            item = {
                "id": photo_id,
                "filename": filename,
                "created_at": utc_now(),
                "original_name": fh.filename,
            }
            state["photos"].append(item)
            added.append(item)
        save_state(state)
        return jsonify({"added": added, "state": public_state(state)})

    @app.delete("/api/photos/<photo_id>")
    def api_delete_photo(photo_id: str) -> Response:
        denied = require_pin()
        if denied:
            return denied
        if photo_id.startswith("lib-"):
            return jsonify({"error": "Bibliotheksfotos nicht löschen — liegen im Ordner bestgrok"}), 400
        state = load_state()
        remaining = []
        removed = None
        for photo in state["photos"]:
            if photo["id"] == photo_id:
                removed = photo
            else:
                remaining.append(photo)
        if not removed:
            return jsonify({"error": "Foto nicht gefunden"}), 404
        path = Paths.photos / removed["filename"]
        if path.exists():
            path.unlink()
        state["photos"] = remaining
        save_state(state)
        return jsonify({"ok": True, "state": public_state(state)})

    @app.post("/api/messages")
    def api_add_message() -> Response:
        denied = require_pin()
        if denied:
            return denied
        body = request.get_json(silent=True) or {}
        text = (body.get("text") or "").strip()
        if not text:
            return jsonify({"error": "Text fehlt"}), 400
        if len(text) > 400:
            return jsonify({"error": "Nachricht zu lang"}), 400
        state = load_state()
        item = {
            "id": new_id(),
            "text": text,
            "author": (body.get("author") or "").strip()[:40],
            "color": (body.get("color") or "gold").strip()[:20],
            "created_at": utc_now(),
        }
        state["messages"].insert(0, item)
        state["messages"] = state["messages"][:30]
        save_state(state)
        return jsonify({"message": item, "state": public_state(state)})

    @app.delete("/api/messages/<message_id>")
    def api_delete_message(message_id: str) -> Response:
        denied = require_pin()
        if denied:
            return denied
        state = load_state()
        before = len(state["messages"])
        state["messages"] = [m for m in state["messages"] if m["id"] != message_id]
        if len(state["messages"]) == before:
            return jsonify({"error": "Nachricht nicht gefunden"}), 404
        save_state(state)
        return jsonify({"ok": True, "state": public_state(state)})

    @app.post("/api/newsletter")
    def api_upload_newsletter() -> Response:
        denied = require_pin()
        if denied:
            return denied
        title = (request.form.get("title") or request.args.get("title") or "Schulnewsletter").strip()[:80]
        files = request.files.getlist("files") or request.files.getlist("file")
        if not files:
            return jsonify({"error": "PDF oder Bilder fehlen"}), 400
        pages_bytes: list[bytes] = []
        for fh in files:
            name = (fh.filename or "").lower()
            ext = Path(name).suffix
            raw = fh.read()
            if ext in ALLOWED_PDF:
                try:
                    pages_bytes.extend(pdf_to_jpegs(raw))
                except Exception as exc:
                    return jsonify({"error": "PDF konnte nicht gelesen werden: %s" % exc}), 400
            elif ext in ALLOWED_IMAGE:
                try:
                    pages_bytes.append(prepare_newsletter_image(raw))
                except Exception:
                    return jsonify({"error": "Bild unlesbar: %s" % (fh.filename or "")}), 400
            else:
                return jsonify({"error": "Bitte PDF oder Bilder hochladen."}), 400
        news = install_newsletter(pages_bytes, title)
        return jsonify({"newsletter": news, "state": public_state(load_state())})

    @app.delete("/api/newsletter")
    def api_clear_newsletter() -> Response:
        denied = require_pin()
        if denied:
            return denied
        state = load_state()
        state["newsletter"] = None
        if Paths.news.exists():
            shutil.rmtree(Paths.news)
            Paths.news.mkdir(parents=True, exist_ok=True)
        save_state(state)
        return jsonify({"ok": True, "state": public_state(state)})

    @app.post("/api/newsletter/dismiss")
    def api_dismiss_newsletter() -> Response:
        # Fridge display needs this without admin PIN.
        state = load_state()
        news = state.get("newsletter")
        if not news:
            return jsonify({"ok": True, "state": public_state(state)})
        dismissed = dict(state.get("newsletter_dismissed") or {})
        dismissed[news["id"]] = utc_now()
        state["newsletter_dismissed"] = dismissed
        save_state(state)
        return jsonify({"ok": True, "state": public_state(state)})

    @app.get("/api/senders")
    def api_list_senders() -> Response:
        state = load_state()
        return jsonify({"senders": list(state["settings"].get("newsletter_senders") or [])})

    @app.post("/api/senders")
    def api_add_sender() -> Response:
        denied = require_pin()
        if denied:
            return denied
        body = request.get_json(silent=True) or {}
        addr = mail_inbox.normalize_email(str(body.get("email") or ""))
        if not mail_inbox.valid_email(addr):
            return jsonify({"error": "Ungültige E-Mail-Adresse"}), 400
        state = load_state()
        senders = list(state["settings"].get("newsletter_senders") or [])
        if addr not in senders:
            senders.append(addr)
        state["settings"]["newsletter_senders"] = senders
        save_state(state)
        return jsonify({"senders": senders, "state": public_state(state)})

    @app.delete("/api/senders")
    def api_remove_sender() -> Response:
        denied = require_pin()
        if denied:
            return denied
        body = request.get_json(silent=True) or {}
        addr = mail_inbox.normalize_email(str(body.get("email") or request.args.get("email") or ""))
        state = load_state()
        senders = [s for s in (state["settings"].get("newsletter_senders") or []) if s != addr]
        state["settings"]["newsletter_senders"] = senders
        save_state(state)
        return jsonify({"senders": senders, "state": public_state(state)})

    @app.post("/api/mail/poll")
    def api_mail_poll() -> Response:
        denied = require_pin()
        if denied:
            return denied
        result = ingest_mailbox()
        result["state"] = public_state(load_state())
        return jsonify(result)

    @app.get("/api/weather")
    def api_weather() -> Response:
        payload = weather.current_weather(Paths.data / "weather.json")
        return jsonify(payload)

    @app.post("/api/settings")
    def api_settings() -> Response:
        denied = require_pin()
        if denied:
            return denied
        body = request.get_json(silent=True) or {}
        state = load_state()
        settings = dict(state.get("settings") or {})
        if "photo_seconds" in body:
            try:
                seconds = int(body["photo_seconds"])
            except (TypeError, ValueError):
                return jsonify({"error": "Ungültiges Intervall"}), 400
            settings["photo_seconds"] = max(5, min(120, seconds))
        if "popup_mode" in body:
            mode = str(body["popup_mode"])
            if mode not in ("start_and_interval", "once_per_day", "always", "off"):
                return jsonify({"error": "Ungültiger Popup-Modus"}), 400
            settings["popup_mode"] = mode
        if "popup_minutes" in body:
            try:
                minutes = int(body["popup_minutes"])
            except (TypeError, ValueError):
                return jsonify({"error": "Ungültige Minuten"}), 400
            settings["popup_minutes"] = max(5, min(240, minutes))
        if "family_name" in body:
            settings["family_name"] = str(body["family_name"]).strip()[:40] or "Familie"
        state["settings"] = settings
        save_state(state)
        return jsonify({"settings": settings, "state": public_state(state)})

    @app.get("/media/photos/<photo_id>")
    def media_photo(photo_id: str) -> Response:
        state = load_state()
        photo = next((p for p in combined_photos(state) if p["id"] == photo_id), None)
        if not photo:
            return jsonify({"error": "Foto nicht gefunden"}), 404
        if photo.get("library"):
            path = library_file(photo["filename"])
            if not path:
                return jsonify({"error": "Datei fehlt"}), 404
            return send_file(path, max_age=3600)
        path = Paths.photos / photo["filename"]
        if not path.exists():
            return jsonify({"error": "Datei fehlt"}), 404
        return send_file(path, mimetype="image/jpeg", max_age=86400)

    @app.get("/media/newsletter/<name>")
    def media_newsletter(name: str) -> Response:
        if "/" in name or "\\" in name or name.startswith("."):
            return jsonify({"error": "Ungültiger Name"}), 400
        path = Paths.news / name
        if not path.exists():
            return jsonify({"error": "Seite fehlt"}), 404
        return send_file(path, mimetype="image/jpeg", max_age=60)

    start_mail_poller(app)
    return app


app = None


def main() -> None:
    global app
    app = create_app()
    host = os.environ.get("FAMILY_HUB_HOST", "0.0.0.0")
    port = int(os.environ.get("FAMILY_HUB_PORT", "8755"))
    print("Family Hub Display  http://%s:%s/fridge" % (host, port))
    print("Handy-Steuerung     http://%s:%s/" % (host, port))
    app.run(host=host, port=port, debug=os.environ.get("FAMILY_HUB_DEBUG") == "1", threaded=True)


configure()


if __name__ == "__main__":
    main()
