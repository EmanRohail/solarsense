const API = (window.API_BASE || "") + "/api";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

// ---------- languages ----------
const FALLBACK_LANGS = [
  ["en", "English", "English", false, "en-US"], ["ur", "Urdu", "اردو", true, "ur-PK"], ["hi", "Hindi", "हिन्दी", false, "hi-IN"],
  ["zh", "Mandarin Chinese", "中文", false, "zh-CN"], ["id", "Indonesian", "Bahasa Indonesia", false, "id-ID"], ["ar", "Arabic", "العربية", true, "ar-SA"],
].map(([code, label, native, rtl, tts]) => ({ code, label, native, rtl, tts, voice: !!tts }));
let LANGS = FALLBACK_LANGS;
let lang = "en";
const L = () => LANGS.find((l) => l.code === lang) || LANGS[0];

// Strings that appear only in JavaScript. Translations for every language are in i18n.js.
const DYN = {
  working_photo: "Looking at your photo…", working_video: "Watching your video…", working_perf: "Reading your screenshot and checking the sunshine…",
  sev_ok: "Looks fine", sev_low: "Minor", sev_medium: "Needs attention", sev_high: "Serious", sev_danger: "Danger",
  loss_range: "Estimated output loss: {low}–{high}%", you: "You can do this", technician: "Technician",
  voice_ready: "Tap to listen", voice_playing: "Speaking…", voice_loading: "Preparing voice…", voice_device: "Device voice", voice_none: "Voice isn't available here. Read below.",
  mic_start: "Tap and ask", mic_stop: "Tap to stop", mic_denied: "Microphone is blocked. Type your question instead.", thinking: "Thinking…",
  you_asked: "You asked", listen: "Listen", no_issues: "No problems found.", video_note: "Problems from your video are listed below.",
  err_type: "Send a photo (JPG or PNG).", err_size: "That photo is too big. Send a smaller one.",
  err_file: "Add a screenshot of your inverter app.", err_place: "Choose a place from the list or use your location.", err_rate: "Enter the price you pay for one unit (kWh).",
  err_net: "Couldn't reach SolarSense. Check your connection and try again.",
  loss_title: "You're losing about", per_month: "per month", healthy_title: "Your system is healthy", healthy_sub: "It's making {pct}% of what it should in this weather.",
  gap_sub: "It's making {pct}% of what it should in this weather ({kwh} kWh a month less).",
  actual: "Your system", expected: "Expected", per_day: "kWh a day", my_location: "My location",
  fine: "Expected output = system size × sunshine × 0.78. Sunshine: {src}. Based on {basis}.",
  wa_intro: "Solar check by SolarSense", sample_dusty: "Dusty panels", sample_fault: "Inverter fault", sample_cracked: "Cracked panel",
  conf_high: "Clearly visible", conf_medium: "Likely", conf_low: "Possible",
  next_photo: "To check more, send a photo of:", looks_ok: "Looks fine:",
  src_live: "live weather from Open-Meteo", src_typical: "a typical value (live weather unavailable)",
  basis_days: "the average of {n} days shown", basis_month: "this month so far ({n} days)", basis_today: "today only (the day may not be over)",
  fault_codes: "Fault codes:",
  loss_one: "Estimated output loss: about {pct}%", share_wa: "Share report on WhatsApp", download_pdf: "Download report (PDF)",
  report_for: "For the installer / service technician", tech_todo: "What the technician should do", owner_told: "What the owner has been told to do",
  photos_h: "Photos", cause_label: "Likely cause:", check_label: "How to check:", keep_healthy: "Keep it healthy",
  wa_hello: "Hello, I'd like you to check my solar system. SolarSense found the following:", wa_ask: "Could you please check this and let me know when you can visit? The full report with photos is attached.", send_pdf: "Send report as PDF", send_text: "Send as text on WhatsApp", tray_clear: "Clear photos",
  report_title: "Solar system check report", report_foot: "Made with SolarSense (solarsense-6280c.web.app). This is guidance, not a certified electrical inspection.",
  pdf_making: "Making the PDF…", pdf_share: "Tap again to share the PDF", recording: "Recording… {s}s",
  manual_h: "No screenshot? Type your numbers",
  max_photos: "You can add up to 4 photos of the same system, for example the panels, the inverter screen and the wiring.",
  cam_denied: "The camera is blocked or not available. Use Upload from gallery instead.", photo_n: "Photo {n}", risk_label: "If ignored:",
  err_busy: "SolarSense has used up its free AI allowance for now. The samples still work. Try your own photo again in a few minutes.",
  err_slow: "The AI took too long to answer. Please try again.", err_setup: "The AI isn't switched on for this app yet.",
  err_ai: "The AI couldn't do that just now. Please try again.", err_photo: "The AI couldn't read that photo. Try a clearer, closer one.",
  err_answer: "The AI couldn't answer just now. Please try again.", err_shot: "The AI couldn't read that screenshot. Try a clearer one.",
  err_notapp: "That doesn't look like a solar app screenshot. Open your inverter app's home screen and take a screenshot.",
  err_nosize: "Your system size isn't on the screenshot. Enter it in kW (for example 10).",
  err_nonumbers: "No energy numbers (kWh) were found. Use the screen that shows today's or this month's energy.",
};
let T = { ...DYN };
const t = (k, vars = {}) => (T[k] || DYN[k] || k).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? "");

function pageStrings() {
  const s = {};
  document.querySelectorAll("[data-t]").forEach((el) => { s[el.dataset.t] = el.dataset.en || (el.dataset.en = el.textContent.trim()); });
  document.querySelectorAll("[data-tp]").forEach((el) => { s[el.dataset.tp] = el.dataset.en || (el.dataset.en = el.placeholder); });
  return s;
}

async function setLang(code) {
  if (code !== lang) { stopVoice(); $("#result").hidden = $("#perf-result").hidden = true; inspection = perf = null; showError(""); }
  lang = code;
  store.set("ss_lang", code);
  const l = L();
  document.documentElement.lang = code;
  document.documentElement.dir = l.rtl ? "rtl" : "ltr";
  $("#lang-chip").textContent = l.native;
  $("#lang-screen").hidden = true;
  $("#app").hidden = false;
  entered = true;
  if (!$("#currency").dataset.touched) $("#currency").value = defaultCurrency();
  $("#rate").placeholder = SAMPLE_TARIFF[$("#currency").value] ?? "";
  const tr = (window.I18N || {})[code] || {};
  T = { ...pageStrings(), ...DYN, ...tr }; // page labels too, so headings can be reused in the report
  applyStrings({ ...pageStrings(), ...tr });
  renderSamples();
}
function applyStrings(s) {
  document.querySelectorAll("[data-t]").forEach((el) => { if (s[el.dataset.t]) el.textContent = s[el.dataset.t]; });
  document.querySelectorAll("[data-tp]").forEach((el) => { if (s[el.dataset.tp]) el.placeholder = s[el.dataset.tp]; });
}

let entered = false;
function showLangScreen() {
  $("#lang-back").hidden = !entered;
  $("#app").hidden = true;
  $("#lang-screen").hidden = false;
  $("#lang-grid").innerHTML = LANGS.map((l) => `<button data-code="${l.code}" lang="${l.code}"><b>${esc(l.native)}</b><small>${esc(l.label)}</small></button>`).join("");
}
$("#lang-grid").addEventListener("click", (e) => { const b = e.target.closest("[data-code]"); if (b) setLang(b.dataset.code); });
$("#lang-chip").addEventListener("click", () => { stopVoice(); showLangScreen(); });
$("#lang-back").addEventListener("click", () => { $("#lang-screen").hidden = true; $("#app").hidden = false; });

// ---------- helpers ----------
function showError(msg) { const e = $("#error"); e.textContent = msg || ""; e.hidden = !msg; }
let workTick = null;
function working(msg) {
  const w = $("#working"); w.hidden = !msg; clearInterval(workTick);
  $("#working-text").textContent = msg || "";
  if (!msg) return;
  const t0 = Date.now();
  workTick = setInterval(() => { $("#working-text").textContent = `${msg}  ${Math.round((Date.now() - t0) / 1000)}s`; }, 1000);
}
async function api(path, opts = {}) {
  if (window.SS_MODE === "firebase") {
    const handle = await window.SS_READY;
    try { return await handle(path, opts); }
    catch (e) {
      if (e && e.code && (T["err_" + e.code] || DYN["err_" + e.code])) throw new Error(t("err_" + e.code));
      throw new Error(e && e.user ? e.message : t("err_net"));
    }
  }
  let r;
  try { r = await fetch(API + path, opts); } catch { throw new Error(t("err_net")); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || t("err_net"));
  return d;
}
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const scrollTo = (el) => el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });

// ---------- modes ----------
document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-selected", x === b));
  $("#mode-inspect").hidden = b.dataset.mode !== "inspect";
  $("#mode-perf").hidden = b.dataset.mode !== "perf";
  $("#result").hidden = $("#perf-result").hidden = true;
  showError(""); stopVoice();
}));

// ---------- voice + captions ----------
let audio = null, utter = null, current = null;
function sentences(text) { return (text.match(/[^.!?。！？؟۔]+[.!?。！？؟۔]*\s*/g) || [text]).map((s) => s); }
function setCaptions(capEl, text) {
  const parts = sentences(text);
  capEl.innerHTML = parts.map((p) => `<span>${esc(p)}</span>`).join("");
  return parts;
}
function highlight(capEl, parts, charPos) {
  let acc = 0;
  [...capEl.children].forEach((span, i) => {
    const start = acc; acc += parts[i].length;
    span.className = charPos >= acc ? "said" : charPos >= start ? "now" : "";
  });
}
function voiceState(voiceEl, labelEl, state) {
  voiceEl.classList.toggle("speaking", state === "playing");
  labelEl.textContent = { playing: t("voice_playing"), loading: t("voice_loading"), ready: t("voice_ready"), none: t("voice_none") }[state] || "";
}
function stopVoice() {
  if (audio) { audio.pause(); audio = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (current) voiceState(current.voiceEl, current.labelEl, "ready");
  current = null;
}
// Voice: the device's own voice starts instantly on tap (browsers block speech that starts later).
// If the device has no voice for this language, Gemini's voice is fetched instead.
let VOICES = [];
function loadVoices() { try { VOICES = speechSynthesis.getVoices(); } catch {} }
if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function deviceVoice() {
  if (!window.speechSynthesis) return null;
  if (!VOICES.length) loadVoices();
  const want = (L().tts || "en-US").toLowerCase(), base = want.split("-")[0];
  const norm = (v) => v.lang.toLowerCase().replace("_", "-");
  const list = VOICES.filter((v) => norm(v) === want || norm(v).startsWith(base + "-") || norm(v) === base);
  return list.find((v) => /google|natural|neural/i.test(v.name)) || list[0] || (VOICES.length ? null : "unknown");
}
async function speak(text, voiceEl, labelEl, capEl) {
  stopVoice();
  const parts = setCaptions(capEl, text);
  const job = { voiceEl, labelEl, capEl, text };
  current = job;
  const v = deviceVoice();
  // Computers rarely have Urdu or Arabic voices, so those go to the web voice first.
  if (v && v !== "unknown") { const ok = await deviceSpeak(parts, v, job); if (ok || current !== job) return; }
  if (window.SS_WEB_VOICE !== false) {
    const ok = await webSpeak(text, parts, job);
    if (ok || current !== job) return;
  }
  if (v === "unknown") { const ok = await deviceSpeak(parts, null, job); if (ok || current !== job) return; }
  voiceState(voiceEl, labelEl, "loading");
  try {
    const d = await api("/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang }) });
    if (current !== job) return;
    const total = text.length;
    audio = new Audio("data:audio/wav;base64," + d.audio_wav_base64);
    audio.ontimeupdate = () => audio.duration && highlight(capEl, parts, (audio.currentTime / audio.duration) * total);
    audio.onended = () => { highlight(capEl, parts, total + 1); voiceState(voiceEl, labelEl, "ready"); };
    voiceState(voiceEl, labelEl, "playing");
    await audio.play().catch(() => voiceState(voiceEl, labelEl, "ready"));
  } catch {
    if (current !== job) return;
    highlight(capEl, parts, text.length + 1);
    voiceState(voiceEl, labelEl, "none");
  }
}
// Web voice for languages the device can't speak (often Urdu and Arabic on computers).
// Uses Google Translate's public speech endpoint; resolves false if it can't play, so Gemini's voice is tried next.
const WEB_TL = { en: "en", ur: "ur", hi: "hi", zh: "zh-CN", id: "id", ar: "ar" };
function webChunks(text) {
  const out = [];
  for (const sentence of sentences(text)) {
    let rest = sentence.trim();
    while (rest.length > 180) {
      let cut = Math.max(rest.lastIndexOf("،", 180), rest.lastIndexOf(",", 180), rest.lastIndexOf(" ", 180));
      if (cut < 60) cut = 180;
      out.push(rest.slice(0, cut)); rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}
function noReferrer(on) {
  let m = document.querySelector('meta[name="referrer"]');
  if (!m) { m = document.createElement("meta"); m.name = "referrer"; document.head.appendChild(m); }
  m.content = on ? "no-referrer" : "strict-origin-when-cross-origin";
}
function webSpeak(text, parts, job) {
  const { voiceEl, labelEl, capEl } = job;
  const chunks = webChunks(text);
  if (!chunks.length) return Promise.resolve(false);
  return new Promise((resolve) => {
    let i = 0, pos = 0, started = false, endpoint = 0;
    voiceState(voiceEl, labelEl, "loading");
    const next = () => {
      if (current !== job) return resolve(true);
      if (i >= chunks.length) { highlight(capEl, parts, 1e9); voiceState(voiceEl, labelEl, "ready"); return resolve(true); }
      const chunk = chunks[i++];
      const tl = WEB_TL[lang] || "en", q = encodeURIComponent(chunk);
      const urls = [`https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=${tl}&q=${q}`,
        `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${q}`];
      noReferrer(true);
      audio = new Audio(urls[endpoint]);
      audio.onloadeddata = () => noReferrer(false);
      audio.onplaying = () => { if (!started) { started = true; voiceState(voiceEl, labelEl, "playing"); } highlight(capEl, parts, text.indexOf(chunk.slice(0, 12), pos)); };
      audio.onended = () => { pos += chunk.length; next(); };
      audio.onerror = () => {
        noReferrer(false);
        if (!started && endpoint === 0) { endpoint = 1; i--; return next(); } // try the second address once
        if (!started) resolve(false); else next();
      };
      audio.play().catch((e) => { if (!started && e?.name === "NotAllowedError") resolve(false); }); // load errors are handled by onerror
    };
    next();
    setTimeout(() => { if (!started && current === job) { audio?.pause(); noReferrer(false); resolve(false); } }, 9000);
  });
}
// Speak sentence by sentence: some voices stop after ~15 seconds on one long utterance, and this keeps captions in step.
function deviceSpeak(parts, voice, job) {
  // Resolves true once speech starts, false if this device can't speak the language.
  const { voiceEl, labelEl, capEl } = job;
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    let done = 0, started = false;
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p);
      u.lang = (L().tts || "en-US");
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onstart = () => {
        if (!started) { started = true; voiceState(voiceEl, labelEl, "playing"); labelEl.textContent = t("voice_device"); resolve(true); }
        if (current === job) highlight(capEl, parts, parts.slice(0, i).join("").length);
      };
      u.onend = u.onerror = (e) => {
        done++;
        if (e?.error && !started) { speechSynthesis.cancel(); return resolve(false); }
        if (done === parts.length && current === job) { highlight(capEl, parts, 1e9); voiceState(voiceEl, labelEl, "ready"); }
      };
      speechSynthesis.speak(u);
    });
    setTimeout(() => { if (!started) { speechSynthesis.cancel(); resolve(false); } }, 2500);
  });
}
function bindPlay(btn, voiceEl, labelEl, capEl, getText) {
  btn.addEventListener("click", () => {
    if (voiceEl.classList.contains("speaking")) return stopVoice();
    const txt = getText(); if (txt) speak(txt, voiceEl, labelEl, capEl);
  });
}

// ---------- A. inspection ----------
let inspection = null, mediaURL = null;
const SAMPLES = [{ id: "dusty", file: "dusty_panels.jpg", key: "sample_dusty" }, { id: "fault", file: "inverter_fault.jpg", key: "sample_fault" }, { id: "cracked", file: "cracked_panel.jpg", key: "sample_cracked" }];
function renderSamples() {
  $("#sample-row").innerHTML = SAMPLES.map((s) => `<button data-sample="${s.id}"><img src="samples/${s.file}" alt=""><span>${esc(t(s.key))}</span></button>`).join("");
}
$("#sample-row").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-sample]"); if (!b) return;
  const s = SAMPLES.find((x) => x.id === b.dataset.sample);
  await runInspection(() => api(`/samples/${s.id}?lang=${lang}`), { urls: [`samples/${s.file}`], kind: "photo" });
});
const MAX_PHOTOS = 4;
let photos = []; // { file, url }
const isImageFile = (f) => (f.type || "").toLowerCase().startsWith("image") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name || "");
function addPhotos(files) {
  showError("");
  for (const f of files) {
    if (!isImageFile(f)) { showError(t("err_type")); continue; }
    if (f.size > 25 * 1024 * 1024) { showError(t("err_size")); continue; }
    if (photos.length >= MAX_PHOTOS) { showError(t("max_photos")); break; }
    photos.push({ file: f, url: URL.createObjectURL(f) });
  }
  renderTray();
}
function renderTray() {
  $("#tray").hidden = !photos.length;
  $("#tray-row").innerHTML = photos.map((p, i) => `<figure><img src="${p.url}" alt=""><button data-rm="${i}" aria-label="Remove">×</button></figure>`).join("")
    + (photos.length < MAX_PHOTOS ? `<label class="add" aria-label="+">+<input type="file" accept="image/*" multiple hidden></label>` : "");
  if (photos.length) $("#tray").scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" });
}
$("#tray-row").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rm]"); if (!b) return;
  e.preventDefault(); photos.splice(+b.dataset.rm, 1); renderTray();
});
$("#tray-row").addEventListener("change", (e) => { addPhotos([...e.target.files]); });
$("#tray-clear").addEventListener("click", () => { photos = []; renderTray(); });
["#cam", "#upload"].forEach((id) => $(id).addEventListener("change", (e) => { const f = [...e.target.files]; e.target.value = ""; addPhotos(f); }));
$("#tray-go").addEventListener("click", () => {
  if (!photos.length) return;
  const fd = new FormData(); fd.append("lang", lang);
  photos.forEach((p) => fd.append("file", p.file, p.file.name || "photo.jpg"));
  const urls = photos.map((p) => p.url);
  runInspection(() => api("/inspect", { method: "POST", body: fd }), { urls, kind: "photo" });
});

// In-app camera: opens the phone's or laptop's camera directly; several shots can be taken in a row.
let camStream = null, camFacing = "environment";
async function startCamera() {
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: camFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  $("#cam-video").srcObject = camStream;
}
function camCount() { $("#cam-count").textContent = photos.length ? `${photos.length} / ${MAX_PHOTOS}` : ""; }
function closeCamera() { camStream?.getTracks().forEach((t) => t.stop()); camStream = null; $("#cam-modal").hidden = true; document.body.style.overflow = ""; }
$("#shoot").addEventListener("click", async (e) => {
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) return; // fall back to the phone's own camera picker
  e.preventDefault();
  try {
    $("#cam-modal").hidden = false; document.body.style.overflow = "hidden"; camCount();
    await startCamera();
  } catch { closeCamera(); showError(t("cam_denied")); }
});
$("#cam-close").addEventListener("click", closeCamera);
$("#cam-flip").addEventListener("click", async () => { camFacing = camFacing === "environment" ? "user" : "environment"; try { await startCamera(); } catch {} });
$("#cam-shoot").addEventListener("click", () => {
  const v = $("#cam-video"); if (!v.videoWidth) return;
  const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  c.toBlob((b) => {
    if (!b) return;
    addPhotos([new File([b], `camera-${Date.now()}.jpg`, { type: "image/jpeg" })]);
    camCount();
    if (photos.length >= MAX_PHOTOS) closeCamera();
  }, "image/jpeg", 0.9);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#cam-modal").hidden) closeCamera(); });

async function runInspection(call, media) {
  showError(""); stopVoice();
  $("#result").hidden = true;
  working(t("working_photo"));
  try {
    inspection = await call();
    inspection._media = media;
    renderInspection();
  } catch (err) { showError(err.message); }
  finally { working(""); }
}

function renderInspection() {
  const d = inspection.diagnosis, m = inspection._media;
  const fig = $("#media");
  const urls = m.urls || [m.url];
  fig.innerHTML = `<div class="media-grid">` + urls.map((u, k) => `<div class="shot"><img src="${u}" alt="">` + d.issues.map((iss, i) => {
    const b = iss.box_2d; if (!b || b.length !== 4) return "";
    if (urls.length > 1 && (Math.max(1, iss.image || 1) - 1) !== k) return "";
    const [y0, x0, y1, x1] = b.map((v) => Math.max(0, Math.min(1000, v)) / 10);
    return `<div class="box ${esc(iss.severity)}" style="top:${y0}%;left:${x0}%;width:${x1 - x0}%;height:${y1 - y0}%"><b>${i + 1}</b></div>`;
  }).join("") + (urls.length > 1 ? `<span class="tagn">${esc(t("photo_n", { n: k + 1 }))}</span>` : "") + `</div>`).join("") + `</div>`;
  const sev = d.overall_severity in { ok: 1, low: 1, medium: 1, high: 1, danger: 1 } ? d.overall_severity : "medium";
  const lo = d.output_loss_low_pct, hi = d.output_loss_high_pct;
  const lossText = lo == null || hi == null ? "" : Math.round(lo) === Math.round(hi) ? t("loss_one", { pct: Math.round(hi) }) : t("loss_range", { low: Math.min(lo, hi), high: Math.max(lo, hi) });
  const loss = lossText ? `<p class="loss-line">${esc(lossText)}</p>` : "";
  $("#verdict").innerHTML = `<span class="sev sev-${sev}">${esc(t("sev_" + sev))}</span><p>${esc(d.summary)}</p>${loss}`;
  $("#issues").innerHTML = d.issues.length ? d.issues.map((iss, i) => `
    <li><span class="num ${esc(iss.severity)}">${i + 1}</span><div>
      <h3><span class="tag sev-${esc(iss.severity)}">${esc(t("sev_" + iss.severity))}</span>${esc(iss.title)}</h3>
      ${iss.where ? `<p class="where">${esc(iss.where)}</p>` : ""}<p>${esc(iss.detail)}</p>${iss.evidence ? `<p class="evidence">${esc(iss.evidence)}</p>` : ""}<p class="cause">${esc(iss.likely_cause)}</p>
      ${iss.risk_if_ignored ? `<p class="risk"><b>${esc(t("risk_label"))}</b> ${esc(iss.risk_if_ignored)}</p>` : ""}
      ${iss.confidence in { high: 1, medium: 1, low: 1 } ? `<p class="conf conf-${iss.confidence}">${esc(t("conf_" + iss.confidence))}</p>` : ""}</div></li>`).join("") : `<li><span class="num">✓</span><div><p>${esc(t("no_issues"))}</p></div></li>`;
  const extra = [d.looks_ok?.length ? `<p><b>${esc(t("looks_ok"))}</b> ${esc(d.looks_ok.join(" · "))}</p>` : "",
    d.next_photo ? `<p><b>${esc(t("next_photo"))}</b> ${esc(d.next_photo)}</p>` : ""].join("");
  $("#extra").innerHTML = extra; $("#extra").hidden = !extra;
  $("#safety").hidden = !d.safety_warning;
  $("#safety").textContent = d.safety_warning || "";
  $("#actions").innerHTML = actionsHTML(d.actions);
  $("#qa").innerHTML = "";
  waText = installerText(d);
  $("#result").hidden = false;
  setCaptions($("#captions"), d.spoken_script);
  voiceState($("#voice"), $("#voice-label"), "ready"); // the voice plays only when the user taps it
  pdfFile = null; $("#pdf-share").textContent = t("share_wa");
  setTimeout(() => { const mine = inspection; makePDF().catch(() => {}).then(() => { if (inspection !== mine) pdfFile = null; }); }, 1200);
  scrollTo($("#result"));
}
function actionsHTML(actions) {
  return actions.map((a) => `<li><span class="who ${a.who === "you" ? "" : "tech"}">${esc(a.who === "you" ? t("you") : t("technician"))}</span><span>${esc(a.step)}</span></li>`).join("");
}
bindPlay($("#play"), $("#voice"), $("#voice-label"), $("#captions"), () => inspection?.diagnosis.spoken_script);
$("#again").addEventListener("click", () => { stopVoice(); $("#result").hidden = true; scrollTo($("main")); });

// Recorded audio (WebM/MP4) -> 16 kHz mono WAV, a format Gemini accepts
async function toWav(blob) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close?.();
    const rate = 16000, len = Math.ceil(buf.duration * rate);
    const off = new OfflineAudioContext(1, len, rate);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const w = (o, str) => [...str].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    w(0, "RIFF"); out.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt "); out.setUint32(16, 16, true);
    out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true);
    out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
    return new Blob([out], { type: "audio/wav" });
  } catch (e) { console.warn("WAV conversion failed, sending original audio", e); return blob; }
}

// follow-up questions
async function ask(payload) {
  if (!inspection) return;
  const fd = new FormData(); fd.append("lang", lang);
  if (payload.text) fd.append("question", payload.text);
  if (payload.audio) fd.append("audio", payload.audio, payload.audio.type === "audio/wav" ? "question.wav" : "question.webm");
  const box = document.createElement("div");
  box.innerHTML = `${payload.text ? `<div class="q">${esc(payload.text)}</div>` : ""}<div class="a">${esc(t("thinking"))}</div>`;
  $("#qa").appendChild(box);
  try {
    const r = await api(`/inspections/${inspection.id}/ask`, { method: "POST", body: fd });
    box.innerHTML = `<div class="q">${esc(r.question_heard)}</div><div class="a"><p class="captions"></p>
      <div class="voice mini"><button class="play" aria-label="${esc(t("listen"))}"><span></span></button><div class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><span class="voice-label"></span></div></div>`;
    const cap = $(".captions", box); cap.textContent = r.answer;
    const vEl = $(".voice", box), lEl = $(".voice-label", box);
    voiceState(vEl, lEl, "ready");
    $(".play", box).addEventListener("click", () => { if (vEl.classList.contains("speaking")) return stopVoice(); speak(r.spoken_script, vEl, lEl, cap); });
  } catch (err) { $(".a", box).textContent = err.message; }
}
$("#ask-form").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#ask-text").value.trim(); if (!q) return; $("#ask-text").value = ""; ask({ text: q }); });

let rec = null, chunks = [], recTimer = null, recTick = null, recCtx = null, recRAF = 0;
function stopWave() {
  cancelAnimationFrame(recRAF); clearInterval(recTick);
  try { recCtx?.close(); } catch {}
  recCtx = null;
}
function startWave(stream) {
  const cv = $("#mic-wave"), g = cv.getContext("2d");
  try {
    recCtx = new (window.AudioContext || window.webkitAudioContext)();
    const an = recCtx.createAnalyser(); an.fftSize = 256;
    recCtx.createMediaStreamSource(stream).connect(an);
    const data = new Uint8Array(an.frequencyBinCount);
    const bars = 14, w = cv.width / bars;
    const draw = () => {
      an.getByteFrequencyData(data);
      g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = "#fff";
      for (let i = 0; i < bars; i++) {
        const v = data[2 + i * 3] / 255, h = Math.max(3, v * cv.height);
        g.fillRect(i * w + 2, (cv.height - h) / 2, w - 4, h);
      }
      recRAF = requestAnimationFrame(draw);
    };
    draw();
  } catch {}
  const t0 = Date.now();
  $("#mic-label").textContent = t("recording", { s: 0 });
  recTick = setInterval(() => { $("#mic-label").textContent = t("recording", { s: Math.round((Date.now() - t0) / 1000) }); }, 500);
}
$("#mic").addEventListener("click", async () => {
  const btn = $("#mic");
  if (rec && rec.state === "recording") { rec.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return showError(t("mic_denied"));
  try {
    stopVoice();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    rec = new MediaRecorder(stream); chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop()); clearTimeout(recTimer); stopWave();
      btn.setAttribute("aria-pressed", "false"); $("#mic-label").textContent = t("mic_start");
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size > 1000) toWav(blob).then((wav) => ask({ audio: wav }));
    };
    rec.start();
    btn.setAttribute("aria-pressed", "true");
    startWave(stream);
    recTimer = setTimeout(() => rec.state === "recording" && rec.stop(), 30000);
  } catch { stopWave(); showError(t("mic_denied")); }
});

// ---------- report for the installer / service team ----------
let waText = "";
function installerText(d) {
  const tech = d.actions.filter((a) => a.who !== "you");
  return [t("wa_hello"), "", `*${t("sev_" + (d.overall_severity in SEV_COLOR ? d.overall_severity : "medium"))}* · ${d.summary}`, "",
    `*${t("issues_h")}*`, ...d.issues.map((i, n) => `${n + 1}. ${i.title} (${t("sev_" + i.severity)})${i.where ? ", " + i.where : ""}: ${i.evidence || i.detail}`),
    ...(d.safety_warning ? ["", `⚠️ ${d.safety_warning}`] : []),
    ...(tech.length ? ["", `*${t("tech_todo")}*`, ...tech.map((a) => `• ${a.step}`)] : []),
    "", t("wa_ask")].join("\n");
}
function openWhatsApp() { window.open("https://wa.me/?text=" + encodeURIComponent(waText), "_blank", "noopener"); }
// ---------- PDF report ----------
// The report is laid out as a normal page (so Urdu, Arabic, Hindi and Chinese text render correctly), drawn to an image, then saved as an A4 PDF.
const LIBS = { h2c: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js", pdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" };
const loadScript = (src) => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
const SEV_COLOR = { ok: "#2e7d4f", low: "#5f7a24", medium: "#b0730c", high: "#c2531f", danger: "#c0352b" };
let pdfFile = null, pdfFor = null;
function reportHTML() {
  const d = inspection.diagnosis;
  const date = new Intl.DateTimeFormat(lang, { dateStyle: "long", timeStyle: "short" }).format(new Date());
  const lo = d.output_loss_low_pct, hi = d.output_loss_high_pct;
  const lossText = lo == null || hi == null ? "" : Math.round(lo) === Math.round(hi) ? t("loss_one", { pct: Math.round(hi) }) : t("loss_range", { low: lo, high: hi });
  const tech = d.actions.filter((a) => a.who !== "you"), owner = d.actions.filter((a) => a.who === "you");
  return `<div class="r-head"><div class="r-brand"><img src="logo.png" alt="">SolarSense</div><div class="r-meta"><b>${esc(t("report_title"))}</b><br>${esc(t("report_for"))}<br>${esc(date)}</div></div>
    <p><span class="r-tag" style="background:${SEV_COLOR[d.overall_severity] || SEV_COLOR.medium}">${esc(t("sev_" + (d.overall_severity in SEV_COLOR ? d.overall_severity : "medium")))}</span><b>${esc(d.summary)}</b></p>
    ${lossText ? `<p>${esc(lossText)}</p>` : ""}
    ${d.safety_warning ? `<p class="r-safety">⚠ ${esc(d.safety_warning)}</p>` : ""}
    <h2>${esc(t("issues_h"))}</h2>
    ${d.issues.length ? d.issues.map((i, n) => `<div class="r-issue"><b><span class="r-tag" style="background:${SEV_COLOR[i.severity]}">${n + 1} · ${esc(t("sev_" + i.severity))}</span>${esc(i.title)}</b>
      ${i.where ? `<div>📍 ${esc(i.where)}${(inspection._media?.urls?.length || 1) > 1 ? ` (${esc(t("photo_n", { n: i.image || 1 }))})` : ""}</div>` : ""}
      <div>${esc(i.evidence || i.detail)}</div><div><b style="display:inline">${esc(t("cause_label"))}</b> ${esc(i.likely_cause)}</div>
      ${i.risk_if_ignored ? `<div><b style="display:inline">${esc(t("risk_label"))}</b> ${esc(i.risk_if_ignored)}</div>` : ""}
      <div style="color:#64708a;font-size:13px">${esc(t("conf_" + (i.confidence || "medium")))}</div></div>`).join("") : `<p>${esc(t("no_issues"))}</p>`}
    ${tech.length ? `<h2>${esc(t("tech_todo"))}</h2><ol>${tech.map((a) => `<li>${esc(a.step)}</li>`).join("")}</ol>` : ""}
    ${owner.length ? `<h2>${esc(t("owner_told"))}</h2><ul>${owner.map((a) => `<li>${esc(a.step)}</li>`).join("")}</ul>` : ""}
    <h2>${esc(t("photos_h"))}</h2>
    <div class="r-photos">${$("#media .media-grid").innerHTML}</div>
    <p class="r-foot">${esc(t("report_foot"))}</p>`;
}
async function makePDF() {
  if (pdfFile && pdfFor === inspection) return pdfFile;
  await Promise.all([loadScript(LIBS.h2c), loadScript(LIBS.pdf)]);
  const el = document.createElement("div");
  el.className = "report"; el.lang = lang; el.dir = L().rtl ? "rtl" : "ltr";
  el.innerHTML = reportHTML();
  document.body.appendChild(el);
  try {
    await Promise.all([...el.querySelectorAll("img")].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
    await document.fonts?.ready;
    const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const pageH = Math.floor(canvas.width * 297 / 210);
    for (let y = 0, page = 0; y < canvas.height; y += pageH, page++) {
      const slice = document.createElement("canvas");
      slice.width = canvas.width; slice.height = Math.min(pageH, canvas.height - y);
      slice.getContext("2d").drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (page) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, slice.height * 210 / canvas.width);
    }
    pdfFile = new File([pdf.output("blob")], `SolarSense-report-${new Date().toLocaleDateString("en-CA")}.pdf`, { type: "application/pdf" });
    pdfFor = inspection;
    return pdfFile;
  } finally { el.remove(); }
}
function downloadFile(f) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$("#pdf").addEventListener("click", async () => {
  const btn = $("#pdf"); if (!inspection) return;
  btn.disabled = true; const label = btn.textContent; btn.textContent = t("pdf_making");
  try { downloadFile(await makePDF()); } catch (e) { console.error(e); showError(t("err_ai")); }
  finally { btn.disabled = false; btn.textContent = label; }
});
// Share: on phones the PDF goes straight into the share sheet (pick WhatsApp). On computers, WhatsApp can't receive a file
// from a website, so the PDF is downloaded and WhatsApp opens with the message ready; attach the PDF there.
$("#pdf-share").addEventListener("click", async () => {
  const btn = $("#pdf-share"); if (!inspection) return;
  const ready = pdfFile && pdfFor === inspection;
  const label = t("share_wa");
  if (!ready) { btn.disabled = true; btn.textContent = t("pdf_making"); }
  try {
    const f = await makePDF();
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], text: waText }); btn.textContent = label; }
      catch (e) { if (e.name === "NotAllowedError") btn.textContent = t("pdf_share"); else btn.textContent = label; }
    } else { downloadFile(f); openWhatsApp(); btn.textContent = label; }
  } catch (e) { console.error(e); openWhatsApp(); btn.textContent = label; }
  finally { btn.disabled = false; }
});

// ---------- B. performance ----------
const CURRENCIES = ["USD", "PKR", "INR", "CNY", "IDR", "SAR"];
const COUNTRY_CURRENCY = { US: "USD", PK: "PKR", IN: "INR", CN: "CNY", ID: "IDR", SA: "SAR" };
const REGION_CURRENCY = COUNTRY_CURRENCY;
const LANG_CURRENCY = { en: "USD", ur: "PKR", hi: "INR", zh: "CNY", id: "IDR", ar: "SAR" };
// Typical household price per kWh, used only to pre-fill (the user can change it)
const SAMPLE_TARIFF = { USD: 0.17, PKR: 50, INR: 8, CNY: 0.55, IDR: 1450, SAR: 0.18 };
$("#currency").innerHTML = CURRENCIES.map((c) => `<option>${c}</option>`).join("");
function warmSun(pl) { if (pl?.lat != null) api(`/sun?lat=${pl.lat}&lon=${pl.lon}`).catch(() => {}); }
function setCurrencyFor(cc) {
  const cur = COUNTRY_CURRENCY[(cc || "").toUpperCase()];
  if (!cur) return;
  const prev = $("#currency").value;
  $("#currency").value = cur;
  const r = $("#rate");
  if (prev !== cur && (!r.value || r.dataset.auto)) { r.value = SAMPLE_TARIFF[cur]; r.dataset.auto = "1"; }
  r.placeholder = SAMPLE_TARIFF[cur];
}
function defaultCurrency() {
  const region = (navigator.language || "").split("-")[1]?.toUpperCase();
  return REGION_CURRENCY[region] || LANG_CURRENCY[lang] || "USD";
}
$("#currency").addEventListener("change", (e) => { e.target.dataset.touched = "1"; $("#rate").placeholder = SAMPLE_TARIFF[e.target.value] ?? ""; });
$("#rate").addEventListener("input", (e) => { delete e.target.dataset.auto; });
let place = null, perfFile = null, usingSample = false;
let suggestTimer = null;
$("#place").addEventListener("input", (e) => {
  place = null; clearTimeout(suggestTimer);
  const q = e.target.value.trim();
  if (q.length < 2) return ($("#suggest").hidden = true);
  suggestTimer = setTimeout(async () => {
    try {
      const rows = await api(`/places?q=${encodeURIComponent(q)}&lang=${lang}`);
      $("#suggest").innerHTML = rows.map((r, i) => `<li role="option" data-i="${i}">${esc(r.name.split(", ")[0])}<small>${esc(r.name.split(", ").slice(1).join(", "))}</small></li>`).join("");
      $("#suggest").hidden = !rows.length; $("#suggest")._rows = rows;
    } catch { $("#suggest").hidden = true; }
  }, 300);
});
let autoTimer = null;
$("#place").addEventListener("input", () => {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(async () => {
    const typed = $("#place").value.trim();
    if (place || typed.length < 3) return;
    try { const rows = await api(`/places?q=${encodeURIComponent(typed)}&lang=${lang}`); if (!place && rows[0] && $("#place").value.trim() === typed) { place = rows[0]; setCurrencyFor(place.cc); warmSun(place); } } catch {}
  }, 1200);
});
$("#suggest").addEventListener("click", (e) => {
  const li = e.target.closest("li"); if (!li) return;
  place = $("#suggest")._rows[+li.dataset.i]; $("#place").value = place.name; $("#suggest").hidden = true; $("#err-place").hidden = true; warmSun(place);
  setCurrencyFor(place.cc);
});
async function nameAndCurrency(url) {
  const r = await (await withTimeoutApp(fetch(url), 8000)).json();
  const name = [r.city || r.locality || r.principalSubdivision, r.countryName].filter(Boolean).join(", ");
  return { name, cc: r.countryCode, lat: r.latitude, lon: r.longitude };
}
const withTimeoutApp = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
$("#geo").addEventListener("click", async () => {
  const btn = $("#geo"); btn.disabled = true; $("#err-place").hidden = true;
  const done = (pl) => {
    place = pl; $("#place").value = pl.name; setCurrencyFor(pl.cc); btn.disabled = false; warmSun(pl);
  };
  const byInternet = async () => { // no GPS: approximate city from the internet connection (free, no key)
    try {
      const r = await nameAndCurrency("https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en");
      if (r.lat == null) throw new Error("no location");
      done({ name: r.name || t("my_location"), lat: +(+r.lat).toFixed(3), lon: +(+r.lon).toFixed(3), cc: r.countryCode || r.cc });
    } catch { btn.disabled = false; $("#err-place").textContent = t("err_place"); $("#err-place").hidden = false; }
  };
  if (!navigator.geolocation) return byInternet();
  navigator.geolocation.getCurrentPosition(async (p) => {
    const lat = +p.coords.latitude.toFixed(3), lon = +p.coords.longitude.toFixed(3);
    let name = t("my_location"), cc;
    try { const r = await nameAndCurrency(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`); name = r.name || name; cc = r.cc; } catch {}
    done({ name, lat, lon, cc });
  }, byInternet, { timeout: 8000, maximumAge: 600000, enableHighAccuracy: false });
});
let perfFiles = [], perfURLs = [];
function renderPerfTray() {
  perfURLs.forEach((u) => URL.revokeObjectURL(u));
  perfURLs = perfFiles.map((f) => URL.createObjectURL(f));
  $("#perf-tray").innerHTML = perfFiles.map((f, i) => `<figure><img src="${perfURLs[i]}" alt=""><button type="button" data-rm="${i}" aria-label="Remove">×</button></figure>`).join("");
  $("#perf-add").hidden = perfFiles.length >= MAX_PHOTOS;
  perfFile = perfFiles[0] || null;
}
$("#perf-file").addEventListener("change", (e) => {
  const add = [...e.target.files].filter(isImageFile); e.target.value = "";
  if (usingSample) { perfFiles = []; usingSample = false; }
  $("#err-file").hidden = true;
  if (perfFiles.length + add.length > MAX_PHOTOS) { $("#err-file").textContent = t("perf_multi"); $("#err-file").hidden = false; }
  perfFiles = [...perfFiles, ...add].slice(0, MAX_PHOTOS);
  renderPerfTray();
});
$("#perf-tray").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (!b) return; perfFiles.splice(+b.dataset.rm, 1); renderPerfTray(); });
$("#perf-sample").addEventListener("click", async () => {
  const blob = await (await fetch("samples/inverter_app.png")).blob();
  perfFile = new File([blob], "inverter_app.png", { type: "image/png" }); perfFiles = [perfFile]; usingSample = true;
  renderPerfTray();
  if (!place) { place = { name: "Islamabad, Pakistan", lat: 33.68, lon: 73.05, cc: "PK" }; $("#place").value = place.name; setCurrencyFor("PK"); }
  warmSun(place);
  if (!$("#rate").value) { const c = $("#currency").value || "USD"; $("#rate").value = SAMPLE_TARIFF[c] ?? 0.2; }
  ["#err-file", "#err-place", "#err-rate"].forEach((s) => ($(s).hidden = true));
});
$("#perf-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  // A city typed but not picked from the list: look it up and take the best match.
  const typed = $("#place").value.trim();
  if (!place && typed.length >= 2) {
    try { const rows = await api(`/places?q=${encodeURIComponent(typed)}&lang=${lang}`); if (rows[0]) { place = rows[0]; $("#place").value = place.name; setCurrencyFor(place.cc); } } catch {}
  }
  // Price left empty: use the typical price for the currency (shown as the grey hint).
  if (!$("#rate").value && SAMPLE_TARIFF[$("#currency").value] != null) $("#rate").value = SAMPLE_TARIFF[$("#currency").value];
  const rate = parseFloat($("#rate").value);
  const kT = parseFloat($("#kwh-today").value), kM = parseFloat($("#kwh-month").value), typedNums = kT > 0 || kM > 0;
  const errs = { "#err-file": !perfFiles.length && !typedNums && t("err_file"), "#err-place": !place && t("err_place"), "#err-rate": !(rate > 0) && t("err_rate") };
  let bad = false;
  Object.entries(errs).forEach(([sel, msg]) => { $(sel).textContent = msg || ""; $(sel).hidden = !msg; bad = bad || !!msg; });
  if (bad) return;
  const fd = new FormData();
  perfFiles.forEach((f) => fd.append("file", f)); fd.append("place", place.name); fd.append("lat", place.lat); fd.append("lon", place.lon);
  fd.append("tariff", rate); fd.append("currency", $("#currency").value); fd.append("lang", lang);
  if ($("#capacity").value) fd.append("capacity_kw", $("#capacity").value);
  if (usingSample) fd.append("sample", "1");
  if (kT > 0) fd.append("kwh_today", kT);
  if (kM > 0) fd.append("kwh_month", kM);
  showError(""); stopVoice(); $("#perf-result").hidden = true; working(t("working_perf"));
  try { renderPerf(await api("/performance", { method: "POST", body: fd })); }
  catch (err) {
    showError(err.message);
    if (perfFiles.length && !usingSample) { $("#manual").open = true; $("#manual").scrollIntoView({ block: "center" }); } // offer typing the numbers instead
  }
  finally { working(""); }
});
["#place", "#rate"].forEach((s) => $(s).addEventListener("input", () => $(s === "#place" ? "#err-place" : "#err-rate").hidden = true));

let perf = null;
function money(n, cur) {
  try { return new Intl.NumberFormat(lang, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n); }
  catch { return `${cur} ${Math.round(n).toLocaleString()}`; }
}
function renderPerf(d) {
  perf = d;
  const f = d.facts, x = d.explanation;
  const pct = Math.round(f.performance_ratio * 100);
  $("#loss").innerHTML = f.status === "healthy"
    ? `<small>${esc(x.summary)}</small><b>${esc(t("healthy_title"))}</b><span>${esc(t("healthy_sub", { pct }))}</span>`
    : `<small>${esc(t("loss_title"))}</small><b>${esc(money(f.lost_money_per_month, f.currency))}</b><span>${esc(t("per_month"))}. ${esc(t("gap_sub", { pct, kwh: f.lost_kwh_per_month }))}</span>`;
  const max = Math.max(f.actual_kwh_per_day, f.expected_kwh_per_day) || 1;
  $("#compare").innerHTML = [["actual", f.actual_kwh_per_day, ""], ["expected", f.expected_kwh_per_day, "exp"]].map(([k, v, c]) =>
    `<div class="bar-row"><span>${esc(t(k))}</span><div class="bar-track"><div class="bar-fill ${c}" style="width:${(v / max) * 100}%"></div></div><b>${v} ${esc(t("per_day"))}</b></div>`).join("");
  const causes = f.status === "healthy" ? [] : (x.likely_causes || []);
  $("#causes").innerHTML = causes.map((c) => typeof c === "string" ? `<li>${esc(c)}</li>`
    : `<li><b>${esc(c.cause)}</b>${c.evidence ? `<br><span class="evidence">${esc(c.evidence)}</span>` : ""}${c.check ? `<br><span>${esc(t("check_label"))} ${esc(c.check)}</span>` : ""}</li>`).join("");
  $("#causes").hidden = $("#causes-h").hidden = !causes.length;
  $("#actions2").previousElementSibling.textContent = t(f.status === "healthy" ? "keep_healthy" : "actions_h");
  $("#actions2").innerHTML = actionsHTML(x.actions);
  const src = f.weather_code ? t("src_" + f.weather_code) : f.weather_source;
  const basis = f.basis_code ? t("basis_" + f.basis_code, { n: f.basis_n }) : f.basis;
  $("#fine").textContent = t("fine", { src, basis }) + (f.fault_codes?.length ? ` ${t("fault_codes")} ${f.fault_codes.join(", ")}` : "");
  $("#perf-result").hidden = false;
  scrollTo($("#perf-result"));
  setCaptions($("#captions2"), x.spoken_script);
  voiceState($("#voice2"), $("#voice-label2"), "ready");
}
bindPlay($("#play2"), $("#voice2"), $("#voice-label2"), $("#captions2"), () => perf?.explanation.spoken_script);
$("#again2").addEventListener("click", () => { stopVoice(); $("#perf-result").hidden = true; scrollTo($("main")); });
$("#home-link").addEventListener("click", (e) => { e.preventDefault(); stopVoice(); $("#result").hidden = $("#perf-result").hidden = true; window.scrollTo(0, 0); });

// ---------- start ----------
(async function start() {
  if (window.SS_MODE !== "firebase") { try { const r = await fetch(`${API}/languages`); if (r.ok) LANGS = await r.json(); } catch {} }
  const saved = store.get("ss_lang");
  showLangScreen();
  if (saved) $(`#lang-grid [data-code="${saved}"]`)?.classList.add("last");
})();
