"""Parse school newsletters from mailbox messages (Peachjar and others)."""

from __future__ import annotations

import email
import imaplib
import os
import re
from email.header import decode_header, make_header
from email.message import Message
from email.utils import parseaddr
from pathlib import Path
from typing import Any, Callable

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PDF_URL_RE = re.compile(r"https?://[^\s\"'<>]+\.pdf(?:\?[^\s\"'<>]*)?", re.I)

IMAGE_TYPES = {
    ("image", "jpeg"),
    ("image", "jpg"),
    ("image", "png"),
    ("image", "webp"),
    ("image", "gif"),
    ("image", "bmp"),
    ("image", "tiff"),
}


def normalize_email(value: str) -> str:
    _name, addr = parseaddr(value or "")
    addr = (addr or value or "").strip().lower()
    return addr


def valid_email(value: str) -> bool:
    return bool(EMAIL_RE.match(normalize_email(value)))


def decode_subject(msg: Message) -> str:
    raw = msg.get("Subject") or "Schulnewsletter"
    try:
        return str(make_header(decode_header(raw))).strip()[:80] or "Schulnewsletter"
    except Exception:
        return "Schulnewsletter"


def message_id(msg: Message) -> str:
    mid = (msg.get("Message-ID") or msg.get("Message-Id") or "").strip()
    if mid:
        return mid
    return "%s|%s" % (msg.get("From") or "", msg.get("Date") or "")


def sender_allowed(from_header: str, allowlist: list[str]) -> bool:
    sender = normalize_email(from_header)
    allowed = {normalize_email(item) for item in allowlist if item}
    return sender in allowed


def _payload_bytes(part: Message) -> bytes:
    payload = part.get_payload(decode=True)
    if not payload:
        return b""
    return payload


def extract_attachments(msg: Message) -> list[tuple[str, str, bytes]]:
    """Return (filename, kind, bytes) where kind is pdf or image."""
    found: list[tuple[str, str, bytes]] = []
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        filename = (part.get_filename() or "").strip()
        main = (part.get_content_maintype() or "").lower()
        sub = (part.get_content_subtype() or "").lower()
        data = _payload_bytes(part)
        if not data:
            continue
        name_l = filename.lower()
        if main == "application" and sub == "pdf":
            found.append((filename or "flyer.pdf", "pdf", data))
        elif name_l.endswith(".pdf"):
            found.append((filename or "flyer.pdf", "pdf", data))
        elif (main, sub) in IMAGE_TYPES or Path(name_l).suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}:
            found.append((filename or "image.jpg", "image", data))
    return found


def html_pdf_urls(msg: Message) -> list[str]:
    urls: list[str] = []
    for part in msg.walk():
        if part.get_content_type() != "text/html":
            continue
        data = _payload_bytes(part)
        if not data:
            continue
        charset = part.get_content_charset() or "utf-8"
        try:
            html = data.decode(charset, errors="ignore")
        except Exception:
            html = data.decode("utf-8", errors="ignore")
        for match in PDF_URL_RE.findall(html):
            if match not in urls:
                urls.append(match)
    return urls


def ingest_message(
    msg: Message,
    allowlist: list[str],
    pdf_to_pages: Callable[[bytes], list[bytes]],
    image_to_page: Callable[[bytes], bytes],
    fetch_url: Callable[[str], bytes] | None = None,
) -> dict[str, Any] | None:
    if not sender_allowed(msg.get("From") or "", allowlist):
        return None
    pages: list[bytes] = []
    attachments = extract_attachments(msg)
    for _name, kind, data in attachments:
        if kind == "pdf":
            pages.extend(pdf_to_pages(data))
        else:
            pages.append(image_to_page(data))
    if not pages and fetch_url:
        for url in html_pdf_urls(msg)[:3]:
            try:
                blob = fetch_url(url)
            except Exception:
                continue
            if blob[:4] == b"%PDF" or url.lower().endswith(".pdf") or b"%PDF" in blob[:16]:
                pages.extend(pdf_to_pages(blob))
            else:
                try:
                    pages.append(image_to_page(blob))
                except Exception:
                    continue
            if pages:
                break
    if not pages:
        return None
    return {
        "message_id": message_id(msg),
        "title": decode_subject(msg),
        "from": normalize_email(msg.get("From") or ""),
        "pages": pages,
    }


def imap_settings() -> dict[str, Any] | None:
    host = os.environ.get("FAMILY_HUB_IMAP_HOST", "").strip()
    user = os.environ.get("FAMILY_HUB_IMAP_USER", "").strip()
    password = os.environ.get("FAMILY_HUB_IMAP_PASSWORD", "").strip()
    if not host or not user or not password:
        return None
    return {
        "host": host,
        "port": int(os.environ.get("FAMILY_HUB_IMAP_PORT", "993")),
        "user": user,
        "password": password,
        "folder": os.environ.get("FAMILY_HUB_IMAP_FOLDER", "INBOX"),
    }


def fetch_unseen_raw(settings: dict[str, Any], limit: int = 20) -> list[bytes]:
    raw_messages: list[bytes] = []
    client = imaplib.IMAP4_SSL(settings["host"], settings["port"])
    try:
        client.login(settings["user"], settings["password"])
        client.select(settings["folder"], readonly=True)
        status, data = client.search(None, "UNSEEN")
        if status != "OK" or not data or not data[0]:
            return []
        ids = data[0].split()[-limit:]
        for msg_id in ids:
            status, fetched = client.fetch(msg_id, "(RFC822)")
            if status != "OK" or not fetched:
                continue
            for item in fetched:
                if isinstance(item, tuple) and item[1]:
                    raw_messages.append(item[1])
    finally:
        try:
            client.logout()
        except Exception:
            pass
    return raw_messages


def parse_raw(raw: bytes) -> Message:
    return email.message_from_bytes(raw)
