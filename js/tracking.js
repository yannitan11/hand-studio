// MediaPipe HandLandmarker wrapper. Decoupled from the render loop:
// call detect(video, tsMs) whenever you have a fresh frame; it returns the
// last-known result immediately if the model isn't ready yet.

import { TRACKING } from './config.js';

let landmarker = null;
let loading = null;

export async function loadTracker() {
  if (landmarker) return landmarker;
  if (loading) return loading;
  loading = (async () => {
    const { HandLandmarker, FilesetResolver } = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'
    );
    const vision = await FilesetResolver.forVisionTasks(TRACKING.wasm);
    try {
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: TRACKING.model, delegate: TRACKING.delegate },
        runningMode: 'VIDEO',
        numHands: TRACKING.numHands,
      });
    } catch (e) {
      // GPU delegate can fail on some machines — retry on CPU.
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: TRACKING.model, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: TRACKING.numHands,
      });
    }
    return landmarker;
  })();
  return loading;
}

let lastTs = -1;

// Returns { hands: [ [{x,y,z}*21], ... ], handedness: [...] } or null.
export function detect(video, tsMs) {
  if (!landmarker) return null;
  // detectForVideo requires strictly increasing timestamps.
  if (tsMs <= lastTs) tsMs = lastTs + 1;
  lastTs = tsMs;
  try {
    const res = landmarker.detectForVideo(video, tsMs);
    return { hands: res.landmarks || [], handedness: res.handedness || [] };
  } catch {
    return null;
  }
}
