import { useCallback, useEffect, useRef, useState } from "react";
import { createBooth } from "./engine/booth.js";
import Strip from "./components/Strip.jsx";

const SHOTS = 4;
const DEMO = new URLSearchParams(location.search).get("demo") === "1";

export default function App() {
  const canvasRef = useRef(null);
  const camRef = useRef(null);
  const introRef = useRef(null);
  const boothRef = useRef(null);
  const introEnded = useRef(false);
  const shotsRef = useRef([]);
  const stripTimer = useRef(0);
  const shooting = useRef(false);

  const [phase, setPhase] = useState("begin");
  const [introFade, setIntroFade] = useState(0);
  const [introGone, setIntroGone] = useState(false);
  const [camError, setCamError] = useState("");
  const [shots, setShots] = useState([]);
  const [captions, setCaptions] = useState(Array(SHOTS).fill(""));
  const [status, setStatus] = useState({});
  const [flash, setFlash] = useState(0);

  const updateShots = (next) => {
    shotsRef.current = next;
    setShots(next);
  };

  useEffect(() => {
    boothRef.current = createBooth(canvasRef.current, camRef.current, { demo: DEMO });
    const id = setInterval(() => setStatus({ ...boothRef.current.status }), 400);
    return () => clearInterval(id);
  }, []);

  const startCamera = async () => {
    setCamError("");
    try {
      await boothRef.current.startCamera();
    } catch (e) {
      console.error(e);
      setCamError(
        DEMO ? "Could not play /demo.mp4." : e.name === "NotAllowedError" ? "Camera access was blocked. Allow it from the address bar, then try again." : "No camera available: " + e.message,
      );
    }
  };

  const endIntro = useCallback((ms) => {
    if (introEnded.current) return;
    introEnded.current = true;
    if (ms < 2000) introRef.current?.pause();
    setIntroFade(ms);
    setPhase("booth");
    boothRef.current.setLevel(1);
    setTimeout(() => setIntroGone(true), ms + 100);
  }, []);

  const begin = () => {
    const intro = introRef.current;
    boothRef.current.setLevel(0);
    boothRef.current.ensureAudio();
    setPhase("intro");
    intro.muted = false;
    intro.play().catch(() => endIntro(400));
    startCamera();
  };

  const shoot = useCallback(async () => {
    if (shooting.current || shotsRef.current.length >= SHOTS) return;
    shooting.current = true;
    const url = await boothRef.current.capture();
    setFlash((n) => n + 1);
    const next = [...shotsRef.current, url];
    updateShots(next);
    if (next.length === SHOTS) {
      stripTimer.current = setTimeout(() => {
        boothRef.current.setLive(false);
        setPhase("strip");
      }, 1100);
    }
    shooting.current = false;
  }, []);

  const retake = useCallback(() => {
    const prev = shotsRef.current;
    if (!prev.length) return;
    clearTimeout(stripTimer.current);
    updateShots(prev.slice(0, -1));
    setCaptions((c) => c.map((v, i) => (i === prev.length - 1 ? "" : v)));
    boothRef.current.setLive(true);
    setPhase("booth");
  }, []);

  const restart = () => {
    clearTimeout(stripTimer.current);
    updateShots([]);
    setCaptions(Array(SHOTS).fill(""));
    boothRef.current.setLive(true);
    setPhase("booth");
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT") return;
      const key = e.key.toLowerCase();
      if (phase === "intro" && key === "s") endIntro(400);
      else if (phase === "booth" && e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) shoot();
      } else if ((phase === "booth" || phase === "strip") && key === "r" && !e.repeat) retake();
    };
    const onPointer = () => phase !== "begin" && boothRef.current.ensureAudio();
    addEventListener("keydown", onKey);
    addEventListener("pointerdown", onPointer);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("pointerdown", onPointer);
    };
  }, [phase, endIntro, shoot, retake]);

  const faceLabel = status.model === "loading" ? "LOADING" : status.model === "error" ? "NO TRACKING" : status.face ? "" : "NO FACE";
  const profile = status.profile ?? {};
  const geometryWidth = 54 + (profile.a ?? 0.5) * 82;
  const geometryHeight = 48 + (profile.b ?? 0.5) * 74;
  const geometryRotation = (status.headRoll ?? 0) * 15 + (status.headYaw ?? 0) * 8 + (status.eyeLift ?? 0) * 5 + (status.mouthLift ?? 0) * 5;

  return (
    <>
      <canvas ref={canvasRef} className="stage" />
      <video ref={camRef} playsInline muted style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />

      {phase === "booth" && (
        <div className="frame-guide">
          <i /><i /><i /><i />
          <div className="osd tl"><span className="rec" />{Math.min(shots.length + 1, SHOTS)}/{SHOTS}</div>
          <div className="osd tr">{DEMO ? "DEMO " : ""}{faceLabel}</div>
          <div className="osd bl"><span><kbd>SPACE</kbd>SHUTTER</span><span><kbd>R</kbd>RETAKE</span></div>
          <div className="osd br">{status.pointing > 0.6 ? "FOCUS" : "POINT TO FOCUS"}{status.audio ? "" : " · CLICK FOR SOUND"}</div>
        </div>
      )}

      {phase === "booth" && camError && (
        <div className="gate">
          <div className="gate-inner">
            <button className="pill" onClick={startCamera}>TRY AGAIN</button>
            <p className="note">{camError}</p>
          </div>
        </div>
      )}

      {phase === "booth" && status.face && (
        <div
          className="persona-effects"
          style={{
            "--persona-a": profile.a ?? 0.5,
            "--persona-b": profile.b ?? 0.5,
            "--persona-c": profile.c ?? 0.5,
            "--persona-mood": status.mood ?? 0.5,
            "--star-hue": `${(profile.starHue ?? 42) + ((status.mood ?? 0.5) - 0.5) * 26}deg`,
            "--hair-hue": `${profile.hairHue ?? 0}deg`,
            "--star-speed": `${profile.starSpeed ?? 2.4}s`,
            "--edge-speed": `${((profile.starSpeed ?? 2.4) * 3).toFixed(1)}s`,
            "--geometry-rotation": `${geometryRotation}deg`,
            "--geometry-scale": 1 + Math.abs(status.headPitch ?? 0) * 0.08 + Math.abs(status.mouthLift ?? 0) * 0.04,
            "--geometry-opacity": 0.12 + Math.abs(status.eyeLift ?? 0) * 0.08 + Math.abs(status.mouthLift ?? 0) * 0.06,
          }}
          aria-hidden="true"
        >
          <svg className="portrait-geometry" viewBox="0 0 1000 750" preserveAspectRatio="none">
            <defs>
              <pattern
                id="portrait-geometry-pattern"
                width={geometryWidth}
                height={geometryHeight}
                patternUnits="userSpaceOnUse"
                patternTransform={`rotate(${geometryRotation})`}
              >
                <path d={`M0 0 L${geometryWidth / 2} ${geometryHeight / 2} L0 ${geometryHeight} M${geometryWidth} 0 L${geometryWidth / 2} ${geometryHeight / 2} L${geometryWidth} ${geometryHeight}`} className="geometry-grid" />
                <circle cx={geometryWidth / 2} cy={geometryHeight / 2} r={Math.min(geometryWidth, geometryHeight) * (0.12 + (profile.c ?? 0.5) * 0.12)} className="geometry-grid" />
              </pattern>
            </defs>
            <rect width="1000" height="750" fill="url(#portrait-geometry-pattern)" className="geometry-tile" />
            <g className="geometry-corners">
              <path d="M22 112 V22 H112 M888 22 H978 V112 M22 638 V728 H112 M888 728 H978 V638" />
              <path d="M42 126 L126 42 M874 42 L958 126 M42 624 L126 708 M874 708 L958 624" />
              <polygon points="500,24 520,54 500,84 480,54" />
              <polygon points="500,666 520,696 500,726 480,696" />
            </g>
          </svg>
          {Array.from({ length: profile.starCount ?? 16 }, (_, i) => <i key={i} />)}
        </div>
      )}

      {!introGone && (
        <video
          ref={introRef}
          className={"intro" + (introFade ? " out" : "")}
          style={{ transitionDuration: introFade + "ms" }}
          src={import.meta.env.BASE_URL + "intro.mp4"}
          playsInline
          preload="auto"
          onEnded={() => endIntro(2000)}
          onError={() => phase === "intro" && endIntro(400)}
        />
      )}
      {phase === "intro" && <button className="pill ghost skip" onClick={() => endIntro(400)}>SKIP</button>}

      {phase === "begin" && (
        <div className="gate begin">
          <div className="gate-inner">
            <button className="pill" onClick={begin} autoFocus>CLICK TO BEGIN</button>
            <p className="note">Your video and photos stay on this device.</p>
          </div>
        </div>
      )}

      <div key={flash} className={"flash" + (flash ? " on" : "")} />

      {phase === "strip" && (
        <Strip
          shots={shots}
          captions={captions}
          onCaption={(i, v) => setCaptions((c) => c.map((x, j) => (j === i ? v : x)))}
          onRetake={retake}
          onRestart={restart}
        />
      )}
    </>
  );
}
