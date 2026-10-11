// ---------- set-up ----------
const canvas = document.getElementById("sheet");
const ctx = canvas.getContext("2d");
const SIZE = canvas.width;          // the canvas is SIZE x SIZE pixels
const CENTRE = SIZE / 2;
const MAX_ARROWS = 8;
const COLOURS = ["#1f6feb", "#d1495b", "#1e7f74", "#b26b00",
                 "#7b4fd6", "#c2462a", "#2f6f8f", "#4f7a36"];

// Each arrow: radius (length in pixels), speed (turns per lap), start (angle in degrees)
const PRESETS = {
  circle:   [{ radius: 450, speed: 1, start: 0 }],
  ellipse:  [{ radius: 320, speed: 1, start: 0 }, { radius: 160, speed: -1, start: 0 }],
  heart:    [{ radius: 320, speed: 1, start: 270 }, { radius: 160, speed: 2, start: 270 }],
  triangle: [{ radius: 380, speed: 1, start: 0 }, { radius: 120, speed: -2, start: 0 }],
  square:   [{ radius: 400, speed: 1, start: 0 }, { radius: 80, speed: -3, start: 0 }],
  flower:   [{ radius: 280, speed: 1, start: 0 }, { radius: 190, speed: 6, start: 0 }],
};

let arrows = [];       // the arrows currently on screen
let path = [];         // the whole drawing for one lap, as a list of [x, y] points
let lap = 0;           // how far through the current lap we are, from 0 to 1
let playing = true;
let lastTime = null;

// ---------- the maths ----------

// Where every arrow's tip is at one moment of the lap (lapPos from 0 to 1).
// Returns the centre followed by each tip; the last point is the pen.
function chainAt(lapPos) {
  const points = [[0, 0]];
  let x = 0, y = 0;
  for (const a of arrows) {
    const angle = a.start * Math.PI / 180 + 2 * Math.PI * a.speed * lapPos;
    x += a.radius * Math.cos(angle);
    y += a.radius * Math.sin(angle);
    points.push([x, y]);
  }
  return points;
}

// Work out the pen's whole path for one lap, so we can show it all at once
function rebuildPath() {
  const N = 720;
  path = [];
  for (let i = 0; i <= N; i++) {
    const points = chainAt(i / N);
    path.push(points[points.length - 1]);
  }
}

// ---------- drawing ----------

function strokePath(points, from, to, colour, width) {
  if (to <= from) return;
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[from][0], points[from][1]);
  for (let i = from + 1; i <= to; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
}

function drawFrame() {
  // Zoom out when the arrows together are longer than half the canvas
  const total = arrows.reduce((sum, a) => sum + a.radius, 0);
  const zoom = Math.min(1, (CENTRE - 40) / Math.max(total, 1));
  const px = 1 / zoom;              // one canvas pixel, measured in zoomed units

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);
  // From here on: origin in the middle, y pointing UP (as in maths class), zoomed to fit
  ctx.setTransform(zoom, 0, 0, -zoom, CENTRE, CENTRE);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // The whole drawing, faint, then the part the pen has drawn in this lap
  strokePath(path, 0, path.length - 1, "#d3d7de", 3 * px);
  strokePath(path, 0, Math.floor(lap * (path.length - 1)), "#16203a", 6 * px);

  // Each arrow and its circle, in its own colour
  const points = chainAt(lap);
  arrows.forEach((a, i) => {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    ctx.strokeStyle = COLOURS[i];

    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2 * px;
    ctx.beginPath(); ctx.arc(x0, y0, a.radius, 0, 2 * Math.PI); ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.lineWidth = 6 * px;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  });

  // The pen
  const [penX, penY] = points[points.length - 1];
  ctx.fillStyle = "#16203a";
  ctx.beginPath(); ctx.arc(penX, penY, 12 * px, 0, 2 * Math.PI); ctx.fill();
}

// ---------- animation loop ----------

function tick(timeMs) {
  if (lastTime === null) lastTime = timeMs;
  const dt = (timeMs - lastTime) / 1000;       // seconds since the last frame
  lastTime = timeMs;

  const lapSeconds = Number(document.getElementById("lapTime").value);
  if (playing) lap = (lap + dt / lapSeconds) % 1;

  drawFrame();
  if (recorder) drawReelFrame();
  requestAnimationFrame(tick);
}

// ---------- controls ----------

const list = document.getElementById("arrowList");
const addButton = document.getElementById("add");

function slider(name, label, min, max, step, value, unit) {
  return `
    <label class="slider">
      <span>${label}</span>
      <input type="range" name="${name}" min="${min}" max="${max}" step="${step}"
             value="${value}" data-unit="${unit}">
      <output>${value}${unit}</output>
    </label>`;
}

// Build one card of sliders per arrow
function renderControls() {
  list.innerHTML = "";
  arrows.forEach((a, i) => {
    const card = document.createElement("div");
    card.className = "arrow";
    card.style.setProperty("--c", COLOURS[i]);
    card.innerHTML = `
      <div class="arrow-head">
        <span class="dot"></span><strong>Circle ${i + 1}</strong>
        <button class="remove" aria-label="Remove circle ${i + 1}">✕</button>
      </div>
      ${slider("radius", "Radius", 10, 400, 5, a.radius, "")}
      ${slider("speed", "Speed", -6, 6, 1, a.speed, "")}
      ${slider("start", "Starting position", 0, 345, 15, a.start, "°")}`;

    // Moving a slider changes this arrow and redraws the path
    card.querySelectorAll("input").forEach(input => {
      input.addEventListener("input", () => {
        a[input.name] = Number(input.value);
        input.nextElementSibling.textContent = input.value + input.dataset.unit;
        rebuildPath();
      });
    });

    const remove = card.querySelector(".remove");
    remove.disabled = arrows.length === 1;
    remove.addEventListener("click", () => {
      arrows.splice(i, 1);
      arrowsChanged();
    });

    list.appendChild(card);
  });
  addButton.disabled = arrows.length >= MAX_ARROWS;
}

function arrowsChanged() {
  rebuildPath();
  renderControls();
}

addButton.addEventListener("click", () => {
  const speeds = [-4, -3, -2, 2, 3, 4];
  const speed = speeds[Math.floor(Math.random() * speeds.length)];
  arrows.push({ radius: 80, speed: speed, start: 0 });
  arrowsChanged();
});

document.querySelectorAll("[data-preset]").forEach(button => {
  button.addEventListener("click", () => {
    // Copy each preset arrow, so moving a slider never changes the preset itself
    arrows = PRESETS[button.dataset.preset].map(a => ({ ...a }));
    lap = 0;
    arrowsChanged();
  });
});

const playButton = document.getElementById("play");
playButton.addEventListener("click", () => {
  playing = !playing;
  playButton.textContent = playing ? "Pause" : "Play";
});

const lapTime = document.getElementById("lapTime");
lapTime.addEventListener("input", () => {
  document.getElementById("lapOut").textContent = lapTime.value + " s";
});

// ---------- recording a Reel ----------
const reel = document.createElement("canvas");      // a 9:16 canvas only the recorder sees
reel.width = 1080;
reel.height = 1920;
const reelCtx = reel.getContext("2d");
let recorder = null;                                 // null means "not recording"

function drawReelFrame() {
  reelCtx.fillStyle = "white";
  reelCtx.fillRect(0, 0, 1080, 1920);
  reelCtx.drawImage(canvas, 0, 420, 1080, 1080);     // the square drawing, in the middle
  reelCtx.fillStyle = "#16203a";
  reelCtx.font = "bold 64px system-ui";
  reelCtx.textAlign = "center";
  reelCtx.fillText("Spinning circles", 540, 340);
}

document.getElementById("record").addEventListener("click", () => {
  if (recorder) return;                              // already recording
  const type = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
  const chunks = [];

  recorder = new MediaRecorder(reel.captureStream(60), { mimeType: type, videoBitsPerSecond: 8000000 });
  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onstop = () => {
    const video = new Blob(chunks, { type: type });  // glue the pieces into one file
    const link = document.createElement("a");
    link.href = URL.createObjectURL(video);
    link.download = "spinning-circles." + (type === "video/mp4" ? "mp4" : "webm");
    link.click();                                    // offer the file to the visitor
    recorder = null;
  };

  lap = 0;                                           // start from the beginning of the shape
  playing = true;
  recorder.start();
  const lapSeconds = Number(document.getElementById("lapTime").value);
  setTimeout(() => recorder.stop(), lapSeconds * 1000 );   // one lap, plus 1 s to admire it
});

// ---------- start ----------
arrows = PRESETS.heart.map(a => ({ ...a }));
arrowsChanged();
requestAnimationFrame(tick);