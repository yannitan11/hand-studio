// The visual engine, two swappable modes over the same live base layer:
//
//   PATCH mode — pinch stamps the framed region as a FROZEN patch (a still
//     snapshot of that moment) onto the live feed. Stack many, grab one to
//     move it, pinch its corners to resize, save the whole collage as a PNG.
//
//   PORTHOLE mode — pinch freezes the ENTIRE frame as a snapshot, except the
//     framed region, which stays a live porthole onto the camera. Only one
//     porthole at a time; the next pinch replaces it.
//
// Both modes' state live side by side here; only one is drawn/saved at a
// time, picked by the `mode` passed to compositeTo/snapshotBlob. Switching
// modes is expected to reset() first so they don't get composited together.

import { MODE } from './config.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

export class Effects {
  constructor() {
    this.base = makeCanvas(2, 2); // live frame, mirrored
    this.baseCtx = this.base.getContext('2d');
    // PATCH mode: each { canvas, x, y, w, h, flashAt }. canvas holds the
    // frozen pixels at capture size; x/y/w/h are its current placement.
    this.patches = [];
    // PORTHOLE mode: one full-screen snapshot + one live window rect.
    this.frozenFull = makeCanvas(2, 2);
    this.frozenFullCtx = this.frozenFull.getContext('2d');
    this.portholeWindow = null; // {x, y, w, h, flashAt}
  }

  resize(w, h) {
    this.base.width = w;
    this.base.height = h;
    this.frozenFull.width = w;
    this.frozenFull.height = h;
    // stale coordinates in both modes — drop everything
    this.patches = [];
    this.portholeWindow = null;
  }

  get width() {
    return this.base.width;
  }
  get height() {
    return this.base.height;
  }

  get isFrozen() {
    return this.patches.length > 0 || !!this.portholeWindow;
  }

  // Draw the current camera frame (mirrored, cover-fit) into the base layer.
  renderBase(video) {
    const ctx = this.baseCtx;
    const w = this.base.width;
    const h = this.base.height;
    const vw = video.videoWidth || w;
    const vh = video.videoHeight || h;
    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx.setTransform(-1, 0, 0, 1, w, 0); // mirror
    ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Snapshot `rect` of the live frame into a new frozen patch on top of the
  // stack. Oldest patch drops off past `maxPatches`.
  freeze(rect, now, maxPatches) {
    const w = this.base.width;
    const h = this.base.height;
    let x0 = Math.max(0, Math.floor(rect.x));
    let y0 = Math.max(0, Math.floor(rect.y));
    let x1 = Math.min(w, Math.ceil(rect.x + rect.w));
    let y1 = Math.min(h, Math.ceil(rect.y + rect.h));
    const ww = x1 - x0;
    const wh = y1 - y0;
    if (ww < 2 || wh < 2) return null;
    const canvas = makeCanvas(ww, wh);
    canvas.getContext('2d').drawImage(this.base, x0, y0, ww, wh, 0, 0, ww, wh);
    const patch = { canvas, x: x0, y: y0, w: ww, h: wh, flashAt: now };
    this.patches.push(patch);
    if (maxPatches) while (this.patches.length > maxPatches) this.patches.shift();
    return patch;
  }

  // Topmost patch whose bounds contain (px, py), or null.
  patchAt(px, py) {
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const p = this.patches[i];
      if (px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h) return p;
    }
    return null;
  }

  // Which corner of `patch` (px,py) is grabbing, within `radius`, or null.
  // Returns one of 'tl' | 'tr' | 'bl' | 'br'.
  cornerAt(patch, px, py, radius) {
    const corners = {
      tl: [patch.x, patch.y],
      tr: [patch.x + patch.w, patch.y],
      bl: [patch.x, patch.y + patch.h],
      br: [patch.x + patch.w, patch.y + patch.h],
    };
    for (const key in corners) {
      const [cx, cy] = corners[key];
      if (Math.hypot(px - cx, py - cy) <= radius) return key;
    }
    return null;
  }

  bringToFront(patch) {
    const i = this.patches.indexOf(patch);
    if (i >= 0 && i < this.patches.length - 1) {
      this.patches.splice(i, 1);
      this.patches.push(patch);
    }
  }

  // Move a patch by (dx, dy), clamped to stay fully on-canvas.
  movePatch(patch, dx, dy) {
    patch.x = Math.max(0, Math.min(this.base.width - patch.w, patch.x + dx));
    patch.y = Math.max(0, Math.min(this.base.height - patch.h, patch.y + dy));
  }

  // Set a patch's bounds from an arbitrary rect (its frozen pixels stretch to
  // fill). Enforces a minimum size so it can't collapse.
  setPatchRect(patch, rect, minPx) {
    const min = Math.max(2, minPx || 2);
    patch.w = Math.max(min, Math.round(rect.w));
    patch.h = Math.max(min, Math.round(rect.h));
    patch.x = Math.max(0, Math.min(this.base.width - patch.w, Math.round(rect.x)));
    patch.y = Math.max(0, Math.min(this.base.height - patch.h, Math.round(rect.y)));
  }

  removePatch(patch) {
    const i = this.patches.indexOf(patch);
    if (i >= 0) this.patches.splice(i, 1);
  }

  // PORTHOLE mode: snapshot the whole current frame, keep `rect` as the one
  // live window (replaces any previous porthole window).
  freezePorthole(rect, now) {
    const w = this.base.width;
    const h = this.base.height;
    let x0 = Math.max(0, Math.floor(rect.x));
    let y0 = Math.max(0, Math.floor(rect.y));
    let x1 = Math.min(w, Math.ceil(rect.x + rect.w));
    let y1 = Math.min(h, Math.ceil(rect.y + rect.h));
    const ww = x1 - x0;
    const wh = y1 - y0;
    if (ww < 2 || wh < 2) return null;
    this.frozenFullCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.frozenFullCtx.clearRect(0, 0, w, h);
    this.frozenFullCtx.drawImage(this.base, 0, 0);
    this.portholeWindow = { x: x0, y: y0, w: ww, h: wh, flashAt: now };
    return this.portholeWindow;
  }

  // Move the porthole window by (dx, dy), clamped to stay fully on-canvas.
  movePortholeWindow(dx, dy) {
    const p = this.portholeWindow;
    if (!p) return;
    p.x = Math.max(0, Math.min(this.base.width - p.w, p.x + dx));
    p.y = Math.max(0, Math.min(this.base.height - p.h, p.y + dy));
  }

  // Resize the porthole window to an arbitrary rect, minimum-size clamped.
  setPortholeRect(rect, minPx) {
    const p = this.portholeWindow;
    if (!p) return;
    const min = Math.max(2, minPx || 2);
    p.w = Math.max(min, Math.round(rect.w));
    p.h = Math.max(min, Math.round(rect.h));
    p.x = Math.max(0, Math.min(this.base.width - p.w, Math.round(rect.x)));
    p.y = Math.max(0, Math.min(this.base.height - p.h, Math.round(rect.y)));
  }

  reset() {
    this.patches = [];
    this.portholeWindow = null;
  }

  // PATCH mode: live base everywhere → each frozen patch stamped on top.
  // PORTHOLE mode: frozen full-screen snapshot → the live window punched
  // back in.
  compositeTo(ctx, mode) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (mode === MODE.PORTHOLE) {
      if (this.portholeWindow) {
        ctx.drawImage(this.frozenFull, 0, 0);
        const w = this.portholeWindow;
        ctx.drawImage(this.base, w.x, w.y, w.w, w.h, w.x, w.y, w.w, w.h);
      } else {
        ctx.drawImage(this.base, 0, 0);
      }
      return;
    }
    ctx.drawImage(this.base, 0, 0);
    for (const p of this.patches) {
      ctx.drawImage(p.canvas, p.x, p.y, p.w, p.h);
    }
  }

  // Render just the visual (no HUD chrome) to an offscreen canvas and hand
  // back a PNG blob for download.
  snapshotBlob(mode) {
    const out = makeCanvas(this.base.width, this.base.height);
    this.compositeTo(out.getContext('2d'), mode);
    return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  }
}
