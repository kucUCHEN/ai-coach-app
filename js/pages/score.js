// 「健康紀錄」：今日評分、教練提醒、達標點數、本週分數、本月回顧。
import { h, toast, askAdmin } from '../ui.js';
import { getProfile, getDay, getRewards, setRewards, getWeights, listDays, todayKey } from '../store.js';
import { scoreDay, PASS_SCORE, isMinor, workoutMinutes } from '../health.js';
import { needProfile } from './food.js';
import { mascot, moodOf } from '../mascot.js';
import { guessGroups } from '../foods.js';

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
  root.replaceChildren(scoreCard(s, day, p), weekCard(p), badgeCard(p), rewardCard(s, p), monthCard(p));
}

// ---------- 今日評分（教練表情＋分數） ----------
function scoreCard(s, day, profile) {
  let tip = '';
  try { tip = aiMod?.coachNudge?.({ profile, day, scores: s }) || ''; } catch (e) { console.warn(e); }
  const has = day.meals.length || day.workouts.length;
  const m = moodOf(s.total, has);
  const part = (emoji, label, val, note) => h('div', { class: 'sub-score' },
    h('div', { class: 'muted small' }, emoji, ' ', label),
    h('div', { class: 'sub-num' }, val == null ? '—' : val),
    h('div', { class: 'fine' }, note));
  return h('div', { class: 'card' },
    h('div', { class: 'mood-head' },
      mascot(m.mood, 'mood-face'),
      h('div', { class: 'grow' },
        h('div', { class: 'muted small' }, '今日評分'),
        h('div', { class: 'hero-num' }, h('b', {}, s.total), h('span', {}, ' / 100')),
        h('span', { class: 'mood-tag ' + m.mood }, `${m.emoji} ${m.label}`),
      ),
    ),
    h('div', { class: 'grid2 mt' },
      part('🍱', '飲食', s.diet, s.diet == null ? '尚未記錄' : `${s.eaten} / ${s.target} 大卡`),
      part('🏃', '運動', s.exercise, day.workouts.length ? `約 ${s.minutes} 分鐘・${Math.round(s.burned)} 大卡` : '尚未記錄'),
    ),
    statusLine(s, day),
    tip ? h('div', { class: 'coach-line' }, h('span', { class: 'coach-say' }, '小健：'), h('p', {}, String(tip))) : '',
    h('p', { class: 'fine' }, s.passed ? '🎉 今天已達標，可以領取點數。' : `💡 今日評分達 ${PASS_SCORE} 分就算達標。`),
  );
}

// 客觀狀態（和分數同一套計算，不會跟評語矛盾）
function statusLine(s, day) {
  const lines = [];
  if (s.over) lines.push('🍽️ 今天吃得比建議多了一點');
  else if (s.under && day.date === todayKey()) lines.push('⏰ 還有餐點沒記錄，分數會再更新');
  if (!day.workouts.length) lines.push('🏃 今天還沒有運動紀錄');
  return lines.length ? h('div', { class: 'status-lines' }, lines.map((t) => h('p', { class: 'small' }, t))) : '';
}

// ---------- 本週徽章 ----------
function badgeCard(p) {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(getDay(todayKey(d))); }
  const logged = days.filter((d) => d.meals.length || d.workouts.length).length;
  const passed = days.filter((d) => (d.meals.length || d.workouts.length) && scoreDay(d, p).passed).length;
  const vegDays = days.filter((d) => d.meals.some((m) => (m.groups || guessGroups(m.name)).includes('蔬菜'))).length;
  const moveDays = days.filter((d) => d.workouts.length).length;
  const noSugar = days.filter((d) => d.meals.length && !d.meals.some((m) => /珍奶|奶茶|可樂|汽水|含糖|飲料/.test(m.name))).length;
  const badges = [
    { e: '🥇', name: '達標王', got: passed >= 4, hint: `達標 ${passed}/4 天` },
    { e: '🥦', name: '蔬菜達人', got: vegDays >= 5, hint: `吃蔬菜 ${vegDays}/5 天` },
    { e: '🔥', name: '運動不間斷', got: moveDays >= 4, hint: `運動 ${moveDays}/4 天` },
    { e: '🧋', name: '少糖挑戰', got: noSugar >= 5, hint: `無含糖飲料 ${noSugar}/5 天` },
    { e: '📝', name: '記錄好習慣', got: logged >= 5, hint: `記錄 ${logged}/5 天` },
  ];
  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, '本週徽章'), h('span', { class: 'muted small' }, `${badges.filter((b) => b.got).length} / ${badges.length}`)),
    h('div', { class: 'badges' }, badges.map((b) =>
      h('div', { class: 'badge' + (b.got ? ' on' : '') },
        h('div', { class: 'badge-e' }, b.e), h('div', { class: 'badge-n' }, b.name), h('div', { class: 'fine' }, b.hint)))),
  );
}

// ---------- 本週 ----------
function weekCard(p) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const day = getDay(todayKey(d));
    const has = day.meals.length || day.workouts.length;
    const sc = has ? scoreDay(day, p).total : null;
    days.push({ label: i === 0 ? '今天' : '日一二三四五六'[d.getDay()], score: sc, today: i === 0, emoji: sc == null ? '·' : moodOf(sc).emoji });
  }
  const passed = days.filter((d) => d.score != null && d.score >= PASS_SCORE).length;
  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, '📅 本週'), h('span', { class: 'muted small' }, `達標 ${passed} 天`)),
    h('div', { class: 'week' }, days.map((d) =>
      h('div', { class: 'week-col' },
        h('div', { class: 'week-emoji' }, d.emoji),
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
  const mins = days.reduce((s, d) => s + d.workouts.reduce((a, w) => a + workoutMinutes(w), 0), 0);
  const best = recorded.reduce((m, d) => Math.max(m, scoreDay(d, p).total), 0);
  const change = weights.length >= 2 ? Math.round((weights[weights.length - 1].kg - weights[0].kg) * 10) / 10 : null;

  return h('div', { class: 'card' },
    h('h2', {}, `📈 ${Number(month.slice(5))} 月成長回顧`),
    h('div', { class: 'row between' }, h('span', { class: 'small bold' }, '體重變化'),
      change == null ? '' : h('span', { class: 'small' }, change === 0 ? '持平' : `${change > 0 ? '+' : ''}${change} 公斤`)),
    weights.length >= 2 ? weightChart(weights) : h('p', { class: 'muted small' }, '本月記錄兩次以上體重後，會顯示變化圖。'),
    h('div', { class: 'stat-row' },
      mini(mins.toLocaleString(), '運動分鐘'),
      mini(recorded.length, '記錄天數'),
      mini(best || '—', '最高分'),
    ),
  );
}
function mini(num, label) {
  return h('div', { class: 'mini' }, h('div', { class: 'mini-num' }, String(num)), h('div', { class: 'fine' }, label));
}

// ---------- 達標點數 ----------
function rewardCard(s, p) {
  const minor = isMinor(p);
  const guard = async (why) => !minor || askAdmin(why);
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
        toast('已領取 1 點 ⭐'); draw(getProfile());
      } }, '領取今日點數')
    : h('p', { class: 'muted small' }, `每日評分達 ${PASS_SCORE} 分可領 1 點。`);

  const pct = Math.min(100, Math.round((rw.points / rw.reward.cost) * 100));
  const nameIn = h('input', { type: 'text', maxlength: '16', value: rw.reward.name, 'aria-label': '獎勵名稱' });
  const costIn = h('input', { type: 'number', min: '1', max: '100', value: rw.reward.cost, 'aria-label': '所需點數' });
  const editor = h('div', { class: 'reward-edit', hidden: true },
    h('div', { class: 'grid2' }, h('div', {}, h('label', {}, '獎勵'), nameIn), h('div', {}, h('label', {}, '所需點數'), costIn)),
    minor ? h('p', { class: 'fine' }, '🔒 未成年改獎勵需要家長輸入管理密碼。') : '',
    h('button', { class: 'btn secondary block mt', onclick: async () => {
      const cost = Math.round(Number(costIn.value));
      if (!nameIn.value.trim() || !(cost >= 1 && cost <= 100)) return toast('請輸入獎勵與點數');
      if (!(await guard('改獎勵前，請家長輸入管理密碼確認。'))) return;
      const r = getRewards();
      r.reward = { name: nameIn.value.trim(), cost, custom: true }; setRewards(r); toast('已更新'); draw(getProfile());
    } }, '儲存'));

  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, '🎁 集點換獎勵'), h('span', { class: 'bold' }, `${rw.points} 點`)),
    h('div', { class: 'row between small' }, h('span', {}, `目標：${rw.reward.name}`), h('span', { class: 'muted' }, left ? `還差 ${left} 點` : '已達成')),
    h('div', { class: 'progress thin' }, h('div', { class: 'progress-bar', style: { width: pct + '%' } })),
    claim,
    left === 0 ? h('button', { class: 'btn secondary block mt', onclick: async () => {
      const r0 = getRewards();
      if (r0.points < r0.reward.cost) return;
      if (minor) { if (!(await askAdmin(`兌換「${r0.reward.name}」（${r0.reward.cost} 點），請家長輸入管理密碼確認。`))) return; }
      else if (!confirm(`使用 ${r0.reward.cost} 點兌換「${r0.reward.name}」？`)) return;
      const r = getRewards();
      r.points -= r.reward.cost; setRewards(r);
      toast(`🎉 已兌換：${r.reward.name}`); draw(getProfile());
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
