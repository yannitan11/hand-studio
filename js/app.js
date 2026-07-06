// HÄND STUDIO — orchestration: camera → tracking → gesture state machine →
// freeze patches + HUD. One mirrored render loop. Vanilla ES modules, no build.
//
// Core loop (reference recording, first 8s):
//   two hands frame a rect (RESIZING) → both pinch → region freezes as a
//   pinned patch (FROZEN, survives 0 hands) → fists (or R) reset.

import { BRAND, GESTURE, FRAME, TICKER, STATUS } from './config.js';
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
startScreen.querySelector('.eyebrow').textContent = `${BRAND.watermark} — ${BRAND.build}`;

// ── State ──
const fx = new Effects();
let dpr = Math.min(window.devicePixelRatio || 1, 2);
let running = false;
let trackerReady = false;

let status = STATUS.IDLE;
let bothPinched = false; // latched until both hands release
let pinchHold = 0;
let fistHold = 0;

// mouse/touch fallback: drag a rect, release to freeze it
let drag = null; // {x0, y0, x1, y1} in device px

// fps
let fps = 0;
let lastNow = performance.now();

// ── Sizing ──
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  fx.resize(canvas.width, canvas.height);
  HUD.setScale(dpr);
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

function rectFromPoints(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

// ── Per-frame step ──
function step(now) {
  const det = trackerReady && video.readyState >= 2 ? detect(video, now) : null;
  const hands = det?.hands || [];
  const map = makeMapper();
  const handsPx = hands.map((lm) => lm.map(map));

  fx.renderBase(video);

  // ── Two-hand framing rect ──
  let frameRect = null;
  let framing = false;
  if (hands.length === 2) {
    const gripA = map(G.gripPoint(hands[0]));
    const gripB = map(G.gripPoint(hands[1]));
    frameRect = rectFromPoints(gripA, gripB);
    const min = FRAME.minSizePx * dpr;
    framing = frameRect.w > min && frameRect.h > min;

    // both hands pinched (with hysteresis + a short hold) → capture
    const aAmt = G.pinchAmount(hands[0]);
    const bAmt = G.pinchAmount(hands[1]);
    const pinchedNow = aAmt < GESTURE.pinchRatio && bAmt < GESTURE.pinchRatio;
    const releasedNow =
      aAmt > GESTURE.pinchReleaseRatio && bAmt > GESTURE.pinchReleaseRatio;

    if (!bothPinched && framing && pinchedNow) {
      pinchHold++;
      if (pinchHold >= FRAME.captureHoldFrames) {
        fx.freeze(frameRect, now); // freeze everything but this window
        bothPinched = true; // latch: no re-capture until both release
        pinchHold = 0;
      }
    } else if (!pinchedNow) {
      pinchHold = 0;
    }
    if (bothPinched && releasedNow) bothPinched = false;
  } else {
    pinchHold = 0;
    bothPinched = false;
  }

  // ── Fists → reset ──
  if (fx.isFrozen && hands.length > 0 && hands.every((lm) => G.isFist(lm))) {
    fistHold++;
    if (fistHold >= GESTURE.fistHoldFrames) {
      fx.reset();
      fistHold = 0;
    }
  } else {
    fistHold = 0;
  }

  // ── Status resolution ──
  if (framing) status = STATUS.RESIZING;
  else if (fx.isFrozen) status = STATUS.FROZEN;
  else if (hands.length) status = STATUS.TRACKING;
  else status = STATUS.IDLE;

  // ── Draw ──
  fx.compositeTo(ctx);
  HUD.drawWindow(ctx, fx.window);
  HUD.drawFlash(ctx, now, fx.flashAt, canvas.width, canvas.height);
  HUD.drawSkeleton(ctx, handsPx);

  if (frameRect && framing) {
    HUD.drawBox(ctx, {
      ...frameRect,
      nx0: frameRect.x / dpr,
      ny0: frameRect.y / dpr,
      nx1: (frameRect.x + frameRect.w) / dpr,
      ny1: (frameRect.y + frameRect.h) / dpr,
    });
  } else {
    for (const lm of handsPx) HUD.drawGrip(ctx, gripPx(lm));
  }

  // mouse-drag fallback rect
  if (drag) {
    const r = rectFromPoints({ x: drag.x0, y: drag.y0 }, { x: drag.x1, y: drag.y1 });
    if (r.w > 4 && r.h > 4) {
      HUD.drawBox(ctx, {
        ...r,
        nx0: r.x / dpr,
        ny0: r.y / dpr,
        nx1: (r.x + r.w) / dpr,
        ny1: (r.y + r.h) / dpr,
      });
    }
  }

  updateHud(hands.length);
}

// grip point straight from the already-mapped px landmarks
function gripPx(lmPx) {
  return { x: (lmPx[4].x + lmPx[8].x) / 2, y: (lmPx[4].y + lmPx[8].y) / 2 };
}

// ── HUD DOM updates ──
const rStatus = el('rStatus');
const rFps = el('rFps');
const rInput = el('rInput');
const rMode = el('rMode');

function updateHud(nHands) {
  if (rStatus.textContent !== status) rStatus.textContent = status;
  rStatus.className = 'value';
  if (status === STATUS.FROZEN) rStatus.classList.add('is-frozen');
  else if (status === STATUS.RESIZING) rStatus.classList.add('is-resize');

  rFps.textContent = String(Math.round(fps)).padStart(2, '0');
  rInput.textContent = `${nHands} HAND${nHands === 1 ? '' : 'S'}`;

  const modeText = fx.isFrozen ? 'LIVE WINDOW' : 'NORMAL';
  if (rMode.textContent !== modeText) rMode.textContent = modeText;
}

// ── Loop ──
function frame() {
  if (!running) return;
  const now = performance.now();
  const dt = now - lastNow;
  lastNow = now;
  fps = fps * 0.9 + (1000 / Math.max(dt, 1)) * 0.1;
  step(now);
  requestAnimationFrame(frame);
}

// ── State-aware ticker ──
let tick = 0;
function tickerLines() {
  if (fx.isFrozen) return TICKER.frozen;
  if (status === STATUS.IDLE) return TICKER.idle;
  return TICKER.tracking;
}
function startTicker() {
  const node = el('ticker');
  setInterval(() => {
    node.classList.add('blink');
    setTimeout(() => {
      const lines = tickerLines();
      tick = (tick + 1) % lines.length;
      node.textContent = lines[tick];
      node.classList.remove('blink');
    }, 250);
  }, TICKER.intervalMs);
}

// ── Input: keyboard + mouse/touch fallback (drag a rect → freeze it) ──
function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r') fx.reset();
  });

  const pt = (e) => {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * dpr, y: (src.clientY - r.top) * dpr };
  };
  const down = (e) => {
    const p = pt(e);
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  };
  const move = (e) => {
    if (!drag) return;
    const p = pt(e);
    drag.x1 = p.x;
    drag.y1 = p.y;
  };
  const up = () => {
    if (!drag) return;
    const r = rectFromPoints({ x: drag.x0, y: drag.y0 }, { x: drag.x1, y: drag.y1 });
    const min = FRAME.minSizePx * dpr;
    if (r.w > min && r.h > min && running) fx.freeze(r, performance.now());
    drag = null;
  };
  canvas.addEventListener('mousedown', down);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', down, { passive: true });
  canvas.addEventListener('touchmove', move, { passive: true });
  window.addEventListener('touchend', up);
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

  // load tracker in parallel; the mouse fallback already works without it
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
