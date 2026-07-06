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

// A frozen patch's edge: hairline outline + corner brackets + a tiny index
// tag. `active` (grabbed) patches read brighter and grow drag handles.
export function drawPatch(ctx, patch, index, active) {
  const { x, y, w, h } = patch;
  const t = HUD.tick * S;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = active ? HUD.box : HUD.patchEdge;
  ctx.lineWidth = (active ? 1.5 : 1) * S;
  ctx.strokeRect(x, y, w, h);

  ctx.strokeStyle = active ? HUD.box : HUD.boxDim;
  ctx.lineWidth = 1.5 * S;
  bracket(ctx, x, y, 1, 1, t);
  bracket(ctx, x + w, y, -1, 1, t);
  bracket(ctx, x, y + h, 1, -1, t);
  bracket(ctx, x + w, y + h, -1, -1, t);

  // corner drag handles while active
  if (active) {
    ctx.fillStyle = HUD.grip;
    const r = 3.2 * S;
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = active ? HUD.box : HUD.patchEdge;
  ctx.font = `${11 * S}px "Space Mono", ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(index + 1).padStart(2, '0'), x + 6 * S, y + 16 * S);
}

// White flash localized to a freshly-captured patch (a mini shutter).
export function drawPatchFlash(ctx, patch, now) {
  const age = now - patch.flashAt;
  if (age < 0 || age > FRAME.flashMs) return;
  const a = 1 - age / FRAME.flashMs;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(255,255,255,${(0.7 * a).toFixed(3)})`;
  ctx.fillRect(patch.x, patch.y, patch.w, patch.h);
}
