import { createTracker, openCamera } from "./face.js";
import { createFeatures } from "./features.js";
import { createAudio } from "./audio.js";
import { createLofi } from "./lofi.js";

export function createBooth(canvas, video, { demo = false } = {}) {
  const lofi = createLofi(canvas);
  const features = createFeatures();
  const status = { face: false, mode: "minor", audio: false, model: "loading" };
  let tracker = null;
  let audio = null;
  let audioPromise = null;
  let running = false;
  let rendering = true;
  let level = 1;
  let pending = [];
  let last = performance.now();
  let lastAudio = 0;

  createTracker(video)
    .then((t) => {
      tracker = t;
      status.model = "ready";
    })
    .catch((e) => {
      console.error(e);
      status.model = "error";
    });

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const res = tracker?.detect(now);
    if (res?.face) features.ingest(res.shapes, res.landmarks);
    else if (res) features.lost();
    if (res) status.face = res.face;
    const p = features.step(dt);
    if (rendering && lofi.render(video, p, dt, !demo) && pending.length) {
      const url = lofi.capture();
      pending.forEach((resolve) => resolve(url));
      pending = [];
    }
    if (audio && now - lastAudio > 33) {
      lastAudio = now;
      audio.update(p);
      status.mode = audio.mode;
    }
  }

  const applyLevel = () => audio?.setLevel(rendering ? level : level * 0.25);

  return {
    status,
    ensureAudio() {
      audioPromise ??= createAudio()
        .then((a) => {
          audio = a;
          status.audio = true;
          applyLevel();
        })
        .catch((e) => {
          console.error(e);
          audioPromise = null;
        });
      return audioPromise;
    },
    async startCamera() {
      if (demo) {
        video.src = import.meta.env.BASE_URL + "demo.mp4";
        video.loop = true;
        await video.play();
      } else {
        await openCamera(video);
      }
      if (running) return;
      running = true;
      requestAnimationFrame(loop);
    },
    capture() {
      audio?.shutter();
      return new Promise((resolve) => pending.push(resolve));
    },
    setLevel(v) {
      level = v;
      applyLevel();
    },
    setLive(live) {
      rendering = live;
      applyLevel();
    },
  };
}
