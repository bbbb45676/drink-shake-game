import { CONFIG } from './config.js';

// 三段畫質：開場依裝置猜一個，玩的時候量幀率，太卡就自動降一段
const KEY = 'yyl-quality-v2';

export class Quality {
  constructor(onChange) {
    this.onChange = onChange;
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* 私密模式讀不到也沒關係 */ }
    const forced = new URLSearchParams(location.search).get('q');
    if (forced) saved = forced;
    this.locked = !!forced;
    const idx = CONFIG.quality.findIndex((q) => q.name === saved);
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);
    this.i = idx >= 0 ? idx : mobile ? 1 : 2;
    this.frames = 0; this.time = 0; this.grace = 3;
    this.fps = 60;
  }

  get q() { return CONFIG.quality[this.i]; }

  sample(dt) {
    this.frames++; this.time += dt;
    if (this.time >= 2) { this.fps = this.frames / this.time; }
    if (this.locked) { if (this.time >= 2) { this.frames = 0; this.time = 0; } return; }
    if (this.grace > 0) { this.grace -= dt; this.frames = 0; this.time = 0; return; }
    if (this.time >= 3) {
      const fps = this.frames / this.time;
      if (fps < 40 && this.i > 0) {
        this.i--;
        try { localStorage.setItem(KEY, this.q.name); } catch (e) { /* 忽略 */ }
        this.onChange(this.q);
        this.grace = 3;
      }
      this.frames = 0; this.time = 0;
    }
  }
}
