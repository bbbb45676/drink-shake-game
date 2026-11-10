import * as THREE from 'three';
import { R, GROUPS } from './physics.js';
import { CONFIG, L } from '../config.js';

const TOPS = Object.fromEntries(CONFIG.menu.toppings.map((t) => [t.id, t]));
// 勺子：原點在勺碗中心，握把往 +z（朝玩家）斜上
const HANDLE_END = new THREE.Vector3(0, 0.072, 0.205);
const ICE_HANDLE_END = new THREE.Vector3(0, 0.05, 0.19);

let shared = null;
function scoopShared(M) {
  if (shared) return shared;
  const pts = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.sin(a) * 0.033, -Math.cos(a) * 0.024 + 0.006)); }
  const bowl = new THREE.LatheGeometry(pts, 28);
  const rim = new THREE.TorusGeometry(0.033, 0.0025, 6, 28); rim.rotateX(Math.PI / 2); rim.translate(0, 0.006, 0);
  const h0 = new THREE.Vector3(0, 0.008, 0.032), h1 = HANDLE_END.clone();
  const len = h0.distanceTo(h1);
  const handle = new THREE.CylinderGeometry(0.0045, 0.0055, len, 10);
  handle.rotateX(Math.PI / 2);
  const dir = h1.clone().sub(h0).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  handle.applyQuaternion(q);
  handle.translate((h0.x + h1.x) / 2, (h0.y + h1.y) / 2, (h0.z + h1.z) / 2);
  const grip = new THREE.CylinderGeometry(0.009, 0.009, 0.07, 12);
  grip.rotateX(Math.PI / 2); grip.applyQuaternion(q);
  const gc = h1.clone().addScaledVector(dir, -0.035);
  grip.translate(gc.x, gc.y, gc.z);
  const ball = new THREE.SphereGeometry(0.0078, 8, 6);
  const cube = new THREE.BoxGeometry(0.012, 0.012, 0.012);
  const pick = new THREE.SphereGeometry(0.06, 8, 6);
  // 冰鏟：半圓槽＋後擋板＋握把
  const trough = new THREE.CylinderGeometry(0.04, 0.04, 0.12, 20, 1, true, -Math.PI / 2, Math.PI);
  trough.rotateX(Math.PI / 2); trough.translate(0, 0.012, 0);
  const back = new THREE.CircleGeometry(0.04, 20, Math.PI, Math.PI); back.translate(0, 0.012, 0.06);
  const iceH0 = new THREE.Vector3(0, 0.0, 0.06), iceH1 = ICE_HANDLE_END.clone();
  const iceDir = iceH1.clone().sub(iceH0).normalize(), iceLen = iceH0.distanceTo(iceH1);
  const iceHandle = new THREE.CylinderGeometry(0.008, 0.009, iceLen, 12);
  iceHandle.rotateX(Math.PI / 2); iceHandle.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), iceDir));
  iceHandle.translate((iceH0.x + iceH1.x) / 2, (iceH0.y + iceH1.y) / 2, (iceH0.z + iceH1.z) / 2);
  const iceCube = new THREE.BoxGeometry(0.02, 0.02, 0.02);
  shared = { bowl, rim, handle, grip, ball, cube, pick, dir, h0, len, trough, back, iceHandle, iceCube, iceDir, iceH0, iceLen };
  return shared;
}

export class Scoop {
  constructor(scene, phys, M, well, owners) {
    const S = scoopShared(M); this.S = S;
    this.well = well; this.phys = phys; this.owners = owners;
    this.isIce = !!well.ice;
    this.max = this.isIce ? CONFIG.pour.iceMax : CONFIG.pour.scoopMax;
    this.handleEnd = this.isIce ? ICE_HANDLE_END : HANDLE_END;
    this.group = new THREE.Group();
    const steel = M.steel;
    if (this.isIce) {
      // 冰鏟（白色半透明塑膠）
      const plastic = new THREE.MeshPhysicalMaterial({ color: '#eef6f8', roughness: 0.25, transparent: true, opacity: 0.88, side: THREE.DoubleSide, clearcoat: 0.6 });
      const tr = new THREE.Mesh(S.trough, plastic), bk = new THREE.Mesh(S.back, plastic), hd = new THREE.Mesh(S.iceHandle, new THREE.MeshStandardMaterial({ color: '#4f8fb5', roughness: 0.45 }));
      for (const m of [tr, bk, hd]) { m.castShadow = true; this.group.add(m); }
      this.loadMat = new THREE.MeshPhysicalMaterial({ color: '#eaf6ff', roughness: 0.05, transparent: true, opacity: 0.7, clearcoat: 1 });
      this.loadMesh = new THREE.InstancedMesh(S.iceCube, this.loadMat, 10);
    } else {
      const bowl = new THREE.Mesh(S.bowl, new THREE.MeshStandardMaterial({ color: '#d9dcde', metalness: 1, roughness: 0.3, side: THREE.DoubleSide }));
      const rim = new THREE.Mesh(S.rim, steel), handle = new THREE.Mesh(S.handle, steel);
      const grip = new THREE.Mesh(S.grip, new THREE.MeshStandardMaterial({ color: well.info.id === 'coco' ? '#e9e0c8' : '#3a2a22', roughness: 0.5 }));
      for (const m of [bowl, rim, handle, grip]) { m.castShadow = true; this.group.add(m); }
      // 勺子裡的料
      this.loadMat = new THREE.MeshStandardMaterial({ color: well.info.color, roughness: 0.18 });
      this.loadMesh = new THREE.InstancedMesh(well.info.shape === 'ball' ? S.ball : S.cube, this.loadMat, 16);
    }
    this.loadMesh.count = 0; this.loadMesh.frustumCulled = false;
    this.group.add(this.loadMesh);
    // 拿的範圍：握把那一端
    this.pick = new THREE.Mesh(S.pick); this.pick.visible = false; this.pick.position.copy(this.handleEnd).add(new THREE.Vector3(0, 0, -0.03));
    this.pick.userData = { kind: 'scoop', scoop: this };
    this.group.add(this.pick);
    scene.add(this.group);

    this.load = 0; this.loadType = well.top;
    this.held = null; this.mode = 'rest';
    this.tilt = 0; this.pourAcc = 0; this.idle = 0;
    this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion();

    const body = phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setCcdEnabled(true));
    const c1 = phys.world.createCollider(R.ColliderDesc.ball(0.03).setDensity(400).setFriction(0.6), body);
    const h0 = this.isIce ? S.iceH0 : S.h0, hdir = this.isIce ? S.iceDir : S.dir, hlen = this.isIce ? S.iceLen : S.len;
    const mid = h0.clone().add(this.handleEnd).multiplyScalar(0.5);
    const hq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), hdir);
    const c2 = phys.world.createCollider(R.ColliderDesc.cuboid(0.006, 0.006, hlen / 2).setTranslation(mid.x, mid.y, mid.z).setRotation({ x: hq.x, y: hq.y, z: hq.z, w: hq.w }).setDensity(400).setFriction(0.6), body);
    owners.set(c1.handle, this); owners.set(c2.handle, this);
    this.colliders = [c1, c2];
    this.body = body;
    this.toRest(true);
  }

  restPose() {
    // 勺子斜插在料槽裡（冰鏟插在冰桶裡），握把朝玩家翹起來
    const p = this.isIce ? new THREE.Vector3(L.iceBin.x + 0.15, L.counterY - 0.05, L.iceBin.z - 0.02) : new THREE.Vector3(this.well.x, L.counterY - 0.045, L.wellZ - 0.035);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, 0, 0));
    return { p, q };
  }

  // 勺子永遠不推杯子（拿著、插著、掉下來都一樣）
  setCollision() {
    const g = GROUPS.tool;
    if (g === this.group_) return;
    for (const c of this.colliders) c.setCollisionGroups(g);
    this.group_ = g;
  }

  toRest(instant) {
    this.setCollision?.(false);
    this.mode = 'rest'; this.held = null; this.idle = 0;
    this.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    const { p, q } = this.restPose();
    if (instant) { this.body.setTranslation(p, true); this.body.setRotation(q, true); }
    this.body.setNextKinematicTranslation(p); this.body.setNextKinematicRotation(q);
  }

  grab(hand) { this.held = hand; this.mode = 'held'; this.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true); }

  release(vel) {
    this.held = null;
    // 放在自己的料槽上方 → 插回去
    const b = this.pos;
    if (this.isIce ? this.overHome(b) : (Math.abs(b.x - this.well.x) < L.wellW / 2 + 0.02 && Math.abs(b.z - L.wellZ) < L.wellD / 2 + 0.03 && b.y < L.counterY + 0.08)) { this.toRest(false); return; }
    this.mode = 'free'; this.idle = 0;
    this.setCollision(true);
    this.body.setBodyType(R.RigidBodyType.Dynamic, true);
    this.body.setLinvel(vel, true);
    this.body.setAngvel({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3, z: 0 }, true);
    // 灑出來的料
    this.spillOut = true;
  }

  overHome(b) { const ib = L.iceBin; return Math.abs(b.x - ib.x) < ib.w / 2 + 0.02 && Math.abs(b.z - ib.z) < ib.d / 2 + 0.03 && b.y < L.counterY + 0.1; }

  // 握把位置（手）＝ 勺碗位置 + 偏移
  handleOffset(q) { return this.handleEnd.clone().applyQuaternion(q); }

  moveBowl(bowlPos, q) {
    this.body.setNextKinematicTranslation({ x: bowlPos.x, y: bowlPos.y, z: bowlPos.z });
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  }

  sync(dt) {
    const t = this.body.translation(), r = this.body.rotation();
    this.pos.set(t.x, t.y, t.z); this.quat.set(r.x, r.y, r.z, r.w);
    this.group.position.copy(this.pos); this.group.quaternion.copy(this.quat);
    if (this.mode === 'rest') this.body.setNextKinematicTranslation(this.restPose().p);
    if (this.mode === 'free') {
      this.idle += dt;
      // 掉到地上：過一下回到料槽
      if ((this.pos.y < 0.5 && this.idle > 1.2) || this.idle > 12) this.toRest(true);
    }
  }

  setLoad(n, type) {
    this.load = Math.max(0, Math.min(this.max, n));
    let changed = false;
    if (type && type !== this.loadType) {
      // 勺子舀到別的料：勺子裡畫出來的料也要換（顏色、形狀）
      this.loadType = type; changed = true;
      const info = TOPS[type];
      if (info && !this.isIce) {
        this.loadMat.color.set(info.color);
        this.loadMesh.geometry = info.shape === 'ball' ? this.S.ball : this.S.cube;
      }
    }
    const want = Math.round(this.load);
    if (want === this.loadMesh.count && !changed) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < want; i++) {
      if (this.isIce) {
        // 冰塊排在槽裡：兩排、往前疊
        q.setFromEuler(new THREE.Euler(i * 0.5, i * 0.9, i * 0.3));
        m.compose(new THREE.Vector3(((i % 2) - 0.5) * 0.024, -0.012 + (i >= 6 ? 0.018 : 0), -0.04 + ((i % 6) >> 1) * 0.026), q, new THREE.Vector3(1, 1, 1));
      } else {
        const a = i * 2.39, r = Math.sqrt(i / 14) * 0.022;
        q.setFromEuler(new THREE.Euler(i, i * 0.7, 0));
        m.compose(new THREE.Vector3(Math.cos(a) * r, -0.008 + (i > 8 ? 0.008 : 0) + (0.022 - r) * 0.2, Math.sin(a) * r), q, new THREE.Vector3(1, 1, 1));
      }
      this.loadMesh.setMatrixAt(i, m);
    }
    this.loadMesh.count = want;
    this.loadMesh.instanceMatrix.needsUpdate = true;
  }
}

export { HANDLE_END };
