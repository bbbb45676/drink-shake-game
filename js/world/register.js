import * as THREE from 'three';
import { RoundedBoxGeometry } from '../gfx/builder.js';
import { canvas, tex, tagTex } from '../gfx/textures.js';
import { L, FONT } from '../config.js';

const Y = L.counterY;

// 新台幣：鈔票與硬幣
export const DENOMS = [
  { v: 1000, bill: true, color: '#6f8fc4', name: '1000' },
  { v: 500, bill: true, color: '#b07a45', name: '500' },
  { v: 100, bill: true, color: '#cf5a4f', name: '100' },
  { v: 50, bill: false, color: '#e2bf55', r: 0.0135, name: '50' },
  { v: 10, bill: false, color: '#cfc7b4', r: 0.0128, name: '10' },
  { v: 5, bill: false, color: '#d8d2c4', r: 0.0112, name: '5' },
  { v: 1, bill: false, color: '#c98b55', r: 0.0100, name: '1' },
];
export const denomInfo = (v) => DENOMS.find((d) => d.v === v);

const billGeo = new THREE.BoxGeometry(0.074, 0.0025, 0.036);
const coinGeos = {};
const matCache = {};
const moneyMat = (d) => (matCache[d.v] ||= new THREE.MeshStandardMaterial({ color: d.color, roughness: d.bill ? 0.8 : 0.35, metalness: d.bill ? 0 : 0.8 }));

// 一疊錢的模型（手上、找零盤上）
export function moneyStack(pieces, group) {
  while (group.children.length) group.remove(group.children[0]);
  const sorted = [...pieces].sort((a, b) => b - a);
  let by = 0, cy = 0, ci = 0;
  for (const v of sorted) {
    const d = denomInfo(v);
    if (d.bill) {
      const m = new THREE.Mesh(billGeo, moneyMat(d));
      m.position.set(0, by, 0); m.rotation.y = (by * 40) % 0.3; by += 0.0028; group.add(m);
    } else {
      const g = (coinGeos[v] ||= new THREE.CylinderGeometry(d.r, d.r, 0.0026, 18));
      const m = new THREE.Mesh(g, moneyMat(d));
      m.position.set(0.028 + (ci % 2) * 0.022, cy, 0.006); cy += ci % 2 ? 0.0028 : 0; ci++;
      group.add(m);
    }
  }
  return group;
}

// 收銀機：櫃台中間。抽屜有 1000／500／100 鈔票格和 50／10／5／1 硬幣格
export class Register {
  constructor(scene, phys, M, proxies) {
    const { x, z } = L.register;
    this.x = x; this.z = z;
    const g = new THREE.Group(); g.position.set(x, Y, z); scene.add(g);
    const body = new THREE.MeshStandardMaterial({ color: '#33373b', roughness: 0.5 });
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.06, 0.22, 2, 0.008), body);
    base.position.set(0, 0.03, 0); base.castShadow = base.receiveShadow = true; g.add(base);
    // 收銀機頭：鍵盤＋螢幕
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.05, 0.12, 2, 0.01), body);
    head.position.set(0, 0.085, -0.04); head.rotation.x = 0.25; head.castShadow = true; g.add(head);
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshStandardMaterial({ map: keypadTex(), roughness: 0.6 }));
    keys.position.set(-0.05, 0.112, -0.03); keys.rotation.x = -Math.PI / 2 + 0.25; g.add(keys);
    // 螢幕（給店員看）
    this.lcdC = canvas(512, 160); this.lcdTex = tex(this.lcdC);
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.047), new THREE.MeshBasicMaterial({ map: this.lcdTex }));
    lcd.position.set(0.0, 0.16, -0.1); lcd.rotation.x = -0.35; g.add(lcd);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.012), body);
    pole.position.set(0, 0.14, -0.106); pole.rotation.x = -0.35; g.add(pole);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.03), new THREE.MeshStandardMaterial({ map: tagTex('收銀機', { bg: '#555b62' }), roughness: 0.5 }));
    tag.position.set(0.1, 0.112, -0.03); tag.rotation.x = -Math.PI / 2 + 0.25; g.add(tag);
    this.setDisplay(null);

    // 抽屜：往店員這邊滑出來
    this.drawer = new THREE.Group(); g.add(this.drawer);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.17), new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 0.6 }));
    tray.position.y = 0.02; tray.receiveShadow = true; this.drawer.add(tray);
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.05, 0.012), body);
    front.position.set(0, 0.025, 0.088); this.drawer.add(front);
    this.slots = [];
    const bills = DENOMS.filter((d) => d.bill), coins = DENOMS.filter((d) => !d.bill);
    const addSlot = (d, sx, sz, w, dpt) => {
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.006, 0.002, dpt - 0.006), new THREE.MeshStandardMaterial({ color: '#1b1d1f', roughness: 0.8 }));
      floor.position.set(sx, 0.041, sz); this.drawer.add(floor);
      const stack = new THREE.Group(); stack.position.set(sx - (d.bill ? 0 : 0.028), 0.043, sz - (d.bill ? 0 : 0.006)); this.drawer.add(stack);
      moneyStack(d.bill ? [d.v, d.v, d.v] : [d.v, d.v, d.v, d.v], stack);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.012), new THREE.MeshBasicMaterial({ map: smallLabel(d.name) }));
      lab.rotation.x = -Math.PI / 2; lab.position.set(sx, 0.0425, sz + dpt / 2 - 0.009); this.drawer.add(lab);
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, dpt));
      p.userData = { kind: 'cashSlot', denom: d.v };
      this.slots.push({ d, sx, sz, p });
      proxies.push(p);
    };
    bills.forEach((d, i) => addSlot(d, -0.1 + i * 0.1, -0.04, 0.1, 0.075));
    coins.forEach((d, i) => addSlot(d, -0.114 + i * 0.076, 0.039, 0.076, 0.075));
    // 收銀機本體（按一下＝開／關抽屜）
    this.bodyProxy = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.12));
    this.bodyProxy.position.set(x, Y + 0.07, z - 0.05); this.bodyProxy.userData = { kind: 'register' }; this.bodyProxy.updateMatrixWorld(true);
    proxies.push(this.bodyProxy);
    phys.fixedBox(x, Y + 0.03, z, 0.17, 0.03, 0.11);
    this.open = false; this.k = 0;
    this.placeSlots();

    // 找零盤：窗口出餐台上
    const tp = L.changeTray;
    this.trayPos = new THREE.Vector3(tp.x, L.ledge.y, tp.z);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.012, 32), new THREE.MeshStandardMaterial({ color: '#2f6f69', roughness: 0.45 }));
    dish.position.set(tp.x, L.ledge.y + 0.006, tp.z); dish.castShadow = dish.receiveShadow = true; scene.add(dish);
    const dl = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.022), new THREE.MeshStandardMaterial({ map: tagTex('找零', { bg: '#2f6f69' }), roughness: 0.5 }));
    dl.rotation.x = -Math.PI / 2; dl.position.set(tp.x, L.ledge.y + 0.0125, tp.z + 0.05); scene.add(dl);
    this.trayMoney = new THREE.Group(); this.trayMoney.position.set(tp.x - 0.012, L.ledge.y + 0.014, tp.z - 0.01); scene.add(this.trayMoney);
    this.trayProxy = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12));
    this.trayProxy.position.set(tp.x, L.ledge.y + 0.02, tp.z); this.trayProxy.userData = { kind: 'tray' }; this.trayProxy.updateMatrixWorld(true);
    proxies.push(this.trayProxy);
  }

  setTray(pieces) { moneyStack(pieces || [], this.trayMoney); }

  setDisplay(info) {
    const g = this.lcdC.getContext('2d');
    g.fillStyle = '#16302c'; g.fillRect(0, 0, 512, 160);
    g.fillStyle = '#8df2c9'; g.font = `44px ${FONT}`; g.textBaseline = 'middle';
    if (!info) { g.textAlign = 'center'; g.fillText('晃晃茶舖', 256, 80); }
    else {
      g.textAlign = 'left';
      g.fillText(`應收 ${info.price}`, 24, 48);
      if (info.paid != null) g.fillText(`收 ${info.paid}`, 280, 48);
      if (info.change != null) { g.fillStyle = '#ffe28a'; g.font = `52px ${FONT}`; g.fillText(`找 ${info.change}`, 24, 116); }
    }
    this.lcdTex.needsUpdate = true;
  }

  placeSlots() {
    const out = this.k * 0.13;
    this.drawer.position.set(0, 0, out);
    for (const s of this.slots) {
      if (this.k > 0.9) s.p.position.set(this.x + s.sx, Y + 0.045, this.z + s.sz + out);
      else s.p.position.set(0, -20, 0); // 抽屜關著：點不到格子
      s.p.updateMatrixWorld(true);
    }
  }

  update(dt) {
    const t = this.open ? 1 : 0;
    if (Math.abs(this.k - t) > 0.001) {
      this.k += (t - this.k) * Math.min(1, dt * 12);
      if (Math.abs(this.k - t) < 0.01) this.k = t;
      this.placeSlots();
    }
  }

  // 手在哪一格上面（抽屜開著）
  slotAt(p) {
    if (this.k < 0.9) return null;
    const out = this.k * 0.13;
    for (const s of this.slots) {
      const w = s.d.bill ? 0.05 : 0.038;
      if (Math.abs(p.x - (this.x + s.sx)) < w && Math.abs(p.z - (this.z + s.sz + out)) < 0.0375 && p.y < Y + 0.16) return s.d.v;
    }
    return null;
  }
  overTray(p) { return Math.hypot(p.x - this.trayPos.x, p.z - this.trayPos.z) < 0.11 && p.y > L.ledge.y - 0.05 && p.y < L.ledge.y + 0.25; }
  overRegister(p) { return Math.abs(p.x - this.x) < 0.2 && p.z > this.z - 0.13 && p.z < this.z + 0.11 + this.k * 0.13 && p.y < Y + 0.25; }
}

function keypadTex() {
  const c = canvas(256, 128), g = c.getContext('2d');
  g.fillStyle = '#2b2f33'; g.fillRect(0, 0, 256, 128);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) {
    g.fillStyle = k === 5 ? (r === 3 ? '#d4423a' : '#e0a53a') : '#d9dcd6';
    g.fillRect(10 + k * 41, 8 + r * 30, 34, 24);
  }
  return tex(c);
}
function smallLabel(t) {
  const c = canvas(96, 40), g = c.getContext('2d');
  g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, 96, 40);
  g.fillStyle = '#222'; g.font = `bold 28px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(t, 48, 21);
  return tex(c);
}
