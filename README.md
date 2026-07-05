# HÄND STUDIO

A single-page, browser-based **hand-tracking visual playground**. Your webcam is the
hero; a hairline computer-vision-debug HUD sits on top. Move your hands and the feed
reacts in real time — freeze it, resize a focus reticle, and smear the image into a
pixel grid.

No backend, no login, no build step. Everything runs client-side; the video never
leaves your device.

## Gestures

| Gesture | Effect |
|---|---|
| **Pinch** (thumb + index tip together) | Freeze the frame (`STATUS: FROZEN`). Release to resume. |
| **Point up** (index up, other fingers curled) + move up/down | Grow / shrink the focus reticle (`RESIZING`). |
| **Point at the frame** (index extended toward the scene) | Paint a pixel-grid / RGB-shift distortion at your fingertip (`DISTURBING`). Dwell in one spot → chunkier blocks. |
| Keys | `1` pixel grid · `2` rgb shift · `F` freeze toggle · `R` reset |

The distortion is *painted* onto the frame and persists (great over a frozen shot),
so you can smear reality around. `R` clears everything back to the live feed.

If the camera loads but the hand model doesn't, the mouse/touch works as a fallback
fingertip — click-drag on the canvas to distort.

## Tech

- **Hand tracking:** MediaPipe Tasks `HandLandmarker` (21 landmarks × up to 2 hands),
  WASM + model loaded from CDN at runtime.
- **Rendering:** one full-bleed `<canvas>`, mirrored. The feed draws to a base layer;
  distortions bake into a persistent paint layer; skeleton / boxes / HUD draw on top.
  Fixed HUD text is crisp DOM.
- **No framework, no bundler.** Vanilla ES modules — GitHub-Pages-friendly.

### Files

```
index.html
styles.css
js/
  config.js     all the tunable thresholds, palette, labels
  camera.js     getUserMedia + typed errors
  tracking.js   MediaPipe HandLandmarker loader + per-frame detect
  gestures.js   pure landmark math (pinch / point-up / brush / bbox)
  effects.js    freeze snapshot + persistent pixel-grid / rgb-shift paint layer
  hud.js        canvas overlay: skeleton, tracking box, focus reticle, brush grid
  app.js        state machine + render loop + input wiring
```

All the feel-knobs (pinch threshold, brush size, mosaic block range, ticker copy) are
named constants at the top of `js/config.js` — tune them live while the camera runs.

## Run locally

```bash
cd "Hand Studio"
python3 -m http.server 8000
# → http://localhost:8000   (camera needs http://localhost or https, not file://)
```

Preview inside Claude Code: `./preview.sh "Hand Studio" 8133` (note: the preview
sandbox has no webcam, so the live feed only works on a real localhost with a camera).

## Deploy

Static files — drop on GitHub Pages (main / root) and open the `https://…` URL
(camera access requires HTTPS, which Pages provides).
