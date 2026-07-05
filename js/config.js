// ─────────────────────────────────────────────────────────────────────────
// HÄND STUDIO — all the feel-knobs live here.
// This is a playground: tune these live while the camera is running.
// ─────────────────────────────────────────────────────────────────────────

export const BRAND = {
  watermark: 'HÄND · STUDIO',
  build: 'v1.0',
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
  // Point-up needs the index tip clearly above the index knuckle (screen-up).
  pointUpMinRise: 0.10, // fraction of canvas height the tip sits above the MCP
  // Vertical hand speed (px/frame, primary hand) that engages RESIZING.
  resizeVelocity: 2.2,
  // Fingertip speed below this (px/frame) counts as "dwelling" while distorting.
  dwellSpeed: 6,
};

// Freeze
export const FREEZE = {
  // extra frames the pinch must hold before we commit to FROZEN (debounce)
  holdFrames: 2,
};

// Point-up focus reticle (the thing you grow / shrink).
export const FOCUS = {
  min: 0.14, // as a fraction of the smaller canvas dimension
  max: 0.72,
  start: 0.30,
  // how fast the reticle responds to vertical hand motion
  gain: 0.0016,
  ease: 0.18,
};

// Distortion brushes. blockMin/Max in device px; radius is the brush size.
export const DISTORT = {
  radius: 90, // px brush radius on the canvas
  radiusEase: 0.25,
  blockMin: 8, // mosaic cell when you just arrived
  blockMax: 30, // mosaic cell after dwelling
  dwellRampMs: 900, // time to ramp from blockMin → blockMax while dwelling
  gridColor: 'rgba(255,64,48,0.85)', // the red technical grid overlay
  gridWidth: 1,
  layerAlpha: 1, // opacity of the painted layer over the base
};

export const MODES = {
  NORMAL: 'NORMAL',
  PIXEL: 'PIXEL GRID',
  SHIFT: 'RGB SHIFT',
};

// Rotating instruction ticker (bottom-left). Cycles on a timer.
export const TICKER = {
  intervalMs: 2600,
  lines: [
    'PINCH TO FREEZE',
    'POINT UP TO RESIZE',
    'POINT AT FRAME TO DISTURB',
    'PRESS R TO RESET',
  ],
};

// HUD look
export const HUD = {
  skeleton: 'rgba(255,255,255,0.92)',
  joint: 'rgba(255,255,255,0.98)',
  jointRadius: 3.2,
  boneWidth: 1.4,
  box: 'rgba(255,255,255,0.85)',
  boxDim: 'rgba(255,255,255,0.35)',
  tick: 14, // corner bracket length, px
  focus: 'rgba(255,255,255,0.9)',
};

// Status strings (also drives the HUD).
export const STATUS = {
  IDLE: 'IDLE',
  TRACKING: 'TRACKING',
  FROZEN: 'FROZEN',
  RESIZING: 'RESIZING',
  DISTORTING: 'DISTURBING',
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
