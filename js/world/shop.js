import * as THREE from 'three';
import { Builder, std } from '../gfx/builder.js';
import { brushedTex, woodTex, tileTex, menuTex, signTex, softCircleTex, drawLogo, canvas, tex, recipeTex } from '../gfx/textures.js';
import { L, PALETTE, FONT, CONFIG } from '../config.js';

// 共用材質
export function makeMaterials() {
  const brushed = brushedTex();
  const M = {
    steel: std({ color: '#d2d6da', metalness: 0.9, roughness: 0.72, roughnessMap: brushed }),
    steelDark: std({ color: '#b4b9bd', metalness: 1, roughness: 0.8, roughnessMap: brushed }),
    steelInner: std({ color: '#c9cdd0', metalness: 1, roughness: 0.3 }),
    wood: std({ map: woodTex(), roughness: 0.55 }),
    woodDark: std({ map: woodTex('#7a4f2f', '#4a2c18', 9), roughness: 0.6 }),
    teal: std({ color: PALETTE.teal, roughness: 0.5 }),
    tealDark: std({ color: '#1f5a55', roughness: 0.55 }),
    cream: std({ color: PALETTE.cream, roughness: 0.8 }),
    white: std({ color: '#f6f3ee', roughness: 0.5 }),
    black: std({ color: '#26211e', roughness: 0.45 }),
    rubber: std({ color: '#1c1a19', roughness: 0.9 }),
    orange: std({ color: PALETTE.orange, roughness: 0.35 }),
    wallTile: std({ map: tileTex({ cols: 6, rows: 14, color: '#f3efe8', grout: '#d6cec2', jitter: 0.03 }), roughness: 0.25 }),
    floor: std({ map: tileTex({ cols: 6, rows: 6, palette: ['#5a4b42', '#4f423a', '#62534a'], grout: '#2f2722', offset: 0, gap: 4 }), roughness: 0.6 }),
    ceiling: std({ color: '#e9e2d6', roughness: 0.9 }),
    clear: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.06, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, clearcoat: 1 }),
  };
  M.wallTile.map.repeat.set(2, 2); M.wallTile.map.wrapS = M.wallTile.map.wrapT = THREE.RepeatWrapping;
  M.floor.map.repeat.set(4, 4); M.floor.map.wrapS = M.floor.map.wrapT = THREE.RepeatWrapping;
  return M;
}

export function buildShop(scene, phys, M, proxies) {
  const B = new Builder();
  const Y = L.counterY;
  const c = L.counter;
  const holeX0 = 0.345, holeX1 = 0.855;
  const well = { z0: L.wellZ - L.wellD / 2, z1: L.wellZ + L.wellD / 2 };
  const ice = { z0: L.iceBin.z - L.iceBin.d / 2, z1: L.iceBin.z + L.iceBin.d / 2 };

  // ---- 櫃台台面（不鏽鋼），挖出料槽與冰桶的洞 ----
  const top = (x0, x1, z0, z1) => {
    if (x1 - x0 < 0.001 || z1 - z0 < 0.001) return;
    B.box(x1 - x0, 0.03, z1 - z0, M.steel, (x0 + x1) / 2, Y - 0.015, (z0 + z1) / 2, { cast: false });
    phys.fixedBox((x0 + x1) / 2, Y - 0.05, (z0 + z1) / 2, (x1 - x0) / 2, 0.05, (z1 - z0) / 2);
    // 手可以放的表面（料槽、冰桶的洞不算，手才伸得進去）
    const pz1 = z1 >= c.z1 - 0.001 ? z1 + 0.4 : z1;
    const pm = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.02, pz1 - z0));
    pm.position.set((x0 + x1) / 2, Y - 0.01, (z0 + pz1) / 2); pm.userData = { kind: 'surface' }; pm.updateMatrixWorld(true);
    proxies.push(pm);
  };
  top(c.x0, holeX0, c.z0, c.z1);
  top(holeX1, c.x1, c.z0, c.z1);
  top(holeX0, holeX1, c.z0, ice.z0);
  top(holeX0, holeX1, ice.z1, well.z0);
  top(holeX0, holeX1, well.z1, c.z1);
  // 洞的底（掉進去的東西有地方放）
  phys.fixedBox(0.6, Y - 0.16, (well.z0 + well.z1) / 2, 0.26, 0.04, (well.z1 - well.z0) / 2);
  phys.fixedBox(0.6, Y - 0.16, L.iceBin.z, 0.26, 0.04, L.iceBin.d / 2);
  // 前緣圓角收邊
  B.add(new THREE.CylinderGeometry(0.015, 0.015, c.x1 - c.x0, 12), M.steel, { pos: [0, Y - 0.015, c.z1], rot: [0, 0, Math.PI / 2], cast: false });
  // 櫃體
  // 櫃體只做到料槽底下（不然會蓋住料槽和冰桶）
  B.box(c.x1 - c.x0, Y - 0.16, c.z1 - c.z0 - 0.04, M.woodDark, 0, (Y - 0.16) / 2, (c.z0 + c.z1) / 2 + 0.02, { cast: false });
  B.box(c.x1 - c.x0, 0.14, 0.02, M.steelDark, 0, Y - 0.1, c.z1 - 0.01, { cast: false });
  B.box(c.x1 - c.x0, 0.14, 0.02, M.steelDark, 0, Y - 0.1, c.z0 + 0.01, { cast: false });
  B.box(c.x1 - c.x0, 0.08, 0.02, M.black, 0, 0.04, c.z1 + 0.01, { cast: false });
  // 後擋板（台面跟出餐台之間的小階）
  B.box(L.ledge.x1 - L.ledge.x0, L.ledge.y - Y, 0.02, M.steelDark, 0, (Y + L.ledge.y) / 2, L.ledge.z1 + 0.01, { cast: false });

  // ---- 出餐台（木頭）----
  const lg = L.ledge;
  B.box(lg.x1 - lg.x0, 0.045, lg.z1 - lg.z0 + 0.04, M.wood, 0, lg.y - 0.0225, (lg.z0 + lg.z1) / 2 - 0.02, { round: 0.008 });
  phys.fixedBox(0, lg.y - 0.05, (lg.z0 + lg.z1) / 2 - 0.02, (lg.x1 - lg.x0) / 2, 0.05, (lg.z1 - lg.z0) / 2 + 0.02);
  // 台面兩側延伸到柱子
  for (const s of [-1, 1]) {
    B.box(0.4, Y + 0.2, lg.z1 - lg.z0 + 0.1, M.teal, s * 1.15, (Y + 0.2) / 2, (lg.z0 + lg.z1) / 2, {});
  }
  // 店外側牆面（窗口下方，客人那面）：磁磚
  const outerTile = std({ map: tileTex({ cols: 10, rows: 6, palette: ['#2c7a73', '#2f8279', '#28706a', '#358a80'], grout: '#e8e1d4', gap: 5, offset: 0 }), roughness: 0.3 });
  outerTile.map.wrapS = outerTile.map.wrapT = THREE.RepeatWrapping; outerTile.map.repeat.set(3, 1);
  B.box(2.6, lg.y - 0.045, 0.06, outerTile, 0, (lg.y - 0.045) / 2, lg.z0 - 0.0, {});
  phys.fixedBox(0, lg.y / 2, lg.z0 - 0.02, 1.3, lg.y / 2, 0.04);

  // ---- 窗框、柱子、橫樑 ----
  for (const s of [-1, 1]) {
    B.box(0.32, 2.75, 0.3, M.teal, s * 1.18, 1.375, L.windowZ - 0.05, {});
    B.box(0.04, 2.75, 0.31, M.cream, s * 1.0, 1.375, L.windowZ - 0.05, { cast: false });
    phys.fixedBox(s * 1.18, 1.4, L.windowZ - 0.05, 0.16, 1.4, 0.15);
  }
  B.box(2.7, 0.45, 0.3, M.teal, 0, 2.55, L.windowZ - 0.05, {});
  B.box(2.0, 0.04, 0.31, M.cream, 0, 2.31, L.windowZ - 0.05, { cast: false });

  // ---- 牆、天花板、地板（店內）----
  const wall = (x, rotY) => {
    B.add(new THREE.PlaneGeometry(2.4, 2.75), M.wallTile, { pos: [x, 1.375, 0.1], rot: [0, rotY, 0], cast: false });
  };
  wall(-1.34, Math.PI / 2);
  wall(1.34, -Math.PI / 2);
  B.add(new THREE.PlaneGeometry(2.7, 2.6), M.ceiling, { pos: [0, 2.75, 0.2], rot: [Math.PI / 2, 0, 0], cast: false });
  B.add(new THREE.PlaneGeometry(2.7, 2.6), M.floor, { pos: [0, 0.001, 0.2], rot: [-Math.PI / 2, 0, 0], cast: false });
  phys.fixedBox(0, -0.1, 0.4, 1.4, 0.1, 1.4);
  // 側牆的物理
  phys.fixedBox(-1.4, 1.4, 0.2, 0.06, 1.4, 1.4);
  phys.fixedBox(1.4, 1.4, 0.2, 0.06, 1.4, 1.4);

  // 左牆：價目燈箱
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.62), new THREE.MeshStandardMaterial({ map: menuTex(), emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0, roughness: 0.4 }));
  menu.material.emissiveMap = menu.material.map; menu.material.emissiveIntensity = 0.55;
  menu.position.set(-1.33, 1.85, -0.2); menu.rotation.y = Math.PI / 2;
  scene.add(menu);
  B.box(0.04, 0.68, 1.06, M.black, -1.345, 1.85, -0.2, { cast: false });

  // 右牆：配方表（靠窗口那邊），層架、杯子備品、小盆栽往裡面移
  const rmat = new THREE.MeshStandardMaterial({ map: recipeTex(CONFIG.menu), roughness: 0.55 });
  const recipe = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.762), rmat);
  recipe.position.set(1.324, 1.78, -0.52); recipe.rotation.y = -Math.PI / 2;
  scene.add(recipe);
  B.box(0.02, 0.8, 0.82, M.teal, 1.338, 1.78, -0.52, { cast: false });
  for (const y of [1.45, 1.85]) {
    B.box(0.26, 0.025, 0.6, M.wood, 1.21, y, 0.32, {});
  }
  const boxMat = std({ color: '#e7d6bd', roughness: 0.9 });
  for (let i = 0; i < 3; i++) B.box(0.2, 0.18, 0.18, boxMat, 1.22, 1.555, 0.1 + i * 0.2, { round: 0.01 });
  const pot = std({ color: '#c46a45', roughness: 0.7 }), leaf = std({ color: '#3f7a46', roughness: 0.6 });
  B.add(new THREE.CylinderGeometry(0.07, 0.055, 0.12, 16), pot, { pos: [1.2, 1.925, 0.2] });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    B.add(new THREE.SphereGeometry(0.045, 10, 8), leaf, { pos: [1.2 + Math.cos(a) * 0.05, 2.02 + (i % 2) * 0.04, 0.2 + Math.sin(a) * 0.05], scale: [1, 1.6, 0.7], rot: [0, a, 0.4] });
  }

  // ---- 吊燈（店內，竹編燈罩）----
  const shade = std({ color: '#d9b98c', roughness: 0.85, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe3b0').multiplyScalar(3) });
  const lampsAt = [[-0.65, -0.35], [0.0, -0.4], [0.65, -0.35]];
  for (const [x, z] of lampsAt) {
    B.add(new THREE.CylinderGeometry(0.004, 0.004, 0.6, 6), M.black, { pos: [x, 2.45, z], cast: false });
    B.add(new THREE.ConeGeometry(0.13, 0.14, 24, 1, true), shade, { pos: [x, 2.1, z], cast: false });
    B.add(new THREE.SphereGeometry(0.035, 12, 8), bulbMat, { pos: [x, 2.05, z], cast: false, receive: false });
  }

  // ---- 窗口上方：掛點單的夾子軌道 ----
  B.box(1.7, 0.02, 0.03, M.steel, 0, 2.23, L.windowZ + 0.12, { cast: false });

  // ---- 窗口外：店招（從騎樓看得到的那面也做，手機直式時抬頭看得到）----
  const sc = canvas(1024, 256), g = sc.getContext('2d');
  g.fillStyle = PALETTE.cream; g.fillRect(0, 0, 1024, 256);
  drawLogo(g, 140, 128, 92);
  g.fillStyle = PALETTE.brown; g.font = `128px ${FONT}`; g.textBaseline = 'middle'; g.fillText('晃晃茶舖', 270, 120);
  g.fillStyle = PALETTE.teal; g.font = `34px ${FONT}`; g.fillText('HUANG HUANG TEA · 手搖現做', 276, 210);
  const signMat = new THREE.MeshStandardMaterial({ map: tex(sc), emissive: '#ffffff', roughness: 0.5 });
  signMat.emissiveMap = signMat.map; signMat.emissiveIntensity = 0.45;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), signMat);
  sign.position.set(0, 2.55, L.windowZ - 0.21); sign.rotation.y = Math.PI;
  scene.add(sign);

  // 遮雨棚（從窗口往外延伸，抬頭會看到條紋）
  const awn = canvas(256, 64), ag = awn.getContext('2d');
  for (let i = 0; i < 8; i++) { ag.fillStyle = i % 2 ? PALETTE.cream : PALETTE.teal; ag.fillRect(i * 32, 0, 32, 64); }
  const awnMat = std({ map: tex(awn), roughness: 0.8, side: THREE.DoubleSide });
  B.add(new THREE.PlaneGeometry(2.6, 0.9), awnMat, { pos: [0, 2.2, L.windowZ - 0.6], rot: [-Math.PI / 2 + 0.35, 0, 0] });

  const meshes = B.build(scene);

  // ---- 手可以伸到的表面（不加進場景，只給射線用）----
  const P = (w, h, d, x, y, z, data) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
    m.position.set(x, y, z); m.userData = data; m.updateMatrixWorld(true);
    proxies.push(m);
    return m;
  };
  P(lg.x1 - lg.x0, 0.02, lg.z1 - lg.z0, 0, lg.y - 0.01, (lg.z0 + lg.z1) / 2, { kind: 'surface', ledge: true });
  // 窗外的空氣（往客人那邊伸手、甩）
  const air = new THREE.Mesh(new THREE.PlaneGeometry(6, 4));
  air.position.set(0, 2.0, L.windowZ - 0.05); air.userData = { kind: 'air' }; air.updateMatrixWorld(true);
  proxies.push(air);

  return { meshes, menu, sign };
}
