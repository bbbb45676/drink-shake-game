import * as THREE from 'three';
import { RoundedBoxGeometry } from '../gfx/builder.js';
import { faceTex } from '../gfx/textures.js';
import { L } from '../config.js';

// 客人：軟膠公仔風。大頭、圓身、霧面材質；臉是畫上去的貼圖，表情可以換。
const SKIN = ['#f6d3b6', '#efc5a3', '#e4b38f', '#d6a07a', '#f2cdb0'];
const HAIR = ['#1d1714', '#2a1e18', '#3b281d', '#5b3b27', '#7d5a3e'];

const pick = (a, r) => a[(r() * a.length) | 0];
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const mat = (color, rough = 0.62, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
// 衣服用一點 sheen 的布料感
const cloth = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.78, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4) });

const ARCHETYPES = {
  student: { top: ['#f7f5f0'], bottom: ['#2c3a5e', '#24304d'], hair: ['short', 'ponytail', 'bob'], hat: [null], extra: 'backpack', collar: '#2c3a5e', shoes: '#f2f2f2' },
  office: { top: ['#a9c7e6', '#f4f1ea', '#d9c7e8'], bottom: ['#3c3f46', '#4a4038'], hair: ['side', 'bob', 'bun'], hat: [null], extra: 'lanyard', glasses: 0.6, shoes: '#2b2421' },
  auntie: { top: ['#c2547a', '#8f5aa8', '#e08a4f', '#4f8f8a'], bottom: ['#2f2a2a', '#5a4b6a'], hair: ['perm'], hat: ['visor', null], extra: 'handbag', shoes: '#e8e0d0', pattern: true },
  delivery: { top: ['#e8a33b', '#4fa36d'], bottom: ['#2f3236'], hair: ['short'], hat: ['helmet'], extra: 'deliveryBag', shoes: '#2b2421' },
  college: { top: ['#8aa596', '#b8b1a6', '#c96e5a', '#5a6f8f'], bottom: ['#3b4a63', '#c9b99a'], hair: ['short', 'side', 'long'], hat: ['cap', null], extra: 'headphones', hood: true, shoes: '#efece6' },
  grandpa: { top: ['#f4f2ec', '#d8cfa8'], bottom: ['#8a7a5a', '#4d4a45'], hair: ['bald'], hat: [null], extra: 'slippers', shoes: '#3c6fb8' },
  hipster: { top: ['#efe6d2', '#2f3a33', '#e3c7a5'], bottom: ['#5f6b4f', '#2c2a28'], hair: ['bob', 'long'], hat: ['bucket', null], extra: 'tote', shoes: '#e9e4da' },
};
export const ARCH_KEYS = Object.keys(ARCHETYPES);

export function makeLook(seed, archetype) {
  const r = rnd(seed * 7919 + 13);
  const key = archetype || pick(ARCH_KEYS, r);
  const A = ARCHETYPES[key];
  const hairStyle = pick(A.hair, r);
  return {
    seed, key,
    skin: pick(SKIN, r),
    hairColor: key === 'grandpa' ? '#a7a29a' : key === 'auntie' && r() < 0.5 ? '#4a2f22' : pick(HAIR, r),
    hair: hairStyle,
    hat: pick(A.hat, r),
    top: pick(A.top, r),
    bottom: pick(A.bottom, r),
    shoes: A.shoes,
    extra: A.extra,
    glasses: A.glasses ? r() < A.glasses : r() < 0.15,
    hood: !!A.hood,
    collar: A.collar,
    pattern: !!A.pattern,
    height: 0.94 + r() * 0.12,
    width: 0.92 + r() * 0.18,
    lash: hairStyle === 'bob' || hairStyle === 'long' || hairStyle === 'ponytail' || key === 'auntie' ? r() < 0.8 : false,
    eye: r() < 0.25 ? 'narrow' : 'round',
    hatColor: pick(['#2c3a5e', '#c96e5a', '#e8a33b', '#efe6d2', '#3a5a40'], r),
  };
}

function capsule(r, len, m) {
  const g = new THREE.CapsuleGeometry(r, len, 6, 14);
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
function sphere(r, m, ws = 24, hs = 16) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m); s.castShadow = true; s.receiveShadow = true; return s; }

// 印花上衣（阿姨的碎花）
let flowerTex = null;
function flowers(color) {
  if (!flowerTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 14; i++) {
      const x = (i * 37) % 128, y = (i * 59) % 128;
      g.fillStyle = 'rgba(255,240,220,.9)';
      for (let k = 0; k < 5; k++) { const a = k * 1.256; g.beginPath(); g.arc(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 4.5, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(255,200,80,1)'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
    }
    flowerTex = new THREE.CanvasTexture(c); flowerTex.colorSpace = THREE.SRGBColorSpace; flowerTex.wrapS = flowerTex.wrapT = THREE.RepeatWrapping; flowerTex.repeat.set(3, 3);
  }
  const m = cloth(color); m.map = flowerTex; return m;
}

export class Figure {
  constructor(look) {
    this.look = look;
    const lk = look;
    this.root = new THREE.Group();
    const body = new THREE.Group(); // 會整個傾斜、彈跳
    this.body = body; this.root.add(body);
    const s = lk.height;
    body.scale.setScalar(s);

    const skin = mat(lk.skin, 0.55);
    const top = lk.pattern ? flowers(lk.top) : cloth(lk.top);
    const bottom = cloth(lk.bottom);
    const shoe = mat(lk.shoes, 0.5);
    const hairM = mat(lk.hairColor, 0.48);
    this.topMat = top; this.bottomMat = bottom; this.baseTop = new THREE.Color(lk.top); this.baseBottom = new THREE.Color(lk.bottom);
    this.mats = [skin, top, bottom, shoe, hairM];

    const w = lk.width;
    // 腿
    this.legs = [];
    for (const sd of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sd * 0.085 * w, 0.72, 0);
      const leg = capsule(0.07 * w, 0.44, bottom); leg.position.y = -0.33; hip.add(leg);
      const sh = new THREE.Mesh(new RoundedBoxGeometry(0.12 * w, 0.085, 0.22, 2, 0.035), shoe);
      sh.position.set(0, -0.675, 0.035); sh.castShadow = true; hip.add(sh);
      if (lk.extra === 'slippers') { const strap = new THREE.Mesh(new RoundedBoxGeometry(0.105 * w, 0.03, 0.06, 2, 0.012), mat('#f4f4f4', 0.5)); strap.position.set(0, -0.64, 0.07); hip.add(strap); const foot = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.05, 0.15, 2, 0.02), skin); foot.position.set(0, -0.645, 0.03); hip.add(foot); }
      body.add(hip); this.legs.push(hip);
    }
    // 身體：上寬下窄的軟圓柱
    const torsoPts = [];
    const bw = 0.215 * w;
    const prof = [[0.0, 0.0], [bw * 0.97, 0.0], [bw * 1.04, 0.05], [bw * 1.03, 0.2], [bw * 0.99, 0.34], [bw * 0.92, 0.44], [bw * 0.74, 0.51], [bw * 0.4, 0.545], [0.0, 0.552]];
    for (const [x, y] of prof) torsoPts.push(new THREE.Vector2(x, y));
    const torsoGeo = new THREE.LatheGeometry(torsoPts, 32);
    torsoGeo.scale(1, 1, 0.72);
    const torso = new THREE.Mesh(torsoGeo, top); torso.position.y = 0.68; torso.castShadow = true; torso.receiveShadow = true;
    body.add(torso);
    this.torso = torso;
    // 下擺／腰：褲頭
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.93, bw * 0.95, 0.1, 32), bottom); waist.scale.z = 0.72; waist.position.y = 0.7; waist.castShadow = true; body.add(waist);
    // 制服領子
    if (lk.collar) { const col = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 8, 24), mat(lk.collar, 0.6)); col.rotation.x = Math.PI / 2; col.position.y = 1.225; col.scale.set(1, 0.8, 1); body.add(col); }
    // 帽 T 的帽子
    if (lk.hood) { const hood = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 10, 24), top); hood.rotation.x = Math.PI / 2 + 0.25; hood.position.set(0, 1.19, -0.04); hood.castShadow = true; body.add(hood); }

    // 手臂
    this.arms = [];
    for (const sd of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sd * (bw * 0.9), 1.14, 0);
      const upper = capsule(0.045, 0.17, top); upper.position.y = -0.11; sh.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.23; sh.add(elbow);
      const fore = capsule(0.04, 0.14, lk.key === 'office' || lk.key === 'auntie' ? skin : lk.hood ? top : skin); fore.position.y = -0.11; elbow.add(fore);
      const hand = sphere(0.048, skin); hand.position.y = -0.2; hand.scale.set(0.95, 1.1, 0.85); elbow.add(hand);
      sh.rotation.z = sd * 0.2;
      body.add(sh);
      this.arms.push({ sh, elbow, hand, side: sd });
    }

    // 頭
    const head = new THREE.Group(); head.position.y = 1.39; body.add(head); this.head = head; this.headBaseY = 1.39;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 12), skin); neck.position.y = -0.145; head.add(neck);
    const R = 0.158;
    const skull = sphere(R, skin, 32, 24); skull.scale.set(1, 0.96, 0.96); head.add(skull);
    // 耳朵
    for (const sd of [-1, 1]) { const ear = sphere(0.026, skin, 12, 8); ear.position.set(sd * R * 0.98, -0.005, 0); ear.scale.set(0.6, 1, 0.8); head.add(ear); }
    // 臉（貼圖）
    const faceGeo = new THREE.SphereGeometry(R * 1.004, 32, 20, Math.PI / 2 - 0.78, 1.56, 0.92, 1.2);
    this.faceMat = new THREE.MeshStandardMaterial({ map: faceTex('neutral', { eye: lk.eye, lash: lk.lash }), transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, depthWrite: false });
    const face = new THREE.Mesh(faceGeo, this.faceMat); face.scale.set(1, 0.96, 0.96); face.renderOrder = 1; head.add(face);
    // 小鼻子
    const nose = sphere(0.011, skin, 10, 8); nose.position.set(0, -0.03, R * 0.955); head.add(nose);

    this.buildHair(head, R, hairM, lk);
    if (lk.glasses) {
      const gm = mat('#2a2420', 0.3, { metalness: 0.4 });
      for (const sd of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.005, 8, 24), gm); ring.position.set(sd * 0.054, -0.01, R * 0.975); ring.rotation.y = sd * 0.25; head.add(ring); }
      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 6), gm); bridge.rotation.z = Math.PI / 2; bridge.position.set(0, 0.0, R * 1.02); head.add(bridge);
    }
    this.buildExtra(body, lk, bw, top);

    this.expr = 'neutral'; this.blinkT = 2 + Math.random() * 3; this.talkT = 0;
    this.walkPhase = Math.random() * 6; this.t = Math.random() * 10;
    this.stain = 0;
  }

  buildHair(head, R, hm, lk) {
    const add = (m) => { m.castShadow = true; head.add(m); return m; };
    const cap = (r, phiS, phiL, thS, thL) => new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18, phiS, phiL, thS, thL), hm);
    const bangs = () => { const b = add(cap(R * 1.07, Math.PI / 2 - 1.0, 2.0, 0.15, 0.6)); b.scale.set(1, 0.98, 1.0); };
    switch (lk.hair) {
      case 'short': { add(cap(R * 1.06, 0, Math.PI * 2, 0, 1.25)); add(cap(R * 1.05, Math.PI / 2 + 0.9, Math.PI * 2 - 1.8, 0, 2.0)); bangs(); break; }
      case 'side': { add(cap(R * 1.065, 0, Math.PI * 2, 0, 1.2)); add(cap(R * 1.05, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, 2.0)); const b = add(cap(R * 1.08, Math.PI / 2 - 0.2, 1.3, 0.1, 0.65)); b.rotation.z = -0.15; break; }
      case 'bob': { add(cap(R * 1.1, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, 2.15)); bangs(); add(cap(R * 1.09, 0, Math.PI * 2, 0, 0.9)); break; }
      case 'long': {
        add(cap(R * 1.1, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, 2.1)); bangs(); add(cap(R * 1.09, 0, Math.PI * 2, 0, 0.9));
        const back = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.32, 0.07, 3, 0.03), hm); back.position.set(0, -0.15, -0.07); back.castShadow = true; head.add(back);
        break;
      }
      case 'ponytail': {
        add(cap(R * 1.06, 0, Math.PI * 2, 0, 1.3)); add(cap(R * 1.05, Math.PI / 2 + 0.9, Math.PI * 2 - 1.8, 0, 1.9)); bangs();
        const tie = add(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.008, 6, 12), mat('#d4423a', 0.5))); tie.position.set(0, 0.03, -R * 1.05);
        const tail = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.12, 6, 10), hm)); tail.position.set(0, -0.05, -R * 1.18); tail.rotation.x = 0.35;
        this.tail = tail;
        break;
      }
      case 'bun': { add(cap(R * 1.07, 0, Math.PI * 2, 0, 1.35)); add(cap(R * 1.05, Math.PI / 2 + 0.9, Math.PI * 2 - 1.8, 0, 1.9)); bangs(); const b = add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), hm)); b.position.set(0, R * 0.95, -R * 0.35); break; }
      case 'perm': {
        const curl = new THREE.SphereGeometry(0.036, 10, 8);
        for (let i = 0; i < 38; i++) {
          const th = 0.15 + (i % 7) / 7 * 1.6, ph = i * 2.399;
          if (th > 1.0 && Math.cos(ph) > 0.35) continue; // 臉留空
          const m = new THREE.Mesh(curl, hm);
          m.position.set(Math.sin(th) * Math.sin(ph) * R * 1.05, Math.cos(th) * R * 1.02, Math.sin(th) * Math.cos(ph) * R * 1.05);
          m.castShadow = true; head.add(m);
        }
        break;
      }
      case 'bald': {
        const ring = add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.95, 0.03, 8, 24, Math.PI * 1.2), hm)); ring.rotation.set(Math.PI / 2, 0, Math.PI * 0.9); ring.position.y = -0.005;
        const m = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.05, 4, 8), hm)); m.rotation.z = Math.PI / 2; m.position.set(0, -0.045, R * 0.96); // 小鬍子
        break;
      }
    }
    switch (lk.hat) {
      case 'cap': {
        const cm = mat(lk.hatColor, 0.6);
        const c = add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 24, 12, 0, Math.PI * 2, 0, 1.35), cm)); c.position.y = 0.015;
        const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), cm)); brim.position.set(0, 0.05, -R * 1.0); brim.rotation.x = 0.12; // 反戴
        break;
      }
      case 'bucket': {
        const cm = mat(lk.hatColor, 0.8);
        const c = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.88, R * 1.08, 0.11, 24), cm)); c.position.y = 0.1;
        const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.3, R * 1.36, 0.012, 28), cm)); brim.position.y = 0.045; brim.rotation.x = 0.08;
        break;
      }
      case 'helmet': {
        const cm = mat('#f3f1ec', 0.35);
        const c = add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.22, 28, 16, 0, Math.PI * 2, 0, 1.2), cm)); c.position.y = 0.02;
        const back = add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.2, 28, 10, Math.PI / 2 + 1.0, Math.PI * 2 - 2.0, 1.15, 0.7), cm)); back.position.y = 0.02;
        const stripe = add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.2, 0.012, 6, 32), mat('#e8a33b', 0.5))); stripe.rotation.x = Math.PI / 2; stripe.position.y = 0.03;
        const visor = add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.25, 24, 8, Math.PI / 2 - 0.9, 1.8, 1.05, 0.22), new THREE.MeshPhysicalMaterial({ color: '#7d6a56', roughness: 0.1, transparent: true, opacity: 0.5, clearcoat: 1 }))); visor.position.y = 0.01;
        break;
      }
      case 'visor': {
        const cm = mat('#f4f1ea', 0.5);
        const band = add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.07, 0.012, 6, 32), cm)); band.rotation.x = Math.PI / 2; band.position.y = 0.06;
        const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 24, 1, false, -Math.PI / 2, Math.PI), mat('#e9713b', 0.5))); brim.position.set(0, 0.055, R * 0.95); brim.rotation.x = -0.25;
        break;
      }
    }
  }

  buildExtra(body, lk, bw, topMat) {
    switch (lk.extra) {
      case 'backpack': {
        const m = mat('#3f6e8f', 0.7);
        const bp = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.34, 0.14, 3, 0.05), m); bp.position.set(0, 0.98, -0.19); bp.castShadow = true; body.add(bp);
        for (const sd of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.02), m); st.position.set(sd * 0.09, 1.0, 0.12); st.rotation.x = -0.12; body.add(st); }
        break;
      }
      case 'lanyard': {
        const l = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.005, 6, 24, Math.PI), mat('#2c7a73', 0.5)); l.position.set(0, 1.12, 0.12); l.rotation.set(0.1, 0, Math.PI); body.add(l);
        const card = new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.075, 0.006, 2, 0.006), mat('#ffffff', 0.4)); card.position.set(0, 1.0, 0.148); body.add(card);
        break;
      }
      case 'handbag': {
        const m = mat('#8a4f3a', 0.45);
        const b = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.15, 0.08, 3, 0.03), m); b.position.set(-bw - 0.07, 0.82, 0.02); b.castShadow = true; body.add(b);
        const h = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16, Math.PI), m); h.position.set(-bw - 0.07, 0.9, 0.02); body.add(h);
        break;
      }
      case 'deliveryBag': {
        const m = mat('#e8a33b', 0.55);
        const b = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.4, 0.3, 3, 0.04), m); b.position.set(0, 1.0, -0.28); b.castShadow = true; body.add(b);
        const lid = new THREE.Mesh(new RoundedBoxGeometry(0.41, 0.04, 0.31, 2, 0.015), mat('#3f3a36', 0.5)); lid.position.set(0, 1.21, -0.28); body.add(lid);
        break;
      }
      case 'headphones': {
        const m = mat('#2b2a2e', 0.4);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 24, Math.PI), m); band.position.set(0, 1.21, 0.0); band.rotation.set(-Math.PI / 2 + 0.3, 0, 0); body.add(band);
        for (const sd of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), m); cup.rotation.z = Math.PI / 2; cup.position.set(sd * 0.1, 1.2, 0.05); body.add(cup); }
        break;
      }
      case 'tote': {
        const m = mat('#e9dfc8', 0.85);
        const b = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.3, 0.05, 2, 0.02), m); b.position.set(bw + 0.07, 0.78, 0.0); b.rotation.z = 0.08; b.castShadow = true; body.add(b);
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.42, 0.01), m); st.position.set(bw * 0.6, 1.0, 0.0); st.rotation.z = -0.35; body.add(st);
        break;
      }
    }
  }

  setExpr(e) {
    if (e === this.expr) return;
    this.expr = e;
    this.faceMat.map = faceTex(e, { eye: this.look.eye, lash: this.look.lash });
    this.faceMat.needsUpdate = true;
  }

  // 被飲料潑到：衣服染色
  drench(color, k = 0.55) {
    this.stain = Math.min(1, this.stain + k);
    const c = new THREE.Color(color);
    this.topMat.color.copy(this.baseTop).lerp(c, this.stain * 0.75);
    this.bottomMat.color.copy(this.baseBottom).lerp(c, this.stain * 0.4);
  }

  // 動作：walk 0~1，talk，reach（右手伸向前），hold
  animate(dt, { walk = 0, talk = false, reach = 0, drink = 0, flail = 0, look = 0, headOff = null, headSpin = 0 }) {
    this.t += dt;
    const t = this.t;
    // 眨眼、說話
    this.blinkT -= dt;
    const baseExpr = this.override || this.baseExpr || 'neutral';
    let e = baseExpr;
    if (talk) { this.talkT += dt; if (Math.sin(this.talkT * 18) > 0 && baseExpr !== 'shock') e = 'talk'; }
    if (this.blinkT < 0) { if (this.blinkT < -0.12) this.blinkT = 2.5 + Math.random() * 3; else if (baseExpr === 'neutral' || baseExpr === 'talk') e = 'blink'; }
    this.setExpr(e);

    this.walkPhase += dt * (walk > 0 ? 9 * Math.max(0.6, walk) : 0);
    const wp = this.walkPhase;
    const sw = Math.sin(wp) * 0.55 * walk;
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    if (!this.noBob) this.body.position.y = Math.abs(Math.cos(wp)) * 0.035 * walk + Math.sin(t * 2) * 0.004 * (1 - walk);
    // 呼吸
    this.torso.scale.set(1 + Math.sin(t * 2) * 0.008, 1, 1 + Math.sin(t * 2) * 0.008);
    // 手臂
    const [L, Rr] = this.arms;
    L.sh.rotation.x = -sw * 0.8 + Math.sin(t * 1.3) * 0.02;
    Rr.sh.rotation.x = sw * 0.8;
    L.sh.rotation.z = -0.2 - flail * (0.8 + Math.sin(t * 25) * 0.6);
    Rr.sh.rotation.z = 0.2 + flail * (0.8 + Math.cos(t * 23) * 0.6);
    L.elbow.rotation.x = -0.15 - walk * 0.3;
    Rr.elbow.rotation.x = -0.15 - walk * 0.3;
    if (reach > 0) {
      Rr.sh.rotation.x = -1.25 * reach;
      Rr.sh.rotation.z = 0.12 - 0.25 * reach;
      Rr.elbow.rotation.x = -0.25 * reach;
    }
    if (drink > 0) {
      Rr.sh.rotation.x = -0.9 * drink; Rr.sh.rotation.z = 0.12 - 0.5 * drink;
      Rr.elbow.rotation.x = -1.6 * drink;
    }
    // 頭：看人、歪頭
    this.head.rotation.y = Math.sin(t * 0.5) * 0.1 * (1 - walk) + look + headSpin;
    this.head.rotation.z = Math.sin(t * 0.7 + 1) * 0.04;
    this.head.rotation.x = drink * -0.3;
    // 被手推：頭往後仰、往旁邊歪
    if (headOff) {
      this.head.position.set(headOff.x * 0.6, this.headBaseY + headOff.y * 0.4, headOff.z * 0.6);
      this.head.rotation.z += -headOff.x * 3.0;
      this.head.rotation.x += headOff.z * 3.0;
    }
    if (this.tail) this.tail.rotation.x = 0.35 + Math.sin(wp * 2) * 0.15 * walk;
  }

  // 右手掌的世界座標
  handWorld(out) { return this.arms[1].hand.getWorldPosition(out); }
}

// ---------------- 客人（行為） ----------------
export class Customer {
  constructor(scene, info) {
    Object.assign(this, info); // kind, order, rule, quote, look
    this.fig = new Figure(info.look);
    this.root = this.fig.root;
    scene.add(this.root);
    this.scene = scene;
    this.state = 'walk';
    this.target = new THREE.Vector3();
    this.path = [];
    this.speed = 1.25;
    this.facing = 0;
    this.reach = 0; this.drinkK = 0; this.flail = 0;
    this.talkT = 0;
    this.wait = 0;
    this.cup = null;
    this.vel = new THREE.Vector3(); this.spin = new THREE.Vector3();
    this.fig.baseExpr = info.kind === 'rude' ? 'smug' : 'neutral';
    this.headOff = new THREE.Vector3(); this.headVel = new THREE.Vector3(); this.headPush = new THREE.Vector3();
    this.headSpin = 0; this.headSpinV = 0; this.touchT = 0;
  }

  // 世界方向 → 客人自己的座標
  toLocal(v) { return v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.facing); }
  pushHead(world) {
    if (!world) { this.headPush.set(0, 0, 0); return; }
    this.headPush.copy(this.toLocal(world));
    this.touchT = Math.max(this.touchT, 0.25);
    if (!this.fig.override) this.fig.override = 'shock';
  }
  poke() { this.touchT = 0.6; this.fig.override = 'shock'; }
  slap(world, speed) {
    const l = this.toLocal(world);
    this.headVel.addScaledVector(l, Math.min(3, speed) * 0.9);
    this.headSpinV += (l.x >= 0 ? -1 : 1) * Math.min(14, speed * 5);
    this.touchT = 1.4; this.fig.override = this.kind === 'rude' ? 'shock' : 'angry';
    if (this.kind !== 'rude') this.fig.baseExpr = 'angry';
  }

  get pos() { return this.root.position; }

  walkTo(points, then) { this.path = points.map((p) => new THREE.Vector3(p.x, 0, p.z)); this.state = 'walk'; this.after = then; }

  say(seconds = 1.6) { this.talkT = seconds; }

  // 世界座標：客人身體中心（判斷砸中）
  hitTest(p, r = 0.05) {
    const s = this.look.height;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const y = p.y - this.pos.y;
    if (y < 0.05 || y > 1.58 * s) return false;
    const rad = y > 1.2 * s ? 0.17 : 0.24;
    return dx * dx + dz * dz < (rad + r) * (rad + r);
  }

  update(dt) {
    const f = this.fig;
    let walk = 0;
    if (this.state === 'walk' || this.state === 'flee') {
      const tgt = this.path[0];
      if (tgt) {
        const d = new THREE.Vector3().subVectors(tgt, this.pos); d.y = 0;
        const dist = d.length();
        const sp = this.state === 'flee' ? 3.6 : this.speed;
        if (dist < 0.04) { this.path.shift(); }
        else {
          d.normalize();
          this.pos.addScaledVector(d, Math.min(dist, sp * dt));
          this.facing = lerpAngle(this.facing, Math.atan2(d.x, d.z), Math.min(1, dt * 10));
          walk = this.state === 'flee' ? 1.4 : 1;
        }
      }
      if (!this.path.length && this.state === 'walk') { this.state = 'idle'; const a = this.after; this.after = null; a?.(); }
      if (!this.path.length && this.state === 'flee') { this.state = 'gone'; }
    } else if (this.state === 'idle') {
      // 面向店裡
      this.facing = lerpAngle(this.facing, this.faceTo ?? Math.PI * 0, Math.min(1, dt * 5));
    } else if (this.state === 'fly') {
      this.vel.y -= 9.81 * dt;
      this.pos.addScaledVector(this.vel, dt);
      f.body.rotation.x += this.spin.x * dt; f.body.rotation.z += this.spin.z * dt;
      this.pivot();
      if (this.pos.y <= 0 && this.vel.y < 0) {
        this.pos.y = 0;
        if (Math.abs(this.vel.y) > 1.6) { this.vel.y *= -0.35; this.vel.x *= 0.6; this.vel.z *= 0.6; this.spin.multiplyScalar(0.5); this.onBounce?.(); }
        else { this.state = 'down'; this.downT = 0; this.vel.set(0, 0, 0); }
      }
    } else if (this.state === 'down') {
      this.downT += dt;
      // 躺一下再爬起來
      if (this.downT > 0.9) {
        f.body.rotation.x *= 1 - Math.min(1, dt * 8); f.body.rotation.z *= 1 - Math.min(1, dt * 8);
        this.pivot();
        if (this.downT > 1.4) { f.body.rotation.set(0, 0, 0); f.body.position.set(0, 0, 0); this.state = 'flee'; this.after = null; }
      } else this.pivot();
    } else if (this.state === 'stagger') {
      this.staggerT += dt;
      const k = Math.max(0, 1 - this.staggerT / 0.9);
      f.body.rotation.x = -Math.sin(this.staggerT * 9) * 0.35 * k;
      this.pos.addScaledVector(this.staggerDir, dt * k * 0.9);
      if (this.staggerT > 1.0) { f.body.rotation.x = 0; this.state = 'idle'; this.staggerDone?.(); }
    }
    this.root.rotation.y = this.facing;
    // 頭的彈簧：被推會歪過去，放開彈回來
    const k = 90, damp = 11;
    this.headVel.addScaledVector(this.headPush.clone().sub(this.headOff), k * dt).multiplyScalar(Math.max(0, 1 - damp * dt));
    this.headOff.addScaledVector(this.headVel, dt);
    this.headOff.clampLength(0, 0.12);
    this.headSpinV += (-this.headSpin * 60) * dt; this.headSpinV *= Math.max(0, 1 - 7 * dt);
    this.headSpin += this.headSpinV * dt;
    if (this.touchT > 0) { this.touchT -= dt; if (this.touchT <= 0) this.fig.override = null; }
    if (this.talkT > 0) this.talkT -= dt;
    this.reach += ((this.wantReach ? 1 : 0) - this.reach) * Math.min(1, dt * 6);
    this.drinkK += ((this.drinking ? 1 : 0) - this.drinkK) * Math.min(1, dt * 4);
    this.flail += (((this.state === 'fly' || this.state === 'flee' && this.kind === 'rude') ? 1 : 0) - this.flail) * Math.min(1, dt * 6);
    f.noBob = this.state === 'fly' || this.state === 'down';
    f.animate(dt, { walk, talk: this.talkT > 0, reach: this.reach, drink: this.drinkK, flail: this.flail, look: this.lookAt || 0, headOff: this.headOff, headSpin: this.headSpin });
  }

  // 翻滾時繞著身體中間轉（不是繞著腳）
  pivot() {
    const f = this.fig, h = 0.85 * this.look.height;
    const c = new THREE.Vector3(0, h, 0);
    f.body.position.copy(c).sub(c.clone().applyEuler(f.body.rotation));
    f.body.position.y = Math.max(f.body.position.y, -h + 0.25);
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const SPOTS = {
  window: new THREE.Vector3(L.serveSpot.x, 0, L.serveSpot.z),
  queue: L.queue.map((q) => new THREE.Vector3(q.x, 0, q.z)),
  enterL: new THREE.Vector3(-7, 0, -2.6),
  enterR: new THREE.Vector3(7, 0, -2.6),
};
