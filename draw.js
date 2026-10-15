const pad = document.getElementById("pad");
const ctx = pad.getContext("2d");
const info = document.getElementById("info");

let points = [];        // the drawing: a list of [x, y] in canvas pixels
let drawing = false;    // is the pen touching right now?

// Turn a position on the screen into canvas pixels
function toCanvas(event) {
  const box = pad.getBoundingClientRect();              // where the canvas is, and how big it looks
  const x = (event.clientX - box.left) * pad.width  / box.width;
  const y = (event.clientY - box.top)  * pad.height / box.height;
  return [x, y];
}

function redraw() {
  ctx.clearRect(0, 0, pad.width, pad.height);
  ctx.strokeStyle = "#16203a";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.stroke();
  ctx.fillStyle = "crimson";
  points.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill(); });
  info.textContent = points.length + " points";
}

pad.addEventListener("pointerdown", event => {
  drawing = true;
  points = [];                                  // a new line replaces the old one
  pad.setPointerCapture(event.pointerId);       // keep listening even if the pen slides off the canvas
  points.push(toCanvas(event));
  redraw();
});

pad.addEventListener("pointermove", event => {
  if (!drawing) return;                         // just hovering: ignore
  points.push(toCanvas(event));
  redraw();
});

pad.addEventListener("pointerup",     () => { drawing = false; });
pad.addEventListener("pointercancel", () => { drawing = false; });

document.getElementById("clear").addEventListener("click", () => {
  points = [];
  redraw();
});