const clamp01 = (v) => Math.min(1, Math.max(0, v));
const avg = (s, a, b) => ((s[a] ?? 0) + (s[b] ?? 0)) / 2;

const RANGE = { smile: 0.6, browDown: 0.45, jawOpen: 0.55 };
const MAX_BASELINE = { smile: 0.2, browDown: 0.25, jawOpen: 0.15 };
const TAU = { smile: [0.2, 0.45], browDown: [0.25, 0.5], jawOpen: [0.12, 0.3], presence: [0.3, 1.2] };
const CALIBRATION_FRAMES = 40;

export function createFeatures() {
  const raw = { smile: 0, browDown: 0, jawOpen: 0, presence: 0 };
  const smooth = { ...raw, faceX: 0.5, faceY: 0.45 };
  const baseline = { smile: 0, browDown: 0, jawOpen: 0 };
  let calibrated = 0;
  let faceX = 0.5;
  let faceY = 0.45;

  return {
    ingest(shapes, landmarks) {
      const m = {
        smile: avg(shapes, "mouthSmileLeft", "mouthSmileRight"),
        browDown: avg(shapes, "browDownLeft", "browDownRight"),
        jawOpen: shapes.jawOpen ?? 0,
      };
      if (calibrated < CALIBRATION_FRAMES) {
        calibrated++;
        for (const k in m) baseline[k] += (m[k] - baseline[k]) / calibrated;
      }
      for (const k in m) raw[k] = clamp01((m[k] - Math.min(baseline[k], MAX_BASELINE[k])) / RANGE[k]);
      raw.presence = 1;
      faceX = landmarks[1].x;
      faceY = landmarks[1].y;
    },
    lost() {
      raw.smile = raw.browDown = raw.jawOpen = raw.presence = 0;
    },
    step(dt) {
      for (const k in TAU) {
        const [up, down] = TAU[k];
        smooth[k] += (raw[k] - smooth[k]) * (1 - Math.exp(-dt / (raw[k] > smooth[k] ? up : down)));
      }
      const a = 1 - Math.exp(-dt / 0.15);
      smooth.faceX += (faceX - smooth.faceX) * a;
      smooth.faceY += (faceY - smooth.faceY) * a;
      return smooth;
    },
  };
}
