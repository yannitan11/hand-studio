// The visual engine. Two hands drag out a rectangle; pinching stamps that
// region as a FROZEN patch — a still snapshot of that moment — onto the live
// feed. Stack many patches (each captured at a different instant), grab one to
// move it, pinch its corners to resize, and save the whole collage as a PNG.

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
    // Each patch: { canvas, x, y, w, h, flashAt }. canvas holds the frozen
    // pixels at capture size; x/y/w/h are its current placement (device px).
    this.patches = [];
  }

  resize(w, h) {
    this.base.width = w;
    this.base.height = h;
    // stale coordinates — drop every patch on resize
    this.patches = [];
  }

  get width() {
    return this.base.width;
  }
  get height() {
    return this.base.height;
  }

  get isFrozen() {
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

  reset() {
    this.patches = [];
  }

  // Live base everywhere → each frozen patch stamped on top, oldest first.
  compositeTo(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    for (const p of this.patches) {
      ctx.drawImage(p.canvas, p.x, p.y, p.w, p.h);
    }
  }

  // Render just the visual (base + patches, no HUD chrome) to an offscreen
  // canvas and hand back a PNG blob for download.
  snapshotBlob() {
    const out = makeCanvas(this.base.width, this.base.height);
    this.compositeTo(out.getContext('2d'));
    return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  }
}
