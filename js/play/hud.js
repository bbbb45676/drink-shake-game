import * as THREE from 'three';
import { ticketRows } from './orders.js';
import { CONFIG } from '../config.js';
import { starText } from './reviews.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// 只顯示資訊（分數、時間、點單、對話、杯子內容）。操作全部靠兩隻手。
export class Hud {
  constructor(camera) {
    this.camera = camera;
    this.score = $('hud-score'); this.time = $('hud-time');
    this.ticket = $('ticket'); this.bubble = $('bubble'); this.tag = $('cup-tag'); this.hint = $('hint');
    this.popLayer = $('popups');
    this.bubbleFor = null; this.tagCup = null;
  }

  setScore(n, delta) {
    this.score.textContent = n;
    if (delta) { const el = this.score.parentElement; el.classList.remove('bump', 'dip'); void el.offsetWidth; el.classList.add(delta > 0 ? 'bump' : 'dip'); }
  }
  setTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    this.time.textContent = `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
    this.time.parentElement.classList.toggle('warn', s <= 20);
  }

  showTicket(c, no) {
    if (!c) { this.ticket.hidden = true; return; }
    const t = this.ticket;
    let html = `<div class="t-head"><span>${CONFIG.shop.name}</span><span>#${String(no).padStart(3, '0')}</span></div>`;
    if (c.kind === 'rude') {
      html += `<div class="t-rude">${c.quote.ticket}</div><div class="t-note">？？？</div>`;
    } else {
      const rows = ticketRows(c.order, c.rule);
      html += rows.map(([k, v, hot, rec]) => `<div class="t-row${hot ? ' hot' : ''}"><span>${k}</span><b>${v}</b></div>${rec ? `<div class="t-rec">${rec}</div>` : ''}`).join('');
      if (c.rule?.shakeCount) html += `<div class="t-special">要搖 ${c.rule.shakeCount} 下</div>`;
      if (c.rule?.sameAsLast) html += `<div class="t-special">跟上次一樣（？）</div>`;
      if (c.remakes) html += `<div class="t-special">退回重做（第 ${c.remakes + 1} 杯）</div>`;
      if (c.pay) html += `<div class="t-pay">應收 NT$${c.pay.price}・客人付 NT$${c.pay.paid}</div>`;
    }
    html += `<div class="t-patience"><i style="width:100%"></i></div>`;
    t.innerHTML = html;
    t.hidden = false;
    t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    this.patienceBar = t.querySelector('.t-patience i');
  }
  setPatience(k) { if (this.patienceBar) { this.patienceBar.style.width = `${Math.max(0, k * 100)}%`; this.patienceBar.classList.toggle('low', k < 0.3); } }

  say(customer, text, { hot = false, time = 2.4 } = {}) {
    this.bubbleFor = customer; this.bubbleT = time;
    this.bubble.textContent = text;
    this.bubble.classList.toggle('hot', hot);
    this.bubble.hidden = false;
    this.bubble.classList.remove('in'); void this.bubble.offsetWidth; this.bubble.classList.add('in');
  }

  project(p) {
    _v.copy(p).project(this.camera);
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, behind: _v.z > 1 };
  }

  popup(p, text, cls = '') {
    const s = p.isVector3 ? this.project(p) : p;
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    el.style.left = `${Math.max(40, Math.min(innerWidth - 40, s.x))}px`;
    el.style.top = `${Math.max(60, Math.min(innerHeight - 40, s.y))}px`;
    this.popLayer.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  stamp(text, cls = '') {
    const el = $('stamp');
    el.textContent = text; el.className = cls; el.hidden = false;
    el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
    clearTimeout(this.stampT); this.stampT = setTimeout(() => { el.hidden = true; }, 1500);
  }

  setHint(text) {
    if (text === this.hintText) return;
    this.hintText = text;
    this.hint.hidden = !text;
    if (text) { this.hint.innerHTML = text; this.hint.classList.remove('in'); void this.hint.offsetWidth; this.hint.classList.add('in'); }
  }

  // 杯子小標籤：茶、甜度、冰、料、封膜、搖
  showCup(cup) {
    this.tagCup = cup;
    if (!cup) { this.tag.hidden = true; return; }
    const main = cup.mainTea();
    const tea = main ? (CONFIG.menu.teas.find((t) => t.id === main) || CONFIG.liquids[main]) : null;
    const liqs = Object.entries(cup.tea).filter(([, v]) => v * 700 >= 1).map(([k, v]) => `<span>${CONFIG.liquids[k].name} ${Math.round(v * 700)}cc</span>`);
    const pct = Math.round(Math.min(1, cup.level) * 100);
    const parts = [];
    const total = Math.round(cup.fill * 700);
    if (cup.isShaker) {
      // 不鏽鋼雪克杯：看不到裡面，直接寫幾 cc
      parts.push(`<span class="c-tea"><i style="background:${tea ? tea.color : '#ddd'}"></i>雪克杯 ${liqs.length ? `<b>${total}cc</b>` : '空的'}</span>`);
      if (liqs.length > 1) parts.push(...liqs);
      parts.push(cup.lid ? '<span class="c-ok">蓋著</span>' : '<span>沒蓋</span>');
    } else {
      parts.push(`<span class="c-tea"><i style="background:${tea ? tea.color : '#ddd'}"></i>${tea ? `<b>${total}cc</b>` : '空杯'}</span>`, ...liqs);
    }
    parts.push(`<span>果糖 ${cup.sugar.toFixed(1)}cc</span>`);
    parts.push(`<span>冰 ${cup.ice}${cup.ice === 0 && cup.chilled ? '（冰鎮過）' : ''}</span>`);
    for (const t of CONFIG.menu.toppings) if (cup.tops[t.id]) parts.push(`<span>${t.name} ${cup.tops[t.id]}</span>`);
    if (cup.fill > 0.05) parts.push(cup.mix >= 0.95 ? '<span class="c-ok">搖勻了</span>' : `<span>${cup.isShaker ? '還沒搖' : '沒搖勻'}</span>`);
    if (cup.sealed) parts.push('<span class="c-ok">封好了</span>');
    if (cup.shakes >= CONFIG.pour.shakesToMix) parts.push(`<span>手搖 ${cup.shakes} 下</span>`);
    const html = parts.join('');
    if (html !== this.tagHtml) { this.tag.innerHTML = html; this.tagHtml = html; }
    this.tag.hidden = false;
  }

  showTool(pos, text) {
    const el = document.getElementById('tool-tag');
    if (!pos) { el.hidden = true; this.toolPos = null; return; }
    this.toolPos = pos;
    if (text !== this.toolText) { el.textContent = text; this.toolText = text; }
    el.hidden = false;
    _v.copy(pos); _v.y += 0.06;
    const s = this.project(_v);
    el.style.left = `${s.x}px`; el.style.top = `${s.y}px`;
  }

  // ---- 顧客評論（客人離開後跳出來）----
  reviewHtml(r) {
    return `<div class="rv"><div class="rv-head"><i style="background:${r.color}">${r.initial}</i><div><b>${esc(r.name)}</b><small>${esc(r.badge)}</small></div></div>`
      + `<div class="rv-line"><span class="rv-stars s${r.stars}">${starText(r.stars)}</span><small>剛剛</small></div><p>${esc(r.text)}</p></div>`;
  }
  showReview(r) {
    const box = $('reviews');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'rv-toast';
    el.innerHTML = this.reviewHtml(r);
    box.prepend(el);
    while (box.children.length > 2) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 6500);
  }
  clearReviews() { const box = $('reviews'); if (box) box.innerHTML = ''; }

  update(dt) {
    if (this.bubbleFor) {
      const c = this.bubbleFor;
      _v.copy(c.pos); _v.y += 1.72 * c.look.height;
      const s = this.project(_v);
      this.bubble.style.left = `${Math.max(90, Math.min(innerWidth - 90, s.x))}px`;
      this.bubble.style.top = `${Math.max(70, s.y)}px`;
      this.bubbleT -= dt;
      if (this.bubbleT <= 0 || c.state === 'gone') { this.bubble.hidden = true; this.bubbleFor = null; }
    }
    if (this.tagCup && this.tagCup.alive) {
      _v.copy(this.tagCup.pos); _v.y += 0.14;
      const s = this.project(_v);
      this.tag.style.left = `${Math.max(80, Math.min(innerWidth - 80, s.x))}px`;
      this.tag.style.top = `${Math.max(60, Math.min(innerHeight - 30, s.y))}px`;
    } else if (this.tagCup) this.showCup(null);
  }
}
