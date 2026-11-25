const clamp01 = (v) => Math.min(1, Math.max(0, v));
const avg = (s, a, b) => ((s[a] ?? 0) + (s[b] ?? 0)) / 2;

const RANGE = { smile: 0.6, browDown: 0.45, jawOpen: 0.55 };
const MAX_BASELINE = { smile: 0.2, browDown: 0.25, jawOpen: 0.15 };
const TAU = {
  smile: [0.2, 0.45], browDown: [0.25, 0.5], jawOpen: [0.12, 0.3],
  mood: [0.25, 0.6], pointing: [0.08, 0.2], presence: [0.3, 1.2],
  headYaw: [0.12, 0.22], headPitch: [0.12, 0.22], headRoll: [0.12, 0.22],
  eyeLift: [0.16, 0.28], mouthLift: [0.16, 0.28],
};
const CALIBRATION_FRAMES = 40;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clampSigned = (v) => Math.min(1, Math.max(-1, v));
const safeProfile = (value) => clamp01((value - 0.35) / 0.3);

const toHsl = ([red, green, blue]) => {
  const r = red / 255, g = green / 255, b = blue / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0, saturation = 0;
  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { hue, saturation, lightness };
};

function sampleAppearance(video, landmarks, faceLengthRatio) {
  if (!video.videoWidth || !video.videoHeight || landmarks.length < 474) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const sample = (point, radius) => {
    const x = Math.round(clamp01(point.x) * (canvas.width - 1));
    const y = Math.round(clamp01(point.y) * (canvas.height - 1));
    const left = Math.max(0, x - radius), top = Math.max(0, y - radius);
    const right = Math.min(canvas.width - 1, x + radius), bottom = Math.min(canvas.height - 1, y + radius);
    const pixels = ctx.getImageData(left, top, right - left + 1, bottom - top + 1).data;
    const rgb = [0, 0, 0];
    for (let i = 0, count = 0; i < pixels.length; i += 4, count++) {
      rgb[0] += pixels[i];
      rgb[1] += pixels[i + 1];
      rgb[2] += pixels[i + 2];
      if (i + 4 === pixels.length) return rgb.map((value) => value / (count + 1));
    }
    return [128, 128, 128];
  };

  const forehead = landmarks[10];
  const skinColors = [
    sample(landmarks[123], 6),
    sample(landmarks[352], 6),
    sample({ x: forehead.x, y: forehead.y + 0.06 }, 6),
  ];
  const skin = toHsl(skinColors[0].map((_, channel) => skinColors.reduce((sum, color) => sum + color[channel], 0) / skinColors.length));
  const eyeColors = [toHsl(sample(landmarks[468], 3)), toHsl(sample(landmarks[473], 3))];
  const eyeHue = eyeColors.reduce((sum, eye) => sum + (eye.saturation > 0.08 ? eye.hue : 32), 0) / eyeColors.length;
  const hair = toHsl(sample({ x: forehead.x, y: forehead.y - 0.04 }, 5));
  const shape = clamp01((faceLengthRatio - 1.05) / 0.8);

  return {
    skinLightness: skin.lightness,
    eyeHue,
    hairHue: hair.hue,
    hairLightness: hair.lightness,
    starHue: (skin.hue * 0.4 + eyeHue * 0.6) % 360,
    starCount: Math.round(12 + shape * 5 + skin.lightness * 5 + (eyeColors[0].saturation + eyeColors[1].saturation)),
    starSpeed: 1.5 + shape * 0.9 + skin.lightness * 0.7,
  };
}

export function createFeatures(video) {
  const raw = {
    smile: 0, browDown: 0, jawOpen: 0, mood: 0.5, pointing: 0, presence: 0,
    headYaw: 0, headPitch: 0, headRoll: 0, eyeLift: 0, mouthLift: 0,
  };
  const profile = {
    a: 0.5, b: 0.5, c: 0.5, skinLightness: 0.5, eyeHue: 32,
    hairHue: 0, hairLightness: 0.3, starHue: 42, starCount: 16, starSpeed: 2.4,
  };
  const smooth = { ...raw, faceX: 0.5, faceY: 0.45, pointX: 0.5, pointY: 0.5, profile };
  const baseline = { smile: 0, browDown: 0, jawOpen: 0, mouthLift: 0, eyeLift: 0 };
  const portrait = { eyeSpacing: 0, faceLength: 0, mouthWidth: 0 };
  let profileReady = false;
  let profileRefreshFrames = 0;
  let calibrated = 0;
  let faceX = 0.5;
  let faceY = 0.45;
  let pointX = 0.5;
  let pointY = 0.5;

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
        const leftNoseSpan = dist(landmarks[1], landmarks[234]);
        const rightNoseSpan = dist(landmarks[1], landmarks[454]);
        const eyeLineY = (landmarks[33].y + landmarks[263].y) / 2;
        const faceVerticalSpan = Math.max(0.001, landmarks[152].y - eyeLineY);
        raw.headYaw = clampSigned(((leftNoseSpan - rightNoseSpan) / (leftNoseSpan + rightNoseSpan)) * 2.5);
        raw.headPitch = clampSigned((((landmarks[1].y - eyeLineY) / faceVerticalSpan) - 0.42) * 3.5);
        raw.headRoll = clampSigned(
          Math.atan2(landmarks[263].y - landmarks[33].y, landmarks[263].x - landmarks[33].x) / (Math.PI / 5),
        );
        raw.eyeLift = clampSigned((m.eyeLift - baseline.eyeLift) * 5);
        raw.mouthLift = clampSigned((m.mouthLift - baseline.mouthLift) * 4);
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
            try {
              Object.assign(profile, sampleAppearance(video, landmarks, portrait.faceLength) ?? {});
            } catch (error) {
              console.warn("Could not sample local appearance colors:", error);
            }
            profileReady = true;
          }
        } else if (++profileRefreshFrames >= 60) {
          profileRefreshFrames = 0;
          profile.a = safeProfile(sample.eyeSpacing);
          profile.b = safeProfile(sample.faceLength);
          profile.c = safeProfile(sample.mouthWidth);
          try {
            Object.assign(profile, sampleAppearance(video, landmarks, sample.faceLength) ?? {});
          } catch (error) {
            console.warn("Could not refresh local appearance colors:", error);
          }
        }
      }
    },
    setPointing(point) {
      raw.pointing = point ? 1 : 0;
      if (point) {
        pointX = point.x;
        pointY = point.y;
      }
    },
    lost() {
      raw.smile = raw.browDown = raw.jawOpen = raw.presence = 0;
      raw.mood = 0.5;
      raw.headYaw = raw.headPitch = raw.headRoll = raw.eyeLift = raw.mouthLift = 0;
    },
    step(dt) {
      for (const k in TAU) {
        const [up, down] = TAU[k];
        smooth[k] += (raw[k] - smooth[k]) * (1 - Math.exp(-dt / (raw[k] > smooth[k] ? up : down)));
      }
      const a = 1 - Math.exp(-dt / 0.15);
      smooth.faceX += (faceX - smooth.faceX) * a;
      smooth.faceY += (faceY - smooth.faceY) * a;
      smooth.pointX += (pointX - smooth.pointX) * a;
      smooth.pointY += (pointY - smooth.pointY) * a;
      return smooth;
    },
  };
}
