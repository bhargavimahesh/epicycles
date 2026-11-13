// ================= MODE 1: build a shape from circles =================
const buildCanvas = $("buildCanvas");
const buildCtx = buildCanvas.getContext("2d");
const buildTransport = makeTransport("b");
const buildReel = makeReel(buildCanvas);
const BUILD_MAX = 10;                      // most circles a person can add

// In this mode each circle is { radius (px), speed (turns per lap), start (degrees) }
const BUILD_PRESETS = {
  circle:   [{ radius: 400, speed: 1, start: 0 }],
  oval:     [{ radius: 280, speed: 1, start: 0 }, { radius: 140, speed: -1, start: 0 }],
  heart:    [{ radius: 280, speed: 1, start: 270 }, { radius: 140, speed: 2, start: 270 }],
  triangle: [{ radius: 330, speed: 1, start: 0 }, { radius: 110, speed: -2, start: 0 }],
  square:   [{ radius: 350, speed: 1, start: 0 }, { radius: 70, speed: -3, start: 0 }],
  flower:   [{ radius: 250, speed: 1, start: 0 }, { radius: 170, speed: 6, start: 0 }],
  galaxy:   [{ radius: 230, speed: 1, start: 0 }, { radius: 130, speed: 7, start: 0 },
             { radius: 70, speed: -17, start: 0 }],
};

let buildCircles = [];     // the circles on screen
let buildPath = [];        // the pen's whole path for one lap

// fourier.js works in radians; the sliders show degrees
const inRadians = list => list.map(c => ({ radius: c.radius, speed: c.speed, start: c.start * Math.PI / 180 }));

// Zoom out when the circles together are longer than half the canvas
function buildZoom() {
  const total = buildCircles.reduce((sum, c) => sum + c.radius, 0);
  return Math.min(1, 460 / Math.max(total, 1));
}

function renderBuild() {
  drawScene(buildCtx, inRadians(buildCircles), buildPath, buildTransport.lap,
            { zoom: buildZoom(), empty: "Add a circle to start" });
}

// The picture as numbers: 3 numbers per circle
function showBuildCode() {
  const n = buildCircles.length;
  const list = buildCircles.map(c => `(${c.radius}, ${c.speed}, ${c.start}°)`).join("  ");
  $("buildCode").textContent =
    `This picture is ${n} circle${n === 1 ? "" : "s"} = ${3 * n} numbers (radius, speed, start): ${list}`;
}

// A value changed: recompute the path (cheap) but keep the cards
function buildValuesChanged() {
  buildPath = pathOf(inRadians(buildCircles));
  showBuildCode();
}

// The list of circles changed: rebuild the cards too
function buildListChanged() {
  buildValuesChanged();
  renderCards();
}

function slider(name, label, min, max, step, value, unit) {
  return `
    <label class="slider">
      <span>${label}</span>
      <input type="range" name="${name}" min="${min}" max="${max}" step="${step}"
             value="${value}" data-unit="${unit}">
      <output>${value}${unit}</output>
    </label>`;
}

// One card of sliders per circle, coloured like its circle
function renderCards() {
  const list = $("cardList");
  list.innerHTML = "";
  buildCircles.forEach((c, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.setProperty("--c", circleColour(i));
    card.innerHTML = `
      <div class="card-head">
        <span class="dot"></span><strong>Circle ${i + 1}</strong>
        <button class="remove" aria-label="Remove circle ${i + 1}">✕</button>
      </div>
      ${slider("radius", "Radius", 1, 450, 1, c.radius, "")}
      ${slider("speed", "Speed", -20, 20, 1, c.speed, "")}
      ${slider("start", "Start angle", 0, 355, 5, c.start, "°")}`;

    card.querySelectorAll("input").forEach(input => {
      input.addEventListener("input", () => {
        c[input.name] = Number(input.value);
        input.nextElementSibling.textContent = input.value + input.dataset.unit;
        buildValuesChanged();
      });
    });

    const remove = card.querySelector(".remove");
    remove.disabled = buildCircles.length === 1;
    remove.addEventListener("click", () => {
      buildCircles.splice(i, 1);
      buildListChanged();
    });
    list.appendChild(card);
  });
  $("addCircle").disabled = buildCircles.length >= BUILD_MAX;
}

function loadBuild(list) {
  buildCircles = list.map(c => ({ ...c }));      // copies, so presets never change
  buildTransport.lap = 0;
  buildTransport.setPlaying(true);
  buildListChanged();
}

// ---------- buttons ----------
$("addCircle").addEventListener("click", () => {
  const speeds = [-5, -4, -3, -2, 2, 3, 4, 5];
  const last = buildCircles[buildCircles.length - 1];
  buildCircles.push({
    radius: last ? Math.max(10, Math.round(last.radius / 2)) : 200,
    speed: speeds[Math.floor(Math.random() * speeds.length)],
    start: 0,
  });
  buildListChanged();
});

$("surprise").addEventListener("click", () => {
  const count = 3 + Math.floor(Math.random() * 3);          // 3, 4 or 5 circles
  const list = [];
  let radius = 220 + Math.floor(Math.random() * 80);
  for (let i = 0; i < count; i++) {
    let speed = i === 0 ? 1 : Math.floor(Math.random() * 19) - 9;
    if (speed === 0) speed = 3;
    list.push({ radius: radius, speed: speed, start: 15 * Math.floor(Math.random() * 24) });
    radius = Math.max(10, Math.round(radius * (0.35 + Math.random() * 0.25)));
  }
  loadBuild(list);
  $("bStatus").textContent = "A random set of circles. Change one slider at a time and watch.";
});

document.querySelectorAll("[data-preset]").forEach(button => {
  button.addEventListener("click", () => {
    loadBuild(BUILD_PRESETS[button.dataset.preset]);
    $("bStatus").textContent = "";
  });
});

$("bSave").addEventListener("click", () => {
  drawScene(buildCtx, inRadians(buildCircles), buildPath, 1, { zoom: buildZoom() });   // the finished shape
  savePicture(buildCanvas, "circles-picture");
});

$("bRecord").addEventListener("click", () => {
  $("bRecord").disabled = true;
  buildReel.start({
    seconds: buildTransport.seconds(),
    filename: "spinning-circles",
    title: "Spinning circles",
    drawAt: lapPos => { buildTransport.lap = lapPos; renderBuild(); },
    progress: f => { $("bStatus").textContent = `Making the video… ${Math.round(f * 100)}%`; },
    done: error => {
      $("bStatus").textContent = error ? "The video could not be made: " + error.message
                                       : "Video saved to your downloads.";
      $("bRecord").disabled = false;
      buildTransport.lap = 0;
    },
  });
});

// ---------- hooks for app.js ----------
modes.build = {
  frame(dt) {
    if (buildReel.isRecording()) return;      // the video maker is drawing the frames itself
    buildTransport.advance(dt);
    renderBuild();
    buildTransport.sync();
  },
  busy: () => buildReel.isRecording(),
  load: loadBuild,
};

loadBuild(BUILD_PRESETS.heart);