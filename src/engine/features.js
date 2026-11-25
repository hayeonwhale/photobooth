const clamp01 = (v) => Math.min(1, Math.max(0, v));
const avg = (s, a, b) => ((s[a] ?? 0) + (s[b] ?? 0)) / 2;

const RANGE = { smile: 0.6, browDown: 0.45, jawOpen: 0.55 };
const MAX_BASELINE = { smile: 0.2, browDown: 0.25, jawOpen: 0.15 };
const TAU = { smile: [0.2, 0.45], browDown: [0.25, 0.5], jawOpen: [0.12, 0.3], mood: [0.25, 0.6], presence: [0.3, 1.2] };
const CALIBRATION_FRAMES = 40;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const safeProfile = (value) => clamp01((value - 0.35) / 0.3);

export function createFeatures() {
  const raw = { smile: 0, browDown: 0, jawOpen: 0, mood: 0.5, presence: 0 };
  const profile = { a: 0.5, b: 0.5, c: 0.5 };
  const smooth = { ...raw, faceX: 0.5, faceY: 0.45, profile };
  const baseline = { smile: 0, browDown: 0, jawOpen: 0, mouthLift: 0, eyeLift: 0 };
  const portrait = { eyeSpacing: 0, faceLength: 0, mouthWidth: 0 };
  let profileReady = false;
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
      const mouthWidth = dist(landmarks[61], landmarks[291]);
      const eyeWidth = (dist(landmarks[33], landmarks[133]) + dist(landmarks[263], landmarks[362])) / 2;
      if (mouthWidth > 0.001 && eyeWidth > 0.001) {
        const mouthCenterY = (landmarks[13].y + landmarks[14].y) / 2;
        m.mouthLift = (mouthCenterY - (landmarks[61].y + landmarks[291].y) / 2) / mouthWidth;
        const leftEyeLift = (landmarks[133].y - landmarks[33].y) / Math.max(0.001, dist(landmarks[33], landmarks[133]));
        const rightEyeLift = (landmarks[362].y - landmarks[263].y) / Math.max(0.001, dist(landmarks[263], landmarks[362]));
        m.eyeLift = (leftEyeLift + rightEyeLift) / 2;
      } else {
        m.mouthLift = baseline.mouthLift;
        m.eyeLift = baseline.eyeLift;
      }
      if (calibrated < CALIBRATION_FRAMES) {
        calibrated++;
        for (const k in m) baseline[k] += (m[k] - baseline[k]) / calibrated;
      }
      for (const k of ["smile", "browDown", "jawOpen"]) raw[k] = clamp01((m[k] - Math.min(baseline[k], MAX_BASELINE[k])) / RANGE[k]);
      raw.mood = clamp01(
        0.5 +
        (m.mouthLift - baseline.mouthLift) * 2.8 +
        (m.eyeLift - baseline.eyeLift) * 1.5 +
        raw.smile * 0.35 -
        raw.browDown * 0.2,
      );
      raw.presence = 1;
      faceX = landmarks[1].x;
      faceY = landmarks[1].y;

      const faceWidth = dist(landmarks[234], landmarks[454]);
      const faceLength = dist(landmarks[10], landmarks[152]);
      if (faceWidth > 0.001 && faceLength > 0.001) {
        const sample = {
          eyeSpacing: dist(landmarks[33], landmarks[263]) / faceWidth,
          faceLength: faceLength / faceWidth,
          mouthWidth: dist(landmarks[61], landmarks[291]) / faceWidth,
        };
        if (!profileReady) {
          for (const k in portrait) portrait[k] += (sample[k] - portrait[k]) / (calibrated || 1);
          if (calibrated >= CALIBRATION_FRAMES) {
            profile.a = safeProfile(portrait.eyeSpacing);
            profile.b = safeProfile(portrait.faceLength);
            profile.c = safeProfile(portrait.mouthWidth);
            profileReady = true;
          }
        }
      }
    },
    lost() {
      raw.smile = raw.browDown = raw.jawOpen = raw.presence = 0;
      raw.mood = 0.5;
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
