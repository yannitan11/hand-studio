// Canvas overlay chrome: hand skeleton, tracking box with corner brackets +
// coordinate readouts, the point-up focus reticle, and the red brush grid.
// (The fixed text HUD — watermark / STATUS / FPS / ticker — is DOM, in app.js.)

import { HUD, HAND_BONES, DISTORT } from './config.js';

// Canvas is a device-pixel backing store, so multiply px sizes by DPR.
let S = 1;
export function setScale(dpr) {
  S = dpr || 1;
}

export function drawSkeleton(ctx, handsPx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const lm of handsPx) {
    ctx.strokeStyle = HUD.skeleton;
    ctx.lineWidth = HUD.boneWidth * S;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [a, b] of HAND_BONES) {
      ctx.moveTo(lm[a].x, lm[a].y);
      ctx.lineTo(lm[b].x, lm[b].y);
    }
    ctx.stroke();
    ctx.fillStyle = HUD.joint;
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, HUD.jointRadius * S, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function bracket(ctx, x, y, dx, dy, t) {
  ctx.beginPath();
  ctx.moveTo(x + dx * t, y);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + dy * t);
  ctx.stroke();
}

// box is {x, y, w, h} in device px. label optional.
export function drawBox(ctx, box, opts = {}) {
  const { x, y, w, h } = box;
  const t = HUD.tick * S;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = 1 * S;
  // faint full rectangle
  ctx.strokeStyle = opts.dim || HUD.boxDim;
  ctx.strokeRect(x, y, w, h);
  // bright corner brackets
  ctx.strokeStyle = opts.color || HUD.box;
  ctx.lineWidth = 1.5 * S;
  bracket(ctx, x, y, 1, 1, t);
  bracket(ctx, x + w, y, -1, 1, t);
  bracket(ctx, x, y + h, 1, -1, t);
  bracket(ctx, x + w, y + h, -1, -1, t);

  // coordinate readouts, tiny mono, rotated on the vertical edges
  const f = (opts.font || 11) * S;
  ctx.fillStyle = opts.color || HUD.box;
  ctx.font = `${f}px "Space Mono", ui-monospace, monospace`;
  ctx.textBaseline = 'alphabetic';

  // top-left: x, rotated up the left edge
  ctx.save();
  ctx.translate(x - 6 * S, y + 4 * S);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'left';
  ctx.fillText(`X ${Math.round(box.nx0 ?? x)}`, 0, 0);
  ctx.restore();

  // bottom-right: y, rotated down the right edge
  ctx.save();
  ctx.translate(x + w + 12 * S, y + h - 4 * S);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'right';
  ctx.fillText(`Y ${Math.round(box.ny1 ?? y + h)}`, 0, 0);
  ctx.restore();

  if (opts.label) {
    ctx.textAlign = 'left';
    ctx.fillText(opts.label, x, y - 8 * S);
  }
}

export function drawFocus(ctx, cx, cy, size) {
  const half = size / 2;
  drawBox(
    ctx,
    { x: cx - half, y: cy - half, w: size, h: size, nx0: cx - half, ny1: cy + half },
    { color: HUD.focus, dim: 'rgba(255,255,255,0.18)', label: 'FOCUS', font: 10 }
  );
  // center crosshair
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1 * S;
  ctx.beginPath();
  ctx.moveTo(cx - 7 * S, cy);
  ctx.lineTo(cx + 7 * S, cy);
  ctx.moveTo(cx, cy - 7 * S);
  ctx.lineTo(cx, cy + 7 * S);
  ctx.stroke();
}

// Red technical grid over the active brush footprint.
export function drawBrushGrid(ctx, cx, cy, r, block) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = DISTORT.gridColor;
  ctx.lineWidth = DISTORT.gridWidth * S;
  const step = Math.max(6, block);
  const x0 = cx - r, x1 = cx + r, y0 = cy - r, y1 = cy + r;
  ctx.beginPath();
  for (let gx = Math.floor(x0 / step) * step; gx <= x1; gx += step) {
    ctx.moveTo(gx, y0);
    ctx.lineTo(gx, y1);
  }
  for (let gy = Math.floor(y0 / step) * step; gy <= y1; gy += step) {
    ctx.moveTo(x0, gy);
    ctx.lineTo(x1, gy);
  }
  ctx.stroke();
  ctx.restore();
  // ring
  ctx.strokeStyle = DISTORT.gridColor;
  ctx.lineWidth = 1.2 * S;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}
