import * as THREE from 'three';
import { CONFIG, L, CUP } from './config.js';
import { Renderer, makeSky, makeEnvironment, makeLights } from './gfx/renderer.js';
import { initPhysics, Physics, R, GROUPS } from './play/physics.js';
import { makeMaterials, buildShop } from './world/shop.js';
import { Urn, Syrup, buildCupStack, Wells, buildIceBin, Sealer, ShakeMachine, Rinser, Stream, PumpBar } from './world/stations.js';
import { buildStreet, Traffic } from './world/street.js';
import { Customer, makeLook, SPOTS } from './world/customers.js';
import { Cup, cupShared, LIQUID, SHAKER, ShakerLid } from './play/cup.js';
import { makeReview, starText } from './play/reviews.js';
import { Register, moneyStack } from './world/register.js';
import { Scoop } from './play/scoop.js';
import { Rag } from './play/rag.js';
import { Items, Puddles, splash, groundY, TOP_INFO } from './play/items.js';
import { HandModel, HandsInput } from './play/hands.js';
import { Hud } from './play/hud.js';
import { randomOrder, applyRule, judge, ruleDone, orderName, teaById, setMode, isHard, drinkById, teaWant } from './play/orders.js';
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
const POUR_TILT = 1.25; // 雪克杯倒茶時歪幾度（弧度，約 72°）
const SC = CONFIG.score;

let rend, scene, camera, phys, M, quality, hud, input, quotes;
let urns, syrup, wells, sealer, traffic, items, puddles, rag, iceScoop, shakeMachine, rinser, register, pumpBar;
const shakers = [];
const lids = []; // 雪克杯蓋
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
  // 拿在手上的杯子：碰到機台、牆、柱子這些固定的大東西會被擋住（沿著表面滑），其他小東西都穿過去
  G.cc = phys.world.createCharacterController(0.002);
  G.cc.setSlideEnabled?.(true);
  G.cc.setApplyImpulsesToDynamicBodies?.(false);
  G.cc.enableAutostep?.(0.045, 0.01, false); // 封膜機底座這種小台階，杯子會自己跨上去
  G.ccFlags = R.QueryFilterFlags?.ONLY_FIXED ?? ((R.QueryFilterFlags?.EXCLUDE_DYNAMIC ?? 4) | (R.QueryFilterFlags?.EXCLUDE_KINEMATIC ?? 2));
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
  shakeMachine = new ShakeMachine(scene, phys, M, proxies);
  rinser = new Rinser(scene, phys, M, proxies);
  register = new Register(scene, phys, M, proxies);
  pumpBar = new PumpBar(scene, phys, M, proxies);
  buildStreet(scene, phys);
  traffic = new Traffic(scene);
  scoops = wells.list.map((w) => new Scoop(scene, phys, M, w, owners));
  iceScoop = new Scoop(scene, phys, M, { ice: true, top: 'ice', x: L.iceBin.x, info: { id: 'ice', color: '#eaf6ff', shape: 'ice' } }, owners);
  scoops.push(iceScoop);
  rag = new Rag(scene);
  items = new Items(scene, quality.q.particles);
  puddles = new Puddles(scene);

  for (const side of [-1, 1]) {
    const model = new HandModel(side, scene);
    hands.push({ side, model, sx: innerWidth * (side < 0 ? 0.3 : 0.7), sy: innerHeight * 0.75, pressed: false, ptr: null, active: false, hovering: false, idle: 9, pos: new THREE.Vector3(), target: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), hist: [], held: null, quat: new THREE.Quaternion(), shakeDir: 0, shakeT: 0, jig: 0 });
  }
  // 手上拿的錢
  for (const h of hands) { h.cash = new THREE.Group(); h.cash.position.set(-h.side * 0.004, -0.04, -0.035); h.cash.visible = false; h.model.root.add(h.cash); }
  hud = new Hud(camera);
  input = new HandsInput($('gl'), hands, { press: onPress, release: onRelease });

  rend.setup(scene, camera);
  onResize();
  addEventListener('resize', onResize);
  for (const h of hands) { restPos(h, h.pos); h.target.copy(h.pos); }
  await warmUp();
  // 雪克杯：兩支，放在茶桶前面。掉了、丟出去都會回到這裡
  for (const hp of L.shakerHomes) {
    const home = new THREE.Vector3(hp.x, Y + CUP.h * SHAKER.sy / 2 + 0.002, hp.z);
    const sk = new Cup(scene, phys, home, owners, { shaker: true, home });
    sk.stream = new Stream(scene, '#93400f', 0.006);
    shakers.push(sk); cups.push(sk);
  }
  L.lidHomes.forEach((lh) => lids.push(new ShakerLid(scene, lh)));
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
  window.__dbg = { lids, handOver, hud, pumpBar, wells, applyMode, startShift, register, startPay, shakers, shakeMachine, rinser, phys, owners, Cup, rag, THREE, scene, Customer, makeLook, rend, surfaceAt, computeTarget, proxies, G, cups, hands, customers, scoops, urns, syrup, sealer, input, camera, items, puddles, frame, onPress, onRelease, makeCustomer, toWindow, CONFIG, L };
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
  const xs = L.urns.map((u) => u.x), x0 = Math.min(...xs) - 0.125, x1 = Math.max(...xs) + 0.125, z0 = L.urnZ - 0.14, z1 = L.urnZ + 0.12, h = L.urnStand;
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.025, z1 - z0), M.steel);
  m.position.set((x0 + x1) / 2, Y + h - 0.0125, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; scene.add(m);
  for (const lx of [x0 + 0.03, x1 - 0.03]) for (const lz of [z0 + 0.03, z1 - 0.03]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 10), M.steelDark);
    leg.position.set(lx, Y + h / 2, lz); leg.castShadow = true; scene.add(leg);
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.015, z1 - z0), M.steelDark);
  shelf.position.set((x0 + x1) / 2, Y + 0.06, (z0 + z1) / 2); shelf.receiveShadow = true; scene.add(shelf);
  phys.fixedBox((x0 + x1) / 2, Y + h / 2, (z0 + z1) / 2, (x1 - x0) / 2, h / 2, (z1 - z0) / 2, { groups: GROUPS.machine });
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
      if (!(G.t - (h.moveT ?? -9) < 0.12)) continue; // 手停著不動：視角也馬上停（不然手底下的東西會跑掉）
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
const surfaceProxies = () => proxies.filter((p) => ['surface', 'well', 'ice', 'air', 'lever', 'syrupBtn', 'register', 'cashSlot', 'tray', 'pump'].includes(p.userData.kind));
let SURF = null;
const pickProxies = () => proxies.filter((p) => ['lever', 'syrupBtn', 'cupStack', 'ice', 'well', 'register', 'cashSlot', 'tray', 'pump'].includes(p.userData.kind));
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
  SURF_HOLD ||= SURF.filter((p) => p.userData.kind !== 'lever' && p.userData.kind !== 'syrupBtn' && p.userData.kind !== 'pump');
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

function cupHandOffset(h) { const r = h.held?.cup?.R ?? CUP.rTop; return _v2.set(h.side * (r + 0.026), -0.005, 0.012); }

// 台面上其他杯子的高度：手和拿著的東西要從杯口上方過
function cupTopAt(x, z, hand, pad = 0.02) {
  let top = -Infinity;
  for (const c of cups) {
    // 另一隻手拿著的杯子也要算（一手拿杯、一手舀料）
    if (!c.alive || (hand && c.held === hand) || c.taken || c.dropped) continue;
    if (Math.hypot(c.pos.x - x, c.pos.z - z) < c.R + pad) top = Math.max(top, c.pos.y + c.H / 2 + (c.sealed ? 0.006 : 0));
  }
  return top;
}

function computeTarget(h, out) {
  const s = surfaceAt(h.sx + (h.ox || 0), h.sy + (h.oy || 0), ['cup', 'scoop', 'ice', 'rag'].includes(h.held?.kind));
  const P = s.point;
  h.surf = s;
  const held = h.held;
  if (s.kind !== 'air' && held?.kind !== 'cup') {
    const top = cupTopAt(P.x, P.z, h, held?.kind === 'scoop' ? 0.045 : 0.03);
    if (top > P.y) P.y = top + (held?.kind === 'scoop' ? 0.012 : 0.0);
  }
  if (held?.kind === 'lid') {
    // 拿著蓋子：指到雪克杯上面（射線靠近杯口）就吸過去，放開就蓋上
    const rr = ray.ray; let best = null, bd = 0.075;
    for (const sk of shakers) {
      if (sk.lid || !sk.alive || sk.respawnT != null || sk.up.y < 0.8) continue;
      const rim = sk.rimCenter(new THREE.Vector3());
      const d = Math.min(rr.distanceToPoint(rim), Math.hypot(rim.x - P.x, rim.z - P.z));
      if (d < bd) { bd = d; best = rim; }
    }
    if (best) P.set(best.x, best.y + 0.05, best.z);
    else P.y += 0.05;
  }
  if (held?.kind === 'rag') {
    // 抹布貼著台面：手掌壓在抹布上
    out.copy(P); if (s.kind !== 'air') out.y += 0.03;
  } else if (held?.kind === 'cup') {
    const hc = held.cup;
    if (s.kind === 'well' || s.kind === 'ice') P.y = Y; // 拿著杯子經過料槽、冰桶：保持在台面高度，不會往洞裡掉
    if (s.kind !== 'air') P.y += hc.H / 2 + 0.012;
    h.pourTarget = null;
    if (hc.isShaker && s.kind !== 'air') {
      // 雪克杯靠近杯子：舉到杯子旁邊的上方，歪過去倒
      let best = null, bd = 0.1;
      for (const c of cups) {
        if (c.isShaker || !c.alive || c.sealed || c.taken || c.dropped || c.up.y < 0.9 || c.held === h) continue;
        const d = Math.hypot(c.pos.x - P.x, c.pos.z - P.z);
        if (d < bd) { bd = d; best = c; }
      }
      if (best && hc.lid) { warn(best, '先打開<b>雪克杯蓋</b>才能倒'); best = null; }
      if (best) {
        h.pourTarget = best;
        // 歪到 POUR_TILT 時，杯口最低點（倒出來的地方）剛好在杯子正中間上方
        const reach = (hc.H / 2) * Math.sin(POUR_TILT) + hc.R * Math.cos(POUR_TILT);
        P.set(best.pos.x + h.side * reach, Math.max(P.y, best.pos.y + best.H / 2 + hc.H * 0.36), best.pos.z);
      }
    }
    out.copy(P).add(cupHandOffset(h));
  } else if (held?.kind === 'scoop') {
    if (s.kind !== 'air') P.y += s.kind === 'well' ? 0.028 : s.kind === 'ice' ? 0.004 : 0.034;
    // 空的冰鏟移到有冰的杯子上：伸進杯子裡（去冰：把冰刮出來）
    const sc = held.scoop;
    if (sc.isIce && sc.load < sc.max) {
      for (const c of cups) {
        if (!c.alive || c.sealed || c.taken || c.ice <= 0 || c.up.y < 0.8 || c.held === h || (c === sc.noDip && G.t - sc.noDipT < 0.8)) continue;
        if (!(sc.load < 1 || sc.noPour === c)) continue; // 正在刮這一杯：一直伸在杯裡，直到刮完或冰鏟滿了
        const rim = c.rimCenter(_v2);
        if (Math.hypot(P.x - rim.x, P.z - rim.z) < c.R + 0.02) { P.set(rim.x, rim.y - 0.04, rim.z); break; }
      }
    }
    h.bowlTarget = P.clone();
    out.copy(P).add(held.scoop.handleOffset(held.q || _q.identity()));
  } else if (held?.kind === 'lever' || held?.kind === 'syrup' || held?.kind === 'pump') {
    out.copy(P); out.y += 0.05;
  } else {
    out.copy(P);
    if (s.kind === 'lever' || s.kind === 'syrupBtn' || s.kind === 'pump') out.y += 0.02;
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
  else if (held?.kind === 'ice' || held?.kind === 'cash' || held?.kind === 'lid') { pose = 'pinch'; pitch = -0.35; }
  else if (held?.kind === 'rag') { pose = 'open'; pitch = -0.04; roll = 0; }
  else if (held?.kind === 'lever' || held?.kind === 'syrup' || held?.kind === 'pump') { pose = 'point'; pitch = -0.6; }
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
  for (const s of scoops) if (!s.disabled) objs.push(s.pick);
  if (!rag.held) objs.push(rag.pick);
  for (const l of lids) if (!l.held) { l.pick.updateMatrixWorld(true); objs.push(l.pick); }
  const hits = ray.intersectObjects(objs, false);
  // 杯子、勺子、蓋子優先（它們比較小）
  const pref = hits.find((x) => ['cup', 'scoop', 'lid'].includes(x.object.userData.kind));
  const hit = pref && (!hits[0] || pref.distance - hits[0].distance < 0.12) ? pref : hits[0];
  if (hit) {
    // 蓋著的雪克杯：點上面那一截＝拿蓋子（打開），點杯身＝拿整支
    const hc = hit.object.userData.cup;
    if (hc?.lid && !hc.locked && hit.point.y > hc.rimCenter(_v2).y - 0.035) return { kind: 'lid', lid: hc.lid, point: hit.point };
    return { ...hit.object.userData, point: hit.point };
  }
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
      if (s && !s.held && !s.disabled) { grabScoop(h, s); return; }
      break;
    }
    case 'scoop': {
      if (p.scoop.held && p.scoop.held !== h) break;
      // 勺柄會橫到隔壁料槽上：點在哪個料槽，就拿那個料槽自己的勺子
      const w = p.point && !p.scoop.isIce ? wells.at(p.point.x, p.point.z) : null;
      const own = w && scoops.find((x) => x.well.top === w.top && !x.held && !x.disabled);
      grabScoop(h, own || p.scoop); return;
    }
    case 'lid': {
      const l = p.lid;
      if (l.held || l.on?.locked) break;
      if (l.on) { l.detach(); sfx.clink(); }
      l.held = h; h.held = { kind: 'lid', lid: l }; sfx.grab();
      return;
    }
    case 'cupStack': {
      if (cups.filter((c) => c.alive && !c.taken && !c.isShaker).length >= 9) { cleanupCups(true); }
      computeTarget(h, _v);
      const c = new Cup(scene, phys, _v.clone().sub(cupHandOffset(h)), owners);
      cups.push(c);
      spend('cups', MON.cup);
      h.held = { kind: 'cup', cup: c }; c.grab(h); G.lastCup = c; sfx.grab();
      return;
    }
    case 'ice': { if (!iceScoop.held) { grabScoop(h, iceScoop); return; } break; } // 冰桶：拿冰鏟（不用手抓冰）
    case 'lever': { h.held = { kind: 'lever', urn: p.urn }; G.didTap = true; return; } // 按住才出茶
    case 'syrupBtn': { syrup.pressed = true; h.held = { kind: 'syrup' }; sfx.button(); return; }
    case 'pump': { if (!pumpBar.active) break; p.pump.pressed = true; h.held = { kind: 'pump', pump: p.pump }; sfx.button(); return; } // 配料吧：按住才出
    case 'rag': { if (rag.held) break; rag.held = h; h.held = { kind: 'rag' }; sfx.grab(); return; }
    case 'register': { register.open = !register.open; G.regIdle = 0; sfx.button(); break; } // 按收銀機＝開／關抽屜
    case 'cashSlot': {
      if (register.k < 0.9) break;
      // 要找錢的時候：按一下抽屜就拿到剛好的零錢
      const due = changeDue();
      if (due > 0) {
        h.held = { kind: 'cash', pieces: breakDown(due), from: 'drawer', exact: true }; h.cashN = -1; sfx.clink();
        hud.popup(new THREE.Vector3(register.x, Y + 0.25, register.z), `找 NT$${due}`, 'cash small');
        return;
      }
      h.held = { kind: 'cash', pieces: [p.denom], from: 'drawer' }; h.cashN = -1; h.slotIn = p.denom; h.slotT = 0; h.slotGot = true; sfx.clink();
      return;
    }
    case 'tray': {
      const P = G.pay;
      if (P && P.onTray) { P.onTray = false; h.held = { kind: 'cash', pieces: [...P.denoms], from: 'customer' }; refreshTray(); sfx.grab(); return; }
      if (P && P.changeOnTray.length) { h.held = { kind: 'cash', pieces: P.changeOnTray.splice(0), from: 'drawer' }; refreshTray(); sfx.grab(); return; }
      break;
    }
  }
  h.held = { kind: 'air' }; h.dwellKey = null; h.dwellT = 0;
  void other;
}

function grabScoop(h, s) {
  h.held = { kind: 'scoop', scoop: s, q: new THREE.Quaternion() };
  s.grabT = G.t; s.wasOut = false; s.noDip = s.noPour = null;
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
    if (c.isShaker) { c.aiming = false; c.pouring = false; c.pourTilt = 0; c.stream.hide(); }
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
    if (w && !c.isShaker && w.state === 'idle' && w.waiting && v.length() < CONFIG.throw.handOverSpeed) {
      const hp = w.fig.handWorld(_v);
      if (c.pos.distanceTo(hp) < 0.32 || (c.pos.z < L.ledge.z1 + 0.02 && Math.abs(c.pos.x - w.pos.x) < 0.6)) handOver(w, c);
    }
  } else if (held.kind === 'scoop') {
    held.scoop.release(throwVel(h));
    if (held.scoop.load > 0 && held.scoop.mode === 'free') {
      for (let i = 0; i < held.scoop.load; i++) {
        const sp = held.scoop.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.01, (Math.random() - 0.5) * 0.02)), sv = new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5);
        if (held.scoop.isIce) items.spawn('ice', sp, sv);
        else items.spawn(TOP_INFO[held.scoop.loadType].shape === 'ball' ? 'ball' : 'cube', sp, sv, { top: held.scoop.loadType, color: TOP_INFO[held.scoop.loadType].color });
      }
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
  } else if (held.kind === 'rag') {
    // 放開：平放在手底下的台面上；伸到台面外放開就回到原位
    rag.held = null;
    const s = h.surf;
    if (s && s.kind === 'surface') rag.place(new THREE.Vector3(rag.pos.x, s.point.y + 0.007, rag.pos.z), rag.yaw);
    else rag.place(rag.home, 0.3);
  } else if (held.kind === 'lid') {
    const l = held.lid, lp = l.group.position;
    let best = null, bd = 0.075;
    for (const sk of shakers) {
      if (sk.lid || !sk.alive || sk.respawnT != null || sk.up.y < 0.8) continue;
      const rim = sk.rimCenter(_v2);
      const d = Math.hypot(rim.x - lp.x, rim.z - lp.z);
      if (d < bd && lp.y > rim.y - 0.03 && lp.y < rim.y + 0.16) { bd = d; best = sk; }
    }
    if (best) { l.attach(best); sfx.clink(); hud.popup(best.rimCenter(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0)), '蓋好了', 'small'); }
    else l.toRest();
  } else if (held.kind === 'syrup') {
    syrup.pressed = false;
  } else if (held.kind === 'pump') {
    held.pump.pressed = false;
  } else if (held.kind === 'cash') {
    const P = G.pay, p = h.pos;
    h.cash.visible = false;
    if (register.overTray(p) || h.surf?.kind === 'tray') {
      if (held.from === 'customer') { if (P) P.onTray = true; }
      else if (P) { P.changeOnTray.push(...held.pieces); P.trayT = 0; sfx.clink(); }
      refreshTray();
    } else if (register.overRegister(p) || h.surf?.kind === 'cashSlot' || h.surf?.kind === 'register') {
      if (held.from === 'customer' && P && !P.taken) {
        P.taken = true; G.money.revenue += P.paid; register.open = true; G.regIdle = 0; sfx.button();
        hud.popup(new THREE.Vector3(register.x, Y + 0.25, register.z), `收 NT$${P.paid}`, 'cash small');
        updateRegDisplay();
      } else sfx.clink(); // 零錢放回抽屜
    } else if (held.from === 'customer' && P) { P.onTray = true; refreshTray(); } // 放在別的地方：錢放回找零盤
  }
}

// 放開時如果跟別的杯子疊在一起（拿著時是穿過去的），先輕輕挪開，不要被物理彈飛
function unOverlap(c) {
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (const o of cups) {
      if (o === c || !o.alive || o.taken || o.held) continue;
      const R2 = (c.R + c.Rb) / 2 + (o.R + o.Rb) / 2 + 0.004;
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
  const bottom = c.pos.y - c.H / 2;
  const r = new R.Ray({ x: c.pos.x, y: bottom + 0.01, z: c.pos.z }, { x: 0, y: -1, z: 0 });
  const hit = phys.world.castRay(r, 0.2, true, undefined, undefined, undefined, c.body);
  if (!hit) return null; // 底下是空的（例如伸到台面外）：照物理掉下去
  const toi = hit.timeOfImpact ?? hit.toi;
  const owner = owners.get(hit.collider.handle);
  if (owner instanceof Cup || owner instanceof Scoop) return null; // 疊在別的杯子上：讓物理決定
  if (toi > 0.12) return null;
  return new THREE.Vector3(c.pos.x, bottom + 0.01 - toi + c.H / 2 + 0.002, c.pos.z);
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
      const tx = THREE.MathUtils.clamp(-h.acc.z * 0.0015, -0.1, 0.1), tz = THREE.MathUtils.clamp(h.acc.x * 0.0015, -0.1, 0.1);
      c.tiltX = (c.tiltX || 0) + (tx - (c.tiltX || 0)) * Math.min(1, dt * 10);
      c.tiltZ = (c.tiltZ || 0) + (tz - (c.tiltZ || 0)) * Math.min(1, dt * 10);
      c.aiming = !!(c.isShaker && h.pourTarget);
      const pt = c.aiming && (c.fill > 0.002 || c.ice > 0) ? h.side * POUR_TILT : 0;
      c.pourTilt = (c.pourTilt || 0) + (pt - (c.pourTilt || 0)) * Math.min(1, dt * 8);
      _q.setFromEuler(_e.set(c.tiltX, 0, c.tiltZ + c.pourTilt));
      // 撞到機台：只是擋住，不會灑（高低差、台階也一樣）
      const want = center.clone().sub(c.pos);
      const prevPos = c.pos.clone();
      let next = center;
      try {
        G.cc.computeColliderMovement(c.collider, { x: want.x, y: want.y, z: want.z }, G.ccFlags, GROUPS.machineQuery); // 只有機台會擋
        const mv = G.cc.computedMovement();
        next = c.pos.clone().add(new THREE.Vector3(mv.x, mv.y, mv.z));
      } catch (e) { next = center; }
      c.moveTo(next, _q);
      if (c.isShaker) pourShaker(h, c, dt);
      // 唯一會灑的情況：拿著移動太快。越滿越容易灑（杯子被機台擋住＝沒在動，不會灑）
      c.heldT = (c.heldT || 0) + dt;
      const sp = dt > 0 ? next.distanceTo(prevPos) / dt : 0;
      c.moveSp = (c.moveSp || 0) + (Math.min(sp, 8) - (c.moveSp || 0)) * Math.min(1, dt * 10);
      const SP = CONFIG.pour.spill;
      if (!c.sealed && !c.lid && !c.aiming && c.heldT > 0.2 && c.frac > SP.minFrac) {
        const thr = SP.speedFull + (1 - Math.min(1, c.frac)) * SP.speedPerEmpty;
        const ex = c.moveSp - thr;
        G.spillThr = thr;
        if (ex > 0) {
          c.sloshAcc = (c.sloshAcc || 0) + Math.min(0.5, ex * SP.rate * (0.5 + c.frac)) * dt;
          if (G.t - (c.sloshT || 0) > 0.08 && c.sloshAcc > 0.002) { c.sloshT = G.t; spillFrom(c, c.sloshAcc, h.vel.clone().multiplyScalar(0.3)); c.sloshAcc = 0; }
        }
      }
      detectShake(h, c, dt);
    } else if (held.kind === 'scoop') {
      const s = held.scoop;
      if (s.held !== h) { h.held = null; continue; }
      const bowl = h.pos.clone().sub(s.handleOffset(held.q));
      // 冰鏟：在冰桶裡移動＝鏟冰；在冰桶上方晃＝把多的冰刮回去
      const ib = L.iceBin;
      const inBin = s.isIce && Math.abs(bowl.x - ib.x) < ib.w / 2 && Math.abs(bowl.z - ib.z) < ib.d / 2;
      // 離開剛倒過／剛刮過的杯子，才可以再對它刮冰／倒冰
      for (const k of ['noDip', 'noPour']) { const c = s[k]; if (c && (!c.alive || Math.hypot(bowl.x - c.pos.x, bowl.z - c.pos.z) > 0.11)) s[k] = null; }
      // 鏟冰：冰鏟離開冰桶後再插進去＝滿滿一鏟（約 200g）。剛拿起來的冰鏟是空的
      const dipped = inBin && bowl.y < Y - 0.006;
      if (s.isIce && !dipped) s.wasOut = true;
      if (dipped && s.wasOut && s.load < s.max) {
        const raw = s.load;
        s.setLoad(s.max); s.wasOut = false;
        spend('ingredients', (s.load - raw) * MON.ice);
        sfx.clink();
      }
      // 去冰：空冰鏟伸進杯子裡動一動，把冰一顆一顆刮出來
      if (s.isIce) {
        for (const c of cups) {
          if (!c.alive || c.sealed || c.taken || c.ice <= 0 || (c === s.noDip && G.t - s.noDipT < 0.8)) continue;
          const rim = c.rimCenter(_v2);
          if (Math.hypot(bowl.x - rim.x, bowl.z - rim.z) < c.R && bowl.y < rim.y && s.load < s.max) {
            s.noPour = c;
            held.scrape = (held.scrape || 0) + dt * 6; // 一秒刮約 6 顆
            while (held.scrape >= 1 && c.ice > 0 && s.load < s.max) { held.scrape -= 1; c.takeIce(); s.setLoad(s.load + 1); sfx.clink(); G.lastCup = c; }
          }
        }
      }
      // 在料槽裡移動 → 舀起來
      // 每個勺子只舀自己的料槽（經過別的料槽不會舀到別的料）
      const w0 = s.isIce ? null : wells.at(bowl.x, bowl.z);
      const w = w0 && w0.top === s.well.top ? w0 : null;
      // 勺子裡已經有別的料：經過其他料槽不會混到
      // 料：勺子伸進料槽就是滿滿一勺（約 60g）
      if (w && bowl.y < Y - 0.004 && !(s.load > 0.5 && s.loadType !== w.top) && s.load < s.max) {
        const raw = s.load;
        s.setLoad(s.max, w.top);
        spend('ingredients', (s.load - raw) * MON.toppingPiece);
        sfx.scoop();
      }
      // 在杯口上方 → 傾倒
      let target = null;
      for (const c of cups) {
        if (!c.alive || c.sealed || c.taken || c.up.y < 0.8) continue;
        if (c === s.noPour) continue; // 剛從這杯刮出來的冰，不要又倒回去
        if ((c.isShaker && !s.isIce) || c.lid) { // 料直接加在杯子裡，不加進雪克杯；蓋著也加不進去
          const rim = c.rimCenter(_v2);
          if (s.load >= 1 && Math.hypot(bowl.x - rim.x, bowl.z - rim.z) < 0.085 && bowl.y > rim.y - 0.03 && bowl.y < rim.y + 0.3) warn(c, c.lid ? '雪克杯<b>蓋著</b>，先打開蓋子' : '料要加在<b>杯子</b>裡，雪克杯不能加料');
          continue;
        }
        const rim = c.rimCenter(_v2);
        if (Math.hypot(bowl.x - rim.x, bowl.z - rim.z) < 0.085 && bowl.y > rim.y - 0.03 && bowl.y < rim.y + 0.3) { target = c; break; }
      }
      if (target && s.load >= 1) { s.noDip = target; s.noDipT = G.t; } // 剛倒進去的杯子：空勺子停一下才會伸進去刮
      held.tilt = (held.tilt || 0) + ((target ? 1 : 0) - (held.tilt || 0)) * Math.min(1, dt * 9);
      _e.set(-0.05, 0, -h.side * held.tilt * 1.7);
      held.q.setFromEuler(_e);
      s.moveBowl(bowl, held.q);
      // 冰鏟在杯口上方：冰一顆一顆慢慢掉進去，移開就停（好控制冰量）
      if (s.isIce) {
        if (target && s.load >= 1) {
          held.drip = (held.drip ?? 0.6) + dt * CONFIG.pour.iceDripRate;
          const rim = target.rimCenter(new THREE.Vector3());
          while (held.drip >= 1 && s.load >= 1) {
            held.drip -= 1;
            items.spawn('ice', new THREE.Vector3(rim.x + (Math.random() - 0.5) * 0.02, rim.y + 0.03, rim.z + (Math.random() - 0.5) * 0.02), new THREE.Vector3(0, -0.4, 0));
            s.setLoad(s.load - 1);
          }
          G.lastCup = target;
        } else held.drip = 0.6;
      }
      // 料勺經過杯口上方：整勺倒進去（不用停著等）
      else if (target && s.load >= 1) {
        const info = TOP_INFO[s.loadType];
        const rim = target.rimCenter(new THREE.Vector3());
        const n = Math.round(s.load);
        for (let i = 0; i < n; i++) {
          const from = new THREE.Vector3(rim.x + (Math.random() - 0.5) * 0.03, rim.y + 0.02 + Math.random() * 0.04, rim.z + (Math.random() - 0.5) * 0.03);
          const v = new THREE.Vector3((Math.random() - 0.5) * 0.04, -0.3 - Math.random() * 0.3, (Math.random() - 0.5) * 0.04);
          if (s.isIce) items.spawn('ice', from, v);
          else items.spawn(info.shape === 'ball' ? 'ball' : 'cube', from, v, { top: s.loadType, color: info.color });
        }
        s.setLoad(0);
        sfx.plop();
        G.lastCup = target;
      }
    } else if (held.kind === 'lid') {
      if (held.lid.held !== h) { h.held = null; continue; }
      held.lid.moveTo(_v.copy(h.pos).add(_v2.set(0, -0.045, 0)));
    } else if (held.kind === 'rag') {
      if (rag.held !== h) { h.held = null; continue; }
      const s = h.surf;
      const onSurf = s && s.kind === 'surface';
      const y = onSurf ? s.point.y + 0.007 : h.pos.y - 0.025;
      rag.yaw += THREE.MathUtils.clamp((h.vel.x - h.vel.z) * 0.6, -3, 3) * dt; // 擦的時候布會轉一點
      rag.place(new THREE.Vector3(h.pos.x, y, h.pos.z), rag.yaw);
      if (onSurf && (h.frameMove || 0) > 0.0005) {
        const r = puddles.wipe(h.pos.x, s.point.y + 0.0015, h.pos.z, 0.085, (h.frameMove || 0) * 0.16);
        if (r.removed > 0) rag.soak(r.removed * 2.5, r.color);
        const n = items.sweep(h.pos.x, s.point.y, h.pos.z, 0.085);
        if ((r.removed > 0 || n) && Math.random() < 0.35) sfx.wipe();
        if (r.removed > 0) puddles.update();
      }
    } else if (held.kind === 'cash') {
      if (held.from === 'drawer' && !held.exact) {
        const sl = register.slotAt(h.pos);
        if (sl !== h.slotIn) { h.slotIn = sl; h.slotT = 0; h.slotGot = false; }
        else if (sl) { h.slotT += dt; if (!h.slotGot && h.slotT > 0.12) { held.pieces.push(sl); h.slotGot = true; sfx.clink(); } }
      }
      if (h.cashN !== held.pieces.length) { moneyStack(held.pieces, h.cash); h.cashN = held.pieces.length; }
      h.cash.visible = true;
    } else if (held.kind === 'pump') {
      held.pump.pressed = h.pos.distanceTo(held.pump.headPos) < 0.16;
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
          const sc = scoops.find((x) => x.well.top === h.surf.data.top && !x.held && !x.disabled);
          if (sc) { grabScoop(h, sc); continue; }
        } else {
          if (!iceScoop.held) { grabScoop(h, iceScoop); continue; }
        }
      }
      // 握拳的手碰到開關／按鈕＝按下去（電腦版第二隻手就是這樣操作）
      // 握拳壓著開關＝出茶，手離開就停
      let touching = null;
      for (const u of urns) if (h.pos.distanceTo(u.pickPos) < 0.095) touching = u;
      h.contact = touching || (h.contact && h.pos.distanceTo(h.contact.pickPos) < 0.14 ? h.contact : null);
      const btn = _v.set(L.syrup.x, Y + 0.34, L.syrup.z + 0.02);
      if (h.pos.distanceTo(btn) < 0.1) { h.held = { kind: 'syrup' }; syrup.pressed = true; sfx.button(); }
      else if (pumpBar.active) for (const pm of pumpBar.list) if (h.pos.distanceTo(pm.headPos) < 0.06) { h.held = { kind: 'pump', pump: pm }; pm.pressed = true; sfx.button(); break; }
    }
  }
}

// 雪克杯靠近杯子：歪過去，茶（和冰）慢慢倒進杯子，移開就停
function pourShaker(h, s, dt) {
  const cup = h.pourTarget;
  const on = cup && cup.alive && !cup.sealed && !cup.taken && Math.abs(s.pourTilt || 0) > 0.95;
  if (!on || (s.fill < 0.002 && s.ice <= 0)) { if (s.pouring) s.stream.hide(); s.pouring = false; return; }
  s.pouring = true; s.pourTo = cup;
  // 倒出來的地方＝杯口最低的那一點（杯口圓圈上，往下最多的方向）
  const rim = s.rimCenter(new THREE.Vector3());
  const d = new THREE.Vector3(0, -1, 0).addScaledVector(s.up, s.up.y); // 往下的方向扣掉沿杯身的部分
  const lip = d.lengthSq() > 1e-6 ? rim.addScaledVector(d.normalize(), s.R) : rim;
  const crim = cup.rimCenter(new THREE.Vector3());
  const liquid = s.fill;
  if (liquid > 0.002) {
    const a = Math.min(CONFIG.pour.shakerRate * dt, liquid);
    const f = a / liquid;
    const room = Math.max(0, cup.capacity - cup.level);
    const keep = Math.min(1, room / a); // 杯子滿了：多的灑出來
    const before = cup.fill;
    for (const k in s.tea) { const d = s.tea[k] * f; s.tea[k] -= d; cup.tea[k] += d * keep; }
    const ds = s.sugar * f; s.sugar -= ds; cup.sugar += ds * keep;
    const vin = a * keep;
    cup.mix = (before * cup.mix + vin * s.mix) / Math.max(1e-6, before + vin);
    if (s.chilled) cup.chilled = true;
    if (keep < 1) spillFrom(cup, 0, null, a * (1 - keep));
    s.iceCarry = (s.iceCarry || 0) + s.ice * f; // 冰塊跟著茶一起倒出來
    s.dirty = cup.dirty = true;
    s.stream.mat.color.copy(s.color());
    const sy = cup.bottomCenter(_v2).y + Math.min(1, cup.frac) * (cup.H - 0.004);
    s.stream.show(lip, sy, dt, 1.5);
  } else {
    s.stream.hide();
    s.iceCarry = (s.iceCarry || 0) + dt * CONFIG.pour.iceDripRate; // 茶倒完了：剩下的冰慢慢滑出來
  }
  while (s.iceCarry >= 1 && s.ice > 0) {
    s.iceCarry -= 1; s.ice--; s.dirty = true;
    items.spawn('ice', new THREE.Vector3(crim.x + (Math.random() - 0.5) * 0.012, crim.y + 0.035, crim.z + (Math.random() - 0.5) * 0.012), new THREE.Vector3(0, -0.4, 0));
  }
  if (s.ice <= 0) s.iceCarry = 0;
  G.lastCup = cup;
}

function warn(obj, html) {
  const key = html;
  if (G.warnKey === key && G.t - (G.warnT || -9) < 2.5) return;
  G.warnKey = key; G.warnT = G.t;
  hud.popup(obj.rimCenter ? obj.rimCenter(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0)) : obj, html.replace(/<[^>]+>/g, ''), 'warn small');
  G.warnHint = { html, t: G.t };
}

function respawnShaker(s, quiet) {
  if (s.lid) s.lid.toRest();
  for (const h of hands) if (h.held?.cup === s) h.held = null;
  s.held = null; s.locked = false; s.dropped = false; s.respawnT = null; s.lostT = 0; s.taken = false;
  s.aiming = false; s.pouring = false; s.pourTilt = 0; s.stream.hide();
  s.empty_();
  s.body.setBodyType(R.RigidBodyType.Dynamic, true);
  s.body.setTranslation({ x: s.home.x, y: s.home.y, z: s.home.z }, true);
  s.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  s.body.setLinvel({ x: 0, y: 0, z: 0 }, true); s.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  s.setHeldCollision(true); s.sync(); s.updateVisual(0);
  if (!quiet) { hud.popup(s.home.clone().add(new THREE.Vector3(0, 0.2, 0)), '雪克杯放回去了', 'small'); sfx.clink(); }
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
        c.mix = Math.max(c.mix, Math.min(1, c.shakes / CONFIG.pour.shakesToMix));
        c.jiggle = Math.min(1, c.jiggle + 0.35);
        if (c.shakes % 2 === 0) sfx.shake();
        if (c.shakes === CONFIG.pour.shakesToMix && false) { hud.popup(c.pos.clone().add(new THREE.Vector3(0, 0.12, 0)), '搖勻了！', 'good small'); sfx.good(); }
      } // 沒封膜還搖：交給「移動太快會灑」處理
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
  if (cup?.lid) warn(cup, '雪克杯<b>蓋著</b>，先打開蓋子才倒得進去');
  if (cup && cup.up.y > 0.85 && !cup.sealed && !cup.taken && !cup.lid) {
    const over = addFn(cup, rate * dt);
    if (cup.isShaker) G.filling = { cup, t: G.t };
    const lvl = Math.min(1, cup.frac);
    bottom = cup.bottomCenter(_v2).y + lvl * (cup.H - 0.004);
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
  for (const sk of shakers) if (sk.pouring) flows++;
  pumpBar.update(dt);
  for (const pm of pumpBar.list) {
    if (pumpBar.active && pm.press > 0.5) {
      flows += 0.4;
      pourSource(pm.nozzle, pm.stream, dt, pm.rate / 700, (c, a) => c.addLiquid(pm.id, a), pm.info.color, false);
      spend('ingredients', pm.rate * dt * (MON.liquidCost[pm.id] || 0.05));
    } else pm.stream.hide();
  }
  syrup.update(dt);
  // 果糖機面板：出口下面有杯子就顯示那杯的甜度
  { const hit = rcast(syrup.nozzle.clone().add(new THREE.Vector3(0, -0.004, 0)), 0.4); const cu = hit?.owner instanceof Cup && !hit.owner.sealed ? hit.owner : null; syrup.setDisplay(cu ? cu.sugar : null); }
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
    const p = rim.clone().addScaledVector(dir, c.R * 0.9);
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
    // 冰塊泡在茶裡一段時間＝冰鎮過
    if (!c.chilled && c.ice > 0 && c.fill > 0.1) { c.chillT += dt; if (c.chillT >= CONFIG.pour.chillSeconds) c.chilled = true; }
    if (c.taken) continue;
    // 傾斜灑出
    if (!c.sealed && !c.lid && c.level > 0.01 && !c.aiming && !c.locked) {
      const th = Math.acos(THREE.MathUtils.clamp(c.up.y, -1, 1));
      const lmax = th >= Math.PI / 2 ? -1 : 1 - (c.R * Math.tan(th)) / c.H;
      const ex = c.frac - lmax;
      if (ex > 0 && c.fill > 0.005) spillFrom(c, Math.min(1, (ex * 2.5 + 0.1) * dt * 3));
      if (th > 1.9 && (c.topCount > 0 || c.ice > 0) && Math.random() < dt * 20) {
        const rim = c.rimCenter(new THREE.Vector3());
        if (c.ice > 0) { c.ice--; items.spawn('ice', rim, c.vel.clone()); }
        else { const k = Object.keys(c.tops).find((k) => c.tops[k] > 0); c.tops[k]--; items.spawn(TOP_INFO[k].shape === 'ball' ? 'ball' : 'cube', rim, c.vel.clone(), { top: k, color: TOP_INFO[k].color }); }
        c.dirty = true;
      }
    }
    if (c.held || c.locked) continue;
    c.heldT = 0; c.moveSp = 0; c.sloshAcc = 0;
    // 撞擊：只有聲音，不會灑（倒下來才會從杯口流出來；封好的杯子用力砸才會爆）
    const dv = c.prevVel.distanceTo(c.vel);
    if (dv > 1.8 && c.age > 0.2) {
      if (dv > 3) sfx.thud(); else sfx.clink();
      if (c.sealed && dv > 4.3) burst(c, c.prevVel);
    }
    // 交給客人：放在出餐台上
    const w = G.win;
    if (w && !c.isShaker && w.waiting && w.state === 'idle' && c.speed < 0.15 && c.pos.z < L.ledge.z1 - 0.02 && c.pos.y > L.ledge.y && c.pos.y < L.ledge.y + 0.12 && c.up.y > 0.9) {
      c.ledgeT = (c.ledgeT || 0) + dt;
      if (c.ledgeT > 0.35) handOver(w, c);
    }
    // 飛出去的杯子撞到客人
    if (c.speed > 0.6 && c.pos.z < L.windowZ + 0.1 && c.respawnT == null) {
      for (const cu of customers) {
        if (['gone', 'fly', 'down', 'flee'].includes(cu.state) || cu.cup) continue;
        if (cu.hitTest(c.pos, 0.05)) {
          if (c.speed >= CONFIG.throw.hitSpeed) { hitCustomer(cu, c); break; }
          if (cu === G.win && cu.waiting && !c.isShaker) { handOver(cu, c); break; }
        }
      }
    }
    if (!c.alive) continue;
    // 雪克杯：掉到地上、飛出櫃台、倒在台面上 → 回到原位（空的）
    if (c.isShaker) {
      if (c.respawnT != null) { c.respawnT -= dt; if (c.respawnT <= 0) respawnShaker(c); continue; }
      const K = L.counter;
      const off = c.pos.y < 0.5 || c.pos.z < K.z0 - 0.06 || c.pos.x < K.x0 - 0.04 || c.pos.x > K.x1 + 0.04 || c.pos.z > K.z1 + 0.08;
      const tipped = c.up.y < 0.5 && c.speed < 0.2;
      if (off || tipped) {
        c.lostT = (c.lostT || 0) + dt;
        if (c.lostT > (off ? 0.7 : 0.9)) { if (c.fill > 0.01 && !c.lid) spillFrom(c, 1, c.vel); c.respawnT = 0.3; c.lostT = 0; }
      } else c.lostT = 0;
      continue;
    }
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
  const idle = cups.filter((c) => c.alive && !c.held && !c.locked && !c.taken && !c.isShaker).sort((a, b) => a.touched - b.touched);
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
  c.rv = {};
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
    G.spawnT = CONFIG.shift.spawnGap[0] + Math.random() * (CONFIG.shift.spawnGap[1] - CONFIG.shift.spawnGap[0]);
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
    c.waiting = true; c.arriveT = G.t; c.patience = CONFIG.patience[c.kind] + (isHard() ? CONFIG.hard.patienceBonus : 0);
    const line = c.kind === 'normal' ? c.quote.line.replace('{order}', orderName(c.order)) : c.quote.line;
    hud.say(c, line, { hot: c.kind === 'rude', time: 3.4 });
    c.say(1.8);
    if (c.kind !== 'rude') startPay(c);
    hud.showTicket(c, c.no);
    if (c.kind === 'rude') sfx.rude(); else sfx.ding();
    setTimeout(() => { if (c.waiting) c.wantReach = true; }, 1200);
  });
  if (rush) { c.speed = 2.6; hud.say(c, c.quote.line, { hot: true, time: 2.5 }); }
}

function leave(c, mood) {
  c.waiting = false; c.wantReach = false; c.waitPay = false;
  setTimeout(() => postReview(c), 1600);
  if (G.pay?.cust === c) {
    const P = G.pay;
    // 錢收了卻沒拿到飲料就走：退錢
    if (P.taken && !c.gotDrink && G.phase === 'play') { G.money.revenue -= P.paid; hud.popup(c.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), `退錢 −NT$${P.paid}`, 'bad small'); }
    G.pay = null; refreshTray(); updateRegDisplay();
  }
  if (G.win === c) { G.win = null; hud.showTicket(null); }
  const qi = G.queue.indexOf(c); if (qi >= 0) G.queue.splice(qi, 1);
  if (mood) c.fig.baseExpr = mood;
  const side = c.exit;
  setTimeout(() => {
    if (c.state === 'gone') return;
    c.walkTo([new THREE.Vector3(c.pos.x, 0, -2.6), side], () => { c.state = 'gone'; });
  }, 900);
}

const RM = CONFIG.remake;
// 做錯的飲料客人收不收
function acceptWrong(c, errs) {
  const severe = errs.some((e) => RM.severe.some((k) => e.startsWith(k)));
  let p = severe ? RM.severeAccept : (RM.accept[c.kind] ?? 0.5) - RM.perExtraError * (errs.length - 1);
  if ((c.remakes || 0) >= RM.maxRemakes) p += 0.25; // 已經退過：比較會將就
  return Math.random() < Math.max(0, Math.min(1, p));
}
// 退回重做：杯子收走（算浪費），客人繼續等
function rejectCup(c, cup, errs) {
  cup.taken = true;
  for (const h of hands) if (h.held?.cup === cup) h.held = null;
  cup.held = null;
  const P = c.pos.clone().add(new THREE.Vector3(0, 1.75 * c.look.height, 0));
  cup.dispose();
  G.stats.remade = (G.stats.remade || 0) + 1;
  c.rv.remade = true; c.rv.errs = errs;
  c.fig.baseExpr = 'sad'; sfx.bad();
  if ((c.remakes || 0) >= RM.maxRemakes) {
    // 重做了還錯：不要了
    c.rv.outcome = 'remakeFail';
    addScore(SC.walkout, P, false, '客人不要了');
    hud.say(c, pick(['又錯了⋯算了不要了', '我去別家買好了', '你們今天是不是很忙⋯']), { hot: true, time: 2.4 });
    leave(c, 'angry');
    return;
  }
  c.remakes = (c.remakes || 0) + 1;
  addScore(SC.remake, P, false, '退回重做');
  hud.stamp('退回重做', 'lose');
  hud.say(c, pick([`${errs[0]}耶，可以重做嗎？`, `這不是我點的，麻煩重做`, `欸，${errs[0]}，幫我重做一杯`, `我要的不是這樣喔，重來好嗎？`]), { time: 3 });
  // 耐心至少回到七成
  const k = 1 - (G.t - c.arriveT) / c.patience;
  if (k < RM.patienceAfter) c.arriveT = G.t - (1 - RM.patienceAfter) * c.patience;
  c.wantReach = false;
  setTimeout(() => { if (c.waiting) c.wantReach = true; }, 1400);
  if (G.win === c) hud.showTicket(c, c.no);
}

function handOver(c, cup) {
  if (cup.taken || !c.waiting || cup.isShaker) return;
  if (c.kind !== 'rude') {
    const errs0 = judge(cup, c.order, c.rule);
    if (!cup.sealed) errs0.unshift('沒封膜');
    if (errs0.length && !acceptWrong(c, errs0)) { rejectCup(c, cup, errs0); return; }
  }
  cup.taken = true;
  for (const h of hands) if (h.held?.cup === cup) h.held = null;
  cup.held = null;
  cup.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
  c.cup = cup; c.waiting = false; c.wantReach = false;
  const t = G.t - c.arriveT;
  const P = c.pos.clone().add(new THREE.Vector3(0, 1.75 * c.look.height, 0));
  if (c.kind === 'rude') {
    c.rv.outcome = 'rudeServed';
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
    c.rv.outcome = errs.length ? 'accepted' : 'perfect'; c.rv.errs = errs;
    c.rv.fast = t <= SC.fast[0][0]; c.rv.slow = t > c.patience * 0.75;
    if (!errs.length) {
      G.stats.perfect++;
      for (const [sec, b] of SC.fast) if (t <= sec) { pts += b; lines.unshift(`手腳很快 +${b}`); break; }
      if (c.rule && ruleDone(cup, c.rule, true)) {
        c.rv.picky = true;
        pts += SC.pickyBonus; lines.unshift(`刁難成功 +${SC.pickyBonus}`);
        if (c.rule.iceExact === 1) G.stats.oneIce++;
        hud.say(c, pick(quotes.react.pickyWin)); c.fig.baseExpr = 'happy';
      } else { hud.say(c, pick(quotes.react.happy)); c.fig.baseExpr = 'happy'; }
      sfx.good();
    } else {
      // 錯了但客人將就收下（不退錢）
      const R = quotes.react;
      const base = errs[0] === '沒封膜' && R.unsealed ? pick(R.unsealed) : errs.includes('沒搖勻') && errs.length === 1 ? pick(R.layered) : errs.some((e) => e.startsWith('茶太少')) ? pick(R.spilled) : pick(R.wrong);
      hud.say(c, `${base}${pick(['⋯算了，就這樣吧', '⋯好啦將就喝', '，下次注意喔', ''])}`);
      c.fig.baseExpr = errs.length > 2 ? 'angry' : 'sad'; sfx.bad();
    }
    addScore(pts, P, false, errs.length ? '' : '全對！');
    lines.forEach((l, i) => setTimeout(() => hud.popup(P.clone().add(new THREE.Vector3(0, -0.12 * (i + 1), 0)), l, l.includes('+') ? 'good small' : 'bad small'), 120 * (i + 1)));
    if (c.kind !== 'rude' && !c.rule?.sameAsLast) G.served.push({ order: c.order, look: c.look });
  }
  c.drinking = true; c.gotDrink = true;
  setTimeout(() => { c.drinking = false; }, 1500);
  const Pp = G.pay;
  if (Pp && Pp.cust === c && !Pp.done) {
    c.waitPay = true;
    setTimeout(() => { if (c.waitPay) hud.say(c, Pp.taken ? '還沒找錢喔～' : '錢在找零盤上喔', { time: 2.2 }); }, 1600);
  } else leave(c, null);
}

function hitCustomer(cu, cup) {
  const v = cup.vel.clone();
  const p = cup.pos.clone();
  const vol = cup.fill;
  const color = '#' + cup.color().getHexString();
  // 杯子炸開
  splash(items, p, v.clone().setY(0).normalize().multiplyScalar(0.9).setY(0.6), color, 60, { speed: 2.6, spread: 1.1, vol: vol * 0.6, up: 1.4, free: true, size: 2.2 });
  for (const k in cup.tops) for (let i = 0; i < Math.min(10, cup.tops[k]); i++) items.spawn(TOP_INFO[k].shape === 'ball' ? 'ball' : 'cube', p.clone(), new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 2.5, (Math.random() - 0.5) * 2.5 + 0.8), { top: k, color: TOP_INFO[k].color });
  if (cup.isShaker) { cup.empty_(); cup.respawnT = 0.7; } else cup.dispose();
  sfx.splash(); G.shake = 0.8;
  cu.fig.drench(color, vol > 0.1 ? 0.8 : 0.35);
  const P = cu.pos.clone().add(new THREE.Vector3(0, 1.7 * cu.look.height, 0));
  cu.rv.outcome = cu.kind === 'rude' ? 'rudeHit' : 'hitGood';
  if (cu.kind === 'rude') {
    setTimeout(() => postReview(cu), 2200); // 奧客被砸飛：不會走 leave()
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
    if ((c.waiting || c.waitPay) && G.phase === 'play') {
      const k = 1 - (G.t - c.arriveT) / c.patience;
      if (c === G.win) hud.setPatience(k);
      if (k < 0.35 && c.fig.baseExpr === 'neutral') c.fig.baseExpr = 'sad';
      if (k <= 0) {
        if (c.kind === 'rude') { hud.say(c, '哼，不買了'); c.rv.outcome = 'rudeLeft'; }
        else if (c.waitPay) { c.rv.change = 'none'; addScore(SC.noChange, c.pos.clone().add(new THREE.Vector3(0, 1.7, 0)), false, '沒找錢'); hud.say(c, '不找錢喔？？', { hot: true, time: 2 }); }
        else { c.rv.outcome = 'walkout'; addScore(SC.walkout, c.pos.clone().add(new THREE.Vector3(0, 1.7, 0)), false, '客人走掉了'); hud.say(c, '等好久喔⋯不要了', { time: 2 }); }
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

// ---------------- 評論 ----------------
function postReview(c) {
  if (!c.rv || c.rv.posted || G.phase !== 'play') return;
  c.rv.posted = true;
  if (!c.rv.outcome) c.rv.outcome = c.kind === 'rude' ? 'rudeLeft' : 'walkout';
  const r = makeReview({ ...c.rv, kind: c.kind, drink: orderName(c.order), tops: c.order?.tops, hard: isHard() });
  G.reviews.push(r);
  hud.showReview(r);
}
function reviewsHtml() {
  const list = G.reviews || [];
  if (!list.length) return '<div class="rv-empty">這一班沒有人留評論</div>';
  const avg = list.reduce((a, r) => a + r.stars, 0) / list.length;
  return `<div class="rv-sum"><b>${avg.toFixed(1)}</b><span class="rv-stars">${starText(Math.round(avg))}</span><span>${list.length} 則評論</span></div>` + list.map((r) => hud.reviewHtml(r)).join('');
}

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

// ---------------- 收銀 ----------------
const priceOf = (o) => o.price ?? (MON.price[o.tea] + (o.top ? MON.topping : 0));
// 把金額拆成鈔票、硬幣（客人付錢用）
function breakDown(n) {
  const out = [];
  for (const v of [1000, 500, 100, 50, 10, 5, 1]) while (n >= v) { out.push(v); n -= v; }
  return out;
}
function choosePaid(price) {
  const C = CONFIG.cash, r = Math.random();
  if (r < C.exact) return price;
  if (r < C.exact + C.big1000 && price < 1000) return 1000;
  if (r < C.exact + C.big1000 + C.big500 && price < 500) return 500;
  const opts = [Math.ceil((price + 1) / 50) * 50, Math.ceil((price + 1) / 100) * 100];
  return opts[(Math.random() * opts.length) | 0];
}
function startPay(c) {
  const price = priceOf(c.order), paid = choosePaid(price);
  G.pay = { cust: c, price, paid, denoms: breakDown(paid), onTray: true, taken: false, changeOnTray: [], given: null, done: false, trayT: 0 };
  c.pay = G.pay;
  refreshTray(); updateRegDisplay();
}
// 還要找多少（已經找的、放在找零盤上的都扣掉）
function changeDue() {
  const P = G.pay;
  if (!P || !P.taken) return 0;
  return P.paid - P.price - (P.given || 0) - P.changeOnTray.reduce((a, b) => a + b, 0);
}
function refreshTray() {
  const P = G.pay;
  register.setTray(P ? [...(P.onTray ? P.denoms : []), ...P.changeOnTray] : []);
}
function updateRegDisplay() {
  const P = G.pay;
  register.setDisplay(P ? { price: P.price, paid: P.taken ? P.paid : null, change: P.taken ? P.paid - P.price : null } : null);
}
function headPos(c) { return c.pos.clone().add(new THREE.Vector3(0, 1.7 * c.look.height, 0)); }
// 做錯：錢收了就退（找零照找）；還沒收，客人把錢拿回去
function refundWrong(c) {
  const P = G.pay;
  if (!P || P.cust !== c) return;
  if (P.taken) { G.money.revenue -= P.price; hud.popup(headPos(c).add(new THREE.Vector3(0.2, -0.3, 0)), `退錢 −NT$${P.price}`, 'bad small'); }
  else { P.onTray = false; P.done = true; refreshTray(); }
}
function settleChange(P) {
  const given = P.changeOnTray.reduce((a, b) => a + b, 0);
  P.changeOnTray = []; refreshTray();
  P.given = (P.given || 0) + given;
  G.money.revenue -= given; sfx.clink();
  const c = P.cust, need = P.paid - P.price, pos = headPos(c);
  if (c.rv) { c.rv.change = P.given === need ? 'ok' : P.given < need ? 'short' : 'over'; c.rv.changeDiff = Math.abs(need - P.given); }
  if (P.given === need) { addScore(SC.changeOk, pos, false, '找錢正確'); if (!c.gotDrink) hud.say(c, '謝謝～', { time: 1.5 }); }
  else if (P.given < need) { addScore(SC.changeShort, pos, false, `少找 ${need - P.given} 元`); hud.say(c, `少找 ${need - P.given} 塊吧！？`, { hot: true, time: 2.2 }); c.fig.baseExpr = 'angry'; }
  else { hud.popup(pos, `多找 ${P.given - need} 元（老闆虧了）`, 'bad small'); hud.say(c, '嘿嘿，賺到', { time: 1.8 }); }
}
function updatePay(dt) {
  const P = G.pay;
  if (P) {
    // 零錢放在找零盤上，手離開一下，客人就拿走
    if (P.changeOnTray.length && !hands.some((h) => h.held?.kind === 'cash' && register.overTray(h.pos))) {
      P.trayT += dt;
      if (P.trayT > 0.7) settleChange(P);
    }
    if (!P.done && P.taken && (P.paid === P.price || P.given != null)) {
      P.done = true;
      const c = P.cust;
      if (c.gotDrink) setTimeout(() => { if (G.pay === P) leave(c, null); }, 500);
    }
  }
  // 沒在用：抽屜自己關上
  const busy = hands.some((h) => h.held?.kind === 'cash') || (P && P.taken && !P.done);
  if (register.open && !busy) { G.regIdle = (G.regIdle || 0) + dt; if (G.regIdle > 1.6) { register.open = false; sfx.clink(); } }
  else G.regIdle = 0;
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
const iceInfo = (id) => CONFIG.menu.ice.find((x) => x.id === id) || {};
function updateHint() {
  if (G.phase !== 'play' || !G.hintsOn) { hud.setHint(''); return; }
  const w = G.win;
  const press = TOUCH ? '按住' : '按住滑鼠';
  if (!w || (!w.waiting && !w.waitPay)) { hud.setHint(''); return; }
  if (w.kind === 'rude') { hud.setHint('奧客！拿個杯子或<b>雪克杯</b>，<b>用力往他甩</b>'); return; }
  const Pm = G.pay;
  if (Pm && Pm.cust === w && !Pm.done) {
    const holding = hands.find((x) => x.held?.kind === 'cash');
    if (holding?.held.from === 'customer') { hud.setHint('把錢放進<b>收銀機</b>（櫃台中間）'); return; }
    if (Pm.onTray && !Pm.taken) { hud.setHint(`客人把錢放在窗口的<b>找零盤</b>：${press}拿起來，放進<b>收銀機</b>`); return; }
    if (Pm.taken && Pm.paid > Pm.price && Pm.given == null) {
      const sum = holding ? holding.held.pieces.reduce((a, b) => a + b, 0) : 0;
      hud.setHint(holding ? `手上 NT$${sum}，放到窗口的<b>找零盤</b>` : `找錢 <b>${Pm.paid - Pm.price}</b> 元：${press}收銀機<b>抽屜裡的零錢</b>，就會拿到剛好的錢`);
      return;
    }
  }
  if (w.waitPay) { hud.setHint(''); return; }
  const heldC = hands.map((h) => h.held?.cup).filter(Boolean);
  const cup = heldC.find((c) => !c.isShaker) || (G.lastCup?.alive && !G.lastCup.taken && !G.lastCup.isShaker ? G.lastCup : null);
  const shk = heldC.find((c) => c.isShaker) || shakers.filter((x) => !x.empty).sort((a, b) => b.touched - a.touched)[0] || null;
  const o = w.order, ii = iceInfo(o.ice);
  const want = teaWant(o, w.rule);
  const teaMain = o.drink ? Object.keys(drinkById(o.drink).base)[0] : o.tea;
  const poured = cup && cup.fill > 0.25;
  // 剛剛跳過的提醒（蓋子、料不能加進雪克杯）先顯示
  if (G.warnHint && G.t - G.warnHint.t < 2.5) { hud.setHint(G.warnHint.html); return; }
  let t = '';
  const needTop = (o.tops || (o.top ? [o.top] : [])).find((id) => !cup || cup.tops[id] < 6);
  if (needTop && !poured && (!cup || cup.tops[needTop] < 6)) t = !cup ? `${press}<b>杯架</b>拿一個杯子（料加在杯子裡，不加進雪克杯）` : `${press}料槽裡的<b>勺子</b>（伸進去就是一勺），移到<b>杯子</b>口倒`;
  else if (!poured && !cup?.sealed) {
    const mixed = shk && shk.mix >= 0.95;
    if (!mixed) t = o.drink ? hardStep(o, shk, ii, w, press, want) : normalStep(o, shk, ii, w, press, want);
    else if ((o.ice === 'none') && shk.ice > 0) t = '去冰：用<b>空的冰鏟</b>伸進雪克杯，把冰刮出來';
    else if (!cup) t = `${press}<b>杯架</b>拿一個杯子放在台面中間`;
    else t = '拿著雪克杯<b>靠近杯子</b>就會倒，<b>全部倒進去</b>（杯子上會顯示幾 cc）';
  }
  else if (cup && shk && shk.fill > 0.02 && shk.mix >= 0.95 && !shk.lid && !cup.sealed && cup.cc(teaMain) < want - CONFIG.menu.teaTol.low) t = '雪克杯裡還有茶：拿著雪克杯<b>靠近杯子</b>，全部倒進去';
  else if (cup && o.ice === 'none' && cup.ice > 0 && !cup.sealed) t = '去冰：用<b>空的冰鏟</b>伸進杯子，把冰刮出來';
  else if (cup && !cup.sealed) t = '把杯子放進<b>封膜機</b>（搖茶機右邊）';
  else t = '交給客人：<b>伸到窗口放開</b>，或放在出餐台';
  hud.setHint(t);
}

// 一般版：雪克杯裡放茶、果糖、冰 → 蓋上 → 搖
function normalStep(o, shk, ii, w, press, want) {
  const teaName = teaById(o.tea).name;
  const have = shk ? shk.cc(o.tea) : 0;
  if (!shk || have < want - CONFIG.menu.teaTol.low) {
    if (shk?.lid) return '雪克杯<b>蓋著</b>：按住蓋子拿起來，打開才倒得進去';
    return `${press}<b>雪克杯</b>拿到${teaName}桶下的圈，<b>按住開關</b>倒到 <b>${want}cc</b>（雪克杯上會顯示）`;
  }
  const sweetWant = w.rule?.sweetExact != null ? w.rule.sweetExact * 4 : o.sweet;
  if (Math.abs(shk.sugar - sweetWant) > CONFIG.menu.sweetTolerance && !shk.lid) return sweetWant > 0 ? `雪克杯放到<b>果糖機</b>下的圈，${press}按鈕到 <b>${sweetWant}cc</b>` : '這杯不加果糖';
  const iceWant = w.rule?.iceExact != null ? w.rule.iceExact : ii.chilled !== false ? Math.max(1, ii.min) : 0;
  if (shk.ice < iceWant && !shk.lid) return `${press}<b>冰桶</b>的冰鏟，插進冰桶＝一鏟；移到<b>雪克杯</b>口，冰一顆一顆掉進去`;
  if (!shk.lid) return `拿<b>雪克杯蓋</b>（雪克杯前面）放到雪克杯口上，<b>蓋起來</b>`;
  return '蓋好的雪克杯放上<b>搖茶機</b>（收銀機右邊），會自動搖勻';
}

// 困難版：照配方一樣一樣加進雪克杯
function hardStep(o, shk, ii, w, press, want) {
  const d = drinkById(o.drink);
  const keys = Object.entries(d.base);
  for (let i = 0; i < keys.length; i++) {
    const [k, base] = keys[i];
    const need = i === 0 ? want : base;
    const have = shk ? shk.cc(k) : 0, name = CONFIG.liquids[k].name;
    if (have < need - (i === 0 ? CONFIG.menu.teaTol.low : CONFIG.liquids[k].kind === 'dairy' ? 25 : 6)) {
      if (!shk) return `${press}<b>雪克杯</b>，照小白單的配方一樣一樣加`;
      if (shk.lid) return '雪克杯<b>蓋著</b>：按住蓋子拿起來，打開才倒得進去';
      return CONFIG.liquids[k].kind === 'tea' ? `雪克杯放到<b>${name}桶</b>下，按住開關倒到 <b>${need}cc</b>` : `雪克杯放到<b>配料吧</b>「${name}」的出口下，按住壓頭，加 <b>${need}cc</b>`;
    }
  }
  if (!d.fixed && Math.abs(shk.sugar - o.sweet) > CONFIG.hard.tol.sugar && w.rule?.sweetExact == null && !shk.lid) return `雪克杯放到<b>果糖機</b>下，${press}按鈕到 <b>${o.sweet}cc</b>`;
  if (ii.chilled !== false && w.rule?.iceExact == null && shk.ice < Math.max(1, ii.min) && !shk.lid) return `${press}<b>冰桶</b>的冰鏟，插進冰桶＝一鏟；移到<b>雪克杯</b>口，冰一顆一顆掉進去`;
  if (!shk.lid) return `拿<b>雪克杯蓋</b>（雪克杯前面）放到雪克杯口上，<b>蓋起來</b>`;
  return '蓋好的雪克杯放上<b>搖茶機</b>（收銀機右邊），會自動搖勻';
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
  shakeMachine.update(dt, cups, (c) => { hud.popup(c.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), '搖勻了！', 'good small'); sfx.good(); }, sfx, (c) => warn(c, '先蓋上<b>雪克杯蓋</b>才能搖'));
  register.update(dt);
  updatePay(dt);
  rinser.update(dt, cups, (c) => {
    const vol = c.fill;
    if (vol > 0.002) waste(vol, c.pos, '#' + c.color().getHexString(), false);
    c.empty_(); hud.popup(c.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), '沖乾淨了', 'small');
  }, sfx);
  phys.step(dt);
  for (const s of scoops) s.sync(dt);
  updateCups(dt);
  for (const l of lids) l.update(dt);
  items.update(dt, cups, itemHooks);
  puddles.update();
  updateCustomers(dt);
  traffic.update(dt);
  if (G.wastePop > 0 && (G.wastePopT = (G.wastePopT || 0) + dt) > 0.9) { hud.popup(G.wastePos, `灑出來 −${G.wastePop}`, 'bad small'); G.wastePop = 0; G.wastePopT = 0; }
  const show = hands.map((h) => h.held?.cup).find(Boolean) || (G.lastCup?.alive && !G.lastCup.taken && !G.lastCup.dropped ? G.lastCup : null);
  hud.showCup(G.phase === 'play' ? show : null);
  // 拿著勺子／冰鏟：旁邊顯示裡面有幾顆
  const sh = hands.find((h) => h.held?.kind === 'scoop');
  const pourer = shakers.find((x) => x.pouring && x.pourTo?.alive);
  const ch = hands.find((x) => x.held?.kind === 'cash');
  if (G.phase === 'play' && ch) hud.showTool(ch.pos, `NT$${ch.held.pieces.reduce((a, b) => a + b, 0)}`);
  else if (G.phase === 'play' && pourer) hud.showTool(pourer.pourTo.rimCenter(new THREE.Vector3()), `${Math.round(pourer.pourTo.fill * 700)}cc`); // 雪克杯倒進杯子：杯子上顯示幾 cc
  else if (G.phase === 'play' && G.filling && G.t - G.filling.t < 0.35 && G.filling.cup.alive) hud.showTool(G.filling.cup.rimCenter(new THREE.Vector3()), `${Math.round(G.filling.cup.fill * 700)}cc`); // 倒進雪克杯：顯示幾 cc
  else hud.showTool(G.phase === 'play' && sh ? sh.held.scoop.pos : null, sh ? `${sh.held.scoop.isIce ? '冰' : TOP_INFO[sh.held.scoop.loadType].name} ${Math.round(sh.held.scoop.load)} 顆` : '');
  updateHint();
  hud.update(dt);
  rend.render();
  if (G.capture) { G.capture(); G.capture = null; }
}

// ---------------- 一班的開始與結束 ----------------
// 一般版／困難版：換茶桶、配料吧、布丁槽
function applyMode(mode) {
  G.mode = mode; setMode(mode);
  const hard = mode === 'hard';
  const teas = hard ? CONFIG.hard.urns : L.urns.map((u) => u.tea);
  urns.forEach((u, i) => u.setTea(teas[i]));
  pumpBar.setActive(hard);
  for (const w of wells.list) if (w.hard) { w.disabled = !hard; if (w.lid) w.lid.visible = !hard; }
  for (const s of scoops) if (s.well?.hard) { s.disabled = !hard; s.group.visible = hard; }
  document.body.classList.toggle('hard', hard);
}
const hardUnlocked = () => { try { return params.has('hard') || localStorage.getItem('yyl-hard') === '1'; } catch (e) { return params.has('hard'); } };

function startShift(mode = G.mode || 'normal') {
  if (mode === 'hard' && !hardUnlocked()) mode = 'normal';
  applyMode(mode);
  for (const c of [...cups]) if (!c.isShaker) c.dispose();
  cups.length = 0; cups.push(...shakers);
  for (const sk of shakers) respawnShaker(sk, true);
  shakeMachine.carry = null;
  for (const l of lids) l.toRest();
  G.reviews = []; hud.clearReviews();
  for (const c of customers) { if (c.cup?.alive) c.cup.dispose(); c.dispose(); }
  customers.length = 0;
  items.clear(); puddles.clear();
  for (const u of urns) u.open = false;
  for (const s of scoops) { s.setLoad(0); s.toRest(true); }
  rag.reset();
  G.pay = null; register.open = false; refreshTray(); updateRegDisplay();
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
  G.unlockedNow = false;
  if (G.mode !== 'hard' && G.score >= CONFIG.hard.unlockScore && !hardUnlocked()) {
    try { localStorage.setItem('yyl-hard', '1'); } catch (e) { /* 忽略 */ }
    G.unlockedNow = true;
  }
  sfx.win();
  G.capture = () => {
    const shot = document.createElement('canvas');
    const src = $('gl');
    shot.width = src.width; shot.height = src.height;
    shot.getContext('2d').drawImage(src, 0, 0);
    const m = moneySummary();
    const rv = G.reviews || [];
    const card = drawCard(shot, { score: G.score, stats: G.stats, money: m, rating: rv.length ? rv.reduce((x, r) => x + r.stars, 0) / rv.length : null });
    showReceipt(m);
    const url = card.toDataURL('image/png');
    $('result-img').src = url;
    $('btn-download').onclick = () => { const a = document.createElement('a'); a.href = url; a.download = '手搖飲搖搖樂-結算.png'; a.click(); };
    $('hud').hidden = true;
    $('result-unlock').hidden = !G.unlockedNow;
    $('result-reviews').innerHTML = `<h3>顧客評論</h3>${reviewsHtml()}`;
    $('btn-hard2').hidden = !hardUnlocked();
    $('btn-again').textContent = G.mode === 'hard' ? '再上一班（困難版）' : '再上一班';
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
  const go = (mode) => { if (isMuted() && $('chk-sound')?.checked) { setMuted(false); paint(); } startShift(mode); };
  $('btn-start').addEventListener('click', () => go('normal'));
  $('btn-hard').addEventListener('click', () => { if (hardUnlocked()) go('hard'); });
  $('btn-again').addEventListener('click', () => startShift(G.mode));
  $('btn-hard2').addEventListener('click', () => startShift('hard'));
  const hb = $('btn-hard');
  if (hardUnlocked()) { hb.disabled = false; hb.textContent = '困難版'; }
  else { hb.disabled = true; hb.textContent = `困難版（一般版 ${CONFIG.hard.unlockScore} 分解鎖）`; }
  $('ctl-desktop').hidden = TOUCH; $('ctl-touch').hidden = !TOUCH;
}

boot();
