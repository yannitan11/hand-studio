// HÄND STUDIO — orchestration: camera → tracking → gesture state machine →
// effects + HUD. One mirrored render loop. Vanilla ES modules, no build.

import { BRAND, GESTURE, FREEZE, FOCUS, DISTORT, MODES, TICKER, STATUS } from './config.js';
import { startCamera, CameraError } from './camera.js';
import { loadTracker, detect } from './tracking.js';
import * as G from './gestures.js';
import { Effects } from './effects.js';
import * as HUD from './hud.js';

// ── DOM ──
const video = document.getElementById('cam');
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const el = (id) => document.getElementById(id);
const startScreen = el('startScreen');
const errorScreen = el('errorScreen');
const loading = el('loading');
el('startScreen').querySelector('.eyebrow').textContent = `${BRAND.watermark} — ${BRAND.build}`;

// ── State ──
const fx = new Effects();
let dpr = Math.min(window.devicePixelRatio || 1, 2);
let running = false;
let trackerReady = false;

let status = STATUS.IDLE;
let brush = MODES.PIXEL; // 1 → PIXEL, 2 → SHIFT
let pinchActive = false;
let pinchHold = 0;
let manualFreeze = false;

let focusPx = 0.3; // set on resize
let focusTarget = 0.3;
let showFocusUntil = 0;

let brushRadius = 0;
let dwellMs = 0;
let lastTip = null; // {x,y}
let prevWristY = null;

// mouse fallback
let mouse = { x: 0, y: 0, down: false, active: false };

// fps
let fps = 0;
let lastNow = performance.now();

// ── Sizing ──
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  canvas.width = w;
  canvas.height = h;
  fx.resize(w, h);
  HUD.setScale(dpr);
  const minDim = Math.min(w, h);
  focusPx = focusTarget = FOCUS.start * minDim;
}
window.addEventListener('resize', resize);

// ── Landmark → mirrored canvas-px mapper (accounts for cover-crop) ──
function makeMapper() {
  const w = canvas.width;
  const h = canvas.height;
  const vw = video.videoWidth || w;
  const vh = video.videoHeight || h;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const ox = (w - dw) / 2;
  const oy = (h - dh) / 2;
  return (p) => ({ x: w - (ox + p.x * dw), y: oy + p.y * dh });
}

// ── Gesture → state, per frame ──
function step(now, dt) {
  const det = trackerReady && video.readyState >= 2 ? detect(video, now) : null;
  const hands = det?.hands || [];
  const map = makeMapper();
  const handsPx = hands.map((lm) => lm.map(map));
  const primary = hands[0];

  // Pinch → freeze (hold while pinched), with hysteresis.
  if (primary) {
    const amt = G.pinchAmount(primary);
    if (!pinchActive) {
      if (amt < GESTURE.pinchRatio) {
        pinchHold++;
        if (pinchHold >= FREEZE.holdFrames) {
          pinchActive = true;
          fx.freeze();
        }
      } else pinchHold = 0;
    } else if (amt > GESTURE.pinchReleaseRatio) {
      pinchActive = false;
      pinchHold = 0;
      if (!manualFreeze) fx.unfreeze();
    }
  } else {
    pinchHold = 0;
    if (pinchActive && !manualFreeze) {
      pinchActive = false;
      fx.unfreeze();
    }
  }

  // Point-up → resize focus reticle from vertical hand motion.
  let resizing = false;
  if (primary) {
    const wristY = map(primary[G_WRIST]).y;
    if (G.isPointUp(primary) && prevWristY != null) {
      const dy = wristY - prevWristY; // + = down
      if (Math.abs(dy) > GESTURE.resizeVelocity * dpr) {
        const minDim = Math.min(canvas.width, canvas.height);
        focusTarget = clamp(
          focusTarget - dy * FOCUS.gain * canvas.height,
          FOCUS.min * minDim,
          FOCUS.max * minDim
        );
        resizing = true;
        showFocusUntil = now + 900;
      }
    }
    prevWristY = wristY;
  } else {
    prevWristY = null;
  }

  // Distortion brush: index-point (or mouse) paints onto the frozen/live frame.
  let painting = false;
  let tip = null;
  if (primary && G.isPointingBrush(primary)) {
    tip = map(primary[G.INDEX_TIP]);
  } else if (mouse.down) {
    tip = { x: mouse.x * dpr, y: mouse.y * dpr };
  }

  // render base first so the brush samples the current frame
  fx.renderBase(video);

  if (tip) {
    painting = true;
    const speed = lastTip ? Math.hypot(tip.x - lastTip.x, tip.y - lastTip.y) : 0;
    if (speed < GESTURE.dwellSpeed * dpr) dwellMs += dt;
    else dwellMs = 0;
    const intensity = clamp(dwellMs / DISTORT.dwellRampMs, 0, 1);
    brushRadius = lerp(brushRadius || DISTORT.radius * dpr, DISTORT.radius * dpr, DISTORT.radiusEase);
    fx.paint(tip.x, tip.y, brushRadius, brush, intensity);
  } else {
    dwellMs = 0;
  }
  lastTip = tip;

  // ── Status resolution (priority) ──
  if (pinchActive || (manualFreeze && fx.isFrozen)) status = STATUS.FROZEN;
  else if (painting) status = STATUS.DISTORTING;
  else if (resizing) status = STATUS.RESIZING;
  else if (hands.length) status = STATUS.TRACKING;
  else status = STATUS.IDLE;

  // ── Draw ──
  fx.compositeTo(ctx);

  if (painting && tip) {
    const block = DISTORT.blockMin + (DISTORT.blockMax - DISTORT.blockMin) * clamp(dwellMs / DISTORT.dwellRampMs, 0, 1);
    HUD.drawBrushGrid(ctx, tip.x, tip.y, brushRadius, brush === MODES.PIXEL ? block : 12);
  }

  HUD.drawSkeleton(ctx, handsPx);

  // tracking box(es)
  for (const lm of hands) {
    const bb = G.boundingBox(lm);
    // map corners (mirroring flips min/max x)
    const c1 = map({ x: bb.minX, y: bb.minY });
    const c2 = map({ x: bb.maxX, y: bb.maxY });
    const x = Math.min(c1.x, c2.x);
    const y = Math.min(c1.y, c2.y);
    const w = Math.abs(c2.x - c1.x);
    const h = Math.abs(c2.y - c1.y);
    HUD.drawBox(ctx, { x, y, w, h, nx0: x / dpr, ny1: (y + h) / dpr });
  }

  // focus reticle
  focusPx = lerp(focusPx, focusTarget, FOCUS.ease);
  if (resizing || now < showFocusUntil) {
    HUD.drawFocus(ctx, canvas.width / 2, canvas.height / 2, focusPx);
  }

  // ── HUD text ──
  updateHud(hands.length);
}

const G_WRIST = 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ── HUD DOM updates ──
const rStatus = el('rStatus');
const rFps = el('rFps');
const rInput = el('rInput');
const rMode = el('rMode');

function updateHud(nHands) {
  if (rStatus.textContent !== status) rStatus.textContent = status;
  rStatus.className = 'value';
  if (status === STATUS.FROZEN) rStatus.classList.add('is-frozen');
  else if (status === STATUS.DISTORTING) rStatus.classList.add('is-distort');
  else if (status === STATUS.RESIZING) rStatus.classList.add('is-resize');

  rFps.textContent = String(Math.round(fps)).padStart(2, '0');
  rInput.textContent = `${nHands} HAND${nHands === 1 ? '' : 'S'}`;

  const modeText = status === STATUS.DISTORTING ? brush : MODES.NORMAL;
  if (rMode.textContent !== modeText) rMode.textContent = modeText;
}

// ── Loop ──
function frame() {
  if (!running) return;
  const now = performance.now();
  const dt = now - lastNow;
  lastNow = now;
  fps = fps * 0.9 + (1000 / Math.max(dt, 1)) * 0.1;
  step(now, dt);
  requestAnimationFrame(frame);
}

// ── Ticker ──
let tick = 0;
function startTicker() {
  const node = el('ticker');
  setInterval(() => {
    node.classList.add('blink');
    setTimeout(() => {
      tick = (tick + 1) % TICKER.lines.length;
      node.textContent = TICKER.lines[tick];
      node.classList.remove('blink');
    }, 250);
  }, TICKER.intervalMs);
}

// ── Input: keyboard + mouse fallback ──
function bindInput() {
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'r') fx.reset(), (manualFreeze = false), (pinchActive = false);
    else if (k === 'f') {
      manualFreeze = !manualFreeze;
      if (manualFreeze) fx.freeze();
      else if (!pinchActive) fx.unfreeze();
    } else if (k === '1') brush = MODES.PIXEL;
    else if (k === '2') brush = MODES.SHIFT;
  });
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  };
  canvas.addEventListener('mousemove', pos);
  canvas.addEventListener('mousedown', (e) => {
    pos(e);
    mouse.down = true;
  });
  window.addEventListener('mouseup', () => (mouse.down = false));
  // touch → same as mouse-drag distortion
  canvas.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches[0];
      const r = canvas.getBoundingClientRect();
      mouse.x = t.clientX - r.left;
      mouse.y = t.clientY - r.top;
      mouse.down = true;
    },
    { passive: true }
  );
  canvas.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      const r = canvas.getBoundingClientRect();
      mouse.x = t.clientX - r.left;
      mouse.y = t.clientY - r.top;
    },
    { passive: true }
  );
  window.addEventListener('touchend', () => (mouse.down = false));
}

// ── Boot ──
async function boot() {
  startScreen.hidden = true;
  errorScreen.hidden = true;
  loading.hidden = false;
  try {
    await startCamera(video);
  } catch (err) {
    loading.hidden = true;
    showError(err);
    return;
  }
  resize();
  running = true;
  lastNow = performance.now();
  requestAnimationFrame(frame);

  // load tracker in parallel; effects/mouse already work without it
  loadTracker()
    .then(() => {
      trackerReady = true;
      loading.hidden = true;
    })
    .catch(() => {
      loading.hidden = true; // keep running with mouse fallback
    });
  startTicker();
}

function showError(err) {
  errorScreen.hidden = false;
  const title = el('errTitle');
  const msg = el('errMsg');
  if (err instanceof CameraError && err.kind === 'denied') {
    title.textContent = 'Camera blocked.';
    msg.textContent =
      'Allow camera access in your browser’s site settings, then try again. Nothing is recorded — the feed stays on your device.';
  } else if (err instanceof CameraError && err.kind === 'notfound') {
    title.textContent = 'No camera found.';
    msg.textContent = 'Plug in or enable a webcam and try again.';
  } else if (err instanceof CameraError && err.kind === 'insecure') {
    title.textContent = 'Needs a secure link.';
    msg.textContent = err.message;
  } else {
    title.textContent = 'Something went wrong.';
    msg.textContent = err?.message || 'Could not start the camera.';
  }
}

el('enterBtn').addEventListener('click', boot);
el('retryBtn').addEventListener('click', boot);
bindInput();
