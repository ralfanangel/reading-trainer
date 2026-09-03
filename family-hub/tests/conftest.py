from __future__ import annotations

from pathlib import Path

import pytest

import server


@pytest.fixture
def client(tmp_path: Path):
    app = server.create_app(seed_if_empty=False, data_dir=tmp_path)
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client
