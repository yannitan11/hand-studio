// Pure gesture math over 21 MediaPipe hand landmarks.
// Landmarks are normalized {x,y,z} in the *unmirrored* video space (0..1).
// Screen-up = smaller y.

import { GESTURE } from './config.js';

const TIP = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
const PIP = { thumb: 3, index: 6, middle: 10, ring: 14, pinky: 18 };
const WRIST = 0;
const MID_MCP = 9;

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function handSize(lm) {
  return dist(lm[WRIST], lm[MID_MCP]) || 1e-6;
}

// distance thumb-tip ↔ index-tip, normalized to hand size
export function pinchAmount(lm) {
  return dist(lm[TIP.thumb], lm[TIP.index]) / handSize(lm);
}

export function fingerExtended(lm, finger) {
  const hs = handSize(lm);
  const reachTip = dist(lm[WRIST], lm[TIP[finger]]);
  const reachPip = dist(lm[WRIST], lm[PIP[finger]]);
  return reachTip - reachPip > GESTURE.extendMargin * hs;
}

// Fist: every fingertip pulled in close to the wrist. A pinch doesn't pass —
// its thumb+index tips sit far forward of the palm.
export function isFist(lm) {
  const hs = handSize(lm);
  const max = GESTURE.fistReach * hs;
  return (
    dist(lm[WRIST], lm[TIP.index]) < max &&
    dist(lm[WRIST], lm[TIP.middle]) < max &&
    dist(lm[WRIST], lm[TIP.ring]) < max &&
    dist(lm[WRIST], lm[TIP.pinky]) < max
  );
}

// The point a hand "holds" a frame corner with: midpoint of thumb & index
// tips — which is exactly the pinch point once the fingers close.
export function gripPoint(lm) {
  const t = lm[TIP.thumb];
  const i = lm[TIP.index];
  return { x: (t.x + i.x) / 2, y: (t.y + i.y) / 2 };
}

export const INDEX_TIP = TIP.index;
