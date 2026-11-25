# lo-fi photobooth

A face-played photobooth that runs entirely in the browser (React + Vite, MediaPipe Face Landmarker, Tone.js, WebGL2).
The face only shapes sound and light; the person decides when to shoot and writes every caption.

## Run

```sh
npm install
npm run dev        # http://localhost:5173 (camera needs localhost or https)
npm run build && npm run preview
```

Drop your intro at `public/intro.mp4` and a demo clip at `public/demo.mp4` (placeholders ship). The face model
and MediaPipe wasm are served from `public/models` and `public/wasm`, so nothing is fetched from a CDN at runtime.

- `?demo=1` plays `/demo.mp4` in place of the webcam (not mirrored; the live webcam is mirrored, the intro never is).

### Caption verification (Pangram)

Copy `.env.example` to `.env` and set `PANGRAM_API_KEY` (optionally `PANGRAM_MODEL`, default `"default"`).
The key is only read by the Vite dev/preview server, which proxies `POST /api/verify` to Pangram's async
`/task` API and polls for the result; it never reaches the browser. A static deploy of `dist/` has no
`/api/verify`, so every caption shows "Not verified" there unless you host an equivalent endpoint.

## Controls

| Key | Where | Action |
| --- | --- | --- |
| click | start screen | starts camera, audio and the intro |
| S / Skip button | intro | skip the intro (0.4 s fade) |
| Space | booth | shutter (captures the filtered frame with the current light) |
| R | booth / strip | retake the last shot |

## Mapping

| Expression | Sound | Light |
| --- | --- | --- |
| smile (mouthSmileL/R) | major mode, brighter pad and bells | warm glow from the face |
| brow furrow (browDownL/R) | dissonant cluster, octave down, sub | cooler, darker, heavier vignette |
| jaw open (jawOpen) | larger, wetter reverb | glow radius and halo expand outward |

Values are baseline-calibrated over the first ~40 tracked frames, then low-passed with separate attack/release
time constants (`src/engine/features.js`).

## Files

- `src/tokens.css` — design tokens; replace with the Paper export.
- `src/engine/lofi.js` — VHS shader (line quantize, YIQ chroma bleed, jitter, grain, scanlines, vignette, light wash) and shot capture with date stamp.
- `src/engine/audio.js` — Tone.js pad, sustained bell notes, dissonance layer, reverb, shutter sound.
- `src/engine/booth.js` — camera, tracking loop, render loop.
- `src/App.jsx`, `src/components/Strip.jsx` — flow and the captioned strip with PNG export.
- `src/verify.js`, `vite.config.js` — Pangram verification client and the server-side proxy.
