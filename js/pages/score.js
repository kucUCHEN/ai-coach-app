// 「今日評分」：飲食分、運動分、總分、教練叮嚀、集點換獎勵、本週分數、每月成長回顧。
import { h, toast } from '../ui.js';
import { getProfile, getDay, getRewards, setRewards, getWeights, listDays, todayKey } from '../store.js';
import { scoreDay, scoreColor, PASS_SCORE } from '../health.js';

let root = null;
let alive = false;
let aiMod = null;

export async function render(r) {
  root = r; alive = true;
  const p = getProfile();
  if (!p) {
    root.replaceChildren(h('div', { class: 'card center' },
      h('div', { class: 'big-emoji' }, '⭐'),
      h('p', {}, '先到「身體」頁填好你的資料，教練才能幫你打分數喔！'),
      h('a', { class: 'btn block', href: '#body' }, '去填資料')));
    return;
  }
  try { aiMod = await import('../ai/index.js'); } catch (e) { console.warn('AI 模組還沒準備好', e); }
  if (!alive) return;
  draw(p);
}
export function leave() { alive = false; }

function draw(p) {
  const day = getDay();
  const s = scoreDay(day, p);
  root.replaceChildren(
    scoreCard(s, day),
    nudgeCard(p, day, s),
    rewardCard(s),
    weekCard(p),
    monthCard(p),
  );
}

// ---------- 今日分數 ----------
function scoreCard(s, day) {
  const box = (label, val, note) => h('div', { class: `score-box ${scoreColor(val)}` },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'score-num' }, val == null ? '—' : val),
    h('div', { class: 'tiny muted' }, note));
  return h('div', { class: 'card' },
    h('div', { class: 'total' },
      h('div', { class: 'muted' }, '今天的總分'),
      h('div', { class: `total-num ${scoreColor(s.total)}` }, s.total, h('span', { class: 'total-unit' }, '分')),
      h('div', { class: 'pass ' + (s.passed ? 'yes' : 'no') }, s.passed ? '🎉 合格！' : `還差一點（${PASS_SCORE} 分合格）`),
    ),
    h('div', { class: 'grid2' },
      box('🍱 飲食分', s.diet, s.diet == null ? '還沒記錄吃什麼' : `吃了 ${s.eaten} / ${s.target} 大卡`),
      box('🏃 運動分', s.exercise, `運動 ${day.workouts.length} 次・${Math.round(s.burned)} 大卡`),
    ),
  );
}

// ---------- 教練叮嚀 ----------
function nudgeCard(profile, day, scores) {
  let text = '';
  try { text = aiMod?.coachNudge?.({ profile, day, scores }) || ''; } catch (e) { console.warn(e); }
  if (!text) text = scores.passed ? '今天表現很棒，早點睡覺，明天繼續加油！' : '還有時間喔，去動一動，或記下你吃了什麼吧！';
  return h('div', { class: 'card nudge' },
    h('div', { class: 'nudge-avatar' }, '🤖'),
    h('div', {}, h('div', { class: 'bold small' }, '教練說：'), h('p', { class: 'nudge-text' }, String(text))));
}

// ---------- 集點與獎勵 ----------
function rewardCard(s) {
  const rw = getRewards();
  rw.awarded ||= {};
  const today = todayKey();
  const got = !!rw.awarded[today];
  const left = Math.max(0, rw.reward.cost - rw.points);

  const claim = got ? h('p', { class: 'small' }, '✅ 今天的點數領過了')
    : s.passed ? h('button', { class: 'btn block', onclick: () => {
        const r = getRewards(); r.awarded ||= {};
        if (r.awarded[today]) return;
        r.awarded[today] = true; r.points += 1; setRewards(r);
        toast('拿到 1 點！⭐'); draw(getProfile());
      } }, '⭐ 領 1 點')
    : h('p', { class: 'muted small' }, `總分到 ${PASS_SCORE} 分，就可以領 1 點喔！`);

  const dots = h('div', { class: 'dots' }, Array.from({ length: rw.reward.cost }, (_, i) =>
    h('span', { class: 'dot-star' + (i < rw.points ? ' on' : '') }, '★')));

  const nameIn = h('input', { type: 'text', maxlength: '12', value: rw.reward.name, 'aria-label': '獎勵名稱' });
  const costIn = h('input', { type: 'number', min: '1', max: '100', value: rw.reward.cost, 'aria-label': '需要幾點' });
  const editor = h('div', { class: 'reward-edit', hidden: true },
    h('p', { class: 'small muted' }, '請爸爸媽媽一起決定獎勵：'),
    h('div', { class: 'grid2' }, nameIn, costIn),
    h('button', { class: 'btn secondary block mt', onclick: () => {
      const r = getRewards(); const cost = Math.round(Number(costIn.value));
      if (!nameIn.value.trim() || !(cost >= 1 && cost <= 100)) return toast('請填獎勵和點數');
      r.reward = { name: nameIn.value.trim(), cost }; setRewards(r); toast('獎勵改好了'); draw(getProfile());
    } }, '儲存獎勵'));

  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, '🎁 集點換獎勵'), h('span', { class: 'points' }, `${rw.points} 點`)),
    claim,
    h('p', { class: 'reward-line' }, '目標：', h('b', {}, rw.reward.name), left ? `，還差 ${left} 點` : '，點數夠了！'),
    dots,
    left === 0 ? h('button', { class: 'btn block mt', onclick: () => {
      const r = getRewards();
      if (r.points < r.reward.cost) return;
      if (!confirm(`要用 ${r.reward.cost} 點換「${r.reward.name}」嗎？`)) return;
      r.points -= r.reward.cost; setRewards(r);
      toast(`恭喜換到 ${r.reward.name}！🎉 記得跟爸爸媽媽說`); draw(getProfile());
    } }, `🎁 換 ${rw.reward.name}`) : null,
    h('button', { class: 'link-btn', onclick: () => { editor.hidden = !editor.hidden; } }, '換一個獎勵'),
    editor,
  );
}

// ---------- 本週 7 天 ----------
function weekCard(p) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = todayKey(d);
    const day = getDay(key);
    const has = day.meals.length || day.workouts.length;
    days.push({ key, label: i === 0 ? '今天' : '日一二三四五六'[d.getDay()], score: has ? scoreDay(day, p).total : null });
  }
  return h('div', { class: 'card' },
    h('h2', {}, '📅 這一週'),
    h('div', { class: 'week' }, days.map((d) =>
      h('div', { class: 'week-col' },
        h('div', { class: 'week-val' }, d.score ?? ''),
        h('div', { class: 'week-track' },
          h('div', { class: `week-bar ${scoreColor(d.score)}`, style: { height: (d.score ?? 0) + '%' } })),
        h('div', { class: 'week-label' + (d.label === '今天' ? ' bold' : '') }, d.label)))),
    h('p', { class: 'tiny muted' }, `虛線是 ${PASS_SCORE} 分合格線`),
  );
}

// ---------- 每月成長回顧 ----------
function monthCard(p) {
  const month = todayKey().slice(0, 7);
  const weights = getWeights().filter((w) => w.date.startsWith(month));
  const days = listDays().filter((d) => d.startsWith(month)).map((k) => getDay(k));
  const recorded = days.filter((d) => d.meals.length || d.workouts.length || d.weightKg);
  const reps = days.reduce((s, d) => s + d.workouts.reduce((a, w) => a + (Number(w.reps) || 0), 0), 0);
  const best = recorded.reduce((m, d) => Math.max(m, scoreDay(d, p).total), 0);
  const change = weights.length >= 2 ? Math.round((weights[weights.length - 1].kg - weights[0].kg) * 10) / 10 : null;

  return h('div', { class: 'card' },
    h('h2', {}, `📈 ${Number(month.slice(5))} 月成長回顧`),
    h('div', { class: 'row between' }, h('span', { class: 'bold' }, '體重變化'),
      change == null ? null : h('span', { class: 'small' }, change === 0 ? '沒有變' : `${change > 0 ? '+' : ''}${change} 公斤`)),
    weights.length >= 2 ? weightChart(weights) : h('p', { class: 'muted small' }, '這個月量兩次以上體重，就會畫出折線圖喔！'),
    h('div', { class: 'month-grid' },
      mini('🏃', reps.toLocaleString(), '運動總次數'),
      mini('📝', recorded.length, '記錄天數'),
      mini('🏆', best || '—', '最高分'),
    ),
  );
}
function mini(emoji, num, label) {
  return h('div', { class: 'mini' }, h('div', {}, emoji), h('div', { class: 'mini-num' }, String(num)), h('div', { class: 'tiny muted' }, label));
}

// 用 SVG 自己畫折線圖（不需要外部函式庫）
function weightChart(ws) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 320, H = 150, L = 40, R = 12, T = 14, B = 26;
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
  [max, (max + min) / 2, min].forEach((v) => {
    svg.append(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'chart-grid' }));
    svg.append(el('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'chart-text' }, v.toFixed(1)));
  });
  svg.append(el('polyline', { points: ws.map((w, i) => `${x(i)},${y(w.kg)}`).join(' '), class: 'chart-line' }));
  ws.forEach((w, i) => svg.append(el('circle', { cx: x(i), cy: y(w.kg), r: i === ws.length - 1 ? 5 : 3.5, class: i === ws.length - 1 ? 'chart-dot last' : 'chart-dot' })));
  const lab = [0, ws.length - 1];
  if (ws.length > 4) lab.splice(1, 0, Math.floor((ws.length - 1) / 2));
  lab.forEach((i) => svg.append(el('text', { x: x(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === ws.length - 1 ? 'end' : 'middle', class: 'chart-text' },
    ws[i].date.slice(5).replace('-', '/'))));
  return svg;
}
