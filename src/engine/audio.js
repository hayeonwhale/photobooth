import * as Tone from "tone";

const KEY = 50;
const PROGRESSION = {
  major: { roots: [0, -3, -7, -5], chords: [[0, 4, 7, 11, 14], [-3, 4, 7, 9, 12], [-7, 4, 9, 12, 16], [-5, 2, 7, 11, 14]] },
  minor: { roots: [0, -4, -9, -2], chords: [[0, 3, 7, 10, 14], [-4, 3, 7, 8, 12], [-9, 3, 7, 10, 15], [-2, 2, 5, 10, 14]] },
};
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export async function createAudio() {
  await Tone.start();

  const master = new Tone.Gain(0).connect(new Tone.Limiter(-2).toDestination());
  const bus = new Tone.Compressor(-22, 3).connect(master);
  const reverb = new Tone.Freeverb({ roomSize: 0.6, dampening: 3000, wet: 0.3 }).connect(bus);
  const chorus = new Tone.Chorus({ frequency: 0.3, delayTime: 4.5, depth: 0.5, wet: 0.5 }).start().connect(reverb);
  const filter = new Tone.Filter({ type: "lowpass", frequency: 700, Q: 0.5, rolloff: -24 }).connect(chorus);

  const pad = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 16,
    oscillator: { type: "fattriangle", count: 3, spread: 18 },
    envelope: { attack: 2, decay: 1, sustain: 0.85, release: 4 },
    volume: -16,
  }).connect(filter);

  const bellFilter = new Tone.Filter({ type: "lowpass", frequency: 2500 }).connect(reverb);
  const bell = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 6,
    oscillator: { type: "sine" },
    envelope: { attack: 1.4, decay: 2, sustain: 0.5, release: 5 },
    volume: -24,
  }).connect(bellFilter);

  const gritFilter = new Tone.Filter({ type: "bandpass", frequency: 500, Q: 0.8 }).connect(reverb);
  const grit = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 8,
    oscillator: { type: "fatsawtooth", count: 2, spread: 40 },
    envelope: { attack: 1, decay: 0.5, sustain: 0.9, release: 2.5 },
    volume: -80,
  }).connect(gritFilter);

  const sub = new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 1.5, sustain: 1, release: 3 }, volume: -34 }).connect(bus);

  const shutterBus = new Tone.Filter({ type: "bandpass", frequency: 2200, Q: 0.7 }).connect(master);
  const shutter = new Tone.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.001, decay: 0.045, sustain: 0 }, volume: -10 }).connect(shutterBus);
  const clack = new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 2, envelope: { attack: 0.001, decay: 0.06, sustain: 0 }, volume: -16 }).connect(master);

  let mode = "minor";
  let octave = 0;
  let index = 0;
  let lastVoiced = -Infinity;
  let level = 0;

  const voice = (time) => {
    const { roots, chords } = PROGRESSION[mode];
    const base = KEY + octave * 12;
    const root = base + roots[index];
    pad.releaseAll(time);
    pad.triggerAttack(chords[index].map((i) => hz(base + i)), time, 0.55);
    grit.releaseAll(time);
    grit.triggerAttack([root + 1, root + 6, root + 13].map((m) => hz(m + 0.25)), time, 0.5);
    sub.triggerAttack(hz(root - 12), time, 0.7);
    lastVoiced = Tone.now();
  };

  const transport = Tone.getTransport();
  transport.bpm.value = 60;
  transport.scheduleRepeat((time) => {
    index = (index + 1) % 4;
    voice(time);
  }, "2m", "2m");
  transport.scheduleRepeat((time) => {
    if (Math.random() < 0.35) return;
    const tones = PROGRESSION[mode].chords[index];
    const note = KEY + octave * 12 + 12 + tones[1 + Math.floor(Math.random() * (tones.length - 1))];
    bell.triggerAttackRelease(hz(note), "1m", time, 0.35 + Math.random() * 0.25);
  }, "1m", "1m");
  transport.start();
  voice(Tone.now() + 0.05);

  return {
    get mode() {
      return mode;
    },
    update(p) {
      const profile = p.profile ?? { a: 0.5, b: 0.5, c: 0.5 };
      const nextMode = p.smile > 0.45 ? "major" : p.smile < 0.25 ? "minor" : mode;
      const nextOctave = p.browDown > 0.55 ? -1 : p.browDown < 0.35 ? 0 : octave;
      if ((nextMode !== mode || nextOctave !== octave) && Tone.now() - lastVoiced > 0.8) {
        mode = nextMode;
        octave = nextOctave;
        voice(Tone.now() + 0.02);
      }
      const r = 0.1;
      const bright = Math.pow(p.smile, 1.2);
      filter.frequency.rampTo(Math.max(180, (420 + bright * 3600 + profile.a * 900) * (1 - p.browDown * 0.5)), r);
      bellFilter.frequency.rampTo(1200 + bright * 4000 + profile.c * 1600, r);
      pad.volume.rampTo(-16 + bright * 3, r);
      grit.volume.rampTo(p.browDown < 0.04 ? -80 : -42 + p.browDown * 24, r);
      gritFilter.frequency.rampTo(350 + p.browDown * 900, r);
      sub.volume.rampTo(-32 + p.browDown * 16, r);
      reverb.roomSize.rampTo(0.55 + p.jawOpen * 0.42 + profile.b * 0.12, r);
      reverb.wet.rampTo(0.22 + p.jawOpen * 0.55, r);
      Tone.getTransport().bpm.rampTo(52 + profile.b * 16 + p.smile * 8, r);
      master.gain.rampTo(level * (0.6 + 0.4 * p.presence), 0.4);
    },
    shutter(profile = { a: 0.5, b: 0.5, c: 0.5 }) {
      const t = Tone.now();
      shutter.triggerAttackRelease(0.025 + profile.a * 0.035, t, 0.65 + profile.c * 0.25);
      clack.triggerAttackRelease(150 + profile.b * 80, 0.05, t + 0.005, 0.42 + profile.a * 0.18);
      shutter.triggerAttackRelease(0.02 + profile.c * 0.025, t + 0.075, 0.4);
      clack.triggerAttackRelease(120 + profile.c * 70, 0.05, t + 0.08, 0.25 + profile.b * 0.2);
    },
    setLevel(v) {
      level = v;
      master.gain.rampTo(v, 1.5);
    },
  };
}
