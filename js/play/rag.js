import * as THREE from 'three';
import { RoundedBoxGeometry } from '../gfx/builder.js';
import { canvas, tex } from '../gfx/textures.js';
import { L, PALETTE } from '../config.js';

// 抹布：拿起來在台面上擦，水漬會變小、掉在台面上的料和冰塊會被擦掉。
// 不是物理剛體（不會推杯子）；放開時平放在手底下的台面上。
const W = 0.15, D = 0.11;

function ragTex() {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#f3efe6'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(44,122,115,.55)';
  for (let i = 0; i < 128; i += 32) { g.fillRect(i, 0, 14, 128); g.fillRect(0, i, 128, 14); }
  g.fillStyle = 'rgba(44,122,115,.35)';
  for (let i = 0; i < 128; i += 32) for (let j = 0; j < 128; j += 32) g.fillRect(i, j, 14, 14);
  // 毛巾布紋
  for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
  return tex(c);
}

export class Rag {
  constructor(scene) {
    this.home = new THREE.Vector3(L.rag.x, L.counterY + 0.007, L.rag.z);
    this.mat = new THREE.MeshStandardMaterial({ map: ragTex(), roughness: 0.95, color: '#ffffff' });
    const geo = new RoundedBoxGeometry(W, 0.012, D, 2, 0.005);
    // 一點皺褶
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      if (p.getY(i) > 0) p.setY(i, p.getY(i) + Math.sin(x * 60) * 0.0015 + Math.cos(z * 45 + 1) * 0.0012);
    }
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.pick = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, 0.06, D + 0.05));
    this.pick.visible = false;
    this.pick.userData = { kind: 'rag', rag: this };
    this.mesh.add(this.pick);
    this.pos = this.home.clone();
    this.yaw = 0.3;
    this.held = null;
    this.dirt = 0;
    this.base = new THREE.Color('#ffffff');
    this.place(this.home, this.yaw);
  }

  place(p, yaw) {
    this.pos.copy(p); this.yaw = yaw;
    this.mesh.position.copy(p);
    this.mesh.rotation.set(0, yaw, 0);
    this.mesh.updateMatrixWorld(true);
  }

  // 吸了多少髒東西：布慢慢變成茶色
  soak(amount, color) {
    this.dirt = Math.min(1, this.dirt + amount);
    this.mat.color.copy(this.base).lerp(new THREE.Color(color), this.dirt * 0.55);
  }

  reset() { this.held = null; this.dirt = 0; this.mat.color.copy(this.base); this.place(this.home, 0.3); }
}

export const RAG_HALF = { w: W / 2, d: D / 2 };
export { PALETTE };
