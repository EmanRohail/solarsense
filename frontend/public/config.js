// SolarSense runs in one of two modes:
//   "firebase"  - no-card version: Firebase Hosting + Firebase AI Logic (Gemini) + Firestore, all on the free Spark plan
//   "cloudrun"  - Cloud Run backend (needs a billing account); see firebase.cloudrun.json
window.SS_MODE = "firebase";

// Firebase web app config. This is a public identifier, not a secret: access is controlled by
// Firebase AI Logic and firestore.rules. Never put a Gemini API key in this file.
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBJhpiDfvDW7Aks_MsSDrtQu95dfvj3e6I",
  authDomain: "solarsense-6280c.firebaseapp.com",
  projectId: "solarsense-6280c",
  storageBucket: "solarsense-6280c.firebasestorage.app",
  messagingSenderId: "27982825642",
  appId: "1:27982825642:web:e1faa17f5a82aad95b28d3",
};

// Optional overrides if Google renames a model:
// window.SS_MODEL = "gemini-2.5-flash";
// window.SS_TTS_MODEL = "gemini-2.5-flash-preview-tts";

// Cloud Run mode only: leave empty to use the Firebase Hosting rewrite, or put the Cloud Run URL here.
window.API_BASE = "";

window.SS_READY = new Promise((resolve) => (window.__ssReady = resolve));
