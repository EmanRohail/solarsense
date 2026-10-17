"""Gemini agents for SolarSense.

Works with a free Google AI Studio key (GEMINI_API_KEY) or with Vertex AI on Cloud Run
(GOOGLE_GENAI_USE_VERTEXAI=true). If neither is set, available() is False and the app
falls back to cached sample results so the UI can still be tested offline.
"""
from __future__ import annotations

import io
import json
import os
import time
import wave

from .schemas import Answer, Diagnosis, InverterReading, PerformanceExplanation

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
TTS_MODELS = [m for m in [os.getenv("TTS_MODEL"), "gemini-3.1-flash-tts-preview", "gemini-3.8-flash-tts",
                           "gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts"] if m]
VOICE = os.getenv("TTS_VOICE", "Kore")
INLINE_LIMIT = 15 * 1024 * 1024
_client = None

from .languages import LANGS
LANG_NAME = {k: v["prompt"] for k, v in LANGS.items()}


def available() -> bool:
    return bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() == "true")


def using_vertex() -> bool:
    return not os.getenv("GEMINI_API_KEY") and os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() == "true"


def client():
    global _client
    if _client is None:
        from google import genai

        if os.getenv("GEMINI_API_KEY"):
            _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        else:
            _client = genai.Client(vertexai=True, project=os.getenv("GOOGLE_CLOUD_PROJECT"),
                                   location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"))
    return _client


def _media_part(data: bytes, mime: str):
    """Small files go inline; large videos go through the Files API (Gemini API key only)."""
    from google.genai import types

    if len(data) <= INLINE_LIMIT or using_vertex():
        return types.Part.from_bytes(data=data, mime_type=mime)
    f = client().files.upload(file=io.BytesIO(data), config={"mime_type": mime})
    for _ in range(60):
        f = client().files.get(name=f.name)
        if getattr(f.state, "name", str(f.state)) == "ACTIVE":
            break
        time.sleep(1)
    return f


def _json(model_cls, contents, temperature=0.2):
    from google.genai import types

    resp = client().models.generate_content(
        model=MODEL, contents=contents,
        config=types.GenerateContentConfig(temperature=temperature, response_mime_type="application/json",
                                           response_schema=model_cls))
    return model_cls.model_validate_json(resp.text)


INSPECT_PROMPT = """You are SolarSense, an experienced rooftop-solar technician who helps home and small-business owners
anywhere in the world. A homeowner sent this {kind} of their solar system. Inspect it the way a careful technician would on a site visit.

Work in this order:
1. Identify what the {kind} shows (panels, inverter, wiring, battery, mounting, meter, or not solar) and how clear it is.
2. Scan it systematically, part by part (for panels: each row and each panel edge to edge; for an inverter: screen text, lights, casing,
   cables; for wiring: every connector, cable run, junction box, breaker and fuse).
3. For each possible problem, check the visual evidence before reporting it.

Look for: dust, dirt, sand, pollen, bird droppings, moss or leaves; partial shading (trees, water tanks, walls, chimneys, wires, other rows);
cracked or shattered glass and micro-crack "snail trails"; hotspots, burn marks, browning or yellowing (EVA discoloration), bubbles or
delamination, corroded frames; loose, bent or rusted mounting, missing clamps, panels at very different angles; water pooling; melted,
burnt, cracked, sun-damaged or loose cables and MC4 connectors, cables touching the roof or hanging; inverter fault or warning codes
and lights (copy any screen text exactly, e.g. "F07 Grid Overvoltage"); swollen, leaking or corroded batteries; tripped breakers,
burnt fuses or scorch marks on DB boxes.

Rules:
- Write every user-facing field entirely in {lang}. Never switch to another language part-way through a field,
even if the photo, the screen text or the user's question is in another language. Error codes, brand names and units stay as they are.
- Only report what you can actually see. Do not invent problems to have something to say. If the {kind} is clear and nothing is wrong,
  return no issues and say the system looks healthy. If it is too dark, blurry, far away or not a solar system, say so in summary and
  use next_photo to say exactly what to film.
- confidence per issue: high = clearly visible, medium = likely but partly hidden or small, low = possible, needs a closer look.
- where: describe the position in plain words so the owner can find it on their roof.
- For a photo, give box_2d [ymin, xmin, ymax, xmax] on a 0-1000 scale tightly around each problem. For a video, leave box_2d out.
- Severity: danger = fire or electric-shock risk (burn marks, melted connectors, exposed live wires, swollen battery);
  high = large output loss or damage that will get worse (cracked glass, hotspot, fault code stopping production);
  medium = clear output loss (heavy dust, shading); low = minor or cosmetic.
- Order issues from most to least serious.
- Homeowners may only do safe things themselves: look, clean from the ground or with safe access, early morning or evening, plain water
  and a soft brush, no detergent or pressure washer, never on a hot or wet roof. Anything electrical, inside the inverter, or on a risky
  roof is for a technician. Cracked or burnt panels: do not touch or wash.
- Estimate the output loss range in percent only if you reasonably can.
- looks_ok: up to 3 short things you checked that look fine.
- spoken_script: talk to the homeowner like a kind expert neighbour, 30-45 seconds, entirely in {lang}. Start with the verdict, then
  the main problem, then what to do first. No lists, no markdown, no emojis.
"""


def inspect(data: bytes, mime: str, lang: str) -> Diagnosis:
    kind = "short video" if mime.startswith("video") else "photo"
    return _json(Diagnosis, [_media_part(data, mime), INSPECT_PROMPT.format(kind=kind, lang=LANG_NAME[lang])], temperature=0.1)


READ_PROMPT = """This is a screenshot from a solar inverter or solar monitoring app (for example Solarman, SolisCloud, ShinePhone,
Growatt, Huawei FusionSolar, GoodWe SEMS, Inverex, Knox, Fronius). Read the numbers exactly as shown. Convert Wh to kWh and MWh to kWh.
Do not guess values that are not visible. If it is not a solar app screenshot, set is_inverter_app to false."""


def read_inverter(data: bytes, mime: str) -> InverterReading:
    return _json(InverterReading, [_media_part(data, mime), READ_PROMPT], temperature=0.0)


def explain_performance(facts: dict, lang: str) -> PerformanceExplanation:
    prompt = f"""You are SolarSense, a friendly rooftop-solar technician. A homeowner's system produced less or more than expected.
Explain the result in {LANG_NAME[lang]}. Use only these facts, do not invent numbers:
{json.dumps(facts, ensure_ascii=False)}
If performance_ratio is above 0.85 the system is healthy. Between 0.65 and 0.85, dust, shading or high heat are the usual causes.
Below 0.65, suspect a fault (tripped string, inverter fault, broken panel, clipping) and recommend a technician.
Fault codes, if any, are important: explain them simply. spoken_script must mention the money lost per month, in the given currency, if there is a loss."""
    return _json(PerformanceExplanation, prompt, temperature=0.3)


def answer_question(context: dict, lang: str, question_text: str | None = None, audio: bytes | None = None,
                    audio_mime: str | None = None) -> Answer:
    from google.genai import types

    prompt = f"""You are SolarSense, a friendly rooftop-solar technician. Earlier you gave this diagnosis:
{json.dumps(context, ensure_ascii=False)}
The homeowner now asks a follow-up question {'(in the attached voice note)' if audio else ''}.
Answer in {LANG_NAME[lang]}, practical and safe. If the question is about touching wiring, the inverter internals
or climbing a risky roof, tell them to call a technician. If you can't hear the question, ask them to repeat it."""
    parts = []
    if audio:
        parts.append(types.Part.from_bytes(data=audio, mime_type=audio_mime or "audio/webm"))
    parts.append(prompt + (f"\nQuestion: {question_text}" if question_text else ""))
    return _json(Answer, parts, temperature=0.4)


def _wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def speak(text: str, lang: str) -> bytes:
    """Gemini text-to-speech. Returns a WAV file. Raises if no TTS model is reachable."""
    from google.genai import types

    style = "Say this warmly and clearly, like a helpful technician talking to a neighbour"
    last = None
    for model in TTS_MODELS:
        for with_lang in (True, False):
            try:
                speech = types.SpeechConfig(
                    voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE)),
                    **({"language_code": LANGS[lang]["tts"] or "en-US"} if with_lang else {}))
                resp = client().models.generate_content(
                    model=model, contents=f"{style}: {text}",
                    config=types.GenerateContentConfig(response_modalities=["AUDIO"], speech_config=speech))
                part = resp.candidates[0].content.parts[0]
                data = part.inline_data.data
                mime = (part.inline_data.mime_type or "").lower()
                if "wav" in mime or data[:4] == b"RIFF":
                    return data
                rate = 24000
                if "rate=" in mime:
                    try:
                        rate = int(mime.split("rate=")[1].split(";")[0])
                    except ValueError:
                        pass
                return _wav(data, rate)
            except Exception as e:  # noqa: BLE001
                last = e
    raise RuntimeError(f"Text-to-speech unavailable: {last}")


def translate_ui(strings: dict[str, str], lang: str) -> dict[str, str]:
    """Translate interface labels. Returns a JSON object with exactly the same keys."""
    from google.genai import types

    prompt = (f"Translate the values of this JSON object into {LANG_NAME[lang]} for a mobile app that helps people check "
              "their rooftop solar panels. Keep it short and natural, keep {placeholders} unchanged, keep the keys unchanged. "
              "Return only the JSON object.\n" + json.dumps(strings, ensure_ascii=False))
    resp = client().models.generate_content(model=MODEL, contents=prompt, config=types.GenerateContentConfig(
        temperature=0.1, response_mime_type="application/json"))
    data = json.loads(resp.text)
    return {k: str(v) for k, v in data.items() if isinstance(k, str)}
