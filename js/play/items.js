import * as THREE from 'three';
import { L, CUP, CONFIG } from '../config.js';
import { puddleTex } from '../gfx/textures.js';
import { RoundedBoxGeometry } from '../gfx/builder.js';

const Y = L.counterY;

// 某個 (x,z) 底下的表面高度（掉落物、液滴用的簡化地形）
export function groundY(x, z) {
  const c = L.counter, lg = L.ledge;
  if (z < lg.z0 - 0.02) return z < -4.25 ? -0.15 : 0.0; // 窗外：騎樓／馬路
  if (x > lg.x0 && x < lg.x1 && z >= lg.z0 && z < lg.z1) return lg.y;
  if (x > c.x0 && x < c.x1 && z >= c.z0 && z < c.z1) {
    if (x > L.wellX0 && x < L.wellX1 && Math.abs(z - L.wellZ) < L.wellD / 2) return Y - 0.08;
    const ib = L.iceBin;
    if (Math.abs(x - ib.x) < ib.w / 2 && Math.abs(z - ib.z) < ib.d / 2) return Y - 0.1;
    for (const s of [L.sealer, L.shakeMachine]) if (Math.abs(x - s.x) < 0.13 && Math.abs(z - s.z) < 0.17) return Y + 0.03;
    return Y;
  }
  if (Math.abs(x) > 0.95 && z < lg.z1 && z >= lg.z0) return Y + 0.2;
  return 0.0; // 店內地板
}

// ---------------- 地上、台面上的水漬 ----------------
export class Puddles {
  constructor(scene, max = 48) {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    // 水漬用「相乘」混色：把底下的台面、地板染成茶色，像真的濕掉，不像油漆
    this.mat = new THREE.MeshBasicMaterial({ color: '#ffffff', alphaMap: puddleTex(), transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.count = 0; this.mesh.renderOrder = 0;
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.list = [];
    this.max = max;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion();
  }
  add(x, y, z, vol, color) {
    if (vol <= 0) return;
    let p = this.list.find((p) => Math.abs(p.y - y) < 0.01 && Math.hypot(p.x - x, p.z - z) < p.r * 0.6 + 0.03);
    if (!p) {
      if (this.list.length >= this.max) this.list.shift();
      p = { x, y: y + 0.0015, z, area: 0, r: 0, rot: Math.random() * 6.28, color: new THREE.Color(color), grow: 0 };
      this.list.push(p);
    } else {
      p.color.lerp(new THREE.Color(color), Math.min(0.5, vol / (p.area * 4 + vol)));
    }
    // 一整杯（1.0）約攤成直徑 40 公分
    p.area += vol * 0.13;
    p.r = Math.min(0.9, Math.sqrt(p.area));
    this.dirty = true;
  }
  update() {
    if (!this.dirty) return;
    this.dirty = false;
    const m = this._m;
    this.list.forEach((p, i) => {
      this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
      const s = Math.max(0.02, p.r * 2);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), this._q, new THREE.Vector3(s, 1, s * 0.85));
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, p.color);
    });
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.list = []; this.dirty = true; this.update(); }

  // 抹布擦過：同一個表面上、在抹布範圍內的水漬變小；太小就不見
  wipe(x, y, z, rad, amount) {
    let removed = 0, color = null;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (Math.abs(p.y - y) > 0.02) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > p.r + rad) continue;
      const overlap = Math.min(1, (p.r + rad - d) / (rad * 2));
      const take = Math.min(p.area, amount * (0.4 + overlap));
      p.area -= take; removed += take; color = p.color;
      p.r = Math.sqrt(Math.max(0, p.area));
      if (p.area < 0.0004) { removed += p.area; this.list.splice(i, 1); }
      this.dirty = true;
    }
    return { removed, color };
  }
}

// ---------------- 掉落物：珍珠、椰果、仙草、冰塊、液滴 ----------------
const KINDS = ['ball', 'cube', 'ice', 'drop'];
export class Items {
  constructor(scene, limit) {
    this.limit = limit;
    const mk = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.castShadow = false; m.setColorAt(0, new THREE.Color()); scene.add(m); return m; };
    const topMat = new THREE.MeshStandardMaterial({ roughness: 0.18 });
    this.meshes = {
      ball: mk(new THREE.SphereGeometry(0.0078, 8, 6), topMat, 200),
      cube: mk(new THREE.BoxGeometry(0.012, 0.012, 0.012), topMat, 200),
      ice: mk(new RoundedBoxGeometry(0.022, 0.022, 0.022, 2, 0.004), new THREE.MeshPhysicalMaterial({ color: '#eaf6ff', roughness: 0.05, transparent: true, opacity: 0.6, clearcoat: 1 }), 40),
      drop: mk(new THREE.SphereGeometry(0.006, 6, 4), new THREE.MeshStandardMaterial({ roughness: 0.1, transparent: true, opacity: 0.85 }), 900),
    };
    this.meshes.ice.castShadow = true;
    this.list = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }
  setLimit(n) { this.limit = n; }

  // kind: ball/cube/ice/drop；data: { top, color, vol }
  spawn(kind, pos, vel, data = {}) {
    const isDrop = kind === 'drop';
    const count = this.list.filter((i) => (i.kind === 'drop') === isDrop).length;
    if (isDrop && count >= this.limit) return null;
    if (!isDrop && count >= 220) { const idx = this.list.findIndex((i) => i.kind !== 'drop' && i.resting); if (idx >= 0) this.list.splice(idx, 1); else return null; }
    const it = { kind, p: pos.clone(), v: vel.clone(), life: 0, resting: false, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12, ...data };
    if (isDrop) it.size = data.size || 0.6 + Math.random() * 0.9;
    this.list.push(it);
    return it;
  }

  // cups: 杯子陣列；hooks: { intoCup(item,cup), land(item, y), hitPerson(item) }
  update(dt, cups, hooks) {
    const g = -9.81;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      it.life += dt;
      if (it.resting) {
        if (it.life > (it.kind === 'ice' ? 8 : 10)) this.list.splice(i, 1);
        continue;
      }
      const py = it.p.y;
      it.v.y += g * dt;
      it.p.addScaledVector(it.v, dt);
      it.rot += it.spin * dt;
      // 掉進杯子
      if (it.v.y < 0) {
        let used = false;
        for (const c of cups) {
          if (!c.alive || c.sealed || c.up.y < 0.8) continue;
          const rim = c.rimCenter(this._p);
          if (py >= rim.y - 0.005 && it.p.y < rim.y && Math.hypot(it.p.x - rim.x, it.p.z - rim.z) < (c.R || CUP.rTop) - 0.003) {
            if (hooks.intoCup(it, c)) { this.list.splice(i, 1); used = true; break; }
          }
        }
        if (used) continue;
      }
      if (hooks.hitPerson && it.kind === 'drop' && hooks.hitPerson(it)) { this.list.splice(i, 1); continue; }
      const gy = groundY(it.p.x, it.p.z);
      const r = it.kind === 'ice' ? 0.011 : it.kind === 'drop' ? 0.003 : 0.007;
      if (it.p.y - r <= gy && py - r >= gy - 0.05) {
        if (it.kind === 'drop') {
          hooks.land?.(it, gy);
          this.list.splice(i, 1);
          continue;
        }
        it.p.y = gy + r;
        if (Math.abs(it.v.y) < 0.6) { it.resting = true; it.life = 0; it.v.set(0, 0, 0); }
        else { it.v.y *= -0.32; it.v.x *= 0.6; it.v.z *= 0.6; it.spin *= 0.5; if (it.kind === 'ice') hooks.clink?.(it); }
      } else if (it.p.y < -1) this.list.splice(i, 1);
    }
    this.draw();
  }

  draw() {
    const counts = { ball: 0, cube: 0, ice: 0, drop: 0 };
    const m = this._m, q = this._q, s = this._s;
    for (const it of this.list) {
      const mesh = this.meshes[it.kind];
      const n = counts[it.kind];
      if (n >= mesh.instanceMatrix.count) continue;
      if (it.kind === 'drop') {
        const sp = it.v.length();
        const k = it.size;
        q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sp > 0.01 ? this._p.copy(it.v).normalize() : new THREE.Vector3(0, 1, 0));
        s.set(k, k * (1 + Math.min(2.5, sp * 0.5)), k);
      } else {
        this._e.set(it.rot, it.rot * 0.7, 0); q.setFromEuler(this._e);
        const fade = it.resting && it.life > 7 ? Math.max(0.01, 1 - (it.life - 7) / 3) : 1;
        s.set(fade, fade, fade);
      }
      m.compose(it.p, q, s);
      mesh.setMatrixAt(n, m);
      if (it.color) mesh.setColorAt(n, this._c.set(it.color));
      counts[it.kind]++;
    }
    for (const k of KINDS) {
      const mesh = this.meshes[k];
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  clear() { this.list = []; this.draw(); }

  // 抹布擦過：把掉在台面上的料、冰塊擦掉
  sweep(x, y, z, rad) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      if (it.kind === 'drop' || !it.resting) continue;
      if (Math.abs(it.p.y - y) > 0.05 || Math.hypot(it.p.x - x, it.p.z - z) > rad) continue;
      this.list.splice(i, 1); n++;
    }
    return n;
  }
}

// 一團噴濺：給位置、方向、顏色
export function splash(items, pos, dir, color, n, { speed = 2.2, spread = 1, vol = 0, up = 1.2, free = false, size = 0 } = {}) {
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.set((Math.random() - 0.5) * 2 * spread, Math.random() * up, (Math.random() - 0.5) * 2 * spread).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.9));
    v.addScaledVector(dir, 0.6);
    items.spawn('drop', pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.03, Math.random() * 0.03, (Math.random() - 0.5) * 0.03)), v, { color, vol: vol / n, free, size: size ? size * (0.5 + Math.random()) : 0 });
  }
}

export const TOP_INFO = Object.fromEntries(CONFIG.menu.toppings.map((t) => [t.id, t]));
