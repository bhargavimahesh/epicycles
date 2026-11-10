const pad = document.getElementById("pad");
const ctx = pad.getContext("2d");
const info = document.getElementById("info");

const SIZE = pad.width;          // 1200
const CENTRE = SIZE / 2;
const N = 128;                   // evenly spaced points we give to Fourier
const MAX_SPEED = 40;            // the fastest circles we look for: speeds -40 ... +40
const LAP_SECONDS = 8;           // how long the circles take to redraw your line

let points = [];      // what you drew, in canvas pixels
let drawing = false;  // is the pen touching right now?
let circles = null;   // the circles Fourier found (null while you are drawing)
let path = [];        // the line the circles draw in one lap, in maths coordinates
let lap = 0;          // how far through the lap we are, 0 to 1
let lastTime = null;
let allCircles = [];  // every circle Fourier found: the still one first, then biggest first

const countSlider = document.getElementById("count");
const countOut = document.getElementById("countOut");

// Turn a position on the screen into canvas pixels
function toCanvas(event) {
  const box = pad.getBoundingClientRect();
  const x = (event.clientX - box.left) * pad.width  / box.width;
  const y = (event.clientY - box.top)  * pad.height / box.height;
  return [x, y];
}

// ---------- when you lift the pen: let Fourier find ALL the circles (once) ----------
function findCircles() {
  if (points.length < 2) return;
  const even = resample(points, N);
  // maths coordinates: origin in the middle of the canvas, y pointing up
  const centred = even.map(([x, y]) => [x - CENTRE, CENTRE - y]);
  allCircles = dft(centred, MAX_SPEED);
  // the circle that doesn't move (speed 0) first, then the rest, biggest first
  allCircles.sort((a, b) => {
    if (a.speed === 0) return -1;
    if (b.speed === 0) return 1;
    return b.radius - a.radius;
  });
  lap = 0;
  useCircles();
}

// ---------- use only the biggest few circles, as chosen on the slider ----------
function useCircles() {
  const count = Number(countSlider.value);
  circles = allCircles.slice(0, count + 1);          // +1 for the circle that doesn't move

  // work out the circles' whole drawing for one lap
  path = [];
  for (let i = 0; i <= 720; i++) {
    const chain = chainAt(circles, i / 720);
    path.push(chain[chain.length - 1]);
  }
  countOut.textContent = count;
  info.textContent = "Using the " + count + " biggest of " + (allCircles.length - 1) + " circles";
}

// ---------- drawing a frame ----------
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);                  // normal canvas coordinates
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // your line: dark while you draw, faint once the circles take over
  ctx.strokeStyle = circles ? "#d3d7de" : "#16203a";
  ctx.lineWidth = 6;
  ctx.beginPath();
  points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.stroke();

  if (!circles) return;                                 // still drawing: nothing more to show

  ctx.setTransform(1, 0, 0, -1, CENTRE, CENTRE);       // maths coordinates from here on

  // what the circles have drawn so far in this lap
  const upto = Math.floor(lap * (path.length - 1));
  ctx.strokeStyle = "#16203a";
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i <= upto; i++) {
    const [x, y] = path[i];
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // the circles themselves, each riding on the one before
  const chain = chainAt(circles, lap);
  ctx.strokeStyle = "#1f6feb";
  for (let i = 0; i < circles.length; i++) {
    const [x0, y0] = chain[i];
    const [x1, y1] = chain[i + 1];
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x0, y0, circles[i].radius, 0, 2 * Math.PI); ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // the pen
  const [penX, penY] = chain[chain.length - 1];
  ctx.fillStyle = "crimson";
  ctx.beginPath(); ctx.arc(penX, penY, 8, 0, 2 * Math.PI); ctx.fill();
}

// ---------- animation loop ----------
function tick(timeMs) {
  if (lastTime === null) lastTime = timeMs;
  const dt = (timeMs - lastTime) / 1000;
  lastTime = timeMs;
  if (circles) lap = (lap + dt / LAP_SECONDS) % 1;
  render();
  requestAnimationFrame(tick);
}

// ---------- pen and buttons ----------
pad.addEventListener("pointerdown", event => {
  drawing = true;
  circles = null;                               // drawing again: the old circles go away
  allCircles = [];
  points = [];
  pad.setPointerCapture(event.pointerId);
  points.push(toCanvas(event));
  info.textContent = "Drawing…";
});

pad.addEventListener("pointermove", event => {
  if (!drawing) return;
  const events = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
  events.forEach(e => points.push(toCanvas(e)));
});

function penUp() {
  if (!drawing) return;
  drawing = false;
  findCircles();
}
pad.addEventListener("pointerup", penUp);
pad.addEventListener("pointercancel", penUp);

document.getElementById("clear").addEventListener("click", () => {
  points = [];
  circles = null;
  allCircles = [];
  info.textContent = "Draw a line";
});

countSlider.addEventListener("input", () => {
  countOut.textContent = countSlider.value;
  if (allCircles.length > 0 && !drawing) useCircles();
});

requestAnimationFrame(tick);