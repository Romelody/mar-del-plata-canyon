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
  e: document.querySelector(".key-e"),
  ArrowUp: document.querySelector(".key-arrow-up"),
  ArrowDown: document.querySelector(".key-arrow-down"),
  ArrowLeft: document.querySelector(".key-arrow-left"),
  ArrowRight: document.querySelector(".key-arrow-right"),
};

const stick = document.getElementById("stick");
const stickShaft = document.querySelector(".stick-shaft");
const viewportEl = document.getElementById("viewport");

// HUD elements
const headingEl = document.getElementById("heading-val");
const depthEl = document.getElementById("depth-val");
const utcTimeEl = document.getElementById("utc-time");
const samplesCountEl = document.getElementById("samples-count");
const inventoryGridEl = document.getElementById("inventory-grid");
const currentTargetEl = document.getElementById("current-target");
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
  currentSpecies: null,
  currentSpeciesEl: null,
};

// Available species and their images
const SPECIES = [
  { id: "batatita", name: "BATATITA", image: "./species/batatita.png" },
  { id: "el_ojo_del_abismo", name: "EL OJO DEL ABISMO", image: "./species/el_ojo_del_abismo.png" },
  { id: "estrella_culona", name: "ESTRELLA CULONA", image: "./species/estrella_culona.png" },
  { id: "limon", name: "LIMÓN", image: "./species/limon.png" },
  { id: "pececito", name: "PECECITO", image: "./species/pececito.png" },
];

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
      // Spawn first species shortly after the game becomes visible
      setTimeout(spawnRandomSpecies, 200);
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
  if (stickShaft) {
    // Move shaft with the same translation so cap+shaft behave as one object
    // Add a subtle tilt based on input direction for depth illusion
    const angle = clamp(Math.atan2(dy, dx) * (180 / Math.PI), -90, 90) || 0;
    const magnitude = Math.min(Math.hypot(dx, dy), 1);
    const tilt = (angle / 9) * (magnitude * 6);
    stickShaft.style.transform = `translate3d(${x}px, ${-y}px, 0) rotate(${tilt}deg)`;
  }
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
  if (showInventory) renderInventory();
}

function catchCreature() {
  // Only catch if a species is currently spawned
  if (!state.currentSpeciesEl || !state.currentSpecies) return;
  if (state.caught.length >= 9) return; // grid fits 3x3

  // Play a small despawn animation and remove from viewport
  state.currentSpeciesEl.classList.add("despawn");
  const speciesEl = state.currentSpeciesEl;
  setTimeout(() => {
    speciesEl.remove();
  }, 180);

  const id = `AN-${(Math.random() * 1000) | 0}`;
  const item = {
    id,
    name: state.currentSpecies.name,
    image: state.currentSpecies.image,
    heading: `${mod(state.camera.x * 5, 360)} *`,
    depth: `${clamp(1200 + state.camera.y * 5 + state.arm.y * 2, 0, 6000).toFixed(0)} m`,
    temp: "2.63 °C",
    salinity: "34.5 PSU",
    o2con: "183 uM",
    o2sat: "54.3 %",
  };
  state.caught.push(item);
  updateHud();

  // Clear current target and schedule next spawn
  state.currentSpecies = null;
  state.currentSpeciesEl = null;
  if (currentTargetEl) currentTargetEl.textContent = "-";

  renderInventory();
  setTimeout(spawnRandomSpecies, 600);
}

function spawnRandomSpecies() {
  if (!viewportEl) return;
  // Avoid double-spawn
  if (state.currentSpeciesEl) return;

  const species = SPECIES[(Math.random() * SPECIES.length) | 0];
  const img = new Image();
  img.src = species.image;
  img.alt = species.name;
  img.className = "species";

  // Place within the viewport bounds with padding
  const bounds = viewportEl.getBoundingClientRect();
  const size = 120; // px visual size
  const padding = 24;
  const maxX = Math.max(bounds.width - size - padding * 2, 0);
  const maxY = Math.max(bounds.height - size - padding * 2, 0);
  const x = padding + Math.random() * maxX;
  const y = padding + Math.random() * maxY;
  img.style.left = `${x}px`;
  img.style.top = `${y}px`;

  viewportEl.appendChild(img);

  state.currentSpecies = species;
  state.currentSpeciesEl = img;
  if (currentTargetEl) currentTargetEl.textContent = species.name;
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
    case "e":
    case "E":
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

function renderInventory() {
  if (!inventoryGridEl) return;
  inventoryGridEl.innerHTML = "";
  state.caught.forEach((item) => {
    const card = document.createElement("div");
    card.className = "inv-card";
    card.innerHTML = `
      <div class=\"inv-thumb\"></div>
      <div class=\"inv-title\">${item.name}</div>
      <div class=\"inv-stats\">
        <div class=\"inv-row\"><span class=\"inv-label\">HEADING</span><span class=\"inv-value\">${item.heading}</span></div>
        <div class=\"inv-row\"><span class=\"inv-label\">DEPTH</span><span class=\"inv-value\">${item.depth}</span></div>
        <div class=\"inv-row\"><span class=\"inv-label\">TEMP</span><span class=\"inv-value\">${item.temp}</span></div>
        <div class=\"inv-row\"><span class=\"inv-label\">SALINITY</span><span class=\"inv-value\">${item.salinity}</span></div>
        <div class=\"inv-row\"><span class=\"inv-label\">O2 CON.</span><span class=\"inv-value\">${item.o2con}</span></div>
        <div class=\"inv-row\"><span class=\"inv-label\">O2 SAT.</span><span class=\"inv-value\">${item.o2sat}</span></div>
      </div>
    `;
    const thumbEl = card.querySelector('.inv-thumb');
    if (item.image && thumbEl) {
      const imgEl = new Image();
      imgEl.src = item.image;
      imgEl.alt = item.name;
      thumbEl.appendChild(imgEl);
    }
    inventoryGridEl.appendChild(card);
  });
}
