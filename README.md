# HÄND STUDIO

A single-page, browser-based **hand-tracking visual playground**. Your webcam is the
hero; a hairline computer-vision-debug HUD sits on top. The trick: **freeze slices of
time and stack them into a live collage** —

1. **Open two hands** — a bracketed rectangle with live coordinate readouts stretches
   between them (`STATUS: FRAMING`).
2. **Pinch** (both hands) — that rectangle freezes as a still patch stamped onto the
   live feed (`STATUS: FROZEN`). Do it again anywhere else — each patch is caught at
   its own instant, up to a dozen.
3. **Grab a patch** — pinch inside a frozen patch to drag it around (`STATUS: MOVING`);
   pinch two fingers inside the same patch to resize it.
4. **Save** — press `S` to download the whole collage as a PNG.
5. **Fists** — clear everything. (`R` also resets.)

No backend, no login, no build step. Everything runs client-side; the video never
leaves your device.

**Live:** https://yannitan11.github.io/hand-studio/

## Tech

- **Hand tracking:** MediaPipe Tasks `HandLandmarker` (21 landmarks × up to 2 hands),
  WASM + model loaded from CDN at runtime, GPU→CPU fallback.
- **Rendering:** one full-bleed `<canvas>`, mirrored. Live feed draws to a base layer;
  each freeze snapshots its rectangle into a small patch canvas that composites on top
  of the live base at its current position. Faint skeleton / framing rect / patch edges
  / HUD over that. Fixed HUD text is crisp DOM.
- **No framework, no bundler.** Vanilla ES modules — GitHub-Pages-friendly.
- If the hand model fails to load, mouse/touch works as a full fallback: drag empty
  space to freeze a patch, drag inside a patch to move it, drag a corner to resize,
  `S` to save, `R` to clear.

### Files

```
index.html
styles.css
js/
  config.js     all the tunable thresholds, palette, ticker copy
  camera.js     getUserMedia + typed errors
  tracking.js   MediaPipe HandLandmarker loader + per-frame detect
  gestures.js   pure landmark math (pinch / fist / grip point)
  effects.js    live base + stack of frozen patches (move / resize / hit-test / PNG)
  hud.js        canvas overlay: skeleton, framing rect + readouts, patch edges + flash
  app.js        state machine + render loop + input wiring
```

State machine: `IDLE → TRACKING → FRAMING (two-hand frame) → FROZEN (patches stamped,
survive 0 hands) → MOVING (grab a patch) → clear via fists / R`.

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
