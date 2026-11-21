// ================= learn.js: the parts of a wave, building a square wave, taking waves apart =================
//
// A wave here is a list of circles { r, omega, phi }: radius, speed in radians per second,
// start angle in degrees. Its height at time t is  offset + Σ r · sin(omega · t + phi).
// Three chapters use the same drawing:
//   parts  – one circle; every part of the wave is labelled
//   square – sine waves added one by one until they look like a square (or triangle, sawtooth)
//   apart  – each wave on its own row; tick waves to add them into the sum

const learnCanvas = $("learnCanvas");
const learnCtx = learnCanvas.getContext("2d");
const stackCanvas = $("stackCanvas");
const stackCtx = stackCanvas.getContext("2d");
const LW = learnCanvas.width;            // 1600
const LH = learnCanvas.height;           // 700
const L_CX = 330, L_CY = LH / 2;         // centre of the first circle
const WAVE_X0 = 700, WAVE_X1 = LW - 20;  // where waves are drawn (the same in both canvases)
const WINDOW_SECONDS = 4;
const PX_PER_SECOND = (WAVE_X1 - WAVE_X0) / WINDOW_SECONDS;

const BASE_OMEGA = Math.PI;              // chapters 2 and 3: the first wave makes half a turn per second
const H = 110;                           // height of the target shapes

let chapter = "parts";
let learnTime = 0;
let learnPlaying = true;
let learnFrame = 0;

const toRad = degrees => degrees * Math.PI / 180;
const thetaOf = (c, t) => c.omega * t + toRad(c.phi);              // θ = ω·t + φ
const wrapDegrees = rad => ((rad * 180 / Math.PI) % 360 + 360) % 360;
const sumAt = (list, t) => list.reduce((sum, c) => sum + c.r * Math.sin(thetaOf(c, t)), 0);
const timeToX = (t, tau) => WAVE_X0 + (t - tau) * PX_PER_SECOND;   // time tau shown at this x
const xToTime = (t, x) => t - (x - WAVE_X0) / PX_PER_SECOND;

// ---------- target shapes and their sine-wave recipes ----------
const TARGETS = {
  square:   theta => H * Math.sign(Math.sin(theta)),
  triangle: theta => H * (2 / Math.PI) * Math.asin(Math.sin(theta)),
  saw:      theta => H * Math.atan2(Math.sin(theta), Math.cos(theta)) / Math.PI,
};

// The first `count` sine waves that add up to a target shape
function recipe(target, count) {
  const list = [];
  for (let n = 1; list.length < count; n++) {
    let k, r, phi;
    if (target === "square")   { k = 2 * n - 1; r = 4 * H / (Math.PI * k); phi = 0; }
    if (target === "triangle") { k = 2 * n - 1; r = 8 * H / (Math.PI * Math.PI * k * k); phi = (n % 2 === 0) ? 180 : 0; }
    if (target === "saw")      { k = n;         r = 2 * H / (Math.PI * k); phi = (k % 2 === 0) ? 180 : 0; }
    list.push({ k: k, r: r, omega: k * BASE_OMEGA, phi: phi });
  }
  return list;
}

// ---------- drawing helpers ----------
function line(ctx, x0, y0, x1, y1, colour, width, dash) {
  ctx.setLineDash(dash || []);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.setLineDash([]);
}

// Draw the wave height(tau) across the wave area, around the middle line y0
function plotWave(ctx, t, y0, scale, height, colour, width, dash) {
  ctx.setLineDash(dash || []);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let x = WAVE_X0; x <= WAVE_X1; x += 2) {
    const y = y0 - scale * height(xToTime(t, x));
    if (x === WAVE_X0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function text(ctx, words, x, y, colour, size, align) {
  ctx.fillStyle = colour;
  ctx.font = `${size || 22}px system-ui, sans-serif`;
  ctx.textAlign = align || "left";
  ctx.fillText(words, x, y);
}

// Circles chained tip to tail, starting at (x, y); returns the tip
function drawChain(ctx, list, t, x, y, scale, colourOf, ringAlpha, alpha = 1) {
  list.forEach((c, i) => {
    const th = thetaOf(c, t);
    const nx = x + scale * c.r * Math.cos(th);
    const ny = y - scale * c.r * Math.sin(th);
    ctx.strokeStyle = colourOf(i);
    ctx.globalAlpha = ringAlpha * alpha;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, scale * c.r, 0, 2 * Math.PI); ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    x = nx; y = ny;
  });
  ctx.globalAlpha = 1;
  return [x, y];
}

function drawPen(ctx, x, y) {
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#ffd23f";
  ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, 2 * Math.PI); ctx.fill();
  ctx.shadowBlur = 0;
}

function drawTimeAxis(ctx, height) {
  line(ctx, WAVE_X0, 40, WAVE_X0, height - 70, "#2a2e35", 2);
  for (let k = 0; k <= WINDOW_SECONDS; k++) {
    const x = WAVE_X0 + k * PX_PER_SECOND;
    ctx.fillStyle = "#9aa1ad";
    ctx.fillRect(x - 1, height - 70, 2, 12);
    text(ctx, k === 0 ? "now" : `${k} s ago`, Math.min(x, LW - 50), height - 30, "#9aa1ad", 22, "center");
  }
  text(ctx, "time →  (the wave moves right as time passes)", WAVE_X0 + 12, 34, "#9aa1ad");
}

function clear(ctx, w, h) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

// ================= chapter 1: the parts of a wave =================
const parts = { A: 120, f: 0.5, phi: 0, offset: 0 };
const partsCircle = () => ({ r: parts.A, omega: 2 * Math.PI * parts.f, phi: parts.phi });

function renderParts() {
  const ctx = learnCtx, t = learnTime, labels = $("lLabels").checked;
  const c = partsCircle();
  const mid = L_CY - parts.offset;                     // the middle line moves with the offset
  clear(ctx, LW, LH);
  line(ctx, 20, L_CY, WAVE_X1, L_CY, "#2a2e35", 2);     // zero line
  drawTimeAxis(ctx, LH);
  if (parts.offset !== 0) {
    line(ctx, 20, mid, WAVE_X1, mid, "rgba(61, 220, 151, 0.7)", 2, [6, 8]);
    if (labels) text(ctx, "middle line (offset)", 30, mid - 10, "#3ddc97", 22);
  }

  // the same wave with phase 0, for comparison
  if (parts.phi !== 0) {
    const ref = { r: c.r, omega: c.omega, phi: 0 };
    plotWave(ctx, t, mid, 1, tau => sumAt([ref], tau), "rgba(255, 255, 255, 0.35)", 2, [8, 8]);
  }
  ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
  ctx.shadowBlur = 10;
  plotWave(ctx, t, mid, 1, tau => sumAt([c], tau), "#ffffff", 4);
  ctx.shadowBlur = 0;

  // the circle
  const [tipX, tipY] = drawChain(ctx, [c], t, L_CX, mid, 1, () => circleColour(0), 0.5);
  line(ctx, tipX, tipY, tipX, mid, "#ffd23f", 2, [10, 10]);
  line(ctx, tipX, tipY, WAVE_X0, tipY, "rgba(255, 255, 255, 0.6)", 2, [10, 10]);
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(WAVE_X0, tipY, 8, 0, 2 * Math.PI); ctx.fill();

  if (labels && c.r > 0) {
    const th = thetaOf(c, t);
    const shown = toRad(wrapDegrees(th));
    const R = Math.max(26, Math.min(60, c.r * 0.35));
    line(ctx, L_CX, mid, L_CX + c.r + 20, mid, "rgba(255, 255, 255, 0.35)", 2, [10, 10]);
    ctx.strokeStyle = "#ffd23f";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(L_CX, mid, R, 0, -shown, true); ctx.stroke();
    ctx.font = "italic bold 28px system-ui, sans-serif";
    text(ctx, "θ", L_CX + (R + 22) * Math.cos(shown / 2), mid - (R + 22) * Math.sin(shown / 2) + 9, "#ffd23f", 28, "center");
    // the start angle φ: where the arm was at t = 0
    if (parts.phi !== 0) {
      const p = toRad(parts.phi);
      line(ctx, L_CX, mid, L_CX + c.r * Math.cos(p), mid - c.r * Math.sin(p), "rgba(255, 255, 255, 0.5)", 2, [4, 8]);
      text(ctx, "start φ", L_CX + (c.r + 30) * Math.cos(p), mid - (c.r + 30) * Math.sin(p) + 8, "#c9ced6", 20, "center");
    }
    text(ctx, "r", (L_CX + tipX) / 2 - 18 * Math.sin(th), (mid + tipY) / 2 - 18 * Math.cos(th), circleColour(0), 28, "center");

    // amplitude and period, measured on the wave at its most recent peaks
    const w = c.omega;
    const n = Math.floor((w * t + toRad(parts.phi) - Math.PI / 2) / (2 * Math.PI));
    const peak1 = (Math.PI / 2 + 2 * Math.PI * n - toRad(parts.phi)) / w;    // latest peak at or before now
    const peak2 = peak1 - 2 * Math.PI / w;                                    // the one before
    const x1 = timeToX(t, peak1), x2 = timeToX(t, peak2);
    const peakY = mid - c.r;
    if (x1 > WAVE_X0 + 30 && x1 < WAVE_X1 - 30) {
      line(ctx, x1, mid, x1, peakY + 6, "#ff8c42", 3);
      line(ctx, x1 - 8, peakY + 16, x1, peakY + 4, "#ff8c42", 3);
      line(ctx, x1 + 8, peakY + 16, x1, peakY + 4, "#ff8c42", 3);
      text(ctx, "amplitude A", x1 + 10, (mid + peakY) / 2 + 8, "#ff8c42", 22);
    }
    if (x2 < WAVE_X1 - 10 && x1 > WAVE_X0) {
      const y = peakY - 24;
      line(ctx, x1, y, Math.min(x2, WAVE_X1), y, "#4cc9f0", 3);
      line(ctx, x1, y - 10, x1, y + 10, "#4cc9f0", 3);
      if (x2 <= WAVE_X1) line(ctx, x2, y - 10, x2, y + 10, "#4cc9f0", 3);
      text(ctx, `period T = ${(1 / parts.f).toFixed(2)} s`, (x1 + Math.min(x2, WAVE_X1)) / 2, y - 14, "#4cc9f0", 22, "center");
    }
    // where t = 0 is, while it is still on screen
    const x0 = timeToX(t, 0);
    if (x0 <= WAVE_X1) {
      line(ctx, x0, 60, x0, LH - 90, "rgba(255, 255, 255, 0.4)", 2, [4, 6]);
      text(ctx, "t = 0", x0 + 6, LH - 96, "#c9ced6", 20);
    }
  }
  drawPen(ctx, tipX, tipY);
}

function showPartsNumbers() {
  const t = learnTime, c = partsCircle();
  const th = thetaOf(c, t);
  const y = parts.offset + c.r * Math.sin(th);
  $("pA").textContent = parts.A;
  $("pF").textContent = parts.f.toFixed(2) + " Hz";
  $("pT").textContent = (1 / parts.f).toFixed(2) + " s";
  $("pW").textContent = c.omega.toFixed(2) + " rad/s";
  $("pP").textContent = parts.phi + "°";
  $("pO").textContent = parts.offset;
  $("pNow").textContent =
    `height = offset + A · sin(ω · t + φ)\n` +
    `       = ${parts.offset} + ${parts.A} · sin(${c.omega.toFixed(2)} × ${t.toFixed(2)} + ${parts.phi}°)\n` +
    `       = ${parts.offset} + ${parts.A} · sin(${wrapDegrees(th).toFixed(0)}°)\n` +
    `       = ${y.toFixed(1)}`;
}

for (const [id, key, unit] of [["pAmp", "A", ""], ["pFreq", "f", " Hz"], ["pPhase", "phi", "°"], ["pOffset", "offset", ""]]) {
  $(id).addEventListener("input", () => {
    parts[key] = Number($(id).value);
    $(id + "Out").textContent = $(id).value + unit;
  });
}

// ================= chapter 2: build a square wave =================
let squareTarget = "square";
let squareCount = 1;
let squareWaves = recipe("square", 1);

// Keep the drawing the same size however many waves are used
const squareScale = () => Math.min(1, 300 / recipe(squareTarget, 20).reduce((s, c) => s + c.r, 0));

function squareChanged() {
  squareWaves = recipe(squareTarget, squareCount);
  $("sCount").value = squareCount;
  $("sCountOut").textContent = squareCount;
  $("sLess").disabled = squareCount <= 1;
  $("sMore").disabled = squareCount >= 20;
  // how close is the sum to the shape we want? (one period, many points)
  const target = TARGETS[squareTarget];
  let gap = 0, top = 0;
  const steps = 2000;
  for (let i = 0; i < steps; i++) {
    const theta = 2 * Math.PI * i / steps;
    const sum = sumAt(squareWaves, theta / BASE_OMEGA);
    gap += Math.abs(sum - target(theta));
    top = Math.max(top, sum);
  }
  $("sErr").textContent = `${(100 * gap / steps / H).toFixed(1)}% of the height`;
  // overshoot, measured as a share of the jump (from −H to +H): about 9% however many waves
  $("sOver").textContent = squareTarget === "square" ? `${Math.max(0, 100 * (top - H) / (2 * H)).toFixed(1)}% of the jump` : "–";
  $("sTable").querySelector("tbody").innerHTML = squareWaves.map((c, i) => `
    <tr>
      <td><span class="dot" style="--c:${circleColour(i)}"></span></td>
      <td>${c.k}×</td>
      <td>${squareTarget === "triangle" ? `1/${c.k * c.k}` : `1/${c.k}`}</td>
      <td>${c.r.toFixed(1)}</td>
      <td>${c.phi}°</td>
    </tr>`).join("");
}

function renderSquare() {
  const ctx = learnCtx, t = learnTime, s = squareScale();
  const target = TARGETS[squareTarget];
  const targetAt = tau => target(BASE_OMEGA * tau);
  clear(ctx, LW, LH);
  line(ctx, 20, L_CY, WAVE_X1, L_CY, "#2a2e35", 2);
  drawTimeAxis(ctx, LH);

  if ($("sGap").checked) {                            // shade between the sum and the target
    ctx.fillStyle = "rgba(255, 77, 109, 0.25)";
    for (let x = WAVE_X0; x < WAVE_X1; x += 2) {
      const tau = xToTime(t, x);
      const a = L_CY - s * sumAt(squareWaves, tau), b = L_CY - s * targetAt(tau);
      ctx.fillRect(x, Math.min(a, b), 2, Math.abs(a - b));
    }
  }
  if ($("sOwn").checked && squareWaves.length > 1) {
    squareWaves.forEach((c, i) => plotWave(ctx, t, L_CY, s, tau => sumAt([c], tau), circleColour(i), 2));
  }
  plotWave(ctx, t, L_CY, s, targetAt, "#ffd23f", 3, [12, 10]);
  ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
  ctx.shadowBlur = 10;
  plotWave(ctx, t, L_CY, s, tau => sumAt(squareWaves, tau), "#ffffff", 4);
  ctx.shadowBlur = 0;

  const [tipX, tipY] = drawChain(ctx, squareWaves, t, L_CX, L_CY, s, circleColour, 0.5);
  line(ctx, tipX, tipY, WAVE_X0, tipY, "rgba(255, 255, 255, 0.6)", 2, [10, 10]);
  if ($("lLabels").checked) {
    text(ctx, "yellow dashed: the shape we want", 30, 40, "#ffd23f", 22);
    text(ctx, `white: the sum of ${squareWaves.length} sine wave${squareWaves.length === 1 ? "" : "s"}`, 30, 70, "#ffffff", 22);
  }
  drawPen(ctx, tipX, tipY);
}

choice("sTarget", "data-target", value => { squareTarget = value; squareChanged(); });
$("sCount").addEventListener("input", () => { squareCount = Number($("sCount").value); squareChanged(); });
$("sLess").addEventListener("click", () => { squareCount = Math.max(1, squareCount - 1); squareChanged(); });
$("sMore").addEventListener("click", () => { squareCount = Math.min(20, squareCount + 1); squareChanged(); });

// ================= chapter 3: take apart and combine =================
// Each wave: { k (speed as a multiple of the first), r, phi, on (in the sum?) }
let apartWaves = [];
let apartSource = "square";
const ROW = 150, SUM_ROW = 240;                      // row heights in the stacked picture
const STACK_CX = 580;                                // where each row's circle sits (labels go to its left)

const apartCircle = w => ({ r: w.r, omega: w.k * BASE_OMEGA, phi: w.phi });
const apartAll = () => apartWaves.map(apartCircle);
const apartOn = () => apartWaves.filter(w => w.on).map(apartCircle);
const apartScale = () => Math.min(1, 300 / Math.max(1, apartWaves.reduce((s, w) => s + w.r, 0)));
const apartRowScale = () => Math.min(1, (ROW / 2 - 14) / Math.max(1, ...apartWaves.map(w => w.r)));

function loadApart(source) {
  apartSource = source;
  if (source === "tones") {
    apartWaves = [{ k: 2, r: 90, phi: 0, on: true }, { k: 3, r: 70, phi: 0, on: true }];
  } else {
    const count = source === "triangle" ? 4 : 6;
    apartWaves = recipe(source, count).map(c => ({ k: c.k, r: Math.round(c.r), phi: c.phi, on: true }));
  }
  renderApartCards();
}

function apartTarget() {
  if (apartSource === "tones") return null;
  const f = TARGETS[apartSource];
  return tau => f(BASE_OMEGA * tau);
}

function apartSlider(name, label, min, max, step, value, unit) {
  return `
    <label class="slider">
      <span>${label}</span>
      <input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}">
      <output>${value}${unit}</output>
    </label>`;
}

function renderApartCards() {
  const list = $("aCards");
  list.innerHTML = "";
  apartWaves.forEach((w, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.setProperty("--c", circleColour(i));
    card.innerHTML = `
      <div class="card-head">
        <span class="dot"></span><strong>Wave ${i + 1}</strong>
        <label class="check"><input type="checkbox" name="on" ${w.on ? "checked" : ""}> in the sum</label>
        <button class="remove" aria-label="Remove wave ${i + 1}">✕</button>
      </div>
      ${apartSlider("r", "Height", 0, 160, 1, w.r, "")}
      ${apartSlider("k", "Speed", 1, 15, 1, w.k, "×")}
      ${apartSlider("phi", "Phase", 0, 355, 5, w.phi, "°")}`;
    card.querySelector('[name="on"]').addEventListener("change", e => { w.on = e.target.checked; showApartFormula(); });
    card.querySelectorAll('input[type="range"]').forEach(input => {
      input.addEventListener("input", () => {
        w[input.name] = Number(input.value);
        input.nextElementSibling.textContent = input.value + input.dataset.unit;
        showApartFormula();
      });
    });
    const remove = card.querySelector(".remove");
    remove.disabled = apartWaves.length === 1;
    remove.addEventListener("click", () => { apartWaves.splice(i, 1); renderApartCards(); });
    list.appendChild(card);
  });
  $("aAdd").disabled = apartWaves.length >= 8;
  stackCanvas.height = apartWaves.length * ROW + SUM_ROW;
  showApartFormula();
}

function showApartFormula() {
  const on = apartWaves.filter(w => w.on);
  $("aFormula").textContent = "sum = " + (on.map(w => `${w.r}·sin(${w.k === 1 ? "" : w.k}ωt + ${w.phi}°)`).join("\n    + ") || "0") +
    "\n\nω = π rad/s (the first wave makes half a turn per second)";
}

function renderApart() {
  // the main picture: only the ticked waves
  const ctx = learnCtx, t = learnTime, s = apartScale();
  const on = apartOn(), all = apartAll(), target = apartTarget();
  clear(ctx, LW, LH);
  line(ctx, 20, L_CY, WAVE_X1, L_CY, "#2a2e35", 2);
  drawTimeAxis(ctx, LH);
  plotWave(ctx, t, L_CY, s, tau => sumAt(all, tau), "rgba(255, 255, 255, 0.3)", 3);
  if (target) plotWave(ctx, t, L_CY, s, target, "#ffd23f", 3, [12, 10]);
  ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
  ctx.shadowBlur = 10;
  plotWave(ctx, t, L_CY, s, tau => sumAt(on, tau), "#ffffff", 4);
  ctx.shadowBlur = 0;
  const colourOn = i => circleColour(apartWaves.indexOf(apartWaves.filter(w => w.on)[i]));
  const [tipX, tipY] = drawChain(ctx, on, t, L_CX, L_CY, s, colourOn, 0.5);
  line(ctx, tipX, tipY, WAVE_X0, tipY, "rgba(255, 255, 255, 0.6)", 2, [10, 10]);
  if ($("lLabels").checked) {
    text(ctx, `white: the ${on.length} ticked wave${on.length === 1 ? "" : "s"} added`, 30, 40, "#ffffff", 22);
    text(ctx, "grey: all waves added", 30, 70, "#9aa1ad", 22);
    if (target) text(ctx, "yellow dashed: the shape we want", 30, 100, "#ffd23f", 22);
  }
  drawPen(ctx, tipX, tipY);

  // the stacked picture: every wave on its own row, then the sum
  const sc = stackCtx, rs = apartRowScale();
  clear(sc, LW, stackCanvas.height);
  apartWaves.forEach((w, i) => {
    const c = apartCircle(w);
    const mid = i * ROW + ROW / 2;
    const colour = circleColour(i);
    const alpha = w.on ? 1 : 0.3;                      // waves left out of the sum are dimmed
    line(sc, 20, mid, WAVE_X1, mid, "#2a2e35", 2);
    const [tx, ty] = drawChain(sc, [c], t, STACK_CX, mid, rs, () => colour, 0.5, alpha);
    sc.globalAlpha = alpha;
    line(sc, tx, ty, WAVE_X0, ty, "rgba(255, 255, 255, 0.4)", 2, [8, 8]);
    plotWave(sc, t, mid, rs, tau => sumAt([c], tau), colour, 3);
    sc.globalAlpha = 1;
    text(sc, `Wave ${i + 1}${w.on ? "" : "  (not in the sum)"}`, 30, mid - 6, w.on ? "#f2f3f5" : "#6b7280", 24);
    text(sc, `speed ${w.k}×, height ${w.r}, phase ${w.phi}°`, 30, mid + 24, w.on ? "#9aa1ad" : "#4b5260", 20);
    line(sc, 0, (i + 1) * ROW, LW, (i + 1) * ROW, "#16191e", 2);
  });
  const mid = apartWaves.length * ROW + SUM_ROW / 2;
  line(sc, 20, mid, WAVE_X1, mid, "#2a2e35", 2);
  plotWave(sc, t, mid, rs, tau => sumAt(all, tau), "rgba(255, 255, 255, 0.3)", 3);
  if (target) plotWave(sc, t, mid, rs, target, "#ffd23f", 3, [12, 10]);
  plotWave(sc, t, mid, rs, tau => sumAt(on, tau), "#ffffff", 4);
  text(sc, "Sum of the ticked waves", 30, apartWaves.length * ROW + 36, "#ffffff", 24);
  text(sc, "white: ticked · grey: all" + (target ? " · yellow: the shape we want" : ""),
       30, apartWaves.length * ROW + 66, "#9aa1ad", 20);
}

choice("aSource", "data-source", value => loadApart(value));
$("aAllOn").addEventListener("click", () => { apartWaves.forEach(w => { w.on = true; }); renderApartCards(); });
$("aAllOff").addEventListener("click", () => { apartWaves.forEach(w => { w.on = false; }); renderApartCards(); });
$("aAdd").addEventListener("click", () => {
  const used = new Set(apartWaves.map(w => w.k));
  let k = 1;
  while (used.has(k) && k < 15) k++;
  apartWaves.push({ k: k, r: 40, phi: 0, on: true });
  renderApartCards();
});

// ================= shared controls =================
choice("lChapters", "data-chapter", value => {
  chapter = value;
  document.querySelectorAll("[data-chapter-panel]").forEach(p => { p.hidden = p.dataset.chapterPanel !== chapter; });
  stackCanvas.hidden = chapter !== "apart";
  learnTime = 0;
});
$("lPlay").addEventListener("click", () => {
  learnPlaying = !learnPlaying;
  $("lPlay").textContent = learnPlaying ? "Pause" : "Play";
});
$("lReset").addEventListener("click", () => { learnTime = 0; });
$("lSpeed").addEventListener("input", () => {
  $("lSpeedOut").textContent = "× " + (Number($("lSpeed").value) / 100).toFixed(2);
});
$("lSave").addEventListener("click", () => savePicture(learnCanvas, "learn-" + chapter));

// ---------- hooks for app.js ----------
modes.learn = {
  frame(dt) {
    if (learnPlaying) learnTime += dt * Number($("lSpeed").value) / 100;
    if (chapter === "parts") {
      renderParts();
      if (learnFrame++ % 4 === 0) showPartsNumbers();     // too fast to read every frame
    }
    if (chapter === "square") renderSquare();
    if (chapter === "apart") renderApart();
  },
  busy: () => false,
};

squareChanged();
loadApart("square");