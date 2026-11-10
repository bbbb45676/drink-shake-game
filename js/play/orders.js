import { CONFIG } from '../config.js';

const M = CONFIG.menu;
const HD = CONFIG.hard;
const LIQ = CONFIG.liquids;
export const teaById = (id) => M.teas.find((t) => t.id === id) || (LIQ[id] && { id, ...LIQ[id] });
export const drinkById = (id) => HD.drinks.find((d) => d.id === id);
// 現在是一般版還是困難版
let MODE = 'normal';
export function setMode(m) { MODE = m; }
export const isHard = () => MODE === 'hard';
export const modeToppings = () => M.toppings.filter((t) => !t.hard || MODE === 'hard');
export const topById = (id) => M.toppings.find((t) => t.id === id);
export const iceById = (id) => M.ice.find((t) => t.id === id);
export const sweetName = (v) => {
  const s = M.sweet.reduce((a, b) => (Math.abs(b.v - v) < Math.abs(a.v - v) ? b : a));
  return s.name;
};
const pick = (a) => a[(Math.random() * a.length) | 0];

// 茶要幾 cc（倒進雪克杯）：冰越少，茶越多。指定冰塊顆數時照顆數算（一顆約 25cc）
export function iceTeaAdd(o, rule) {
  if (rule?.iceExact != null) return Math.round(((8 - rule.iceExact) * 24.5) / 10) * 10;
  return M.iceTeaAdd[o.ice] ?? 0;
}
export function teaWant(o, rule) {
  if (o.drink) { const d = drinkById(o.drink); return Object.values(d.base)[0] + iceTeaAdd(o, rule); }
  return M.teaCc + iceTeaAdd(o, rule);
}

export function randomOrder() {
  if (MODE === 'hard') return hardOrder();
  const tea = pick(M.teas).id;
  const sweet = pick(M.sweet).v;
  const ice = pick(M.ice).id;
  const top = Math.random() < 0.65 ? pick(modeToppings()).id : null;
  return { tea, sweet, ice, top, tops: top ? [top] : [] };
}

// 困難版：照真實配方的飲料
function hardOrder() {
  const d = pick(HD.drinks);
  const si = d.fixed ? -1 : (Math.random() * HD.sweetPct.length) | 0;
  const sweet = d.fixed ? 0 : Math.round(d.sugarFull * HD.sweetPct[si]);
  const sweetName = d.fixed ? '固定甜度' : M.sweet[si].name;
  const ice = pick(M.ice).id;
  const tops = d.top ? [d.top] : [];
  let extra = null;
  if (Math.random() < HD.extraTopChance) extra = pick(M.toppings.filter((t) => !tops.includes(t.id))).id;
  if (extra) tops.push(extra);
  const price = d.price + (extra ? HD.toppingPrice[extra] || 10 : 0);
  return { drink: d.id, tea: Object.keys(d.base)[0], sweet, sweetName, ice, top: tops[0] || null, tops, extra, price };
}

export function orderName(o) {
  if (o.drink) { const d = drinkById(o.drink); return o.extra ? `${d.name}加${topById(o.extra).name}` : d.name; }
  const t = teaById(o.tea).name;
  if (!o.top) return t;
  return topById(o.top).name + t;
}

// 點單小白單上的四行（刁難客的那一行改成紅字）
export function ticketRows(o, rule) {
  if (o.drink) return hardRows(o, rule);
  // 第 4 欄是配方（照單做要放多少）：茶、果糖、冰都放進雪克杯；料放杯子
  const rows = [
    ['茶', teaById(o.tea).name, false, `${teaWant(o, rule)}cc（倒進雪克杯）`],
    ['甜度', sweetName(o.sweet), false, o.sweet ? `果糖 ${o.sweet}cc` : '不加果糖'],
    ['冰塊', iceById(o.ice).name, false, iceById(o.ice).recipe],
    ['加料', o.top ? topById(o.top).name : '不加', false, o.top ? '一勺，加在杯子裡' : ''],
  ];
  if (rule?.iceExact != null) rows[2] = ['冰塊', `剛好 ${rule.iceExact} 顆`, true, `冰 ${rule.iceExact} 顆`];
  if (rule?.toppingExact) { const [k, n] = Object.entries(rule.toppingExact)[0]; rows[3] = ['加料', `${topById(k).name}剛好 ${n} 顆`, true, `${n} 顆`]; }
  if (rule?.sweetExact != null) rows[1] = ['甜度', `剛好 ${rule.sweetExact.toFixed(1)} 分`, true, `果糖 ${(rule.sweetExact * 4).toFixed(1)}cc`];
  return rows;
}

function hardRows(o, rule) {
  const d = drinkById(o.drink);
  const rows = [['飲料', d.name, false, '']];
  Object.entries(d.base).forEach(([k, cc], i) => rows.push([LIQ[k].name, `${i === 0 ? teaWant(o, rule) : cc}cc`, false, i === 0 ? '倒進雪克杯（冰少茶多，已經算好）' : '']));
  rows.push(rule?.sweetExact != null
    ? ['甜度', `剛好 ${rule.sweetExact.toFixed(1)} 分`, true, `果糖 ${(rule.sweetExact * 4).toFixed(1)}cc`]
    : ['甜度', o.sweetName, false, d.fixed ? '甜度固定，不加果糖' : o.sweet ? `果糖 ${o.sweet}cc（全糖 ${d.sugarFull}cc）` : '不加果糖']);
  rows.push(rule?.iceExact != null ? ['冰塊', `剛好 ${rule.iceExact} 顆`, true, `冰 ${rule.iceExact} 顆`] : ['冰塊', iceById(o.ice).name, false, iceById(o.ice).recipe]);
  if (rule?.toppingExact) { const [k, n] = Object.entries(rule.toppingExact)[0]; rows.push(['加料', `${topById(k).name}剛好 ${n} 顆`, true, `${n} 顆`]); }
  else if (!o.tops.length) rows.push(['加料', '不加', false, '']);
  else for (const t of o.tops) rows.push(['加料', topById(t).name, false, '一勺，加在杯子裡']);
  return rows;
}

// 刁難客：把規則套進訂單，讓一般欄位不衝突
export function applyRule(o, rule) {
  const r = { ...o };
  if (rule.iceExact != null) r.ice = rule.iceExact === 0 ? 'zero' : rule.iceExact <= 3 ? 'light' : rule.iceExact <= 5 ? 'less' : 'normal';
  if (rule.toppingExact) { r.top = Object.keys(rule.toppingExact)[0]; r.tops = [r.top]; r.extra = null; }
  if (rule.sweetExact != null) r.sweet = rule.sweetExact * 4; // 甜度幾分 → 果糖 cc（1 分＝4cc）
  return r;
}

// 判定：回傳錯誤清單（字串），空陣列＝全對
export function judge(cup, o, rule) {
  if (o.drink) return judgeHard(cup, o, rule);
  const errs = [];
  const main = cup.mainTea();
  const fill = cup.fill;
  const teaSum = cup.tea.black + cup.tea.green + cup.tea.milk;
  if (!main || teaSum < 0.05) errs.push('沒有茶');
  else {
    if (main !== o.tea) errs.push(`茶錯了（${teaById(main).name}）`);
    else if (teaSum - cup.tea[main] > teaSum * 0.18) errs.push('茶混到別的');
    teaAmount(cup.cc(o.tea), teaWant(o, rule), errs);
  }
  // 甜度
  if (rule?.sweetExact != null) {
    if (Math.abs(cup.sugar - rule.sweetExact * 4) > M.sweetExactTolerance) errs.push(`甜度 ${(cup.sugar / 4).toFixed(1)} 分，不是 ${rule.sweetExact.toFixed(1)} 分`);
  } else if (Math.abs(cup.sugar - o.sweet) > M.sweetTolerance) errs.push(cup.sugar > o.sweet ? '太甜' : '不夠甜');
  // 冰塊
  if (rule?.iceExact != null) {
    if (cup.ice !== rule.iceExact) errs.push(`冰塊 ${cup.ice} 顆，不是 ${rule.iceExact} 顆`);
  } else {
    const ice = iceById(o.ice);
    if (cup.ice < ice.min) errs.push('冰塊太少');
    else if (cup.ice > ice.max) errs.push(ice.max === 0 ? '冰沒刮乾淨' : '冰塊太多');
    if (ice.chilled === true && !cup.chilled) errs.push('去冰沒冰鎮');
    if (ice.chilled === false && cup.chilled) errs.push('完全去冰碰到冰了');
  }
  // 加料
  const tops = cup.tops;
  if (rule?.toppingExact) {
    const [k, n] = Object.entries(rule.toppingExact)[0];
    if (tops[k] !== n) errs.push(`${topById(k).name} ${tops[k]} 顆，不是 ${n} 顆`);
  } else if (o.top) {
    const info = topById(o.top);
    if (tops[o.top] < info.min) errs.push(tops[o.top] === 0 ? `沒加${info.name}` : `${info.name}太少`);
    else if (tops[o.top] > info.max) errs.push(`${info.name}太多`);
  }
  for (const t of M.toppings) if (t.id !== o.top && tops[t.id] > 2) errs.push(`多加了${t.name}`);
  // 搖
  if (cup.mix < 0.95 && fill > 0.05) errs.push('沒搖勻');
  return errs;
}

// 困難版：每一樣都要照配方
function judgeHard(cup, o, rule) {
  const errs = [];
  const d = drinkById(o.drink), T = HD.tol;
  Object.entries(d.base).forEach(([k, want], i) => {
    const have = cup.cc(k), name = LIQ[k].name;
    if (i === 0) { if (have < 5) errs.push(`沒有${name}`); else teaAmount(have, teaWant(o, rule), errs, name); return; }
    const tol = LIQ[k].kind === 'dairy' ? T.dairy : T.small;
    if (have < want - tol) errs.push(have < 2 ? `沒加${name}` : `${name}太少`);
    else if (have > want + tol) errs.push(`${name}太多`);
  });
  for (const k in cup.tea) if (!(k in d.base) && cup.cc(k) > (LIQ[k].kind === 'tea' ? 20 : 6)) errs.push(`多加了${LIQ[k].name}`);
  if (rule?.sweetExact != null) {
    if (Math.abs(cup.sugar - rule.sweetExact * 4) > M.sweetExactTolerance) errs.push(`甜度 ${(cup.sugar / 4).toFixed(1)} 分，不是 ${rule.sweetExact.toFixed(1)} 分`);
  } else if (d.fixed) { if (cup.sugar > T.sugar) errs.push('甜度固定，不用加果糖'); }
  else if (Math.abs(cup.sugar - o.sweet) > T.sugar) errs.push(cup.sugar > o.sweet ? '太甜' : '不夠甜');
  commonChecks(cup, o, rule, errs);
  return errs;
}

// 茶量：照雪克杯配方的 cc
function teaAmount(have, want, errs, name = '茶') {
  const T = M.teaTol;
  if (have < want - T.low) errs.push(`${name}太少（${Math.round(have)}cc，要 ${want}cc）`);
  else if (have > want + T.high) errs.push(`${name}太多（${Math.round(have)}cc，要 ${want}cc）`);
}

// 冰、料、搖（兩版共用）
function commonChecks(cup, o, rule, errs) {
  if (rule?.iceExact != null) {
    if (cup.ice !== rule.iceExact) errs.push(`冰塊 ${cup.ice} 顆，不是 ${rule.iceExact} 顆`);
  } else {
    const ice = iceById(o.ice);
    if (cup.ice < ice.min) errs.push('冰塊太少');
    else if (cup.ice > ice.max) errs.push(ice.max === 0 ? '冰沒刮乾淨' : '冰塊太多');
    if (ice.chilled === true && !cup.chilled) errs.push('去冰沒冰鎮');
    if (ice.chilled === false && cup.chilled) errs.push('完全去冰碰到冰了');
  }
  const tops = cup.tops, want = o.tops || (o.top ? [o.top] : []);
  if (rule?.toppingExact) {
    const [k, n] = Object.entries(rule.toppingExact)[0];
    if (tops[k] !== n) errs.push(`${topById(k).name} ${tops[k]} 顆，不是 ${n} 顆`);
  } else for (const id of want) {
    const info = topById(id);
    if (tops[id] < info.min) errs.push(tops[id] === 0 ? `沒加${info.name}` : `${info.name}太少`);
    else if (tops[id] > info.max) errs.push(`${info.name}太多`);
  }
  for (const t of M.toppings) if (!want.includes(t.id) && !(rule?.toppingExact && t.id in rule.toppingExact) && tops[t.id] > 2) errs.push(`多加了${t.name}`);
  if (cup.mix < 0.95 && cup.fill > 0.05) errs.push('沒搖勻');
}

// 刁難規則有沒有做到（README 有列出規則種類）
export function ruleDone(cup, rule, prevOrder) {
  if (!rule) return false;
  if (rule.shakeCount) return cup.shakes >= rule.shakeCount;
  if (rule.sameAsLast) return !!prevOrder;
  return true; // 其他規則已經在 judge 裡檢查過
}
