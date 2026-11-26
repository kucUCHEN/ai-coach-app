// 「健康紀錄」：今日評分、教練提醒、達標點數、本週分數、本月回顧。
import { h, toast } from '../ui.js';
import { getProfile, getDay, getRewards, setRewards, getWeights, listDays, todayKey } from '../store.js';
import { scoreDay, PASS_SCORE } from '../health.js';
import { needProfile } from './food.js';

let root = null;
let alive = false;
let aiMod = null;

export async function render(r) {
  root = r; alive = true;
  const p = getProfile();
  if (!p) { root.replaceChildren(needProfile('先建立基本資料，才能計算每日評分。')); return; }
  try { aiMod = await import('../ai/index.js'); } catch (e) { console.warn('AI 模組載入失敗', e); }
  if (!alive) return;
  draw(p);
}
export function leave() { alive = false; }

function draw(p) {
  const day = getDay();
  const s = scoreDay(day, p);
  root.replaceChildren(scoreCard(s, day, p), weekCard(p), monthCard(p), rewardCard(s));
}

// ---------- 今日評分 ----------
function scoreCard(s, day, profile) {
  let tip = '';
  try { tip = aiMod?.coachNudge?.({ profile, day, scores: s }) || ''; } catch (e) { console.warn(e); }
  const part = (label, val, note) => h('div', { class: 'sub-score' },
    h('div', { class: 'muted small' }, label),
    h('div', { class: 'sub-num' }, val == null ? '—' : val),
    h('div', { class: 'fine' }, note));
  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('span', { class: 'muted small' }, '今日評分'),
      h('span', { class: 'status ' + (s.passed ? 'normal' : 'pending') }, s.passed ? '已達標' : `${PASS_SCORE} 分達標`)),
    h('div', { class: 'hero-num' }, h('b', {}, s.total), h('span', {}, ' / 100')),
    h('div', { class: 'grid2' },
      part('飲食', s.diet, s.diet == null ? '尚未記錄' : `${s.eaten} / ${s.target} 大卡`),
      part('運動', s.exercise, `${day.workouts.length} 次・${Math.round(s.burned)} 大卡`),
    ),
    tip ? h('div', { class: 'coach-line' }, h('span', { class: 'coach-dot' }, 'AI'), h('p', {}, String(tip))) : '',
  );
}

// ---------- 本週 ----------
function weekCard(p) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const day = getDay(todayKey(d));
    const has = day.meals.length || day.workouts.length;
    days.push({ label: i === 0 ? '今天' : '日一二三四五六'[d.getDay()], score: has ? scoreDay(day, p).total : null, today: i === 0 });
  }
  const passed = days.filter((d) => d.score != null && d.score >= PASS_SCORE).length;
  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, '本週'), h('span', { class: 'muted small' }, `達標 ${passed} 天`)),
    h('div', { class: 'week' }, days.map((d) =>
      h('div', { class: 'week-col' },
        h('div', { class: 'week-val' }, d.score ?? ''),
        h('div', { class: 'week-track' },
          h('div', { class: 'week-bar' + (d.score >= PASS_SCORE ? ' pass' : ''), style: { height: (d.score ?? 0) + '%' } })),
        h('div', { class: 'week-label' + (d.today ? ' bold' : '') }, d.label)))),
    h('p', { class: 'fine' }, `虛線為 ${PASS_SCORE} 分達標線`),
  );
}

// ---------- 本月回顧 ----------
function monthCard(p) {
  const month = todayKey().slice(0, 7);
  const weights = getWeights().filter((w) => w.date.startsWith(month));
  const days = listDays().filter((d) => d.startsWith(month)).map((k) => getDay(k));
  const recorded = days.filter((d) => d.meals.length || d.workouts.length || d.weightKg);
  const reps = days.reduce((s, d) => s + d.workouts.reduce((a, w) => a + (Number(w.reps) || 0), 0), 0);
  const best = recorded.reduce((m, d) => Math.max(m, scoreDay(d, p).total), 0);
  const change = weights.length >= 2 ? Math.round((weights[weights.length - 1].kg - weights[0].kg) * 10) / 10 : null;

  return h('div', { class: 'card' },
    h('h2', {}, `${Number(month.slice(5))} 月回顧`),
    h('div', { class: 'row between' }, h('span', { class: 'small bold' }, '體重變化'),
      change == null ? '' : h('span', { class: 'small' }, change === 0 ? '持平' : `${change > 0 ? '+' : ''}${change} 公斤`)),
    weights.length >= 2 ? weightChart(weights) : h('p', { class: 'muted small' }, '本月記錄兩次以上體重後，會顯示變化圖。'),
    h('div', { class: 'stat-row' },
      mini(reps.toLocaleString(), '運動次數'),
      mini(recorded.length, '記錄天數'),
      mini(best || '—', '最高分'),
    ),
  );
}
function mini(num, label) {
  return h('div', { class: 'mini' }, h('div', { class: 'mini-num' }, String(num)), h('div', { class: 'fine' }, label));
}

// ---------- 達標點數 ----------
function rewardCard(s) {
  const rw = getRewards();
  rw.awarded ||= {};
  const today = todayKey();
  const got = !!rw.awarded[today];
  const left = Math.max(0, rw.reward.cost - rw.points);

  const claim = got ? h('p', { class: 'muted small' }, '今天的點數已領取。')
    : s.passed ? h('button', { class: 'btn block', onclick: () => {
        const r = getRewards(); r.awarded ||= {};
        if (r.awarded[today]) return;
        r.awarded[today] = true; r.points += 1; setRewards(r);
        toast('已領取 1 點'); draw(getProfile());
      } }, '領取今日點數')
    : h('p', { class: 'muted small' }, `每日評分達 ${PASS_SCORE} 分可領 1 點。`);

  const pct = Math.min(100, Math.round((rw.points / rw.reward.cost) * 100));
  const nameIn = h('input', { type: 'text', maxlength: '16', value: rw.reward.name, 'aria-label': '獎勵名稱' });
  const costIn = h('input', { type: 'number', min: '1', max: '100', value: rw.reward.cost, 'aria-label': '所需點數' });
  const editor = h('div', { class: 'reward-edit', hidden: true },
    h('div', { class: 'grid2' }, h('div', {}, h('label', {}, '獎勵'), nameIn), h('div', {}, h('label', {}, '所需點數'), costIn)),
    h('button', { class: 'btn secondary block mt', onclick: () => {
      const r = getRewards(); const cost = Math.round(Number(costIn.value));
      if (!nameIn.value.trim() || !(cost >= 1 && cost <= 100)) return toast('請輸入獎勵與點數');
      r.reward = { name: nameIn.value.trim(), cost }; setRewards(r); toast('已更新'); draw(getProfile());
    } }, '儲存'));

  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, '達標點數'), h('span', { class: 'bold' }, `${rw.points} 點`)),
    h('div', { class: 'row between small' }, h('span', {}, `目標：${rw.reward.name}`), h('span', { class: 'muted' }, left ? `還差 ${left} 點` : '已達成')),
    h('div', { class: 'progress thin' }, h('div', { class: 'progress-bar', style: { width: pct + '%' } })),
    claim,
    left === 0 ? h('button', { class: 'btn secondary block mt', onclick: () => {
      const r = getRewards();
      if (r.points < r.reward.cost) return;
      if (!confirm(`使用 ${r.reward.cost} 點兌換「${r.reward.name}」？`)) return;
      r.points -= r.reward.cost; setRewards(r);
      toast(`已兌換：${r.reward.name}`); draw(getProfile());
    } }, `兌換 ${rw.reward.name}`) : '',
    h('button', { class: 'link-btn', onclick: () => { editor.hidden = !editor.hidden; } }, '自訂獎勵'),
    editor,
  );
}

// 用 SVG 畫體重折線圖（不需要外部函式庫）
function weightChart(ws) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 320, H = 140, L = 36, R = 10, T = 12, B = 24;
  const kgs = ws.map((w) => w.kg);
  let min = Math.min(...kgs), max = Math.max(...kgs);
  if (max - min < 1) { const m = (max + min) / 2; min = m - 0.5; max = m + 0.5; }
  const x = (i) => L + (ws.length === 1 ? 0 : (i * (W - L - R)) / (ws.length - 1));
  const y = (kg) => T + ((max - kg) * (H - T - B)) / (max - min);
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (text != null) e.textContent = text;
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `體重從 ${kgs[0]} 公斤到 ${kgs[kgs.length - 1]} 公斤` });
  [max, min].forEach((v) => {
    svg.append(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'chart-grid' }));
    svg.append(el('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'chart-text' }, v.toFixed(1)));
  });
  svg.append(el('polyline', { points: ws.map((w, i) => `${x(i)},${y(w.kg)}`).join(' '), class: 'chart-line' }));
  const li = ws.length - 1;
  svg.append(el('circle', { cx: x(li), cy: y(ws[li].kg), r: 4, class: 'chart-dot' }));
  [0, li].forEach((i) => svg.append(el('text', { x: x(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : 'end', class: 'chart-text' },
    ws[i].date.slice(5).replace('-', '/'))));
  return svg;
}
