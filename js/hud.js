// Canvas overlay chrome: faint hand skeleton, the two-hand framing rectangle
// with corner brackets + rotated coordinate readouts, grip markers, patch
// edges and the capture flash.
// (The fixed text HUD — watermark / STATUS / FPS / ticker — is DOM, in app.js.)

import { HUD, HAND_BONES, FRAME } from './config.js';

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

// box is {x, y, w, h} in device px; nx0/ny1 are the CSS-px readout values.
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

  // top-left: x then y, running up the left edge
  ctx.save();
  ctx.translate(x - 6 * S, y + 4 * S);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'right';
  ctx.fillText(`Y ${Math.round(box.ny0 ?? 0)}`, 0, 0);
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.fillText(`X ${Math.round(box.nx0 ?? 0)}`, x + 6 * S, y - 6 * S);

  // bottom-right: mirrored readouts
  ctx.save();
  ctx.translate(x + w + 12 * S, y + h - 4 * S);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'left';
  ctx.fillText(`Y ${Math.round(box.ny1 ?? 0)}`, 0, 0);
  ctx.restore();
  ctx.textAlign = 'right';
  ctx.fillText(`X ${Math.round(box.nx1 ?? 0)}`, x + w - 6 * S, y + h + 14 * S);

  if (opts.label) {
    ctx.textAlign = 'left';
    ctx.fillText(opts.label, x, y - 8 * S);
  }
}

// Small cross at each hand's grip point so tracking feels alive even before
// the second hand shows up.
export function drawGrip(ctx, p) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = HUD.grip;
  ctx.lineWidth = 1.2 * S;
  const r = 6 * S;
  ctx.beginPath();
  ctx.moveTo(p.x - r, p.y);
  ctx.lineTo(p.x + r, p.y);
  ctx.moveTo(p.x, p.y - r);
  ctx.lineTo(p.x, p.y + r);
  ctx.stroke();
}

// The live porthole while frozen: bright bracketed outline + a "LIVE" tag,
// so it reads as the one moving window in an otherwise-frozen frame.
export function drawWindow(ctx, wnd) {
  if (!wnd) return;
  drawBox(
    ctx,
    {
      ...wnd,
      nx0: wnd.x / S,
      ny0: wnd.y / S,
      nx1: (wnd.x + wnd.w) / S,
      ny1: (wnd.y + wnd.h) / S,
    },
    { color: HUD.box, label: 'LIVE' }
  );
  // pulsing dot on the label
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = HUD.grip;
  ctx.beginPath();
  ctx.arc(wnd.x + 30 * S, wnd.y - 11 * S, 2.4 * S, 0, Math.PI * 2);
  ctx.fill();
}

// Full-screen camera flash right after a freeze.
export function drawFlash(ctx, now, flashAt, w, h) {
  const age = now - flashAt;
  if (age < 0 || age > FRAME.flashMs) return;
  const a = 1 - age / FRAME.flashMs;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(255,255,255,${(0.7 * a).toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);
}
