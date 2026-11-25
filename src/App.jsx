import { useCallback, useEffect, useRef, useState } from "react";
import { createBooth } from "./engine/booth.js";
import { verifyCaption } from "./verify.js";
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
  const [verdicts, setVerdicts] = useState(Array(SHOTS).fill(null));
  const [verifying, setVerifying] = useState(false);
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
    setVerdicts(Array(SHOTS).fill(null));
    boothRef.current.setLive(true);
    setPhase("booth");
  };

  const verify = async () => {
    const snapshot = captions.map((c) => c.trim());
    setVerifying(true);
    setVerdicts(snapshot.map((text) => (text ? { text, pending: true } : null)));
    await Promise.all(
      snapshot.map(async (text, i) => {
        if (!text) return;
        let verdict;
        try {
          verdict = { text, human: await verifyCaption(text) };
        } catch (e) {
          console.warn("verify failed:", e.message);
          verdict = { text, error: true };
        }
        setVerdicts((v) => v.map((x, j) => (j === i ? verdict : x)));
      }),
    );
    setVerifying(false);
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
          <div className="osd br">{status.audio ? "" : "CLICK FOR SOUND"}</div>
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

      {!introGone && (
        <video
          ref={introRef}
          className={"intro" + (introFade ? " out" : "")}
          style={{ transitionDuration: introFade + "ms" }}
          src="/intro.mp4"
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
            <p className="note">Your video and photos stay on this device. Only caption text is sent if you press Verify.</p>
          </div>
        </div>
      )}

      <div key={flash} className={"flash" + (flash ? " on" : "")} />

      {phase === "strip" && (
        <Strip
          shots={shots}
          captions={captions}
          verdicts={verdicts}
          verifying={verifying}
          onCaption={(i, v) => setCaptions((c) => c.map((x, j) => (j === i ? v : x)))}
          onVerify={verify}
          onRetake={retake}
          onRestart={restart}
        />
      )}
    </>
  );
}
