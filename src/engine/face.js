import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

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

  let lastVideoTime = -1;
  return {
    detect(now) {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return null;
      lastVideoTime = video.currentTime;
      const res = landmarker.detectForVideo(video, now);
      const cats = res.faceBlendshapes?.[0]?.categories;
      if (!cats) return { face: false };
      const shapes = {};
      for (const c of cats) shapes[c.categoryName] = c.score;
      return { face: true, shapes, landmarks: res.faceLandmarks[0] };
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
