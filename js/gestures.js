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

// index up, others curled, tip well above the index knuckle
export function isPointUp(lm) {
  if (!fingerExtended(lm, 'index')) return false;
  const curled =
    !fingerExtended(lm, 'middle') &&
    !fingerExtended(lm, 'ring') &&
    !fingerExtended(lm, 'pinky');
  if (!curled) return false;
  const tip = lm[TIP.index];
  const mcp = lm[5];
  return mcp.y - tip.y > GESTURE.pointUpMinRise;
}

// index extended but pointing at the scene rather than straight up →
// use the fingertip as a distortion brush.
export function isPointingBrush(lm) {
  if (!fingerExtended(lm, 'index')) return false;
  const othersCurled =
    !fingerExtended(lm, 'middle') &&
    !fingerExtended(lm, 'ring') &&
    !fingerExtended(lm, 'pinky');
  return othersCurled && !isPointUp(lm);
}

// Axis-aligned bounding box in normalized space.
export function boundingBox(lm) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export const INDEX_TIP = TIP.index;
