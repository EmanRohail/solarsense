# SolarSense

**A talking AI solar technician. Show your solar problem, hear what's wrong, in your language.**
Built for the Google Cloud AI Builder Cup 2026.

Rooftop solar is booming: about 282 GW of distributed solar was added worldwide in 2025. But when a system underperforms or
shows a fault, most owners can't tell what's wrong, what it's costing them, or whether it's safe.

SolarSense:

1. **Asks your language first:** English, Urdu, Hindi, Mandarin Chinese, Bahasa Indonesia or Arabic.
2. **Inspects a photo or video** of panels, the inverter screen or wiring. Gemini finds dust, shade, cracks, hotspots, burnt
   cables and error codes, **draws a box around each problem**, says where it is and how sure it is, and what to photograph next.
3. **Explains it out loud** when you tap play, with captions and a written card for each issue.
4. **Answers follow-up questions by voice.**
5. **Checks performance** from an inverter app screenshot against real local sunshine, and shows the **money lost per month
   in your currency**.
6. **Sends a report** to your installer on WhatsApp.

## Google Cloud

| Service | Role |
|---|---|
| **Gemini 2.5 Flash** | Vision and video inspection with boxes (structured JSON), screenshot reading, voice question understanding, explanations, interface translation |
| **Firebase AI Logic** | Calls Gemini from the app (Gemini Developer API); no keys in code. See `frontend/public/firebase-api.js` |
| **Gemini text-to-speech** | Spoken answers where available; the phone's own voice otherwise |
| **Cloud Firestore** | Inspections, follow-up Q&A, performance checks, cached sample results and translations (photos and videos are never stored) |
| **Firebase Hosting** | Mobile web app |
| **Cloud Run** *(optional)* | The same agents as a FastAPI backend (`backend/`), for projects with billing; `firebase.cloudrun.json` |

The live app runs on Firebase's free Spark plan: see [docs/DEPLOY_NO_CARD.md](docs/DEPLOY_NO_CARD.md).

Weather and place search: [Open-Meteo](https://open-meteo.com) (free, no key).

## Layout

```
backend/app/
  main.py          API: /inspect, /samples, /inspections/{id}/ask, /speak, /performance, /places, /languages, /ui
  gemini.py        Gemini agents: inspect, read_inverter, explain_performance, answer_question, speak, translate_ui
  solar.py         Expected output from real sunshine; money lost
  languages.py     The 6 languages and their voice codes
  store.py         Firestore (in-memory when running locally)
  sample_results.json  Offline results for the three samples (used only without Gemini)
frontend/public/   Web app (HTML, CSS, JS) and sample images
tools/evaluate.py  Accuracy check against labelled photos and screenshots
tests/             pytest (runs offline)
docs/              Deck builder, diagrams, deploy guide, submission kit
```

## Run locally

```bash
pip install -r backend/requirements.txt
export GEMINI_API_KEY=...        # free from https://aistudio.google.com; without it, samples use offline results
export USE_FIRESTORE=false
cd backend && uvicorn app.main:app --reload --port 8080
# open http://localhost:8080
```

Tests: `pip install pytest && pytest -q`. Deploy without a card: [docs/DEPLOY_NO_CARD.md](docs/DEPLOY_NO_CARD.md). With Cloud Run: [docs/DEPLOY.md](docs/DEPLOY.md).

## Safety

SolarSense gives guidance, not certified electrical inspection. Anything electrical or on a risky roof is always referred to a
technician. Sample images are illustrations.
