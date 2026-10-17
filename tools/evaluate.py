"""Evaluate SolarSense against labelled photos and screenshots (needs Gemini).

Put test images in data/eval/ and describe them in data/eval/labels.json, for example:
  {"file": "my_roof_dust.jpg", "expect": ["dust", "bird"], "severity": "medium"}
  {"file": "inverter_app_2.png", "type": "screenshot", "today_kwh": 21.4, "month_kwh": 512, "capacity_kw": 8}

The three bundled samples are included automatically. Add real photos (with the owner's permission) to make the
results meaningful. Run from the repo root:
  GEMINI_API_KEY=... python tools/evaluate.py
Writes data/eval_report.md for slide 11 of the deck.
"""
from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app import gemini  # noqa: E402

SAMPLES = ROOT / "frontend" / "public" / "samples"
EVAL = ROOT / "data" / "eval"
MIME = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "mp4": "video/mp4", "mov": "video/quicktime"}

BUILTIN = [
    {"path": SAMPLES / "dusty_panels.jpg", "expect": ["dust", "bird", "shad"], "severity": "medium"},
    {"path": SAMPLES / "inverter_fault.jpg", "expect": ["f07", "voltage"], "severity": "high"},
    {"path": SAMPLES / "cracked_panel.jpg", "expect": ["crack", "hot|burn"], "severity": "danger"},
    {"path": SAMPLES / "inverter_app.png", "type": "screenshot", "today_kwh": 17.6, "month_kwh": 287.4, "capacity_kw": 10.0},
]
SEV = ["ok", "low", "medium", "high", "danger"]


def cases():
    out = list(BUILTIN)
    lab = EVAL / "labels.json"
    if lab.exists():
        for c in json.loads(lab.read_text()):
            c["path"] = EVAL / c.pop("file")
            out.append(c)
    return out


def hit(term: str, text: str) -> bool:
    return any(t in text for t in term.lower().split("|"))


def main() -> None:
    if not gemini.available():
        sys.exit("Set GEMINI_API_KEY (free from Google AI Studio) first.")
    rows, found, total, sev_ok, sev_n, num_ok, num_n, times, langs_ok = [], 0, 0, 0, 0, 0, 0, [], 0
    for c in cases():
        p = c["path"]
        mime = MIME[p.suffix.lstrip(".").lower()]
        t0 = time.perf_counter()
        if c.get("type") == "screenshot":
            r = gemini.read_inverter(p.read_bytes(), mime).model_dump()
            for k in ("today_kwh", "month_kwh", "capacity_kw"):
                if k in c:
                    num_n += 1
                    num_ok += r.get(k) is not None and abs(r[k] - c[k]) < 0.05 * max(1, c[k])
            rows.append(f"| {p.name} | screenshot | values read: {r.get('today_kwh')}, {r.get('month_kwh')}, {r.get('capacity_kw')} |")
        else:
            d = gemini.inspect(p.read_bytes(), mime, "en")
            text = json.dumps(d.model_dump()).lower()
            got = [e for e in c["expect"] if hit(e, text)]
            found += len(got); total += len(c["expect"])
            if "severity" in c:
                sev_n += 1
                sev_ok += abs(SEV.index(d.overall_severity) - SEV.index(c["severity"])) <= 1 if d.overall_severity in SEV else 0
            rows.append(f"| {p.name} | {len(got)}/{len(c['expect'])} issues | severity {d.overall_severity} (label {c.get('severity')}) |")
        times.append(time.perf_counter() - t0)
        print(rows[-1])
    # language check: Urdu and Japanese output for one photo
    for lang in ("ur", "ja"):
        d = gemini.inspect((SAMPLES / "dusty_panels.jpg").read_bytes(), "image/jpeg", lang)
        script = d.spoken_script
        langs_ok += any("؀" <= ch <= "ۿ" for ch in script) if lang == "ur" else any("぀" <= ch <= "ヿ" or "一" <= ch <= "鿿" for ch in script)
    report = [
        "# SolarSense evaluation", "",
        "| Metric | Result |", "|---|---|",
        f"| Issues found (recall on labelled issues) | {found}/{total} ({found / max(1, total):.0%}) |",
        f"| Severity within one level of label | {sev_ok}/{sev_n} |",
        f"| Screenshot numbers read correctly (±5%) | {num_ok}/{num_n} |",
        f"| Answers written in the chosen language (Urdu, Japanese) | {langs_ok}/2 |",
        f"| Median time per photo or screenshot | {statistics.median(times):.1f} s |",
        "", "| File | Result | Detail |", "|---|---|---|", *rows,
    ]
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "eval_report.md").write_text("\n".join(report) + "\n")
    json.dump({"recall": [found, total], "severity": [sev_ok, sev_n], "numbers": [num_ok, num_n], "languages": [langs_ok, 2],
               "median_s": round(statistics.median(times), 1)}, open(ROOT / "data" / "eval_report.json", "w"))
    print("\n".join(report))


if __name__ == "__main__":
    main()
