/**
 * Audio helpers (Web Audio API).
 *
 * - chime(): a soft two-tone bell for the end of a focus phase.
 * - Ambient sounds: rain, forest, ocean and wind. If a matching audio file
 *   exists in /sounds (see data/sounds.json), it is looped; otherwise the
 *   sound is synthesized live from filtered noise, so no licensed recordings
 *   are needed.
 */

let ctx = null;

function context() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/* ---------------- Chime ---------------- */

export function chime(volume = 0.25) {
  const ac = context();
  const now = ac.currentTime;
  [[659.25, 0], [987.77, 0.22]].forEach(([freq, delay]) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(volume, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 2.4);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 2.5);
  });
}

/* ---------------- Noise sources ---------------- */

function noiseBuffer(ac, kind, seconds = 4) {
  const length = ac.sampleRate * seconds;
  const buffer = ac.createBuffer(2, length, ac.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let last = 0;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else if (kind === 'pink') {
        // Paul Kellet's pink noise filter
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else {
        data[i] = white;
      }
    }
  }
  return buffer;
}

function loopSource(ac, buffer) {
  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function lfo(ac, frequency, depth, target) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.frequency.value = frequency;
  gain.gain.value = depth;
  osc.connect(gain).connect(target);
  osc.start();
  return osc;
}

/** Builds a synthesized ambient sound. Returns { output, stop() }. */
const SYNTHS = {
  rain(ac, out) {
    const src = loopSource(ac, noiseBuffer(ac, 'pink'));
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    src.connect(hp).connect(lp).connect(out);
    src.start();
    return [src];
  },

  ocean(ac, out) {
    const src = loopSource(ac, noiseBuffer(ac, 'brown', 6));
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const swell = ac.createGain();
    swell.gain.value = 0.55;
    const wave = lfo(ac, 0.09, 0.45, swell.gain); // slow waves
    src.connect(lp).connect(swell).connect(out);
    src.start();
    return [src, wave];
  },

  wind(ac, out) {
    const src = loopSource(ac, noiseBuffer(ac, 'pink', 6));
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.9;
    const gust = lfo(ac, 0.06, 350, bp.frequency);
    const level = ac.createGain();
    level.gain.value = 1.6;
    src.connect(bp).connect(level).connect(out);
    src.start();
    return [src, gust];
  },

  forest(ac, out) {
    // Soft leaf rustle plus occasional bird calls
    const src = loopSource(ac, noiseBuffer(ac, 'brown', 6));
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 0.5;
    const rustle = ac.createGain();
    rustle.gain.value = 0.5;
    src.connect(bp).connect(rustle).connect(out);
    src.start();

    let timer = null;
    let stopped = false;
    const bird = () => {
      if (stopped) return;
      const now = ac.currentTime;
      const notes = 2 + Math.floor(Math.random() * 3);
      const base = 2600 + Math.random() * 1400;
      for (let i = 0; i < notes; i++) {
        const t = now + i * 0.16;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base, t);
        osc.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), t + 0.09);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.05, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(gain).connect(out);
        osc.start(t);
        osc.stop(t + 0.14);
      }
      timer = setTimeout(bird, 2500 + Math.random() * 6000);
    };
    timer = setTimeout(bird, 1500);
    return [src, { stop() { stopped = true; clearTimeout(timer); } }];
  }
};

/* ---------------- Ambient player ---------------- */

const fileCache = new Map(); // file -> AudioBuffer | null (null = not available)

async function loadFile(ac, file) {
  if (!file) return null;
  if (fileCache.has(file)) return fileCache.get(file);
  let buffer = null;
  try {
    const response = await fetch(file);
    if (response.ok) buffer = await ac.decodeAudioData(await response.arrayBuffer());
  } catch {
    buffer = null; // missing or unsupported file: fall back to the synthesizer
  }
  fileCache.set(file, buffer);
  return buffer;
}

let current = null; // { id, gain, nodes }

/**
 * Plays an ambient sound (stopping any other one).
 * @param {{id: string, file?: string}} sound
 * @param {number} volume 0..1
 */
export async function playAmbient(sound, volume) {
  stopAmbient();
  const ac = context();
  const gain = ac.createGain();
  gain.gain.value = 0;
  gain.connect(ac.destination);
  const entry = { id: sound.id, gain, nodes: [] };
  current = entry;

  const buffer = await loadFile(ac, sound.file);
  if (current !== entry) return; // another sound was chosen meanwhile
  if (buffer) {
    const src = loopSource(ac, buffer);
    src.connect(gain);
    src.start();
    entry.nodes = [src];
  } else if (SYNTHS[sound.id]) {
    entry.nodes = SYNTHS[sound.id](ac, gain);
  }
  // Gentle fade in
  gain.gain.linearRampToValueAtTime(volume, ac.currentTime + 1.2);
}

export function setAmbientVolume(volume) {
  if (!current || !ctx) return;
  current.gain.gain.cancelScheduledValues(ctx.currentTime);
  current.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.1);
}

export function stopAmbient() {
  if (!current || !ctx) return;
  const { gain, nodes } = current;
  current = null;
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.6);
  setTimeout(() => {
    nodes.forEach((node) => { try { node.stop(); } catch { /* already stopped */ } });
    gain.disconnect();
  }, 700);
}

export function currentAmbient() {
  return current ? current.id : null;
}
