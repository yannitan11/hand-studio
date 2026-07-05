// The visual effects engine: a base layer (live video or frozen snapshot)
// plus a persistent "paint" layer that distortions are baked into, so you can
// smear pixel-grid / rgb-shift onto the frame and it stays until reset.

import { DISTORT, MODES } from './config.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class Effects {
  constructor() {
    this.base = makeCanvas(2, 2); // live/frozen frame, mirrored
    this.frozen = makeCanvas(2, 2); // snapshot when FROZEN
    this.layer = makeCanvas(2, 2); // persistent painted distortions
    this.temp = makeCanvas(2, 2); // scratch for a single brush dab
    this.tiny = makeCanvas(2, 2); // downscale target for the mosaic
    this.baseCtx = this.base.getContext('2d');
    this.layerCtx = this.layer.getContext('2d', { willReadFrequently: true });
    this.isFrozen = false;
  }

  resize(w, h) {
    for (const c of [this.base, this.frozen, this.layer]) {
      c.width = w;
      c.height = h;
    }
    this.temp.width = this.temp.height = 0; // reallocated per dab
  }

  get width() {
    return this.base.width;
  }
  get height() {
    return this.base.height;
  }

  // Draw the current frame (mirrored) into the base layer.
  renderBase(video) {
    const ctx = this.baseCtx;
    const w = this.base.width;
    const h = this.base.height;
    if (this.isFrozen) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.frozen, 0, 0);
      return;
    }
    // cover-fit the video, mirrored horizontally
    const vw = video.videoWidth || w;
    const vh = video.videoHeight || h;
    const scale = Math.max(w / vw, h / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx.setTransform(-1, 0, 0, 1, w, 0); // mirror
    ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  freeze() {
    const fctx = this.frozen.getContext('2d');
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, this.frozen.width, this.frozen.height);
    fctx.drawImage(this.base, 0, 0);
    this.isFrozen = true;
  }

  unfreeze() {
    this.isFrozen = false;
  }

  reset() {
    this.isFrozen = false;
    this.layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.layerCtx.clearRect(0, 0, this.layer.width, this.layer.height);
  }

  // Grab a square region of the base around (cx,cy) with the given radius,
  // clamped to canvas bounds. Returns geometry + a temp canvas holding it.
  _grab(cx, cy, r) {
    const w = this.base.width;
    const h = this.base.height;
    let x0 = Math.floor(cx - r);
    let y0 = Math.floor(cy - r);
    let x1 = Math.ceil(cx + r);
    let y1 = Math.ceil(cy + r);
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(w, x1);
    y1 = Math.min(h, y1);
    const rw = x1 - x0;
    const rh = y1 - y0;
    if (rw <= 1 || rh <= 1) return null;
    this.temp.width = rw;
    this.temp.height = rh;
    const tctx = this.temp.getContext('2d', { willReadFrequently: true });
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.imageSmoothingEnabled = true;
    tctx.clearRect(0, 0, rw, rh);
    tctx.drawImage(this.base, x0, y0, rw, rh, 0, 0, rw, rh);
    return { x0, y0, rw, rh, ctx: tctx };
  }

  // Blit the scratch temp onto the persistent layer, masked to a circle so
  // the brush has a soft round footprint instead of a hard square.
  _stampCircle(reg, cx, cy, r) {
    const ctx = this.layerCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = DISTORT.layerAlpha;
    ctx.drawImage(this.temp, reg.x0, reg.y0);
    ctx.restore();
  }

  // PIXEL GRID: downscale the region hard then blow it back up with no
  // smoothing → chunky mosaic. block = cell size in px.
  paintPixel(cx, cy, r, block) {
    const reg = this._grab(cx, cy, r);
    if (!reg) return;
    const tw = Math.max(1, Math.round(reg.rw / block));
    const th = Math.max(1, Math.round(reg.rh / block));
    this.tiny.width = tw;
    this.tiny.height = th;
    const nctx = this.tiny.getContext('2d');
    nctx.imageSmoothingEnabled = true;
    nctx.clearRect(0, 0, tw, th);
    nctx.drawImage(this.temp, 0, 0, tw, th);
    // back up, no smoothing
    reg.ctx.imageSmoothingEnabled = false;
    reg.ctx.clearRect(0, 0, reg.rw, reg.rh);
    reg.ctx.drawImage(this.tiny, 0, 0, tw, th, 0, 0, reg.rw, reg.rh);
    this._stampCircle(reg, cx, cy, r);
  }

  // RGB SHIFT: split the channels by a few px for a glitchy chromatic smear.
  paintShift(cx, cy, r, amount) {
    const reg = this._grab(cx, cy, r);
    if (!reg) return;
    const img = reg.ctx.getImageData(0, 0, reg.rw, reg.rh);
    const src = img.data;
    const out = new Uint8ClampedArray(src.length);
    const off = Math.max(1, Math.round(amount));
    const w = reg.rw;
    const h = reg.rh;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const rx = Math.min(w - 1, x + off);
        const bx = Math.max(0, x - off);
        out[i] = src[(y * w + rx) * 4]; // R shifted →
        out[i + 1] = src[i + 1]; // G stays
        out[i + 2] = src[(y * w + bx) * 4 + 2]; // B shifted ←
        out[i + 3] = 255;
      }
    }
    reg.ctx.putImageData(new ImageData(out, w, h), 0, 0);
    this._stampCircle(reg, cx, cy, r);
  }

  paint(cx, cy, r, mode, intensity) {
    if (mode === MODES.SHIFT) {
      this.paintShift(cx, cy, r, 2 + intensity * 9);
    } else {
      const block = DISTORT.blockMin + (DISTORT.blockMax - DISTORT.blockMin) * intensity;
      this.paintPixel(cx, cy, r, block);
    }
  }

  // Draw base + painted layer to the visible canvas.
  compositeTo(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.drawImage(this.layer, 0, 0);
  }
}
