# Deploying SolarSense for free (about 30 minutes)

Everything here stays at **zero cost**: the Google Cloud free trial ($300 credit for new accounts, never charged unless you
click "Upgrade"), a free Gemini API key from Google AI Studio, and free weather data from Open-Meteo.

You need a Google account and a laptop. Google asks for a card to verify the free trial; it only places a temporary hold.
Only one person on the team needs to do this.

## 1. Install the tools (once)

- Google Cloud CLI: https://cloud.google.com/sdk/docs/install
- Node.js 20+: https://nodejs.org, then `npm install -g firebase-tools`
- Sign in:

```bash
gcloud auth login
firebase login
```

## 2. Get a free Gemini API key

Go to https://aistudio.google.com, sign in, click **Get API key**, then **Create API key**. Copy it. No card is needed.

Use only the sample files or photos you have permission to use: on the free tier Google may use inputs to improve its products.

## 3. Create the Google Cloud project

```bash
export PROJECT_ID=solarsense-$RANDOM          # any unique lowercase name
gcloud projects create $PROJECT_ID
gcloud config set project $PROJECT_ID
```

Start the free trial and link billing: https://console.cloud.google.com/billing (choose the free trial account for this project).
Then add a budget alert: Billing > Budgets & alerts > Create budget > $5.

## 4. Turn on the services

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com firebasehosting.googleapis.com
gcloud firestore databases create --location=us-central1 --type=firestore-native
```

## 5. Let Cloud Run use Firestore

```bash
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com --role=roles/datastore.user
```

## 6. Deploy the backend to Cloud Run

From the repository folder (the one with the `Dockerfile`):

```bash
gcloud run deploy solarsense-api --source . --region us-central1 --allow-unauthenticated \
  --min-instances 0 --max-instances 2 --memory 1Gi --timeout 300 \
  --set-env-vars GEMINI_API_KEY=PASTE_YOUR_KEY,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GEMINI_MODEL=gemini-2.5-flash
```

Open the URL it prints and add `/api/health`. You should see `"gemini": true` and `"store": "firestore"`.

If the voice doesn't play, the text-to-speech model name may have changed. Check the current name at
https://ai.google.dev/gemini-api/docs/speech-generation and redeploy with `TTS_MODEL=that-name` added to `--set-env-vars`.
The app falls back to the phone's own voice when the server voice isn't available.

## 7. Deploy the frontend to Firebase Hosting

```bash
firebase projects:addfirebase $PROJECT_ID
sed -i.bak "s/YOUR-GCP-PROJECT-ID/$PROJECT_ID/" .firebaserc
firebase deploy --only hosting,firestore:rules
```

If Firebase asks you to upgrade to the Blaze plan to connect Hosting to Cloud Run, accept: it uses the same free-trial billing
account and stays at $0 at this usage.

Your app is at `https://$PROJECT_ID.web.app`. That is your **Prototype Link**.

**Videos:** requests through Firebase Hosting time out after about a minute. If a long video fails, put your Cloud Run URL in
`frontend/public/config.js` (`window.API_BASE = "https://solarsense-api-....run.app";`) and run `firebase deploy --only hosting` again.

## 8. Warm up the samples

Open the app, choose a few languages, and click each sample once. Results are saved in Firestore, so judges get them instantly.

## 9. Evaluate and refill the deck

```bash
pip install -r backend/requirements.txt
export GEMINI_API_KEY=PASTE_YOUR_KEY
python tools/evaluate.py          # writes data/eval_report.md and .json
python docs/build_deck.py         # refills slide 11
```

## 10. Push to GitHub

```bash
git init && git add . && git commit -m "SolarSense: AI Builder Cup submission"
gh repo create solarsense --public --source . --push     # or create the repo on github.com and push
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `"gemini": false` | The API key wasn't set; rerun step 6 |
| `"store": "memory"` | Firestore database missing (step 4) or permission missing (step 5) |
| "Too many requests" from Gemini | Free-tier limit reached; wait a minute, or spread testing over the day |
| Mic doesn't work | The site must be opened over https (the .web.app link is); allow microphone access in the browser |
| Samples load on Cloud Run but not on Firebase | The Cloud Run service must be named `solarsense-api` in `us-central1`, as in `firebase.json` |
