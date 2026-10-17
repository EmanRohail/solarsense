const fs = require("fs");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun,
  ShadingType, BorderStyle, AlignmentType, LevelFormat, ExternalHyperlink, Footer, PageNumber } = require("docx");

const INK = "39256F", SOFT = "64708A", GREEN = "39256F", WASH = "F6F3FF", GBG = "E9E1FF", RULE = "E4DDF7";
const W = 9026; // A4 content width in DXA with 1" margins

const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120, line: 300 }, ...opts,
  children: (Array.isArray(text) ? text : [text]).map(t => typeof t === "string" ? new TextRun(t) : t) });
const b = (t) => new TextRun({ text: t, bold: true });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const bullet = (parts) => new Paragraph({ numbering: { reference: "bul", level: 0 }, spacing: { after: 80, line: 290 },
  children: (Array.isArray(parts) ? parts : [parts]).map(t => typeof t === "string" ? new TextRun(t) : t) });
let NUM_INSTANCE = 0;
const restart = () => { NUM_INSTANCE += 1; return null; };
const num = (parts) => new Paragraph({ numbering: { reference: "num", level: 0, instance: NUM_INSTANCE }, spacing: { after: 80, line: 290 },
  children: (Array.isArray(parts) ? parts : [parts]).map(t => typeof t === "string" ? new TextRun(t) : t) });

const border = { style: BorderStyle.SINGLE, size: 4, color: RULE };
const borders = { top: border, bottom: border, left: border, right: border };
function table(widths, rows, headFill = INK) {
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths,
    rows: rows.map((r, i) => new TableRow({ tableHeader: i === 0, cantSplit: true, children: r.map((c, j) => new TableCell({
      width: { size: widths[j], type: WidthType.DXA }, borders,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: i === 0 ? headFill : (i % 2 ? "FFFFFF" : WASH) },
      children: [new Paragraph({ spacing: { after: 0, line: 270 }, children: [new TextRun({ text: c, bold: i === 0 || j === 0, color: i === 0 ? "FFFFFF" : INK, size: 19 })] })]
    })) })) });
}
function callout(lines, fill = GBG, color = GREEN) {
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows: [new TableRow({ children: [new TableCell({
    width: { size: W, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
    margins: { top: 200, bottom: 200, left: 240, right: 240 }, shading: { type: ShadingType.CLEAR, color: "auto", fill },
    children: lines.map((l, i) => new Paragraph({ spacing: { after: i === lines.length - 1 ? 0 : 100, line: 300 },
      children: [new TextRun({ text: l, bold: i === 0, color: i === 0 ? color : INK, size: i === 0 ? 20 : 24 })] })) })] })] });
}
const link = (text, url) => new ExternalHyperlink({ link: url, children: [new TextRun({ text, style: "Hyperlink" })] });
const gap = () => new Paragraph({ spacing: { after: 120 }, children: [] });

const img = (file, w, h) => new Paragraph({ spacing: { before: 80, after: 160 }, children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: w, height: h } })] });

const body = [
  new Paragraph({ spacing: { after: 160 }, children: [new ImageRun({ type: "png", data: fs.readFileSync("../images/wordmark.png"), transformation: { width: 228, height: 60 } })] }),
  new Paragraph({ style: "Title", children: [new TextRun("SolarSense: Problem Statement")] }),
  p([new TextRun({ text: "Google Cloud AI Builder Cup 2026  |  Scope, tech stack and workflow", color: SOFT })], { spacing: { after: 240 } }),
  table([2600, W - 2600], [
    ["Item", "Details"],
    ["Team", "TechVerz"],
    ["Team leader", "Syed Mohammed Bin Khalid"],
    ["Challenge track", "Sustainability & Social Impact"],
    ["Solution", "SolarSense: a talking AI solar technician. Show the problem in a photo or video, hear what's wrong in your own language (15 languages, including English, Urdu, Hindi, Arabic and Chinese)"],
  ]),
  gap(),
  callout(["The problem in one sentence",
    "Tens of millions of households and small businesses around the world now own rooftop solar, but when the system underperforms or shows a fault, most owners can't tell what's wrong, how much it is costing them, or whether it is safe, and expert help is slow, costly and often not in their language."]),

  h1("1. Background"),
  p("Solar power is no longer mostly big solar farms. A huge share now sits on the roofs of homes, shops, farms and factories, owned by ordinary people:"),
  bullet("In 2025 the world added about 282 GW of distributed (mostly rooftop) solar, 41% of all new solar, up from 228 GW in 2024."),
  bullet("The biggest distributed markets in 2025 were China (159 GW), Pakistan (about 14 GW), India (12 GW), Germany, Brazil, the United States and Japan. Four of the top ten are in the JAPAC region."),
  bullet("The IEA expects the number of households relying on rooftop solar to grow from about 25 million to more than 100 million by 2030."),
  bullet("Many of these systems are installed and maintained by small local installers, and in fast-growing markets many technicians are self-taught. In Pakistan, for example, every gigawatt added in 2025 was distributed, and many technicians learned the job through YouTube and WhatsApp groups."),
  p("Each of these owners has made a big investment, but almost none of them has the knowledge or tools to look after it."),

  h1("2. The problem"),
  h2("2.1 Owners can't tell if their system is underperforming"),
  p("Inverter apps show numbers (kW, kWh) but not whether those numbers are good. An owner has no easy way to compare what the system made with what it should have made in that day's weather, so losses of 15 to 30% from dust or shading can go unnoticed for months."),
  h2("2.2 Even when something looks wrong, they don't know what it is"),
  bullet("Dust, bird droppings and shade from water tanks or trees are common and quietly cut output."),
  bullet("Inverters show error codes such as \"F07 Grid Over Voltage\" that mean nothing to most people."),
  bullet("Cracked panels, hotspots and burnt connectors are hard to recognise and easy to ignore."),
  h2("2.3 Some problems are dangerous"),
  p("Damaged panels and DC wiring can cause electric shocks and fires. Without guidance, owners may climb onto roofs, spray water on cracked panels or open inverters themselves."),
  h2("2.4 Help is slow, costly and not in their language"),
  p("A technician visit takes time and money, quality varies, and most monitoring tools and manuals are in English. Across Asia, Africa, Latin America and the Middle East, most owners are more comfortable speaking and listening in their own language, such as Urdu, Hindi, Bengali, Arabic or Indonesian, than reading technical English."),

  h1("3. Who is affected"),
  table([2200, 3413, 3413], [
    ["Who", "Current pain", "What they need"],
    ["Homeowners", "Paid a lot for solar, but don't know if it's working properly or what an error means", "A clear verdict, the cost in their own currency, and safe next steps in their language"],
    ["Small businesses and farms", "Lost output directly raises their electricity bills", "Fast diagnosis without waiting for a site visit"],
    ["Installers and technicians", "Many calls are for simple issues; hard to diagnose remotely", "A clear report with photos, findings and error codes before they visit"],
    ["The energy transition", "Underperforming and unsafe systems waste investment and damage trust in solar", "Systems that keep working well for their full life"],
  ]),

  h1("4. Existing solutions and the gap"),
  table([2700, 3163, 3163], [
    ["Solution", "What it does", "Gap"],
    ["Inverter apps (Solarman, SolisCloud and others)", "Show live power and daily energy", "Numbers only: no verdict, no cause, no comparison with the weather, English only"],
    ["AI monitoring platforms for companies", "Analyse inverter data across many sites for solar companies", "Built for installers and asset owners, need data connections, not for a homeowner"],
    ["Technician visit", "Expert inspection on site", "Slow, costs money, quality varies"],
    ["YouTube and WhatsApp groups", "General advice", "Not about your system; unsafe advice is common"],
  ], GREEN),
  gap(),
  p("We found no tool that lets an ordinary owner show the problem with their phone camera and get a spoken diagnosis in their own language, with the problem marked on the photo and the cost in money."),

  h1("5. Problem statement"),
  callout(["How might we...",
    "How might we help rooftop solar owners anywhere in the world understand what is wrong with their system, how much it is costing them and what to do about it safely, simply by showing a photo, video or app screenshot and listening to the answer in their own language?"], WASH, INK),
  gap(),
  p([b("Fit with the Sustainability & Social Impact track: "), "keeping the world's fast-growing fleet of rooftop solar systems healthy protects households' savings, reduces wasted clean energy and keeps people safe, in a language they understand."]),

  h1("6. Scope"),
  h2("In scope for the prototype"),
  restart(), num([b("Talking inspection: "), "upload or take a photo or 10 to 20 second video of panels, the inverter screen or wiring. Gemini finds the issues, draws boxes around them on photos, rates severity, and gives safe steps. The diagnosis is spoken aloud in the user's language and shown as text at the same time: a written card for each issue (what it is, how serious, likely cause, what to do) and live captions of what the voice is saying."]),
  num([b("Voice follow-up: "), "the user holds the mic and asks a question about the diagnosis; SolarSense answers out loud."]),
  num([b("Performance check: "), "upload an inverter app screenshot, share the location and electricity rate. SolarSense reads the numbers, compares them with expected output from real local sunshine anywhere in the world, and shows the units and money lost per month in the local currency."]),
  num([b("Installer report: "), "a ready-to-send WhatsApp message summarising the findings."]),
  num([b("Samples: "), "three sample photos (dusty panels, inverter fault, cracked panel) and one sample app screenshot, so judges can try it without their own system."]),
  h2("Languages"),
  p("SolarSense writes and speaks in the 15 most widely spoken languages, so the same app works for owners across JAPAC and the rest of the world. Text comes from Gemini; voice comes from Gemini text-to-speech."),
  table([3000, 2200, W - 5200], [
    ["Language", "Text and captions", "Voice"],
    ["English", "Yes", "Yes"], ["Mandarin Chinese", "Yes", "Yes (preview)"], ["Hindi", "Yes", "Yes"],
    ["Spanish", "Yes", "Yes"], ["French", "Yes", "Yes"], ["Standard Arabic", "Yes", "Yes (preview)"],
    ["Bengali", "Yes", "Yes"], ["Portuguese", "Yes", "Yes"], ["Russian", "Yes", "Yes"],
    ["Urdu", "Yes", "Yes (preview)"], ["Indonesian", "Yes", "Yes"], ["German", "Yes", "Yes"],
    ["Japanese", "Yes", "Yes"], ["Nigerian Pidgin", "Yes", "Read by the English voice (no Pidgin voice yet)"],
    ["Egyptian Arabic", "Yes", "Yes"],
  ]),
  gap(),
  p("Arabic and Urdu are shown right to left. The user can also ask follow-up questions by voice in any of these languages."),
  h2("Out of scope for now"),
  bullet("Hardware sensors, drones or thermal cameras"),
  bullet("Direct connection to inverter cloud accounts (screenshots are used instead)"),
  bullet("Booking or paying technicians"),
  bullet("Live real-time video calls with the agent (planned future work)"),
  bullet("Large solar farms and detailed battery diagnostics"),

  h1("7. Tech stack"),
  table([2600, W - 2600], [
    ["Technology", "What it does in SolarSense"],
    ["Gemini 2.5 Flash", "Looks at photos and videos, finds problems and returns their location as boxes; reads inverter screens and app screenshots; understands the user's spoken question; writes explanations. All as structured JSON"],
    ["Gemini text-to-speech", "Speaks the diagnosis and answers in 14 of the 15 languages; Nigerian Pidgin is read by the English voice"],
    ["Cloud Run", "Runs the Python (FastAPI) backend and all agent steps"],
    ["Cloud Firestore", "Stores inspections, follow-up questions and performance checks. Photos and videos are not stored"],
    ["Firebase Hosting", "Serves the mobile-friendly web app and routes /api to Cloud Run"],
    ["Open-Meteo", "Free weather and place-search service: actual daily sunshine for any location in the world"],
    ["Browser camera and microphone", "Take photos and videos and record voice questions straight from the phone"],
    ["Cost", "Zero for the competition: Google Cloud free trial, Gemini free tier, free weather data"],
  ]),

  h1("8. Workflow"),
  p([b("Step 0, before anything else: "), "the first screen asks the user to choose their language from the 15 options. Every written card, caption, answer and voice after that is in the chosen language, and it can be changed at any time."]),
  img("../images/workflow.png", 600, 202),
  h2("A. Talking inspection"),
  restart(), num("Having chosen their language on the first screen, the user takes a photo or short video."),
  num("The file goes to Cloud Run, which sends it to Gemini with an inspection prompt and a fixed answer format."),
  num("Gemini returns the subject, issues with severity, likely cause and box positions, the estimated output loss, safe actions, a safety warning, and a spoken script."),
  num("The app draws boxes on the photo and shows each issue as a written card. Gemini text-to-speech reads the script aloud while the same words appear as captions, so the user can listen, read, or both."),
  num("The user can hold the mic and ask a follow-up question. Gemini hears it and answers out loud and in writing, using the diagnosis as context."),
  num("The user follows the safe steps or sends the installer report on WhatsApp. The result is saved in Firestore."),
  h2("B. Performance check"),
  restart(), num("The user uploads a screenshot from their inverter app and shares their location (search for a town or use the phone's location) and their electricity rate and currency."),
  num("Gemini reads the capacity, daily and monthly energy, and any fault codes."),
  num("Cloud Run gets that location's recent daily sunshine from Open-Meteo and calculates expected output: capacity × peak sun hours × 0.78."),
  num("The gap is converted to units (kWh) and money lost per month, in the user's own currency (for example PKR, INR, IDR, USD or EUR), never a fixed currency."),
  num("Gemini explains the likely causes and next steps, shown as text and spoken aloud."),

  h1("9. Success criteria"),
  table([3600, W - 3600], [
    ["Goal", "How we measure it"],
    ["Correct diagnosis", "Issues found in a test set of labelled solar photos and videos (dust, shade, cracks, hotspots, error codes)"],
    ["Correct numbers", "Values read from inverter screenshots match the screenshot"],
    ["Understandable", "Spoken explanation under about 45 seconds, always shown as text too; tested with Urdu-speaking and other non-English-speaking users"],
    ["Safe", "Every electrical or roof risk comes with a warning and is sent to a technician"],
    ["Fast", "Answer and voice within about 20 seconds for a photo"],
    ["Free to run", "No cost during the competition"],
  ]),

  h1("10. Assumptions and constraints"),
  bullet("Sample photos are illustrations; the team will add real photos of rooftop systems with the owners' permission."),
  bullet("SolarSense gives guidance, not certified electrical inspection. Anything risky is referred to a technician."),
  bullet("Expected output uses a typical performance ratio of 0.78, so it is an estimate, not an exact figure."),
  bullet("Built on Google Cloud: Gemini, Cloud Run, Cloud Firestore and Firebase Hosting, as required by the competition."),

  h1("Sources"),
  bullet(link("Global distributed solar installations reach 282 GW in 2025, IEA PVPS (TaiyangNews)", "https://taiyangnews.info/markets/iea-pvps-trends-in-pv-applications-2026")),
  bullet(link("Approximately 100 million households rely on rooftop solar PV by 2030 (IEA)", "https://www.iea.org/reports/approximately-100-million-households-rely-on-rooftop-solar-pv-by-2030")),
  bullet(link("Pakistan's solar boom (World Resources Institute)", "https://www.wri.org/insights/pakistan-solar-energy-boom")),
    bullet(link("AI-powered solar PV health check offer (IP Singapore)", "https://www.ipi-singapore.org/tech-offer/download-pdf/175317")),
  bullet(link("Gemini-TTS supported languages (Google Cloud)", "https://docs.cloud.google.com/text-to-speech/docs/gemini-tts")),
];

const doc = new Document({
  creator: "Team TechVerz", title: "SolarSense: Problem Statement",
  styles: {
    default: { document: { run: { font: "Arial", size: 21, color: INK } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal", run: { size: 52, bold: true, color: INK }, paragraph: { spacing: { after: 80 } } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, color: INK }, paragraph: { spacing: { before: 320, after: 140 }, outlineLevel: 0, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, color: "7453D6" }, paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1, keepNext: true } },
    ],
  },
  numbering: { config: [
    { reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    { reference: "num", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
      new TextRun({ text: "SolarSense: Problem Statement   |   Page ", size: 16, color: SOFT }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: SOFT })] })] }) },
    children: body.filter(Boolean),
  }],
});
Packer.toBuffer(doc).then(buf => { fs.writeFileSync("SolarSense_Problem_Statement.docx", buf); console.log("ok"); });
