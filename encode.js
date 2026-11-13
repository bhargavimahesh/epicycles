// ================= MODE 2: draw a closed line and encode it as circles =================
const pad = $("pad");
const padCtx = pad.getContext("2d");
const repro = $("repro");
const reproCtx = repro.getContext("2d");
const PAD = pad.width;            // 1000
const PAD_CENTRE = PAD / 2;
const N = 256;                    // evenly spaced points we give to Fourier
const MAX_SPEED = 50;             // speeds -50 ... +50: 100 moving circles
const encodeTransport = makeTransport("e");
const encodeReel = makeReel(repro);
const countSlider = $("count");

let points = [];        // what you drew, in pad pixels
let drawing = false;    // is the pen touching right now?
let original = [];      // your line, resampled, in maths coordinates
let allCircles = [];    // every circle Fourier found: speed 0 first, then biggest first
let encCircles = [];    // the circles in use (slider)
let encPath = [];       // the line those circles draw in one lap

// ---------- the white drawing pad ----------
function toPad(event) {
  const box = pad.getBoundingClientRect();
  return [(event.clientX - box.left) * PAD / box.width,
          (event.clientY - box.top) * PAD / box.height];
}

function renderPad() {
  padCtx.fillStyle = "#fff";
  padCtx.fillRect(0, 0, PAD, PAD);
  if (points.length === 0) {
    padCtx.fillStyle = "#b8bcc4";
    padCtx.font = "36px system-ui, sans-serif";
    padCtx.textAlign = "center";
    padCtx.fillText("Draw here", PAD_CENTRE, PAD_CENTRE);
    return;
  }
  padCtx.lineCap = "round";
  padCtx.lineJoin = "round";
  padCtx.strokeStyle = "#111";
  padCtx.lineWidth = 7;
  padCtx.beginPath();
  points.forEach(([x, y], i) => i === 0 ? padCtx.moveTo(x, y) : padCtx.lineTo(x, y));
  padCtx.stroke();

  // after lifting the pen: show how the loop gets closed
  if (!drawing && points.length > 1) {
    const [x0, y0] = points[points.length - 1];
    const [x1, y1] = points[0];
    padCtx.setLineDash([10, 12]);
    padCtx.strokeStyle = "#9aa1ad";
    padCtx.lineWidth = 3;
    padCtx.beginPath(); padCtx.moveTo(x0, y0); padCtx.lineTo(x1, y1); padCtx.stroke();
    padCtx.setLineDash([]);
  }
}

// ---------- encoding: your line -> circles ----------
function encode() {
  if (points.length < 3) {
    clearEncoding();
    $("eStatus").textContent = "That was just a dot. Draw a line.";
    return;
  }
  const even = resample(points, N);
  original = even.map(([x, y]) => [x - PAD_CENTRE, PAD_CENTRE - y]);   // maths coordinates, y up
  allCircles = sortCircles(dft(original, MAX_SPEED));
  encodeTransport.lap = 0;
  encodeTransport.setPlaying(true);
  $("eStatus").textContent = "";
  useCircles();
}

// Use only the biggest few circles, as chosen on the slider
function useCircles() {
  const count = Number(countSlider.value);
  $("countOut").textContent = count;
  if (allCircles.length === 0) return;
  encCircles = allCircles.slice(0, count + 1);           // +1 for the circle that doesn't move
  encPath = pathOf(encCircles);
  showStats(count);
  drawSpectrum();
  fillRecipe();
}

// How many numbers, and how close the circles get to your line
function showStats(count) {
  let miss = 0;
  for (let n = 0; n < N; n++) {
    const chain = chainAt(encCircles, n / N);
    const [x, y] = chain[chain.length - 1];
    miss += Math.hypot(x - original[n][0], y - original[n][1]);
  }
  $("statLine").textContent = `${N} points = ${2 * N} numbers`;
  $("statCode").textContent = `${count} circles = ${3 * count} numbers`;
  $("statError").textContent = `${(miss / N).toFixed(1)} px`;
}

function clearEncoding() {
  original = [];
  allCircles = [];
  encCircles = [];
  encPath = [];
  $("statLine").textContent = "–";
  $("statCode").textContent = "–";
  $("statError").textContent = "–";
  drawSpectrum();
  fillRecipe();
}

// ---------- the recipe: bar chart of circle sizes ----------
const spectrum = $("spectrum");
const tip = $("tip");

function drawSpectrum() {
  const dpr = window.devicePixelRatio || 1;
  const w = spectrum.clientWidth, h = spectrum.clientHeight;
  if (!w) return;                                       // hidden: draw it when shown
  spectrum.width = w * dpr;
  spectrum.height = h * dpr;
  const g = spectrum.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.font = "12px system-ui, sans-serif";

  if (allCircles.length === 0) {
    g.fillStyle = "#6b7280";
    g.textAlign = "center";
    g.fillText("Draw something to see its recipe", w / 2, h / 2);
    return;
  }
  const moving = allCircles.filter(c => c.speed !== 0);
  const biggest = Math.max(...moving.map(c => c.radius));
  const inUse = new Set(encCircles.map(c => c.speed));
  const base = h - 22, top = 8, slot = w / (2 * MAX_SPEED + 1);

  for (const c of moving) {
    const barH = Math.max(1, (base - top) * c.radius / biggest);
    g.fillStyle = inUse.has(c.speed) ? "#ffd23f" : "#3a3f47";
    g.fillRect((c.speed + MAX_SPEED) * slot + slot * 0.15, base - barH, Math.max(1, slot * 0.7), barH);
  }
  g.fillStyle = "#3a3f47";
  g.fillRect(0, base, w, 1);                            // baseline
  g.fillStyle = "#9aa1ad";
  g.textAlign = "left";   g.fillText("speed −" + MAX_SPEED, 0, h - 5);
  g.textAlign = "center"; g.fillText("0", w / 2, h - 5);
  g.textAlign = "right";  g.fillText("+" + MAX_SPEED, w, h - 5);
}

// Hover or tap a bar to read its numbers
spectrum.addEventListener("pointermove", showTip);
spectrum.addEventListener("pointerdown", showTip);
spectrum.addEventListener("pointerleave", () => { tip.hidden = true; });

function showTip(event) {
  if (allCircles.length === 0) return;
  const box = spectrum.getBoundingClientRect();
  const x = event.clientX - box.left;
  const slot = box.width / (2 * MAX_SPEED + 1);
  const speed = Math.floor(x / slot) - MAX_SPEED;
  const c = allCircles.find(q => q.speed === speed);
  if (!c || speed === 0) { tip.hidden = true; return; }
  const used = encCircles.some(q => q.speed === speed);
  tip.textContent = `speed ${speed > 0 ? "+" : ""}${speed}: radius ${c.radius.toFixed(1)} px · ${used ? "in use" : "not used"}`;
  tip.style.left = Math.min(Math.max(x, 90), box.width - 90) + "px";
  tip.style.top = (event.clientY - box.top) + "px";
  tip.hidden = false;
}

// The biggest circles in use, as a table
function fillRecipe() {
  const body = document.querySelector("#recipe tbody");
  body.innerHTML = "";
  const moving = encCircles.map((c, i) => ({ c: c, i: i })).filter(o => o.c.speed !== 0);
  moving.slice(0, 10).forEach(({ c, i }) => {
    const degrees = Math.round(((c.start * 180 / Math.PI) % 360 + 360) % 360);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><span class="dot" style="--c:${circleColour(i)}"></span></td>
      <td>${c.speed > 0 ? "+" : ""}${c.speed}</td>
      <td>${c.radius.toFixed(1)}</td>
      <td>${degrees}°</td>`;
    body.appendChild(row);
  });
  if (moving.length > 10) {
    const row = document.createElement("tr");
    row.innerHTML = `<td></td><td colspan="3" class="muted">and ${moving.length - 10} smaller ones</td>`;
    body.appendChild(row);
  }
}

// ---------- example drawings (in pad pixels) ----------
function exampleStar() {
  const corners = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 === 0 ? 400 : 165;
    corners.push([PAD_CENTRE + r * Math.cos(a), PAD_CENTRE + 20 + r * Math.sin(a)]);
  }
  return alongEdges(corners);
}
function exampleSquare() {
  return alongEdges([[180, 180], [820, 180], [820, 820], [180, 820]]);
}
function exampleHeart() {
  const list = [];
  for (let i = 0; i < 200; i++) {
    const t = 2 * Math.PI * i / 200;
    list.push([PAD_CENTRE + 22 * 16 * Math.sin(t) ** 3,
               PAD_CENTRE - 30 - 22 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
  }
  return list;
}
// Points along the straight edges between corners, back to the start
function alongEdges(corners) {
  const list = [];
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length];
    for (let s = 0; s < 30; s++) list.push([a[0] + (b[0] - a[0]) * s / 30, a[1] + (b[1] - a[1]) * s / 30]);
  });
  return list;
}
const EXAMPLES = { star: exampleStar, heart: exampleHeart, square: exampleSquare };

// ---------- pen ----------
pad.addEventListener("pointerdown", event => {
  if (encodeReel.isRecording()) return;
  drawing = true;
  points = [toPad(event)];
  clearEncoding();
  pad.setPointerCapture(event.pointerId);
  $("eStatus").textContent = "";
  renderPad();
});

pad.addEventListener("pointermove", event => {
  if (!drawing) return;
  const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
  events.forEach(e => points.push(toPad(e)));
  renderPad();
});

function penUp() {
  if (!drawing) return;
  drawing = false;
  renderPad();
  encode();
}
pad.addEventListener("pointerup", penUp);
pad.addEventListener("pointercancel", penUp);

// ---------- buttons ----------
countSlider.addEventListener("input", () => {
  if (!drawing) useCircles();
});

$("eClear").addEventListener("click", () => {
  points = [];
  clearEncoding();
  renderPad();
  $("eStatus").textContent = "";
});

document.querySelectorAll("[data-example]").forEach(button => {
  button.addEventListener("click", () => {
    points = EXAMPLES[button.dataset.example]();
    renderPad();
    encode();
  });
});

// Hand the biggest circles to mode 1 so they can be changed by hand
$("sendBuild").addEventListener("click", () => {
  if (allCircles.length === 0) {
    $("eStatus").textContent = "Draw something first.";
    return;
  }
  const picks = encCircles
    .filter(c => c.speed !== 0 && Math.abs(c.speed) <= 20)     // speeds mode 1 can show
    .slice(0, 8)
    .map(c => ({
      radius: Math.max(1, Math.round(c.radius)),
      speed: c.speed,
      start: ((Math.round(c.start * 180 / Math.PI / 5) * 5) % 360 + 360) % 360,
    }));
  modes.build.load(picks);
  showMode("build");
  window.scrollTo(0, 0);                         // show mode 1 from the top
  $("bStatus").textContent =
    `These are the ${picks.length} biggest circles of your drawing, rounded. Change them and see what happens.`;
});

$("eSave").addEventListener("click", () => {
  if (encCircles.length === 0) { $("eStatus").textContent = "Draw something first."; return; }
  drawScene(reproCtx, encCircles, encPath, 1, { ghost: original });
  savePicture(repro, "my-drawing-in-circles");
});

$("eRecord").addEventListener("click", () => {
  if (encCircles.length === 0) { $("eStatus").textContent = "Draw something first."; return; }
  const count = encCircles.length - 1;
  $("eStatus").textContent = "Recording one lap…";
  $("eRecord").disabled = true;
  encodeReel.start(encodeTransport.seconds(), "drawn-by-circles", `Drawn by ${count} circles`, () => {
    $("eStatus").textContent = "Video saved to your downloads.";
    $("eRecord").disabled = false;
  });
});

window.addEventListener("resize", drawSpectrum);

// ---------- hooks for app.js ----------
function renderRepro() {
  drawScene(reproCtx, encCircles, encPath, encodeTransport.lap, {
    ghost: original,
    empty: drawing ? "Lift the pen to turn it into circles" : "Your circles will appear here",
  });
}

modes.encode = {
  frame(dt, timeMs) {
    if (encodeReel.isRecording()) {
      encodeReel.step(timeMs, lapPos => { encodeTransport.lap = lapPos; renderRepro(); });
    } else {
      encodeTransport.advance(dt);
      renderRepro();
    }
    encodeTransport.sync();
  },
  busy: () => encodeReel.isRecording(),
  shown: drawSpectrum,
};

renderPad();
clearEncoding();