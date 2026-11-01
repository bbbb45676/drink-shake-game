import { CONFIG } from '../config.js';

const M = CONFIG.menu;
export const teaById = (id) => M.teas.find((t) => t.id === id);
export const topById = (id) => M.toppings.find((t) => t.id === id);
export const iceById = (id) => M.ice.find((t) => t.id === id);
export const sweetName = (v) => {
  const s = M.sweet.reduce((a, b) => (Math.abs(b.v - v) < Math.abs(a.v - v) ? b : a));
  return s.name;
};
const pick = (a) => a[(Math.random() * a.length) | 0];

export function randomOrder() {
  const tea = pick(M.teas).id;
  const sweet = pick(M.sweet).v;
  const ice = pick(M.ice).id;
  const top = Math.random() < 0.65 ? pick(M.toppings).id : null;
  return { tea, sweet, ice, top };
}

export function orderName(o) {
  const t = teaById(o.tea).name;
  if (!o.top) return t;
  return topById(o.top).name + t;
}

// 點單小白單上的四行（刁難客的那一行改成紅字）
export function ticketRows(o, rule) {
  const rows = [
    ['茶', teaById(o.tea).name],
    ['甜度', sweetName(o.sweet)],
    ['冰塊', iceById(o.ice).name],
    ['加料', o.top ? topById(o.top).name : '不加'],
  ];
  if (rule?.iceExact != null) rows[2] = ['冰塊', `剛好 ${rule.iceExact} 顆`, true];
  if (rule?.toppingExact) { const [k, n] = Object.entries(rule.toppingExact)[0]; rows[3] = ['加料', `${topById(k).name}剛好 ${n} 顆`, true]; }
  if (rule?.sweetExact != null) rows[1] = ['甜度', `剛好 ${rule.sweetExact.toFixed(1)}`, true];
  return rows;
}

// 刁難客：把規則套進訂單，讓一般欄位不衝突
export function applyRule(o, rule) {
  const r = { ...o };
  if (rule.iceExact != null) r.ice = rule.iceExact === 0 ? 'none' : rule.iceExact <= 2 ? 'less' : 'normal';
  if (rule.toppingExact) r.top = Object.keys(rule.toppingExact)[0];
  if (rule.sweetExact != null) r.sweet = rule.sweetExact;
  return r;
}

// 判定：回傳錯誤清單（字串），空陣列＝全對
export function judge(cup, o, rule) {
  const errs = [];
  const main = cup.mainTea();
  const fill = cup.fill;
  const teaSum = cup.tea.black + cup.tea.green + cup.tea.milk;
  if (!main || teaSum < 0.05) errs.push('沒有茶');
  else {
    if (main !== o.tea) errs.push(`茶錯了（${teaById(main).name}）`);
    else if (teaSum - cup.tea[main] > teaSum * 0.18) errs.push('茶混到別的');
    if (cup.level < M.fillMin) errs.push('太少了');
  }
  // 甜度
  if (rule?.sweetExact != null) {
    if (Math.abs(cup.sugar - rule.sweetExact) > M.sweetExactTolerance) errs.push(`甜度 ${cup.sugar.toFixed(1)}，不是 ${rule.sweetExact.toFixed(1)}`);
  } else if (Math.abs(cup.sugar - o.sweet) > M.sweetTolerance) errs.push(cup.sugar > o.sweet ? '太甜' : '不夠甜');
  // 冰塊
  if (rule?.iceExact != null) {
    if (cup.ice !== rule.iceExact) errs.push(`冰塊 ${cup.ice} 顆，不是 ${rule.iceExact} 顆`);
  } else {
    const ice = iceById(o.ice);
    if (cup.ice < ice.min) errs.push('冰塊太少');
    else if (cup.ice > ice.max) errs.push('冰塊太多');
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
  if (cup.sealed && cup.mix < 0.999 && fill > 0.05) errs.push('沒搖勻');
  return errs;
}

// 刁難規則有沒有做到（README 有列出規則種類）
export function ruleDone(cup, rule, prevOrder) {
  if (!rule) return false;
  if (rule.shakeCount) return cup.shakes >= rule.shakeCount;
  if (rule.sameAsLast) return !!prevOrder;
  return true; // 其他規則已經在 judge 裡檢查過
}
