// ================= app.js: the three modes of index.html and switching between them =================

// Each mode: its tab button, its section, and the address ending that opens it directly.
// The address endings differ from the section ids on purpose: a matching id would make the page jump.
const MODES = [
  { name: "build",  tab: "tabBuild",  section: "build",     hash: "#circles" },
  { name: "encode", tab: "tabEncode", section: "encode",    hash: "#draw" },
  { name: "rangoli",  tab: "tabRangoli",  section: "rangoliMode", hash: "#rangoli" },
  { name: "learn",  tab: "tabLearn",  section: "learnMode", hash: "#learn" },
];
const modes = {};          // build.js, encode.js, rangoli.js and learn.js add themselves here
let activeMode = "build";

function showMode(name) {
  if (modes[activeMode] && modes[activeMode].busy()) return;   // don't switch while recording
  activeMode = name;
  for (const m of MODES) {
    $(m.tab).setAttribute("aria-selected", m.name === name);
    $(m.section).hidden = m.name !== name;
  }
  const hash = MODES.find(m => m.name === name).hash;
  if (location.hash !== hash) history.replaceState(null, "", hash);   // so the address can be shared
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

// Which mode does the address ask for? (#circles, #draw, #rangoli or #learn; mode 1 if none)
function modeFromAddress() {
  if (location.hash === "#kolam") return "rangoli";            // old links still work
  const m = MODES.find(m => m.hash === location.hash);
  return m ? m.name : "build";
}

function start() {
  for (const m of MODES) $(m.tab).addEventListener("click", () => showMode(m.name));
  window.addEventListener("hashchange", () => showMode(modeFromAddress()));   // a link like #rangoli was followed
  showMode(modeFromAddress());
  requestAnimationFrame(tick);
}