/** Web Audio synthesized sound effects — no audio files needed. */
interface LoopHandle {
  g: GainNode;
  o?: OscillatorNode;
  srcs: AudioScheduledSourceNode[];
}

const VOLUME = 0.7;

class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  /** Mirror of the master output, mixed into recorded clips. */
  dest: MediaStreamAudioDestinationNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;

  ensure(): AudioContext | null {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : VOLUME;
      this.master.connect(this.ctx.destination);
      try {
        this.dest = this.ctx.createMediaStreamDestination();
        this.master.connect(this.dest);
      } catch {
        this.dest = null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : VOLUME;
  }

  private noise(): AudioBuffer {
    const c = this.ctx!;
    if (!this.noiseBuf) {
      const b = c.createBuffer(1, Math.floor(c.sampleRate * 1.5), c.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
    }
    return this.noiseBuf;
  }

  private env(g: GainNode, t0: number, attack: number, peak: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  tone(freq: number, dur: number, o: { type?: OscillatorType; vol?: number; to?: number; delay?: number } = {}) {
    const c = this.ensure();
    if (!c || !this.master) return;
    const t = c.currentTime + (o.delay ?? 0);
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.008, o.vol ?? 0.25, dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  burst(dur: number, o: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; vol?: number; delay?: number } = {}) {
    const c = this.ensure();
    if (!c || !this.master) return;
    const t = c.currentTime + (o.delay ?? 0);
    const s = c.createBufferSource();
    s.buffer = this.noise();
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 2000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    this.env(g, t, 0.005, o.vol ?? 0.4, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  slice() {
    this.burst(0.22, { type: 'highpass', freq: 7000, to: 1200, vol: 0.5 });
    this.tone(2400, 0.18, { type: 'triangle', to: 500, vol: 0.12 });
  }

  crash() {
    this.burst(0.9, { type: 'lowpass', freq: 3000, to: 200, vol: 0.9 });
    this.tone(90, 0.6, { to: 30, vol: 0.7 });
    this.burst(0.35, { type: 'highpass', freq: 4000, vol: 0.3, delay: 0.05 });
    for (let i = 0; i < 6; i++) this.tone(2800 + Math.random() * 2200, 0.08, { type: 'triangle', vol: 0.05, delay: 0.1 + i * 0.06 });
  }

  ding() {
    this.tone(880, 0.25, { type: 'triangle', vol: 0.25 });
    this.tone(1318, 0.45, { type: 'triangle', vol: 0.22, delay: 0.12 });
  }

  pop() {
    this.tone(520, 0.12, { type: 'triangle', to: 780, vol: 0.2 });
  }

  /** Sad trombone. */
  fail() {
    [392, 370, 349, 294].forEach((f, i) =>
      this.tone(f, i === 3 ? 0.7 : 0.28, { type: 'sawtooth', vol: 0.08, delay: i * 0.3, to: i === 3 ? f * 0.94 : undefined }),
    );
  }

  beep(f = 600) {
    this.tone(f, 0.12, { type: 'square', vol: 0.08 });
  }

  private loopOsc(type: OscillatorType, freq: number, vol: number, filter?: number): LoopHandle | null {
    const c = this.ensure();
    if (!c || !this.master) return null;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, c.currentTime + 0.1);
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f).connect(g);
    } else {
      o.connect(g);
    }
    g.connect(this.master);
    o.start();
    return { g, o, srcs: [o] };
  }

  startHum() {
    return this.loopOsc('sine', 220, 0.05);
  }

  startEngine() {
    return this.loopOsc('sawtooth', 60, 0.1, 500);
  }

  startScreech(): LoopHandle | null {
    const c = this.ensure();
    if (!c || !this.master) return null;
    const s = c.createBufferSource();
    s.buffer = this.noise();
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2800;
    f.Q.value = 4;
    const g = c.createGain();
    g.gain.value = 0.22;
    s.connect(f).connect(g).connect(this.master);
    s.start();
    return { g, srcs: [s] };
  }

  setFreq(h: LoopHandle | null, f: number) {
    if (h?.o && this.ctx) h.o.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.03);
  }

  setGain(h: LoopHandle | null, v: number) {
    if (h && this.ctx) h.g.gain.setTargetAtTime(Math.max(v, 0.0001), this.ctx.currentTime, 0.05);
  }

  stop(h: LoopHandle | null) {
    if (!h || !this.ctx) return;
    const t = this.ctx.currentTime;
    h.g.gain.cancelScheduledValues(t);
    h.g.gain.setTargetAtTime(0.0001, t, 0.04);
    h.srcs.forEach((s) => {
      try {
        s.stop(t + 0.25);
      } catch {
        /* already stopped */
      }
    });
  }
}

export type { LoopHandle };
export const sfx = new Sfx();
