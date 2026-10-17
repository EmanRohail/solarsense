// SolarSense, no-card version: runs entirely on Firebase (Spark plan, no billing account).
// Gemini is called through Firebase AI Logic (Gemini Developer API), so no API key lives in this code.
// Firestore keeps reports, Q&A and cached sample results. Interface text is built in (i18n.js).
// app.js calls window.SS_READY -> handler(path, opts), using the same routes the Cloud Run API has.

const SDK = "https://www.gstatic.com/firebasejs/12.19.0";
// Each model has its own small free daily allowance, so SolarSense rotates through several.
// Order = speed with quality: 2.5 Flash without "thinking" is fast and strong; the Lite models are the quick back-ups.
const MODELS = [window.SS_MODEL, "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest",
  "gemini-3-flash-preview", "gemini-2.0-flash"].filter(Boolean);
const TTS_MODELS = [window.SS_TTS_MODEL, "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"].filter(Boolean);
const INLINE_LIMIT = 14 * 1024 * 1024; // Firebase AI Logic request limit is about 20 MB after base64

const LANG_NAME = {
  en: "simple English",
  ur: "Urdu in Urdu script (technical words like panel, inverter, wiring and MC4 may stay in English)",
  hi: "Hindi in Devanagari script (technical words like panel, inverter and MC4 may stay in English)",
  zh: "Simplified Chinese (Mandarin)",
  id: "Indonesian (Bahasa Indonesia)",
  ar: "Modern Standard Arabic",
};
const TTS_CODE = { en: "en-US", ur: "ur-PK", hi: "hi-IN", zh: "cmn-CN", id: "id-ID", ar: "ar-001" };
const ONE_LANG = (lang) => `Write every user-facing field entirely in ${lang}. Never switch to another language part-way through a field,
even if the photo, the screen text or the user's question is in another language. Error codes, brand names and units stay as they are.`;
const norm = (l) => (l in LANG_NAME ? l : "en");

class UserError extends Error { constructor(m, code) { super(m); this.user = true; this.code = code; } }
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

// ---------- Firebase ----------
let fb = null; // { ai, db, S (Schema), fs (firestore fns), getGenerativeModel }
async function loadFirebase() {
  const [{ initializeApp }, aiMod, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-ai.js`), import(`${SDK}/firebase-firestore.js`)]);
  const app = initializeApp(window.FIREBASE_CONFIG);
  const ai = aiMod.getAI(app, { backend: new aiMod.GoogleAIBackend() });
  let db = null;
  try { db = fs.getFirestore(app); } catch (e) { console.warn("Firestore unavailable", e); }
  return { ai, db, S: aiMod.Schema, fs, getGenerativeModel: aiMod.getGenerativeModel };
}

// ---------- schemas (same as backend/app/schemas.py) ----------
function schemas(S) {
  const str = (d) => S.string({ description: d });
  const action = S.object({ properties: {
    step: str("What to do, in the user's language, plain words"),
    who: str("'you' if a homeowner can do it safely, 'technician' otherwise") } });
  const issue = S.object({ properties: {
    title: str("Short name of the problem, in the user's language"),
    detail: str("One or two sentences on what you can see, in the user's language"),
    severity: str("One of: low, medium, high, danger"),
    likely_cause: str("Most likely cause, in the user's language"),
    image: S.integer({ description: "Which photo the problem is in: 1 for the first photo, 2 for the second, and so on" }),
    where: str("Where it is in the photo, in plain words (e.g. 'bottom-left panel, lower edge'), in the user's language"),
    evidence: str("The exact visual evidence: what you see, including any readings or text on a screen, in the user's language"),
    risk_if_ignored: str("What happens if this is not fixed (output loss, damage, fire or shock risk), one short sentence in the user's language"),
    confidence: str("How sure you are from what is visible: high, medium or low"),
    box_2d: S.array({ items: S.integer(), description: "REQUIRED: [ymin, xmin, ymax, xmax] on a 0-1000 scale of that photo, tightly around the problem. Use [0,0,0,0] only if the problem is not visible in any photo." }),
  }, optionalProperties: ["where", "evidence", "risk_if_ignored"] });
  return {
    diagnosis: S.object({ properties: {
      subject: str("What the media shows: panels, inverter, wiring, battery, mounting, meter, other, not_solar"),
      summary: str("One sentence verdict in the user's language"),
      overall_severity: str("One of: ok, low, medium, high, danger"),
      issues: S.array({ items: issue }),
      output_loss_low_pct: S.integer({ description: "Lower estimate of energy lost because of these issues, percent" }),
      output_loss_high_pct: S.integer({ description: "Upper estimate of energy lost, percent" }),
      actions: S.array({ items: action }),
      safety_warning: str("Only if there is an electrical or fall risk, in the user's language"),
      looks_ok: S.array({ items: S.string(), description: "Up to 3 short things you checked that look fine, in the user's language" }),
      next_photo: str("If one more photo would confirm or rule out a problem, what to photograph, in the user's language"),
      call_technician: S.boolean(),
      confidence: str("low, medium or high"),
      spoken_script: str("What the assistant says out loud: 30-45 seconds, warm and simple, in the user's language"),
    }, optionalProperties: ["output_loss_low_pct", "output_loss_high_pct", "safety_warning", "looks_ok", "next_photo"] }),
    reading: S.object({ properties: {
      is_inverter_app: S.boolean({ description: "False if the image is not an inverter/solar monitoring screen" }),
      brand: S.string(), capacity_kw: S.number({ description: "System/PV capacity in kW if shown" }),
      today_kwh: S.number(), month_kwh: S.number(),
      days_into_month: S.integer({ description: "If month_kwh is shown, how many days it covers, if inferable" }),
      daily: S.array({ items: S.object({ properties: { date: str("YYYY-MM-DD if visible, otherwise a label like 'today'"), kwh: S.number() } }),
        description: "Per-day energy values if a chart or list is visible" }),
      current_power_kw: S.number(), fault_codes: S.array({ items: S.string() }), notes: S.string(),
      likely_causes: S.array({ items: S.object({ properties: {
        cause: str("A likely reason for low output, user's language"),
        evidence: str("What in the readings or pattern points to it, user's language"),
        check: str("How to confirm or rule it out, user's language") } }),
        description: "Only if output looks low for the sunshine: the most likely reasons, most likely first" }),
      actions: S.array({ items: S.object({ properties: { step: str("What to do, user's language"), who: str("'you' or 'technician'") } }) }),
    }, optionalProperties: ["brand", "capacity_kw", "today_kwh", "month_kwh", "days_into_month", "daily", "current_power_kw", "fault_codes", "notes", "likely_causes", "actions"] }),
    explanation: S.object({ properties: {
      summary: str("One sentence verdict in the user's language"),
      likely_causes: S.array({ items: S.object({ properties: {
        cause: str("A likely reason for the gap, user's language"),
        evidence: str("What in the readings or pattern points to it, user's language"),
        check: str("How to confirm or rule it out, user's language") } }),
        description: "Empty if the system is healthy. Otherwise the most likely reasons for the gap, most likely first" }),
      actions: S.array({ items: action }),
      spoken_script: str("30-40 seconds spoken in the user's language, mention the money lost per month in the given currency"),
    } }),
    answer: S.object({ properties: {
      question_heard: str("The user's question as you understood it, in their language"),
      answer: str("Answer in the user's language, 4-8 short sentences: likely reasons, how to check each, what to do"),
      spoken_script: str("Same answer phrased for speaking aloud"),
    } }),
  };
}
let SCHEMA = null;

// ---------- Gemini calls ----------
function needAI() { if (!fb) throw new UserError("SolarSense couldn't load. Check your connection and refresh the page.", "net"); }
function friendly(e, msg, code = "ai") {
  console.error(e);
  if (e?.user) return e;
  const s = String(e?.message || e);
  if (/\b429\b|quota|RESOURCE_EXHAUSTED|rate limit/i.test(s)) return new UserError("SolarSense has used up its free AI allowance for now. The samples still work; try again in a few minutes.", "busy");
  if (/^timeout$/.test(s)) return new UserError("The AI took too long to answer. Try again.", "slow");
  if (/api-not-enabled|PERMISSION_DENIED|UNAUTHENTICATED|API key|App Check|\b40[13]\b/i.test(s)) return new UserError("Gemini isn't switched on for this Firebase project (Firebase AI Logic).", "setup");
  return new UserError(msg, code);
}
// Models that are used up today or don't exist are skipped (remembered for the rest of the day).
const today = () => new Date().toISOString().slice(0, 10);
const skip = (() => { try { const v = JSON.parse(localStorage.getItem("ss_skip")); return v?.day === today() ? v : { day: today(), m: {} }; } catch { return { day: today(), m: {} }; } })();
function markSkip(model) { skip.m[model] = 1; try { localStorage.setItem("ss_skip", JSON.stringify(skip)); } catch {} }
let lastGood = null;
// ms = how long to wait for one model before switching to the next; total = the most the user ever waits.
async function gemini(contents, schema, temperature = 0.2, json = true, think = 0, ms = 15000, strong = false, total = ms * 2, prefer = []) {
  needAI();
  // Diagnoses always start with the strongest fast model; quick answers start with the last model that worked.
  const order = [...new Set([...prefer, strong ? null : lastGood, ...MODELS].filter(Boolean))].filter((m) => !skip.m[m]);
  const list = order.length ? order : MODELS; // everything used up: try again anyway (limits may have reset)
  const started = Date.now();
  let last = new Error("timeout");
  for (const model of list) {
    const left = total - (Date.now() - started);
    if (left < 6000) break;
    try {
      const m = fb.getGenerativeModel(fb.ai, { model, generationConfig: {
        temperature, ...(json ? { responseMimeType: "application/json" } : {}), ...(schema ? { responseSchema: schema } : {}),
        ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: model.includes("lite") ? 0 : think } } : {}),
        ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}) } });
      const r = await withTimeout(m.generateContent(contents), Math.min(ms, left));
      lastGood = model;
      const text = r.response.text();
      return json ? JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) : text;
    } catch (e) {
      last = e;
      const msg = String(e?.message || e);
      console.warn("Gemini", model, msg.slice(0, 200));
      if (/\b(401|403)\b|API key|PERMISSION_DENIED|App Check/i.test(msg)) break; // access problem: other models won't help
      if (/\b(429|404)\b|quota|RESOURCE_EXHAUSTED|not found|not supported/i.test(msg)) markSkip(model);
      if (lastGood === model) lastGood = null;
    }
  }
  throw last;
}

// Shrink big photos before sending (faster, and kinder to the free allowance). Screenshots keep more detail.
async function shrink(blob, max) {
  if (!mimeOf(blob).startsWith("image") || /heic|heif|gif/.test(mimeOf(blob))) return blob;
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && blob.size < 1.5e6) return blob;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b || blob), "image/jpeg", 0.88));
  } catch { return blob; }
}
async function fileToPart(blob) {
  const data = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1]);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
  return { inlineData: { data, mimeType: mimeOf(blob) } };
}
const EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp" };
function mimeOf(f) {
  const t = (f.type || "").toLowerCase().split(";")[0];
  if (t) return t;
  return EXT[(f.name || "").toLowerCase().split(".").pop()] || "application/octet-stream";
}

const INSPECT_PROMPT = (n, lang) => `You are SolarSense, a senior rooftop-solar service technician (PV installer and inverter repair experience)
helping a home or small-business owner anywhere in the world. They sent ${n === 1 ? "one photo" : n + " photos of the same system, numbered 1 to " + n + " in the order given"}.
Diagnose it as carefully as you would on a paid site visit. Accuracy matters more than finding many problems.

METHOD
1. Identify each photo: panels, inverter hardware or its screen, wiring/DC isolator/combiner/DB box, battery, mounting, meter,
   a screenshot of the solar monitoring app, or not solar. Any mix is normal; analyse every photo and combine them into one diagnosis.
   For an app screenshot: read alarms, status (offline, fault, normal), today's/this month's energy and live power; flag zero or very
   low production in daylight, offline loggers and alarm codes, and cross-check with the hardware photos if both are present.
   Note the brand/model if visible. If photos show different parts, combine them into one diagnosis.
2. Scan systematically. Panels: every row, every panel edge to edge, the glass, cells, frame, junction box, cables under the panels.
   Inverter: read every word and number on the screen exactly (codes, PV voltage/current, grid voltage, frequency, temperature, power),
   LED colours, casing, vents, cable glands. Wiring: every connector, cable run, isolator, breaker, fuse, earth wire.
3. For each finding, check the evidence before reporting it, then reason from evidence to most likely cause to risk.
4. Use readings: grid voltage normal is about 220-240 V (or 110-127 V) within ±10%; frequency 50 or 60 Hz ±1%;
   PV voltage near 0 V in daylight means no DC input (isolator off, string fault, or inverter shut down); inverter temperature above about 70 °C is high.

WHAT TO LOOK FOR
Panels: dust, sand, pollen, bird droppings, moss, leaves; partial shade (trees, tanks, walls, chimneys, wires, other rows) and how many
cells it covers; cracked or shattered glass; micro-cracks and "snail trails" (thin dark lines across cells); hotspots and burn marks;
browning/yellowing (EVA discoloration); bubbles or delamination; one third of a panel darker or hotter (failed bypass diode);
backsheet cracks; burnt or swollen junction box; corroded or bent frames; loose, rusted or missing clamps; panels at different angles;
water pooling at the lower edge; vegetation touching panels.
Cables and DC side: melted, burnt, cracked or UV-damaged insulation; loose or mismatched MC4 connectors (different brands mated);
cables lying on the roof, hanging, or rubbing on sharp edges; no conduit; scorch marks on isolators, combiner or DB boxes; missing earthing.
Inverter alarms (names vary by brand; match the meaning):
- Grid over/under voltage or frequency, "No grid", "AC lost", islanding: a grid-side problem; the inverter disconnects to protect itself.
  If frequent, the grid voltage setting or the AC cable size needs checking and the utility should be told.
- PV isolation fault, "Riso low", insulation resistance low, earth/ground fault, GFCI or residual current fault: damp, damaged or pinched
  DC cable or connector, or water in a junction box. Shock risk; technician only. Often worse in the morning or after rain.
- PV over voltage: too many panels in series for the inverter (cold mornings make it worse). Can destroy the inverter; technician.
- PV reverse polarity, string current low or zero on one string: wiring fault, blown string fuse, disconnected or failed string.
- Bus over voltage, DC bus fault, relay check fail, internal or hardware fault, "Error 3xx/4xx" style codes: internal inverter problem; service.
- Over temperature, fan fault, derating: blocked vents, direct sun on the inverter, dust in the fan, poor airflow.
- Arc fault (AFCI): loose or burnt DC connector. Fire risk; danger.
- Battery low, BMS communication, battery over-temperature or over-current: battery or its cable/settings.
- Meter, CT or communication fault; Wi-Fi or data logger offline: monitoring or export control only; panels may still be producing.
If a code is shown, say what it means for this owner, how serious it is, and the safe next step. Do not invent codes that are not visible.

RULES
- ${ONE_LANG(lang)}
- Only report what the photos show. Never invent problems. If everything looks fine, return no issues and say the system looks healthy.
  If a photo is dark, blurry, too far, or not solar, say so and use next_photo to say exactly what to photograph.
- For every issue: image (which photo), where (position in plain words), evidence (what exactly you see or read), likely_cause,
  risk_if_ignored, confidence (high = clearly visible, medium = likely but partly hidden or small, low = possible, needs a closer look).
- box_2d is REQUIRED for every issue you can see: [ymin, xmin, ymax, xmax] on a 0-1000 scale of that photo, tight around the
  problem (for an inverter code, box the screen text; for an alarm in an app screenshot, box the alarm). The app draws these boxes.
- Severity: danger = fire or electric-shock risk (burn marks, melted connectors, arc fault, isolation/earth fault, exposed live wires,
  swollen battery); high = large output loss or damage that will get worse (cracked glass, hotspot, fault stopping production,
  failed string); medium = clear output loss (heavy dust, shading, derating); low = minor or cosmetic.
- Order issues from most to least serious. Merge duplicates (the same dust on many panels is one issue).
- Safety: owners may only do safe things themselves: look, read the screen, note times, take photos, clean from the ground or with safe
  access early morning or evening with plain water and a soft brush (no detergent, no pressure washer, never on a hot or wet roof),
  switch off following the inverter's shutdown order only if the manual says so. Anything electrical, inside the inverter, or on a
  risky roof is for a technician. Cracked, burnt or arc-fault parts: do not touch or wash.
  When there is damage, burning, arcing, water ingress or an isolation/earth fault, operating DC isolators, AC breakers or switches is a
  technician action (who = technician): DC isolators can arc under load. The owner's action is to keep people away, not touch anything,
  and call a technician or, if there is smoke or fire, the fire service.
- Estimate the output loss range in percent only if you reasonably can.
- looks_ok: up to 3 short things you checked that look fine.
- Be concise so the owner gets the answer fast: summary one sentence; detail, evidence, likely_cause and risk_if_ignored one short
  sentence each; at most 5 issues (merge similar ones) and at most 5 actions.
- spoken_script: talk to the owner like a kind expert neighbour, 20-30 seconds, entirely in ${lang}. Start with the verdict, then the
  main problem and what it means, then what to do first. No lists, no markdown, no emojis.`;

function cleanDiagnosis(d) {
  const rank = { danger: 4, high: 3, medium: 2, low: 1 };
  const box = (b) => {
    if (!Array.isArray(b) || b.length !== 4) return null;
    let n = b.map(Number);
    if (n.some((v) => !Number.isFinite(v))) return null;
    if (n.every((v) => v <= 1)) n = n.map((v) => v * 1000); // some answers use a 0-1 scale
    let [y0, x0, y1, x1] = n.map((v) => Math.max(0, Math.min(1000, Math.round(v))));
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (x1 < x0) [x0, x1] = [x1, x0];
    return y1 - y0 >= 8 && x1 - x0 >= 8 ? [y0, x0, y1, x1] : null; // drop empty or invalid boxes
  };
  d.issues = (d.issues || []).map((i) => ({ ...i,
    severity: i.severity in rank ? i.severity : "medium",
    confidence: ["high", "medium", "low"].includes(i.confidence) ? i.confidence : "medium",
    box_2d: box(i.box_2d) })).sort((a, b) => rank[b.severity] - rank[a.severity]);
  d.actions = (d.actions || []).map((a) => ({ step: a.step, who: a.who === "you" ? "you" : "technician" }));
  // Safety net: on a dangerous or seriously damaged system, switching isolators/breakers is never a do-it-yourself step.
  if (["danger", "high"].includes(d.overall_severity) || d.issues.some((i) => i.severity === "danger"))
    d.actions.forEach((a) => { if (/isolat|breaker|switch(?:es)? off|shut ?down|disconnect|turn off|MCB|DC switch/i.test(a.step)) a.who = "technician"; });
  d.looks_ok = (d.looks_ok || []).filter(Boolean).slice(0, 3);
  for (const k of ["output_loss_low_pct", "output_loss_high_pct", "safety_warning", "next_photo"]) if (d[k] === undefined || d[k] === "") d[k] = null;
  return d;
}
async function inspectPhotos(blobs, lang) {
  const parts = [INSPECT_PROMPT(blobs.length, LANG_NAME[lang])];
  const size = blobs.length > 2 ? 896 : 1024; // more photos -> a little smaller each, so the answer stays fast
  for (const [i, b] of blobs.entries()) { parts.push(`Photo ${i + 1}:`); parts.push(await fileToPart(await shrink(b, size))); }
  const d = cleanDiagnosis(await gemini(parts, SCHEMA?.diagnosis, 0.1, true, 0, 16000, true, 32000));
  d.issues.forEach((i) => { i.image = Math.min(blobs.length, Math.max(1, Math.round(i.image || 1))); });
  return d;
}

// ---------- Firestore (best effort: the app works without it) ----------
function newId(col) {
  if (fb?.db) try { return fb.fs.doc(fb.fs.collection(fb.db, col)).id; } catch {}
  return Math.random().toString(36).slice(2, 12);
}
function save(path, data) {
  if (!fb?.db) return;
  try { fb.fs.setDoc(fb.fs.doc(fb.db, ...path), { ...data, created: fb.fs.serverTimestamp() }).catch((e) => console.warn("save", e.code)); } catch {}
}
async function load(path) {
  if (!fb?.db) return null;
  try { const s = await withTimeout(fb.fs.getDoc(fb.fs.doc(fb.db, ...path)), 4000); return s.exists() ? s.data() : null; } catch { return null; }
}
const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
async function sha1(s) {
  const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ---------- routes ----------
const inspections = new Map(); // id -> { diagnosis, qa }
let cachedSamples = null;
async function samplesData() {
  if (!cachedSamples) cachedSamples = await (await fetch("samples/results.json")).json();
  return cachedSamples;
}
function remember(diagnosis, lang, media, source, id, blobs = []) {
  id = id || newId("inspections");
  inspections.set(id, { diagnosis, qa: [], blobs });
  return { id, type: "inspection", lang, media, source, diagnosis, qa: [] };
}

async function routeInspect(fd) {
  const lang = norm(fd.get("lang"));
  const files = fd.getAll("file").filter((f) => f && f.size).slice(0, 4);
  if (!files.length) throw new UserError("The file is empty.", "type");
  if (files.some((f) => !mimeOf(f).startsWith("image"))) throw new UserError("Send a photo (JPG or PNG).", "type");
  let diagnosis;
  try { diagnosis = await inspectPhotos(files, lang); } catch (e) { throw friendly(e, "The AI couldn't read that photo. Try a clearer one.", "photo"); }
  const doc = remember(diagnosis, lang, "photo", "upload", undefined, files);
  save(["inspections", doc.id], { lang, media: files.length > 1 ? `photos:${files.length}` : "photo", source: "upload", diagnosis });
  return doc;
}

async function routeSample(id, lang) {
  // Samples show a stored result instantly in all six languages, so the demo never waits.
  // Your own photos and videos are always analysed live by Gemini.
  lang = norm(lang);
  const meta = (await samplesData()).samples.find((s) => s.id === id);
  if (!meta) throw new UserError("Unknown sample");
  const blob = await (await fetch("samples/" + meta.file)).blob().catch(() => null);
  return remember(meta.result[lang] || meta.result.en, lang, meta.kind, "sample", `sample-${id}-${lang}`, blob ? [blob] : []);
}

async function routeAsk(id, fd) {
  const insp = inspections.get(id);
  if (!insp) throw new UserError("Inspection not found. Run the check again.", "ai");
  const lang = norm(fd.get("lang")), question = fd.get("question"), audio = fd.get("audio");
  if (!question && !audio) throw new UserError("Ask a question by voice or text.", "ai");
  const d = insp.diagnosis;
  const context = { summary: d.summary, overall_severity: d.overall_severity,
    issues: d.issues.map((i) => ({ title: i.title, severity: i.severity, where: i.where, evidence: i.evidence, likely_cause: i.likely_cause, risk: i.risk_if_ignored })),
    actions: d.actions, safety_warning: d.safety_warning, earlier_questions: insp.qa.map((q) => ({ q: q.question_heard, a: q.answer })).slice(-3) };
  const prompt = `You are SolarSense, a senior rooftop-solar service technician. You already inspected the owner's photos (attached) and found:
${JSON.stringify(context)}
The owner now asks a follow-up question${audio ? " (in the attached voice note; it may be in any language)" : ""}.

Answer like an expert technician on the phone, specific to THIS system and these photos, not generic advice:
- Explain the most likely reasons, ranked, with what in the photos or readings points to each ("this is probably X because Y").
- Give concrete checks to confirm or rule out each reason, saying which ones the owner can safely do (look, read the inverter screen,
  note times, compare days, check if the breaker/isolator position is visible without touching) and which need a technician
  (with what the technician should measure or test, e.g. insulation resistance, string open-circuit voltage, connector inspection).
- Give numbers where useful (normal ranges, expected values, how much output is being lost).
- Only say "call a technician" for things that truly need one, and then say exactly what to ask them to check.
- Safety first: never suggest touching wiring, opening the inverter, or climbing a risky roof.
- If the question is unrelated to solar, answer briefly and steer back.
- ${ONE_LANG(LANG_NAME[lang])} Answer in ${LANG_NAME[lang]} even if the question is in another language.
- answer: 3-6 short, specific sentences. question_heard: the question as understood, written in ${LANG_NAME[lang]}.
- spoken_script: the same answer phrased naturally for speaking, under 35 seconds.` + (question ? `\nQuestion: ${question}` : "");
  const parts = [prompt];
  for (const b of (insp.blobs || []).slice(0, 2)) parts.push(await fileToPart(await shrink(b, 640)));
  if (audio) parts.push(await fileToPart(audio));
  let ans;
  try { ans = await gemini(parts, SCHEMA?.answer, 0.3, true, 0, 12000, false, 24000); } catch (e) { throw friendly(e, "The AI couldn't answer just now. Try again.", "answer"); }
  insp.qa.push(ans);
  if (!id.startsWith("sample-")) save(["inspections", id, "qa", newId("qa")], ans);
  return ans;
}

// Voice: Gemini text-to-speech through AI Logic if the free tier allows it; otherwise app.js uses the phone's own voice.
let ttsModel = null, ttsDead = false;
const ttsCache = new Map();
async function routeSpeak({ text, lang }) {
  if (window.SS_GEMINI_VOICE === false) throw new Error("no server voice");
  lang = norm(lang);
  text = String(text || "").trim().slice(0, 1500);
  if (ttsDead || !fb || !TTS_CODE[lang]) throw new Error("no server voice");
  const key = lang + ":" + text;
  if (ttsCache.has(key)) return { audio_wav_base64: ttsCache.get(key) };
  for (const model of ttsModel ? [ttsModel] : TTS_MODELS) {
    try {
      const m = fb.getGenerativeModel(fb.ai, { model, generationConfig: { responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }, languageCode: TTS_CODE[lang] } } });
      const r = await withTimeout(m.generateContent(`Read this text aloud exactly as written, without translating it, warmly and clearly like a helpful technician talking to a neighbour:\n${text}`), 30000);
      const part = r.response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (!part) throw new Error("no audio");
      ttsModel = model;
      const wav = toWav(part.inlineData.data, part.inlineData.mimeType || "");
      ttsCache.set(key, wav);
      return { audio_wav_base64: wav };
    } catch (e) { console.warn("TTS", model, e?.message); }
  }
  ttsDead = true; // don't keep waiting on every sentence
  throw new Error("no server voice");
}
function toWav(b64, mime) {
  const pcm = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (/wav/i.test(mime) || (pcm[0] === 82 && pcm[1] === 73 && pcm[2] === 70 && pcm[3] === 70)) return b64;
  const rate = +(mime.match(/rate=(\d+)/)?.[1] || 24000);
  const buf = new ArrayBuffer(44 + pcm.length), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length, true);
  new Uint8Array(buf, 44).set(pcm);
  let s = ""; const out = new Uint8Array(buf);
  for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
  return btoa(s);
}

async function routeUI({ lang, strings }) {
  lang = norm(lang);
  if (lang === "en") return { lang: "en", strings };
  if (!fb) return { lang: "en", strings, error: "SolarSense couldn't load Firebase. Check your connection and refresh the page." };
  const keys = Object.keys(strings).sort(), vals = keys.map((k) => strings[k]);
  const key = lang + "-" + (await sha1("v2" + JSON.stringify(vals)));
  const hit = ls.get("ss_ui2_" + key) || (await load(["ui", key]))?.strings;
  if (hit && good(hit)) return { lang, strings: hit };
  try {
    const prompt = `Translate each English text in this JSON array into ${LANG_NAME[lang]}. They are labels and messages in a mobile app ` +
      "that helps people check their rooftop solar panels. Keep each one short and natural. Keep anything in {curly braces} exactly as it is. " +
      `Return an object {"t": [...]} with exactly ${vals.length} translations, in the same order.\n` + JSON.stringify(vals);
    const schema = fb.S.object({ properties: { t: fb.S.array({ items: fb.S.string() }) } });
    const data = await gemini(prompt, schema, 0.1);
    const arr = Array.isArray(data) ? data : data?.t;
    if (!Array.isArray(arr) || arr.length !== vals.length) throw new UserError(`The translation came back incomplete (${arr?.length ?? 0} of ${vals.length}).`);
    const out = Object.fromEntries(keys.map((k, i) => [k, typeof arr[i] === "string" && arr[i].trim() ? arr[i] : strings[k]]));
    if (!good(out)) throw new UserError("The translation came back in English.");
    ls.set("ss_ui2_" + key, out);
    save(["ui", key], { lang, strings: out });
    return { lang, strings: out };
  } catch (e) { return { lang: "en", strings, error: "Couldn't switch the language. " + friendly(e, "").message.trim() }; }
  function good(o) { // at least a third of the texts must differ from English
    return keys.filter((k) => o[k] && o[k] !== strings[k]).length >= keys.length / 3;
  }
}

// ---------- performance (same maths as backend/app/solar.py) ----------
const PR = 0.78, FALLBACK_PSH = 4.5;
async function routePlaces(q, lang = "en") {
  q = q.trim();
  if (q.length < 2) return [];
  const city = q.split(",")[0].trim();
  let rows = [];
  try { // cities, towns and villages worldwide
    const r = await withTimeout(fetch("https://geocoding-api.open-meteo.com/v1/search?" + new URLSearchParams({ name: city, count: 8, language: norm(lang), format: "json" })), 6000);
    rows = ((await r.json()).results || []).map((x) => ({ name: [x.name, x.admin1, x.country].filter(Boolean).join(", "), lat: x.latitude, lon: x.longitude, cc: (x.country_code || "").toUpperCase() }));
    const extra = q.split(",").slice(1).join(" ").trim().toLowerCase(); // "Lahore, Pakistan" -> keep matches in Pakistan
    if (extra) { const f = rows.filter((r) => r.name.toLowerCase().includes(extra)); if (f.length) rows = f; }
  } catch {}
  if (rows.length < 3) {
    try { // OpenStreetMap: neighbourhoods, districts and smaller towns
      const r = await withTimeout(fetch("https://nominatim.openstreetmap.org/search?" + new URLSearchParams({ q, format: "jsonv2", limit: 6, addressdetails: 1, "accept-language": norm(lang) })), 6000);
      const more = (await r.json()).map((x) => ({ name: [x.name || x.display_name.split(",")[0], x.address?.state, x.address?.country].filter(Boolean).join(", "),
        lat: +x.lat, lon: +x.lon, cc: (x.address?.country_code || "").toUpperCase() }));
      for (const m of more) if (!rows.some((r) => r.name === m.name)) rows.push(m);
    } catch {}
  }
  return rows.slice(0, 8);
}
const sunCache = new Map();
function peakSun(lat, lon, days = 7) {
  const key = `${(+lat).toFixed(2)},${(+lon).toFixed(2)}`, hit = sunCache.get(key);
  if (hit && Date.now() - hit.t < 3600e3) return hit.p;
  const p = fetchSun(lat, lon, days);
  sunCache.set(key, { t: Date.now(), p });
  p.then((v) => { if (v.code !== "live") sunCache.delete(key); }); // don't keep a fallback value
  return p;
}
async function fetchSun(lat, lon, days) {
  try {
    const r = await withTimeout(fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=shortwave_radiation_sum&past_days=${days}&forecast_days=1&timezone=auto`), 5000);
    const d = (await r.json()).daily;
    const rows = {};
    d.time.slice(0, -1).forEach((t, i) => { const v = d.shortwave_radiation_sum[i]; if (v != null) rows[t] = v / 3.6; }); // last row is today, still incomplete
    const vals = Object.values(rows);
    if (vals.length) return { source: "Open-Meteo (live weather)", code: "live", by_date: rows, average: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 };
  } catch {}
  return { source: "global typical value (live weather unavailable)", code: "typical", by_date: {}, average: FALLBACK_PSH };
}
async function evaluate(reading, capacity, tariff, currency, place, lat, lon, sunKnown) {
  const sun = sunKnown || await peakSun(lat, lon);
  let expectedDay = capacity * sun.average * PR, actualDay = null, basis = null, basisCode = null, basisN = 0;
  const daily = (reading.daily || []).filter((d) => d.kwh != null);
  const today = new Date();
  if (daily.length >= 3) {
    actualDay = daily.reduce((a, d) => a + d.kwh, 0) / daily.length;
    const dated = daily.map((d) => sun.by_date[d.date]);
    if (dated.every(Boolean)) expectedDay = capacity * (dated.reduce((a, b) => a + b, 0) / daily.length) * PR;
    basis = `average of ${daily.length} days shown`; basisCode = "days"; basisN = daily.length;
  } else if (reading.month_kwh && (reading.days_into_month || today.getDate() > 1)) {
    const days = reading.days_into_month || today.getDate() - 1;
    actualDay = reading.month_kwh / Math.max(1, days);
    basis = `this month so far (${days} days)`; basisCode = "month"; basisN = days;
  } else if (reading.today_kwh != null) {
    actualDay = reading.today_kwh;
    basis = "today only (less reliable: the day may not be over)"; basisCode = "today"; basisN = 1;
  }
  if (actualDay == null) return { ok: false, reason: "No energy numbers could be read from the screenshot." };
  const ratio = expectedDay ? actualDay / expectedDay : 0;
  const lossDay = Math.max(0, expectedDay - actualDay);
  const r1 = (x) => Math.round(x * 10) / 10;
  return { ok: true, place, capacity_kw: capacity, tariff_per_kwh: tariff, currency, basis, basis_code: basisCode, basis_n: basisN,
    weather_source: sun.source, weather_code: sun.code,
    peak_sun_hours: Math.round(sun.average * 100) / 100, actual_kwh_per_day: r1(actualDay), expected_kwh_per_day: r1(expectedDay),
    performance_ratio: Math.round(ratio * 100) / 100, status: ratio >= 0.85 ? "healthy" : ratio >= 0.65 ? "check" : "problem",
    lost_kwh_per_month: Math.round(lossDay * 30), lost_money_per_month: Math.round(lossDay * 30 * tariff),
    fault_codes: reading.fault_codes || [], assumption: `Expected = capacity x peak sun hours x ${PR} (typical performance ratio)` };
}
// Used only if Gemini doesn't answer in time, so the result never switches to English.
const FALLBACK = {
  en: { healthy: "Your solar system is working well.", check: "Your system is producing less than it should.", problem: "Your system is producing far less than it should. Something may be faulty.",
    c_check: ["Dust on the panels", "Shading", "High heat"], c_problem: ["Inverter or string fault", "Damaged panel"],
    a_you: "Wash the panels with plain water early in the morning", a_tech: "If the gap stays, call a technician",
    say: "{v} It's making about {pct} percent of what your panels should produce in this weather. That's roughly {money} lost every month." },
  ur: { healthy: "آپ کا سولر سسٹم ٹھیک کام کر رہا ہے۔", check: "آپ کا سسٹم جتنی بجلی بنانی چاہیے اس سے کم بنا رہا ہے۔", problem: "آپ کا سسٹم بہت کم بجلی بنا رہا ہے۔ کوئی خرابی ہو سکتی ہے۔",
    c_check: ["پینلز پر گرد", "سایہ", "زیادہ گرمی"], c_problem: ["انورٹر یا اسٹرنگ کی خرابی", "خراب پینل"],
    a_you: "صبح سویرے سادے پانی سے پینلز دھوئیں", a_tech: "اگر فرق برقرار رہے تو ٹیکنیشن کو بلائیں",
    say: "{v} اس موسم میں جتنی بجلی بننی چاہیے، یہ اس کا تقریباً {pct} فیصد بنا رہا ہے۔ یعنی ہر مہینے تقریباً {money} کا نقصان۔" },
  hi: { healthy: "आपका सोलर सिस्टम ठीक चल रहा है।", check: "आपका सिस्टम जितनी बिजली बनानी चाहिए उससे कम बना रहा है।", problem: "आपका सिस्टम बहुत कम बिजली बना रहा है। कोई खराबी हो सकती है।",
    c_check: ["पैनलों पर धूल", "छाया", "ज़्यादा गर्मी"], c_problem: ["इन्वर्टर या स्ट्रिंग फ़ॉल्ट", "खराब पैनल"],
    a_you: "सुबह जल्दी सादे पानी से पैनल धोएँ", a_tech: "अगर फ़र्क बना रहे तो तकनीशियन को बुलाएँ",
    say: "{v} इस मौसम में जितनी बिजली बननी चाहिए, यह उसका लगभग {pct} प्रतिशत बना रहा है। यानी हर महीने लगभग {money} का नुकसान।" },
  zh: { healthy: "您的光伏系统运行良好。", check: "您的系统发电量低于应有水平。", problem: "您的系统发电量远低于应有水平，可能有故障。",
    c_check: ["光伏板积灰", "遮挡", "高温"], c_problem: ["逆变器或组串故障", "光伏板损坏"],
    a_you: "清晨用清水清洗光伏板", a_tech: "如果差距仍然存在，请联系技术人员",
    say: "{v}在当前天气下，它大约只达到应有发电量的百分之{pct}，相当于每月损失约 {money}。" },
  id: { healthy: "Sistem surya Anda bekerja dengan baik.", check: "Sistem Anda menghasilkan lebih sedikit dari seharusnya.", problem: "Sistem Anda menghasilkan jauh lebih sedikit dari seharusnya. Mungkin ada kerusakan.",
    c_check: ["Debu di panel", "Bayangan", "Panas tinggi"], c_problem: ["Kerusakan inverter atau string", "Panel rusak"],
    a_you: "Cuci panel dengan air biasa pagi-pagi", a_tech: "Jika selisihnya tetap, hubungi teknisi",
    say: "{v} Sistem menghasilkan sekitar {pct} persen dari yang seharusnya dalam cuaca ini. Artinya sekitar {money} hilang setiap bulan." },
  ar: { healthy: "نظامك الشمسي يعمل جيدًا.", check: "ينتج نظامك أقل مما ينبغي.", problem: "ينتج نظامك أقل بكثير مما ينبغي، وقد يكون هناك عطل.",
    c_check: ["غبار على الألواح", "ظل", "حرارة عالية"], c_problem: ["عطل في العاكس أو السلسلة", "لوح تالف"],
    a_you: "اغسل الألواح بماء عادي في الصباح الباكر", a_tech: "إذا استمر الفرق، اتصل بفنّي",
    say: "{v} ينتج نظامك نحو {pct} بالمئة مما يجب في هذا الطقس، أي خسارة نحو {money} كل شهر." },
};
function fallbackExplanation(f, lang = "en") {
  const L = FALLBACK[lang] || FALLBACK.en, pct = Math.round(f.performance_ratio * 100);
  let money = `${f.lost_money_per_month} ${f.currency}`;
  try { money = new Intl.NumberFormat(lang, { style: "currency", currency: f.currency, maximumFractionDigits: 0 }).format(f.lost_money_per_month); } catch {}
  const v = L[f.status];
  if (f.status === "healthy") return { summary: v, likely_causes: [], actions: [{ step: L.a_you, who: "you" }],
    spoken_script: v };
  return { summary: v, likely_causes: f.status === "problem" ? L.c_problem : L.c_check,
    actions: [{ step: L.a_you, who: "you" }, { step: L.a_tech, who: "technician" }],
    spoken_script: L.say.replace("{v}", v).replace("{pct}", pct).replace("{money}", money) };
}
const READ_PROMPT = `This is a screenshot from a solar inverter or solar monitoring phone app, the app that comes with the owner's
inverter (for example Solarman Smart, SolisCloud, Growatt ShinePhone, Huawei FusionSolar, GoodWe SEMS, Sungrow iSolarCloud, Deye Cloud,
SMA Energy, Fronius Solar.web, Enphase Enlighten, SolarEdge, Victron VRM, Inverex, Knox, Itel, Tesla). The labels may be in any language
(for example Chinese 今日发电量 / 当月发电量 / 累计发电量, or "Yield today", "E-Today", "Daily production").

Read the numbers exactly as shown:
- Only solar PV production counts. Ignore consumption, load, grid import/export and battery charge/discharge numbers.
- Energy (kWh) is not power (kW or W). today_kwh and month_kwh are energy; current_power_kw is the live power right now.
- Convert Wh to kWh and MWh to kWh. Convert W to kW.
- capacity_kw is the installed PV size (kWp, "Installed capacity", "PV capacity"), not the inverter rating unless that is all that is shown.
- If a bar chart has a value label for each day, list them in daily with dates (assume the current year if no year is shown).
  Only read bars that have numbers; do not estimate bar heights.
- Copy any fault, alarm or warning codes exactly into fault_codes.
- A photo of the inverter's own display (for example "E-Today 18.2kWh", "E-Total", "Pac 3.2kW") counts too: read it the same way.
- Do not guess values that are not visible. Set is_inverter_app to false only if none of the images show solar production data.`;

async function routePerformance(fd) {
  const files = fd.getAll("file").filter((f) => f && f.size).slice(0, 4), lang = norm(fd.get("lang")), sample = fd.get("sample");
  const manToday = parseFloat(fd.get("kwh_today")), manMonth = parseFloat(fd.get("kwh_month"));
  const manual = manToday > 0 || manMonth > 0
    ? { is_inverter_app: true, ...(manToday > 0 ? { today_kwh: manToday } : {}), ...(manMonth > 0 ? { month_kwh: manMonth } : {}) } : null;
  if (!files.length && !manual) throw new UserError("Send a screenshot of your inverter app.", "file");
  if (files.some((f) => !mimeOf(f).startsWith("image"))) throw new UserError("Send a screenshot of your inverter app.", "file");
  const lat = +fd.get("lat"), lon = +fd.get("lon");
  const sun = await peakSun(lat, lon); // fetched first so the AI can judge the pattern against real sunshine in the same request
  let reading;
  if (sample) reading = { ...(await samplesData()).inverter_reading, ...((await samplesData()).perf_analysis?.[lang] || {}) }; // stored: no AI request
  else if (!files.length) reading = manual; // typed numbers: no AI request
  else {
    const cap0 = parseFloat(fd.get("capacity_kw"));
    const parts = [READ_PROMPT + (files.length > 1 ? `\nThere are ${files.length} screenshots from the same system (for example a day screen and a month screen). Combine what they show into one reading.` : "")
      + `\n\nThen, as a senior solar performance analyst, fill likely_causes and actions (in ${LANG_NAME[lang]}; ${ONE_LANG(LANG_NAME[lang])}).
Real sunshine at the system's location, peak sun hours per day: ${JSON.stringify(sun.by_date)} (average ${sun.average}).
Expected daily energy is about capacity_kW x peak sun hours x 0.78${cap0 ? `; the owner says the system is ${cap0} kW` : ""}.
If output is at least 85% of expected, leave likely_causes empty and give 2-3 routine-care actions.
Otherwise reason from the PATTERN, not a generic list: a steady small gap every day suggests dust, partial shade at certain hours, heat or a
poor angle; midday power flattening near the inverter rating suggests clipping; single days near zero suggest an outage or a trip that day;
a sudden lasting drop from a date suggests a failed string, blown fuse, tripped DC isolator or damaged panel; very low every day suggests a
whole string not producing, inverter derating, or a wrong system size. Explain any fault codes. For each cause give the evidence and a
concrete check (owner-safe where possible, otherwise what a technician should test). "who" is "technician" for anything electrical.
Be concise: at most 3 causes and 3 actions, one short sentence per field.`];
    const imgs = await Promise.all(files.map(async (f) => fileToPart(await shrink(f, files.length > 1 ? 960 : 1152))));
    parts.push(...imgs);
    try { reading = await gemini(parts, SCHEMA?.reading, 0, true, 0, 12000, true, 24000, ["gemini-2.5-flash-lite", "gemini-2.5-flash"]); }
    catch (e) {
      if (manual) reading = manual;
      else { const err = friendly(e, "The AI couldn't read that screenshot. Try a clearer one.", "shot"); err.offerManual = true; throw err; }
    }
    if (manual) reading = { ...reading, ...manual }; // typed numbers win over what was read
  }
  if (reading.is_inverter_app === false) throw new UserError("That doesn't look like an inverter app screenshot. Open your solar app's home screen and take a screenshot.", "notapp");
  const cap = parseFloat(fd.get("capacity_kw")) || reading.capacity_kw;
  if (!cap) throw new UserError("Your system size wasn't visible. Enter it in kW (for example 10).", "nosize");
  const currency = String(fd.get("currency") || "USD").toUpperCase().slice(0, 3);
  const facts = await evaluate(reading, +cap, parseFloat(fd.get("tariff")), currency, fd.get("place"), lat, lon, sun);
  if (!facts.ok) throw new UserError(facts.reason + " Use the screen that shows daily or monthly energy (kWh).", "nonumbers");
  // Verdict, money and spoken summary are built here from the numbers (in the user's language); causes and actions come from the same AI request.
  const explanation = fallbackExplanation(facts, lang);
  if (facts.status !== "healthy" && reading.likely_causes?.length) explanation.likely_causes = reading.likely_causes;
  if (reading.actions?.length) explanation.actions = reading.actions.map((a) => ({ step: a.step, who: a.who === "you" ? "you" : "technician" }));
  if (facts.status === "healthy") explanation.likely_causes = [];
  const { likely_causes, actions, ...readingOnly } = reading;
  const id = newId("checks");
  save(["checks", id], { lang, reading: readingOnly, facts, explanation });
  return { id, type: "performance", lang, reading: readingOnly, facts, explanation };
}

// ---------- router ----------
async function handle(path, opts = {}) {
  const [p, qs] = path.split("?");
  const q = new URLSearchParams(qs || "");
  const body = opts.body;
  const json = () => (typeof body === "string" ? JSON.parse(body) : body);
  let m;
  if (p === "/inspect") return routeInspect(body);
  if ((m = p.match(/^\/samples\/([\w-]+)$/))) return routeSample(m[1], q.get("lang"));
  if ((m = p.match(/^\/inspections\/([\w-]+)\/ask$/))) return routeAsk(m[1], body);
  if (p === "/speak") return routeSpeak(json());
  if (p === "/ui") return routeUI(json());
  if (p === "/places") return routePlaces(q.get("q") || "", q.get("lang") || "en");
  if (p === "/sun") { peakSun(+q.get("lat"), +q.get("lon")); return {}; } // warm up, no AI
  if (p === "/performance") return routePerformance(body);
  throw new UserError("Not found");
}

(async () => {
  try {
    fb = await withTimeout(loadFirebase(), 15000);
    SCHEMA = schemas(fb.S);
  } catch (e) { console.error("Firebase failed to load; samples will use stored results", e); fb = null; }
  window.__ssReady(handle);
})();
