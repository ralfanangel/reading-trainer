from __future__ import annotations

import io
from email.message import EmailMessage

from PIL import Image

import mail_inbox
import server


def _png(size=(200, 300), color=(20, 80, 40)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


def test_sender_allowlist(client):
    state = client.get("/api/state").get_json()
    assert "school@peachjar.com" in state["settings"]["newsletter_senders"]
    added = client.post("/api/senders", json={"email": "ptsa@example.org"})
    assert added.status_code == 200
    senders = added.get_json()["senders"]
    assert "ptsa@example.org" in senders
    bad = client.post("/api/senders", json={"email": "not-an-email"})
    assert bad.status_code == 400
    gone = client.delete("/api/senders", json={"email": "ptsa@example.org"})
    assert "ptsa@example.org" not in gone.get_json()["senders"]


def test_peachjar_image_email_becomes_readable_newsletter(tmp_path):
    server.configure(tmp_path)
    msg = EmailMessage()
    msg["From"] = "Peachjar <school@peachjar.com>"
    msg["Subject"] = "Spirit Week Flyer"
    msg["Message-ID"] = "<peach-1@peachjar.com>"
    msg.add_attachment(_png((1600, 2200)), maintype="image", subtype="png", filename="flyer.png")

    result = mail_inbox.ingest_message(
        msg,
        ["school@peachjar.com"],
        pdf_to_pages=server.pdf_to_jpegs,
        image_to_page=server.prepare_newsletter_image,
    )
    assert result is not None
    assert result["from"] == "school@peachjar.com"
    page = Image.open(io.BytesIO(result["pages"][0]))
    assert page.size[0] == 1080
    assert page.format == "JPEG"


def test_unknown_sender_is_ignored():
    msg = EmailMessage()
    msg["From"] = "spam@example.com"
    msg["Subject"] = "Nope"
    msg.add_attachment(_png(), maintype="image", subtype="png", filename="x.png")
    result = mail_inbox.ingest_message(
        msg,
        ["school@peachjar.com"],
        pdf_to_pages=lambda _b: [],
        image_to_page=server.prepare_newsletter_image,
    )
    assert result is None


def test_mail_poll_without_imap(client):
    res = client.post("/api/mail/poll")
    assert res.status_code == 200
    assert res.get_json()["reason"] == "imap_not_configured"


def test_admin_page_shows_mail_poll_before_photos(client):
    res = client.get("/")
    assert res.status_code == 200
    html = res.get_data(as_text=True)
    assert "Jetzt Postfach prüfen" in html
    assert html.find('id="mail-poll"') < html.find('id="photo-grid"')
    assert html.find("<h2>Postfach prüfen</h2>") < html.find("<h2>Fotos</h2>")
