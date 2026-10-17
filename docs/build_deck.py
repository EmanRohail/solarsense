"""Fill the official AI Builder Cup template with SolarSense's content.

  python docs/build_deck.py        -> docs/SolarSense_AI_Builder_Cup_Deck.pptx

Edit TEAM and LINKS below, run tools/evaluate.py once the app is deployed (fills slide 11), rerun this script,
then export to PDF (PowerPoint: File > Export > PDF; or Google Slides: File > Download > PDF).
"""
from __future__ import annotations

import copy
import json
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

HERE = Path(__file__).resolve().parent
IMG = HERE / "images"
ROOT = HERE.parent

# ---------------- edit these ----------------
TEAM = {
    "name": "TechVerz",
    "leader": "Syed Mohammed Bin Khalid",
    "problem": "Sustainability & Social Impact",
}
LINKS = {
    "GitHub Public Repository": "https://github.com/EmanRohail/solarsense",
    "Demo Video Link (3 Minutes)": "https://youtu.be/YOUR-VIDEO-ID",
    "Final Product Link": "https://solarsense-6280c.web.app",
}
# ---------------------------------------------

INK = RGBColor(0x39, 0x25, 0x6F)      # deep indigo
SOFT = RGBColor(0x64, 0x70, 0x8A)    # muted slate
SUN = RGBColor(0x74, 0x53, 0xD6)       # violet for headings and highlights
SUN_BG = RGBColor(0xE9, 0xE1, 0xFF)    # soft lilac
BLUE = RGBColor(0x74, 0x53, 0xD6)
BLUE_BG = RGBColor(0xF6, 0xF3, 0xFF)   # lavender mist
WASH = RGBColor(0xF6, 0xF3, 0xFF)    # lavender mist
RULE = RGBColor(0xE4, 0xDD, 0xF7)
PENDING = RGBColor(0xE9, 0xE1, 0xFF)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GOLD_TEXT = RGBColor(0x39, 0x25, 0x6F)  # key figures in deep indigo
FONT = "Arial"

TOP = 1.12
LEFT = 0.38
WIDTH = 9.24
BOTTOM = 5.4

def text(slide, x, y, w, h, paras, anchor=MSO_ANCHOR.TOP, fill=None, line=None, margin=0.0, name=None, shape=MSO_SHAPE.RECTANGLE):
    """paras: list of (text|list[runs], size, bold, color, space_after_pt). runs: (text, bold, color)."""
    if fill is None and line is None:
        box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    else:
        box = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
        if shape == MSO_SHAPE.ROUNDED_RECTANGLE:
            box.adjustments[0] = 0.08
        box.shadow.inherit = False
        if fill:
            box.fill.solid(); box.fill.fore_color.rgb = fill
        else:
            box.fill.background()
        if line:
            box.line.color.rgb = line; box.line.width = Pt(1.25)
        else:
            box.line.fill.background()
    if name:
        box.name = name
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    for side in ("left", "right", "top", "bottom"):
        setattr(tf, f"margin_{side}", Inches(margin))
    first = True
    for p in paras:
        content, size, bold, color, after = (list(p) + [None] * 5)[:5]
        para = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        para.alignment = PP_ALIGN.LEFT
        para.space_after = Pt(after if after is not None else 4)
        runs = content if isinstance(content, list) else [(content, bold, color)]
        for rt, rb, rc in runs:
            r = para.add_run()
            r.text = rt
            r.font.size = Pt(size); r.font.bold = bool(rb); r.font.name = FONT
            r.font.color.rgb = rc or INK
    return box


def picture(slide, path, x, y, w=None, h=None, border=True):
    pic = slide.shapes.add_picture(str(path), Inches(x), Inches(y), Inches(w) if w else None, Inches(h) if h else None)
    if border:
        pic.line.color.rgb = RULE; pic.line.width = Pt(1)
    return pic


def fit_picture(slide, path, x, y, max_w, max_h, border=True):
    from PIL import Image
    iw, ih = Image.open(path).size
    scale = min(max_w / iw, max_h / ih)
    w, h = iw * scale, ih * scale
    return picture(slide, path, x + (max_w - w) / 2, y, w, h, border)


def set_title_only(slide, keep_first_n_paras=1):
    """Template title boxes sometimes contain prompt bullets; keep only the heading paragraph."""
    for sh in slide.shapes:
        if sh.has_text_frame and sh.text_frame.text.strip():
            ps = sh.text_frame.paragraphs
            for p in ps[keep_first_n_paras:]:
                p._p.getparent().remove(p._p)
            for r in ps[0].runs:
                r.font.bold = True
            sh.height = Emu(500000)
            return sh


def delete_slide(prs, index):
    sldIdLst = prs.slides._sldIdLst
    sid = sldIdLst[index]
    prs.part.drop_rel(sid.rId)
    sldIdLst.remove(sid)




def cards(slide, items, y=TOP + 0.05, h=3.25, cols=3, fill=WASH, head_color=SUN, size=11):
    cw = (WIDTH - 0.2 * (cols - 1)) / cols
    for i, (head, lines) in enumerate(items):
        x = LEFT + (i % cols) * (cw + 0.2)
        yy = y + (i // cols) * (h + 0.15)
        f = fill[i] if isinstance(fill, list) else fill
        text(slide, x, yy, cw, h, [(head, 14, True, head_color, 8)] + [(t, size, False, INK, 7) for t in lines],
             fill=f, margin=0.16, shape=MSO_SHAPE.ROUNDED_RECTANGLE)


def table(slide, rows, widths, y=TOP, row_h=0.42, sizes=(10.5, 10), bold_col=1, pending_word=None):
    tbl = slide.shapes.add_table(len(rows), len(widths), Inches(LEFT), Inches(y), Inches(sum(widths)), Inches(row_h * len(rows))).table
    for c, w in enumerate(widths):
        tbl.columns[c].width = Inches(w)
    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            cell = tbl.cell(r, c)
            pend = pending_word and val == pending_word
            cell.fill.solid()
            cell.fill.fore_color.rgb = INK if r == 0 else PENDING if pend else (WASH if r % 2 else WHITE)
            cell.margin_left = cell.margin_right = Inches(0.08)
            tf = cell.text_frame; tf.word_wrap = True
            p = tf.paragraphs[0]; p.text = ""
            run = p.add_run(); run.text = val
            run.font.size = Pt(sizes[0] if r == 0 else sizes[1]); run.font.name = FONT
            run.font.bold = r == 0 or (c == bold_col - 1 and bold_col > 0)
            run.font.color.rgb = WHITE if r == 0 else INK
    return tbl


def main():
    prs = Presentation(HERE / "template.pptx")
    S = prs.slides

    # ---- 1 Team details
    for sh in S[0].shapes:
        if sh.has_text_frame and "Team name" in sh.text_frame.text:
            for p in sh.text_frame.paragraphs:
                t = "".join(r.text for r in p.runs)
                for key, val in (("Team name", TEAM["name"]), ("Team leader name", TEAM["leader"]), ("Problem Statement", TEAM["problem"])):
                    if t.strip().startswith(key):
                        p._p.append(copy.deepcopy(p.runs[-1]._r))
                        p.runs[-1].text = val
                        p.runs[-1].font.bold = True

    S[0].shapes.add_picture(str(IMG / "wordmark.png"), Inches(6.75), Inches(3.3), Inches(2.9))

    # ---- 3 Brief about the idea
    s = S[2]; set_title_only(s)
    text(s, LEFT, TOP, 4.55, 4.2, [
        ("SolarSense is a talking AI solar technician.", 17, True, INK, 8),
        ("Rooftop solar is everywhere now: 282 GW of distributed solar was added worldwide in 2025, 41% of all new solar, on homes, "
         "shops, farms and factories. But when a system underperforms or shows a fault, its owner usually can't tell what's wrong, "
         "how much it's costing them or whether it's safe.", 11.5, False, SOFT, 10),
        ("Show it. Hear what's wrong.", 14, True, INK, 4),
        ("The owner picks their language, then photographs the panels, inverter screen or wiring (up to 4 photos). Gemini diagnoses it "
         "like a senior technician, boxes each problem, gives the evidence and the risk, and explains it out loud and in writing in "
         "English, Urdu, Hindi, Chinese, Indonesian or Arabic. A screenshot of the inverter app shows how much money the system is "
         "losing each month, in the owner's currency, and why.", 11.5, False, SOFT, 10),
        ([("Track: ", True, SUN), ("Sustainability & Social Impact. ", False, INK), ("For: ", True, SUN),
          ("home and small-business solar owners, and the installers who serve them.", False, INK)], 11, False, INK, 0),
    ])
    fit_picture(s, IMG / "shot_result.png", 5.1, TOP + 0.1, 4.5, 4.1)

    # ---- 4 Opportunities
    s = S[3]; set_title_only(s)
    cards(s, [
        ("How is it different?", [
            "Inverter apps show numbers, not answers: no verdict, no cause, no comparison with the weather, mostly English.",
            "AI monitoring platforms exist for solar companies and need data connections, not for an owner with a phone.",
            "SolarSense needs only a phone camera and works in the owner's own language.",
        ]),
        ("How does it solve the problem?", [
            "Gemini inspects up to 4 photos together, finds dust, shade, cracks, hotspots, burnt cables and error codes, and marks them.",
            "It speaks the diagnosis and shows it as text, with safe steps and a clear 'call a technician' when needed.",
            "Real local sunshine turns an app screenshot into money lost per month.",
        ]),
        ("USP", [
            "Show it, hear it: a voice agent you can talk back to.",
            "6 languages incl. Urdu and Arabic, chosen on the very first screen.",
            "Problems boxed on your own photo.",
            "Loss shown in your own currency.",
            "Safety first: risky jobs always go to a technician.",
            "A PDF report the technician can act on.",
        ]),
    ], fill=[BLUE_BG, BLUE_BG, SUN_BG], h=3.4)

    # ---- 5 Features
    s = S[4]; set_title_only(s)
    feats = [
        ("Language first", "English, Urdu, Hindi, Chinese, Indonesian or Arabic; the whole app, answers, voice and captions follow it."),
        ("Expert inspection", "Up to 4 photos from the camera or gallery; each problem gets location, evidence, cause, risk and confidence."),
        ("Problems marked on the photo", "Numbered boxes around each issue, with severity from minor to danger."),
        ("Voice plus text", "Tap to hear the diagnosis while captions follow, with a written card for each issue."),
        ("Ask by voice", "Ask a follow-up in any language; the answer looks at your photos and says what to check."),
        ("Performance check", "Inverter app screenshots plus location: actual vs expected output from real local sunshine."),
        ("Money lost and why", "Loss per month in your currency, with likely causes, the evidence and how to check each."),
        ("Technician report", "A PDF for the installer: findings, evidence, what to do; shared on WhatsApp in one tap."),
    ]
    cw, rh = (WIDTH - 0.2) / 2, 1.0
    for i, (h, d) in enumerate(feats):
        x = LEFT + (i % 2) * (cw + 0.2)
        y = TOP + (i // 2) * (rh + 0.06)
        dot = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x + 0.02), Inches(y + 0.08), Inches(0.26), Inches(0.26))
        dot.fill.solid(); dot.fill.fore_color.rgb = RGBColor(0x74, 0x53, 0xD6); dot.line.fill.background(); dot.shadow.inherit = False
        text(s, x + 0.42, y, cw - 0.45, rh, [(h, 13, True, INK, 2), (d, 10.5, False, SOFT, 0)])

    # ---- 6 Process flow
    s = S[5]; set_title_only(s)
    fit_picture(s, IMG / "workflow.png", LEFT, TOP + 0.1, WIDTH, 3.6, border=False)

    # ---- 7 Wireframes / mock
    s = S[6]; set_title_only(s)
    fit_picture(s, IMG / "shot_m_lang.png", LEFT, TOP, 1.9, 3.9)
    fit_picture(s, IMG / "shot_m_home.png", LEFT + 2.1, TOP, 1.9, 3.9)
    fit_picture(s, IMG / "shot_m_result.png", LEFT + 4.2, TOP, 1.9, 3.9)
    text(s, LEFT + 6.45, TOP + 0.1, 2.8, 3.9, [
        ("Built for a phone", 14, True, INK, 8),
        ("1. Pick a language. Everything after this uses it.", 11, False, INK, 8),
        ("2. Take or upload up to 4 photos, or try a sample.", 11, False, INK, 8),
        ("3. See the problem boxed, hear the explanation, read the captions and issue cards, then ask a follow-up by voice.", 11, False, INK, 8),
        ("Urdu and Arabic read right to left.", 10.5, False, SOFT, 0),
    ])

    # ---- 8 Architecture
    s = S[7]; set_title_only(s)
    fit_picture(s, IMG / "architecture.png", LEFT, TOP + 0.05, WIDTH, 3.9, border=False)

    # ---- 9 Technologies
    s = S[8]; set_title_only(s)
    table(s, [
        ("Layer", "Technology", "How SolarSense uses it"),
        ("AI: seeing", "Gemini 2.5 Flash", "Technician-grade diagnosis of up to 4 photos: boxes, severity, evidence, cause and risk as structured JSON"),
        ("AI: reading", "Gemini 2.5 Flash", "Reads any inverter app screenshot (kWh, kW, fault codes) and finds the cause of low output from the pattern"),
        ("AI: listening", "Gemini 2.5 Flash", "Understands typed or spoken follow-up questions in any language, and looks at the photos to answer"),
        ("AI access", "Firebase AI Logic", "Calls Gemini securely from the app with no API keys in code; rotates to back-up models if one is busy"),
        ("Database", "Cloud Firestore", "Reports and follow-up Q&A, protected by security rules; photos are never stored"),
        ("Frontend", "Firebase Hosting", "Mobile web app with camera, microphone, voice and PDF reports; 6 languages built in"),
        ("Data", "Open-Meteo, OpenStreetMap", "Real daily sunshine and city search for any location in the world"),
    ], (1.25, 2.3, WIDTH - 3.55), row_h=0.44, bold_col=2)

    # ---- 10 Estimated cost
    s = S[9]; set_title_only(s)
    stats = [("$0", "to build and run the prototype: Firebase Spark plan, Gemini free tier, free weather and map data"),
             ("< 1 cent", "Gemini cost per photo check on paid usage (Gemini 2.5 Flash list prices)"),
             ("1 request", "per check, however many photos; samples and maths need no AI at all")]
    for i, (big, lab) in enumerate(stats):
        x = LEFT + i * (WIDTH / 3)
        text(s, x, TOP + 0.1, WIDTH / 3 - 0.2, 1.7, [(big, 32, True, GOLD_TEXT, 4), (lab, 11, False, SOFT, 0)])
    text(s, LEFT, TOP + 2.1, WIDTH, 2.0, [
        ("Business model", 14, True, INK, 4),
        ("Free for owners. Installers and solar companies pay a small monthly fee to receive SolarSense reports from their customers "
         "before a visit, which saves wasted trips. Panel and inverter brands could offer it to customers as a support channel.", 11.5, False, INK, 8),
        ("Estimates use Gemini 2.5 Flash list prices ($0.30 per million input tokens, $2.50 per million output tokens) and the "
         "free tiers of Firebase Hosting and Firestore. Verify against current pricing.", 9.5, False, SOFT, 0),
    ])

    # ---- 11 Snapshots
    s = S[10]; set_title_only(s)
    fit_picture(s, IMG / "shot_result.png", LEFT, TOP, 4.55, 2.6)
    fit_picture(s, IMG / "shot_urdu.png", LEFT + 4.7, TOP, 4.55, 2.6)
    fit_picture(s, IMG / "shot_perf.png", LEFT + 1.2, TOP + 2.75, 6.8, 1.4)

    # ---- 12 Benchmark
    s = S[11]; set_title_only(s)
    table(s, [
        ("Check", "Result", "How it's checked"),
        ("Automated tests", "4 of 4 passing", "pytest: languages, money maths, sample results, API flow"),
        ("End-to-end browser tests", "All passing", "Playwright: 6 languages, samples, camera, photo tray, PDF report, performance"),
        ("Languages", "6, fully translated", "Interface, diagnosis, answers, captions and PDF in each language; Urdu and Arabic right to left"),
        ("AI requests per check", "1 (samples: 0)", "Up to 4 photos or screenshots analysed in a single request"),
        ("Typical answer time", "about 8 to 15 s", "Fast model first, automatic switch to a back-up model if one is slow"),
        ("Safety rule", "Always enforced", "Isolators, breakers and anything electrical on a damaged system go to a technician"),
        ("Free-tier resilience", "6 models rotated", "If one model's daily allowance is used, the next one answers"),
    ], (3.0, 1.9, WIDTH - 4.9), row_h=0.42, bold_col=1)

    # ---- 13 Future development
    s = S[12]; set_title_only(s)
    cards(s, [
        ("Next 3 months", ["Accuracy test on real rooftop photos, reviewed by solar technicians",
                           "Live video mode with Gemini Live: point the camera and talk", "Pilot with installers in two countries"]),
        ("6 to 12 months", ["Connect inverter cloud accounts for automatic daily checks and alerts",
                            "Installer dashboard to receive reports and book visits", "Thermal photo support for hotspots"]),
        ("Beyond", ["Warranty claim packs for panel and inverter brands",
                    "Fleet view for schools, clinics and small factories", "More languages and Android/iOS apps"]),
    ], h=3.0)

    # ---- 14 Links
    s = S[13]
    for sh in s.shapes:
        if sh.has_text_frame and "Provide links" in sh.text_frame.text:
            for p in sh.text_frame.paragraphs:
                t = "".join(r.text for r in p.runs).strip()
                if t in LINKS:
                    for _ in range(2):
                        p._p.append(copy.deepcopy(p.runs[-1]._r))
                    p.runs[-2].text = ": "
                    p.runs[-1].text = LINKS[t]
                    p.runs[-1].font.bold = True
                    p.runs[-1].hyperlink.address = LINKS[t]
    text(s, LEFT, 2.6, WIDTH, 0.9, [
        ("The live app includes three sample photos and a sample inverter screenshot, so judges can try every feature without a solar system.", 11, False, SOFT, 0)])

    # ---- 15 Impact (blank template slide)
    s = S[14]
    t = text(s, 0.39, 0.76, 9, 0.4, [("Impact", 16, True, RGBColor(0, 0, 0), 0)])
    for run in t.text_frame.paragraphs[0].runs:
        run.font.name = "Google Sans Flex Medium"
    stats = [("282 GW", "of rooftop and other distributed solar added worldwide in 2025, 41% of all new solar"),
             ("100M+", "households expected to rely on rooftop solar by 2030, up from about 25 million (IEA)"),
             ("6", "languages, including Urdu and Arabic, so owners hear the answer in the language they think in")]
    for i, (big, lab) in enumerate(stats):
        x = LEFT + i * (WIDTH / 3)
        text(s, x, TOP + 0.1, WIDTH / 3 - 0.25, 1.7, [(big, 32, True, GOLD_TEXT, 4), (lab, 11, False, SOFT, 0)])
    text(s, LEFT, TOP + 2.1, WIDTH, 2.0, [
        ("Who benefits", 14, True, INK, 6),
        ([("Owners: ", True, INK), ("protect a big investment, cut wasted power and avoid unsafe repairs.", False, SOFT)], 11.5, False, INK, 5),
        ([("Installers: ", True, INK), ("arrive knowing the problem, with photos and error codes in hand.", False, SOFT)], 11.5, False, INK, 5),
        ([("The planet: ", True, INK), ("every rooftop system kept healthy is more clean energy actually produced.", False, SOFT)], 11.5, False, INK, 0),
    ])
    text(s, LEFT, 4.75, WIDTH, 0.3, [("Sources: IEA PVPS via TaiyangNews (2026); IEA (2022).", 8.5, False, SOFT, 0)])

    delete_slide(prs, 1)  # the "please download this template" instruction slide
    out = HERE / "SolarSense_AI_Builder_Cup_Deck.pptx"
    prs.save(out)
    print("wrote", out)


if __name__ == "__main__":
    main()
