// 音效：WebAudio 即時合成，不用音檔。預設靜音。
let ctx = null;
let master = null;
let muted = true;
let noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.7;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function setMuted(m) {
  muted = m;
  if (m && !ctx) return;
  ensure();
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.setTargetAtTime(m ? 0 : 0.7, ctx.currentTime, 0.02);
}
export const isMuted = () => muted;

function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
  if (muted || !ensure()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.3, freq = 1200, q = 0.8, type = 'bandpass', sweep = 1, delay = 0 } = {}) {
  if (muted || !ensure()) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
}

// 持續的水聲（茶桶、果糖機開著時）
let pourSrc = null, pourGain = null, pourFilter = null;
export function setPour(level, bright = 1) {
  if (!ensure()) return;
  if (!pourSrc) {
    pourSrc = ctx.createBufferSource(); pourSrc.buffer = noiseBuf; pourSrc.loop = true;
    pourFilter = ctx.createBiquadFilter(); pourFilter.type = 'bandpass'; pourFilter.frequency.value = 900; pourFilter.Q.value = 0.9;
    pourGain = ctx.createGain(); pourGain.gain.value = 0;
    pourSrc.connect(pourFilter); pourFilter.connect(pourGain); pourGain.connect(master); pourSrc.start();
  }
  const t = ctx.currentTime;
  pourGain.gain.setTargetAtTime(muted ? 0 : Math.min(0.32, level * 0.16), t, 0.05);
  pourFilter.frequency.setTargetAtTime(700 + bright * 700 + Math.random() * 120, t, 0.08);
}

export const sfx = {
  grab: () => tone(520, 0.05, { type: 'triangle', vol: 0.08, slide: 1.3 }),
  lever: () => { tone(1500, 0.03, { type: 'square', vol: 0.06 }); noise(0.05, { vol: 0.12, freq: 3000, q: 3 }); },
  button: () => tone(380, 0.06, { type: 'triangle', vol: 0.12, slide: 0.8 }),
  scoop: () => noise(0.08, { vol: 0.08, freq: 1800 + Math.random() * 600, q: 2 }),
  whirr: () => { tone(160, 0.45, { type: 'sawtooth', vol: 0.05, slide: 1.4 }); noise(0.4, { vol: 0.06, freq: 500, q: 1 }); },
  rude: () => { tone(330, 0.12, { type: 'square', vol: 0.06 }); tone(250, 0.18, { type: 'square', vol: 0.06, delay: 0.12 }); },
  crack: () => { noise(0.18, { vol: 0.4, freq: 2600, q: 0.8, sweep: 0.4 }); tone(140, 0.15, { vol: 0.2, slide: 0.5 }); },
  click: () => tone(660, 0.06, { type: 'triangle', vol: 0.15 }),
  pour: () => noise(0.6, { vol: 0.18, freq: 900, q: 1.5, sweep: 0.6 }),
  plop: () => tone(300 + Math.random() * 200, 0.08, { vol: 0.18, slide: 0.5 }),
  clink: () => { tone(2400 + Math.random() * 800, 0.12, { type: 'triangle', vol: 0.12 }); tone(3600, 0.06, { vol: 0.06, delay: 0.03 }); },
  seal: () => { noise(0.25, { vol: 0.3, freq: 300, type: 'lowpass' }); tone(120, 0.2, { type: 'square', vol: 0.08 }); },
  shake: () => noise(0.09, { vol: 0.12, freq: 2200, q: 2 }),
  pop: () => { tone(900, 0.12, { vol: 0.35, slide: 0.3 }); noise(0.5, { vol: 0.45, freq: 2500, sweep: 0.2 }); },
  splash: () => { noise(0.7, { vol: 0.55, freq: 1500, q: 0.7, sweep: 0.3 }); tone(180, 0.25, { vol: 0.2, slide: 0.4 }); },
  whoosh: () => noise(0.3, { vol: 0.25, freq: 600, q: 1, sweep: 4 }),
  boing: () => tone(220, 0.5, { type: 'triangle', vol: 0.25, slide: 2.4 }),
  thud: () => { tone(90, 0.2, { vol: 0.35, slide: 0.5 }); noise(0.15, { vol: 0.2, freq: 400, type: 'lowpass' }); },
  ding: () => { tone(1320, 0.4, { vol: 0.18 }); tone(1980, 0.5, { vol: 0.1, delay: 0.08 }); },
  good: () => { tone(660, 0.12, { type: 'triangle', vol: 0.2 }); tone(990, 0.2, { type: 'triangle', vol: 0.2, delay: 0.1 }); },
  bad: () => { tone(220, 0.25, { type: 'sawtooth', vol: 0.12 }); tone(180, 0.35, { type: 'sawtooth', vol: 0.12, delay: 0.15 }); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.18, delay: i * 0.09 })),
};
