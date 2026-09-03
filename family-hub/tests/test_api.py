from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
from PIL import Image

import server


def _jpeg_bytes(color: tuple[int, int, int], size: tuple[int, int] = (80, 120)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "JPEG", quality=80)
    return buf.getvalue()


@pytest.fixture
def client(tmp_path: Path):
    app = server.create_app(seed_if_empty=False, data_dir=tmp_path)
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def test_shuffle_avoids_immediate_repeat():
    ids = ["a", "b", "c", "d"]
    seen_first = set()
    for _ in range(40):
        order = server.shuffled_ids(ids, last_id="a")
        assert sorted(order) == sorted(ids)
        seen_first.add(order[0])
        assert order[0] != "a"
    assert seen_first <= set(ids) - {"a"}


def test_shuffle_single_item_keeps_id():
    assert server.shuffled_ids(["only"], last_id="only") == ["only"]


def test_empty_state(client):
    res = client.get("/api/state")
    assert res.status_code == 200
    body = res.get_json()
    assert body["photos"] == []
    assert body["messages"] == []
    assert body["newsletter"] is None


def test_photo_upload_and_shuffle(client):
    red = _jpeg_bytes((200, 40, 40))
    blue = _jpeg_bytes((40, 80, 200))
    res = client.post(
        "/api/photos",
        data={"photos": [(io.BytesIO(red), "red.jpg"), (io.BytesIO(blue), "blue.jpg")]},
        content_type="multipart/form-data",
    )
    assert res.status_code == 200
    added = res.get_json()["added"]
    assert len(added) == 2
    photo_id = added[0]["id"]
    media = client.get("/media/photos/" + photo_id)
    assert media.status_code == 200
    assert media.mimetype == "image/jpeg"

    shuffled = client.get("/api/shuffle")
    ids = shuffled.get_json()["ids"]
    assert sorted(ids) == sorted([item["id"] for item in added])

    deleted = client.delete("/api/photos/" + photo_id)
    assert deleted.status_code == 200
    remaining = deleted.get_json()["state"]["photos"]
    assert len(remaining) == 1
    assert remaining[0]["id"] != photo_id


def test_uploaded_photo_fills_fridge_frame(client):
    buf = io.BytesIO()
    Image.new("RGB", (4000, 1800), (30, 90, 160)).save(buf, "JPEG", quality=85)
    res = client.post(
        "/api/photos",
        data={"photos": (io.BytesIO(buf.getvalue()), "wide.jpg")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 200
    photo_id = res.get_json()["added"][0]["id"]
    media = client.get("/media/photos/" + photo_id)
    out = Image.open(io.BytesIO(media.data))
    assert out.size == (1080, 1920)
    assert out.format == "JPEG"


def test_reject_non_image(client):
    res = client.post(
        "/api/photos",
        data={"photos": (io.BytesIO(b"not-an-image"), "notes.txt")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 400


def test_upload_jpeg_without_extension(client):
    red = _jpeg_bytes((200, 40, 40))
    res = client.post(
        "/api/photos",
        data={"photos": (io.BytesIO(red), "IMG_1234")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 200
    assert len(res.get_json()["added"]) == 1


def test_admin_photo_picker_accepts_any_image(client):
    html = client.get("/").get_data(as_text=True)
    assert 'id="photo-input"' in html
    assert 'accept="image/*"' in html
    assert "image/jpeg,image/png" not in html
    assert 'novalidate' in html


def test_messages_roundtrip(client):
    res = client.post(
        "/api/messages",
        data=json.dumps({"text": "Milch ist alle", "author": "Papa"}),
        content_type="application/json",
    )
    assert res.status_code == 200
    msg = res.get_json()["message"]
    assert msg["text"] == "Milch ist alle"
    listed = client.get("/api/state").get_json()["messages"]
    assert listed[0]["id"] == msg["id"]
    gone = client.delete("/api/messages/" + msg["id"])
    assert gone.status_code == 200
    assert client.get("/api/state").get_json()["messages"] == []


def test_empty_message_rejected(client):
    res = client.post("/api/messages", json={"text": "   "})
    assert res.status_code == 400


def test_newsletter_from_image_and_dismiss(client):
    page = _jpeg_bytes((247, 241, 227), (600, 800))
    res = client.post(
        "/api/newsletter",
        data={"title": "Elternbrief KW 36", "files": (io.BytesIO(page), "brief.jpg")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 200
    news = res.get_json()["newsletter"]
    assert news["title"] == "Elternbrief KW 36"
    assert news["pages"] == ["page-01.jpg"]
    media = client.get("/media/newsletter/page-01.jpg")
    assert media.status_code == 200

    dismissed = client.post("/api/newsletter/dismiss")
    assert dismissed.status_code == 200
    state = dismissed.get_json()["state"]
    assert state["newsletter_dismissed_at"]
    assert state["newsletter"]["id"] == news["id"]

    cleared = client.delete("/api/newsletter")
    assert cleared.status_code == 200
    assert cleared.get_json()["state"]["newsletter"] is None


def test_newsletter_from_pdf(client):
    pdf = (
        b"%PDF-1.1\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"
        b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n"
        b"0000000052 00000 n \n0000000101 00000 n \n"
        b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n"
    )
    res = client.post(
        "/api/newsletter",
        data={"title": "PDF-Brief", "files": (io.BytesIO(pdf), "brief.pdf")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 200
    news = res.get_json()["newsletter"]
    assert news["pages"]
    media = client.get("/media/newsletter/" + news["pages"][0])
    assert media.status_code == 200


def test_settings_and_pin(tmp_path: Path):
    app = server.create_app(seed_if_empty=False, data_dir=tmp_path, pin="secret")
    app.config["TESTING"] = True
    client = app.test_client()
    denied = client.post("/api/settings", json={"photo_seconds": 20})
    assert denied.status_code == 401
    ok = client.post(
        "/api/settings",
        json={"photo_seconds": 20, "popup_mode": "once_per_day"},
        headers={"X-Family-Hub-Pin": "secret"},
    )
    assert ok.status_code == 200
    assert ok.get_json()["settings"]["photo_seconds"] == 20
    assert ok.get_json()["settings"]["popup_mode"] == "once_per_day"
    # Fridge display still readable without PIN.
    assert client.get("/api/state").status_code == 200


def test_public_info_urls(client, monkeypatch):
    monkeypatch.setenv("FAMILY_HUB_PUBLIC_HOST", "emobilist.local")
    monkeypatch.setenv("FAMILY_HUB_PUBLIC_PORT", "8755")
    info = client.get("/api/info").get_json()
    assert info["fridge_url"] == "http://emobilist.local:8755/fridge?hub=1"
    assert info["admin_url"] == "http://emobilist.local:8755/"
    assert info["version"] == server.APP_VERSION


def test_library_folder_photos(tmp_path: Path):
    library = tmp_path / "bestgrok"
    library.mkdir()
    (library / "one.jpg").write_bytes(_jpeg_bytes((10, 20, 30)))
    nested = library / "urlaub"
    nested.mkdir()
    png = io.BytesIO()
    Image.new("RGB", (40, 60), (80, 120, 40)).save(png, "PNG")
    (nested / "two.png").write_bytes(png.getvalue())
    thumbs = library / "@eaDir"
    thumbs.mkdir()
    (thumbs / "thumb.jpg").write_bytes(_jpeg_bytes((1, 1, 1)))

    app = server.create_app(
        seed_if_empty=True,
        data_dir=tmp_path / "data",
        library_dir=library,
    )
    client = app.test_client()
    photos = client.get("/api/state").get_json()["photos"]
    assert len(photos) == 2
    assert all(p.get("library") for p in photos)
    assert not any(p.get("sample") for p in photos)
    assert client.get("/media/photos/" + photos[0]["id"]).status_code == 200
    assert client.delete("/api/photos/" + photos[0]["id"]).status_code == 400
    shuffled = client.get("/api/shuffle").get_json()["ids"]
    assert sorted(shuffled) == sorted(p["id"] for p in photos)
    app = server.create_app(seed_if_empty=True, data_dir=tmp_path)
    client = app.test_client()
    state = client.get("/api/state").get_json()
    assert len(state["photos"]) == 6
    assert state["newsletter"]["pages"]
    assert client.get("/media/photos/" + state["photos"][0]["id"]).status_code == 200
    assert client.get("/fridge").status_code == 200
    assert client.get("/").status_code == 200
