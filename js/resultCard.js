import { CONFIG, PALETTE, FONT } from './config.js';
import { rr, drawLogo } from './gfx/textures.js';

export const CARD_W = 1080, CARD_H = 1350;

export function titleFor(score) {
  return CONFIG.titles.find((t) => score >= t.min);
}

// 下班結算卡（4:5）：背景是這一班最後的 3D 畫面
export function drawCard(bg, { score, stats, money }) {
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const g = c.getContext('2d');
  const { cream, brown, teal, orange, red, paper } = PALETTE;

  g.fillStyle = brown; g.fillRect(0, 0, CARD_W, CARD_H);
  if (bg) {
    // 裁成 4:5 的中間
    const r = bg.width / bg.height, R = CARD_W / CARD_H;
    let sw = bg.width, sh = bg.height, sx = 0, sy = 0;
    if (r > R) { sw = bg.height * R; sx = (bg.width - sw) / 2; } else { sh = bg.width / R; sy = (bg.height - sh) * 0.3; }
    g.drawImage(bg, sx, sy, sw, sh, 0, 0, CARD_W, CARD_H);
  }
  const top = g.createLinearGradient(0, 0, 0, 460);
  top.addColorStop(0, 'rgba(40,24,16,.9)'); top.addColorStop(1, 'rgba(40,24,16,0)');
  g.fillStyle = top; g.fillRect(0, 0, CARD_W, 460);

  // 店名小標
  g.font = `34px ${FONT}`;
  const tag = `${CONFIG.shop.name}・下班結算`;
  const tw = g.measureText(tag).width + 110;
  g.fillStyle = cream; rr(g, (CARD_W - tw) / 2, 54, tw, 64, 32); g.fill();
  drawLogo(g, (CARD_W - tw) / 2 + 36, 86, 22);
  g.fillStyle = brown; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(tag, CARD_W / 2 + 22, 88);

  // 標題
  g.font = `82px ${FONT}`; g.lineJoin = 'round';
  for (const [t, y] of [['這樣可以去應徵', 196], ['飲料店嗎？', 294]]) {
    g.lineWidth = 18; g.strokeStyle = brown; g.strokeText(t, CARD_W / 2, y);
    g.fillStyle = cream; g.fillText(t, CARD_W / 2, y);
  }

  // 下方卡片
  const px = 54, py = 760, pw = CARD_W - 108, ph = 536;
  g.save(); g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 40; g.shadowOffsetY = 12;
  g.fillStyle = paper; rr(g, px, py, pw, ph, 40); g.fill(); g.restore();

  const t = titleFor(score);
  g.save();
  g.translate(CARD_W / 2, py + 2); g.rotate(-0.05);
  g.font = `92px ${FONT}`;
  const sw = g.measureText(t.name).width + 96;
  g.fillStyle = score >= 500 ? teal : score >= 150 ? orange : red;
  rr(g, -sw / 2, -76, sw, 148, 30); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#fff'; rr(g, -sw / 2 + 12, -64, sw - 24, 124, 22); g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t.name, 0, 2);
  g.restore();

  g.fillStyle = brown; g.textAlign = 'center';
  g.font = `34px ${FONT}`; g.fillText(t.line, CARD_W / 2, py + 132);
  g.font = `30px ${FONT}`; g.globalAlpha = 0.6;
  const mtxt = money ? `　·　老闆${money.net < 0 ? '虧' : '賺'}了 NT$${Math.abs(money.net)}` : '';
  g.fillText(`分數 ${score}${mtxt}`, CARD_W / 2, py + 180); g.globalAlpha = 1;

  const items = [
    ['出餐', stats.served, '杯'],
    ['全對', stats.perfect, '杯'],
    ['趕走奧客', stats.repelled, '位'],
    ['誤砸好客', stats.hitGood, '位'],
    ['灑掉', Math.round(stats.waste * 10) / 10, '杯'],
  ];
  const gap = 14, cols = 5, iw = (pw - 60 - gap * (cols - 1)) / cols;
  items.forEach(([label, n, unit], i) => {
    const x = px + 30 + i * (iw + gap), y = py + 222;
    g.fillStyle = '#f3e9d8'; rr(g, x, y, iw, 230, 26); g.fill();
    const hot = (label === '趕走奧客' && n > 0);
    const bad = (label === '誤砸好客' || label === '灑掉') && n > 0;
    g.fillStyle = hot ? teal : bad ? red : brown;
    g.font = `${String(n).length > 3 ? 70 : 92}px ${FONT}`; g.textBaseline = 'alphabetic';
    g.fillText(String(n), x + iw / 2, y + 128);
    g.font = `26px ${FONT}`; g.fillStyle = brown; g.globalAlpha = 0.55; g.fillText(unit, x + iw / 2, y + 166);
    g.globalAlpha = 1; g.font = `${label.length > 3 ? 26 : 30}px ${FONT}`; g.fillText(label, x + iw / 2, y + 208);
  });
  g.textBaseline = 'middle'; g.font = `28px ${FONT}`; g.fillStyle = brown; g.globalAlpha = 0.5;
  g.fillText('手搖飲搖搖樂：奧客退散！', CARD_W / 2, py + ph - 44);
  g.globalAlpha = 1;
  return c;
}
