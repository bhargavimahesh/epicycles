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
    const busyness = 0.2 + Math.random() * 0.35;      // how many turning points to start with
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
  kAllCircles = [];                                          // circles are worked out when needed
  if (view === "circles") prepareCircles();
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
  $("kInfo").textContent = `${m} × ${m} = ${m * m} dots, one line`;
  kTransport.lap = 0;
  kTransport.setPlaying(true);
  buildKolam();
}

// ---------- spinning circles ----------
function prepareCircles() {
  if (kAllCircles.length === 0) {
    const points = resample(kolam.path.slice(0, -1), 1024);
    kAllCircles = sortCircles(dft(points, 300));
  }
  useKolamCircles();
}

function useKolamCircles() {
  const count = Number($("kCount").value);
  $("kCountOut").textContent = count;
  kCircles = kAllCircles.slice(0, count + 1);
  kCirclePath = pathOf(kCircles, 2400);
}

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
    done: error => {
      $("kStatus").textContent = error ? "The video could not be made: " + error.message
                                       : "Video saved to your downloads.";
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
};

newKolam();