# HÄND STUDIO

A single-page, browser-based **hand-tracking visual playground**. Your webcam is the
hero; a hairline computer-vision-debug HUD sits on top. The trick: **freeze slices of
time** — in one of two swappable engines (press `M` to switch, `ENGINE` readout shows
which):

- **PATCH** (default) — each pinch stamps the framed region as a still patch onto the
  live feed. Stack a dozen, each caught at its own instant.
- **PORTHOLE** — each pinch freezes the *whole frame* except the framed region, which
  stays a live window onto the camera. The next pinch replaces it (one window at a
  time).

1. **Open two hands** — a bracketed rectangle with live coordinate readouts stretches
   between them (`STATUS: FRAMING`).
2. **Pinch** (both hands) — freezes per the current engine (`STATUS: FROZEN`).
3. **Grab** the frozen patch / live window — pinch inside it to drag (`STATUS: MOVING`);
   pinch two fingers inside the same one to resize it.
4. **Save** — press `S` to download the current frame as a PNG.
5. **Fists** — clear everything. (`R` also resets.)

No backend, no login, no build step. Everything runs client-side; the video never
leaves your device.

**Live:** https://yannitan11.github.io/hand-studio/

## Tech

- **Hand tracking:** MediaPipe Tasks `HandLandmarker` (21 landmarks × up to 2 hands),
  WASM + model loaded from CDN at runtime, GPU→CPU fallback.
- **Rendering:** one full-bleed `<canvas>`, mirrored. Live feed draws to a base layer.
  In PATCH mode, each freeze snapshots its rectangle into a small patch canvas that
  composites on top of the live base at its current position. In PORTHOLE mode, each
  freeze snapshots the *whole* base into a full-screen layer, then punches the live
  base back through the one window rect. Both engines' state live side by side in
  `Effects` (see `js/effects.js`); switching modes resets so they never composite
  together. Faint skeleton / framing rect / patch or window edges / HUD over that.
  Fixed HUD text is crisp DOM.
- **No framework, no bundler.** Vanilla ES modules — GitHub-Pages-friendly.
- If the hand model fails to load, mouse/touch works as a full fallback: drag empty
  space to freeze, drag inside a patch/window to move it, drag a corner to resize,
  `M` to switch engines, `S` to save, `R` to clear.

### Files

```
index.html
styles.css
js/
  config.js     all the tunable thresholds, palette, ticker copy, MODE enum
  camera.js     getUserMedia + typed errors
  tracking.js   MediaPipe HandLandmarker loader + per-frame detect
  gestures.js   pure landmark math (pinch / fist / grip point)
  effects.js    live base + both freeze engines (PATCH stack, PORTHOLE window)
  hud.js        canvas overlay: skeleton, framing rect + readouts, patch/window chrome
  app.js        state machine + render loop + input wiring + mode toggle
```

State machine: `IDLE → TRACKING → FRAMING (two-hand frame) → FROZEN (patch stamped or
frame+window per engine, survives 0 hands) → MOVING (grab it) → clear via fists / R`.
`M` toggles the engine (`MODE.PATCH` / `MODE.PORTHOLE` in `config.js`) at any time.

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
