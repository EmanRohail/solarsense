"""SolarSense API — FastAPI on Cloud Run."""
from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import gemini, languages, solar, store
from .schemas import Diagnosis

ROOT = Path(__file__).resolve().parents[2]
STATIC = Path(os.getenv("STATIC_DIR", ROOT / "frontend" / "public"))
SAMPLES = STATIC / "samples"
CACHED = Path(__file__).with_name("sample_results.json")
MAX_BYTES = 30 * 1024 * 1024
IMAGE = ("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif")
VIDEO = ("video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/mpeg")
EXT = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "heic": "image/heic",
       "mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm", "3gp": "video/3gpp"}

app = FastAPI(title="SolarSense API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_tts_cache: dict[str, str] = {}


@app.on_event("startup")
def _startup() -> None:
    store.init()


def _lang(lang: str) -> str:
    return languages.norm(lang)


def _mime(file: UploadFile) -> str:
    m = (file.content_type or "").lower()
    if m in IMAGE + VIDEO:
        return m
    ext = (file.filename or "").lower().rsplit(".", 1)[-1]
    if ext in EXT:
        return EXT[ext]
    raise HTTPException(415, "Send a photo (JPG, PNG) or a short video (MP4, MOV).")


async def _read(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(400, "The file is empty.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "That file is over 30 MB. Record 10 to 20 seconds of video, or send a photo.")
    return data


def _need_gemini():
    if not gemini.available():
        raise HTTPException(503, "Gemini isn't configured on this server yet. Try one of the samples.")


@app.get("/api/health")
def health():
    return {"ok": True, "store": store.mode(), "gemini": gemini.available(), "model": gemini.MODEL}


@app.get("/api/languages")
def langs():
    return [{"code": k, **{x: v[x] for x in ("label", "native", "rtl", "tts")}, "voice": bool(v["tts"])} for k, v in languages.LANGS.items()]


_ui_cache: dict[str, dict] = {}


class UIReq(BaseModel):
    lang: str
    strings: dict[str, str]


@app.post("/api/ui")
def ui_strings(req: UIReq):
    """Translate the app's interface text into the chosen language with Gemini (cached)."""
    lang = _lang(req.lang)
    if lang == "en" or not gemini.available():
        return {"lang": "en", "strings": req.strings}
    key = lang + ":" + hashlib.sha1(json.dumps(req.strings, sort_keys=True).encode()).hexdigest()
    if key in _ui_cache:
        return _ui_cache[key]
    cached = store.get("ui", key)
    if cached:
        _ui_cache[key] = {"lang": lang, "strings": cached["strings"]}
        return _ui_cache[key]
    try:
        out = gemini.translate_ui(req.strings, lang)
        out = {k: out.get(k) or v for k, v in req.strings.items()}
    except Exception:  # noqa: BLE001
        return {"lang": "en", "strings": req.strings}
    store.save("ui", {"strings": out}, key)
    _ui_cache[key] = {"lang": lang, "strings": out}
    return _ui_cache[key]


@app.get("/api/places")
def places(q: str):
    return solar.geocode(q) if len(q.strip()) >= 2 else []


# ---------- talking inspector ----------
def _save_inspection(diag: Diagnosis, lang: str, media: str, source: str, doc_id: str | None = None) -> dict:
    doc = {"type": "inspection", "lang": lang, "media": media, "source": source, "diagnosis": diag.model_dump(), "qa": []}
    doc["id"] = store.save("inspections", doc, doc_id)
    return doc


@app.post("/api/inspect")
async def inspect(file: UploadFile = File(...), lang: str = Form("en")):
    _need_gemini()
    lang = _lang(lang)
    mime = _mime(file)
    data = await _read(file)
    try:
        diag = gemini.inspect(data, mime, lang)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"The AI couldn't read that file ({e.__class__.__name__}). Try a clearer photo or a shorter video.") from e
    return _save_inspection(diag, lang, "video" if mime.startswith("video") else "photo", "upload")


def _cached() -> dict:
    return json.loads(CACHED.read_text(encoding="utf-8")) if CACHED.exists() else {}


@app.get("/api/samples")
def samples():
    return [{k: v for k, v in s.items() if k in ("id", "title", "file", "kind")} for s in _cached().get("samples", [])]


@app.get("/api/samples/{sample_id}")
def sample(sample_id: str, lang: str = "en", refresh: bool = False):
    lang = _lang(lang)
    meta = next((s for s in _cached().get("samples", []) if s["id"] == sample_id), None)
    if not meta:
        raise HTTPException(404, "Unknown sample")
    doc_id = f"sample-{sample_id}-{lang}"
    if not refresh and (doc := store.get("inspections", doc_id)):
        return doc
    path = SAMPLES / meta["file"]
    if gemini.available():
        try:
            mime = EXT[path.suffix.lstrip(".").lower()]
            return _save_inspection(gemini.inspect(path.read_bytes(), mime, lang), lang, meta["kind"], "sample", doc_id)
        except Exception:  # noqa: BLE001
            pass
    diag = Diagnosis.model_validate(meta["result"].get(lang) or meta["result"]["en"])
    doc = _save_inspection(diag, lang, meta["kind"], "sample-cached", doc_id)
    return doc


class AskText(BaseModel):
    question: str
    lang: str = "en"


def _context(doc: dict) -> dict:
    d = doc["diagnosis"]
    return {"summary": d["summary"], "issues": [{"title": i["title"], "severity": i["severity"], "cause": i["likely_cause"]} for i in d["issues"]],
            "actions": [a["step"] for a in d["actions"]], "safety_warning": d.get("safety_warning"),
            "previous_questions": [q["question_heard"] for q in doc.get("qa", [])][-3:]}


@app.post("/api/inspections/{doc_id}/ask")
async def ask(doc_id: str, lang: str = Form("en"), question: str | None = Form(None), audio: UploadFile | None = File(None)):
    _need_gemini()
    doc = store.get("inspections", doc_id)
    if not doc:
        raise HTTPException(404, "Inspection not found")
    if not question and not audio:
        raise HTTPException(400, "Ask a question by voice or text.")
    audio_bytes = await audio.read() if audio else None
    try:
        ans = gemini.answer_question(_context(doc), _lang(lang), question, audio_bytes, audio.content_type if audio else None)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, "The AI couldn't answer just now. Try again.") from e
    qa = ans.model_dump()
    store.append_qa(doc_id, qa)
    return qa


# ---------- voice ----------
class SpeakReq(BaseModel):
    text: str
    lang: str = "en"


@app.post("/api/speak")
def speak(req: SpeakReq):
    if not gemini.available():
        raise HTTPException(503, "Server voice unavailable")
    text = req.text.strip()[:1500]
    key = hashlib.sha1(f"{req.lang}:{text}".encode()).hexdigest()
    if key not in _tts_cache:
        try:
            _tts_cache[key] = base64.b64encode(gemini.speak(text, _lang(req.lang))).decode()
        except Exception as e:  # noqa: BLE001
            raise HTTPException(503, "Server voice unavailable") from e
        if len(_tts_cache) > 200:
            _tts_cache.pop(next(iter(_tts_cache)))
    return {"audio_wav_base64": _tts_cache[key]}


# ---------- performance check ----------
@app.post("/api/performance")
async def performance(file: UploadFile = File(...), place: str = Form("Islamabad, Pakistan"), lat: float = Form(33.68),
                      lon: float = Form(73.05), capacity_kw: float | None = Form(None), tariff: float = Form(...),
                      currency: str = Form("USD"), lang: str = Form("en"), sample: str | None = Form(None)):
    lang = _lang(lang)
    mime = _mime(file)
    data = await _read(file)
    if not mime.startswith("image"):
        raise HTTPException(415, "Send a screenshot of your inverter app.")
    if gemini.available():
        try:
            reading = gemini.read_inverter(data, mime).model_dump()
        except Exception as e:  # noqa: BLE001
            raise HTTPException(502, "The AI couldn't read that screenshot. Try a clearer one.") from e
    elif sample:
        reading = _cached().get("inverter_reading", {})
    else:
        _need_gemini()
    if not reading.get("is_inverter_app", True):
        raise HTTPException(422, "That doesn't look like an inverter app screenshot. Open your solar app's home screen and take a screenshot.")
    cap = capacity_kw or reading.get("capacity_kw")
    if not cap:
        raise HTTPException(422, "Your system size wasn't visible. Enter it in kW (for example 10).")
    facts = solar.evaluate(reading, float(cap), float(tariff), currency.upper()[:3], place, lat, lon)
    if not facts["ok"]:
        raise HTTPException(422, facts["reason"] + " Use the screen that shows daily or monthly energy (kWh).")
    explanation = None
    if gemini.available():
        try:
            explanation = gemini.explain_performance(facts, lang).model_dump()
        except Exception:  # noqa: BLE001
            explanation = None
    if explanation is None:
        explanation = _fallback_explanation(facts, lang)
    doc = {"type": "performance", "lang": lang, "reading": reading, "facts": facts, "explanation": explanation}
    doc["id"] = store.save("checks", doc)
    return doc


def _fallback_explanation(f: dict, lang: str) -> dict:
    """Used only when Gemini is unavailable (local testing). English only."""
    pct = round(f["performance_ratio"] * 100)
    verdict = {"healthy": "Your solar system is working well.", "check": "Your system is producing less than it should.",
               "problem": "Your system is producing far less than it should. Something may be faulty."}[f["status"]]
    money = f"{f['lost_money_per_month']:,} {f['currency']}"
    spoken = (f"{verdict} It's making about {pct} percent of what your panels should produce in this weather. "
              f"That's roughly {money} lost every month.")
    causes = ["Dust on panels", "Shading", "High heat"] if f["status"] != "problem" else ["Inverter or string fault", "Damaged panel"]
    actions = [{"step": "Wash the panels with plain water early in the morning", "who": "you"},
               {"step": "If the gap stays, call a technician", "who": "technician"}]
    return {"summary": verdict, "likely_causes": causes, "actions": actions, "spoken_script": spoken}


# ---------- static frontend ----------
if STATIC.exists():
    app.mount("/", StaticFiles(directory=STATIC, html=True), name="static")


@app.exception_handler(404)
async def _spa(request, exc):  # noqa: ANN001
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": getattr(exc, "detail", "Not found")}, status_code=404)
    return FileResponse(STATIC / "index.html")
