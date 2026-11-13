// ================= kolam.js: one closed line around a grid of dots =================
//
// How a kolam is made here, in "doubled" coordinates:
// for a grid of m x m dots, dot (i, j) sits at (2i + 1, 2j + 1).
// The line only ever travels diagonally, from one halfway point between two dots to the next
// (a halfway point has exactly one even coordinate).
// At each halfway point there is either nothing (the line goes straight through and crosses)
// or a "turning point" that bounces the line back around the dot:
//   wall 1 stands across the gap between the two dots,
//   wall 2 lies along the line joining the two dots.
// The border of the grid always bounces the line back in.
// We place turning points at random (keeping the symmetry) and then change them
// until the whole pattern is ONE closed line: that is what makes it a kolam.

const kCanvas = $("kolamCanvas");
const kCtx = kCanvas.getContext("2d");
const K_SIZE = kCanvas.width;
const K_CENTRE = K_SIZE / 2;
const kTransport = makeTransport("k");
const kReel = makeReel(kCanvas);

let wantedSymmetry = "rotate";   // what the person picked
let symmetry = "rotate";         // what we can actually use for this grid size
let shape = "diamond";
let view = "line";
let lineColour = "#ffffff";

let grid = null;        // { m, L, walls }: the dots and turning points
let kolam = null;       // what we draw: { path, dots, walls, dotRadius } in maths coordinates
let kAllCircles = [];   // circles found by Fourier for this kolam (computed when needed)
let kCircles = [];
let kCirclePath = [];

// ---------- the grid ----------
function newGrid(m) {
  const L = 2 * m + 1;                               // points per side in doubled coordinates
  return { m: m, L: L, walls: new Uint8Array(L * L) };
}

function wallAt(g, x, y) {
  const edge = 2 * g.m;
  if (x === 0 || y === 0 || x === edge || y === edge) return 1;   // the border turns the line back
  return g.walls[x * g.L + y];
}

// One step: from halfway point (x, y) diagonally in direction (dx, dy), then bounce if there is a wall
function step(g, x, y, dx, dy) {
  const nx = x + dx, ny = y + dy;
  const wall = wallAt(g, nx, ny);
  const leftRightGap = nx % 2 === 0;                 // this point lies between a left and a right dot
  if (wall === 1) { if (leftRightGap) dx = -dx; else dy = -dy; }
  if (wall === 2) { if (leftRightGap) dy = -dy; else dx = -dx; }
  return [nx, ny, dx, dy];
}

const DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const dirIndex = (dx, dy) => (dx > 0 ? 2 : 0) + (dy > 0 ? 1 : 0);

// How many separate closed lines does this grid make? (we want exactly 1)
function countLines(g) {
  const edge = 2 * g.m;
  const seen = new Uint8Array(g.L * g.L * 4);
  let lines = 0;
  for (let x = 0; x <= edge; x++) {
    for (let y = 0; y <= edge; y++) {
      if ((x + y) % 2 === 0) continue;               // not a halfway point
      for (const [dx, dy] of DIRECTIONS) {
        if (x + dx < 0 || y + dy < 0 || x + dx > edge || y + dy > edge) continue;
        if (seen[(x * g.L + y) * 4 + dirIndex(dx, dy)]) continue;
        lines++;
        let cx = x, cy = y, cdx = dx, cdy = dy;      // follow this line until it comes back
        do {
          seen[(cx * g.L + cy) * 4 + dirIndex(cdx, cdy)] = 1;
          const [nx, ny, ndx, ndy] = step(g, cx, cy, cdx, cdy);
          seen[(nx * g.L + ny) * 4 + dirIndex(-cdx, -cdy)] = 1;   // the same line, walked backwards
          cx = nx; cy = ny; cdx = ndx; cdy = ndy;
        } while (!(cx === x && cy === y && cdx === dx && cdy === dy));
      }
    }
  }
  return lines;
}

// Follow the (single) line from the bottom edge and return its halfway points in drawing order
function followLine(g) {
  const points = [];
  let x = 1, y = 0, dx = 1, dy = 1;
  do {
    points.push([x, y]);
    [x, y, dx, dy] = step(g, x, y, dx, dy);
  } while (!(x === 1 && y === 0 && dx === 1 && dy === 1));
  return points;
}

// All the places that must look the same as (x, y), for the chosen symmetry
function copiesOf(m, x, y) {
  const edge = 2 * m;
  const list = [[x, y]];
  if (symmetry === "rotate") {
    let a = x, b = y;
    for (let i = 0; i < 3; i++) { [a, b] = [edge - b, a]; list.push([a, b]); }   // turn by 90°
  }
  if (symmetry === "mirror") list.push([edge - x, y]);
  if (symmetry === "mirror2") list.push([edge - x, y], [x, edge - y], [edge - x, edge - y]);
  return list;
}

// Make a random grid whose turning points form ONE closed line
function makeGrid(m) {
  const halfway = [];
  for (let x = 1; x < 2 * m; x++) for (let y = 1; y < 2 * m; y++) if ((x + y) % 2 === 1) halfway.push([x, y]);

  for (let attempt = 0; attempt < 12; attempt++) {
    const g = newGrid(m);
    const done = new Uint8Array(g.L * g.L);
    // how many turning points to start with: more crossings means fewer turning points
    const weave = Number($("kWeave").value) / 100;
    const busyness = 0.6 - 0.5 * weave + 0.1 * (Math.random() - 0.5);
    for (const [x, y] of halfway) {
      if (done[x * g.L + y]) continue;
      const wall = Math.random() < busyness ? 1 + Math.floor(Math.random() * 2) : 0;
      for (const [a, b] of copiesOf(m, x, y)) { g.walls[a * g.L + b] = wall; done[a * g.L + b] = 1; }
    }

    // Change turning points one (symmetric) group at a time; keep a change if it doesn't add lines
    let lines = countLines(g);
    for (let tries = 0; tries < 3000 && lines > 1; tries++) {
      const [x, y] = halfway[Math.floor(Math.random() * halfway.length)];
      const copies = copiesOf(m, x, y);
      const old = g.walls[x * g.L + y];
      const wall = (old + 1 + Math.floor(Math.random() * 2)) % 3;     // a different choice
      for (const [a, b] of copies) g.walls[a * g.L + b] = wall;
      const now = countLines(g);
      if (now <= lines) lines = now;
      else for (const [a, b] of copies) g.walls[a * g.L + b] = old;   // undo
    }
    if (lines === 1) return g;
  }
  return null;
}

// ---------- from grid to something we can draw ----------

// Cut every corner (Chaikin's method): sharp zigzags become smooth curves
function smooth(points) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1],
             [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
  }
  return out;
}

function buildKolam() {
  const m = grid.m;
  const diamond = shape === "diamond";
  const s = diamond ? 440 / (m * Math.SQRT2) : 440 / m;     // size of one step, so it fits the canvas
  // doubled grid coordinates -> maths coordinates (origin in the middle, y up), turned 45° for a diamond
  const toMaths = ([x, y]) => {
    const X = (x - m) * s, Y = (m - y) * s;
    return diamond ? [(X - Y) / Math.SQRT2, (X + Y) / Math.SQRT2] : [X, Y];
  };

  let line = followLine(grid).map(toMaths);
  for (let i = 0; i < 3; i++) line = smooth(line);

  const dots = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) dots.push(toMaths([2 * i + 1, 2 * j + 1]));

  const walls = [];
  for (let x = 1; x < 2 * m; x++) {
    for (let y = 1; y < 2 * m; y++) {
      const wall = grid.walls[x * grid.L + y];
      if ((x + y) % 2 === 0 || wall === 0) continue;
      const leftRightGap = x % 2 === 0;
      const upright = (wall === 1) === leftRightGap;          // is the wall drawn up-down in the grid?
      const a = upright ? [x, y - 0.6] : [x - 0.6, y];
      const b = upright ? [x, y + 0.6] : [x + 0.6, y];
      walls.push([toMaths(a), toMaths(b)]);
    }
  }

  kolam = { path: resample(line, 2400), dots: dots, walls: walls, dotRadius: Math.max(5, s * 0.14) };
  kolam.path.push(kolam.path[0]);                           // close the loop for drawing
  findCrossings(s, toMaths);
  // Fourier: the circles that draw this kolam (also used for the recipe chart)
  kAllCircles = sortCircles(dft(resample(kolam.path.slice(0, -1), 1024), 300));
  useKolamCircles();
  drawKolamRecipe();
}

// With an even number of dots per side, a one-line kolam can only be mirrored once
// (turning 4 ways or mirroring both ways always splits it into several lines).
function updateSymmetryButtons(m) {
  const even = m % 2 === 0;
  symmetry = even && (wantedSymmetry === "rotate" || wantedSymmetry === "mirror2") ? "mirror" : wantedSymmetry;
  document.querySelectorAll("#kSym button").forEach(b => {
    const sym = b.getAttribute("data-sym");
    b.disabled = even && (sym === "rotate" || sym === "mirror2");
    b.setAttribute("aria-pressed", sym === symmetry);
  });
  $("kEvenNote").hidden = !even;
}

function newKolam() {
  const m = Number($("kDots").value);
  updateSymmetryButtons(m);
  grid = makeGrid(m);
  if (!grid) {
    $("kStatus").textContent = "Couldn't find a one-line kolam with this symmetry. Try again or pick another.";
    return;
  }
  $("kStatus").textContent = "";
  kTransport.lap = 0;
  kTransport.setPlaying(true);
  buildKolam();
  $("kInfo").textContent = `${m} × ${m} = ${m * m} dots, one line, ${kolam.crossings} crossings`;
}

// ---------- crossings: over and under ----------
// Every halfway point without a turning point is a crossing: the line passes it twice.
// Walking along the line, we go over, under, over, under … at the crossings we meet.
// (For any closed line drawn on paper this gives each crossing one "over" and one "under".)
function findCrossings(s, toMaths) {
  const m = grid.m;
  const path = kolam.path;
  const spacing = Math.hypot(path[1][0] - path[0][0], path[1][1] - path[0][1]);
  const near = 0.35 * s;                                   // how close counts as "passing through"
  const visits = [];                                       // { index along the line, crossing number }
  let crossingCount = 0;
  for (let x = 1; x < 2 * m; x++) {
    for (let y = 1; y < 2 * m; y++) {
      if ((x + y) % 2 === 0 || grid.walls[x * grid.L + y] !== 0) continue;
      const [cx, cy] = toMaths([x, y]);
      // find the stretches of the line that pass close to this crossing; keep the middle of each
      let start = -1;
      for (let i = 0; i < path.length; i++) {
        const close = Math.hypot(path[i][0] - cx, path[i][1] - cy) < near;
        if (close && start < 0) start = i;
        if (!close && start >= 0) { visits.push({ index: Math.round((start + i - 1) / 2), crossing: crossingCount }); start = -1; }
      }
      crossingCount++;
    }
  }
  visits.sort((a, b) => a.index - b.index);
  // every other visit goes over; pair each crossing's "over" visit with its "under" visit
  const pairs = [];
  visits.forEach((v, k) => {
    pairs[v.crossing] = pairs[v.crossing] || {};
    if (k % 2 === 0) pairs[v.crossing].over = v.index; else pairs[v.crossing].under = v.index;
  });
  kolam.knots = pairs.filter(p => p.over !== undefined && p.under !== undefined);
  kolam.gapHalf = Math.ceil(0.3 * s / spacing);            // half the length of the gap in the lower line
  kolam.overHalf = Math.ceil(0.55 * s / spacing);          // half the length of the upper line we redraw
  kolam.crossings = crossingCount;
}

// ---------- spinning circles ----------
function prepareCircles() {
  if (kAllCircles.length > 0) useKolamCircles();
}

function useKolamCircles() {
  const count = Number($("kCount").value);
  $("kCountOut").textContent = count;
  kCircles = kAllCircles.slice(0, count + 1);
  kCirclePath = pathOf(kCircles, 2400);
}

// ---------- the recipe: which speeds does this kolam use? ----------
// Speeds are grouped by their remainder when divided by 4.
// A kolam that looks the same after a quarter turn uses only ONE group (1, 5, 9, −3, …),
// one that looks the same after a half turn uses only the odd groups.
const GROUP_COLOURS = ["#4cc9f0", "#ffd23f", "#ff4d6d", "#3ddc97"];
const GROUP_NAMES = ["0, 4, 8, −4 …", "1, 5, 9, −3 …", "2, 6, 10, −2 …", "3, 7, 11, −1 …"];
const groupOf = speed => ((speed % 4) + 4) % 4;
const RECIPE_SPEED = 40;                   // the chart shows speeds −40 … +40

// How much of the drawing each group makes (radius squared, so big circles count more)
function groupShares() {
  const share = [0, 0, 0, 0];
  let total = 0;
  for (const c of kAllCircles) {
    if (c.speed === 0) continue;           // the still circle only places the drawing
    share[groupOf(c.speed)] += c.radius * c.radius;
    total += c.radius * c.radius;
  }
  return share.map(s => s / total);
}

function drawKolamRecipe() {
  const canvas = $("kSpectrum");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || kAllCircles.length === 0) return;          // hidden: drawn again when shown
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const shown = kAllCircles.filter(c => c.speed !== 0 && Math.abs(c.speed) <= RECIPE_SPEED);
  const biggest = Math.max(...shown.map(c => c.radius));
  const base = h - 22, top = 8, slot = w / (2 * RECIPE_SPEED + 1);
  for (const c of shown) {
    const barH = (base - top) * Math.sqrt(c.radius / biggest);
    if (barH < 0.5) continue;                          // too small to see
    g.fillStyle = GROUP_COLOURS[groupOf(c.speed)];
    g.fillRect((c.speed + RECIPE_SPEED) * slot + slot * 0.15, base - barH, Math.max(1, slot * 0.7), barH);
  }
  g.fillStyle = "#3a3f47";
  g.fillRect(0, base, w, 1);                           // baseline
  g.fillStyle = "#9aa1ad";
  g.font = "12px system-ui, sans-serif";
  g.textAlign = "left";   g.fillText("speed −" + RECIPE_SPEED, 0, h - 5);
  g.textAlign = "center"; g.fillText("0", w / 2, h - 5);
  g.textAlign = "right";  g.fillText("+" + RECIPE_SPEED, w, h - 5);

  // legend with each group's share
  const shares = groupShares();
  $("kLegend").innerHTML = GROUP_NAMES.map((name, i) =>
    `<span><i style="--c:${GROUP_COLOURS[i]}"></i>${name} <strong>${(100 * shares[i]).toFixed(0)}%</strong></span>`
  ).join("");

  // what the recipe says about symmetry
  const used = [0, 1, 2, 3].filter(i => shares[i] > 0.005);
  let note;
  if (used.length === 1) {
    note = `Only speeds ${GROUP_NAMES[used[0]]} are used. That is the rule for 4-way turning symmetry: ` +
           "the kolam looks the same after every quarter turn.";
  } else if (used.every(i => i % 2 === 1)) {
    note = "Only odd speeds are used, so the kolam looks the same after a half turn (upside down).";
  } else {
    note = "Every kind of speed is used, so the kolam does not look the same when you turn it.";
    if (symmetry === "mirror") {
      note += " It is still a mirror image of itself: mirroring doesn't remove any speeds, " +
              "it pairs up the circles' start angles instead.";
    }
  }
  $("kSymmetryNote").textContent = note;
}

// Hover or tap a bar to read its numbers
function showKolamTip(event) {
  if (kAllCircles.length === 0) return;
  const canvas = $("kSpectrum");
  const box = canvas.getBoundingClientRect();
  const x = event.clientX - box.left;
  const speed = Math.floor(x / (box.width / (2 * RECIPE_SPEED + 1))) - RECIPE_SPEED;
  const c = kAllCircles.find(q => q.speed === speed);
  const tip = $("kTip");
  if (!c || speed === 0) { tip.hidden = true; return; }
  tip.textContent = `speed ${speed > 0 ? "+" : ""}${speed}: radius ${c.radius.toFixed(1)} px`;
  tip.style.left = Math.min(Math.max(x, 80), box.width - 80) + "px";
  tip.style.top = (event.clientY - box.top) + "px";
  tip.hidden = false;
}
$("kSpectrum").addEventListener("pointermove", showKolamTip);
$("kSpectrum").addEventListener("pointerdown", showKolamTip);
$("kSpectrum").addEventListener("pointerleave", () => { $("kTip").hidden = true; });
window.addEventListener("resize", drawKolamRecipe);

// ---------- drawing ----------
function renderKolam(lap) {
  if (!kolam) return;
  if (view === "circles") {
    drawScene(kCtx, kCircles, kCirclePath, lap, { dots: kolam.dots, colour: lineColour });
    return;
  }
  const ctx = kCtx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, K_SIZE, K_SIZE);
  ctx.setTransform(1, 0, 0, -1, K_CENTRE, K_CENTRE);        // maths coordinates
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if ($("kShowGuide").checked) {
    strokeLine(ctx, kolam.path, 0, kolam.path.length - 1, "rgba(255, 255, 255, 0.13)", 2);
  }
  if ($("kShowWalls").checked) {
    ctx.strokeStyle = "#ff8c42";
    ctx.lineWidth = 4;
    for (const [[x0, y0], [x1, y1]] of kolam.walls) {
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }

  ctx.fillStyle = "#ffffff";                                // the dots
  for (const [x, y] of kolam.dots) {
    ctx.beginPath(); ctx.arc(x, y, kolam.dotRadius, 0, 2 * Math.PI); ctx.fill();
  }

  const upto = Math.floor(lap * (kolam.path.length - 1));  // the line so far
  ctx.shadowColor = lineColour;
  ctx.shadowBlur = 12;
  strokeLine(ctx, kolam.path, 0, upto, lineColour, 5);
  ctx.shadowBlur = 0;

  // knot look: once both strands of a crossing are drawn, cut a small gap into the lower one
  // and draw the upper one again across the gap
  if ($("kKnot").checked) {
    for (const { over, under } of kolam.knots) {
      if (over > upto || under > upto) continue;
      ctx.lineCap = "butt";
      strokeLine(ctx, kolam.path, Math.max(0, under - kolam.gapHalf),
                 Math.min(upto, under + kolam.gapHalf), "#000", 14);      // the gap
      ctx.lineCap = "round";
      ctx.shadowColor = lineColour;
      ctx.shadowBlur = 12;
      strokeLine(ctx, kolam.path, Math.max(0, over - kolam.overHalf),
                 Math.min(upto, over + kolam.overHalf), lineColour, 5);   // the upper line
      ctx.shadowBlur = 0;
    }
  }

  if (lap < 1) {                                           // the pen
    const [x, y] = kolam.path[upto];
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath(); ctx.arc(x, y, 10, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------- controls ----------
// A row of buttons where exactly one is pressed
function choice(rowId, attribute, onPick) {
  const buttons = document.querySelectorAll(`#${rowId} button`);
  buttons.forEach(button => button.addEventListener("click", () => {
    buttons.forEach(b => b.setAttribute("aria-pressed", b === button));
    onPick(button.getAttribute(attribute));
  }));
}

choice("kSym", "data-sym", value => { wantedSymmetry = value; newKolam(); });
choice("kShape", "data-shape", value => { shape = value; buildKolam(); });
choice("kColours", "data-colour", value => { lineColour = value; });
choice("kView", "data-view", value => {
  view = value;
  $("kCountRow").hidden = view !== "circles";
  $("kCircleHint").hidden = view !== "circles";
  if (view === "circles") prepareCircles();
});

$("newKolam").addEventListener("click", newKolam);
$("kWeave").addEventListener("input", () => {
  const v = Number($("kWeave").value);
  $("kWeaveOut").textContent = v < 25 ? "few" : v < 50 ? "some" : v < 75 ? "many" : "most";
  newKolam();
});
$("kDots").addEventListener("input", () => {
  $("kDotsOut").textContent = $("kDots").value;
  newKolam();
});
$("kCount").addEventListener("input", () => { if (kAllCircles.length) useKolamCircles(); });

$("kSave").addEventListener("click", () => {
  renderKolam(1);                                          // the finished kolam
  savePicture(kCanvas, "kolam");
});

$("kRecord").addEventListener("click", () => {
  if (!kolam) return;
  $("kRecord").disabled = true;
  kReel.start({
    seconds: kTransport.seconds(),
    filename: "kolam",
    title: view === "circles" ? "A kolam drawn by circles" : "Drawing a kolam",
    drawAt: lapPos => { kTransport.lap = lapPos; renderKolam(lapPos); },
    progress: f => { $("kStatus").textContent = `Making the video… ${Math.round(f * 100)}%`; },
    done: (error, note) => {
      $("kStatus").textContent = error ? "The video could not be made: " + error.message : note;
      $("kRecord").disabled = false;
      kTransport.lap = 0;
    },
  });
});

// ---------- hooks for app.js ----------
modes.kolam = {
  frame(dt) {
    if (kReel.isRecording()) return;          // the video maker is drawing the frames itself
    // hold the finished kolam for a moment before starting again
    if (kTransport.playing) kTransport.lap = Math.min(kTransport.lap + dt / kTransport.seconds(), 1.15);
    if (kTransport.lap >= 1.15) kTransport.lap = 0;
    renderKolam(Math.min(kTransport.lap, 1));
    kTransport.sync();
  },
  busy: () => kReel.isRecording(),
  shown: drawKolamRecipe,
};

newKolam();