import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// 靜態物件合併器：同材質的幾何合成一個網格，手機上 draw call 才不會爆。
export class Builder {
  constructor() { this.groups = new Map(); }

  add(geo, mat, { pos, rot, scale, cast = true, receive = true } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    // 統一屬性，才能合併
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const m = new THREE.Matrix4();
    const q = rot instanceof THREE.Quaternion ? rot : new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0])));
    m.compose(new THREE.Vector3(...(pos || [0, 0, 0])), q, new THREE.Vector3(...(scale || [1, 1, 1])));
    g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const key = mat.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
    if (!this.groups.has(key)) this.groups.set(key, { mat, cast, receive, geos: [] });
    this.groups.get(key).geos.push(g);
    return g;
  }

  box(w, h, d, mat, x, y, z, o = {}) {
    return this.add(o.round ? new RoundedBoxGeometry(w, h, d, 2, o.round) : new THREE.BoxGeometry(w, h, d), mat, { ...o, pos: [x, y, z] });
  }

  build(parent) {
    const out = [];
    for (const { mat, cast, receive, geos } of this.groups.values()) {
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      parent.add(mesh);
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  }
}

export function std(opts) { return new THREE.MeshStandardMaterial(opts); }
export { RoundedBoxGeometry };
