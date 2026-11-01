import * as THREE from 'three';
import { CONFIG, L, CUP } from './config.js';
import { Renderer, makeSky, makeEnvironment, makeLights } from './gfx/renderer.js';
import { initPhysics, Physics, R } from './play/physics.js';
import { makeMaterials, buildShop } from './world/shop.js';
import { Urn, Syrup, buildCupStack, Wells, buildIceBin, Sealer } from './world/stations.js';
import { buildStreet, Traffic } from './world/street.js';
import { Customer, makeLook, SPOTS } from './world/customers.js';
import { Cup, cupShared, LIQUID } from './play/cup.js';
import { Scoop } from './play/scoop.js';
import { Items, Puddles, splash, groundY, TOP_INFO } from './play/items.js';
import { HandModel, HandsInput } from './play/hands.js';
import { Hud } from './play/hud.js';
import { randomOrder, applyRule, judge, ruleDone, orderName, teaById } from './play/orders.js';
import { sfx, setMuted, isMuted, setPour } from './audio.js';
import { Quality } from './quality.js';
import { drawCard, CARD_W, CARD_H } from './resultCard.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
if (params.get('seed')) {
  let a = Number(params.get('seed')) >>> 0;
  Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const TOUCH = matchMedia('(pointer: coarse)').matches;
const Y = L.counterY, H = CUP.h;
const SC = CONFIG.score;

let rend, scene, camera, phys, M, quality, hud, input, quotes;
let urns, syrup, wells, sealer, traffic, items, puddles;
const proxies = [];
const owners = new Map();
const cups = [];
let scoops = [];
const hands = [];
const customers = [];
const ray = new THREE.Raycaster();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

const G = {
  phase: 'loading', t: 0, left: CONFIG.shift.seconds, score: 0,
  stats: { served: 0, perfect: 0, repelled: 0, hitGood: 0, waste: 0, dropped: 0, oneIce: 0 },
  money: { revenue: 0, ingredients: 0, cups: 0, comp: 0 },
  win: null, queue: [], spawned: 0, spawnT: 0, no: 0, served: [],
  yaw: 0, shake: 0, wasteAcc: 0, wastePop: 0, wastePos: new THREE.Vector3(), hintsOn: true, lastCup: null,
  capture: false,
};
window.__game = G;

// ---------------- 啟動 ----------------
async function boot() {
  try {
    const fontLoad = document.fonts?.load ? Promise.race([document.fonts.load("40px 'Huninn'"), new Promise((r) => setTimeout(r, 2500))]).catch(() => {}) : null;
    await Promise.all([initPhysics(), loadQuotes(), fontLoad]);
  } catch (e) {
    showError('載入失敗：請用本機伺服器開啟（見 README），並確認有連上網路。<br><small>' + e.message + '</small>');
    return;
  }
  quality = new Quality(onQuality);
  rend = new Renderer($('gl'), quality.q);
  LIQUID.transmission = quality.q.name !== 'low';
  if ('transmissionResolutionScale' in rend.r) rend.r.transmissionResolutionScale = quality.q.name === 'high' ? 0.75 : 0.5;
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#5f5a7e', 9, 46);
  camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.03, 140);
  camera.rotation.order = 'YXZ';
  scene.environment = makeEnvironment(rend.r);
  scene.environmentIntensity = 0.8;
  scene.add(makeSky());
  G.lights = makeLights(scene, quality.q);

  phys = new Physics();
  M = makeMaterials();
  buildShop(scene, phys, M, proxies);
  addUrnStand();
  urns = L.urns.map((u) => new Urn(scene, phys, M, proxies, u));
  syrup = new Syrup(scene, phys, M, proxies);
  const S = cupShared();
  buildCupStack(scene, M, proxies, S.shellGeo, S.shellMat);
  const topMats = Object.fromEntries(CONFIG.menu.toppings.map((t) => [t.id, new THREE.MeshStandardMaterial({ color: t.color, roughness: t.id === 'coco' ? 0.25 : 0.15, transparent: t.id === 'coco', opacity: t.id === 'coco' ? 0.85 : 1 })]));
  wells = new Wells(scene, M, proxies, topMats);
  buildIceBin(scene, M, proxies, S.iceMat);
  sealer = new Sealer(scene, phys, M, proxies);
  buildStreet(scene, phys);
  traffic = new Traffic(scene);
  scoops = wells.list.map((w) => new Scoop(scene, phys, M, w, owners));
  items = new Items(scene, quality.q.particles);
  puddles = new Puddles(scene);

  for (const side of [-1, 1]) {
    const model = new HandModel(side, scene);
    hands.push({ side, model, sx: innerWidth * (side < 0 ? 0.3 : 0.7), sy: innerHeight * 0.75, pressed: false, ptr: null, active: false, hovering: false, idle: 9, pos: new THREE.Vector3(), target: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), hist: [], held: null, quat: new THREE.Quaternion(), shakeDir: 0, shakeT: 0, jig: 0 });
  }
  hud = new Hud(camera);
  input = new HandsInput($('gl'), hands, { press: onPress, release: onRelease });

  rend.setup(scene, camera);
  onResize();
  addEventListener('resize', onResize);
  for (const h of hands) { restPos(h, h.pos); h.target.copy(h.pos); }
  await warmUp();
  buildUI();
  G.phase = 'title';
  $('loading').classList.add('fade');
  setTimeout(() => { $('loading').hidden = true; }, 500);
  $('screen-start').hidden = false;
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    frame(dt);
  };
  // ?test=1：用計時器跑（背景分頁也會動），給自動測試用
  if (params.has('test')) setInterval(tick, 33);
  else rend.r.setAnimationLoop(tick);
  window.__dbg = { THREE, scene, Customer, makeLook, rend, surfaceAt, computeTarget, proxies, G, cups, hands, customers, scoops, urns, syrup, sealer, input, camera, items, puddles, frame, onPress, onRelease, makeCustomer, toWindow, CONFIG, L };
}

// 先把會用到的著色器編譯好（第一次拿杯子、倒茶時才不會卡一下）
async function warmUp() {
  updateCamera(0);
  const c = new Cup(scene, phys, new THREE.Vector3(0, Y + 0.1, -0.4), owners);
  c.tea.black = 0.6; c.tops.pearl = 3; c.tops.coco = 2; c.ice = 2; c.seal(); c.dirty = true;
  c.lock(0, Y + 0.1, -0.4); c.sync(); c.updateVisual(0);
  for (const u of urns) u.stream.show(u.nozzle, Y, 0);
  syrup.stream.show(syrup.nozzle, Y, 0);
  items.spawn('drop', new THREE.Vector3(0, 1.2, -0.4), new THREE.Vector3(), { color: '#884422' });
  items.spawn('ball', new THREE.Vector3(0, 1.2, -0.4), new THREE.Vector3(), { color: '#3b2114' });
  items.spawn('cube', new THREE.Vector3(0, 1.2, -0.4), new THREE.Vector3(), { color: '#f4efe0' });
  items.spawn('ice', new THREE.Vector3(0, 1.2, -0.4), new THREE.Vector3());
  items.draw(); puddles.add(0, Y, -0.3, 0.01, '#884422'); puddles.update();
  try { rend.r.compile(scene, camera); } catch (e) { /* 略過 */ }
  rend.render();
  c.dispose(); cups.length = 0;
  for (const u of urns) u.stream.hide();
  syrup.stream.hide();
  items.clear(); puddles.clear();
}

async function loadQuotes() {
  const r = await fetch('data/quotes.json');
  if (!r.ok) throw new Error('quotes.json ' + r.status);
  quotes = await r.json();
}

function showError(html) { $('loading').hidden = true; const e = $('error'); e.innerHTML = html; e.hidden = false; }

function addUrnStand() {
  const x0 = -1.08, x1 = -0.28, z0 = L.urnZ - 0.14, z1 = L.urnZ + 0.12, h = L.urnStand;
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.025, z1 - z0), M.steel);
  m.position.set((x0 + x1) / 2, Y + h - 0.0125, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m);
  for (const lx of [x0 + 0.03, x1 - 0.03]) for (const lz of [z0 + 0.03, z1 - 0.03]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 10), M.steelDark);
    leg.position.set(lx, Y + h / 2, lz); leg.castShadow = true; scene.add(leg);
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.015, z1 - z0), M.steelDark);
  shelf.position.set((x0 + x1) / 2, Y + 0.06, (z0 + z1) / 2); shelf.receiveShadow = true; scene.add(shelf);
  phys.fixedBox((x0 + x1) / 2, Y + h / 2, (z0 + z1) / 2, (x1 - x0) / 2, h / 2, (z1 - z0) / 2);
  const p = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0));
  p.position.set((x0 + x1) / 2, Y + h / 2, (z0 + z1) / 2); p.userData = { kind: 'surface' }; p.updateMatrixWorld(true);
  proxies.push(p);
}

function onQuality(q) {
  rend.setQuality(q);
  LIQUID.transmission = q.name !== 'low'; // 之後拿的新杯子才會換
  if ('transmissionResolutionScale' in rend.r) rend.r.transmissionResolutionScale = q.name === 'high' ? 0.75 : 0.5;
  const sh = G.lights.key.shadow;
  if (sh.mapSize.x !== q.shadow) { sh.mapSize.set(q.shadow, q.shadow); sh.map?.dispose(); sh.map = null; }
  items.setLimit(q.particles);
}

// ---------------- 鏡頭 ----------------
function portrait() { return innerWidth / innerHeight < 0.9; }
function onResize() {
  rend.resize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  const a = camera.aspect;
  camera.fov = a < 0.6 ? 72 : a < 0.9 ? 66 : a < 1.3 ? 62 : 56;
  camera.updateProjectionMatrix();
}
function updateCamera(dt) {
  if (G.camOverride) { camera.position.copy(G.camOverride.p); camera.lookAt(G.camOverride.t); camera.updateMatrixWorld(); return; }
  const a = camera.aspect;
  const port = a < 0.9;
  const base = port ? new THREE.Vector3(0, 1.62, 0.4) : new THREE.Vector3(0, 1.68, 0.64);
  const pitch = port ? -0.38 : -0.42;
  // 頭會轉向手在的地方（直式螢幕很窄，靠這個看到兩邊的茶桶和封膜機）。
  // 用手的世界位置算，手指不動時視角會停在固定角度，不會一直轉。
  const k = port ? 0.72 : a < 1.5 ? 0.42 : 0.25, maxYaw = port ? 0.66 : 0.4;
  let sum = 0, wsum = 0;
  if (G.phase === 'play') {
    for (const h of hands) {
      if (!(h.pressed || h.hovering || h.ptr != null)) continue;
      if (h.moved) h.moveT = G.t;
      if (!(G.t - (h.moveT ?? -9) < 0.35)) continue; // 手停著不動：視角也不動
      const b = Math.atan2(-(h.target.x - camera.position.x), -(h.target.z - camera.position.z));
      const wgt = h.pressed ? 2 : 1;
      sum += b * wgt; wsum += wgt;
    }
  }
  // 兩隻手都按著（例如一手拿杯、一手開茶桶）：視角不動，兩隻手才穩
  const both = hands.every((h) => h.pressed);
  const want = both ? G.yaw : wsum ? THREE.MathUtils.clamp((sum / wsum) * k, -maxYaw, maxYaw) : G.yaw;
  G.yaw += (want - G.yaw) * Math.min(1, dt * 4);
  if (G.phase === 'title') G.yaw = Math.sin(G.t * 0.25) * 0.12;
  camera.position.copy(base);
  camera.position.y += Math.sin(G.t * 1.6) * 0.003;
  // 手機直式：轉頭時順便往那邊靠一點
  camera.position.x += -G.yaw * 0.25;
  if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake * 0.03; camera.position.y += (Math.random() - 0.5) * G.shake * 0.03; G.shake = Math.max(0, G.shake - dt * 3); }
  camera.rotation.set(pitch, G.yaw, 0);
  camera.updateMatrixWorld();
}

// ---------------- 手的位置 ----------------
const surfaceProxies = () => proxies.filter((p) => ['surface', 'well', 'ice', 'air', 'lever', 'syrupBtn'].includes(p.userData.kind));
let SURF = null;
const pickProxies = () => proxies.filter((p) => ['lever', 'syrupBtn', 'cupStack', 'ice', 'well'].includes(p.userData.kind));
let PICK = null;

function ndc(x, y) { return new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); }

// 射線打到客人的頭（球）
const _sph = new THREE.Sphere(), _hp = new THREE.Vector3();
function faceHit(r) {
  let best = null, bd = Infinity;
  for (const c of customers) {
    if (!['idle', 'walk', 'stagger'].includes(c.state)) continue;
    c.fig.head.getWorldPosition(_sph.center);
    _sph.radius = 0.16 * c.look.height;
    if (!r.intersectSphere(_sph, _hp)) continue;
    const d = _hp.distanceTo(r.origin);
    if (d < bd) { bd = d; best = { point: _hp.clone(), kind: 'face', data: { cust: c }, normal: _hp.clone().sub(_sph.center).normalize() }; }
  }
  return best;
}

// 手碰到客人的臉：推得動，打得快＝巴下去
const SLAP_GOOD = ['欸！你幹嘛！', '很痛欸！', '我只是來買飲料的⋯'];
const SLAP_RUDE = ['蛤？你打我？', '我要拍下來 PO 網！', '你們店員打人啦！'];
function updateFaces(dt) {
  if (G.phase !== 'play') return;
  for (const c of customers) {
    if (!['idle', 'walk', 'stagger'].includes(c.state)) continue;
    const C = c.fig.head.getWorldPosition(new THREE.Vector3());
    const rad = 0.16 * c.look.height + 0.045;
    let push = null;
    for (const h of hands) {
      if (h.held && h.held.kind !== 'air') continue;
      const d = h.pos.clone().sub(C), dist = d.length();
      // 按著的手指劃過臉（畫面上）也算碰到：快速一揮手可能一兩幀就過去了
      const overFace = h.pressed && h.surf?.kind === 'face' && h.surf.data.cust === c;
      if (dist >= rad && !overFace) { if (h.faceTouch === c) h.faceTouch = null; continue; }
      const dir = dist < rad ? d.multiplyScalar(-1 / Math.max(dist, 1e-4)) : C.clone().sub(camera.position).setY(0).normalize(); // 推的方向
      if (dist < rad) push = (push || new THREE.Vector3()).addScaledVector(dir, Math.min(0.09, rad - dist + 0.01));
      const sp = Math.max(h.vel.length(), (h.ss || 0) * 1.2);
      const swipe = new THREE.Vector3(h.sx - (h.psx ?? h.sx), 0, 0);
      if (sp > 1.3 && Math.abs(swipe.x) > 1) dir.add(new THREE.Vector3(Math.sign(swipe.x) * 0.8, 0, 0).applyQuaternion(camera.quaternion)).normalize();
      if (h.faceTouch !== c) {
        h.faceTouch = c;
        if (sp > 1.3) {
          c.slap(dir, sp); sfx.thud(); G.shake = Math.max(G.shake, 0.25);
          hud.say(c, pick(c.kind === 'rude' ? SLAP_RUDE : SLAP_GOOD), { hot: true, time: 1.8 });
        } else c.poke();
      }
    }
    c.pushHead(push);
  }
  for (const h of hands) { h.psx = h.sx; }
}

let SURF_HOLD = null;
function surfaceAt(sx, sy, holding = false) {
  ray.setFromCamera(ndc(sx, sy), camera);
  SURF ||= surfaceProxies();
  SURF_HOLD ||= SURF.filter((p) => p.userData.kind !== 'lever' && p.userData.kind !== 'syrupBtn');
  const hit = ray.intersectObjects(holding ? SURF_HOLD : SURF, false)[0];
  // 空手可以伸到客人臉上
  if (!holding && (!hit || hit.object.userData.kind === 'air')) {
    const f = faceHit(ray.ray);
    if (f) return f;
  }
  if (hit) return { point: hit.point.clone(), kind: hit.object.userData.kind, data: hit.object.userData };
  return { point: ray.ray.at(1.2, new THREE.Vector3()), kind: 'air', data: {} };
}

function restPos(h, out) {
  // 畫面左下／右下，跟著鏡頭
  const d = camera.aspect < 0.9 ? 0.62 : 0.5;
  const hh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * d;
  const hw = hh * camera.aspect;
  out.set(h.side * hw * 0.6, -hh * 0.8, -d).applyMatrix4(camera.matrixWorld);
  return out;
}

function cupHandOffset(h) { return _v2.set(h.side * (CUP.rTop + 0.026), -0.005, 0.012); }

// 台面上其他杯子的高度：手和拿著的東西要從杯口上方過
function cupTopAt(x, z, hand, pad = 0.02) {
  let top = -Infinity;
  for (const c of cups) {
    // 另一隻手拿著的杯子也要算（一手拿杯、一手舀料）
    if (!c.alive || (hand && c.held === hand) || c.taken || c.dropped) continue;
    if (Math.hypot(c.pos.x - x, c.pos.z - z) < CUP.rTop + pad) top = Math.max(top, c.pos.y + H / 2 + (c.sealed ? 0.006 : 0));
  }
  return top;
}

function computeTarget(h, out) {
  const s = surfaceAt(h.sx + (h.ox || 0), h.sy + (h.oy || 0), ['cup', 'scoop', 'ice'].includes(h.held?.kind));
  const P = s.point;
  h.surf = s;
  const held = h.held;
  if (s.kind !== 'air' && held?.kind !== 'cup') {
    const top = cupTopAt(P.x, P.z, h, held?.kind === 'scoop' ? 0.045 : 0.03);
    if (top > P.y) P.y = top + (held?.kind === 'scoop' ? 0.012 : 0.0);
  }
  if (held?.kind === 'cup') {
    if (s.kind !== 'air') P.y += H / 2 + 0.012;
    out.copy(P).add(cupHandOffset(h));
  } else if (held?.kind === 'scoop') {
    if (s.kind !== 'air') P.y += s.kind === 'well' ? 0.028 : 0.034;
    h.bowlTarget = P.clone();
    out.copy(P).add(held.scoop.handleOffset(held.q || _q.identity()));
  } else if (held?.kind === 'lever' || held?.kind === 'syrup') {
    out.copy(P); out.y += 0.05;
  } else {
    out.copy(P);
    if (s.kind === 'lever' || s.kind === 'syrupBtn') out.y += 0.02;
    else if (s.kind === 'face') out.addScaledVector(s.normal, h.pressed ? 0.012 : 0.06); // 按住＝手貼在臉上推
    else if (s.kind !== 'air') out.y += h.pressed ? 0.035 : 0.06;
  }
  // 手臂長度有限
  const sh = _v.set(h.side * 0.12, -0.3, 0).applyMatrix4(camera.matrixWorld);
  const d = out.distanceTo(sh);
  if (d > 2.4) out.sub(sh).multiplyScalar(2.4 / d).add(sh); // 要伸得到窗口客人的臉
  return out;
}

function updateHands(dt) {
  for (const h of hands) {
    const live = G.phase === 'play' && (h.pressed || h.hovering || h.ptr != null);
    h.moved = false;
    // 手指／游標在畫面上的速度（每秒幾個畫面高）：拿來判斷巴下去
    const ssp = h.lsx != null ? Math.hypot(h.sx - h.lsx, h.sy - h.lsy) / innerHeight / Math.max(dt, 1e-3) : 0;
    h.ss = (h.ss || 0) * 0.5 + ssp * 0.5; h.lsx = h.sx; h.lsy = h.sy;
    if (live) { computeTarget(h, h.target); h.idle = 0; }
    else {
      h.idle += dt;
      if (h.idle > (TOUCH ? 1.2 : 2.5) || G.phase !== 'play') restPos(h, h.target);
    }
    const k = 1 - Math.exp(-dt * (live ? 32 : 7));
    const prev = h.pos.clone();
    h.pos.lerp(h.target, k);
    // 速度（拿來丟東西）：最近 80ms 的平均
    const now = G.t;
    h.hist.push({ t: now, p: h.pos.clone() });
    while (h.hist.length > 2 && now - h.hist[0].t > 0.08) h.hist.shift();
    const a = h.hist[0];
    const newVel = now - a.t > 0.001 ? _v.copy(h.pos).sub(a.p).divideScalar(now - a.t) : _v.set(0, 0, 0);
    h.acc.lerp(_v2.copy(newVel).sub(h.vel).divideScalar(Math.max(dt, 0.001)), 0.3);
    h.vel.copy(newVel);
    h.frameMove = h.pos.distanceTo(prev);
    poseHand(h, dt);
  }
}

function poseHand(h, dt) {
  const m = h.model;
  // 手腕朝向自己的肩膀：伸到遠處時手會自然地斜過去
  const sh = _v2.set(h.side * 0.22, -0.35, 0.15).applyMatrix4(camera.matrixWorld);
  const reachYaw = Math.atan2(-(h.pos.x - sh.x), -(h.pos.z - sh.z));
  let pose = 'hover', pitch = -0.28, roll = h.side * 0.12, yaw = reachYaw - h.side * 0.12;
  const held = h.held;
  if (held?.kind === 'cup') { pose = 'grip'; pitch = 0.05; roll = -h.side * Math.PI / 2 * 0.92; yaw = G.yaw * 0.6; }
  else if (held?.kind === 'scoop') { pose = 'fist'; pitch = -0.15; roll = h.side * 0.3; yaw = G.yaw * 0.6; }
  else if (!(h.hovering || h.ptr != null || h.pressed) && h.idle > 1) { yaw = G.yaw - h.side * 0.25; }
  else if (held?.kind === 'ice') { pose = 'pinch'; pitch = -0.35; }
  else if (held?.kind === 'lever' || held?.kind === 'syrup') { pose = 'point'; pitch = -0.6; }
  else if (h.pressed) { pose = 'fist'; pitch = -0.4; }
  else if (!(h.hovering || h.ptr != null) && h.idle > 1) { pose = 'open'; pitch = -0.1; }
  // 往前甩的時候手腕跟著翻
  pitch += THREE.MathUtils.clamp(-h.vel.y * 0.06, -0.4, 0.4);
  _e.set(pitch, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);
  h.quat.slerp(_q, Math.min(1, dt * 16));
  m.root.position.copy(h.pos);
  m.root.quaternion.copy(h.quat);
  m.setPose(pose, dt);
}

// ---------------- 按下／放開 ----------------
function pickAt(h) {
  ray.setFromCamera(ndc(h.sx + (h.ox || 0), h.sy + (h.oy || 0)), camera);
  PICK ||= pickProxies();
  const objs = [...PICK];
  for (const c of cups) if (c.alive && !c.taken && !c.dropped) objs.push(c.pick);
  for (const s of scoops) objs.push(s.pick);
  const hits = ray.intersectObjects(objs, false);
  // 杯子、勺子優先（它們比較小）
  const pref = hits.find((x) => x.object.userData.kind === 'cup' || x.object.userData.kind === 'scoop');
  const hit = pref && (!hits[0] || pref.distance - hits[0].distance < 0.12) ? pref : hits[0];
  if (hit) return { ...hit.object.userData, point: hit.point };
  // 沒點到：看手附近有沒有杯子
  computeTarget(h, _v);
  let best = null, bd = 0.09;
  for (const c of cups) { if (!c.alive || c.taken || c.dropped) continue; const d = c.pos.distanceTo(_v); if (d < bd) { bd = d; best = c; } }
  if (best) return { kind: 'cup', cup: best };
  return { kind: 'none' };
}

function onPress(h) {
  if (G.phase !== 'play') return;
  const p = pickAt(h);
  const other = hands.find((x) => x !== h);
  switch (p.kind) {
    case 'cup': {
      const c = p.cup;
      if (c.locked || c.taken) break;
      if (c.held && c.held !== h) break; // 另一隻手拿著：不搶
      h.held = { kind: 'cup', cup: c }; c.grab(h); G.lastCup = c; sfx.grab();
      return;
    }
    case 'well': {
      const s = scoops.find((s) => s.well.top === p.top);
      if (s && !s.held) { grabScoop(h, s); return; }
      break;
    }
    case 'scoop': {
      if (p.scoop.held && p.scoop.held !== h) break;
      grabScoop(h, p.scoop); return;
    }
    case 'cupStack': {
      if (cups.filter((c) => c.alive && !c.taken).length >= 9) { cleanupCups(true); }
      computeTarget(h, _v);
      const c = new Cup(scene, phys, _v.clone().sub(cupHandOffset(h)), owners);
      cups.push(c);
      spend('cups', MON.cup);
      h.held = { kind: 'cup', cup: c }; c.grab(h); G.lastCup = c; sfx.grab();
      return;
    }
    case 'ice': { h.held = { kind: 'ice' }; h.model.ice.visible = true; sfx.clink(); spend('ingredients', MON.ice); return; }
    case 'lever': { h.held = { kind: 'lever', urn: p.urn }; G.didTap = true; return; } // 按住才出茶
    case 'syrupBtn': { syrup.pressed = true; h.held = { kind: 'syrup' }; sfx.button(); return; }
  }
  h.held = { kind: 'air' }; h.dwellKey = null; h.dwellT = 0;
  void other;
}

function grabScoop(h, s) {
  h.held = { kind: 'scoop', scoop: s, q: new THREE.Quaternion() };
  s.grab(h); sfx.grab();
}

function throwVel(h) {
  const v = h.vel.clone().multiplyScalar(CONFIG.throw.boost);
  const sp = v.length();
  if (sp < 1.6) return v;
  // 往客人的方向甩：自動修正瞄準
  const from = h.pos;
  const vxz = new THREE.Vector2(v.x, v.z);
  if (vxz.length() < 0.5 || v.z > 0) return v;
  let best = null, ba = THREE.MathUtils.degToRad(CONFIG.throw.aimAssistDeg);
  for (const c of customers) {
    if (!['idle', 'walk'].includes(c.state)) continue;
    const to = new THREE.Vector2(c.pos.x - from.x, c.pos.z - from.z);
    const ang = Math.abs(Math.atan2(vxz.x * to.y - vxz.y * to.x, vxz.dot(to)));
    if (ang < ba) { ba = ang; best = c; }
  }
  if (!best) return v;
  const tgt = new THREE.Vector3(best.pos.x, 1.1 * best.look.height, best.pos.z);
  const dxz = new THREE.Vector2(tgt.x - from.x, tgt.z - from.z);
  const dist = dxz.length();
  const hs = Math.max(vxz.length(), 4.2);
  const t = dist / hs;
  const vy = (tgt.y - from.y + 0.5 * 9.81 * t * t) / t;
  dxz.normalize().multiplyScalar(hs);
  return new THREE.Vector3(dxz.x, vy, dxz.y);
}

function onRelease(h) {
  const held = h.held;
  h.held = null;
  if (!held) return;
  if (held.kind === 'cup') {
    const c = held.cup;
    if (!c.alive || c.held !== h) return;
    const v = throwVel(h);
    unOverlap(c);
    if (v.length() < 1.2) {
      // 輕輕放開＝放下：找底下的東西，近就直接擺正放好（不會自動吸到出水口）
      const place = placeSpot(c);
      c.release(place ? new THREE.Vector3(0, 0, 0) : v.multiplyScalar(0.3), { x: 0, y: 0, z: 0 }, place);
    } else {
      c.release(v, { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 6 });
    }
    c.thrown = v.length() > 1.4; c.releaseT = G.t;
    if (c.thrown) sfx.whoosh();
    // 直接交到客人手上
    const w = G.win;
    if (w && w.state === 'idle' && w.waiting && v.length() < CONFIG.throw.handOverSpeed) {
      const hp = w.fig.handWorld(_v);
      if (c.pos.distanceTo(hp) < 0.32 || (c.pos.z < L.ledge.z1 + 0.02 && Math.abs(c.pos.x - w.pos.x) < 0.6)) handOver(w, c);
    }
  } else if (held.kind === 'scoop') {
    held.scoop.release(throwVel(h));
    if (held.scoop.load > 0 && held.scoop.mode === 'free') {
      for (let i = 0; i < held.scoop.load; i++) items.spawn(TOP_INFO[held.scoop.loadType].shape === 'ball' ? 'ball' : 'cube', held.scoop.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.01, (Math.random() - 0.5) * 0.02)), new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5), { top: held.scoop.loadType, color: TOP_INFO[held.scoop.loadType].color });
      held.scoop.setLoad(0);
    }
  } else if (held.kind === 'ice') {
    h.model.ice.visible = false;
    const p = h.model.ice.getWorldPosition(new THREE.Vector3());
    p.x = h.pos.x; p.z = h.pos.z; // 從手掌正下方掉下去
    const iv = throwVel(h).multiplyScalar(0.8);
    if (iv.length() < 1.2) {
      // 手在杯口附近放開：冰塊掉進杯子正中間
      for (const c of cups) {
        if (!c.alive || c.sealed || c.taken || c.up.y < 0.8) continue;
        const rim = c.rimCenter(new THREE.Vector3());
        if (Math.hypot(rim.x - p.x, rim.z - p.z) < 0.08 && p.y > rim.y - 0.02 && p.y < rim.y + 0.3) { p.set(rim.x, Math.max(p.y, rim.y + 0.02), rim.z); iv.set(0, 0, 0); break; }
      }
    }
    items.spawn('ice', p, iv);
  } else if (held.kind === 'syrup') {
    syrup.pressed = false;
  }
}

// 放開時如果跟別的杯子疊在一起（拿著時是穿過去的），先輕輕挪開，不要被物理彈飛
function unOverlap(c) {
  const R2 = (CUP.rTop + CUP.rBot) + 0.004;
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (const o of cups) {
      if (o === c || !o.alive || o.taken || o.held) continue;
      if (Math.abs(o.pos.y - c.pos.y) > H) continue;
      const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z, d = Math.hypot(dx, dz);
      if (d >= R2) continue;
      const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
      c.pos.x = o.pos.x + nx * R2; c.pos.z = o.pos.z + nz * R2;
      moved = true;
    }
    if (!moved) break;
  }
  c.body.setNextKinematicTranslation({ x: c.pos.x, y: c.pos.y, z: c.pos.z });
  c.body.setTranslation({ x: c.pos.x, y: c.pos.y, z: c.pos.z }, true);
}

// 放開時：底下是什麼？夠近就直接放好（擺正、不轉、放在原地）
function placeSpot(c) {
  const bottom = c.pos.y - H / 2;
  const r = new R.Ray({ x: c.pos.x, y: bottom + 0.01, z: c.pos.z }, { x: 0, y: -1, z: 0 });
  const hit = phys.world.castRay(r, 0.2, true, undefined, undefined, undefined, c.body);
  if (!hit) return null; // 底下是空的（例如伸到台面外）：照物理掉下去
  const toi = hit.timeOfImpact ?? hit.toi;
  const owner = owners.get(hit.collider.handle);
  if (owner instanceof Cup || owner instanceof Scoop) return null; // 疊在別的杯子上：讓物理決定
  if (toi > 0.12) return null;
  return new THREE.Vector3(c.pos.x, bottom + 0.01 - toi + H / 2 + 0.002, c.pos.z);
}

// ---------------- 拿著東西時 ----------------
function updateHeld(dt) {
  for (const h of hands) {
    const held = h.held;
    if (!held) continue;
    if (held.kind === 'cup') {
      const c = held.cup;
      if (!c.alive || c.held !== h) { h.held = null; continue; }
      const center = _v.copy(h.pos).sub(cupHandOffset(h));
      c.setHeldCollision(false); // 拿在手上：穿過其他杯子，不會推倒
      // 跟著手的加速度晃一點
      const tx = THREE.MathUtils.clamp(-h.acc.z * 0.003, -0.2, 0.2), tz = THREE.MathUtils.clamp(h.acc.x * 0.003, -0.2, 0.2);
      c.tiltX = (c.tiltX || 0) + (tx - (c.tiltX || 0)) * Math.min(1, dt * 10);
      c.tiltZ = (c.tiltZ || 0) + (tz - (c.tiltZ || 0)) * Math.min(1, dt * 10);
      _q.setFromEuler(_e.set(c.tiltX, 0, c.tiltZ));
      c.moveTo(center, _q);
      detectShake(h, c, dt);
    } else if (held.kind === 'scoop') {
      const s = held.scoop;
      if (s.held !== h) { h.held = null; continue; }
      const bowl = h.pos.clone().sub(s.handleOffset(held.q));
      // 在料槽裡移動 → 舀起來
      const w = wells.at(bowl.x, bowl.z);
      // 勺子裡已經有別的料：經過其他料槽不會混到
      if (w && bowl.y < Y - 0.004 && !(s.load > 0.5 && s.loadType !== w.top)) {
        const before = Math.round(s.load), raw = s.load;
        s.setLoad(s.load + (h.frameMove || 0) * CONFIG.pour.scoopPerMeter + dt * 1.5, w.top);
        spend('ingredients', (s.load - raw) * MON.toppingPiece);
        if (Math.round(s.load) > before) sfx.scoop();
      }
      // 在杯口上方 → 傾倒
      let target = null;
      for (const c of cups) {
        if (!c.alive || c.sealed || c.taken || c.up.y < 0.8) continue;
        const rim = c.rimCenter(_v2);
        if (Math.hypot(bowl.x - rim.x, bowl.z - rim.z) < 0.085 && bowl.y > rim.y - 0.03 && bowl.y < rim.y + 0.3) { target = c; break; }
      }
      held.tilt = (held.tilt || 0) + ((target ? 1 : 0) - (held.tilt || 0)) * Math.min(1, dt * 9);
      _e.set(-0.05, 0, -h.side * held.tilt * 1.7);
      held.q.setFromEuler(_e);
      s.moveBowl(bowl, held.q);
      // 勺子經過杯口上方：整勺倒進去（不用停著等）
      if (target && s.load >= 1) {
        const info = TOP_INFO[s.loadType];
        const rim = target.rimCenter(new THREE.Vector3());
        const n = Math.round(s.load);
        for (let i = 0; i < n; i++) {
          const from = new THREE.Vector3(rim.x + (Math.random() - 0.5) * 0.03, rim.y + 0.02 + Math.random() * 0.04, rim.z + (Math.random() - 0.5) * 0.03);
          items.spawn(info.shape === 'ball' ? 'ball' : 'cube', from, new THREE.Vector3((Math.random() - 0.5) * 0.04, -0.3 - Math.random() * 0.3, (Math.random() - 0.5) * 0.04), { top: s.loadType, color: info.color });
        }
        s.setLoad(0);
        sfx.plop();
        G.lastCup = target;
      }
    } else if (held.kind === 'syrup') {
      const btn = _v.set(L.syrup.x, Y + 0.34, L.syrup.z);
      syrup.pressed = h.pos.distanceTo(btn) < 0.16;
    } else if (held.kind === 'air') {
      // 握拳的手伸進料槽＝抓勺子、伸進冰桶＝抓一顆冰（電腦版：左鍵拿著杯子，按住右鍵移過去）
      // 要在料槽／冰桶上停一下（約 0.25 秒）才會抓，只是經過不會抓
      const sk = h.surf?.kind;
      const key = sk === 'well' ? 'well:' + h.surf.data.top : sk === 'ice' ? 'ice' : null;
      if (key !== h.dwellKey) { h.dwellKey = key; h.dwellT = 0; }
      h.dwellT = (h.dwellT || 0) + dt;
      if (key && h.dwellT > 0.25 && h.frameMove < 0.004) {
        if (sk === 'well') {
          const sc = scoops.find((x) => x.well.top === h.surf.data.top && !x.held);
          if (sc) { grabScoop(h, sc); continue; }
        } else {
          h.held = { kind: 'ice' }; h.model.ice.visible = true; sfx.clink(); spend('ingredients', MON.ice); continue;
        }
      }
      // 握拳的手碰到開關／按鈕＝按下去（電腦版第二隻手就是這樣操作）
      // 握拳壓著開關＝出茶，手離開就停
      let touching = null;
      for (const u of urns) if (h.pos.distanceTo(u.pickPos) < 0.095) touching = u;
      h.contact = touching || (h.contact && h.pos.distanceTo(h.contact.pickPos) < 0.14 ? h.contact : null);
      const btn = _v.set(L.syrup.x, Y + 0.34, L.syrup.z + 0.02);
      if (h.pos.distanceTo(btn) < 0.1) { h.held = { kind: 'syrup' }; syrup.pressed = true; sfx.button(); }
    }
  }
}

// 拿著杯子快速來回晃＝搖
function detectShake(h, c, dt) {
  const v = h.vel;
  const ax = Math.abs(v.x) > Math.abs(v.y) ? 'x' : 'y';
  const comp = v[ax];
  h.shakeT += dt;
  c.jiggle = Math.max(0, (c.jiggle || 0) - dt * 2);
  if (h.shakeT > 0.35) { h.shakeDir = 0; h.shakeRun = 0; } // 停下來就重新算
  if (Math.abs(comp) > 0.45) {
    const dir = Math.sign(comp);
    if (h.shakeDir && dir !== h.shakeDir && h.shakeT > 0.05) {
      h.shakeT = 0;
      h.shakeRun = (h.shakeRun || 0) + 1;
      if (c.sealed) {
        c.shakes++;
        c.mix = Math.min(1, c.shakes / CONFIG.pour.shakesToMix);
        c.jiggle = Math.min(1, c.jiggle + 0.35);
        if (c.shakes % 2 === 0) sfx.shake();
        if (c.shakes === CONFIG.pour.shakesToMix) { hud.popup(c.pos.clone().add(new THREE.Vector3(0, 0.12, 0)), '搖勻了！', 'good small'); sfx.good(); }
      } else if (c.level > 0.6 && h.shakeRun >= 2) {
        // 沒封膜還搖：會灑
        spillFrom(c, 0.08 + (c.level - 0.6) * 0.3, v);
      }
    }
    if (!h.shakeDir) h.shakeT = 0;
    h.shakeDir = dir;
  }
}

// ---------------- 倒茶、果糖 ----------------
const rcast = (p, maxToi = 2.5) => {
  const r = new R.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 });
  const hit = phys.world.castRay(r, maxToi, true);
  if (!hit) return null;
  const toi = hit.timeOfImpact ?? hit.toi;
  return { y: p.y - toi, owner: owners.get(hit.collider.handle) };
};

function pourSource(nozzle, stream, dt, rate, addFn, color, isSyrup) {
  const start = _v.copy(nozzle);
  const hit = rcast(start.clone().add(new THREE.Vector3(0, -0.004, 0)));
  let bottom = hit ? hit.y : 0;
  const cup = hit?.owner instanceof Cup ? hit.owner : null;
  if (cup && cup.up.y > 0.85 && !cup.sealed && !cup.taken) {
    const over = addFn(cup, rate * dt);
    const lvl = Math.min(1, cup.level);
    bottom = cup.bottomCenter(_v2).y + lvl * (H - 0.004);
    G.lastCup = cup;
    if (over > 0) spillFrom(cup, 0, null, over); // 滿出來
  } else {
    // 倒在台面、地上、封好的杯膜上
    const vol = isSyrup ? rate * dt * CONFIG.pour.syrupVolume : rate * dt;
    const gy = hit ? hit.y : groundY(nozzle.x, nozzle.z);
    waste(vol, new THREE.Vector3(nozzle.x, gy, nozzle.z), color, true);
    if (Math.random() < dt * 30) splash(items, new THREE.Vector3(nozzle.x, gy + 0.005, nozzle.z), new THREE.Vector3(0, 0.3, 0), color, 2, { speed: 0.8, up: 1.5 });
  }
  stream.show(nozzle, bottom, dt);
}

function updatePouring(dt) {
  let flows = 0;
  for (const u of urns) {
    // 茶桶：有手按住開關才出茶（放開就停），比較好控制量
    const held = G.phase === 'play' && hands.some((h) => (h.held?.kind === 'lever' && h.held.urn === u && h.pos.distanceTo(u.pickPos) < 0.16) || (h.held?.kind === 'air' && h.contact === u));
    if (held !== u.open) { u.open = held; sfx.lever(); }
    u.update(dt);
    if (u.flow > 0.5) {
      flows++;
      const t = teaById(u.tea);
      pourSource(u.nozzle, u.stream, dt, CONFIG.pour.teaRate, (c, a) => c.addLiquid(u.tea, a), t.color, false);
      spend('ingredients', CONFIG.pour.teaRate * dt * MON.tea[u.tea]);
    } else u.stream.hide();
  }
  syrup.update(dt);
  if (syrup.press > 0.5) {
    flows += 0.5;
    pourSource(syrup.nozzle, syrup.stream, dt, CONFIG.pour.syrupRate, (c, a) => c.addSugar(a) * CONFIG.pour.syrupVolume, '#f2c76a', true);
    spend('ingredients', CONFIG.pour.syrupRate * dt * MON.syrup);
  } else syrup.stream.hide();
  setPour(flows, flows > 1 ? 1.4 : 1);
}

// 浪費（灑出來的飲料量，以「一杯」為單位）
function waste(vol, pos, color, puddle = true) {
  if (vol <= 0) return;
  if (puddle) puddles.add(pos.x, pos.y, pos.z, vol, color);
  if (G.phase !== 'play') return;
  G.stats.waste += vol;
  G.wasteAcc += vol;
  G.wastePos.copy(pos);
  const per = -SC.wastePerCup;
  const pts = Math.floor(G.wasteAcc * per);
  if (pts >= 1) { G.wasteAcc -= pts / per; addScore(-pts, null, true); G.wastePop += pts; }
}

// 從杯口灑出來：frac＝灑掉幾成，或直接給量
function spillFrom(c, frac, vel, vol) {
  const lost = vol ?? c.lose(frac);
  if (lost <= 0) return;
  const rim = c.rimCenter(new THREE.Vector3());
  const tilt = new THREE.Vector3(c.up.x, 0, c.up.z);
  const dir = tilt.lengthSq() > 0.0001 ? tilt.normalize() : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
  const n = Math.min(26, 3 + Math.round(lost * 60));
  const color = '#' + c.color().getHexString();
  for (let i = 0; i < n; i++) {
    const p = rim.clone().addScaledVector(dir, CUP.rTop * 0.9);
    const v = dir.clone().multiplyScalar(0.25 + Math.random() * 0.4).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.4, (Math.random() - 0.5) * 0.3));
    if (vel) v.addScaledVector(vel, 0.4);
    items.spawn('drop', p, v, { color, vol: lost / n });
  }
}

// ---------------- 杯子的物理事件 ----------------
function updateCups(dt) {
  for (let i = cups.length - 1; i >= 0; i--) {
    const c = cups[i];
    if (!c.alive) { cups.splice(i, 1); continue; }
    c.sync();
    c.updateVisual(dt);
    c.age += dt;
    if (c.taken) continue;
    // 傾斜灑出
    if (!c.sealed && c.level > 0.01) {
      const th = Math.acos(THREE.MathUtils.clamp(c.up.y, -1, 1));
      const lmax = th >= Math.PI / 2 ? -1 : 1 - (CUP.rTop * Math.tan(th)) / H;
      const ex = c.level - lmax;
      if (ex > 0 && c.fill > 0.005) spillFrom(c, Math.min(1, (ex * 2.5 + 0.1) * dt * 3));
      if (th > 1.9 && (c.topCount > 0 || c.ice > 0) && Math.random() < dt * 20) {
        const rim = c.rimCenter(new THREE.Vector3());
        if (c.ice > 0) { c.ice--; items.spawn('ice', rim, c.vel.clone()); }
        else { const k = Object.keys(c.tops).find((k) => c.tops[k] > 0); c.tops[k]--; items.spawn(TOP_INFO[k].shape === 'ball' ? 'ball' : 'cube', rim, c.vel.clone(), { top: k, color: TOP_INFO[k].color }); }
        c.dirty = true;
      }
    }
    if (c.held || c.locked) continue;
    // 撞擊
    const dv = c.prevVel.distanceTo(c.vel);
    if (dv > 1.8 && c.age > 0.2) {
      if (dv > 3) sfx.thud(); else sfx.clink();
      if (!c.sealed && c.fill > 0.02) spillFrom(c, Math.min(0.9, (dv - 1.5) * 0.14), c.prevVel.clone().multiplyScalar(-0.15).setY(1.5));
      else if (c.sealed && dv > 4.3) burst(c, c.prevVel);
    }
    // 交給客人：放在出餐台上
    const w = G.win;
    if (w && w.waiting && w.state === 'idle' && c.speed < 0.15 && c.pos.z < L.ledge.z1 - 0.02 && c.pos.y > L.ledge.y && c.pos.y < L.ledge.y + 0.12 && c.up.y > 0.9) {
      c.ledgeT = (c.ledgeT || 0) + dt;
      if (c.ledgeT > 0.35) handOver(w, c);
    }
    // 飛出去的杯子撞到客人
    if (c.speed > 0.6 && c.pos.z < L.windowZ + 0.1) {
      for (const cu of customers) {
        if (['gone', 'fly', 'down', 'flee'].includes(cu.state) || cu.cup) continue;
        if (cu.hitTest(c.pos, 0.05)) {
          if (c.speed >= CONFIG.throw.hitSpeed) { hitCustomer(cu, c); break; }
          if (cu === G.win && cu.waiting) { handOver(cu, c); break; }
        }
      }
    }
    if (!c.alive) continue;
    // 掉到地上
    if (!c.dropped && c.pos.y < 0.3 && c.age > 0.3) {
      c.dropped = true; c.dropT = 0;
      G.stats.dropped++;
      addScore(SC.dropCup, c.pos, false, '杯子掉了');
      if (!c.sealed && c.fill > 0.01) spillFrom(c, 1, c.vel);
      else if (c.sealed && c.fill > 0.01) burst(c, c.vel);
      G.shake = Math.max(G.shake, 0.3);
    }
    if (c.dropped) { c.dropT += dt; if (c.dropT > 3.5) c.dispose(); }
  }
}

// 封好的杯子被砸爆
function burst(c, vel) {
  const vol = c.lose(1);
  const p = c.pos.clone();
  sfx.splash();
  const color = '#' + c.color().getHexString();
  splash(items, p, new THREE.Vector3(0, 1, 0), color, 40, { speed: 2.4, spread: 1.2, vol, up: 1.6 });
  for (const k in c.tops) { for (let i = 0; i < Math.min(8, c.tops[k]); i++) items.spawn(TOP_INFO[k].shape === 'ball' ? 'ball' : 'cube', p.clone(), new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), { top: k, color: TOP_INFO[k].color }); c.tops[k] = 0; }
  c.sealed = false; c.film.visible = false; c.dirty = true;
  void vel;
}

function cleanupCups(force) {
  // 太多杯子：把沒在用的空杯收掉
  const idle = cups.filter((c) => c.alive && !c.held && !c.locked && !c.taken).sort((a, b) => a.touched - b.touched);
  for (const c of idle) { if (force || c.empty) { c.dispose(); return; } }
}

// ---------------- 掉落物進杯 ----------------
const itemHooks = {
  intoCup(it, c) {
    if (it.kind === 'ice') { c.addIce(); sfx.clink(); G.lastCup = c; if (c.fill > 0.3) splash(items, c.rimCenter(new THREE.Vector3()), new THREE.Vector3(0, 0.5, 0), '#' + c.color().getHexString(), 3, { speed: 0.6 }); return true; }
    if (it.kind === 'ball' || it.kind === 'cube') { c.addTop(it.top); if (Math.random() < 0.3) sfx.plop(); G.lastCup = c; return true; }
    if (it.kind === 'drop') { if (it.vol) c.addLiquid(c.mainTea() || 'black', it.vol * 0.5); return true; }
    return false;
  },
  land(it, gy) { if (it.vol > 0 && it.free) puddles.add(it.p.x, gy, it.p.z, it.vol, it.color); else if (it.vol > 0) waste(it.vol, new THREE.Vector3(it.p.x, gy, it.p.z), it.color); else if (Math.random() < 0.1) puddles.add(it.p.x, gy, it.p.z, 0.003, it.color); },
  clink() { if (Math.random() < 0.5) sfx.clink(); },
  hitPerson(it) {
    if (it.p.z > L.windowZ) return false;
    for (const cu of customers) if (cu.state !== 'gone' && cu.hitTest(it.p, 0.0)) { if (it.vol > 0.002) cu.fig.drench(it.color, 0.01); return Math.random() < 0.7; }
    return false;
  },
};

// ---------------- 客人 ----------------
function makeCustomer(forceKind) {
  const n = G.spawned++;
  let kind = 'normal';
  if (forceKind) kind = forceKind;
  else if (n >= CONFIG.shift.firstEasy) {
    const r = Math.random();
    if (r < CONFIG.shift.rudeChance) kind = 'rude';
    else if (r < CONFIG.shift.rudeChance + CONFIG.shift.pickyChance) kind = 'picky';
  }
  let order = randomOrder(), rule = null, quote = null, look = makeLook(Math.floor(Math.random() * 1e6));
  if (kind === 'picky') {
    let pool = quotes.picky.filter((q) => !q.rule.sameAsLast || G.served.length > 0);
    quote = pool[(Math.random() * pool.length) | 0];
    rule = quote.rule;
    if (rule.sameAsLast) {
      const prev = G.served[(Math.random() * G.served.length) | 0];
      order = { ...prev.order }; look = prev.look;
    } else order = applyRule(order, rule);
  } else if (kind === 'rude') {
    const used = new Set(customers.map((c) => c.quote?.id));
    const pool = quotes.rude.filter((q) => !used.has(q.id));
    quote = pool[(Math.random() * pool.length) | 0] || quotes.rude[0];
  } else {
    quote = quotes.normal[(Math.random() * quotes.normal.length) | 0];
  }
  const c = new Customer(scene, { kind, order, rule, quote, look });
  const fromLeft = Math.random() < 0.5;
  c.pos.copy(fromLeft ? SPOTS.enterL : SPOTS.enterR);
  c.exit = fromLeft ? SPOTS.enterR : SPOTS.enterL;
  customers.push(c);
  return c;
}

function spawnLogic(dt) {
  G.spawnT -= dt;
  const waiting = G.queue.length + (G.win ? 1 : 0);
  if (G.spawnT <= 0 && waiting < 3 && G.spawned < CONFIG.shift.maxCustomers && G.left > 12) {
    const c = makeCustomer();
    G.spawnT = 7 + Math.random() * 7;
    if (c.kind === 'rude' && c.quote.id === 'cutLine' && G.win) {
      // 插隊：直接衝到窗口，把原本的人擠回隊伍
      c.speed = 2.6;
      const prev = G.win;
      prev.waiting = false; prev.wantReach = false;
      G.queue.unshift(prev);
      prev.walkTo([SPOTS.queue[0]], () => { prev.faceTo = 0; });
      toWindow(c, true);
    } else {
      G.queue.push(c);
      const spot = SPOTS.queue[Math.min(G.queue.length - 1, SPOTS.queue.length - 1)];
      c.walkTo([new THREE.Vector3(spot.x, 0, -2.6), spot], () => { c.faceTo = Math.atan2(-spot.x, 1.6) * 0.5; });
    }
  }
  if (!G.win && G.queue.length) toWindow(G.queue.shift());
  // 隊伍往前補
  G.queue.forEach((c, i) => {
    const spot = SPOTS.queue[Math.min(i, SPOTS.queue.length - 1)];
    if (c.state === 'idle' && c.pos.distanceTo(spot) > 0.1) c.walkTo([spot], () => { c.faceTo = 0.2 * -Math.sign(spot.x); });
  });
}

function toWindow(c, rush = false) {
  G.win = c;
  c.waiting = false;
  c.walkTo([SPOTS.window], () => {
    c.faceTo = 0; c.speed = 1.25;
    // 點單
    G.no++;
    c.no = G.no;
    c.waiting = true; c.arriveT = G.t; c.patience = CONFIG.patience[c.kind];
    const line = c.kind === 'normal' ? c.quote.line.replace('{order}', orderName(c.order)) : c.quote.line;
    hud.say(c, line, { hot: c.kind === 'rude', time: 3.4 });
    c.say(1.8);
    hud.showTicket(c, c.no);
    if (c.kind === 'rude') sfx.rude(); else sfx.ding();
    setTimeout(() => { if (c.waiting) c.wantReach = true; }, 1200);
  });
  if (rush) { c.speed = 2.6; hud.say(c, c.quote.line, { hot: true, time: 2.5 }); }
}

function leave(c, mood) {
  c.waiting = false; c.wantReach = false;
  if (G.win === c) { G.win = null; hud.showTicket(null); }
  const qi = G.queue.indexOf(c); if (qi >= 0) G.queue.splice(qi, 1);
  if (mood) c.fig.baseExpr = mood;
  const side = c.exit;
  setTimeout(() => {
    if (c.state === 'gone') return;
    c.walkTo([new THREE.Vector3(c.pos.x, 0, -2.6), side], () => { c.state = 'gone'; });
  }, 900);
}

function handOver(c, cup) {
  if (cup.taken || !c.waiting) return;
  cup.taken = true;
  for (const h of hands) if (h.held?.cup === cup) h.held = null;
  cup.held = null;
  cup.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
  c.cup = cup; c.waiting = false; c.wantReach = false;
  const t = G.t - c.arriveT;
  const P = c.pos.clone().add(new THREE.Vector3(0, 1.75 * c.look.height, 0));
  if (c.kind === 'rude') {
    addScore(SC.servedRude, P, false, '被凹走一杯');
    hud.say(c, c.quote.served, { hot: true });
    c.fig.baseExpr = 'smug'; sfx.bad();
  } else {
    const errs = judge(cup, c.order, c.rule);
    if (!cup.sealed) errs.unshift('沒封膜');
    let pts = SC.serve;
    const lines = [];
    errs.forEach((e) => { const d = e === '沒封膜' ? SC.unsealed : SC.perError; pts += d; lines.push(`${e} ${d}`); });
    G.stats.served++;
    if (!errs.length) {
      G.stats.perfect++;
      // 做對才收錢（做錯客人要退錢）
      const price = MON.price[c.order.tea] + (c.order.top ? MON.topping : 0);
      G.money.revenue += price;
      setTimeout(() => hud.popup(P.clone().add(new THREE.Vector3(0.18, 0.05, 0)), `收 NT$${price}`, 'cash small'), 350);
      for (const [sec, b] of SC.fast) if (t <= sec) { pts += b; lines.unshift(`手腳很快 +${b}`); break; }
      if (c.rule && ruleDone(cup, c.rule, true)) {
        pts += SC.pickyBonus; lines.unshift(`刁難成功 +${SC.pickyBonus}`);
        if (c.rule.iceExact === 1) G.stats.oneIce++;
        hud.say(c, pick(quotes.react.pickyWin)); c.fig.baseExpr = 'happy';
      } else { hud.say(c, pick(quotes.react.happy)); c.fig.baseExpr = 'happy'; }
      sfx.good();
    } else {
      const R = quotes.react;
      hud.say(c, errs[0] === '沒封膜' && R.unsealed ? pick(R.unsealed) : errs.includes('沒搖勻') && errs.length === 1 ? pick(R.layered) : errs.includes('太少了') ? pick(R.spilled) : pick(R.wrong));
      c.fig.baseExpr = errs.length > 2 ? 'angry' : 'sad'; sfx.bad();
    }
    addScore(pts, P, false, errs.length ? '' : '全對！');
    lines.forEach((l, i) => setTimeout(() => hud.popup(P.clone().add(new THREE.Vector3(0, -0.12 * (i + 1), 0)), l, l.includes('+') ? 'good small' : 'bad small'), 120 * (i + 1)));
    if (c.kind !== 'rude' && !c.rule?.sameAsLast) G.served.push({ order: c.order, look: c.look });
  }
  c.drinking = true;
  leave(c, null);
  setTimeout(() => { c.drinking = false; }, 1500);
}

function hitCustomer(cu, cup) {
  const v = cup.vel.clone();
  const p = cup.pos.clone();
  const vol = cup.fill;
  const color = '#' + cup.color().getHexString();
  // 杯子炸開
  splash(items, p, v.clone().setY(0).normalize().multiplyScalar(0.9).setY(0.6), color, 60, { speed: 2.6, spread: 1.1, vol: vol * 0.6, up: 1.4, free: true, size: 2.2 });
  for (const k in cup.tops) for (let i = 0; i < Math.min(10, cup.tops[k]); i++) items.spawn(TOP_INFO[k].shape === 'ball' ? 'ball' : 'cube', p.clone(), new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 2.5, (Math.random() - 0.5) * 2.5 + 0.8), { top: k, color: TOP_INFO[k].color });
  cup.dispose();
  sfx.splash(); G.shake = 0.8;
  cu.fig.drench(color, vol > 0.1 ? 0.8 : 0.35);
  const P = cu.pos.clone().add(new THREE.Vector3(0, 1.7 * cu.look.height, 0));
  if (cu.kind === 'rude') {
    G.stats.repelled++;
    addScore(SC.repelRude, P, false, '奧客退散！');
    hud.stamp('奧客退散！', 'win');
    hud.say(cu, pick(quotes.react.rudeHit || ['哎唷！']), { hot: true, time: 1.8 });
    cu.fig.baseExpr = 'shock';
    cu.waiting = false; cu.wantReach = false;
    if (G.win === cu) { G.win = null; hud.showTicket(null); }
    const qi = G.queue.indexOf(cu); if (qi >= 0) G.queue.splice(qi, 1);
    const dir = new THREE.Vector3(v.x, 0, v.z).normalize();
    if (dir.z > -0.3) dir.z = -0.8, dir.normalize();
    cu.state = 'fly';
    cu.vel.copy(dir.multiplyScalar(3.0)).setY(4.3);
    cu.spin.set(-5 - Math.random() * 3, 0, (Math.random() - 0.5) * 5);
    cu.onBounce = () => sfx.thud();
    cu.path = [cu.exit.clone()];
    sfx.boing();
  } else {
    G.stats.hitGood++;
    spend('comp', MON.dryCleaning);
    setTimeout(() => hud.popup(P.clone().add(new THREE.Vector3(0, -0.15, 0)), `賠洗衣費 −NT$${MON.dryCleaning}`, 'bad small'), 400);
    addScore(SC.hitGood, P, false, '一星負評');
    hud.stamp('★☆☆☆☆', 'lose');
    hud.say(cu, pick(quotes.react.oneStar), { hot: true, time: 2.6 });
    cu.fig.baseExpr = 'angry';
    cu.state = 'stagger'; cu.staggerT = 0; cu.staggerDir = new THREE.Vector3(v.x, 0, v.z).normalize().multiplyScalar(0.8);
    cu.staggerDone = () => leave(cu, 'angry');
    if (G.win === cu) { G.win = null; hud.showTicket(null); cu.waiting = false; cu.wantReach = false; }
    sfx.bad();
  }
}

function updateCustomers(dt) {
  if (G.phase === 'play') spawnLogic(dt);
  for (let i = customers.length - 1; i >= 0; i--) {
    const c = customers[i];
    c.update(dt);
    // 等太久
    if (c.waiting && G.phase === 'play') {
      const k = 1 - (G.t - c.arriveT) / c.patience;
      if (c === G.win) hud.setPatience(k);
      if (k < 0.35 && c.fig.baseExpr === 'neutral') c.fig.baseExpr = 'sad';
      if (k <= 0) {
        if (c.kind === 'rude') { hud.say(c, '哼，不買了'); }
        else { addScore(SC.walkout, c.pos.clone().add(new THREE.Vector3(0, 1.7, 0)), false, '客人走掉了'); hud.say(c, '等好久喔⋯不要了', { time: 2 }); }
        leave(c, c.kind === 'rude' ? 'smug' : 'angry');
      }
    }
    // 拿著飲料走
    if (c.cup) {
      if (c.cup.alive) {
        c.fig.handWorld(_v);
        c.cup.body.setNextKinematicTranslation({ x: _v.x, y: _v.y + 0.02, z: _v.z });
        c.cup.body.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });
      }
    }
    if (c.state === 'gone') {
      if (c.cup?.alive) c.cup.dispose();
      if (G.win === c) { G.win = null; hud.showTicket(null); }
      c.dispose(); customers.splice(i, 1);
    }
  }
}

const pick = (a) => a[(Math.random() * a.length) | 0];

// ---------------- 錢 ----------------
const MON = CONFIG.money;
function spend(kind, n) { if (G.phase === 'play' && n > 0) G.money[kind] += n; }
function moneySummary() {
  const m = G.money;
  const rows = [
    ['營業額', Math.round(m.revenue)],
    ['茶、果糖、料、冰塊', -Math.round(m.ingredients)],
    ['杯子、封膜', -Math.round(m.cups)],
    ['賠洗衣費', -Math.round(m.comp)],
    ['你的時薪', -MON.wage],
    ['店租水電', -MON.rent],
  ];
  const net = rows.reduce((a, r) => a + r[1], 0);
  return { rows, net };
}
function showReceipt(m) {
  const el = $('result-money');
  el.innerHTML = `<div class="r-head">這一班的帳</div>` + m.rows.filter((r) => r[1] !== 0 || r[0] === '營業額').map(([k, v]) => `<div class="r-row"><span>${k}</span><b class="${v < 0 ? 'neg' : ''}">${v < 0 ? '−' : ''}NT$${Math.abs(v)}</b></div>`).join('') +
    `<div class="r-total ${m.net < 0 ? 'neg' : 'pos'}"><span>${m.net < 0 ? '老闆虧了' : '老闆賺了'}</span><b>NT$${Math.abs(m.net)}</b></div>`;
}

// ---------------- 分數 ----------------
function addScore(n, pos, quiet, label) {
  if (G.phase !== 'play') return;
  G.score += n;
  hud.setScore(G.score, n);
  if (quiet || !pos) return;
  hud.popup(pos, `${label ? label + ' ' : ''}${n > 0 ? '+' : ''}${n}`, n >= 0 ? 'good' : 'bad');
}

// ---------------- 提示（前兩杯）----------------
function updateHint() {
  if (G.phase !== 'play' || !G.hintsOn) { hud.setHint(''); return; }
  const w = G.win;
  const press = TOUCH ? '按住' : '按住滑鼠';
  if (!w || !w.waiting) { hud.setHint(''); return; }
  if (w.kind === 'rude') { hud.setHint('奧客！拿個杯子<b>用力往他甩</b>'); return; }
  const cup = hands.map((h) => h.held?.cup).find(Boolean) || (G.lastCup?.alive && !G.lastCup.taken ? G.lastCup : null);
  const o = w.order;
  let t = '';
  if (!cup) t = `${press}<b>杯架</b>拿一個杯子`;
  else if (o.top && cup.tops[o.top] < 6 && !cup.sealed) t = `${press}料槽裡的<b>勺子</b>，在槽裡撈一撈，再移到杯口倒`;
  else if (cup.ice < (o.ice === 'none' ? 0 : o.ice === 'less' ? 1 : 3) && !cup.sealed) t = `${press}<b>冰桶</b>抓冰塊，在杯口放開`;
  else if (cup.level < 0.75 && !cup.sealed) t = urns.some((u) => u.open) ? '倒到八分滿就<b>放開開關</b>' : '杯子放到<b>茶桶</b>下的圈裡，<b>按住開關</b>出茶';
  else if (Math.abs(cup.sugar - o.sweet) > 1 && !cup.sealed) t = `杯子放到<b>果糖機</b>下，${press}按鈕`;
  else if (!cup.sealed) t = '把杯子放進<b>封膜機</b>';
  else if (cup.mix < 1) t = '拿著杯子<b>上下快速晃</b>搖勻';
  else t = '交給客人：<b>伸到窗口放開</b>，或放在出餐台';
  hud.setHint(t);
}

// ---------------- 主迴圈 ----------------
function frame(dt) {
  G.t += dt;
  quality.sample(dt);
  if (G.phase === 'play') {
    G.left -= dt;
    hud.setTime(G.left);
    if (G.left <= 0) endShift();
  }
  updateCamera(dt);
  updateHands(dt);
  updateFaces(dt);
  updateHeld(dt);
  updatePouring(dt);
  sealer.update(dt, cups, (c) => { G.lastCup = c; }, sfx);
  phys.step(dt);
  for (const s of scoops) s.sync(dt);
  updateCups(dt);
  items.update(dt, cups, itemHooks);
  puddles.update();
  updateCustomers(dt);
  traffic.update(dt);
  if (G.wastePop > 0 && (G.wastePopT = (G.wastePopT || 0) + dt) > 0.9) { hud.popup(G.wastePos, `灑出來 −${G.wastePop}`, 'bad small'); G.wastePop = 0; G.wastePopT = 0; }
  const show = hands.map((h) => h.held?.cup).find(Boolean) || (G.lastCup?.alive && !G.lastCup.taken && !G.lastCup.dropped ? G.lastCup : null);
  hud.showCup(G.phase === 'play' ? show : null);
  updateHint();
  hud.update(dt);
  rend.render();
  if (G.capture) { G.capture(); G.capture = null; }
}

// ---------------- 一班的開始與結束 ----------------
function startShift() {
  for (const c of [...cups]) c.dispose();
  cups.length = 0;
  for (const c of customers) { if (c.cup?.alive) c.cup.dispose(); c.dispose(); }
  customers.length = 0;
  items.clear(); puddles.clear();
  for (const u of urns) u.open = false;
  for (const s of scoops) { s.setLoad(0); s.toRest(true); }
  Object.assign(G, { phase: 'play', left: CONFIG.shift.seconds, score: 0, win: null, queue: [], spawned: 0, spawnT: 0.5, no: 0, served: [], wasteAcc: 0, wastePop: 0, lastCup: null, yaw: 0 });
  G.stats = { served: 0, perfect: 0, repelled: 0, hitGood: 0, waste: 0, dropped: 0, oneIce: 0 };
  G.money = { revenue: 0, ingredients: 0, cups: 0, comp: 0 };
  hud.setScore(0); hud.setTime(G.left); hud.showTicket(null);
  $('hud').hidden = false;
  $('screen-start').hidden = true; $('screen-result').hidden = true;
  document.body.classList.add('playing');
  input.enabled = true;
  try { G.hintsOn = !localStorage.getItem('yyl-hints-off'); } catch (e) { G.hintsOn = true; }
}

function endShift() {
  G.phase = 'result';
  input.enabled = false; input.releaseAll();
  document.body.classList.remove('playing');
  hud.setHint(''); hud.showTicket(null); hud.showCup(null);
  for (const u of urns) u.open = false;
  syrup.pressed = false;
  try { localStorage.setItem('yyl-hints-off', '1'); } catch (e) { /* 忽略 */ }
  sfx.win();
  G.capture = () => {
    const shot = document.createElement('canvas');
    const src = $('gl');
    shot.width = src.width; shot.height = src.height;
    shot.getContext('2d').drawImage(src, 0, 0);
    const m = moneySummary();
    const card = drawCard(shot, { score: G.score, stats: G.stats, money: m });
    showReceipt(m);
    const url = card.toDataURL('image/png');
    $('result-img').src = url;
    $('btn-download').onclick = () => { const a = document.createElement('a'); a.href = url; a.download = '手搖飲搖搖樂-結算.png'; a.click(); };
    $('hud').hidden = true;
    $('screen-result').hidden = false;
  };
}

// ---------------- 介面 ----------------
const ICON_MUTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg>';

function buildUI() {
  const snd = $('btn-sound');
  const paint = () => { snd.innerHTML = isMuted() ? ICON_MUTE : ICON_SOUND; snd.setAttribute('aria-label', isMuted() ? '開啟音效' : '關閉音效'); };
  paint();
  snd.addEventListener('click', () => { setMuted(!isMuted()); paint(); });
  $('btn-start').addEventListener('click', () => { if (isMuted() && $('chk-sound')?.checked) { setMuted(false); paint(); } startShift(); });
  $('btn-again').addEventListener('click', startShift);
  $('ctl-desktop').hidden = TOUCH; $('ctl-touch').hidden = !TOUCH;
}

boot();
