import * as THREE from 'three';
import { RoundedBoxGeometry } from '../gfx/builder.js';
import { urnLabelTex, tagTex, filmTex, rng } from '../gfx/textures.js';
import { L, CUP, CONFIG, PALETTE, FONT } from '../config.js';
import { GROUPS } from '../play/physics.js';

const Y = L.counterY;
const teaById = (id) => CONFIG.menu.teas.find((t) => t.id === id);

// 液柱：從出水口流到下面的東西
export class Stream {
  constructor(scene, color, radius = 0.0055) {
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.8 });
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    geo.translate(0, -0.5, 0);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.visible = false;
    this.r = radius;
    scene.add(this.mesh);
    this.t = 0;
  }
  show(top, bottomY, dt, k = 1) {
    this.t += dt;
    const len = Math.max(0.005, top.y - bottomY);
    this.mesh.visible = true;
    this.mesh.position.copy(top);
    const w = this.r * k * (1 + Math.sin(this.t * 40) * 0.08);
    this.mesh.scale.set(w, len, w);
  }
  hide() { this.mesh.visible = false; }
}

function steelLathe(points, segs = 40) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

// 杯子要放哪裡：台面上一個彩色圈（茶桶、果糖機底下）
function cupRing(scene, x, z, color) {
  const r = CUP.rBot + 0.004;
  const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.007, 40), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(x, Y + 0.0012, z);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  dot.rotation.x = -Math.PI / 2; dot.position.set(x, Y + 0.001, z);
  ring.receiveShadow = true;
  scene.add(ring, dot);
  return ring;
}

// ---------------- 茶桶 ----------------
export class Urn {
  constructor(scene, phys, M, proxies, { tea, x }) {
    this.tea = tea;
    this.open = false;
    this.flow = 0; // 0~1，開關動畫
    const z = L.urnZ, base = Y + L.urnStand;
    const g = new THREE.Group();
    g.position.set(x, base, z);
    scene.add(g);
    const body = new THREE.Mesh(steelLathe([[0, 0], [0.098, 0], [0.106, 0.012], [0.106, 0.33], [0.1, 0.345], [0.086, 0.352], [0.09, 0.36], [0.07, 0.38], [0.02, 0.392], [0, 0.393]]), M.steel);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    // 兩道加強環
    for (const y of [0.06, 0.29]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.107, 0.004, 8, 40), M.steelDark);
      ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 10), M.black);
    knob.position.y = 0.4; knob.scale.y = 0.7; g.add(knob);
    // 側耳
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 8, 16, Math.PI), M.black);
      h.position.set(s * 0.11, 0.3, 0); h.rotation.set(0, s * Math.PI / 2, Math.PI / 2 * s); g.add(h);
    }
    // 標籤
    const info = teaById(tea);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.069), new THREE.MeshStandardMaterial({ map: urnLabelTex(info.name, info.label), roughness: 0.6 }));
    label.position.set(0, 0.2, 0.1075); g.add(label);
    // 水龍頭
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.085, 14), M.steel);
    spout.rotation.x = Math.PI / 2; spout.position.set(0, 0.035, 0.14); g.add(spout);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.007, 0.03, 12), M.steel);
    nozzle.position.set(0, 0.022, 0.178); g.add(nozzle);
    // 開關把手（往自己拉＝開）
    this.lever = new THREE.Group();
    this.lever.position.set(0, 0.048, 0.165);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.075, 10), M.black);
    stem.position.y = 0.037; this.lever.add(stem);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), new THREE.MeshStandardMaterial({ color: info.label, roughness: 0.35 }));
    tip.position.y = 0.078; this.lever.add(tip);
    stem.castShadow = tip.castShadow = true;
    g.add(this.lever);
    this.group = g;
    this.nozzle = new THREE.Vector3(x, base + 0.006, z + 0.178);

    phys.fixedCylinder(x, base + 0.19, z, 0.19, 0.106, { groups: GROUPS.machine });

    // 點開關的範圍（比把手大一點，手指好按）
    const pick = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6));
    pick.position.set(x, base + 0.09, z + 0.18); pick.userData = { kind: 'lever', urn: this }; pick.updateMatrixWorld(true);
    this.pickPos = pick.position.clone();
    proxies.push(pick);
    // 茶桶本體也擋手
    const blk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.4, 12));
    blk.position.set(x, base + 0.2, z); blk.userData = { kind: 'surface' }; blk.updateMatrixWorld(true);
    proxies.push(blk);

    this.stream = new Stream(scene, info.color);
    this.ring = cupRing(scene, x, this.nozzle.z, info.label);
  }
  toggle() { this.open = !this.open; return this.open; }
  update(dt) {
    this.flow += ((this.open ? 1 : 0) - this.flow) * Math.min(1, dt * 14);
    this.lever.rotation.x = this.flow * 1.05;
  }
}

// ---------------- 果糖機 ----------------
export class Syrup {
  constructor(scene, phys, M, proxies) {
    const { x, z } = L.syrup;
    const g = new THREE.Group(); g.position.set(x, Y, z); scene.add(g);
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.32, 0.2, 3, 0.02), M.steel);
    body.position.y = 0.16; body.castShadow = body.receiveShadow = true; g.add(body);
    // 液晶面板：平常顯示「果糖」，杯子在出口下面時顯示這杯的甜度
    this.lcd = document.createElement('canvas'); this.lcd.width = 256; this.lcd.height = 112;
    this.lcdTex = new THREE.CanvasTexture(this.lcd); this.lcdTex.colorSpace = THREE.SRGBColorSpace;
    this.setDisplay(null);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.057), new THREE.MeshStandardMaterial({ map: this.lcdTex, emissive: '#ffffff', emissiveMap: this.lcdTex, emissiveIntensity: 0.6, roughness: 0.3 }));
    panel.position.set(0, 0.25, 0.1005); g.add(panel);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.05, 12), M.steelDark);
    nozzle.position.set(0, 0.185, 0.145); g.add(nozzle);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.07), M.steelDark);
    arm.position.set(0, 0.2, 0.12); g.add(arm);
    // 大按鈕
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.04, 0.012, 24), M.black);
    ring.position.set(0, 0.326, 0.02); g.add(ring);
    this.btn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 24), M.orange);
    this.btn.position.set(0, 0.338, 0.02); this.btn.castShadow = true; g.add(this.btn);
    phys.fixedBox(x, Y + 0.16, z, 0.085, 0.16, 0.1, { groups: GROUPS.machine });
    this.nozzle = new THREE.Vector3(x, Y + 0.16, z + 0.145);
    this.ring = cupRing(scene, x, z + 0.145, PALETTE.orange);
    this.pressed = false; this.press = 0;

    const pick = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6));
    pick.position.set(x, Y + 0.34, z + 0.02); pick.userData = { kind: 'syrupBtn', station: this }; pick.updateMatrixWorld(true);
    proxies.push(pick);
    const blk = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.34, 0.2));
    blk.position.set(x, Y + 0.17, z); blk.userData = { kind: 'surface' }; blk.updateMatrixWorld(true);
    proxies.push(blk);

    this.stream = new Stream(scene, '#f2c76a', 0.0035);
    this.stream.mat.opacity = 0.75;
  }
  setDisplay(v) {
    const text = v == null ? '果糖' : `${v.toFixed(1)} cc`;
    if (text === this.lcdText) return;
    this.lcdText = text;
    const g = this.lcd.getContext('2d');
    g.fillStyle = '#1e1a17'; g.fillRect(0, 0, 256, 112);
    g.fillStyle = v == null ? '#ffb35c' : '#7dffb0';
    g.font = `${v == null ? 64 : 58}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 60);
    this.lcdTex.needsUpdate = true;
  }

  update(dt) {
    this.press += ((this.pressed ? 1 : 0) - this.press) * Math.min(1, dt * 20);
    this.btn.position.y = 0.338 - this.press * 0.01;
  }
}

// ---------------- 杯架（倒扣的杯子）----------------
export function buildCupStack(scene, M, proxies, cupShellGeo, cupMat) {
  const { x, z } = L.cupStack;
  const g = new THREE.Group(); g.position.set(x, Y, z); scene.add(g);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.02, 32), M.steelDark);
  base.position.y = 0.01; base.receiveShadow = base.castShadow = true; g.add(base);
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Mesh(cupShellGeo, cupMat);
    c.rotation.x = Math.PI; c.position.y = 0.02 + CUP.h + i * 0.022;
    c.renderOrder = 2;
    g.add(c);
  }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.42, 8), M.steel);
  rod.position.set(0.062, 0.21, -0.03); g.add(rod);
  const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.4, 10));
  pick.position.set(x, Y + 0.2, z); pick.userData = { kind: 'cupStack' }; pick.updateMatrixWorld(true);
  proxies.push(pick);
  return g;
}

// ---------------- 料槽＋勺子停放 ----------------
export class Wells {
  constructor(scene, M, proxies, topMats) {
    this.list = [];
    const R = rng(21);
    const depth = L.wellDepth;
    for (const w of L.wells) {
      const g = new THREE.Group(); g.position.set(w.x, Y, L.wellZ); scene.add(g);
      // 不鏽鋼方槽
      const W = L.wellW, D = L.wellD;
      const walls = [
        [W, depth, 0.004, 0, -depth / 2, D / 2], [W, depth, 0.004, 0, -depth / 2, -D / 2],
        [0.004, depth, D, W / 2, -depth / 2, 0], [0.004, depth, D, -W / 2, -depth / 2, 0],
      ];
      for (const [a, b, c, px, py, pz] of walls) { const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), M.steelInner); m.position.set(px, py, pz); m.receiveShadow = true; g.add(m); }
      // 槽口的不鏽鋼邊框（四條，不是蓋子）
      for (const [a, c, px, pz] of [[W + 0.012, 0.008, 0, D / 2 + 0.002], [W + 0.012, 0.008, 0, -D / 2 - 0.002], [0.008, D + 0.012, W / 2 + 0.002, 0], [0.008, D + 0.012, -W / 2 - 0.002, 0]]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(a, 0.006, c), M.steel); e.position.set(px, -0.002, pz); g.add(e);
      }
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M.steelInner); floor.rotation.x = -Math.PI / 2; floor.position.y = -depth; g.add(floor);
      // 料：滿滿一槽
      const info = CONFIG.menu.toppings.find((t) => t.id === w.top);
      const n = 70;
      const geo = info.shape === 'ball' ? new THREE.SphereGeometry(0.0085, 10, 8) : new THREE.BoxGeometry(0.013, 0.013, 0.013);
      const inst = new THREE.InstancedMesh(geo, topMats[w.top], n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      for (let i = 0; i < n; i++) {
        e.set(R() * 3, R() * 3, R() * 3); q.setFromEuler(e);
        m4.compose(new THREE.Vector3((R() - 0.5) * (W - 0.02), -0.035 + R() * 0.02, (R() - 0.5) * (D - 0.02)), q, new THREE.Vector3(1, 1, 1));
        inst.setMatrixAt(i, m4);
      }
      inst.receiveShadow = true;
      g.add(inst);
      // 糖水液面
      const syrup = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.006, D - 0.006), new THREE.MeshStandardMaterial({ color: info.id === 'coco' ? '#f3ead2' : '#5a3418', roughness: 0.1, transparent: true, opacity: 0.55 }));
      syrup.rotation.x = -Math.PI / 2; syrup.position.y = -0.03; g.add(syrup);
      // 小名牌
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), new THREE.MeshStandardMaterial({ map: tagTex(info.name), roughness: 0.6 }));
      tag.position.set(0, 0.002, D / 2 + 0.022); tag.rotation.x = -Math.PI / 2 + 0.3; g.add(tag);

      // 手伸進去的表面（比台面低＝勺子會沉下去）
      const p = new THREE.Mesh(new THREE.BoxGeometry(W, 0.02, D));
      p.position.set(w.x, Y - 0.05, L.wellZ); p.userData = { kind: 'well', top: w.top }; p.updateMatrixWorld(true);
      proxies.push(p);

      this.list.push({ ...w, info, rest: new THREE.Vector3(w.x, Y - 0.03, L.wellZ - 0.02) });
    }
  }
  at(x, z) {
    for (const w of this.list) if (Math.abs(x - w.x) < L.wellW / 2 && Math.abs(z - L.wellZ) < L.wellD / 2) return w;
    return null;
  }
}

// ---------------- 冰桶 ----------------
export function buildIceBin(scene, M, proxies, iceMat) {
  const { x, z, w, d } = L.iceBin;
  const g = new THREE.Group(); g.position.set(x, Y, z); scene.add(g);
  const depth = 0.12;
  const walls = [[w, depth, 0.004, 0, d / 2], [w, depth, 0.004, 0, -d / 2], [0.004, depth, d, w / 2, 0], [0.004, depth, d, -w / 2, 0]];
  for (const [a, b, c, px, pz] of walls) { const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, c), M.steelInner); m.position.set(px, -depth / 2, pz); g.add(m); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.steelInner); floor.rotation.x = -Math.PI / 2; floor.position.y = -depth; g.add(floor);
  const R = rng(5);
  const n = 90;
  const inst = new THREE.InstancedMesh(new RoundedBoxGeometry(0.024, 0.024, 0.024, 2, 0.005), iceMat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const px = (R() - 0.5) * (w - 0.03), pz = (R() - 0.5) * (d - 0.03);
    const mound = 1 - Math.min(1, Math.hypot(px / (w / 2), pz / (d / 2)));
    e.set(R() * 3, R() * 3, R() * 3); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(px, -0.07 + mound * 0.05 + R() * 0.02, pz), q, new THREE.Vector3(1, 1, 1));
    inst.setMatrixAt(i, m4);
  }
  inst.renderOrder = 1;
  g.add(inst);
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.026), new THREE.MeshStandardMaterial({ map: tagTex('冰塊', { bg: '#4f8fb5' }), roughness: 0.6 }));
  tag.position.set(-w / 2 + 0.05, 0.002, -d / 2 - 0.02); tag.rotation.x = -Math.PI / 2; g.add(tag);
  const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d));
  p.position.set(x, Y - 0.03, z); p.userData = { kind: 'ice' }; p.updateMatrixWorld(true);
  proxies.push(p);
}

// ---------------- 封膜機 ----------------
export class Sealer {
  constructor(scene, phys, M, proxies) {
    const { x, z } = L.sealer;
    this.bay = new THREE.Vector3(x, Y + 0.03, z + 0.06);
    const g = new THREE.Group(); g.position.set(x, Y, z); scene.add(g);
    const body = new THREE.MeshStandardMaterial({ color: '#eef0ee', roughness: 0.35 });
    const accent = M.teal;
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.03, 0.34, 2, 0.01), body);
    base.position.set(0, 0.015, 0); base.castShadow = base.receiveShadow = true; g.add(base);
    const tower = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.42, 0.13, 3, 0.02), body);
    tower.position.set(0, 0.21, -0.105); tower.castShadow = tower.receiveShadow = true; g.add(tower);
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.11, 0.25, 3, 0.02), accent);
    head.position.set(0, 0.36, 0.0); head.castShadow = true; g.add(head);
    // 膜捲
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 24), new THREE.MeshStandardMaterial({ map: filmTex(), roughness: 0.4 }));
    roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.47, -0.07); roll.castShadow = true; g.add(roll);
    // 杯座
    const seat = new THREE.Mesh(new THREE.TorusGeometry(CUP.rBot + 0.012, 0.006, 8, 32), M.steelDark);
    seat.rotation.x = Math.PI / 2; seat.position.set(0, 0.034, 0.06); g.add(seat);
    // 壓頭
    this.press = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.03, 32), M.steel);
    this.press.position.set(0, 0.29, 0.06); this.press.castShadow = true; g.add(this.press);
    this.pressY0 = 0.29; this.pressY1 = 0.03 + CUP.h + 0.015;
    // 狀態燈
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), new THREE.MeshBasicMaterial({ color: '#57e08a' }));
    this.lamp.position.set(0.09, 0.36, 0.127); g.add(this.lamp);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.035), new THREE.MeshStandardMaterial({ map: tagTex('封膜機', { bg: '#1f5a55' }), roughness: 0.5 }));
    tag.position.set(-0.04, 0.36, 0.1255); g.add(tag);

    phys.fixedBox(x, Y + 0.015, z, 0.13, 0.015, 0.17, { groups: GROUPS.machine });
    phys.fixedBox(x, Y + 0.21, z - 0.105, 0.13, 0.21, 0.065, { groups: GROUPS.machine });
    phys.fixedBox(x, Y + 0.36, z, 0.13, 0.055, 0.125, { groups: GROUPS.machine });

    const blk = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.34));
    blk.position.set(x, Y + 0.015, z); blk.userData = { kind: 'surface' }; blk.updateMatrixWorld(true);
    proxies.push(blk);
    const blk2 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, 0.13));
    blk2.position.set(x, Y + 0.25, z - 0.105); blk2.userData = { kind: 'surface' }; blk2.updateMatrixWorld(true);
    proxies.push(blk2);

    this.cup = null; this.t = 0; this.phase = 'idle';
  }

  // 有杯子放好在杯座上 → 自動封膜
  update(dt, cups, onSealed, sfx) {
    if (this.phase === 'idle') {
      for (const c of cups) {
        if (c.held || c.sealed || !c.alive || c.dropped) continue;
        const p = c.pos;
        if (Math.hypot(p.x - this.bay.x, p.z - this.bay.z) < 0.07 && Math.abs(p.y - (this.bay.y + CUP.h / 2)) < 0.03 && c.up.y > 0.95 && c.speed < 0.3) {
          this.cup = c; c.lock(this.bay.x, this.bay.y + CUP.h / 2, this.bay.z);
          this.phase = 'down'; this.t = 0; sfx?.whirr?.();
          break;
        }
      }
    } else {
      this.t += dt;
      const k = this.phase === 'down' ? Math.min(1, this.t / 0.45) : this.phase === 'up' ? 1 - Math.min(1, this.t / 0.4) : 1;
      const ease = k * k * (3 - 2 * k);
      this.press.position.y = this.pressY0 + (this.pressY1 - this.pressY0) * ease;
      if (this.phase === 'down' && this.t >= 0.45) { this.phase = 'hold'; this.t = 0; sfx?.seal(); }
      else if (this.phase === 'hold' && this.t >= 0.35) { this.cup.seal(); onSealed?.(this.cup); this.phase = 'up'; this.t = 0; }
      else if (this.phase === 'up' && this.t >= 0.4) { this.phase = 'idle'; this.cup.unlock(); this.cup = null; sfx?.ding(); }
    }
    this.lamp.material.color.set(this.phase === 'idle' ? '#57e08a' : '#ff5a4a');
  }
}
