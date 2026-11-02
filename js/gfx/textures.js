import * as THREE from 'three';
import { FONT, PALETTE } from '../config.js';

// 所有貼圖都用 Canvas 即時畫出來：沒有外部圖檔。

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function tex(c, { repeat, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = aniso;
  return t;
}

// 可重現的亂數（貼圖每次長得一樣）
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 不鏽鋼髮絲紋（粗糙度貼圖用，灰階）
export function brushedTex() {
  const c = canvas(512, 512), g = c.getContext('2d'), R = rng(7);
  g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const y = R() * 512, v = 90 + R() * 80 | 0;
    g.strokeStyle = `rgba(${v},${v},${v},${0.15 + R() * 0.25})`;
    g.lineWidth = 0.6 + R() * 1.2;
    g.beginPath(); const x = R() * 512; g.moveTo(x - 200, y); g.lineTo(x + 200 + R() * 200, y + (R() - 0.5) * 2); g.stroke();
  }
  // 一些使用痕跡
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(160,160,160,${R() * 0.12})`;
    g.beginPath(); g.ellipse(R() * 512, R() * 512, 10 + R() * 50, 6 + R() * 30, R() * 3, 0, 7); g.fill();
  }
  return tex(c, { srgb: false, repeat: [2, 2] });
}

// 木紋（暖色橡木）
export function woodTex(base = '#b98552', dark = '#8d5d34', seed = 3) {
  const c = canvas(512, 512), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let p = 0; p < 6; p++) {
    const y0 = p * 86 + R() * 20;
    g.fillStyle = `rgba(255,230,190,${0.05 + R() * 0.07})`; g.fillRect(0, y0, 512, 84);
    g.strokeStyle = 'rgba(60,30,10,.25)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, y0); g.lineTo(512, y0); g.stroke();
  }
  for (let i = 0; i < 180; i++) {
    const y = R() * 512, a = 0.04 + R() * 0.12, amp = 2 + R() * 6, f = 0.005 + R() * 0.02;
    g.strokeStyle = dark; g.globalAlpha = a; g.lineWidth = 0.8 + R() * 2.2;
    g.beginPath();
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x * f + i) * amp);
    g.stroke();
  }
  g.globalAlpha = 1;
  return tex(c);
}

// 磁磚（地鐵磚、馬賽克、二丁掛）
export function tileTex({ w = 512, h = 512, cols = 8, rows = 16, color = '#f1ece3', grout = '#c9c0b2', jitter = 0.05, offset = 0.5, seed = 5, gap = 3, palette = null, bevel = true } = {}) {
  const c = canvas(w, h), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = grout; g.fillRect(0, 0, w, h);
  const tw = w / cols, th = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k <= cols; k++) {
      const x = k * tw + (r % 2 ? offset * tw : 0), y = r * th;
      let col = palette ? palette[(R() * palette.length) | 0] : color;
      g.fillStyle = col; g.fillRect(x + gap / 2, y + gap / 2, tw - gap, th - gap);
      const l = (R() - 0.5) * jitter * 2;
      g.fillStyle = l > 0 ? `rgba(255,255,255,${l})` : `rgba(0,0,0,${-l})`;
      g.fillRect(x + gap / 2, y + gap / 2, tw - gap, th - gap);
      if (bevel) {
        g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + gap / 2, y + gap / 2, tw - gap, 2);
        g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(x + gap / 2, y + th - gap / 2 - 2, tw - gap, 2);
      }
    }
  }
  return tex(c);
}

// 柔邊圓（水漬、陰影、光暈）
export function softCircleTex(inner = 0.55) {
  const c = canvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(inner, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c, { srgb: false });
}

// 水漬：不規則邊緣
export function puddleTex() {
  const c = canvas(256, 256), g = c.getContext('2d'), R = rng(11);
  g.translate(128, 128);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2, r = 96 + Math.sin(a * 2 + 1) * 10 + Math.sin(a * 5) * 4 + R() * 3;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath(); g.filter = 'blur(5px)'; g.fill();
  return tex(c, { srgb: false });
}

// 文字招牌（燈箱）
export function signTex(text, { w = 512, h = 128, bg = '#c8312b', fg = '#fff8e8', vertical = false, sub = '', border = 'rgba(255,255,255,.55)', font = FONT, size } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.12)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = border; g.lineWidth = Math.max(4, Math.min(w, h) * 0.04); g.strokeRect(g.lineWidth, g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...text];
  if (vertical) {
    const s = size || Math.min(w * 0.7, (h * 0.86) / chars.length);
    g.font = `${s}px ${font}`;
    const total = s * chars.length * 1.05;
    chars.forEach((ch, i) => g.fillText(ch, w / 2, h / 2 - total / 2 + s * 1.05 * (i + 0.5)));
  } else {
    const s = size || Math.min(h * 0.62, (w * 0.86) / chars.length);
    g.font = `${s}px ${font}`;
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + s * 0.04);
    if (sub) { g.font = `${h * 0.16}px ${font}`; g.globalAlpha = 0.85; g.fillText(sub, w / 2, h * 0.78); g.globalAlpha = 1; }
  }
  return tex(c);
}

// 店徽：圓章裡一個「晃」字
export function drawLogo(g, cx, cy, r, { ring = PALETTE.teal, fill = PALETTE.cream, ink = PALETTE.brown } = {}) {
  g.save();
  g.fillStyle = ring; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  g.fillStyle = fill; g.beginPath(); g.arc(cx, cy, r * 0.82, 0, 7); g.fill();
  g.fillStyle = ink; g.font = `${r * 1.0}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('晃', cx, cy + r * 0.05);
  // 小茶葉
  g.fillStyle = ring;
  g.beginPath(); g.ellipse(cx + r * 0.52, cy - r * 0.52, r * 0.2, r * 0.1, -0.7, 0, 7); g.fill();
  g.restore();
}

// 杯身印刷：一圈店名帶
export function cupPrintTex() {
  const c = canvas(1024, 256), g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  // 8 分線（茶加到這條線）
  g.strokeStyle = 'rgba(62,38,24,.75)'; g.lineWidth = 3; g.setLineDash([14, 8]);
  for (const [a, b] of [[0, 185], [327, 697], [839, 1024]]) { g.beginPath(); g.moveTo(a, 51); g.lineTo(b, 51); g.stroke(); }
  g.setLineDash([]);
  g.fillStyle = 'rgba(62,38,24,.8)'; g.font = `22px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText('8分', 512, 46);
  g.fillStyle = 'rgba(44,122,115,.92)'; g.fillRect(0, 150, 1024, 22);
  g.fillStyle = 'rgba(244,232,212,.9)'; g.fillRect(0, 176, 1024, 6);
  for (let i = 0; i < 2; i++) {
    const x = 256 + i * 512;
    drawLogo(g, x, 96, 52);
    g.fillStyle = 'rgba(62,38,24,.85)'; g.font = `30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('晃晃茶舖', x, 214);
  }
  return tex(c);
}

// 封膜：手搖店經典的花樣膜
export function filmTex() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#fbf6ec'; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill();
  g.save(); g.beginPath(); g.arc(128, 128, 126, 0, 7); g.clip();
  g.strokeStyle = 'rgba(44,122,115,.55)'; g.lineWidth = 6;
  for (let i = -6; i < 10; i++) { g.beginPath(); g.moveTo(i * 36, 0); g.lineTo(i * 36 + 256, 256); g.stroke(); }
  g.restore();
  g.fillStyle = 'rgba(251,246,236,.9)'; g.beginPath(); g.arc(128, 128, 70, 0, 7); g.fill();
  drawLogo(g, 128, 120, 46);
  g.fillStyle = PALETTE.brown; g.font = `20px ${FONT}`; g.textAlign = 'center';
  g.fillText('搖一搖再喝', 128, 186);
  return tex(c);
}

// 茶桶標籤
export function urnLabelTex(name, color) {
  const c = canvas(256, 160), g = c.getContext('2d');
  g.fillStyle = '#fffaf0'; rr(g, 6, 6, 244, 148, 22); g.fill();
  g.fillStyle = color; rr(g, 16, 16, 224, 128, 16); g.fill();
  g.fillStyle = '#fffaf0'; g.font = `84px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 128, 84);
  return tex(c);
}

// 小標籤（料槽、冰桶、果糖機）
export function tagTex(text, { bg = PALETTE.brown, fg = '#fffaf0', w = 256, h = 96 } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; rr(g, 4, 4, w - 8, h - 8, h * 0.3); g.fill();
  g.fillStyle = fg; g.font = `${h * 0.56}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  return tex(c);
}

// 價目燈箱（店內側牆）
export function menuTex() {
  const c = canvas(1024, 640), g = c.getContext('2d');
  g.fillStyle = '#fbf3e4'; g.fillRect(0, 0, 1024, 640);
  g.fillStyle = PALETTE.teal; g.fillRect(0, 0, 1024, 120);
  drawLogo(g, 80, 60, 44, { ring: '#fbf3e4', fill: PALETTE.teal, ink: '#fbf3e4' });
  g.fillStyle = '#fbf3e4'; g.font = `64px ${FONT}`; g.textBaseline = 'middle'; g.fillText('晃晃茶舖　MENU', 150, 64);
  const items = [['紅茶', 35], ['綠茶', 35], ['奶茶', 50], ['珍珠紅茶', 45], ['椰果綠茶', 45], ['仙草綠茶', 45], ['珍珠奶茶', 60], ['仙草奶茶', 60]];
  g.font = `46px ${FONT}`;
  items.forEach(([n, p], i) => {
    const col = i % 2, row = (i / 2) | 0, x = 60 + col * 500, y = 190 + row * 104;
    g.fillStyle = PALETTE.brown; g.textAlign = 'left'; g.fillText(n, x, y);
    g.fillStyle = PALETTE.orange; g.textAlign = 'right'; g.fillText(String(p), x + 420, y);
    g.strokeStyle = 'rgba(62,38,24,.15)'; g.setLineDash([4, 8]); g.beginPath(); g.moveTo(x, y + 40); g.lineTo(x + 420, y + 40); g.stroke(); g.setLineDash([]);
  });
  return tex(c);
}

// 配方表（貼在右牆，跟真的手搖店一樣）
export function recipeTex(menu) {
  const c = canvas(1024, 1000), g = c.getContext('2d');
  g.fillStyle = '#fffaf0'; g.fillRect(0, 0, 1024, 1000);
  g.fillStyle = PALETTE.teal; g.fillRect(0, 0, 1024, 110);
  g.fillStyle = '#fffaf0'; g.font = `56px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText('標準配方　大杯 700cc', 40, 58);
  const sec = (y, title) => { g.fillStyle = PALETTE.orange; g.fillRect(40, y - 24, 10, 48); g.fillStyle = PALETTE.brown; g.font = `42px ${FONT}`; g.fillText(title, 64, y); };
  const row = (x, y, k, v, w = 130) => { g.font = `36px ${FONT}`; g.fillStyle = PALETTE.brown; g.fillText(k, x, y); g.fillStyle = PALETTE.teal; g.fillText(v, x + w, y); };
  sec(160, '甜度：果糖 cc（按住果糖機，看面板 cc 數）');
  menu.sweet.slice().reverse().forEach((s, i) => row(80 + (i % 3) * 310, 222 + ((i / 3) | 0) * 54, s.name, `${s.v}cc`, 100));
  sec(345, '冰量（一顆約 25g，一鏟約 200g）');
  menu.ice.forEach((s, i) => row(80, 405 + i * 54, s.name, s.recipe, 190));
  sec(700, '茶、加料、出杯');
  g.font = `36px ${FONT}`; g.fillStyle = PALETTE.brown;
  g.fillText('茶加到杯子上的 8 分線（冰越少，茶越多）', 80, 762);
  g.fillText('加料一勺約 60g　→　封膜　→　搖 10 下　→　出杯', 80, 818);
  g.fillStyle = 'rgba(62,38,24,.55)'; g.font = `30px ${FONT}`;
  g.fillText('去冰：先加一鏟冰、倒茶冰鎮，再用空冰鏟把冰刮掉，茶補到 8 分線', 80, 890);
  g.fillText('少糖 70%・半糖 50%・微糖 30%（以全糖 40cc 為準）', 80, 940);
  return tex(c);
}

// 客人的臉：大眼、腮紅、小嘴。expr 決定表情。
const faceCache = new Map();
export function faceTex(expr = 'neutral', { eye = 'round', blush = true, lash = false, brow = '#2a1a12' } = {}) {
  const key = `${expr}|${eye}|${blush}|${lash}|${brow}`;
  if (faceCache.has(key)) return faceCache.get(key);
  const c = canvas(256, 256), g = c.getContext('2d');
  const ink = '#24160f';
  g.lineCap = 'round'; g.lineJoin = 'round';
  const L = 84, Rx = 172, ey = 134;
  // 腮紅
  if (blush) {
    for (const x of [L - 14, Rx + 14]) {
      const gr = g.createRadialGradient(x, ey + 34, 0, x, ey + 34, 26);
      gr.addColorStop(0, expr === 'angry' ? 'rgba(230,70,60,.55)' : 'rgba(240,120,110,.42)'); gr.addColorStop(1, 'rgba(240,120,110,0)');
      g.fillStyle = gr; g.fillRect(x - 30, ey + 4, 60, 60);
    }
  }
  const eyeShape = (x, open) => {
    g.fillStyle = ink;
    if (expr === 'blink' || open === 0) { g.strokeStyle = ink; g.lineWidth = 6; g.beginPath(); g.moveTo(x - 12, ey + 2); g.quadraticCurveTo(x, ey + 9, x + 12, ey + 2); g.stroke(); return; }
    if (expr === 'happy') { g.strokeStyle = ink; g.lineWidth = 7; g.beginPath(); g.moveTo(x - 13, ey + 6); g.quadraticCurveTo(x, ey - 12, x + 13, ey + 6); g.stroke(); return; }
    if (expr === 'smug') { g.beginPath(); g.ellipse(x, ey + 4, 11, 7, 0, 0, 7); g.fill(); g.fillStyle = '#f8efe5'; g.fillRect(x - 13, ey - 6, 26, 7); g.strokeStyle = ink; g.lineWidth = 5; g.beginPath(); g.moveTo(x - 14, ey - 1); g.lineTo(x + 14, ey - 1); g.stroke(); return; }
    const rx = eye === 'narrow' ? 13 : 14.5, ry = expr === 'shock' ? 23 : eye === 'narrow' ? 15 : 19;
    g.beginPath(); g.ellipse(x, ey, rx, ry, 0, 0, 7); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(x + 4, ey - ry * 0.38, 4.6, 0, 7); g.fill();
    g.globalAlpha = 0.6; g.beginPath(); g.arc(x - 3, ey + ry * 0.4, 1.8, 0, 7); g.fill(); g.globalAlpha = 1;
    if (lash) { g.strokeStyle = ink; g.lineWidth = 4; g.beginPath(); g.moveTo(x + (x < 128 ? -10 : 10), ey - 9); g.lineTo(x + (x < 128 ? -17 : 17), ey - 15); g.stroke(); }
  };
  eyeShape(L, 1); eyeShape(Rx, 1);
  // 眉毛
  g.strokeStyle = brow; g.lineWidth = 8;
  const browY = ey - 36;
  const brows = {
    neutral: [[-14, 0], [14, -2]], happy: [[-14, -2], [14, -4]], blink: [[-14, 0], [14, -2]],
    angry: [[-14, -8], [14, 6]], shock: [[-14, -10], [14, -12]], smug: [[-14, -2], [14, 4]], sad: [[-14, 6], [14, -6]], talk: [[-14, -1], [14, -3]],
  }[expr] || [[-14, 0], [14, -2]];
  for (const [x, flip] of [[L, 1], [Rx, -1]]) {
    const [[ax, ay], [bx, by]] = brows;
    g.beginPath();
    g.moveTo(x + ax * flip, browY + (flip > 0 ? ay : by));
    g.lineTo(x + bx * flip, browY + (flip > 0 ? by : ay));
    g.stroke();
  }
  // 嘴
  g.strokeStyle = ink; g.fillStyle = '#7a2a22'; g.lineWidth = 6;
  const my = ey + 50, mx = 128;
  g.beginPath();
  switch (expr) {
    case 'happy': g.moveTo(mx - 16, my - 4); g.quadraticCurveTo(mx, my + 18, mx + 16, my - 4); g.closePath(); g.fill(); g.stroke(); break;
    case 'talk': g.ellipse(mx, my + 2, 9, 8, 0, 0, 7); g.fill(); g.stroke(); break;
    case 'shock': g.ellipse(mx, my + 4, 10, 13, 0, 0, 7); g.fill(); g.stroke(); break;
    case 'angry': g.moveTo(mx - 14, my + 6); g.quadraticCurveTo(mx, my - 8, mx + 14, my + 6); g.stroke(); break;
    case 'sad': g.moveTo(mx - 12, my + 6); g.quadraticCurveTo(mx, my - 2, mx + 12, my + 6); g.stroke(); break;
    case 'smug': g.moveTo(mx - 14, my + 2); g.quadraticCurveTo(mx + 4, my + 8, mx + 16, my - 6); g.stroke(); break;
    default: g.moveTo(mx - 9, my + 1); g.quadraticCurveTo(mx, my + 7, mx + 9, my + 1); g.stroke();
  }
  const t = tex(c);
  faceCache.set(key, t);
  return t;
}
