# HÄND STUDIO

A single-page, browser-based **hand-tracking visual playground**. Your webcam is the
hero; a hairline computer-vision-debug HUD sits on top. The trick: **freeze a piece
of the frame mid-air** —

1. **Frame** a region with two hands — a bracketed rectangle with live coordinate
   readouts stretches between them (`STATUS: RESIZING`).
2. **Pinch** (both hands) — that region freezes as a snapshot pinned over the live
   feed (`STATUS: FROZEN`). Move away; your past stays on screen.
3. **Fists** — let it go. (`R` also resets.)

No backend, no login, no build step. Everything runs client-side; the video never
leaves your device.

**Live:** https://yannitan11.github.io/hand-studio/

## Tech

- **Hand tracking:** MediaPipe Tasks `HandLandmarker` (21 landmarks × up to 2 hands),
  WASM + model loaded from CDN at runtime, GPU→CPU fallback.
- **Rendering:** one full-bleed `<canvas>`, mirrored. The feed draws to a base layer;
  frozen patches composite on top; faint skeleton / framing rect / HUD draw over that.
  Fixed HUD text is crisp DOM.
- **No framework, no bundler.** Vanilla ES modules — GitHub-Pages-friendly.
- If the hand model fails to load, mouse/touch works as a fallback: drag a rectangle
  on the canvas and release to freeze it.

### Files

```
index.html
styles.css
js/
  config.js     all the tunable thresholds, palette, ticker copy
  camera.js     getUserMedia + typed errors
  tracking.js   MediaPipe HandLandmarker loader + per-frame detect
  gestures.js   pure landmark math (pinch / fist / grip point)
  effects.js    live base layer + pinned frozen-region patches
  hud.js        canvas overlay: skeleton, framing rect + readouts, patch flash
  app.js        state machine + render loop + input wiring
```

State machine: `IDLE → TRACKING → RESIZING (two-hand frame) → FROZEN (patch pinned,
survives 0 hands) → reset via fists / R`.

All the feel-knobs (pinch/fist thresholds, capture debounce, flash timing, ticker
copy) are named constants in `js/config.js` — tune them live while the camera runs.

## Run locally

```bash
cd "Hand Studio"
python3 -m http.server 8000
# → http://localhost:8000   (camera needs http://localhost or https, not file://)
```

Preview inside Claude Code: `./preview.sh "Hand Studio" 8133` (note: the preview
sandbox has no webcam, so live tracking only works on a real localhost — but the
mouse-drag freeze works anywhere).

## Deploy

Auto-deploys via GitHub Pages (main / root) — edit → commit → push. Camera access
requires HTTPS, which Pages provides.

```bash
git add -A && git commit -m "your message" && git push
```
