"""Offline tests (no Google Cloud needed): pytest -q"""
import os
import sys
import wave
import io
from datetime import date
from pathlib import Path

os.environ["USE_FIRESTORE"] = "false"
os.environ.pop("GEMINI_API_KEY", None)
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app import gemini, languages, solar  # noqa: E402
from app.main import app  # noqa: E402

SAMPLE_READING = {
    "daily": [{"date": f"2026-10-0{d}", "kwh": 28.0} for d in range(4, 10)],
    "capacity_kw": 10, "fault_codes": [],
}


def test_six_languages_with_voice_codes():
    assert len(languages.LANGS) == 6
    assert languages.LANGS["ur"]["rtl"] and languages.LANGS["ar"]["rtl"]
    assert all(v["tts"] for v in languages.LANGS.values())
    assert languages.norm("xx") == "en"


def test_wav_wrapper():
    data = gemini._wav(b"\x00\x00" * 2400)
    with wave.open(io.BytesIO(data)) as w:
        assert w.getframerate() == 24000 and w.getnframes() == 2400


def test_performance_maths_uses_users_currency():
    f = solar.evaluate(SAMPLE_READING, 10, 0.25, "USD", "Somewhere", 0, 0, today=date(2026, 10, 11))
    assert f["ok"] and f["currency"] == "USD"
    expected = 10 * solar.FALLBACK_PSH * solar.PR
    assert abs(f["expected_kwh_per_day"] - round(expected, 1)) < 0.11
    assert f["lost_money_per_month"] == round((expected - 28.0) * 30 * 0.25)
    assert f["status"] == "check"


def test_api_offline_flow():
    with TestClient(app) as c:
        assert len(c.get("/api/languages").json()) == 6
        d = c.get("/api/samples/cracked?lang=ur").json()
        assert d["diagnosis"]["overall_severity"] == "danger"
        assert all(i["box_2d"] for i in d["diagnosis"]["issues"])
        png = (ROOT / "frontend/public/samples/inverter_app.png").read_bytes()
        r = c.post("/api/performance", data={"tariff": "0.2", "currency": "EUR", "lang": "id", "sample": "1"},
                   files={"file": ("a.png", png, "image/png")})
        assert r.status_code == 200 and r.json()["facts"]["currency"] == "EUR"
        assert c.post("/api/inspect", data={"lang": "en"}, files={"file": ("a.jpg", b"x", "image/jpeg")}).status_code == 503
        assert c.post("/api/ui", json={"lang": "fr", "strings": {"a": "Hello"}}).json()["strings"]["a"] == "Hello"
