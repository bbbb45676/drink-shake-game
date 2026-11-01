import * as THREE from 'three';
import { RoundedBoxGeometry } from '../gfx/builder.js';
import { PALETTE } from '../config.js';

// 兩隻浮空的手。模型原點在掌心；手指朝 -z，掌心朝 -y。
const POSES = {
  open: { f: [0.1, 0.08, 0.1, 0.14], t: 0.1, spread: 1 },
  hover: { f: [0.22, 0.2, 0.24, 0.3], t: 0.25, spread: 0.6 },
  point: { f: [0.0, 1.0, 1.05, 1.05], t: 0.75, spread: 0.2 },
  grip: { f: [0.95, 0.95, 0.95, 0.95], t: 0.55, spread: 0.1 },
  fist: { f: [1.2, 1.25, 1.25, 1.25], t: 0.9, spread: 0 },
  pinch: { f: [0.55, 0.75, 0.95, 1.05], t: 0.75, spread: 0.2 },
};

export class HandModel {
  constructor(side, scene) {
    this.side = side; // -1 左、+1 右
    const skin = new THREE.MeshPhysicalMaterial({ color: '#f1c7a3', roughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color('#ffd9c4'), sheenRoughness: 0.5 });
    this.skin = skin;
    const sleeve = new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: 0.75 });
    const cuffM = new THREE.MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.7 });
    this.root = new THREE.Group();
    const add = (m, parent = this.root) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    // 手掌
    const palm = add(new THREE.Mesh(new RoundedBoxGeometry(0.084, 0.03, 0.09, 3, 0.014), skin));
    palm.position.set(0, 0, 0);
    // 手腕＋袖子
    const wrist = add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.05, 14), skin));
    wrist.rotation.x = Math.PI / 2; wrist.position.set(0, 0.002, 0.058); wrist.scale.set(1.15, 1, 0.8);
    // 制服色的袖口環＋圓圓的手腕收尾（浮空的手，不接手臂）
    const cf = add(new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.009, 10, 24), sleeve));
    cf.position.set(0, 0.003, 0.074); cf.scale.set(1.12, 0.85, 1);
    const cf2 = add(new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.004, 8, 24), cuffM));
    cf2.position.set(0, 0.003, 0.064); cf2.scale.set(1.12, 0.85, 1);
    const end = add(new THREE.Mesh(new THREE.SphereGeometry(0.027, 16, 10), skin));
    end.position.set(0, 0.003, 0.082); end.scale.set(1.12, 0.82, 0.7);
    // 手指
    const fx = [-0.029, -0.0095, 0.0095, 0.028].map((v) => -side * v);
    const len = [[0.04, 0.034], [0.044, 0.038], [0.041, 0.035], [0.032, 0.028]];
    const rad = [0.0098, 0.0102, 0.0096, 0.0086];
    this.fingers = [];
    for (let i = 0; i < 4; i++) {
      const j1 = new THREE.Group(); j1.position.set(fx[i], -0.002, -0.04 + (i === 3 ? 0.008 : i === 0 ? 0.002 : 0)); this.root.add(j1);
      const seg = (l, r) => { const g = new THREE.CapsuleGeometry(r, l, 4, 10); g.rotateX(-Math.PI / 2); g.translate(0, 0, -l / 2); return g; };
      add(new THREE.Mesh(seg(len[i][0], rad[i]), skin), j1);
      const j2 = new THREE.Group(); j2.position.z = -len[i][0]; j1.add(j2);
      add(new THREE.Mesh(seg(len[i][1], rad[i] * 0.93), skin), j2);
      this.fingers.push({ j1, j2, base: fx[i] });
    }
    // 大拇指
    const tb = new THREE.Group(); tb.position.set(-side * 0.04, -0.006, -0.002); this.root.add(tb);
    const tseg = (l, r) => { const g = new THREE.CapsuleGeometry(r, l, 4, 10); g.rotateX(-Math.PI / 2); g.translate(0, 0, -l / 2); return g; };
    add(new THREE.Mesh(tseg(0.032, 0.012), skin), tb);
    const tb2 = new THREE.Group(); tb2.position.z = -0.032; tb.add(tb2);
    add(new THREE.Mesh(tseg(0.026, 0.011), skin), tb2);
    this.thumb = { tb, tb2 };
    this.cur = { ...POSES.hover, f: [...POSES.hover.f] };
    // 拿冰塊時顯示在指尖
    this.ice = new THREE.Mesh(new RoundedBoxGeometry(0.024, 0.024, 0.024, 2, 0.005), new THREE.MeshPhysicalMaterial({ color: '#eaf6ff', roughness: 0.05, transparent: true, opacity: 0.65, clearcoat: 1 }));
    this.ice.position.set(-side * 0.006, -0.036, -0.03); this.ice.visible = false; this.root.add(this.ice);
    this.root.scale.setScalar(0.88);
    scene.add(this.root);
  }

  setPose(name, dt) {
    const p = POSES[name] || POSES.hover;
    const k = Math.min(1, dt * 18);
    for (let i = 0; i < 4; i++) this.cur.f[i] += (p.f[i] - this.cur.f[i]) * k;
    this.cur.t += (p.t - this.cur.t) * k;
    this.cur.spread += (p.spread - this.cur.spread) * k;
    this.fingers.forEach((f, i) => {
      const c = this.cur.f[i];
      f.j1.rotation.x = -c * 1.15;
      f.j2.rotation.x = -c * 1.25;
      f.j1.rotation.y = (i - 1.5) * 0.09 * this.cur.spread * -this.side;
    });
    const t = this.cur.t;
    this.thumb.tb.rotation.set(-0.25 - t * 0.5, this.side * (0.75 - t * 0.55), this.side * t * 0.9);
    this.thumb.tb2.rotation.x = -t * 0.9;
  }
}

// ---------------- 輸入 → 兩隻手 ----------------
// 手機：一根手指一隻手（最多兩根）。電腦：左鍵＝左手、右鍵＝右手（或 Z／X），滑鼠移動「最後按下的那隻手」。
export class HandsInput {
  constructor(el, hands, cb) {
    this.el = el; this.hands = hands; this.cb = cb;
    this.cursor = { x: innerWidth / 2, y: innerHeight * 0.7, seen: false };
    this.mouseOrder = []; // 按住中的手（滑鼠／鍵盤），後按的在後面
    this.hoverHand = hands[1];
    this.enabled = false;
    const opt = { passive: false };
    el.addEventListener('pointerdown', (e) => this.pDown(e), opt);
    addEventListener('pointermove', (e) => this.pMove(e), opt);
    addEventListener('pointerup', (e) => this.pUp(e), opt);
    addEventListener('pointercancel', (e) => this.pUp(e), opt);
    el.addEventListener('mousedown', (e) => this.mDown(e));
    addEventListener('mouseup', (e) => this.mUp(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    addEventListener('blur', () => this.releaseAll());
  }

  releaseAll() {
    for (const h of this.hands) if (h.pressed) this.release(h);
    this.mouseOrder = [];
  }

  // 觸控
  pDown(e) {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    if (!this.enabled) return;
    const free = this.hands.filter((h) => h.ptr == null);
    if (!free.length) return;
    let h = free[0];
    if (free.length === 2) h = e.clientX < innerWidth / 2 ? this.hands[0] : this.hands[1];
    h.ptr = e.pointerId; h.touch = true;
    h.sx = e.clientX; h.sy = e.clientY; h.ox = h.oy = 0; h.moved = true;
    this.press(h);
  }
  pMove(e) {
    if (e.pointerType === 'mouse') { this.mouseMove(e); return; }
    const h = this.hands.find((h) => h.ptr === e.pointerId);
    if (!h) return;
    e.preventDefault();
    h.sx = e.clientX; h.sy = e.clientY; h.moved = true;
  }
  pUp(e) {
    if (e.pointerType === 'mouse') return;
    const h = this.hands.find((h) => h.ptr === e.pointerId);
    if (!h) return;
    h.ptr = null; h.touch = false;
    this.release(h);
  }

  // 滑鼠
  mouseMove(e) {
    const dx = e.clientX - this.cursor.x, dy = e.clientY - this.cursor.y;
    this.cursor.x = e.clientX; this.cursor.y = e.clientY; this.cursor.seen = true;
    const ctrl = this.mouseOrder[this.mouseOrder.length - 1];
    if (ctrl) { ctrl.sx += dx; ctrl.sy += dy; ctrl.moved = true; return; }
    // 沒按：游標在哪半邊，就由那隻手跟著（有一點緩衝）
    const x = e.clientX / innerWidth;
    if (x < 0.38) this.hoverHand = this.hands[0];
    else if (x > 0.62) this.hoverHand = this.hands[1];
    for (const h of this.hands) if (!h.pressed && h.ptr == null) h.hovering = h === this.hoverHand;
    if (this.hoverHand.ptr == null && !this.hoverHand.pressed) { const hh = this.hoverHand; hh.sx = e.clientX; hh.sy = e.clientY; hh.ox = hh.oy = 0; hh.active = true; hh.moved = true; }
  }
  mDown(e) {
    if (!this.enabled) return;
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    this.mousePress(e.button === 0 ? this.hands[0] : this.hands[1]);
  }
  mUp(e) {
    if (e.button !== 0 && e.button !== 2) return;
    this.mouseRelease(e.button === 0 ? this.hands[0] : this.hands[1]);
  }
  key(e, down) {
    if (e.repeat) return;
    const k = e.code;
    const h = k === 'KeyZ' ? this.hands[0] : k === 'KeyX' ? this.hands[1] : null;
    if (!h) return;
    if (down) { if (this.enabled) this.mousePress(h); } else this.mouseRelease(h);
  }
  mousePress(h) {
    if (h.pressed || h.ptr != null) return;
    const prev = this.mouseOrder[this.mouseOrder.length - 1];
    if (!prev) {
      // 第一隻：飛到游標的位置抓
      h.sx = this.cursor.x; h.sy = this.cursor.y;
    } else {
      // 第二隻：從游標位置出發，之後滑鼠改動這隻手；前一隻手停在原地繼續抓著
      h.sx = this.cursor.x; h.sy = this.cursor.y;
    }
    h.ox = h.oy = 0; h.moved = true;
    h.mouse = true;
    this.mouseOrder.push(h);
    this.press(h);
  }
  mouseRelease(h) {
    const i = this.mouseOrder.indexOf(h);
    if (i < 0) return;
    this.mouseOrder.splice(i, 1);
    h.mouse = false;
    this.release(h);
    // 控制權回到還按著的那隻手：用相對移動，不會瞬移
    const ctrl = this.mouseOrder[this.mouseOrder.length - 1];
    if (!ctrl) { this.hoverHand = h; h.hovering = true; }
  }

  press(h) { h.pressed = true; h.active = true; h.idle = 0; this.cb.press(h); }
  release(h) { if (!h.pressed) return; h.pressed = false; h.idle = 0; this.cb.release(h); }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export { POSES };
