import { useMemo } from "react";
import { verdictLabel } from "../verify.js";

const HAND_FONT = '"Caveat", "Nanum Pen Script", cursive';

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

const current = (verdict, caption) => (verdict && verdict.text === caption.trim() ? verdict : null);

async function exportStrip(shots, captions, verdicts, tilts) {
  await Promise.all([document.fonts.load('56px "Caveat"'), document.fonts.load('56px "Nanum Pen Script"'), document.fonts.load('30px "VT323"')]);
  const images = await Promise.all(
    shots.map((src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = src;
    })),
  );
  const W = 720, pad = 38, fw = W - pad * 2, fh = (fw * 3) / 4, capH = 78;
  const H = pad + shots.length * (fh + capH) + 60;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  ctx.fillStyle = token("--paper");
  ctx.fillRect(0, 0, W, H);
  const grain = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < grain.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    grain.data[i] += n;
    grain.data[i + 1] += n;
    grain.data[i + 2] += n * 0.8;
  }
  ctx.putImageData(grain, 0, 0);

  images.forEach((img, i) => {
    const y = pad + i * (fh + capH);
    ctx.save();
    ctx.translate(W / 2 + tilts[i][1] * 2, y + fh / 2);
    ctx.rotate((tilts[i][0] * Math.PI) / 180);
    ctx.drawImage(img, -fw / 2, -fh / 2, fw, fh);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.strokeRect(-fw / 2, -fh / 2, fw, fh);
    ctx.restore();
    const verdict = current(verdicts[i], captions[i]);
    let stampW = 0;
    if (verdict && !verdict.pending) {
      const label = verdictLabel(verdict).toUpperCase();
      ctx.save();
      ctx.font = '28px "VT323", monospace';
      stampW = ctx.measureText(label).width + 20;
      ctx.translate(W - pad - stampW / 2, y + fh + capH / 2);
      ctx.rotate(-0.05);
      ctx.strokeStyle = ctx.fillStyle = token(verdict.error ? "--ink-faint" : "--verify-ink");
      ctx.lineWidth = 2;
      ctx.strokeRect(-stampW / 2, -17, stampW, 34);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, 1);
      ctx.restore();
    }
    ctx.fillStyle = token("--ink");
    ctx.font = `52px ${HAND_FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillText(captions[i], pad + 4, y + fh + capH / 2, fw - 8 - (stampW ? stampW + 12 : 0));
  });
  ctx.font = '30px "VT323", monospace';
  ctx.fillStyle = token("--ink-faint");
  ctx.textAlign = "center";
  ctx.fillText(stamp(), W / 2, H - 28);

  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `photostrip-${stamp()}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Strip({ shots, captions, verdicts, verifying, onCaption, onVerify, onRetake, onRestart }) {
  const tilts = useMemo(() => shots.map(() => [(Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 5]), [shots]);
  const hasText = captions.some((c) => c.trim());

  return (
    <div className="strip-view">
      <div className="strip">
        {shots.map((src, i) => {
          const verdict = current(verdicts[i], captions[i]);
          return (
            <div className="cell" key={src.slice(-32) + i}>
              <img src={src} alt={`shot ${i + 1}`} style={{ transform: `rotate(${tilts[i][0]}deg) translateX(${tilts[i][1]}px)` }} />
              {verdict && <span className={"verdict" + (verdict.error ? " failed" : "") + (verdict.pending ? " pending" : "")}>{verdictLabel(verdict)}</span>}
              <input value={captions[i]} maxLength={80} autoFocus={i === 0} onChange={(e) => onCaption(i, e.target.value)} aria-label={`caption ${i + 1}`} />
            </div>
          );
        })}
        <div className="strip-foot">{stamp()}</div>
      </div>
      <div className="strip-actions">
        <button className="pill" onClick={() => exportStrip(shots, captions, verdicts, tilts)}>SAVE STRIP</button>
        <button className="pill ghost" onClick={onVerify} disabled={verifying || !hasText}>{verifying ? "VERIFYING…" : "VERIFY AS HUMAN-WRITTEN"}</button>
        <button className="pill ghost" onClick={onRetake}>RETAKE LAST · R</button>
        <button className="pill ghost" onClick={onRestart}>START OVER</button>
      </div>
    </div>
  );
}
