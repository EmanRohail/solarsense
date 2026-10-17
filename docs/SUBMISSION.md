# SolarSense: AI Builder Cup submission kit

**Deadline:** Sunday 18 October 2026, 11:29 PM IST (10:59 PM Pakistan time). Aim to submit by Saturday.

---

## 1. Form answers

**Challenges:** Sustainability & Social Impact *(confirm with Syed)*

**Prototype Link Deployed on GCP or Cloud Run:** `https://solarsense-6280c.web.app`

**Final Prototype PPT/Deck converted into PDF:** `SolarSense_AI_Builder_Cup_Deck.pdf` (about 1.7 MB, limit is 5 MB)

**GitHub Repository Link (Public Access):** `https://github.com/EmanRohail/solarsense`

**Demo Video Link (up to 3 minutes):** `https://youtu.be/YOUR-VIDEO-ID` (YouTube, set to **Unlisted**)

**Brief Description** (984 characters; the form allows 1,024):

```
SolarSense is a talking AI solar technician for the world's rooftop solar owners. The user picks English, Urdu, Hindi, Chinese, Indonesian or Arabic, then photographs their panels, inverter screen or wiring (up to 4 photos). Gemini 2.5 Flash diagnoses them like a senior technician: it finds dust, shade, cracks, hotspots, burnt cables and fault codes, boxes each problem and returns severity, evidence, cause, risk and safe steps as structured JSON, read out loud with captions. Owners ask follow-ups by voice, and get a PDF report for their technician on WhatsApp. A performance check reads inverter app screenshots with Gemini, compares output with real local sunshine, and shows money lost per month in the user's currency, with likely causes and how to check them. Firebase AI Logic calls Gemini securely with no keys in code, Firestore stores reports and Q&A (photos are never stored), and Firebase Hosting serves the mobile web app. A Cloud Run backend is included in the repo.
```

---

## 2. Demo video script (target 2:50)

Record the **deployed** app (footer shows the latest version) as a phone screen recording, or in a phone-sized browser window.
Speak slowly; 2:50 is about 380 words. Do the real-photo parts first while the AI allowance is fresh.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:15 | Language screen | "Over 280 gigawatts of rooftop and small solar were added worldwide last year. But when a system breaks or underperforms, most owners can't tell what's wrong. SolarSense is a talking AI solar technician. First, it asks your language." |
| 0:15–0:25 | Tap English, tap **Take a photo**, camera opens | "I just point my camera at the problem. I can take up to four photos: the panels, the inverter screen, the wiring." |
| 0:25–0:55 | Upload or shoot a **real panel photo** (+ inverter photo), tap **Check these photos** | "Gemini inspects them together, like a senior technician. Every problem is boxed and numbered, with where it is, the evidence it saw, the likely cause and what happens if I ignore it." |
| 0:55–1:10 | Tap ▶ on the voice bar | "And it tells me out loud, while the captions follow along." *(let it play about 8 seconds)* |
| 1:10–1:25 | Scroll "What to do" | "Steps are split into what I can safely do and what needs a technician. Anything electrical on a damaged system always goes to a technician." |
| 1:25–1:45 | Type or say a follow-up: "Why is this happening and what should I check?" | "I can ask a follow-up by voice. It looks at my photos again and tells me what to check." |
| 1:45–2:05 | Switch to **اردو**, tap the **Inverter fault** sample, tap ▶ | "Now in Urdu. Here's an inverter showing fault F07. SolarSense explains the grid over-voltage, and warns me not to open the inverter." *(let the Urdu voice play about 6 seconds)* |
| 2:05–2:20 | Tap **Share report on WhatsApp** (or Download), show the PDF | "One tap makes a PDF report for the technician: findings, evidence and exactly what they should do." |
| 2:20–2:45 | **Check performance** → your inverter app screenshot (or the sample), type the city → **Check my system** | "The second agent checks performance. It reads my inverter app, compares it with the real sunshine where I live, and shows I'm losing this much every month, in my currency, and why." |
| 2:45–2:55 | Architecture slide | "It runs on Google Cloud: Gemini through Firebase AI Logic, Firestore and Firebase Hosting. SolarSense: show your solar problem, hear what's wrong." |

Upload to YouTube as **Unlisted**, then open the link in an incognito window to check it plays.

---

## 3. Checklist before submitting

- [ ] AI Logic (Gemini Developer API) and Firestore turned on; `firebase deploy --only hosting,firestore:rules` done
- [ ] Each sample works in English and at least one other language, with voice playing
- [ ] Uploading your own photo works; a 10-second video works
- [ ] The mic works on your phone (the browser asks for permission once)
- [ ] The performance check works with the sample screenshot and a place search
- [ ] Track confirmed with Syed; team name correct on slide 1
- [ ] Video link added on the links slide (send it to Claude, or edit the PPTX and export to PDF)
- [ ] Video under 3:00, Unlisted, plays in incognito
- [ ] GitHub repo is Public and the README shows
- [ ] Still on the Spark plan; never click "Upgrade"
- [ ] Don't redeploy after submitting until judging is over

---

## 4. Plan for the week

| Day | Do |
|---|---|
| Sun 11 | Create the Google Cloud project and AI Studio key (DEPLOY.md steps 1–5) |
| Mon 12 | Deploy (steps 6–8). Test on your phone in 3 languages |
| Tue 13 | Take real photos of rooftop systems (friends, family, with permission); add them to `data/eval/` |
| Wed 14 | Run `tools/evaluate.py`, retake screenshots, rebuild the deck. Push to GitHub |
| Thu 15 | Record the video |
| Fri 16 | Full checklist in incognito; ask a teammate to test on their phone |
| Sat 17 | Submit. Sunday is buffer only |
