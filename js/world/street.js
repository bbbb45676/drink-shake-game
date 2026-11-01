import * as THREE from 'three';
import { Builder, std, RoundedBoxGeometry } from '../gfx/builder.js';
import { tileTex, signTex, canvas, tex, rng } from '../gfx/textures.js';
import { FONT } from '../config.js';

// 窗外的台灣街景：騎樓、機車、對街的老公寓（鐵窗、冷氣、直立招牌、頂樓水塔）
const FAR_Z = -11.8;   // 對街騎樓上方的外牆
const ROAD = { z0: -4.25, z1: -11.6 };

function emissiveMat(t, k = 1.4) {
  const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: k, roughness: 0.6 });
  return m;
}

export function buildStreet(scene, phys) {
  const B = new Builder();
  const R = rng(42);

  // ---- 騎樓地板、天花板、柱子 ----
  const arcadeFloor = std({ map: tileTex({ cols: 8, rows: 8, palette: ['#9c5a43', '#a3614a', '#94553f', '#a86a50'], grout: '#6d3e2e', offset: 0, gap: 4, jitter: 0.06 }), roughness: 0.75 });
  arcadeFloor.map.wrapS = arcadeFloor.map.wrapT = THREE.RepeatWrapping; arcadeFloor.map.repeat.set(9, 2);
  B.add(new THREE.PlaneGeometry(18, 3.2), arcadeFloor, { pos: [0, 0.0, -2.65], rot: [-Math.PI / 2, 0, 0], cast: false });
  phys.fixedBox(0, -0.1, -2.65, 9, 0.1, 1.6);
  const plaster = std({ color: '#c4b8a6', roughness: 0.95 });
  B.add(new THREE.PlaneGeometry(18, 3.2), plaster, { pos: [0, 3.0, -2.65], rot: [Math.PI / 2, 0, 0], cast: false });
  // 騎樓日光燈
  const tube = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4e0').multiplyScalar(2.2) });
  for (const x of [-5, -1.6, 1.6, 5]) B.box(1.0, 0.03, 0.05, tube, x, 2.97, -2.6, { cast: false, receive: false });
  // 柱子：綠色釉面磚
  const pillarTile = std({ map: tileTex({ cols: 4, rows: 12, palette: ['#4f8a6f', '#4a8268', '#579477'], grout: '#dfe5d8', gap: 4, offset: 0 }), roughness: 0.25 });
  for (const x of [-7.2, -3.4, 3.4, 7.2]) {
    B.box(0.46, 3.0, 0.46, pillarTile, x, 1.5, -4.0);
    phys.fixedBox(x, 1.5, -4.0, 0.23, 1.5, 0.23);
  }
  // 騎樓上方外牆（從街上看是自己這棟，抬頭會看到一點）
  B.box(18, 0.5, 0.3, plaster, 0, 3.25, -4.1, { cast: false });

  // ---- 左右鄰居 ----
  // 左：半拉的鐵捲門
  const shc = canvas(256, 256), sg = shc.getContext('2d');
  sg.fillStyle = '#9aa0a3'; sg.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) { sg.fillStyle = 'rgba(255,255,255,.25)'; sg.fillRect(0, y, 256, 2); sg.fillStyle = 'rgba(0,0,0,.18)'; sg.fillRect(0, y + 5, 256, 2); }
  const shutter = std({ map: tex(shc, { repeat: [2, 3] }), metalness: 0.6, roughness: 0.45 });
  B.box(3.6, 1.8, 0.05, shutter, -3.2, 2.0, -1.12, { cast: false });
  B.add(new THREE.PlaneGeometry(3.6, 1.1), emissiveMat(signTex('', { w: 64, h: 64, bg: '#4a3626', border: 'rgba(0,0,0,0)' }), 0.5), { pos: [-3.2, 0.55, -1.15], cast: false });
  // 右：機車行
  const shopGlow = std({ color: '#2a2622', emissive: '#ffd9a0', emissiveIntensity: 0.35, roughness: 0.6 });
  B.box(3.6, 2.6, 0.05, shopGlow, 3.2, 1.3, -1.14, { cast: false });
  const s1 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.55), emissiveMat(signTex('順發機車行', { w: 1024, h: 176, bg: '#1f4f8f', fg: '#fff3d6' }), 0.9));
  s1.position.set(3.2, 2.7, -1.13); scene.add(s1);
  const s0 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.55), emissiveMat(signTex('福氣雜貨', { w: 1024, h: 176, bg: '#b8432f', fg: '#fff3d6' }), 0.9));
  s0.position.set(-3.2, 2.7, -1.13); scene.add(s0);
  for (const x of [-1.3 - 0.05, 1.3 + 0.05]) B.box(0.1, 3.0, 0.4, plaster, x, 1.5, -1.15, { cast: false });

  // ---- 路緣、馬路、標線 ----
  const curb = std({ color: '#b9b4ab', roughness: 0.9 });
  B.box(18, 0.15, 0.25, curb, 0, -0.075, ROAD.z0, { cast: false });
  const asphalt = std({ map: (() => { const c = canvas(256, 256), g = c.getContext('2d'); g.fillStyle = '#3d3a3a'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 4000; i++) { const v = 40 + R() * 40 | 0; g.fillStyle = `rgba(${v},${v},${v + 4},.5)`; g.fillRect(R() * 256, R() * 256, 1.5, 1.5); } return tex(c, { repeat: [16, 4] }); })(), roughness: 0.85 });
  B.add(new THREE.PlaneGeometry(60, 8), asphalt, { pos: [0, -0.15, -7.9], rot: [-Math.PI / 2, 0, 0], cast: false });
  phys.fixedBox(0, -0.25, -8, 30, 0.1, 4);
  const paint = std({ color: '#f1efe6', roughness: 0.6 });
  for (let x = -28; x < 28; x += 3.2) B.box(1.6, 0.005, 0.1, paint, x, -0.147, -7.9, { cast: false });
  B.box(60, 0.005, 0.1, paint, 0, -0.147, -4.6, { cast: false });
  B.box(60, 0.005, 0.1, paint, 0, -0.147, -11.2, { cast: false });
  // 斑馬線
  for (let i = 0; i < 9; i++) B.box(0.45, 0.005, 6.4, paint, 6.5 + i * 0.85, -0.146, -7.9, { cast: false });
  // 機車停等區
  const waitBox = std({ color: '#e7d27a', roughness: 0.6 });
  B.box(3.0, 0.005, 0.08, waitBox, 3.5, -0.146, -5.2, { cast: false });
  B.box(3.0, 0.005, 0.08, waitBox, 3.5, -0.146, -6.2, { cast: false });

  // ---- 對街：騎樓＋樓上的老公寓 ----
  const farArcadeFloor = std({ color: '#8f6b5a', roughness: 0.8 });
  B.add(new THREE.PlaneGeometry(60, 3), farArcadeFloor, { pos: [0, -0.0, -13.1], rot: [-Math.PI / 2, 0, 0], cast: false });
  B.box(60, 0.15, 0.25, curb, 0, -0.075, ROAD.z1, { cast: false });
  const farCeil = std({ color: '#d8ccb8', roughness: 0.95 });
  B.add(new THREE.PlaneGeometry(60, 3), farCeil, { pos: [0, 3.2, -13.1], rot: [Math.PI / 2, 0, 0], cast: false });

  const tilePalettes = [
    { cols: 10, rows: 20, palette: ['#d9c3a5', '#d4bc9c', '#ddc8ab'], grout: '#b9a487' },
    { cols: 6, rows: 24, palette: ['#c9886b', '#c27f62', '#cf9174'], grout: '#9d6650' },
    { cols: 16, rows: 16, palette: ['#e6e1d6', '#dcd7cc', '#ece8de', '#cfd6d2'], grout: '#bdb7aa', offset: 0 },
    { cols: 8, rows: 20, palette: ['#a9b8b0', '#9fb0a7', '#b2c0b8'], grout: '#87958d' },
    { cols: 10, rows: 20, palette: ['#e8d9b8', '#e2d1ad', '#efe2c4'], grout: '#c5b38f' },
  ];
  const facadeMats = tilePalettes.map((p, i) => { const m = std({ map: tileTex({ ...p, seed: 30 + i, gap: 3 }), roughness: 0.7 }); m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; return m; });
  const glassLit = std({ color: '#3a2e25', emissive: '#ffcf8a', emissiveIntensity: 0.9, roughness: 0.2 });
  const glassLit2 = std({ color: '#3a2e25', emissive: '#d9f0ff', emissiveIntensity: 0.55, roughness: 0.2 });
  const glassDark = std({ color: '#2a3340', metalness: 0.4, roughness: 0.12 });
  const grill = std({ color: '#5c534c', metalness: 0.5, roughness: 0.55 });
  const acMat = std({ color: '#d9d6cf', roughness: 0.6 });
  const tank = std({ color: '#d7d2c4', roughness: 0.4, metalness: 0.3 });
  const tin = std({ color: '#7d8f96', roughness: 0.6, metalness: 0.4 });
  const pillarFar = std({ color: '#cbbfae', roughness: 0.85 });
  const storeGlow = [
    std({ color: '#2a2420', emissive: '#ffe1b0', emissiveIntensity: 0.7 }),
    std({ color: '#2a2420', emissive: '#d8f2ff', emissiveIntensity: 0.6 }),
    std({ color: '#2a2420', emissive: '#ffc6a0', emissiveIntensity: 0.6 }),
  ];

  const names = ['小巷麵線', '晨光早餐', '金福藥局', '明亮眼鏡', '阿華滷味', '新月牙醫', '林記鐘錶', '美美髮廊', '永春水電', '老街豆花', '快樂文具', '好味便當'];
  const signColors = [['#c8312b', '#fff6e0'], ['#1f5f9e', '#ffffff'], ['#f2c230', '#3a2416'], ['#2f7d4f', '#fff6e0'], ['#f4efe4', '#b8312b'], ['#7a3b8f', '#ffffff']];
  let nameI = 0;
  const signs = [];
  let x = -30;
  let bi = 0;
  while (x < 30) {
    const w = 3.6 + R() * 2.2;
    const floors = 4 + ((R() * 3) | 0);
    const top = 3.2 + floors * 3.0;
    const fm = facadeMats[bi % facadeMats.length];
    const cx = x + w / 2;
    // 外牆
    const facade = new THREE.BoxGeometry(w, top - 3.2, 0.4);
    const uv = facade.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 3, uv.getY(i) * (top - 3.2) / 3);
    B.add(facade, fm, { pos: [cx, (top + 3.2) / 2, FAR_Z - 0.2], cast: false });
    // 樓層線
    for (let f = 1; f < floors; f++) B.box(w, 0.12, 0.08, pillarFar, cx, 3.2 + f * 3.0, FAR_Z + 0.03, { cast: false });
    // 窗＋鐵窗＋冷氣
    const nWin = w > 4.6 ? 2 : 1;
    for (let f = 0; f < floors; f++) {
      const wy = 3.2 + f * 3.0 + 1.55;
      for (let k = 0; k < nWin; k++) {
        const wx = cx + (nWin === 2 ? (k ? 1 : -1) * w * 0.22 : 0);
        const ww = nWin === 2 ? w * 0.34 : w * 0.5, wh = 1.35;
        const lit = R();
        B.add(new THREE.PlaneGeometry(ww, wh), lit < 0.42 ? glassLit : lit < 0.58 ? glassLit2 : glassDark, { pos: [wx, wy, FAR_Z + 0.005], cast: false });
        // 鐵窗：外框＋直條
        const gz = FAR_Z + 0.28;
        B.box(ww + 0.12, 0.04, 0.5, grill, wx, wy - wh / 2 - 0.05, FAR_Z + 0.25, { cast: false });
        B.box(ww + 0.12, 0.04, 0.04, grill, wx, wy + wh / 2 + 0.05, gz + 0.22, { cast: false });
        B.box(ww + 0.12, 0.04, 0.04, grill, wx, wy, gz + 0.22, { cast: false });
        const bars = Math.max(4, Math.round(ww / 0.14));
        for (let b = 0; b <= bars; b++) B.box(0.02, wh + 0.1, 0.02, grill, wx - ww / 2 + (b / bars) * ww, wy, gz + 0.22, { cast: false });
        // 鐵窗裡的盆栽、晾衣
        if (R() < 0.35) B.box(0.25, 0.22, 0.2, std({ color: R() < 0.5 ? '#4f7f4a' : '#c46a45', roughness: 0.8 }), wx - ww * 0.3, wy - wh / 2 + 0.1, gz + 0.05, { cast: false });
        if (R() < 0.6 && f > 0) {
          const acx = wx + (R() - 0.5) * ww * 0.5;
          B.add(new RoundedBoxGeometry(0.75, 0.5, 0.32, 2, 0.04), acMat, { pos: [acx, wy - wh / 2 - 0.35, FAR_Z + 0.22], cast: false });
          B.add(new THREE.CircleGeometry(0.17, 18), grill, { pos: [acx - 0.14, wy - wh / 2 - 0.35, FAR_Z + 0.385], cast: false });
        }
      }
    }
    // 頂樓：水塔、鐵皮加蓋
    if (R() < 0.7) {
      B.add(new THREE.CylinderGeometry(0.6, 0.6, 1.1, 20), tank, { pos: [cx + (R() - 0.5) * w * 0.4, top + 0.85, FAR_Z - 1.0], cast: false });
      B.box(1.4, 0.3, 1.4, pillarFar, cx, top + 0.15, FAR_Z - 1.0, { cast: false });
    }
    if (R() < 0.5) {
      B.box(w * 0.8, 2.0, 2.5, tin, cx, top + 1.0, FAR_Z - 2.2, { cast: false });
      B.add(new THREE.BoxGeometry(w * 0.85, 0.06, 2.8), tin, { pos: [cx, top + 2.05, FAR_Z - 2.2], rot: [0.12, 0, 0], cast: false });
    }
    B.box(w, 0.25, 0.5, pillarFar, cx, top + 0.12, FAR_Z - 0.2, { cast: false });
    // 一樓店面
    B.add(new THREE.PlaneGeometry(w - 0.5, 2.6), storeGlow[bi % 3], { pos: [cx, 1.4, -14.4], cast: false });
    B.box(0.45, 3.2, 0.45, pillarFar, x + 0.2, 1.6, FAR_Z - 0.2, { cast: false });
    // 橫式招牌
    const nm = names[nameI++ % names.length];
    const [bg, fg] = signColors[(bi * 7) % signColors.length];
    const hs = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, 0.75), emissiveMat(signTex(nm, { w: 1024, h: 192, bg, fg }), 0.75));
    hs.position.set(cx, 3.75, FAR_Z + 0.02); scene.add(hs);
    // 直立招牌（突出牆面，兩面都有字）
    if (R() < 0.75) {
      const nm2 = names[nameI++ % names.length];
      const [bg2, fg2] = signColors[(bi * 3 + 1) % signColors.length];
      const t2 = signTex(nm2, { w: 160, h: 640, bg: bg2, fg: fg2, vertical: true });
      const vm = emissiveMat(t2, 0.9);
      const vh = 3.2 + R() * 1.4, vy = 5.0 + R() * 3.0;
      const vs = new THREE.Group();
      for (const sd of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, vh), vm);
        p.rotation.y = sd * Math.PI / 2; p.position.x = sd * 0.06; vs.add(p);
      }
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.1, vh, 0.8), std({ color: '#3a3330', roughness: 0.6 }));
      vs.add(edge);
      vs.position.set(x + w - 0.4, vy, FAR_Z + 0.6);
      scene.add(vs); signs.push(vs);
    }
    x += w; bi++;
  }

  // 電線（橫過馬路）
  const wire = new THREE.MeshBasicMaterial({ color: '#1e1c1c' });
  for (const [x0, y0, x1, y1] of [[-12, 7.5, 9, 6.8], [-10, 8.2, 14, 7.9], [-20, 6.6, 6, 7.4]]) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x0, y0, FAR_Z + 0.4), new THREE.Vector3((x0 + x1) / 2, Math.min(y0, y1) - 0.8, -7.5), new THREE.Vector3(x1, y1, -4.3));
    B.add(new THREE.TubeGeometry(curve, 24, 0.012, 4, false), wire, { cast: false, receive: false });
  }
  // 路燈
  const pole = std({ color: '#6f7472', metalness: 0.5, roughness: 0.5 });
  const lampHead = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd79a').multiplyScalar(3) });
  for (const lx of [-9, 6]) {
    B.add(new THREE.CylinderGeometry(0.06, 0.08, 7, 10), pole, { pos: [lx, 3.35, -4.45] });
    B.box(1.4, 0.06, 0.08, pole, lx, 6.8, -4.9, { rot: [0, Math.PI / 2, 0.05] });
    B.box(0.5, 0.08, 0.2, lampHead, lx, 6.72, -5.5, { cast: false, receive: false, rot: [0, Math.PI / 2, 0] });
  }
  // 行道樹（騎樓外）
  const trunk = std({ color: '#5a4636', roughness: 0.9 });
  const leaves = [std({ color: '#3e6b3a', roughness: 0.85 }), std({ color: '#4d7d45', roughness: 0.85 }), std({ color: '#335c32', roughness: 0.85 })];
  for (const tx of [-5.4, 9.5]) {
    B.add(new THREE.CylinderGeometry(0.1, 0.14, 3.2, 10), trunk, { pos: [tx, 1.45, -4.6] });
    for (let i = 0; i < 9; i++) B.add(new THREE.IcosahedronGeometry(0.75 + R() * 0.4, 1), leaves[i % 3], { pos: [tx + (R() - 0.5) * 1.6, 3.4 + R() * 1.3, -4.6 + (R() - 0.5) * 1.4] });
  }

  // 停好的機車
  const parked = [[-6.2, -4.75, 0.2], [-5.2, -4.8, -0.1], [-2.3, -4.75, 0.1], [-1.4, -4.8, 0.05], [2.0, -4.75, -0.15], [4.6, -4.8, 0.1], [-8.0, -11.0, 3.0], [-4.0, -11.1, 3.2], [0.5, -11.0, 3.1], [3.2, -11.0, 3.15], [8.5, -11.1, 3.0]];
  const scooterColors = ['#d64a3a', '#f3efe6', '#3d6fa3', '#e8b84a', '#5c8f6a', '#2d2b2b', '#b7c4cc'];
  parked.forEach(([px, pz, ry], i) => addScooter(B, px, pz, ry + Math.PI / 2, scooterColors[i % scooterColors.length], R));

  const meshes = B.build(scene);
  return { meshes, signs };
}

const scooterShared = {};
function smat(c) { if (!scooterShared[c]) scooterShared[c] = std({ color: c, roughness: 0.35, metalness: 0.05 }); return scooterShared[c]; }
export function addScooter(B, x, z, ry, color, R, y = -0.15) {
  const body = smat(color), dark = smat('#262424'), seat = smat('#3a2e2a'), chrome = std({ color: '#cfd2d4', metalness: 1, roughness: 0.25 });
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0));
  const P = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyQuaternion(q).add(new THREE.Vector3(x, y, z)).toArray();
  const add = (geo, m, lx, ly, lz, rot = [0, 0, 0]) => {
    const e = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
    B.add(geo, m, { pos: P(lx, ly, lz), rot: q.clone().multiply(e) });
  };
  const wheel = new THREE.TorusGeometry(0.18, 0.06, 8, 18);
  add(wheel, dark, 0, 0.24, 0.55, [0, Math.PI / 2, 0]);
  add(wheel, dark, 0, 0.24, -0.55, [0, Math.PI / 2, 0]);
  add(new RoundedBoxGeometry(0.34, 0.32, 0.95, 3, 0.12), body, 0, 0.5, -0.15);
  add(new RoundedBoxGeometry(0.3, 0.12, 0.6, 3, 0.05), seat, 0, 0.72, -0.25);
  add(new RoundedBoxGeometry(0.36, 0.7, 0.18, 3, 0.08), body, 0, 0.62, 0.48, [-0.25, 0, 0]);
  add(new RoundedBoxGeometry(0.28, 0.06, 0.55, 2, 0.02), dark, 0, 0.32, 0.12);
  add(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 8), chrome, 0, 1.0, 0.55, [0, 0, Math.PI / 2]);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), chrome, 0, 0.78, 0.58, [0.25, 0, 0]);
  add(new THREE.SphereGeometry(0.07, 12, 8), smat('#fff6d8'), 0, 0.92, 0.62);
}

// 偶爾騎過去的機車（有騎士，車燈亮）
export class Traffic {
  constructor(scene) {
    this.scene = scene; this.list = []; this.t = 2;
    this.light = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2c8').multiplyScalar(4) });
    this.tail = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3a2a').multiplyScalar(3) });
  }
  spawn() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const B = new Builder();
    const colors = ['#d64a3a', '#f3efe6', '#3d6fa3', '#e8b84a', '#5c8f6a', '#2d2b2b'];
    addScooter(B, 0, 0, dir > 0 ? Math.PI / 2 : -Math.PI / 2, colors[(Math.random() * colors.length) | 0], Math.random, 0);
    const g = new THREE.Group();
    B.build(g);
    // 騎士
    const jacket = std({ color: ['#2c3a5e', '#8f3a3a', '#3a5a40', '#e8a33b', '#efe6d2'][(Math.random() * 5) | 0], roughness: 0.8 });
    const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.35, 6, 12), jacket); rider.position.set(-0.15 * dir, 1.05, 0); rider.rotation.z = -0.15 * dir; g.add(rider);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), std({ color: ['#f3f1ec', '#d64a3a', '#2d2b2b', '#3d6fa3'][(Math.random() * 4) | 0], roughness: 0.3 }));
    helmet.position.set(-0.1 * dir, 1.52, 0); g.add(helmet);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), this.light); hl.position.set(0.62 * dir, 0.92, 0); g.add(hl);
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), this.tail); tl.position.set(-0.75 * dir, 0.7, 0); g.add(tl);
    g.position.set(-24 * dir, -0.15, dir > 0 ? -6.6 : -9.2);
    this.scene.add(g);
    this.list.push({ g, v: (7 + Math.random() * 5) * dir, wob: Math.random() * 6 });
  }
  update(dt) {
    this.t -= dt;
    if (this.t < 0) { this.spawn(); this.t = 1.5 + Math.random() * 4; }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.g.position.x += s.v * dt;
      s.wob += dt;
      s.g.rotation.x = Math.sin(s.wob * 2) * 0.02;
      if (Math.abs(s.g.position.x) > 26) {
        this.scene.remove(s.g);
        s.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        this.list.splice(i, 1);
      }
    }
  }
}
