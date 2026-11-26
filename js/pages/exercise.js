// 「運動」：連接感測器、選運動、看次數圓環，結束後記錄到今天。
import { h, toast } from '../ui.js';
import { icon } from '../icons.js';
import { getProfile, updateDay, getDay } from '../store.js';
import { getSensor, EXERCISES, byId } from '../sensor/index.js';

let root = null;
let sensor = null;
let offs = [];           // 取消事件監聽用
let state = null;        // { exId, running, reps, quality, stars, battery, connecting }
let els = {};

export function render(r) {
  root = r;
  sensor = getSensor();
  state = { exId: state?.exId ?? 0, running: false, reps: 0, quality: 0, stars: 0, battery: sensor.battery ?? null, connecting: false };

  offs.forEach((f) => f()); offs = [];
  offs.push(sensor.on('status', () => { drawStatus(); drawControls(); }));
  offs.push(sensor.on('battery', ({ pct }) => { state.battery = pct; drawStatus(); }));
  offs.push(sensor.on('count', ({ reps, quality, stars }) => {
    if (!state.running) return;
    Object.assign(state, { reps, quality, stars }); drawRing();
  }));

  const profileHint = getProfile() ? null
    : h('div', { class: 'card notice' }, '建立基本資料後，運動會計入每日評分。 ', h('a', { href: '#body' }, '前往建立'));

  els.status = h('div', { class: 'card sensor-bar' });
  els.chips = h('div', { class: 'chip-scroll' });
  els.where = h('p', { class: 'where' });
  els.ring = h('div', { class: 'ring-wrap' });
  els.controls = h('div', { class: 'controls' });
  els.today = h('div', { class: 'card' });

  root.replaceChildren(
    ...(profileHint ? [profileHint] : []),
    els.status,
    h('div', { class: 'card' }, h('h2', {}, '🏃 選擇運動'), els.chips, els.where),
    h('div', { class: 'card' }, els.ring, els.controls),
    manualCard(),
    els.today,
  );
  drawStatus(); drawChips(); drawRing(); drawControls(); drawToday();
}

export function leave() {
  if (state?.running) {
    state.running = false;
    try { sensor.stop(); } catch {}
    if (state.reps > 0) saveWorkout(true);
  }
  offs.forEach((f) => f()); offs = [];
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

// ---------- 選運動 ----------
function drawChips() {
  els.chips.replaceChildren(...EXERCISES.map((e) =>
    h('button', { class: 'chip' + (e.id === state.exId ? ' on' : ''), disabled: state.running,
      onclick: () => { state.exId = e.id; state.reps = 0; state.quality = 0; state.stars = 0; drawChips(); drawRing(); } },
      `${e.emoji} ${e.name}`)));
  const ex = byId(state.exId);
  els.where.replaceChildren(`感測器配戴位置：${ex.where}　目標 ${ex.goal} 次`);
}

// ---------- 大圓環 ----------
function drawRing() {
  if (!els.ring) return;
  const ex = byId(state.exId);
  const pct = Math.min(1, state.reps / ex.goal);
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
        h('div', { class: 'muted small' }, `/ ${ex.goal} 次`))),
    h('div', { class: 'ring-side' },
      h('div', { class: 'muted small' }, '目標進度'), h('div', { class: 'side-num' }, `${Math.round(pct * 100)}%`),
      h('div', { class: 'muted small' }, '動作完整度'), h('div', { class: 'side-num' }, state.reps ? `${state.quality}%` : '—'),
      h('div', { class: 'muted small' }, '節奏'), h('div', { class: 'stars', 'aria-label': `${state.stars} 顆星` }, stars)),
  );
}

// ---------- 開始／結束 ----------
function drawControls() {
  if (!els.controls) return;
  if (!sensor.connected) {
    els.controls.replaceChildren(h('p', { class: 'muted center small' }, '連接感測器後即可開始，也可以手動輸入次數。'));
    return;
  }
  els.controls.replaceChildren(state.running
    ? h('button', { class: 'btn stop block big-btn', onclick: stop }, '結束')
    : h('button', { class: 'btn block big-btn', onclick: start }, '開始'));
}

async function start() {
  Object.assign(state, { running: true, reps: 0, quality: 0, stars: 0 });
  drawChips(); drawRing(); drawControls();
  try { await sensor.start(state.exId); } catch (e) { console.warn(e); state.running = false; toast('無法開始，請再試一次'); drawControls(); drawChips(); }
}

async function stop() {
  try { await sensor.stop(); } catch (e) { console.warn(e); } // 感測器會再回報最後一次次數
  state.running = false;
  if (state.reps > 0) saveWorkout(false);
  else toast('這次沒有偵測到動作');
  drawChips(); drawControls(); drawToday();
}

function saveWorkout(quiet) {
  const ex = byId(state.exId);
  const kcal = Math.round(state.reps * ex.kcalPerRep * 10) / 10;
  addWorkout({ exerciseId: ex.id, reps: state.reps, quality: state.quality, stars: state.stars, kcal });
  if (!quiet) toast(cheer(state.reps, ex));
}

function addWorkout(w) {
  const time = new Date().toTimeString().slice(0, 5);
  updateDay((d) => { d.workouts.push({ id: Date.now() + Math.random().toString(36).slice(2, 6), time, ...w }); });
}

function cheer(reps, ex) {
  if (reps >= ex.goal) return `🎉 ${ex.name} ${reps} 次，達成目標！`;
  if (reps >= ex.goal / 2) return `💪 ${ex.name} ${reps} 次，超過一半了`;
  return `👍 已記錄 ${ex.name} ${reps} 次`;
}

// ---------- 手動輸入 ----------
function manualCard() {
  const exSel = h('select', { 'aria-label': '運動' }, EXERCISES.map((e) => h('option', { value: e.id }, e.name)));
  const reps = h('input', { type: 'number', inputmode: 'numeric', min: '1', max: '5000', placeholder: '次數', 'aria-label': '次數' });
  const body = h('div', { class: 'manual-body', hidden: true },
    h('div', { class: 'grid2' }, exSel, reps),
    h('button', { class: 'btn block mt', onclick: () => {
      const n = Math.round(Number(reps.value));
      if (!(n > 0 && n <= 5000)) return toast('請輸入正確的次數');
      const ex = byId(exSel.value);
      addWorkout({ exerciseId: ex.id, reps: n, quality: null, stars: 0, kcal: Math.round(n * ex.kcalPerRep * 10) / 10, manual: true });
      reps.value = '';
      toast(cheer(n, ex)); drawToday();
    } }, '儲存'));
  return h('div', { class: 'card' },
    h('button', { class: 'link-btn', onclick: () => { body.hidden = !body.hidden; } }, '沒有感測器？手動輸入次數', icon('chevron')),
    body);
}

// ---------- 今天做了什麼 ----------
function drawToday() {
  if (!els.today) return;
  const day = getDay();
  const total = day.workouts.reduce((s, w) => s + (Number(w.kcal) || 0), 0);
  els.today.replaceChildren(
    h('h2', {}, '🏅 今日運動'),
    day.workouts.length ? h('ul', { class: 'list' }, day.workouts.map((w) => {
      const ex = byId(w.exerciseId) || EXERCISES[0];
      return h('li', { class: 'list-item' },
        h('span', { class: 'muted small' }, w.time || ''),
        h('span', { class: 'grow' }, `${ex.emoji} ${ex.name} ${w.reps} 次`),
        h('span', { class: 'small muted' }, `${Math.round(w.kcal)} 大卡`));
    })) : h('p', { class: 'muted small' }, '尚未記錄。'),
    day.workouts.length ? h('p', { class: 'small' }, `共消耗約 ${Math.round(total)} 大卡`) : '',
  );
}
