// ================= learn.js: what are θ, ω and t? A circle and the sine wave it makes =================
const learnCanvas = $("learnCanvas");
const learnCtx = learnCanvas.getContext("2d");
const LW = learnCanvas.width;            // 1600
const LH = learnCanvas.height;           // 700
const L_CX = 330, L_CY = LH / 2;         // centre of the first circle (canvas pixels)
const WAVE_X0 = 700, WAVE_X1 = LW - 20;  // where the wave is drawn
const WINDOW_SECONDS = 4;                // how much time the wave shows
const PX_PER_SECOND = (WAVE_X1 - WAVE_X0) / WINDOW_SECONDS;
const LEARN_MAX = 6;
const SUB = ["₁", "₂", "₃", "₄", "₅", "₆"];  // little numbers: θ₁, θ₂ …

// In this mode each circle is { r (radius), omega (radians per second), phi (start angle, degrees) }
const LEARN_PRESETS = {
  one:      [{ r: 120, omega: 2, phi: 0 }],
  two:      [{ r: 120, omega: 2, phi: 0 }, { r: 50, omega: 6, phi: 0 }],
  square:   [{ r: 140, omega: 2, phi: 0 }, { r: 47, omega: 6, phi: 0 },
             { r: 28, omega: 10, phi: 0 }, { r: 20, omega: 14, phi: 0 }],
  sawtooth: [{ r: 120, omega: 2, phi: 0 }, { r: 60, omega: 4, phi: 180 }, { r: 40, omega: 6, phi: 0 },
             { r: 30, omega: 8, phi: 180 }, { r: 24, omega: 10, phi: 0 }],
};

let learnCircles = [];
let learnTime = 0;            // t, in seconds
let learnPlaying = true;
let learnFrame = 0;

const toRad = degrees => degrees * Math.PI / 180;
const thetaOf = (c, t) => c.omega * t + toRad(c.phi);             // θ = ω·t + φ
const wrapDegrees = rad => ((rad * 180 / Math.PI) % 360 + 360) % 360;
const learnHeight = (list, t) => list.reduce((sum, c) => sum + c.r * Math.sin(thetaOf(c, t)), 0);

// Zoom out if the circles together are too big for the canvas
function learnScale() {
  const total = learnCircles.reduce((sum, c) => sum + c.r, 0);
  return Math.min(1, 300 / Math.max(total, 1));
}

// ---------- drawing ----------
function dashed(ctx, x0, y0, x1, y1, colour) {
  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.setLineDash([]);
}

function renderLearn() {
  const ctx = learnCtx;
  const s = learnScale();
  const t = learnTime;
  const labels = $("lLabels").checked;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, LW, LH);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // axes: the middle line, the start of the wave, and the time scale
  ctx.strokeStyle = "#2a2e35";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(20, L_CY); ctx.lineTo(WAVE_X1, L_CY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(WAVE_X0, 40); ctx.lineTo(WAVE_X0, LH - 70); ctx.stroke();
  ctx.fillStyle = "#9aa1ad";
  ctx.font = "22px system-ui, sans-serif";
  ctx.textAlign = "center";
  for (let k = 0; k <= WINDOW_SECONDS; k++) {
    const x = WAVE_X0 + k * PX_PER_SECOND;
    ctx.fillRect(x - 1, LH - 70, 2, 12);
    ctx.fillText(k === 0 ? "now" : `${k} s ago`, Math.min(x, LW - 50), LH - 30);
  }
  ctx.textAlign = "left";
  ctx.fillText("time →  (the wave moves right as time passes)", WAVE_X0 + 12, 34);

  if (learnCircles.length === 0) return;

  // each circle's own wave, faint
  if ($("lOwnWaves").checked && learnCircles.length > 1) {
    learnCircles.forEach((c, i) => {
      ctx.strokeStyle = circleColour(i);
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = WAVE_X0; x <= WAVE_X1; x += 2) {
        const tau = t - (x - WAVE_X0) / PX_PER_SECOND;          // the moment shown at this x
        const y = L_CY - s * c.r * Math.sin(thetaOf(c, tau));
        if (x === WAVE_X0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  // the wave: the height of the pen at every moment of the last few seconds
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  for (let x = WAVE_X0; x <= WAVE_X1; x += 2) {
    const tau = t - (x - WAVE_X0) / PX_PER_SECOND;
    const y = L_CY - s * learnHeight(learnCircles, tau);
    if (x === WAVE_X0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // the circles, each riding on the tip of the one before
  let x = L_CX, y = L_CY;
  const joints = [[x, y]];
  learnCircles.forEach((c, i) => {
    const th = thetaOf(c, t);
    const nx = x + s * c.r * Math.cos(th);
    const ny = y - s * c.r * Math.sin(th);                     // minus: canvas y points down
    ctx.strokeStyle = circleColour(i);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, s * c.r, 0, 2 * Math.PI); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    x = nx; y = ny;
    joints.push([x, y]);
  });
  const [tipX, tipY] = joints[joints.length - 1];

  // the height of the pen, and the line carrying it over to the wave
  dashed(ctx, tipX, tipY, tipX, L_CY, "#ffd23f");
  dashed(ctx, tipX, tipY, WAVE_X0, tipY, "rgba(255, 255, 255, 0.6)");
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(WAVE_X0, tipY, 8, 0, 2 * Math.PI); ctx.fill();

  if (labels) {
    // θ for the first circle: the angle from "pointing right", measured anticlockwise
    const c = learnCircles[0];
    const th = thetaOf(c, t);
    const shown = ((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const R = Math.max(26, Math.min(60, s * c.r * 0.35));
    dashed(ctx, L_CX, L_CY, L_CX + s * c.r + 20, L_CY, "rgba(255, 255, 255, 0.35)");   // θ = 0 direction
    ctx.strokeStyle = "#ffd23f";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(L_CX, L_CY, R, 0, -shown, true); ctx.stroke();
    ctx.fillStyle = "#ffd23f";
    ctx.font = "italic bold 28px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(learnCircles.length > 1 ? "θ₁" : "θ",
                 L_CX + (R + 24) * Math.cos(shown / 2), L_CY - (R + 24) * Math.sin(shown / 2) + 9);
    // r on the first arm
    const [ax, ay] = joints[1];
    ctx.fillStyle = circleColour(0);
    ctx.fillText(learnCircles.length > 1 ? "r₁" : "r",
                 (L_CX + ax) / 2 - 18 * Math.sin(th), (L_CY + ay) / 2 - 18 * Math.cos(th));
    // the height
    ctx.fillStyle = "#ffd23f";
    ctx.font = "22px system-ui, sans-serif";
    const outside = tipX < L_CX;                               // put the word on the outer side
    ctx.textAlign = outside ? "right" : "left";
    ctx.fillText("height", tipX + (outside ? -10 : 10), (tipY + L_CY) / 2 + 8);
  }

  // the pen
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#ffd23f";
  ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(tipX, tipY, 10, 0, 2 * Math.PI); ctx.fill();
  ctx.shadowBlur = 0;
}

// ---------- the live numbers ----------
function showNumbers() {
  const t = learnTime;
  const n = learnCircles.length;
  if (n === 0) { $("lNow").textContent = "Add a circle to start."; return; }
  const c = learnCircles[0];
  const th = thetaOf(c, t);
  const deg = th * 180 / Math.PI;
  const sub = n > 1 ? SUB[0] : "";
  const turns = Math.floor(deg / 360);
  let text =
    `t = ${t.toFixed(2)} s\n` +
    `θ${sub} = ω${sub}·t + φ${sub} = ${c.omega.toFixed(2)} × ${t.toFixed(2)} + ${c.phi}° = ${th.toFixed(2)} rad = ${deg.toFixed(0)}°\n`;
  if (turns !== 0) text += `    = ${turns} whole turn${Math.abs(turns) === 1 ? "" : "s"} + ${wrapDegrees(th).toFixed(0)}°\n`;
  text += `height${sub} = r${sub}·sin θ${sub} = ${c.r} × sin(${wrapDegrees(th).toFixed(0)}°) = ${(c.r * Math.sin(th)).toFixed(1)}`;
  if (n > 1) {
    const parts = learnCircles.map(q => (q.r * Math.sin(thetaOf(q, t))).toFixed(1));
    text += `\n\ntotal height = ${parts.join(" + ")}\n             = ${learnHeight(learnCircles, t).toFixed(1)}`;
  }
  $("lNow").textContent = text;

  // the table, one row per circle
  $("lTable").querySelector("tbody").innerHTML = learnCircles.map((q, i) => {
    const thq = thetaOf(q, t);
    return `<tr>
      <td><span class="dot" style="--c:${circleColour(i)}"></span></td>
      <td>${q.r}</td>
      <td>${q.omega.toFixed(1)}</td>
      <td>${(q.omega / (2 * Math.PI)).toFixed(2)}</td>
      <td>${wrapDegrees(thq).toFixed(0)}°</td>
      <td>${(q.r * Math.sin(thq)).toFixed(1)}</td>
    </tr>`;
  }).join("");
}

// The whole wave as a formula, e.g. y(t) = 120·sin(2.0t + 0°) + 50·sin(6.0t + 0°)
function showFormula() {
  const terms = learnCircles.map(c => `${c.r}·sin(${c.omega.toFixed(1)}t + ${c.phi}°)`);
  $("lFormula").textContent = "y(t) = " + (terms.join(" + ") || "0");
}

// ---------- the circle cards ----------
function learnSlider(name, label, min, max, step, value, unit) {
  return `
    <label class="slider">
      <span>${label}</span>
      <input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}" data-unit="${unit}">
      <output>${value}${unit}</output>
    </label>`;
}

function renderLearnCards() {
  const list = $("lCards");
  list.innerHTML = "";
  learnCircles.forEach((c, i) => {
    const sub = SUB[i];
    const card = document.createElement("div");
    card.className = "card";
    card.style.setProperty("--c", circleColour(i));
    card.innerHTML = `
      <div class="card-head">
        <span class="dot"></span><strong>Circle ${i + 1}</strong>
        <button class="remove" aria-label="Remove circle ${i + 1}">✕</button>
      </div>
      ${learnSlider("r", `Radius r${sub}`, 0, 200, 1, c.r, "")}
      ${learnSlider("omega", `Speed ω${sub}`, -16, 16, 0.1, c.omega, " rad/s")}
      ${learnSlider("phi", `Start φ${sub}`, 0, 355, 5, c.phi, "°")}`;
    card.querySelectorAll("input").forEach(input => {
      input.addEventListener("input", () => {
        c[input.name] = Number(input.value);
        input.nextElementSibling.textContent = input.value + input.dataset.unit;
        showFormula();
      });
    });
    const remove = card.querySelector(".remove");
    remove.disabled = learnCircles.length === 1;
    remove.addEventListener("click", () => {
      learnCircles.splice(i, 1);
      learnListChanged();
    });
    list.appendChild(card);
  });
  $("lAdd").disabled = learnCircles.length >= LEARN_MAX;
}

function learnListChanged() {
  renderLearnCards();
  showFormula();
}

function loadLearn(list) {
  learnCircles = list.map(c => ({ ...c }));
  learnTime = 0;
  learnListChanged();
}

// ---------- buttons ----------
$("lPlay").addEventListener("click", () => {
  learnPlaying = !learnPlaying;
  $("lPlay").textContent = learnPlaying ? "Pause" : "Play";
});
$("lReset").addEventListener("click", () => { learnTime = 0; });
$("lSpeed").addEventListener("input", () => {
  $("lSpeedOut").textContent = "× " + (Number($("lSpeed").value) / 100).toFixed(2);
});
$("lAdd").addEventListener("click", () => {
  const first = learnCircles[0] || { r: 120, omega: 2 };
  const k = learnCircles.length + 1;                     // the next circle: k times faster, k times smaller
  learnCircles.push({ r: Math.max(5, Math.round(first.r / k)), omega: first.omega * k, phi: 0 });
  learnListChanged();
});
document.querySelectorAll("[data-learn]").forEach(button => {
  button.addEventListener("click", () => loadLearn(LEARN_PRESETS[button.dataset.learn]));
});
$("lSave").addEventListener("click", () => savePicture(learnCanvas, "circle-and-wave"));

// ---------- hooks for app.js ----------
modes.learn = {
  frame(dt) {
    if (learnPlaying) learnTime += dt * Number($("lSpeed").value) / 100;
    renderLearn();
    if (learnFrame++ % 4 === 0) showNumbers();         // the numbers change too fast to read every frame
  },
  busy: () => false,
};

loadLearn(LEARN_PRESETS.one);