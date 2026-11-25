# Lo-fi Photobooth

A browser-based face-reactive photobooth built with React, Vite, MediaPipe, Tone.js, and WebGL.
Each face gets a subtle personal visual and audio profile, while smile, brow, and jaw expressions shape the live effects.
Eye- and mouth-corner angles are calibrated per session and gently influence brightness, reverb, pitch, and sparkle chimes; they are expressive cues, not a definitive mood reading.
Point an extended index finger toward a spot in the camera view to reveal a clearer circular patch there. Hand tracking and one-time skin/iris color sampling run locally; the sampled appearance only varies the stars' palette, count, and drift.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Camera access requires localhost or HTTPS.

Live demo: https://hayeonwhale.github.io/photobooth/

## Build

```bash
npm run build
npm run preview
```

Use `?demo=1` to run with `public/demo.mp4` instead of the camera.
