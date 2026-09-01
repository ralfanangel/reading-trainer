"""Family Hub kitchen display: photos, notes, school newsletter."""

from __future__ import annotations

import io
import json
import os
import random
import shutil
import threading
import uuid
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

try:
    import pypdfium2 as pdfium
except ImportError:  # pragma: no cover
    pdfium = None

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
PIN = os.environ.get("FAMILY_HUB_PIN", "").strip()


class Paths:
    data = ROOT / "data"
    photos = data / "photos"
    news = data / "newsletter"
    state = data / "state.json"


def configure(data_dir: str | Path | None = None, pin: str | None = None) -> None:
    Paths.data = Path(data_dir or os.environ.get("FAMILY_HUB_DATA", ROOT / "data"))
    Paths.photos = Paths.data / "photos"
    Paths.news = Paths.data / "newsletter"
    Paths.state = Paths.data / "state.json"
    global PIN
    if pin is not None:
        PIN = pin
    else:
        PIN = os.environ.get("FAMILY_HUB_PIN", "").strip()

ALLOWED_IMAGE = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
ALLOWED_PDF = {".pdf"}
MAX_EDGE = 1920
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
        },
        "newsletter_dismissed": {},
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
        return base


def _write_state(state: dict[str, Any]) -> None:
    tmp = Paths.state.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(Paths.state)


def save_state(state: dict[str, Any]) -> None:
    ensure_dirs()
    with _lock:
        _write_state(state)


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


def prepare_image(data: bytes) -> bytes:
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA"):
        background = Image.new("RGB", img.size, (12, 12, 14))
        background.paste(img, mask=img.split()[-1])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")
    img.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=PHOTO_QUALITY, optimize=True, progressive=True)
    return out.getvalue()


def pdf_to_jpegs(data: bytes) -> list[bytes]:
    if pdfium is None:
        raise RuntimeError("PDF-Unterstützung fehlt (pypdfium2).")
    doc = pdfium.PdfDocument(data)
    pages = []
    try:
        for i in range(len(doc)):
            page = doc[i]
            # ~150 dpi on A4-ish pages, capped for the fridge.
            pil = page.render(scale=1.7).to_pil()
            page.close()
            buf = io.BytesIO()
            if pil.mode != "RGB":
                pil = pil.convert("RGB")
            pil.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
            pil.save(buf, "JPEG", quality=86, optimize=True)
            pages.append(buf.getvalue())
    finally:
        doc.close()
    if not pages:
        raise RuntimeError("PDF hat keine Seiten.")
    return pages


def public_state(state: dict[str, Any]) -> dict[str, Any]:
    settings = dict(state.get("settings") or {})
    newsletter = state.get("newsletter")
    dismissed = state.get("newsletter_dismissed") or {}
    news_id = newsletter["id"] if newsletter else None
    return {
        "photos": list(state.get("photos") or []),
        "messages": list(state.get("messages") or []),
        "newsletter": newsletter,
        "settings": settings,
        "newsletter_dismissed_at": dismissed.get(news_id) if news_id else None,
        "server_time": utc_now(),
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
) -> Flask:
    configure(data_dir, pin=pin)
    ensure_dirs()
    app = Flask(__name__, static_folder=str(STATIC), static_url_path="/static")
    app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024

    if seed_if_empty:
        state = load_state()
        if not state["photos"]:
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

    @app.get("/api/shuffle")
    def api_shuffle() -> Response:
        state = load_state()
        ids = [p["id"] for p in state.get("photos") or []]
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
            if ext not in ALLOWED_IMAGE:
                return jsonify({"error": "Nur Bilder (JPG, PNG, WebP). HEIC bitte als JPG exportieren."}), 400
            raw = fh.read()
            try:
                jpeg = prepare_image(raw)
            except Exception:
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
                    pages_bytes.append(prepare_image(raw))
                except Exception:
                    return jsonify({"error": "Bild unlesbar: %s" % (fh.filename or "")}), 400
            else:
                return jsonify({"error": "Bitte PDF oder Bilder hochladen."}), 400
        if Paths.news.exists():
            shutil.rmtree(Paths.news)
        Paths.news.mkdir(parents=True, exist_ok=True)
        pages = []
        for i, blob in enumerate(pages_bytes, start=1):
            name = "page-%02d.jpg" % i
            (Paths.news / name).write_bytes(blob)
            pages.append(name)
        state = load_state()
        news = {
            "id": new_id(),
            "title": title or "Schulnewsletter",
            "pages": pages,
            "created_at": utc_now(),
        }
        state["newsletter"] = news
        save_state(state)
        return jsonify({"newsletter": news, "state": public_state(state)})

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
        photo = next((p for p in state["photos"] if p["id"] == photo_id), None)
        if not photo:
            return jsonify({"error": "Foto nicht gefunden"}), 404
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
