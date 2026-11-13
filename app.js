// ================= app.js: things both modes share =================
const $ = id => document.getElementById(id);

// Bright circle colours, always used in this order
const PALETTE = ["#ff4d6d", "#ffd23f", "#3ddc97", "#4cc9f0", "#b388ff",
                 "#ff8c42", "#f72585", "#c0ff3e", "#80ffdb", "#5e9bff"];
const circleColour = i => PALETTE[i % PALETTE.length];

// Draw a list of [x, y] points (from index `from` to `to`) as one line
function strokeLine(ctx, points, from, to, colour, width) {
  if (to <= from) return;
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[from][0], points[from][1]);
  for (let i = from + 1; i <= to; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.stroke();
}

// Draw one moment of the circles on a black square canvas.
// opts: zoom (1 = no zoom), ghost (your original line, drawn faintly), empty (text when no circles)
function drawScene(ctx, circles, path, lap, opts = {}) {
  const size = ctx.canvas.width;
  const centre = size / 2;
  const zoom = opts.zoom || 1;
  const px = 1 / zoom;                        // one canvas pixel, in zoomed units

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);

  if (!circles || circles.length === 0) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "32px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opts.empty || "", centre, centre);
    return;
  }

  // Maths coordinates from here on: origin in the middle, y pointing up
  ctx.setTransform(zoom, 0, 0, -zoom, centre, centre);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (opts.ghost && opts.ghost.length > 1) {
    const g = opts.ghost;
    strokeLine(ctx, [...g, g[0]], 0, g.length, "rgba(255, 255, 255, 0.22)", 3 * px);
  }
  strokeLine(ctx, path, 0, path.length - 1, "rgba(255, 255, 255, 0.10)", 2 * px);   // the whole shape, faint

  // what the pen has drawn so far, glowing
  ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
  ctx.shadowBlur = 10;
  strokeLine(ctx, path, 0, Math.floor(lap * (path.length - 1)), "#ffffff", 4 * px);
  ctx.shadowBlur = 0;

  // each circle, riding on the one before
  const chain = chainAt(circles, lap);
  circles.forEach((c, i) => {
    const [x0, y0] = chain[i];
    const [x1, y1] = chain[i + 1];
    ctx.strokeStyle = circleColour(i);
    if (c.speed !== 0 && c.radius > 1.5 * px) {       // the still circle (speed 0) shows no ring
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5 * px;
      ctx.beginPath(); ctx.arc(x0, y0, c.radius, 0, 2 * Math.PI); ctx.stroke();
    }
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 2.5 * px;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  });
  ctx.globalAlpha = 1;

  // the pen
  const [penX, penY] = chain[chain.length - 1];
  ctx.shadowColor = "#ffd23f";
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(penX, penY, 9 * px, 0, 2 * Math.PI); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Offer what is on a canvas as a PNG file
function savePicture(canvas, filename) {
  canvas.toBlob(blob => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename + ".png";
    link.click();
  });
}

// Play / pause, the "moment" slider and the lap-time slider for one mode.
// prefix "b" uses bPlay, bScrub, bLap, bLapOut; prefix "e" the e... ones.
function makeTransport(prefix) {
  const play = $(prefix + "Play");
  const scrub = $(prefix + "Scrub");
  const lapInput = $(prefix + "Lap");
  const lapOut = $(prefix + "LapOut");
  const t = { lap: 0, playing: true };

  t.seconds = () => Number(lapInput.value);
  t.setPlaying = p => {
    t.playing = p;
    play.textContent = p ? "Pause" : "Play";
  };
  t.advance = dt => {
    if (t.playing) t.lap = (t.lap + dt / t.seconds()) % 1;
  };
  t.sync = () => {                                   // move the slider along with the pen
    if (document.activeElement !== scrub) scrub.value = Math.round(t.lap * 1000);
  };

  play.addEventListener("click", () => t.setPlaying(!t.playing));
  scrub.addEventListener("input", () => {            // dragging the moment pauses and jumps there
    t.setPlaying(false);
    t.lap = Number(scrub.value) / 1000;
  });
  lapInput.addEventListener("input", () => { lapOut.textContent = lapInput.value + " s"; });
  return t;
}

// ---------- the two modes and switching between them ----------
const modes = {};          // build.js and encode.js add themselves here
let activeMode = "build";

function showMode(name) {
  if (modes[activeMode] && modes[activeMode].busy()) return;   // don't switch while recording
  activeMode = name;
  $("tabBuild").setAttribute("aria-selected", name === "build");
  $("tabEncode").setAttribute("aria-selected", name === "encode");
  $("build").hidden = name !== "build";
  $("encode").hidden = name !== "encode";
  // remember the mode in the address (#circles or #draw), so a link can open either mode.
  // These names differ from the section ids on purpose: a matching id would make the page jump.
  history.replaceState(null, "", name === "build" ? "#circles" : "#draw");
  if (modes[name].shown) modes[name].shown();
}

// One animation loop for the whole page; only the visible mode is drawn
let lastTime = null;
function tick(timeMs) {
  if (lastTime === null) lastTime = timeMs;
  const dt = Math.min((timeMs - lastTime) / 1000, 0.1);    // cap big jumps (e.g. after a hidden tab)
  lastTime = timeMs;
  modes[activeMode].frame(dt, timeMs);
  requestAnimationFrame(tick);
}

function start() {
  $("tabBuild").addEventListener("click", () => showMode("build"));
  $("tabEncode").addEventListener("click", () => showMode("encode"));
  showMode(location.hash === "#draw" ? "encode" : "build");
  requestAnimationFrame(tick);
}