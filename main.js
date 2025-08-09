// Screen sections
const introScreen = document.getElementById("intro-screen");
const gameScreen = document.getElementById("game-screen");
const playButton = document.getElementById("play-btn");
const inventoryScreen = document.getElementById("inventory-screen");

// Key UI elements
const keyElements = {
  q: document.querySelector(".key-q"),
  w: document.querySelector(".key-w"),
  a: document.querySelector(".key-a"),
  s: document.querySelector(".key-s"),
  d: document.querySelector(".key-d"),
  p: document.querySelector(".key-p"),
  ArrowUp: document.querySelector(".key-arrow-up"),
  ArrowDown: document.querySelector(".key-arrow-down"),
  ArrowLeft: document.querySelector(".key-arrow-left"),
  ArrowRight: document.querySelector(".key-arrow-right"),
};

const stick = document.getElementById("stick");

// HUD elements
const headingEl = document.getElementById("heading-val");
const depthEl = document.getElementById("depth-val");
const utcTimeEl = document.getElementById("utc-time");
const samplesCountEl = document.getElementById("samples-count");
const caughtListEl = document.getElementById("caught-list");
// Static ocean status values (hard-coded)
document.getElementById("temp-val").textContent = "2.63 °C";
document.getElementById("salinity-val").textContent = "34.5 PSU";
document.getElementById("o2con-val").textContent = "183 uM";
document.getElementById("o2sat-val").textContent = "54.3 %";

let transitionTimeoutId = null;
let showInventory = false;

const state = {
  camera: { x: 0, y: 0 },
  arm: { x: 0, y: 0 },
  caught: [],
};

function showGameScreen() {
  if (transitionTimeoutId !== null) {
    clearTimeout(transitionTimeoutId);
    transitionTimeoutId = null;
  }

  introScreen.classList.add("fade-out");
  introScreen.addEventListener(
    "animationend",
    () => {
      introScreen.classList.add("hidden");
      gameScreen.classList.remove("hidden");
      gameScreen.classList.add("fade-in");
      gameScreen.setAttribute("aria-hidden", "false");
    },
    { once: true }
  );
}

// Remove auto-start timer from previous version

// Allow manual start via PLAY
playButton.addEventListener("click", showGameScreen);

// Keyboard accessibility during intro: Enter/Space triggers play
introScreen.addEventListener("keydown", (event) => {
  const key = event.key;
  if (key === "Enter" || key === " ") {
    event.preventDefault();
    showGameScreen();
  }
});

// Focus play by default for fast Enter press
window.addEventListener("load", () => {
  playButton.focus({ preventScroll: true });
});

// -------- Game logic --------
function updateHud() {
  // HEADING and DEPTH are controlled by player inputs (arrows for camera, WASD for arm)
  headingEl.textContent = `${mod(state.camera.x * 5, 360)} *`;
  const depthMeters = clamp(1200 + state.camera.y * 5 + state.arm.y * 2, 0, 6000);
  depthEl.textContent = `${depthMeters.toFixed(0)} m`;
  const d = new Date();
  const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
  utcTimeEl.textContent = `${iso} UTC`;
  samplesCountEl.textContent = `${state.caught.length} / 6`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mod(n, m) {
  return ((n % m) + m) % m;
}

function nudgeStick(dx, dy) {
  const max = 28; // px for larger stick travel
  const x = clamp(dx * max, -max, max);
  const y = clamp(dy * max, -max, max);
  if (stick) stick.style.transform = `translate3d(${x}px, ${-y}px, 0)`;
}

function highlight(key, active) {
  const el = keyElements[key];
  if (!el) return;
  el.classList.toggle("active", active);
}

function toggleInventory() {
  showInventory = !showInventory;
  inventoryScreen.classList.toggle("hidden", !showInventory);
  inventoryScreen.setAttribute("aria-hidden", String(!showInventory));
}

function catchCreature() {
  if (state.caught.length >= 6) return;
  const id = `AN-${(Math.random() * 1000) | 0}`;
  state.caught.push(id);
  const li = document.createElement("li");
  li.textContent = id;
  caughtListEl.appendChild(li);
}

function onKeyDown(event) {
  // Ignore if still in intro
  if (!gameScreen || gameScreen.classList.contains("hidden")) return;
  const key = event.key;
  if (key in keyElements) highlight(key, true);

  switch (key) {
    case "ArrowUp":
      state.camera.y += 1;
      nudgeStick(0, 1);
      break;
    case "ArrowDown":
      state.camera.y -= 1;
      nudgeStick(0, -1);
      break;
    case "ArrowLeft":
      state.camera.x -= 1;
      nudgeStick(-1, 0);
      break;
    case "ArrowRight":
      state.camera.x += 1;
      nudgeStick(1, 0);
      break;
    case "w":
    case "W":
      state.arm.y += 1;
      break;
    case "s":
    case "S":
      state.arm.y -= 1;
      break;
    case "a":
    case "A":
      state.arm.x -= 1;
      break;
    case "d":
    case "D":
      state.arm.x += 1;
      break;
    case "q":
    case "Q":
      catchCreature();
      break;
    case "p":
    case "P":
      toggleInventory();
      break;
    default:
      return;
  }
  updateHud();
}

function onKeyUp(event) {
  const key = event.key;
  if (key in keyElements) highlight(key, false);
  if (key.startsWith("Arrow")) nudgeStick(0, 0);
}

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

// Initial HUD and ticking time
setInterval(updateHud, 1000);
updateHud();
