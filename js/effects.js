// The visual engine. Two hands drag out a rectangle; pinching freezes the
// WHOLE screen as a snapshot EXCEPT that rectangle, which stays a live
// porthole onto the camera. (Reference recording, first 8s.)

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
    this.frozen = makeCanvas(2, 2); // full-screen snapshot taken at pinch
    this.frozenCtx = this.frozen.getContext('2d');
    this.isFrozen = false;
    this.window = null; // {x, y, w, h} live porthole, device px
    this.flashAt = -1e9;
  }

  resize(w, h) {
    this.base.width = w;
    this.base.height = h;
    this.frozen.width = w;
    this.frozen.height = h;
    // stale coordinates — drop any freeze on resize
    this.isFrozen = false;
    this.window = null;
  }

  get width() {
    return this.base.width;
  }
  get height() {
    return this.base.height;
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

  // Freeze the whole frame now, keeping `rect` as a live porthole.
  freeze(rect, now) {
    const w = this.base.width;
    const h = this.base.height;
    // clamp the window to the canvas
    let x0 = Math.max(0, Math.floor(rect.x));
    let y0 = Math.max(0, Math.floor(rect.y));
    let x1 = Math.min(w, Math.ceil(rect.x + rect.w));
    let y1 = Math.min(h, Math.ceil(rect.y + rect.h));
    const ww = x1 - x0;
    const wh = y1 - y0;
    if (ww < 2 || wh < 2) return null;
    this.frozenCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.frozenCtx.clearRect(0, 0, w, h);
    this.frozenCtx.drawImage(this.base, 0, 0);
    this.window = { x: x0, y: y0, w: ww, h: wh };
    this.isFrozen = true;
    this.flashAt = now;
    return this.window;
  }

  reset() {
    this.isFrozen = false;
    this.window = null;
  }

  // base everywhere → frozen snapshot on top → live porthole punched back in.
  compositeTo(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    if (this.isFrozen && this.window) {
      ctx.drawImage(this.frozen, 0, 0);
      const wnd = this.window;
      ctx.drawImage(this.base, wnd.x, wnd.y, wnd.w, wnd.h, wnd.x, wnd.y, wnd.w, wnd.h);
    }
  }
}
