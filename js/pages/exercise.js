// 「運動」：連接感測器、選運動、看次數圓環，結束後記錄到今天。
// 運動進行中切到別的分頁：感測器在背景繼續計數，回來時接著顯示；只有按「結束」才存檔。
import * as ai from '../ai/index.js';
import { h, toast } from '../ui.js';
import { icon } from '../icons.js';
import { getProfile, updateDay, getDay, getItem, setItem } from '../store.js';
import { getSensor, EXERCISES, byId } from '../sensor/index.js';
import { ACTIVITIES, activityKcal, workoutLabel } from '../activities.js';
import { ageMode, workoutMinutes } from '../health.js';

// ---- 模組層級狀態（離開頁面仍保留）----
let sensor = null;
let bound = false;       // 事件監聽只註冊一次
const state = { exId: 0, running: false, reps: 0, quality: 0, stars: 0, battery: null, connecting: false, celebrated: false };
let els = {};
let tipTimer = null;

const FORM_TIP = {
  0: '這一下沒跳完整，雙腳離地、手腕繞圈',
  1: '這一下動作不完整，手舉高過頭、腳張開',
  2: '這一下動作不完整，蹲低一點',
  3: '這一下動作不完整，手伸直再彎起來',
  4: '這一下動作不完整，上身再起來一點',
};

function bind() {
  if (bound) return;
  bound = true;
  state.battery = sensor.battery ?? null;
  sensor.on('status', () => { drawStatus(); drawControls(); });
  sensor.on('battery', ({ pct }) => { state.battery = pct; drawStatus(); });
  sensor.on('count', ({ reps, quality, stars }) => {
    if (!state.running) return;
    Object.assign(state, { reps, quality, stars });
    const ex = byId(state.exId);
    if (!state.celebrated && reps >= goalOf(ex)) { state.celebrated = true; celebrate(ex); }
    drawRing();
  });
  sensor.on('form', ({ ok }) => { if (!ok && state.running) showTip(FORM_TIP[state.exId] || '這一下動作不完整'); });
}

function setLive(on) {
  document.querySelector('.tabbar a[data-route="exercise"]')?.classList.toggle('live', on);
}

export function render(r) {
  sensor = getSensor();
  bind();

  const profileHint = getProfile() ? null
    : h('div', { class: 'card notice' }, '建立基本資料後，運動會計入每日評分。 ', h('a', { href: '#body' }, '前往建立'));

  els.status = h('div', { class: 'card sensor-bar' });
  els.chips = h('div', { class: 'chip-scroll' });
  els.where = h('div', { class: 'where' });
  els.ring = h('div', { class: 'ring-wrap' });
  els.tip = h('div', { class: 'form-tip', role: 'status', 'aria-live': 'polite', hidden: true });
  els.goal = h('div', { class: 'goal-done', hidden: !state.celebrated || !state.running });
  els.controls = h('div', { class: 'controls' });
  els.today = h('div', { class: 'card' });

  r.replaceChildren(
    ...(profileHint ? [profileHint] : []),
    els.status,
    h('div', { class: 'card' }, h('h2', {}, '🏃 選擇運動'), els.chips, els.where),
    h('div', { class: 'card ex-live' }, els.ring, els.tip, els.goal, els.controls),
    manualCard(),
    els.today,
  );
  drawStatus(); drawChips(); drawRing(); drawGoal(); drawControls(); drawToday();
}

export function leave() {
  // 不停止感測器、不存檔：運動中切頁仍繼續計數
  clearTimeout(tipTimer);
  els = {};
}

// ---------- 感測器狀態 ----------
function drawStatus() {
  if (!els.status) return;
  const on = sensor.connected;
  const kindText = sensor.kind === 'mock' ? '模擬感測器' : (sensor.name || '運動感測器');
  els.status.replaceChildren(...[
    h('div', { class: 'row between' },
      h('div', { class: 'row' }, h('span', { class: 'dot ' + (on ? 'on' : 'off') }),
        h('span', { class: 'bold' }, on ? `${kindText}・已連線` : '感測器未連線')),
      on && state.battery != null ? h('span', { class: 'battery muted small' }, `電量 ${state.battery}%`) : null),
    on ? null : h('button', { class: 'btn block mt', disabled: state.connecting, onclick: connect },
      state.connecting ? '連線中…' : '連接感測器'),
    on ? null : h('p', { class: 'muted tiny' }, sensor.kind === 'mock' ? '目前使用模擬資料，方便在沒有感測器時展示。' : ''),
  ].filter(Boolean));
}

async function connect() {
  state.connecting = true; drawStatus();
  try { await sensor.connect(); toast('感測器已連線'); }
  catch (e) { console.warn(e); toast('連線失敗，請再試一次'); }
  state.connecting = false;
  drawStatus(); drawControls();
}

// ---------- 目標次數（使用者自訂，沒設過用預設值） ----------
function goalOf(ex) { const g = getItem('exGoals', {}) || {}; return Number(g[ex.id]) > 0 ? Number(g[ex.id]) : ex.goal; }
function setGoal(ex, n) { const g = getItem('exGoals', {}) || {}; g[ex.id] = n; setItem('exGoals', g); }

// ---------- 選運動 ----------
const HIGH_IMPACT = new Set([0, 1]); // 跳繩、開合跳
const REP_MAX = { 0: 3000, 1: 500, 2: 300, 3: 300, 4: 300 }; // 單次記錄的合理上限
function gentleUser() { const p = getProfile() || {}; return ageMode(p) === 'senior' || (p.conditions || []).includes('joint'); }
function drawChips() {
  if (!els.chips) return;
  els.chips.replaceChildren(...EXERCISES.map((e) =>
    h('button', { class: 'chip' + (e.id === state.exId ? ' on' : ''), disabled: state.running,
      onclick: () => {
        Object.assign(state, { exId: e.id, reps: 0, quality: 0, stars: 0, celebrated: false });
        if (els.manualEx) els.manualEx.value = String(e.id);
        els.setManualKind?.('reps');
        drawChips(); drawRing(); drawGoal();
      } },
      `${e.emoji} ${e.name}${gentleUser() && HIGH_IMPACT.has(e.id) ? ' ⚠️' : ''}`)));
  const ex = byId(state.exId);
  const goalIn = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: String(REP_MAX[ex.id] || 1000), value: goalOf(ex), class: 'goal-input', 'aria-label': `${ex.name}目標次數`,
    disabled: state.running,
    onchange: () => {
      const n = Math.round(Number(goalIn.value));
      if (!(n >= 1 && n <= (REP_MAX[ex.id] || 1000))) { toast(`目標請填 1–${REP_MAX[ex.id] || 1000} 次`); goalIn.value = goalOf(ex); return; }
      setGoal(ex, n); state.celebrated = state.reps >= n; toast(`🎯 ${ex.name}目標改成 ${n} 次`); drawRing(); drawGoal();
    } });
  els.where.replaceChildren(
    h('div', { class: 'goal-row' }, h('span', {}, '🎯 今天目標'), goalIn, h('span', {}, '次'), h('span', { class: 'muted small' }, '（可以自己改）')),
    h('div', { class: 'muted small' }, `感測器配戴位置：${ex.where}`),
    gentleUser() && HIGH_IMPACT.has(ex.id) ? h('div', { class: 'warn-text small' }, '⚠️ 這是高衝擊運動，膝蓋或關節不適時建議改做深蹲（扶椅子、蹲淺一點），或用下方「算分鐘」記錄散步、太極。') : '');
}

// ---------- 大圓環 ----------
function drawRing() {
  if (!els.ring) return;
  const ex = byId(state.exId);
  const pct = Math.min(1, state.reps / goalOf(ex));
  const R = 70, C = 2 * Math.PI * R;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 170 170'); svg.setAttribute('class', 'ring'); svg.setAttribute('aria-hidden', 'true');
  const mk = (cls, extra = {}) => {
    const c = document.createElementNS(NS, 'circle');
    Object.entries({ cx: 85, cy: 85, r: R, class: cls, ...extra }).forEach(([k, v]) => c.setAttribute(k, v));
    return c;
  };
  svg.append(mk('ring-bg'), mk('ring-fg', { 'stroke-dasharray': C, 'stroke-dashoffset': C * (1 - pct), transform: 'rotate(-90 85 85)' }));
  const stars = '★'.repeat(state.stars) + '☆'.repeat(5 - state.stars);
  els.ring.replaceChildren(
    h('div', { class: 'ring-box' }, svg,
      h('div', { class: 'ring-center' },
        h('div', { class: 'ring-num', 'aria-live': 'polite' }, state.reps),
        h('div', { class: 'muted small' }, `/ ${goalOf(ex)} 次`))),
    h('div', { class: 'ring-side' },
      h('div', { class: 'muted small' }, '目標進度'), h('div', { class: 'side-num' }, `${Math.round(pct * 100)}%`),
      h('div', { class: 'muted small' }, '動作完整度'), h('div', { class: 'side-num' }, state.reps ? `${state.quality}%` : '—'),
      h('div', { class: 'muted small' }, '節奏'), h('div', { class: 'stars', 'aria-label': `${state.stars} 顆星` }, stars)),
  );
}

function showTip(msg) {
  if (!els.tip) return;
  els.tip.textContent = '⚠️ ' + msg;
  els.tip.hidden = false;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { if (els.tip) els.tip.hidden = true; }, 1800);
}

function celebrate(ex) {
  toast(`🎉 達成目標 ${goalOf(ex)} 次！可以繼續做`);
  drawGoal();
}
function drawGoal() {
  if (!els.goal) return;
  const show = state.celebrated && state.reps > 0;
  els.goal.hidden = !show;
  if (show) els.goal.textContent = `🎉 已達成目標 ${goalOf(byId(state.exId))} 次，繼續加油！`;
}

// ---------- 開始／結束 ----------
function drawControls() {
  if (!els.controls) return;
  if (!sensor.connected) {
    els.controls.replaceChildren(h('p', { class: 'muted center small' }, '連接感測器後即可開始，也可以手動輸入。'));
    return;
  }
  els.controls.replaceChildren(state.running
    ? h('button', { class: 'btn stop block big-btn', onclick: stop }, '結束')
    : h('button', { class: 'btn block big-btn', onclick: start }, '開始'));
}

async function start() {
  Object.assign(state, { running: true, reps: 0, quality: 0, stars: 0, celebrated: false });
  setLive(true);
  drawChips(); drawRing(); drawGoal(); drawControls();
  try { await sensor.start(state.exId); }
  catch (e) { console.warn(e); state.running = false; setLive(false); toast('無法開始，請再試一次'); drawControls(); drawChips(); }
}

async function stop() {
  try { await sensor.stop(); } catch (e) { console.warn(e); } // 感測器會再回報最後一次次數
  state.running = false;
  setLive(false);
  if (state.reps > 0) saveWorkout();
  else toast('這次沒有偵測到動作');
  drawChips(); drawControls(); drawToday();
}

function saveWorkout() {
  const ex = byId(state.exId);
  const kcal = Math.round(state.reps * ex.kcalPerRep * 10) / 10;
  addWorkout({ exerciseId: ex.id, reps: state.reps, quality: state.quality, stars: state.stars, kcal });
  toast(cheer(state.reps, ex));
}

function addWorkout(w) {
  const time = new Date().toTimeString().slice(0, 5);
  updateDay((d) => { d.workouts.push({ id: Date.now() + Math.random().toString(36).slice(2, 6), time, ...w }); });
}

function cheer(reps, ex) {
  if (reps >= goalOf(ex)) return `🎉 ${ex.name} ${reps} 次，達成目標！`;
  if (reps >= goalOf(ex) / 2) return `💪 ${ex.name} ${reps} 次，超過一半了`;
  return `👍 已記錄 ${ex.name} ${reps} 次`;
}

// ---------- 手動輸入 ----------
// 驗證整數：回傳數字或錯誤訊息
function readInt(input, min, max, what) {
  const raw = String(input.value).trim();
  if (raw === '') return { err: `請輸入${what}` };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { err: '請輸入整數' };
  if (n < min || n > max) return { err: `${what}請輸入 ${min}–${max}` };
  return { n };
}

function manualCard() {
  const p = getProfile() || {};
  const mode = ageMode(p);
  const gentle = mode === 'senior' || (p.conditions || []).includes('joint');
  const child = mode === 'child';
  let kind = gentle ? 'min' : 'reps';

  // 次數型
  const exOrder = child ? [...EXERCISES].sort((a, b) => (b.key === 'jump_rope') - (a.key === 'jump_rope')) : EXERCISES;
  const exSel = h('select', { 'aria-label': '運動' }, exOrder.map((e) => h('option', { value: e.id }, `${e.emoji} ${e.name}`)));
  exSel.value = String(state.exId);
  els.manualEx = exSel;
  const reps = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '1000', step: '1', placeholder: '次數', 'aria-label': '次數' });
  const sets = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '20', step: '1', placeholder: '組數（可不填）', 'aria-label': '組數' });

  // 時間型：名稱可自由填（清單只是建議），熱量可不填，由 AI 估算
  const acts = [...ACTIVITIES];
  if (gentle) acts.sort((a, b) => (a.impact === 'low' ? 0 : 1) - (b.impact === 'low' ? 0 : 1));
  if (child) acts.sort((a, b) => (b.key === 'basketball') - (a.key === 'basketball'));
  const listId = 'act-list';
  const actName = h('input', { type: 'text', list: listId, maxlength: '20', placeholder: '運動名稱，例如：爬山、網球', 'aria-label': '運動名稱',
    value: gentle ? '散步' : '' });
  const datalist = h('datalist', { id: listId }, acts.map((a) => h('option', { value: a.name })));
  const minutes = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '300', step: '1', placeholder: '分鐘', 'aria-label': '分鐘' });
  const kcalIn = h('input', { type: 'number', inputmode: 'numeric', min: '0', max: '3000', step: '1', placeholder: '熱量(可不填)', 'aria-label': '消耗熱量' });
  const chipRow = h('div', { class: 'chip-scroll' }, acts.slice(0, 8).map((a) =>
    h('button', { class: 'chip', type: 'button', onclick: () => { actName.value = a.name; minutes.focus(); } },
      `${a.emoji} ${a.name}${gentle && a.impact === 'high' ? ' ⚠️' : ''}`)));

  const err = h('p', { class: 'form-err small', role: 'alert', hidden: true });
  const fail = (m) => { err.textContent = m; err.hidden = false; };

  const repsBox = h('div', {}, h('div', { class: 'grid2' }, exSel, reps), h('div', { class: 'grid2 mt' }, sets, h('span')));
  const minBox = h('div', {}, chipRow, actName, datalist, h('div', { class: 'grid2 mt' }, minutes, kcalIn),
    h('p', { class: 'muted tiny' }, gentle ? '低衝擊運動排在前面，對膝蓋比較友善。熱量不填時，由 AI 依你的體重估算。' : '任何運動都可以輸入。熱量不填時，由 AI 依你的體重估算。'));

  const tabR = h('button', { class: 'seg-btn', type: 'button', onclick: () => setKind('reps') }, '算次數');
  const tabM = h('button', { class: 'seg-btn', type: 'button', onclick: () => setKind('min') }, '算時間（任何運動）');
  function setKind(k) {
    kind = k; err.hidden = true;
    repsBox.hidden = k !== 'reps'; minBox.hidden = k !== 'min';
    tabR.classList.toggle('on', k === 'reps'); tabM.classList.toggle('on', k === 'min');
    tabR.setAttribute('aria-pressed', k === 'reps'); tabM.setAttribute('aria-pressed', k === 'min');
  }
  setKind(kind);
  els.setManualKind = setKind;

  const save = async () => {
    err.hidden = true;
    if (kind === 'reps') {
      const r = readInt(reps, 1, REP_MAX[Number(exSel.value)] || 1000, '次數'); if (r.err) return fail(r.err);
      let s = null;
      if (String(sets.value).trim() !== '') { const q = readInt(sets, 1, 20, '組數'); if (q.err) return fail(q.err); s = q.n; }
      const ex = byId(exSel.value);
      const total = r.n * (s || 1);
      const w = { exerciseId: ex.id, reps: r.n, quality: null, stars: 0, kcal: Math.round(total * ex.kcalPerRep * 10) / 10, manual: true };
      if (s) w.sets = s;
      addWorkout(w);
      reps.value = ''; sets.value = '';
      toast(cheer(total, ex));
    } else {
      const name = actName.value.trim();
      if (!name) return fail('請輸入運動名稱');
      const m = readInt(minutes, 1, 300, '分鐘'); if (m.err) return fail(m.err);
      const known = ACTIVITIES.find((x) => x.name === name);
      let kcal, note = '';
      if (String(kcalIn.value).trim() !== '') {
        const k = readInt(kcalIn, 0, 3000, '熱量'); if (k.err) return fail(k.err); kcal = k.n; note = '自己填的熱量';
      } else if (known && ai.isDemo()) {
        kcal = activityKcal(known, m.n, getProfile()?.weightKg);
      } else {
        saveBtn.disabled = true; saveBtn.textContent = 'AI 估算中…';
        const est = await ai.estimateExercise({ name, minutes: m.n });
        saveBtn.disabled = false; saveBtn.textContent = '儲存';
        kcal = est.kcal; note = est.note;
      }
      addWorkout(known ? { activity: known.key, minutes: m.n, kcal, manual: true } : { activity: 'custom', name, emoji: '🏃', minutes: m.n, kcal, note, manual: true });
      minutes.value = ''; kcalIn.value = '';
      toast(`👍 已記錄 ${name} ${m.n} 分鐘・約 ${Math.round(kcal)} 大卡`);
    }
    drawToday();
  };

  const saveBtn = h('button', { class: 'btn block mt', onclick: () => save() }, '儲存');
  const body = h('div', { class: 'manual-body' },
    h('div', { class: 'seg', role: 'group', 'aria-label': '記錄方式' }, tabR, tabM),
    repsBox, minBox, err,
    saveBtn);
  return h('div', { class: 'card' }, h('h2', {}, '✍️ 手動加入運動'),
    h('p', { class: 'muted small' }, '感測器沒偵測到、或做了其他運動，都可以在這裡加入。'), body);
}

// ---------- 今天做了什麼 ----------
function drawToday() {
  if (!els.today) return;
  const day = getDay();
  const ws = day.workouts || [];
  const total = ws.reduce((s, w) => s + (Number(w.kcal) || 0), 0);
  const mins = ws.reduce((s, w) => s + workoutMinutes(w), 0);
  els.today.replaceChildren(
    h('h2', {}, '🏅 今日運動'),
    ws.length ? h('p', { class: 'small today-sum' }, `共 ${ws.length} 項・約 ${mins} 分鐘・${Math.round(total)} 大卡`) : '',
    ws.length ? h('ul', { class: 'list' }, ws.map((w) =>
      h('li', { class: 'list-item' },
        h('span', { class: 'muted small' }, w.time || ''),
        h('span', { class: 'grow' }, workoutLabel(w, byId)),
        h('span', { class: 'small muted' }, `${Math.round(w.kcal)} 大卡`),
        h('button', { class: 'del-btn', 'aria-label': '刪除這筆', onclick: () => removeWorkout(w) }, '×'))))
      : h('p', { class: 'muted small' }, '尚未記錄。'),
  );
}

function removeWorkout(w) {
  if (!confirm(`要刪除「${workoutLabel(w, byId)}」這筆紀錄嗎？`)) return;
  updateDay((d) => { const i = d.workouts.findIndex((x) => (w.id ? x.id === w.id : x.time === w.time && x.kcal === w.kcal)); if (i >= 0) d.workouts.splice(i, 1); });
  toast('已刪除');
  drawToday();
}
