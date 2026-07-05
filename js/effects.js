// The visual engine: a live mirrored base layer plus "frozen patches" —
// rectangular snapshots of the feed that stay pinned over the live video
// until reset. (This is the reference's core trick: frame a region with two
// hands, pinch, and that slice of time sticks to the screen.)

import { FRAME } from './config.js';

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
    this.patches = []; // [{x, y, w, h, canvas, bornAt}]
  }

  resize(w, h) {
    this.base.width = w;
    this.base.height = h;
    this.patches = []; // stale coordinates — clear on resize
  }

  get width() {
    return this.base.width;
  }
  get height() {
    return this.base.height;
  }
  get hasPatches() {
    return this.patches.length > 0;
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

  // Snapshot a rect (device px) of the base into a pinned patch.
  freezeRegion(rect, now) {
    let x0 = Math.max(0, Math.floor(rect.x));
    let y0 = Math.max(0, Math.floor(rect.y));
    let x1 = Math.min(this.base.width, Math.ceil(rect.x + rect.w));
    let y1 = Math.min(this.base.height, Math.ceil(rect.y + rect.h));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 2 || h < 2) return null;
    const canvas = makeCanvas(w, h);
    canvas.getContext('2d').drawImage(this.base, x0, y0, w, h, 0, 0, w, h);
    const patch = { x: x0, y: y0, w, h, canvas, bornAt: now };
    this.patches.push(patch);
    if (this.patches.length > FRAME.maxPatches) this.patches.shift();
    return patch;
  }

  reset() {
    this.patches = [];
  }

  // Draw base + all pinned patches to the visible canvas.
  compositeTo(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    for (const p of this.patches) {
      ctx.drawImage(p.canvas, p.x, p.y);
    }
  }
}
