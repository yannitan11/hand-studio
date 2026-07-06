// ─────────────────────────────────────────────────────────────────────────
// HÄND STUDIO — all the feel-knobs live here.
// This is a playground: tune these live while the camera is running.
//
// The core loop (from the reference recording, first 8s):
//   frame a rectangle with two hands → pinch to freeze that region →
//   the patch sticks over the live feed → fists to reset.
// ─────────────────────────────────────────────────────────────────────────

export const BRAND = {
  watermark: 'HÄND · STUDIO',
  build: 'v2.2',
};

// Two toggleable freeze engines (see effects.js) — press [M] to switch.
//   PATCH    — pinch stamps the framed region as a frozen still; stack many.
//   PORTHOLE — pinch freezes the whole frame except the framed region, which
//              stays a live window onto the camera (the original behavior).
export const MODE = { PATCH: 'patch', PORTHOLE: 'porthole' };
export const DEFAULT_MODE = MODE.PATCH;

// MediaPipe HandLandmarker (loaded from CDN at runtime).
export const TRACKING = {
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  model:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  numHands: 2,
  delegate: 'GPU', // falls back to CPU automatically inside the loader
};

// Gesture thresholds — normalized to hand size so they hold at any distance.
// handSize = distance(wrist → middle-finger MCP).
export const GESTURE = {
  // Pinch: thumb-tip (4) ↔ index-tip (8) distance / handSize below this = pinched.
  pinchRatio: 0.42,
  pinchReleaseRatio: 0.55, // hysteresis so it doesn't flicker at the boundary
  // A finger counts as "extended" when tip is this much farther from the
  // wrist than its middle (PIP) joint, as a fraction of handSize.
  extendMargin: 0.12,
  // Fist: every fingertip (incl. index) pulled within this × handSize of the
  // wrist. Excludes a pinch, where the index+thumb tips sit far forward.
  fistReach: 1.35,
  fistHoldFrames: 6, // frames all visible hands must hold fists to reset
  // Releasing a pinch often means briefly curling all fingers inward before
  // opening the hand — that residual shape can read as a fist. Ignore the
  // fist-reset for this long after any freeze so it doesn't self-trigger.
  postFreezeGraceMs: 700,
};

// The two-hand framing rectangle + frozen patches.
export const FRAME = {
  // grip point = midpoint of thumb tip & index tip (== the pinch point)
  minSizePx: 40, // rect must be at least this (CSS px) each side to capture
  captureHoldFrames: 3, // both-hands-pinched frames before we commit
  flashMs: 320, // white flash on the patch right after capture
  maxPatches: 12, // oldest patch drops off beyond this
  // Grab-to-move / resize a frozen patch.
  grabMissGrace: 6, // frames a held patch survives losing its pinch (tracking noise)
  handleGrabPx: 22, // corner-handle hit radius for resize (CSS px, mouse/touch)
};

// Rotating instruction ticker (bottom-left). State- and mode-aware.
export const TICKER = {
  intervalMs: 2600,
  idle: ['SHOW YOUR HANDS'],
  tracking: {
    [MODE.PATCH]: ['OPEN TWO HANDS TO FRAME', 'PINCH TO FREEZE A PATCH', 'PRESS M FOR PORTHOLE MODE'],
    [MODE.PORTHOLE]: ['OPEN TWO HANDS TO FRAME', 'PINCH TO FREEZE THE FRAME', 'PRESS M FOR PATCH MODE'],
  },
  frozen: {
    [MODE.PATCH]: ['GRAB A PATCH TO MOVE IT', 'PINCH TO ADD ANOTHER', 'PRESS S TO SAVE', 'FISTS TO CLEAR'],
    [MODE.PORTHOLE]: ['THE WINDOW STAYS LIVE', 'GRAB IT TO MOVE IT', 'PRESS S TO SAVE', 'FISTS TO CLEAR'],
  },
};

// HUD look
export const HUD = {
  skeleton: 'rgba(255,255,255,0.35)', // faint — the rect is the hero
  joint: 'rgba(255,255,255,0.6)',
  jointRadius: 2.4,
  boneWidth: 1,
  box: 'rgba(255,255,255,0.85)',
  boxDim: 'rgba(255,255,255,0.35)',
  patchEdge: 'rgba(255,255,255,0.22)', // hairline around a frozen patch
  tick: 14, // corner bracket length, px
  grip: 'rgba(255,255,255,0.9)',
};

// Status strings (also drives the HUD).
export const STATUS = {
  IDLE: 'IDLE',
  TRACKING: 'TRACKING',
  RESIZING: 'FRAMING', // two hands drawing a capture rectangle
  MOVING: 'MOVING', // dragging / resizing a frozen patch
  FROZEN: 'FROZEN',
};

// MediaPipe hand connections (bone list).
export const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17], // palm base
];
