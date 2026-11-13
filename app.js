// ================= app.js: the two modes of index.html and switching between them =================
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