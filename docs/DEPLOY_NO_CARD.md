# Deploy SolarSense with no card (Firebase Spark plan)

Everything runs on Firebase's free Spark plan. No billing account and no card are needed.

- **Firebase Hosting** serves the app
- **Firebase AI Logic** (Gemini Developer API) runs Gemini. Firebase keeps the key, so no key is in the code
- **Cloud Firestore** stores reports, Q&A, cached sample results and translated interface text

The project is already set in `.firebaserc` (`solarsense-6280c`) and the web config in `frontend/public/config.js`.

## 1. In the Firebase console (once)

1. **AI services > AI Logic > Get started > Gemini Developer API.** Don't pick Vertex AI, which needs billing.
2. **Databases & Storage > Firestore Database > Create database.** Pick the location nearest you, then **production mode**.
3. Never click **Upgrade**. Stay on Spark.

## 2. On your laptop (once)

Install Node.js LTS from https://nodejs.org, then in a terminal:

```
npm install -g firebase-tools
firebase login
```

## 3. Deploy

Unzip `solarsense.zip`, open a terminal in the `solarsense` folder (the one with `firebase.json`), and run:

```
firebase deploy --only hosting,firestore:rules
```

Your link: **https://solarsense-6280c.web.app**

## 4. Warm up

Open the link, pick English, tap all three samples, then switch to Urdu and tap them again (plus any other languages you'll
show). The results are saved in Firestore, so judges get them instantly and you don't use up the free Gemini limit.

## Troubleshooting

Press F12 and open the Console tab to see errors.

| What you see | Fix |
|---|---|
| "Gemini isn't switched on for this Firebase project yet" | Step 1.1, then wait 2 minutes |
| "SolarSense is busy right now (free usage limit)" | Free Gemini limit hit. Wait a minute; avoid testing many uploads in a row |
| Voice label says "Device voice" | Gemini's voice isn't available on the free tier, so the phone's voice is used. Text is always shown |
| No voice at all in a language | The phone has no voice for that language. Android: Settings > Text-to-speech > install the language |
| "Missing or insufficient permissions" in the console | Run step 3 again (it uploads `firestore.rules`) |
| A model "not found" error | Google renamed it. Set `window.SS_MODEL` in `config.js`, deploy again |
| Old version still showing | Hard refresh (Ctrl+Shift+R) |

## Optional: block other sites from using your Gemini quota

**Security > App Check > Register** the web app with reCAPTCHA Enterprise (free tier), then **AI Logic > Enforce**.
Do this only after everything works. If done wrong, the app stops calling Gemini.

## Cloud Run version

The Cloud Run backend (`backend/`, `Dockerfile`, `firebase.cloudrun.json`) is still in the repo for when a billing account is
available. Set `window.SS_MODE = "cloudrun"` in `config.js` and follow `docs/DEPLOY.md`
(`firebase deploy --config firebase.cloudrun.json`).
