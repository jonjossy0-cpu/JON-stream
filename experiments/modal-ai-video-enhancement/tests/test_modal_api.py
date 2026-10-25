"""CPU-only smoke tests for the isolated Modal HTTP API.

These tests never invoke the GPU function or deploy anything to Modal.
"""
import os
import runpy
from pathlib import Path

from fastapi.testclient import TestClient

APP_PATH = Path(__file__).parents[1] / "experiments" / "modal-ai-video-enhancement" / "modal_app.py"
APP_MODULE = runpy.run_path(str(APP_PATH))
client = TestClient(APP_MODULE["web_app"])


def test_health_reports_prototype_not_live_hls():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["mode"] == "single-frame-proof-of-concept"
    assert data["live_hls"] == "not-enabled"


def test_missing_server_key_returns_service_unavailable(monkeypatch):
    monkeypatch.delenv("JON_AI_API_KEY", raising=False)
    response = client.post("/enhance-frame", content=b"")
    assert response.status_code == 503


def test_wrong_api_key_is_rejected_before_image_processing(monkeypatch):
    monkeypatch.setenv("JON_AI_API_KEY", "test-only-secret")
    response = client.post(
        "/enhance-frame",
        content=b"not-an-image",
        headers={"x-api-key": "wrong-key"},
    )
    assert response.status_code == 401


def test_empty_image_body_is_rejected(monkeypatch):
    monkeypatch.setenv("JON_AI_API_KEY", "test-only-secret")
    response = client.post(
        "/enhance-frame",
        content=b"",
        headers={"x-api-key": "test-only-secret"},
    )
    assert response.status_code == 400


def test_invalid_image_is_rejected_without_gpu_work(monkeypatch):
    monkeypatch.setenv("JON_AI_API_KEY", "test-only-secret")
    response = client.post(
        "/enhance-frame",
        content=b"not-an-image",
        headers={"x-api-key": "test-only-secret"},
    )
    assert response.status_code == 415


def test_oversized_content_length_is_rejected(monkeypatch):
    monkeypatch.setenv("JON_AI_API_KEY", "test-only-secret")
    response = client.post(
        "/enhance-frame",
        content=b"x",
        headers={
            "x-api-key": "test-only-secret",
            "content-length": str(4 * 1024 * 1024 + 1),
        },
    )
    assert response.status_code == 413
