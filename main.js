// DOM elements - will be initialized when DOM is ready
let introScreen, gameScreen, playButton, inventoryScreen, encyclopediaScreen;
let keyElements, stick, viewportEl, craneEl;
let headingEl, depthEl, utcTimeEl, samplesCountEl, inventoryGridEl, encyclopediaGridEl;
let winnerOverlayEl, winnerContinueBtn, winnerResetBtn, currentTargetEl, currentTargetThumbEl;

// Initialize DOM elements when document is ready
function initializeDOMElements() {
  // Screen sections
  introScreen = document.getElementById("intro-screen");
  gameScreen = document.getElementById("game-screen");
  playButton = document.getElementById("play-btn");
  inventoryScreen = document.getElementById("inventory-screen");
  encyclopediaScreen = document.getElementById("encyclopedia-screen");

  // Validate critical elements
  if (!playButton) {
    throw new Error('Play button not found');
  }
  if (!introScreen) {
    throw new Error('Intro screen not found');
  }
  if (!gameScreen) {
    throw new Error('Game screen not found');
  }

  // Key UI elements
  keyElements = {
    q: document.querySelector(".key-q"),
    w: document.querySelector(".key-w"),
    a: document.querySelector(".key-a"),
    s: document.querySelector(".key-s"),
    d: document.querySelector(".key-d"),
    e: document.querySelector(".key-e"),
    i: document.querySelector(".key-i"),
    ArrowUp: document.querySelector(".key-arrow-up"),
    ArrowDown: document.querySelector(".key-arrow-down"),
    ArrowLeft: document.querySelector(".key-arrow-left"),
    ArrowRight: document.querySelector(".key-arrow-right"),
  };

  stick = document.getElementById("stick");
  viewportEl = document.getElementById("viewport");
  craneEl = null;

  // HUD elements
  headingEl = document.getElementById("heading-val");
  depthEl = document.getElementById("depth-val");
  utcTimeEl = document.getElementById("utc-time");
  samplesCountEl = document.getElementById("samples-count");
  inventoryGridEl = document.getElementById("inventory-grid");
  encyclopediaGridEl = document.getElementById("encyclopedia-grid");
  winnerOverlayEl = document.getElementById("winner-overlay");
  winnerContinueBtn = document.getElementById("winner-continue");
  winnerResetBtn = document.getElementById("winner-reset");
  currentTargetEl = document.getElementById("current-target");
  currentTargetThumbEl = document.getElementById("current-target-thumb");
  
  // Static ocean status values (hard-coded)
  const tempEl = document.getElementById("temp-val");
  const salinityEl = document.getElementById("salinity-val");
  const o2conEl = document.getElementById("o2con-val");
  const o2satEl = document.getElementById("o2sat-val");
  
  if (tempEl) tempEl.textContent = "2.63 °C";
  if (salinityEl) salinityEl.textContent = "34.5 PSU";
  if (o2conEl) o2conEl.textContent = "183 uM";
  if (o2satEl) o2satEl.textContent = "54.3 %";
}

let transitionTimeoutId = null;
let showInventory = false;
let showEncyclopedia = false;

const state = {
  camera: { x: 0, y: 0 },
  arm: { x: 0, y: 0 },
  parallax: { x: 0, y: 0 },
  caught: [],
  currentSpecies: null,
  currentSpeciesEl: null,
  crane: { x: 0, y: 0 }, // pixel coords within viewport
  unlocked: new Set(),
  speciesEls: new Map(), // id -> HTMLElement (visible species in viewport)
  specAnchorById: new Map(), // id -> anchor index
  layoutOrder: [], // randomized order of anchor indices
};

// Base species templates
const SPECIES_BASE = [
  { id: "batatita", name: "BATATITA", image: "./species/batatita.png" },
  { id: "el_ojo_del_abismo", name: "EL OJO DEL ABISMO", image: "./species/el_ojo_del_abismo.png" },
  { id: "estrella_culona", name: "ESTRELLA CULONA", image: "./species/estrella_culona.png" },
  { id: "limon", name: "LIMÓN", image: "./species/limon.png" },
  { id: "pececito", name: "PECECITO", image: "./species/pececito.png" },
];

// Place many instances of each species across the world grid
const SPECIES = [];
(function seedSpecies() {
  // grid every 60° heading, depths from 1200 to 1800 in 100m steps
  const headings = [0, 60, 120, 180, 240, 300];
  const depths = [1200, 1300, 1400, 1500, 1600, 1700, 1800];
  let idx = 0;
  headings.forEach((h) => {
    depths.forEach((d) => {
      // pick a template round-robin
      const base = SPECIES_BASE[idx % SPECIES_BASE.length];
      SPECIES.push({ id: base.id + '_' + h + '_' + d, name: base.name, image: base.image, heading: h, depth: d });
      idx += 1;
    });
  });
})();

// Precompute a set of anchor offsets in a grid around center; then shuffle for this run
const ANCHORS = [];
(function seedAnchors() {
  const rings = [0, 1, 2];
  const step = 90; // px between anchors roughly
  rings.forEach((r) => {
    const radius = r * step;
    const count = r === 0 ? 1 : 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      ANCHORS.push({ dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius });
    }
  });
})();

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function seedLayoutOrder() {
  state.layoutOrder = shuffle(Array.from({ length: ANCHORS.length }, (_, i) => i));
  state.specAnchorById = new Map();
}

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
      // Initialize crane and visible species on enter
      setTimeout(() => {
        ensureCrane();
        centerCrane();
        seedLayoutOrder();
        refreshVisibleSpecies();
        updateTargetingFeedback();
      }, 200);
    },
    { once: true }
  );
}

// Initialize event listeners after DOM is ready
function initializeEventListeners() {
  // Allow manual start via PLAY
  if (playButton) {
    playButton.addEventListener("click", showGameScreen);
  }

  // Keyboard accessibility during intro: Enter/Space triggers play
  if (introScreen) {
    introScreen.addEventListener("keydown", (event) => {
      const key = event.key;
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        showGameScreen();
      }
    });
  }

  // Focus play by default for fast Enter press
  if (playButton) {
    playButton.focus({ preventScroll: true });
  }

  // Game keyboard controls
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // Winner overlay buttons
  if (winnerContinueBtn) {
    winnerContinueBtn.addEventListener('click', () => {
      winnerOverlayEl.classList.add('hidden');
      winnerOverlayEl.setAttribute('aria-hidden', 'true');
    });
  }

  if (winnerResetBtn) {
    winnerResetBtn.addEventListener('click', () => {
      // Reset progress: inventory and unlocks
      state.caught = [];
      state.unlocked = new Set();
      renderInventory();
      if (typeof renderEncyclopedia === 'function') renderEncyclopedia();
      updateHud();
      winnerOverlayEl.classList.add('hidden');
      winnerOverlayEl.setAttribute('aria-hidden', 'true');
    });
  }

  // Initial HUD and ticking time
  setInterval(updateHud, 1000);
  updateHud();
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    initializeDOMElements();
    initializeEventListeners();
    console.log('Game initialized successfully');
  } catch (error) {
    console.error('Error initializing game:', error);
  }
});

// -------- Game logic --------
function updateHud() {
  // HEADING and DEPTH controlled by WASD (robotic arm)
  headingEl.textContent = `${getCameraHeading()} *`;
  const depthMeters = getCameraDepth();
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
  if (!stick) return;
  
  // Determine which image to show based on input direction
  let imageName = 'stand'; // default state
  
  if (dx !== 0 || dy !== 0) {
    if (dx === 0 && dy > 0) {
      imageName = 'up';
    } else if (dx === 0 && dy < 0) {
      imageName = 'back';
    } else if (dx < 0 && dy === 0) {
      imageName = 'left';
    } else if (dx > 0 && dy === 0) {
      imageName = 'right';
    } else if (dx < 0 && dy > 0) {
      imageName = 'side';
    } else if (dx > 0 && dy > 0) {
      imageName = 'side';
    } else if (dx < 0 && dy < 0) {
      imageName = 'side';
    } else if (dx > 0 && dy < 0) {
      imageName = 'side';
    }
  }
  
  stick.src = `./assets/hud/${imageName}.png`;
}

// --- Background panning via WASD ---
function panBackground(dx, dy) {
  if (!viewportEl) return;
  // Move in tile units; 24px per step feels OK, adjust as needed
  const step = 24;
  state.parallax.x += dx * step;
  state.parallax.y += dy * step;
  // Wrap positions to avoid growing numbers
  const x = state.parallax.x % (step * 1000);
  const y = state.parallax.y % (step * 1000);
  viewportEl.style.backgroundPosition = `${-x}px ${-y}px`;
}

function highlight(key, active) {
  const el = keyElements[key];
  if (!el) return;
  el.classList.toggle("active", active);
}

function toggleInventory() {
  showInventory = !showInventory;
  // If opening inventory, ensure encyclopedia is closed
  if (showInventory && typeof showEncyclopedia !== 'undefined' && showEncyclopedia) {
    showEncyclopedia = false;
    if (typeof encyclopediaScreen !== 'undefined' && encyclopediaScreen) {
      encyclopediaScreen.classList.add("hidden");
      encyclopediaScreen.setAttribute("aria-hidden", "true");
    }
  }
  inventoryScreen.classList.toggle("hidden", !showInventory);
  inventoryScreen.setAttribute("aria-hidden", String(!showInventory));
  if (showInventory) renderInventory();
}

function toggleEncyclopedia() {
  showEncyclopedia = !showEncyclopedia;
  // If opening encyclopedia, ensure inventory is closed
  if (showEncyclopedia && showInventory) {
    showInventory = false;
    inventoryScreen.classList.add("hidden");
    inventoryScreen.setAttribute("aria-hidden", "true");
  }
  encyclopediaScreen.classList.toggle("hidden", !showEncyclopedia);
  encyclopediaScreen.setAttribute("aria-hidden", String(!showEncyclopedia));
  if (showEncyclopedia) renderEncyclopedia();
}

function catchCreature() {
  // Only catch if a species is currently spawned
  if (!state.currentSpeciesEl || !state.currentSpecies) return;
  // Require crane to be pointing at species
  if (!isCranePointingAtSpecies()) return;
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
    heading: `${getCameraHeading()} *`,
    depth: `${getCameraDepth().toFixed(0)} m`,
    temp: "2.63 °C",
    salinity: "34.5 PSU",
    o2con: "183 uM",
    o2sat: "54.3 %",
  };
  state.caught.push(item);
  // Mark species as unlocked permanently
  state.unlocked.add(item.image);
  updateHud();

  // Clear current target and schedule next spawn
  state.currentSpecies = null;
  state.currentSpeciesEl = null;
  if (currentTargetEl) currentTargetEl.textContent = "-";

  renderInventory();
  if (typeof renderEncyclopedia === 'function') renderEncyclopedia();
  checkWinCondition();
  setTimeout(spawnRandomSpecies, 600);
}

// Compute world values tied to WASD
function getCameraHeading() {
  return mod(state.arm.x * 5, 360);
}

function getCameraDepth() {
  return clamp(1200 + state.arm.y * 5, 0, 6000);
}

function getAngularDelta(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function getSignedAngularDelta(a, b) {
  let d = ((b - a + 540) % 360) - 180; // (-180,180]
  return d === -180 ? 180 : d;
}

function ensureSpeciesElement(spec) {
  if (!viewportEl) return null;
  if (state.speciesEls.has(spec.id)) return state.speciesEls.get(spec.id);
  const img = new Image();
  img.src = spec.image;
  img.alt = spec.name;
  img.className = 'species';
  // Place at center; will be repositioned according to camera delta
  const bounds = viewportEl.getBoundingClientRect();
  const size = 120;
  img.style.left = `${(bounds.width - size) / 2}px`;
  img.style.top = `${(bounds.height - size) / 2}px`;
  viewportEl.appendChild(img);
  state.speciesEls.set(spec.id, img);
  return img;
}

function removeSpeciesElement(specId) {
  const el = state.speciesEls.get(specId);
  if (el) {
    el.remove();
    state.speciesEls.delete(specId);
  }
}

function positionSpeciesElement(spec, el, camH, camD) {
  if (!viewportEl || !el) return;
  const bounds = viewportEl.getBoundingClientRect();
  const size = 120;
  const padding = 24;
  const centerX = bounds.width / 2 - size / 2;
  const centerY = bounds.height / 2 - size / 2;
  const dhSigned = getSignedAngularDelta(camH, spec.heading);
  const ddSigned = spec.depth - camD;
  const kx = (bounds.width / 2 - padding - size / 2) / 50; // map 50° to edge
  const ky = (bounds.height / 2 - padding - size / 2) / 50; // map 50m to edge
  const offsetX = dhSigned * kx;
  const offsetY = ddSigned * ky;
  const left = clamp(centerX + offsetX, padding, bounds.width - padding - size);
  const top = clamp(centerY + offsetY, padding, bounds.height - padding - size);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function computeSpeciesPosition(spec, camH, camD, bounds) {
  const size = 120;
  const padding = 24;
  const centerX = bounds.width / 2 - size / 2;
  const centerY = bounds.height / 2 - size / 2;
  const dhSigned = getSignedAngularDelta(camH, spec.heading);
  const ddSigned = spec.depth - camD;
  const kx = (bounds.width / 2 - padding - size / 2) / 50;
  const ky = (bounds.height / 2 - padding - size / 2) / 50;
  const offsetX = dhSigned * kx;
  const offsetY = ddSigned * ky;
  // Anchor-based random layout to avoid exact collisions for this session
  const specKey = spec.id;
  let anchorIndex = state.specAnchorById.get(specKey);
  if (anchorIndex === undefined) {
    anchorIndex = state.layoutOrder[state.specAnchorById.size % state.layoutOrder.length];
    state.specAnchorById.set(specKey, anchorIndex);
  }
  const anchor = ANCHORS[anchorIndex] || { dx: 0, dy: 0 };
  const left = clamp(centerX + offsetX + anchor.dx * 0.2, padding, bounds.width - padding - size);
  const top = clamp(centerY + offsetY + anchor.dy * 0.2, padding, bounds.height - padding - size);
  return { left, top, size, padding };
}

function adjustForOverlap(placed, pos, bounds) {
  const step = 16; // px nudge
  const maxAttempts = 40;
  let attempt = 0;
  let angle = 0;
  let radius = 0;
  let { left, top, size, padding } = pos;
  function overlaps(a, b) {
    return !(
      a.left + a.size <= b.left ||
      b.left + b.size <= a.left ||
      a.top + a.size <= b.top ||
      b.top + b.size <= a.top
    );
  }
  while (attempt < maxAttempts) {
    const conflict = placed.find((p) => overlaps(p, { left, top, size }));
    if (!conflict) break;
    // Spiral nudge outward with random phase
    angle += Math.PI / 3;
    radius += step;
    left = clamp(left + Math.cos(angle + attempt * 0.13) * radius, padding, bounds.width - padding - size);
    top = clamp(top + Math.sin(angle + attempt * 0.11) * radius, padding, bounds.height - padding - size);
    attempt += 1;
  }
  return { left, top, size };
}

function refreshVisibleSpecies() {
  if (!viewportEl) return;
  const camH = getCameraHeading();
  const camD = getCameraDepth();
  // Tunable window and cap
  const H_WIN = 40; // degrees
  const D_WIN = 80; // meters
  const MAX_VISIBLE = 4;

  const bounds = viewportEl.getBoundingClientRect();
  const placed = [];

  // Build and rank candidates
  const scored = SPECIES.map((spec) => {
    const dh = getAngularDelta(camH, spec.heading);
    const dd = Math.abs(camD - spec.depth);
    const score = Math.hypot(dh / H_WIN, dd / D_WIN);
    return { spec, dh, dd, score };
  });
  let selected = scored
    .filter((x) => x.dh <= H_WIN || x.dd <= D_WIN)
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_VISIBLE);
  // Fallback: ensure at least one is visible
  if (selected.length === 0) {
    selected = scored.sort((a, b) => a.score - b.score).slice(0, 1);
  }

  const selectedIds = new Set(selected.map((s) => s.spec.id));

  // Remove any non-selected currently visible
  Array.from(state.speciesEls.keys()).forEach((id) => {
    if (!selectedIds.has(id)) removeSpeciesElement(id);
  });

  // Place selected species without overlap
  selected.forEach(({ spec }) => {
    const el = ensureSpeciesElement(spec);
    const pos = computeSpeciesPosition(spec, camH, camD, bounds);
    const adj = adjustForOverlap(placed, pos, bounds);
    el.style.left = `${adj.left}px`;
    el.style.top = `${adj.top}px`;
    placed.push(adj);
  });
}

// ---- Crane (crosshair) mechanics ----
function ensureCrane() {
  if (craneEl || !viewportEl) return;
  const el = document.createElement("div");
  el.className = "crane";
  el.setAttribute("aria-hidden", "true");
  viewportEl.appendChild(el);
  craneEl = el;
}

function centerCrane() {
  if (!viewportEl) return;
  ensureCrane();
  const rect = viewportEl.getBoundingClientRect();
  positionCrane(rect.width / 2, rect.height / 2);
}

function positionCrane(x, y) {
  if (!craneEl || !viewportEl) return;
  const rect = viewportEl.getBoundingClientRect();
  const size = 28; // crane size in CSS
  const clampedX = clamp(x, 0 + size / 2, rect.width - size / 2);
  const clampedY = clamp(y, 0 + size / 2, rect.height - size / 2);
  state.crane.x = clampedX;
  state.crane.y = clampedY;
  // Convert center coords to top-left for absolute positioning
  craneEl.style.left = `${clampedX - size / 2}px`;
  craneEl.style.top = `${clampedY - size / 2}px`;
  updateTargetingFeedback();
}

function moveCrane(dx, dy) {
  ensureCrane();
  const step = 20; // px per keypress
  positionCrane(state.crane.x + dx * step, state.crane.y + dy * step);
}

function isCranePointingAtSpecies() {
  if (!craneEl || !state.currentSpeciesEl) return false;
  const c = craneEl.getBoundingClientRect();
  const s = state.currentSpeciesEl.getBoundingClientRect();
  const cx = c.left + c.width / 2;
  const cy = c.top + c.height / 2;
  return cx >= s.left && cx <= s.right && cy >= s.top && cy <= s.bottom;
}

function updateTargetingFeedback() {
  // Determine if crane is pointing at any visible species
  let pointedSpec = null;
  let pointedEl = null;
  state.speciesEls.forEach((el, id) => {
    if (!pointedSpec && craneEl) {
      const c = craneEl.getBoundingClientRect();
      const s = el.getBoundingClientRect();
      const cx = c.left + c.width / 2;
      const cy = c.top + c.height / 2;
      const hit = cx >= s.left && cx <= s.right && cy >= s.top && cy <= s.bottom;
      if (hit) {
        pointedSpec = SPECIES.find((sp) => sp.id === id);
        pointedEl = el;
      }
    }
    el.classList.remove('targeted');
  });
  if (!pointedSpec) {
    if (currentTargetEl) currentTargetEl.textContent = '-';
    if (currentTargetThumbEl) currentTargetThumbEl.innerHTML = '';
    state.currentSpecies = null;
    state.currentSpeciesEl = null;
    return;
  }
  pointedEl.classList.add('targeted');
  state.currentSpecies = pointedSpec;
  state.currentSpeciesEl = pointedEl;
  if (currentTargetEl) {
    const isUnlocked = state.unlocked.has(pointedSpec.image);
    currentTargetEl.textContent = isUnlocked ? pointedSpec.name : '???????';
  }
  if (currentTargetThumbEl) {
    currentTargetThumbEl.innerHTML = '';
    const img = new Image();
    img.src = pointedSpec.image;
    img.alt = pointedSpec.name;
    currentTargetThumbEl.appendChild(img);
    const isUnlocked = state.unlocked.has(pointedSpec.image);
    currentTargetThumbEl.classList.toggle('grey', !isUnlocked);
  }
}

function onKeyDown(event) {
  // Ignore if still in intro
  if (!gameScreen || gameScreen.classList.contains("hidden")) return;
  const key = event.key;
  if (key in keyElements) highlight(key, true);

  switch (key) {
    case "ArrowUp":
      state.camera.y += 1;
      moveCrane(0, -1);
      nudgeStick(0, 1);
      break;
    case "ArrowDown":
      state.camera.y -= 1;
      moveCrane(0, 1);
      nudgeStick(0, -1);
      break;
    case "ArrowLeft":
      state.camera.x -= 1;
      moveCrane(-1, 0);
      nudgeStick(-1, 0);
      break;
    case "ArrowRight":
      state.camera.x += 1;
      moveCrane(1, 0);
      nudgeStick(1, 0);
      break;
    case "w":
    case "W":
      state.arm.y += 1;
      panBackground(0, 1);
      refreshVisibleSpecies();
      break;
    case "s":
    case "S":
      state.arm.y -= 1;
      panBackground(0, -1);
      refreshVisibleSpecies();
      break;
    case "a":
    case "A":
      state.arm.x -= 1;
      panBackground(1, 0);
      refreshVisibleSpecies();
      break;
    case "d":
    case "D":
      state.arm.x += 1;
      panBackground(-1, 0);
      refreshVisibleSpecies();
      break;
    case "q":
    case "Q":
      catchCreature();
      break;
    case "e":
    case "E":
      toggleEncyclopedia();
      break;
    case "i":
    case "I":
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
    // Actions: release (liberar)
    const actions = document.createElement('div');
    actions.className = 'inv-actions';
    const releaseBtn = document.createElement('button');
    releaseBtn.className = 'liberar-btn';
    releaseBtn.textContent = 'LIBERAR';
    releaseBtn.addEventListener('click', () => releaseItem(item.id));
    actions.appendChild(releaseBtn);
    card.appendChild(actions);

    inventoryGridEl.appendChild(card);
  });
}

function releaseItem(id) {
  const index = state.caught.findIndex((i) => i.id === id);
  if (index === -1) return;
  state.caught.splice(index, 1);
  renderInventory();
  updateHud();
  if (typeof renderEncyclopedia === 'function') renderEncyclopedia();
}

function renderEncyclopedia() {
  if (!encyclopediaGridEl) return;
  encyclopediaGridEl.innerHTML = "";
  const unlockedImages = state.unlocked;
  // Show each species only once in the encyclopedia
  SPECIES_BASE.forEach((spec) => {
    const card = document.createElement('div');
    card.className = 'ency-card';
    if (unlockedImages.has(spec.image)) card.classList.add('unlocked');
    const img = new Image();
    img.src = spec.image;
    img.alt = spec.name;
    card.appendChild(img);
    encyclopediaGridEl.appendChild(card);
  });
}

function checkWinCondition() {
  if (!winnerOverlayEl) return;
  const total = SPECIES_BASE.length;
  if (state.unlocked.size >= total) {
    winnerOverlayEl.classList.remove('hidden');
    winnerOverlayEl.setAttribute('aria-hidden', 'false');
  }
}

if (winnerContinueBtn) {
  winnerContinueBtn.addEventListener('click', () => {
    winnerOverlayEl.classList.add('hidden');
    winnerOverlayEl.setAttribute('aria-hidden', 'true');
  });
}

if (winnerResetBtn) {
  winnerResetBtn.addEventListener('click', () => {
    // Reset progress: inventory and unlocks
    state.caught = [];
    state.unlocked = new Set();
    renderInventory();
    if (typeof renderEncyclopedia === 'function') renderEncyclopedia();
    updateHud();
    winnerOverlayEl.classList.add('hidden');
    winnerOverlayEl.setAttribute('aria-hidden', 'true');
  });
}
