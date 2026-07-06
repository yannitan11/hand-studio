// HÄND STUDIO — orchestration: camera → tracking → gesture state machine →
// freeze engine + HUD. One mirrored render loop. Vanilla ES modules, no build.
//
// Two toggleable freeze engines (press [M] to switch — see effects.js):
//   PATCH    — two hands frame a rect (FRAMING) → both pinch → that region
//              stamps on as a frozen patch. Stack many.
//   PORTHOLE — same framing/pinch, but the WHOLE frame freezes except that
//              region, which stays a live window (the original v2 behavior).
// Either way: grab a frozen patch/window to move it, pinch its corners (or
// drag a corner handle) to resize, fists (or R) to clear, S to save a PNG.

import { BRAND, GESTURE, FRAME, TICKER, STATUS, MODE, DEFAULT_MODE } from './config.js';
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
let mode = DEFAULT_MODE; // MODE.PATCH | MODE.PORTHOLE — toggled with [M]
let bothPinched = false; // latched until both hands release
let pinchHold = 0;
let pinchMiss = 0; // consecutive noisy frames tolerated mid-pinch-hold
let fistHold = 0;
let freezeGraceUntil = 0; // fist-reset ignored until this timestamp

// grab-to-move / resize the frozen thing (a patch, or the porthole window)
// with the hands. `target` is either a patch object or fx.portholeWindow.
let grab = null; // { kind:'move'|'resize', target, lastX, lastY }
let grabMiss = 0; // frames a held target survives losing its pinch

// mouse/touch fallback: create a rect, or grab an existing target
let drag = null; // {x0, y0, x1, y1, mode:'create'} in device px
let mgrab = null; // { kind:'move'|'resize', target, corner, offX, offY }

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

function pointInRect(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// ── Mode-dispatch helpers: same interaction code, different engine underneath ──
// PATCH mode has many targets (fx.patches); PORTHOLE mode has at most one
// (fx.portholeWindow). These let the grab/resize/capture code stay identical.
function targetAt(x, y) {
  if (mode === MODE.PORTHOLE) {
    const w = fx.portholeWindow;
    return w && pointInRect(w, x, y) ? w : null;
  }
  return fx.patchAt(x, y);
}
function bringToFront(target) {
  if (mode === MODE.PATCH) fx.bringToFront(target);
}
function moveTarget(target, dx, dy) {
  if (mode === MODE.PORTHOLE) fx.movePortholeWindow(dx, dy);
  else fx.movePatch(target, dx, dy);
}
function resizeTargetRect(target, rect, minPx) {
  if (mode === MODE.PORTHOLE) fx.setPortholeRect(rect, minPx);
  else fx.setPatchRect(target, rect, minPx);
}
function doFreeze(rect, now) {
  if (mode === MODE.PORTHOLE) fx.freezePorthole(rect, now);
  else fx.freeze(rect, now, FRAME.maxPatches);
}

// Switching engines mid-session would leave the old engine's state stranded
// (and stale patches/porthole drawn together would be confusing) — clear on toggle.
function toggleMode() {
  mode = mode === MODE.PATCH ? MODE.PORTHOLE : MODE.PATCH;
  fx.reset();
  grab = null;
  mgrab = null;
  drag = null;
  bothPinched = false;
  pinchHold = 0;
  pinchMiss = 0;
  fistHold = 0;
  freezeGraceUntil = 0;
  rEngine.textContent = mode === MODE.PORTHOLE ? 'PORTHOLE' : 'PATCH';
}

// ── Per-frame step ──
function step(now) {
  const det = trackerReady && video.readyState >= 2 ? detect(video, now) : null;
  const hands = det?.hands || [];
  const map = makeMapper();
  const handsPx = hands.map((lm) => lm.map(map));

  fx.renderBase(video);

  // ── Per-hand pinch state, mapped to device px ──
  const handInfo = hands.map((lm) => {
    const amt = G.pinchAmount(lm);
    return {
      pinched: amt < GESTURE.pinchRatio,
      released: amt > GESTURE.pinchReleaseRatio,
      pt: map(G.gripPoint(lm)),
    };
  });

  // ── Two-hand framing rect (for capturing a new patch) ──
  let frameRect = null;
  let framing = false;
  if (hands.length === 2) {
    frameRect = rectFromPoints(handInfo[0].pt, handInfo[1].pt);
    const min = FRAME.minSizePx * dpr;
    framing = frameRect.w > min && frameRect.h > min;
  }

  // ── Interaction: grabbing an existing patch wins over capturing a new one ──
  if (grab) {
    continueHandGrab(handInfo);
  } else if (!startHandResize(handInfo)) {
    const twoHands = hands.length === 2;
    const bothPinch = twoHands && handInfo[0].pinched && handInfo[1].pinched;
    const bothRelease = twoHands && handInfo[0].released && handInfo[1].released;

    // Capture: two hands, both pinched, framing a real rect — held briefly.
    if (!bothPinched && framing && bothPinch) {
      pinchHold++;
      pinchMiss = 0;
      if (pinchHold >= FRAME.captureHoldFrames) {
        doFreeze(frameRect, now); // stamp a patch, or freeze the whole frame, per mode
        bothPinched = true; // latch: no re-capture until both release
        pinchHold = 0;
        freezeGraceUntil = now + GESTURE.postFreezeGraceMs;
      }
    } else if (twoHands && !bothPinch) {
      // Both hands seen but not both pinched — a ratio flicker mid-hold. Give
      // grace before dropping the streak (self-occlusion at the pinch is noisy).
      if (pinchHold === 0 || ++pinchMiss > GESTURE.pinchMissGrace) {
        pinchHold = 0;
        pinchMiss = 0;
      }
    } else if (!twoHands) {
      // A hand briefly dropped out of detection mid-pinch — hold the streak.
      if (pinchHold > 0 && ++pinchMiss <= GESTURE.pinchMissGrace) {
        /* hold steady */
      } else {
        pinchHold = 0;
        pinchMiss = 0;
        bothPinched = false;
      }
    }
    if (bothPinched && bothRelease) bothPinched = false;

    // One-hand pinch landing inside a target → grab it to move.
    if (!bothPinch) {
      const h = handInfo.find((x) => x.pinched && targetAt(x.pt.x, x.pt.y));
      if (h) startHandMove(h);
    }
  }

  // ── Fists → clear everything ──
  if (
    fx.isFrozen &&
    now >= freezeGraceUntil &&
    hands.length > 0 &&
    hands.every((lm) => G.isFist(lm))
  ) {
    fistHold++;
    if (fistHold >= GESTURE.fistHoldFrames) {
      fx.reset();
      grab = null;
      fistHold = 0;
    }
  } else {
    fistHold = 0;
  }

  // ── Status resolution ──
  if (grab || mgrab) status = STATUS.MOVING;
  else if (framing) status = STATUS.RESIZING;
  else if (fx.isFrozen) status = STATUS.FROZEN;
  else if (hands.length) status = STATUS.TRACKING;
  else status = STATUS.IDLE;

  // ── Draw ──
  fx.compositeTo(ctx, mode);
  if (mode === MODE.PORTHOLE) {
    if (fx.portholeWindow) {
      HUD.drawPortholeFlash(ctx, now, fx.portholeWindow.flashAt, canvas.width, canvas.height);
      HUD.drawPortholeWindow(ctx, fx.portholeWindow, !!(grab || mgrab));
    }
  } else {
    const active = grab?.target || mgrab?.target || null;
    for (let i = 0; i < fx.patches.length; i++) {
      const p = fx.patches[i];
      HUD.drawPatchFlash(ctx, p, now);
      HUD.drawPatch(ctx, p, i, p === active);
    }
  }
  HUD.drawSkeleton(ctx, handsPx);

  if (frameRect && framing && !grab) {
    HUD.drawBox(ctx, {
      ...frameRect,
      nx0: frameRect.x / dpr,
      ny0: frameRect.y / dpr,
      nx1: (frameRect.x + frameRect.w) / dpr,
      ny1: (frameRect.y + frameRect.h) / dpr,
    });
  } else if (!grab) {
    for (const lm of handsPx) HUD.drawGrip(ctx, gripPx(lm));
  }

  // mouse-drag "create" rect
  if (drag && drag.mode === 'create') {
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

// ── Hand grab helpers (move / resize a frozen patch or the porthole window) ──
function nearestPinched(pinched, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const h of pinched) {
    const d = Math.hypot(h.pt.x - x, h.pt.y - y);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

function startHandMove(h) {
  const target = targetAt(h.pt.x, h.pt.y);
  if (!target) return;
  bringToFront(target);
  grab = { kind: 'move', target, lastX: h.pt.x, lastY: h.pt.y };
  grabMiss = 0;
}

// Two pinched hands inside the SAME target → resize it by its two corners.
function startHandResize(handInfo) {
  const pinched = handInfo.filter((h) => h.pinched);
  if (pinched.length < 2) return false;
  const ta = targetAt(pinched[0].pt.x, pinched[0].pt.y);
  const tb = targetAt(pinched[1].pt.x, pinched[1].pt.y);
  if (ta && ta === tb) {
    bringToFront(ta);
    grab = { kind: 'resize', target: ta };
    grabMiss = 0;
    applyHandResize(pinched);
    return true;
  }
  return false;
}

function applyHandResize(pinched) {
  const rect = rectFromPoints(pinched[0].pt, pinched[1].pt);
  resizeTargetRect(grab.target, rect, FRAME.minSizePx * dpr);
}

function continueHandGrab(handInfo) {
  const pinched = handInfo.filter((h) => h.pinched);
  if (grab.kind === 'move') {
    const h = nearestPinched(pinched, grab.lastX, grab.lastY);
    if (h) {
      moveTarget(grab.target, h.pt.x - grab.lastX, h.pt.y - grab.lastY);
      grab.lastX = h.pt.x;
      grab.lastY = h.pt.y;
      grabMiss = 0;
    } else if (++grabMiss > FRAME.grabMissGrace) {
      grab = null;
    }
  } else {
    if (pinched.length >= 2) {
      applyHandResize(pinched);
      grabMiss = 0;
    } else if (++grabMiss > FRAME.grabMissGrace) {
      grab = null;
    }
  }
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
const rEngine = el('rEngine');
rEngine.textContent = mode === MODE.PORTHOLE ? 'PORTHOLE' : 'PATCH';

function updateHud(nHands) {
  if (rStatus.textContent !== status) rStatus.textContent = status;
  rStatus.className = 'value';
  if (status === STATUS.FROZEN) rStatus.classList.add('is-frozen');
  else if (status === STATUS.RESIZING || status === STATUS.MOVING)
    rStatus.classList.add('is-resize');

  rFps.textContent = String(Math.round(fps)).padStart(2, '0');
  rInput.textContent = `${nHands} HAND${nHands === 1 ? '' : 'S'}`;

  const modeText =
    mode === MODE.PORTHOLE
      ? fx.portholeWindow
        ? 'LIVE WINDOW'
        : 'NORMAL'
      : fx.patches.length
        ? `${String(fx.patches.length).padStart(2, '0')} FROZEN`
        : 'NORMAL';
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
  if (fx.isFrozen) return TICKER.frozen[mode];
  if (status === STATUS.IDLE) return TICKER.idle;
  return TICKER.tracking[mode];
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

// Save the current frame (no HUD chrome) as a PNG — the collage in PATCH
// mode, or the frozen-frame-plus-live-window composite in PORTHOLE mode.
async function saveSnapshot() {
  if (!fx.isFrozen) return;
  const blob = await fx.snapshotBlob(mode);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hand-studio-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Resize a target by dragging one corner, opposite corner pinned.
function resizeByCorner(g, p) {
  const t = g.target;
  let left = t.x;
  let top = t.y;
  let right = t.x + t.w;
  let bottom = t.y + t.h;
  if (g.corner === 'tl') { left = p.x; top = p.y; }
  else if (g.corner === 'tr') { right = p.x; top = p.y; }
  else if (g.corner === 'bl') { left = p.x; bottom = p.y; }
  else { right = p.x; bottom = p.y; }
  resizeTargetRect(
    t,
    { x: Math.min(left, right), y: Math.min(top, bottom), w: Math.abs(right - left), h: Math.abs(bottom - top) },
    FRAME.minSizePx * dpr
  );
}

// ── Input: keyboard + mouse/touch fallback ──
//   empty space → drag a rect to freeze (a new patch, or the porthole window)
//   inside a target → drag to move it · corner → drag to resize
//   [M] switch mode · [S] save PNG · [R] clear
function bindInput() {
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'r') {
      fx.reset();
      grab = null;
    } else if (k === 's') {
      saveSnapshot();
    } else if (k === 'm') {
      toggleMode();
    }
  });

  const pt = (e) => {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * dpr, y: (src.clientY - r.top) * dpr };
  };
  const down = (e) => {
    const p = pt(e);
    const handle = FRAME.handleGrabPx * dpr;
    const targets = mode === MODE.PORTHOLE ? (fx.portholeWindow ? [fx.portholeWindow] : []) : fx.patches;
    // corner of a target → resize
    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      const corner = fx.cornerAt(t, p.x, p.y, handle);
      if (corner) {
        bringToFront(t);
        mgrab = { kind: 'resize', target: t, corner };
        drag = null;
        return;
      }
    }
    // inside a target → move
    const t = targetAt(p.x, p.y);
    if (t) {
      bringToFront(t);
      mgrab = { kind: 'move', target: t, offX: p.x - t.x, offY: p.y - t.y };
      drag = null;
      return;
    }
    // empty space → draw a new capture rect
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, mode: 'create' };
  };
  const move = (e) => {
    const p = pt(e);
    if (mgrab) {
      if (mgrab.kind === 'move') {
        moveTarget(mgrab.target, p.x - mgrab.offX - mgrab.target.x, p.y - mgrab.offY - mgrab.target.y);
      } else {
        resizeByCorner(mgrab, p);
      }
      return;
    }
    if (!drag) return;
    drag.x1 = p.x;
    drag.y1 = p.y;
  };
  const up = () => {
    if (mgrab) {
      mgrab = null;
      return;
    }
    if (!drag) return;
    const r = rectFromPoints({ x: drag.x0, y: drag.y0 }, { x: drag.x1, y: drag.y1 });
    const min = FRAME.minSizePx * dpr;
    if (r.w > min && r.h > min && running) {
      const now = performance.now();
      doFreeze(r, now);
      freezeGraceUntil = now + GESTURE.postFreezeGraceMs;
    }
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
el('engineToggle').addEventListener('click', toggleMode);
bindInput();
