// Synthesized sound effects via Web Audio API. No asset files needed.
// All sounds are short envelope-shaped oscillators or noise bursts.

let audioCtx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctx = window.AudioContext || (window as WindowWithWebkit).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  // Browsers suspend AudioContexts until a user gesture; resume on demand.
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

interface ToneOptions {
  freq: number;
  durationMs: number;
  type?: OscillatorType;
  volume?: number;
  attackMs?: number;
  releaseMs?: number;
}

function playTone({
  freq,
  durationMs,
  type = "sine",
  volume = 0.18,
  attackMs = 5,
  releaseMs = 60,
}: ToneOptions) {
  const ctx = getCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);

  const now = ctx.currentTime;
  const attack = attackMs / 1000;
  const release = releaseMs / 1000;
  const duration = durationMs / 1000;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + attack);
  gain.gain.setValueAtTime(volume, now + duration);
  gain.gain.linearRampToValueAtTime(0, now + duration + release);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration + release + 0.02);
}

function playNoise(durationMs: number, volume = 0.12) {
  const ctx = getCtx();
  if (!ctx) return;

  const bufferSize = Math.floor((ctx.sampleRate * durationMs) / 1000);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.value = volume;

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

export const sounds = {
  setMuted: (m: boolean) => {
    muted = m;
  },
  isMuted: () => muted,

  // Cheerful upward two-note arpeggio
  correct: () => {
    if (muted) return;
    playTone({ freq: 660, durationMs: 80, type: "triangle", volume: 0.18 });
    setTimeout(
      () =>
        playTone({
          freq: 880,
          durationMs: 140,
          type: "triangle",
          volume: 0.18,
          releaseMs: 90,
        }),
      90
    );
  },

  // Low buzz
  wrong: () => {
    if (muted) return;
    playTone({
      freq: 180,
      durationMs: 180,
      type: "sawtooth",
      volume: 0.16,
      attackMs: 2,
      releaseMs: 80,
    });
  },

  // Soft click for button press / interactions
  click: () => {
    if (muted) return;
    playTone({
      freq: 520,
      durationMs: 25,
      type: "square",
      volume: 0.07,
      attackMs: 1,
      releaseMs: 25,
    });
  },

  // Card flick (white-noise burst)
  deal: () => {
    if (muted) return;
    playNoise(60, 0.08);
  },
};
