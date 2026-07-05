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
  build: 'v2.0',
};

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
};

// The two-hand framing rectangle + frozen patches.
export const FRAME = {
  // grip point = midpoint of thumb tip & index tip (== the pinch point)
  minSizePx: 40, // rect must be at least this (CSS px) each side to capture
  captureHoldFrames: 3, // both-hands-pinched frames before we commit
  flashMs: 320, // white flash on the patch right after capture
  maxPatches: 12, // oldest patch drops off beyond this
};

// Rotating instruction ticker (bottom-left). State-aware.
export const TICKER = {
  intervalMs: 2600,
  idle: ['SHOW YOUR HANDS'],
  tracking: ['FRAME WITH TWO HANDS', 'PINCH TO FREEZE'],
  frozen: ['FISTS TO RESET', 'FRAME AGAIN FOR ANOTHER'],
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
  RESIZING: 'RESIZING',
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
