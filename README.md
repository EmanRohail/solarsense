# SolarSense

**A talking AI solar technician. Show your solar problem, hear what's wrong, in your language.**
Built for the Google Cloud AI Builder Cup 2026 by team TechVerz.

**Live app:** https://solarsense-6280c.web.app

Rooftop solar is booming: about 282 GW of distributed solar was added worldwide in 2025. But when a system underperforms or
shows a fault, most owners can't tell what's wrong, what it's costing them, or whether it's safe.

## What it does

1. **Asks your language first:** English, اردو (Urdu), हिन्दी (Hindi), 中文 (Chinese), Bahasa Indonesia or العربية (Arabic).
   Urdu and Arabic read right to left.
2. **Inspects up to 4 photos** of the panels, inverter screen and wiring, from the camera or gallery. Gemini diagnoses them like a
   senior technician: dust, shade, cracks, hotspots, burnt cables and connectors, fault codes. Each problem is **boxed and numbered**
   on the photo, with where it is, the evidence, the likely cause, the risk if ignored and how sure it is.
3. **Explains it out loud** when you tap play, with captions and a written card for each issue. Safe steps are split from jobs
   that need a technician; anything electrical on a damaged system always goes to a technician.
4. **Answers your questions** typed or spoken in any language, looking at your photos again.
5. **Makes a PDF report for the technician** (findings, evidence, what to do, photos) to download or share on WhatsApp.
6. **Checks performance** from inverter app screenshots (or numbers typed in) against real local sunshine, and shows the
   **money lost per month in your currency**, with the likely causes and how to check each one.

The three sample photos and the sample inverter screenshot work instantly, so every feature can be tried without a solar system.

## Google Cloud

| Service | Role |
|---|---|
| **Gemini 2.5 Flash** | Photo diagnosis with boxes (structured JSON), inverter screenshot reading, understanding spoken questions, performance analysis |
| **Firebase AI Logic** | Calls Gemini securely from the app (Gemini Developer API) with no keys in code; switches to backup models if one is busy |
| **Cloud Firestore** | Saves inspection reports, chat answers and performance checks, protected by security rules (photos are never stored) |
| **Firebase Hosting** | Serves the mobile web app |

Also used: [Open-Meteo](https://open-meteo.com) for daily sunshine and city search, OpenStreetMap for smaller places (both free,
no key). Voice uses the device's own speech, with a web voice for languages the device doesn't have.

**One AI request per check**, however many photos. The samples, the money maths and numbers typed in by hand need no AI at all.

## Layout

```
frontend/public/
  index.html, style.css   The app (mobile first)
  app.js                  Screens, camera, voice, captions, PDF report
  firebase-api.js         Gemini agents through Firebase AI Logic, Firestore, sunshine maths
  i18n.js                 Interface text in all six languages
  samples/                Sample photos, screenshot and their stored results
firestore.rules           Database security rules
docs/                     Deck, diagrams, deploy guides, submission kit
backend/, tests/          Python version of the same agents (see below) and its tests
```

## Run and deploy

The app is static files plus Firebase. To deploy your own copy, see [docs/DEPLOY_NO_CARD.md](docs/DEPLOY_NO_CARD.md)
(Firebase Spark plan, no billing account needed):

```
firebase deploy --only hosting,firestore:rules
```

**Also in the repo:** a Python (FastAPI) version of the same agents in `backend/`, ready for Cloud Run on a project with billing.
See [docs/DEPLOY.md](docs/DEPLOY.md). Tests: `pip install -r backend/requirements.txt pytest && pytest -q`.

## Safety

SolarSense gives guidance, not a certified electrical inspection. Anything electrical, inside the inverter or on a risky roof is
always referred to a technician. Sample images are illustrations.
