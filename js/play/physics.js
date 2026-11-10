import RAPIER from 'rapier';

// 物理世界（公尺、真實重力）：杯子、勺子、被砸飛的奧客。
export let R = null;

export async function initPhysics() {
  await RAPIER.init();
  R = RAPIER;
}

const STEP = 1 / 60;

// 碰撞群組：手上的杯子、勺子都不會去推台面上的杯子；只有放開或丟出去的杯子會撞倒別的杯子
export const GROUPS = {
  normal: (0x0002 << 16) | 0xffff,
  heldSlow: (0x0004 << 16) | 0x0001, // 拿在手上的杯子：只碰固定的東西
  tool: (0x0008 << 16) | 0x0001,     // 勺子：只碰台面、地板，永遠不推杯子
  static: (0x0001 << 16) | 0xffff,   // 一般固定的東西（台面、牆、地板、柱子）：不擋拿在手上的杯子
  machine: (0x0011 << 16) | 0xffff,  // 機台（茶桶、茶桶架、果糖機、封膜機）：也算固定的東西
  machineQuery: (0xffff << 16) | 0x0010, // 拿在手上的杯子只查機台
};

export class Physics {
  constructor() {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.acc = 0;
    this.alpha = 0;
    this.noSpill = new Set(); // 撞到也不會灑的機台碰撞體（封膜機）
  }

  fixedBox(cx, cy, cz, hx, hy, hz, { friction = 0.7, restitution = 0.15, groups, noSpill = false } = {}) {
    const b = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
    const d = R.ColliderDesc.cuboid(hx, hy, hz).setFriction(friction).setRestitution(restitution);
    d.setCollisionGroups(groups ?? GROUPS.static);
    const col = this.world.createCollider(d, b);
    if (noSpill) this.noSpill.add(col.handle);
    return b;
  }

  fixedCylinder(cx, cy, cz, halfH, r, { groups } = {}) {
    const b = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
    const d = R.ColliderDesc.cylinder(halfH, r).setFriction(0.6);
    d.setCollisionGroups(groups ?? GROUPS.static);
    this.world.createCollider(d, b);
    return b;
  }

  remove(body) { if (body) this.world.removeRigidBody(body); }

  // 固定步長；回傳這一幀跑了幾步
  step(dt, beforeStep) {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= STEP && n < 4) {
      beforeStep?.(STEP);
      this.world.step();
      this.acc -= STEP;
      n++;
    }
    if (n === 4) this.acc = 0;
    return n;
  }
}
