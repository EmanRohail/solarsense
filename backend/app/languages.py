"""Languages SolarSense speaks.

Text (diagnosis, captions, answers) is written by Gemini in every language below.
Voice uses Gemini text-to-speech; `tts` is the BCP-47 code from the Gemini-TTS language table.
"""

LANGS = {
    "en": {"label": "English", "native": "English", "prompt": "simple English", "tts": "en-US", "rtl": False},
    "ur": {"label": "Urdu", "native": "اردو", "prompt": "Urdu in Urdu script (technical words like panel, inverter, wiring and MC4 may stay in English)", "tts": "ur-PK", "rtl": True},
    "hi": {"label": "Hindi", "native": "हिन्दी", "prompt": "Hindi in Devanagari script (technical words like panel, inverter and MC4 may stay in English)", "tts": "hi-IN", "rtl": False},
    "zh": {"label": "Mandarin Chinese", "native": "中文", "prompt": "Simplified Chinese (Mandarin)", "tts": "cmn-CN", "rtl": False},
    "id": {"label": "Indonesian", "native": "Bahasa Indonesia", "prompt": "Indonesian (Bahasa Indonesia)", "tts": "id-ID", "rtl": False},
    "ar": {"label": "Arabic", "native": "العربية", "prompt": "Modern Standard Arabic", "tts": "ar-001", "rtl": True},
}

def norm(code: str | None) -> str:
    return code if code in LANGS else "en"
