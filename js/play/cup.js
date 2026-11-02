import * as THREE from 'three';
import { R, GROUPS } from './physics.js';
import { CUP, CONFIG } from '../config.js';
import { cupPrintTex, filmTex } from '../gfx/textures.js';

const H = CUP.h;
const teaById = (id) => CONFIG.menu.teas.find((t) => t.id === id);
const TOPS = CONFIG.menu.toppings;

// 共用幾何與材質
let shared = null;
export function cupShared() {
  if (shared) return shared;
  const prof = [];
  const n = 12;
  prof.push(new THREE.Vector2(0, 0));
  prof.push(new THREE.Vector2(CUP.rBot - 0.004, 0));
  prof.push(new THREE.Vector2(CUP.rBot, 0.004));
  for (let i = 1; i <= n; i++) { const t = i / n; prof.push(new THREE.Vector2(CUP.rBot + (CUP.rTop - CUP.rBot) * t, t * H)); }
  prof.push(new THREE.Vector2(CUP.rTop + 0.0025, H + 0.001));
  prof.push(new THREE.Vector2(CUP.rTop + 0.0025, H - 0.003));
  const shellGeo = new THREE.LatheGeometry(prof, 40);
  const shellMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.09, depthWrite: false, envMapIntensity: 0.6, side: THREE.FrontSide });
  const printMat = new THREE.MeshStandardMaterial({ map: cupPrintTex(), transparent: true, roughness: 0.4, depthWrite: false });
  const printGeo = new THREE.LatheGeometry(prof.slice(2, prof.length - 2).map((v) => new THREE.Vector2(v.x + 0.0006, v.y)), 40);
  // 杯身印刷貼圖的 UV：lathe 的 u 繞一圈、v 沿高度
  const inner = [];
  inner.push(new THREE.Vector2(0, 0.003));
  for (let i = 0; i <= n; i++) { const t = i / n; inner.push(new THREE.Vector2(CUP.rBot - 0.0022 + (CUP.rTop - CUP.rBot) * t, 0.003 + t * (H - 0.004))); }
  const liquidGeo = new THREE.LatheGeometry(inner, 32);
  const filmGeo = new THREE.CircleGeometry(CUP.rTop + 0.002, 40);
  filmGeo.rotateX(-Math.PI / 2);
  // 杯膜稍微鼓起
  const fp = filmGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) { const r = Math.hypot(fp.getX(i), fp.getZ(i)) / CUP.rTop; fp.setY(i, (1 - r * r) * 0.004); }
  filmGeo.computeVertexNormals();
  const filmMat = new THREE.MeshStandardMaterial({ map: filmTex(), roughness: 0.25, transparent: true, opacity: 0.96 });
  const pearlGeo = new THREE.SphereGeometry(0.0084, 12, 10);
  const cubeGeo = new THREE.BoxGeometry(0.012, 0.012, 0.012);
  const iceGeo = new THREE.BoxGeometry(0.022, 0.022, 0.022);
  const topMat = new THREE.MeshPhysicalMaterial({ roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1 });
  const iceMat = new THREE.MeshPhysicalMaterial({ color: '#f2fbff', roughness: 0.04, transparent: true, opacity: 0.7, clearcoat: 1, depthWrite: false });
  const pickGeo = new THREE.CylinderGeometry(CUP.rTop + 0.02, CUP.rTop + 0.02, H + 0.03, 8);
  shared = { shellGeo, shellMat, printGeo, printMat, liquidGeo, filmGeo, filmMat, pearlGeo, cubeGeo, iceGeo, topMat, iceMat, pickGeo };
  return shared;
}

// 液體：杯身用裁切平面切在液面高度（杯子歪了液面還是水平的），液面另外放一片水平圓盤。
// 中、高畫質用「透射」：光穿過茶會被染色，看得到杯底的珍珠；低畫質用一般半透明。
export const LIQUID = { transmission: true };
function liquidMaterial() {
  let m;
  if (LIQUID.transmission) {
    m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0, transmission: 1, thickness: 0.07, ior: 1.33, attenuationColor: new THREE.Color('#7a2c0c'), attenuationDistance: 0.035, envMapIntensity: 0.9, specularIntensity: 1 });
  } else {
    m = new THREE.MeshStandardMaterial({ color: '#7a2c0c', roughness: 0.08, transparent: true, opacity: 0.9, depthWrite: false });
  }
  m.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 1)];
  return m;
}
// 每種茶的「深淺」：光走多遠會被染滿（越小越深）
const ATTEN = { black: 0.06, green: 0.16, milk: 0.02 };
const capGeo = new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2);
const FOAM = new THREE.Color('#f1dfc0');

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _s = new THREE.Vector3(1, 1, 1);

let nextId = 1;
export class Cup {
  constructor(scene, phys, pos, owners) {
    const S = cupShared();
    this.id = nextId++;
    this.scene = scene; this.phys = phys; this.owners = owners;
    this.group = new THREE.Group();
    // 內容
    this.tea = { black: 0, green: 0, milk: 0 };
    this.sugar = 0;
    this.ice = 0;
    this.tops = { pearl: 0, coco: 0, grass: 0 };
    this.sealed = false; this.shakes = 0; this.mix = 0;
    this.chilled = false; this.chillT = 0; // 冰塊泡在茶裡一段時間＝冰鎮過（去冰要先冰鎮）
    this.held = null; this.locked = false; this.alive = true; this.dropped = false;
    this.age = 0; this.touched = 0;

    this.liquidMat = liquidMaterial();
    this.liquid = new THREE.Mesh(S.liquidGeo, this.liquidMat);
    this.liquid.renderOrder = 1; this.liquid.visible = false;
    this.group.add(this.liquid);
    this.capMat = LIQUID.transmission
      ? new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, transmission: 1, thickness: 0.05, ior: 1.33, attenuationColor: new THREE.Color('#7a2c0c'), attenuationDistance: 0.03, envMapIntensity: 1.0 })
      : new THREE.MeshStandardMaterial({ color: '#7a2c0c', roughness: 0.05, transparent: true, opacity: 0.92, depthWrite: false });
    this.cap = new THREE.Mesh(capGeo, this.capMat);
    this.cap.renderOrder = 2; this.cap.visible = false;
    scene.add(this.cap);
    this.foam = 0;
    this.shell = new THREE.Mesh(S.shellGeo, S.shellMat);
    this.shell.renderOrder = 3; this.shell.castShadow = true;
    this.group.add(this.shell);
    this.print = new THREE.Mesh(S.printGeo, S.printMat);
    this.print.renderOrder = 4; this.print.castShadow = false;
    this.group.add(this.print);
    this.film = new THREE.Mesh(S.filmGeo, S.filmMat);
    this.film.position.y = H + 0.0005; this.film.visible = false; this.film.renderOrder = 5;
    this.group.add(this.film);
    this.balls = new THREE.InstancedMesh(S.pearlGeo, S.topMat, 44); this.balls.count = 0;
    this.cubes = new THREE.InstancedMesh(S.cubeGeo, S.topMat, 44); this.cubes.count = 0;
    this.iceMesh = new THREE.InstancedMesh(S.iceGeo, S.iceMat, 8); this.iceMesh.count = 0; this.iceMesh.renderOrder = 2;
    this.balls.setColorAt(0, new THREE.Color()); this.cubes.setColorAt(0, new THREE.Color());
    // 數量會變的 InstancedMesh：關掉視錐剔除（數量 0 時算出的包圍球是空的，之後會永遠被剔除）
    this.balls.frustumCulled = this.cubes.frustumCulled = this.iceMesh.frustumCulled = false;
    this.group.add(this.balls, this.cubes, this.iceMesh);
    this.pick = new THREE.Mesh(S.pickGeo); this.pick.visible = false; this.pick.position.y = H / 2;
    this.pick.userData = { kind: 'cup', cup: this };
    this.group.add(this.pick);
    // 讓杯子投出淡淡的影子：杯壁太透明，另外放一個不顯示的實心影子
    this.shadow = new THREE.Mesh(new THREE.CylinderGeometry(CUP.rTop * 0.9, CUP.rBot * 0.9, H * 0.9, 12), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    this.shadow.position.y = H / 2; this.shadow.castShadow = true;
    this.group.add(this.shadow);
    scene.add(this.group);
    this.topSeed = Math.random() * 1000;
    this.layout = [];

    const body = phys.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setCcdEnabled(true).setLinearDamping(0.1).setAngularDamping(1.2));
    const col = phys.world.createCollider(R.ColliderDesc.cylinder(H / 2, (CUP.rTop + CUP.rBot) / 2).setDensity(100).setFriction(1.0).setRestitution(0.02), body);
    col.setCollisionGroups(GROUPS.normal);
    this.body = body; this.collider = col;
    this.massKey = -1;
    this.updateMass();
    owners.set(col.handle, this);
    this.pos = new THREE.Vector3().copy(pos);
    this.quat = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.vel = new THREE.Vector3();
    this.prevVel = new THREE.Vector3();
    this.speed = 0;
    this.dirty = true;
  }

  get fill() { return this.tea.black + this.tea.green + this.tea.milk + this.sugar * CONFIG.pour.syrupVolume; }
  get topCount() { return this.tops.pearl + this.tops.coco + this.tops.grass; }
  get level() { return this.fill + this.topCount * 0.006 + this.ice * 0.035; }
  get empty() { return this.fill < 0.01 && this.topCount === 0 && this.ice === 0; }

  // 主要的茶（看哪一種最多）
  mainTea() {
    let best = null, v = 0;
    for (const k in this.tea) if (this.tea[k] > v) { v = this.tea[k]; best = k; }
    return best;
  }

  addLiquid(teaId, amount) {
    if (this.sealed) return amount;
    const room = Math.max(0, 1.0 - this.level);
    const a = Math.min(amount, room + 0.0);
    this.tea[teaId] += a;
    this.dirty = true;
    return amount - a; // 溢出量
  }
  addSugar(units) {
    if (this.sealed) return units;
    const room = Math.max(0, 1.0 - this.level) / CONFIG.pour.syrupVolume;
    const a = Math.min(units, room);
    this.sugar += a; this.dirty = true;
    return units - a;
  }
  addTop(id) { if (this.sealed) return false; this.tops[id]++; this.dirty = true; return true; }
  addIce() { if (this.sealed) return false; this.ice++; this.dirty = true; return true; }
  takeIce() { if (this.sealed || this.ice <= 0) return false; this.ice--; this.dirty = true; return true; }

  // 依比例倒掉一部分（灑出來）
  lose(frac) {
    frac = Math.min(1, Math.max(0, frac));
    let vol = 0;
    for (const k in this.tea) { vol += this.tea[k] * frac; this.tea[k] *= 1 - frac; }
    vol += this.sugar * frac * CONFIG.pour.syrupVolume;
    this.sugar *= 1 - frac;
    this.dirty = true;
    return vol;
  }

  seal() { this.sealed = true; this.film.visible = true; this.dirty = true; }

  color() {
    const c = new THREE.Color(0, 0, 0);
    let sum = 0;
    for (const k in this.tea) { if (this.tea[k] > 0) { c.add(new THREE.Color(teaById(k).color).multiplyScalar(this.tea[k])); sum += this.tea[k]; } }
    if (sum > 0) c.multiplyScalar(1 / sum);
    else c.set('#f2d48a');
    return c;
  }

  // 重量：空杯很輕；裝了飲料、料、冰塊就變重，而且重心在下面（不容易倒）
  updateMass() {
    const m = 0.03 + this.fill * 0.6 + this.topCount * 0.002 + this.ice * 0.008;
    const key = Math.round(m * 200);
    if (key === this.massKey) return;
    this.massKey = key;
    const lv = Math.min(1, this.level);
    const cy = -H / 2 + H * (0.18 + 0.25 * lv) * (this.fill > 0.05 ? 1 : 2); // 液體越少重心越低
    const r = (CUP.rTop + CUP.rBot) / 2;
    const ixx = m * (3 * r * r + H * H) / 12, iyy = m * r * r / 2;
    if (typeof this.collider.setMassProperties === 'function') {
      this.collider.setMassProperties(m, { x: 0, y: Math.min(0, cy), z: 0 }, { x: ixx, y: iyy, z: ixx }, { x: 0, y: 0, z: 0, w: 1 });
    } else {
      this.collider.setDensity(m / (Math.PI * r * r * H));
    }
  }

  // 拿在手上：慢慢移動時穿過其他杯子（不會推倒），甩得快才會撞
  setHeldCollision(fast) {
    const g = fast ? GROUPS.normal : GROUPS.heldSlow;
    if (g !== this.group_) { this.collider.setCollisionGroups(g); this.group_ = g; }
  }

  // ---- 拿起來／放開 ----
  grab(hand) {
    this.held = hand;
    this.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    this.touched = performance.now();
  }
  release(vel, angvel, placeAt) {
    this.held = null;
    this.setHeldCollision(true);
    if (placeAt) {
      // 輕輕放開＝放下：擺正、不帶旋轉，直接放在台面上
      this.body.setTranslation({ x: placeAt.x, y: placeAt.y, z: placeAt.z }, true);
      this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    }
    this.body.setBodyType(R.RigidBodyType.Dynamic, true);
    this.body.setLinvel(vel, true);
    this.body.setAngvel(angvel || { x: 0, y: 0, z: 0 }, true);
    this.prevVel.copy(vel);
  }
  moveTo(p, q) {
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  }
  lock(x, y, z) {
    this.locked = true;
    this.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    this.body.setNextKinematicTranslation({ x, y, z });
    this.body.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });
  }
  unlock() { this.locked = false; this.body.setBodyType(R.RigidBodyType.Dynamic, true); }

  // 物理同步後呼叫
  sync() {
    const t = this.body.translation(), r = this.body.rotation(), v = this.body.linvel();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.prevVel.copy(this.vel);
    this.vel.set(v.x, v.y, v.z);
    this.speed = this.vel.length();
    // 視覺：群組原點在杯底
    _v.set(0, -H / 2, 0).applyQuaternion(this.quat).add(this.pos);
    this.group.position.copy(_v);
    this.group.quaternion.copy(this.quat);
  }

  bottomCenter(out) { return out.set(0, -H / 2, 0).applyQuaternion(this.quat).add(this.pos); }
  rimCenter(out) { return out.set(0, H / 2, 0).applyQuaternion(this.quat).add(this.pos); }

  // 每幀更新液面與裡面的料
  updateVisual(dt) {
    const lvl = Math.min(1, this.level);
    const liquidOn = this.fill > 0.004;
    this.liquid.visible = liquidOn;
    this.cap.visible = liquidOn && this.up.y > 0.75;
    if (liquidOn) {
      const lv = Math.min(1, this.fill + this.topCount * 0.006 + this.ice * 0.035);
      const surfaceLocal = lv * (H - 0.004) + 0.003;
      const p = _v.set(0, surfaceLocal, 0).applyQuaternion(this.quat).add(this.group.position);
      const plane = this.liquidMat.clippingPlanes[0];
      plane.normal.set(0, -1, 0); plane.constant = p.y;
      this.foam += ((this.sealed ? Math.min(0.85, this.mix) : 0) - this.foam) * Math.min(1, dt * 3);
      if (this.dirty || this.foam > 0.001) {
        const c = this.color();
        const milky = this.tea.milk / Math.max(0.001, this.fill);
        if (LIQUID.transmission) {
          let at = 0, sum = 0;
          for (const k in this.tea) { at += ATTEN[k] * this.tea[k]; sum += this.tea[k]; }
          at = sum > 0 ? at / sum : 0.08;
          const lm = this.liquidMat, cm = this.capMat;
          lm.attenuationColor.copy(c); lm.attenuationDistance = at;
          // 奶茶：不太透光，帶一點奶色
          lm.transmission = 1 - milky * 0.85; lm.color.set('#ffffff').lerp(c, milky * 0.9);
          cm.attenuationColor.copy(c); cm.attenuationDistance = at;
          cm.transmission = (1 - milky * 0.85) * (1 - this.foam);
          cm.color.set('#ffffff').lerp(c, Math.max(milky * 0.9, 0.15)).lerp(FOAM, this.foam);
          cm.roughness = 0.04 + this.foam * 0.6;
        } else {
          this.liquidMat.color.copy(c);
          this.capMat.color.copy(c).lerp(FOAM, this.foam);
        }
      }
      const r = (CUP.rBot + (CUP.rTop - CUP.rBot) * lv) - 0.0028;
      this.cap.position.copy(p);
      this.cap.scale.set(r, 1, r);
    }
    if (this.dirty) { this.layoutTops(); this.updateMass(); this.dirty = false; }
    // 搖的時候料會晃
    if (this.held && this.jiggle > 0.01) this.layoutTops(this.jiggle);
  }

  layoutTops(j = 0) {
    let seed = this.topSeed;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    let nb = 0, nc = 0, i = 0;
    const col = new THREE.Color();
    const place = (inst, idx, x, y, z, s, colorHex) => {
      _q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
      _m.compose(_v.set(x, y, z), _q, _s.set(s, s, s));
      inst.setMatrixAt(idx, _m);
      inst.setColorAt(idx, col.set(colorHex));
    };
    const all = [];
    for (const t of TOPS) for (let k = 0; k < this.tops[t.id]; k++) all.push(t);
    for (const t of all) {
      if (i >= 80) break;
      const layer = Math.floor(i / 9), a = i * 2.4 + rnd() * 0.5;
      const r = 0.008 + (i % 9) / 9 * (CUP.rBot - 0.014) * (0.6 + rnd() * 0.4);
      const y = 0.012 + layer * 0.0125 + rnd() * 0.003 + (j ? (Math.random() - 0.3) * j * 0.05 : 0);
      const x = Math.cos(a) * r + (j ? (Math.random() - 0.5) * j * 0.01 : 0), z = Math.sin(a) * r;
      if (t.shape === 'ball') { if (nb < 44) place(this.balls, nb++, x, y, z, 1, t.color); }
      else if (nc < 44) place(this.cubes, nc++, x, y, z, 0.8 + rnd() * 0.4, t.color);
      i++;
    }
    this.balls.count = nb; this.cubes.count = nc;
    this.balls.instanceMatrix.needsUpdate = true; this.cubes.instanceMatrix.needsUpdate = true;
    if (this.balls.instanceColor) this.balls.instanceColor.needsUpdate = true;
    if (this.cubes.instanceColor) this.cubes.instanceColor.needsUpdate = true;
    // 冰塊浮在液面附近
    const n = Math.min(8, this.ice);
    const top = this.fill > 0.05 ? Math.min(1, this.level) * H - 0.014 : 0.014 + (this.topCount / 9) * 0.0125;
    for (let k = 0; k < n; k++) {
      const a = k * 2.1 + 0.4, r = k === 0 && n === 1 ? 0.004 : 0.016 + (k % 2) * 0.006;
      _q.setFromEuler(new THREE.Euler(0.3 * k, k, 0.2));
      _m.compose(_v.set(Math.cos(a) * r, Math.max(0.012, top - (k > 3 ? 0.02 : 0)), Math.sin(a) * r), _q, _s.set(1, 1, 1));
      this.iceMesh.setMatrixAt(k, _m);
    }
    this.iceMesh.count = n;
    this.iceMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.alive = false;
    this.owners.delete(this.collider.handle);
    this.phys.world.removeRigidBody(this.body);
    this.scene.remove(this.group);
    this.scene.remove(this.cap);
    this.liquidMat.dispose(); this.capMat.dispose();
    this.balls.dispose(); this.cubes.dispose(); this.iceMesh.dispose();
    this.shadow.geometry.dispose();
  }
}
