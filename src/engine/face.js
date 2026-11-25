import { FaceLandmarker, FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const BASE = import.meta.env.BASE_URL;

export async function createTracker(video) {
  const fileset = await FilesetResolver.forVisionTasks(BASE + "wasm");
  const make = (delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: BASE + "models/face_landmarker.task", delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
  let landmarker;
  try {
    landmarker = await make("GPU");
  } catch {
    landmarker = await make("CPU");
  }
  const makeHands = (delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: BASE + "models/hand_landmarker.task", delegate },
      runningMode: "VIDEO",
      numHands: 1,
    });
  let hands = null;
  try {
    hands = await makeHands("GPU");
  } catch {
    try {
      hands = await makeHands("CPU");
    } catch (error) {
      console.warn("Hand tracking is unavailable; face tracking will continue without pointing focus.", error);
    }
  }

  let lastVideoTime = -1;
  let lastDetectionAt = -Infinity;
  let lastHandTime = -Infinity;
  let pointing = null;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return {
    detect(now) {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return null;
      if (now - lastDetectionAt < 50) return null;
      lastVideoTime = video.currentTime;
      lastDetectionAt = now;
      const res = landmarker.detectForVideo(video, now);
      if (hands && now - lastHandTime > 80) {
        lastHandTime = now;
        const hand = hands.detectForVideo(video, now).landmarks?.[0];
        if (hand) {
          const indexExtended = distance(hand[8], hand[0]) > distance(hand[6], hand[0]) * 1.15;
          const otherFingersCurled = [[12, 10], [16, 14], [20, 18]]
            .every(([tip, pip]) => distance(hand[tip], hand[0]) < distance(hand[pip], hand[0]) * 1.12);
          pointing = indexExtended && otherFingersCurled ? { x: hand[8].x, y: hand[8].y } : null;
        } else {
          pointing = null;
        }
      }
      const cats = res.faceBlendshapes?.[0]?.categories;
      if (!cats) return { face: false, pointing };
      const shapes = {};
      for (const c of cats) shapes[c.categoryName] = c.score;
      return { face: true, shapes, landmarks: res.faceLandmarks[0], pointing };
    },
  };
}

export async function openCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}
