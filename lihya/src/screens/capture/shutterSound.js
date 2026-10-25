// Short shutter click made with WebAudio (no audio file): a 45 ms burst of filtered
// noise with a fast decay, plus a tiny low "thock" for body. iOS has no web
// vibration, so the click and the white edge flash are the shutter feedback.
//
// Browsers start an AudioContext suspended until a user gesture; unlock() is called
// from any tap on the capture screen so the auto-shutter can play later.

export function createShutterSound() {
  let ctx = null;
  let noise = null;

  const ensure = () => {
    if (ctx) return ctx;
    const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      ctx = null;
    }
    return ctx;
  };

  const noiseBuffer = (c) => {
    if (noise && noise.sampleRate === c.sampleRate) return noise;
    const len = Math.max(1, Math.round(c.sampleRate * 0.06));
    noise = c.createBuffer(1, len, c.sampleRate);
    const data = noise.getChannelData(0);
    // Deterministic pseudo-random noise (same click every time).
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x3fffffff - 1) * (1 - i / len);
    }
    return noise;
  };

  return {
    /** Call from a user gesture (pointerdown) so later clicks are allowed to sound. */
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    },
    play() {
      const c = ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume().catch(() => {});
      try {
        const t = c.currentTime + 0.005;
        const src = c.createBufferSource();
        src.buffer = noiseBuffer(c);
        const band = c.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 3200;
        band.Q.value = 0.9;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.55, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
        src.connect(band);
        band.connect(g);
        g.connect(c.destination);
        src.start(t);
        src.stop(t + 0.06);

        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(70, t + 0.05);
        const og = c.createGain();
        og.gain.setValueAtTime(0.0001, t);
        og.gain.exponentialRampToValueAtTime(0.25, t + 0.004);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        osc.connect(og);
        og.connect(c.destination);
        osc.start(t);
        osc.stop(t + 0.07);
      } catch {
        // audio is a nicety; the flash still shows
      }
    },
    close() {
      if (ctx && typeof ctx.close === 'function') ctx.close().catch(() => {});
      ctx = null;
      noise = null;
    },
  };
}
