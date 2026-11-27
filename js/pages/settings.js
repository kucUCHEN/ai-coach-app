// 設定：提醒、字體大小、AI 連線入口、示範資料、清除資料、關於。
import { h, toast, incomingCall } from '../ui.js';
import { icon } from '../icons.js';
import { getSettings, setSettings, getProfile, setProfile, setDay, addWeight, getRewards, setRewards, clearAll, todayKey } from '../store.js';
import { FOODS } from '../foods.js';
import { EXERCISES } from '../sensor/exercises.js';
import { scoreDay } from '../health.js';

let root = null;

// 字體大小：標準 17px／大 20px。main.js 啟動時也可以呼叫 applyFont() 讓設定一打開就生效。
export function applyFont(scale = getSettings().fontScale) {
  document.documentElement.style.setProperty('--k', scale > 1 ? '1.2' : '1');
}

export function render(r) {
  root = r;
  applyFont();
  draw();
}

function draw() {
  root.replaceChildren(
    section('⏰ 提醒', remindCard(), callCard()),
    section('🔠 顯示', fontCard()),
    section('🤖 AI 與資料', aiCard(), demoCard(), dangerCard()),
    aboutCard(),
  );
}
const section = (title, ...cards) => h('section', { class: 'settings-section' }, h('div', { class: 'section-title' }, title), ...cards);

// ---------- 提醒時間 ----------
function remindCard() {
  const s = getSettings();
  const times = [...(s.remindTimes || [])].sort();
  const input = h('input', { type: 'time', value: '18:00', 'aria-label': '新增提醒時間' });
  return h('div', { class: 'card' },
    h('h2', {}, '提醒時間'),
    times.length ? h('ul', { class: 'list' }, times.map((t) => h('li', { class: 'list-item' },
      h('span', { class: 'time-big' }, t),
      h('span', { class: 'grow muted small' }, label(t)),
      h('button', { class: 'del-btn', 'aria-label': `刪除 ${t}`, onclick: () => {
        const ss = getSettings(); ss.remindTimes = (ss.remindTimes || []).filter((x) => x !== t); setSettings(ss); draw();
      } }, icon('close'))))) : h('p', { class: 'muted small' }, '尚未設定提醒。'),
    h('div', { class: 'row mt' }, input, h('button', { class: 'btn', onclick: () => {
      const v = input.value; if (!v) return;
      const ss = getSettings(); ss.remindTimes = [...new Set([...(ss.remindTimes || []), v])].sort();
      setSettings(ss); toast(`已新增 ${v}`); draw();
    } }, '新增')),
    h('p', { class: 'fine' }, '網頁版需保持 App 開啟才會提醒。'),
  );
}
function label(t) {
  const hh = Number(t.slice(0, 2));
  return hh < 10 ? '量體重' : hh < 14 ? '記錄午餐' : hh < 20 ? '運動' : '查看今日紀錄';
}

// ---------- 教練來電 ----------
function callCard() {
  return h('div', { class: 'card row between' },
    h('div', {}, h('div', { class: 'bold' }, '教練來電'), h('div', { class: 'muted small' }, '到了運動時間，以來電畫面提醒。')),
    h('button', { class: 'btn ghost', onclick: () => {
      setTimeout(() => incomingCall({
        title: '教練小健',
        message: '運動時間到了。今天可以做 20 分鐘的跳繩或快走，結束後記得補充水分。',
        onAccept: () => toast('運動時間到了'),
      }), 600);
    } }, '試用'),
  );
}

// ---------- 字體大小 ----------
function fontCard() {
  const s = getSettings();
  const big = (s.fontScale || 1) > 1;
  const set = (scale) => { const ss = getSettings(); ss.fontScale = scale; setSettings(ss); applyFont(scale); draw(); };
  return h('div', { class: 'card row between' },
    h('div', { class: 'bold' }, '字體大小'),
    h('div', { class: 'segment small-seg' },
      h('button', { class: big ? '' : 'on', onclick: () => set(1) }, '標準'),
      h('button', { class: big ? 'on' : '', onclick: () => set(1.15) }, '大')),
  );
}

// ---------- AI 連線 ----------
function aiCard() {
  return h('a', { class: 'card nav-row', href: '#ai' },
    h('div', { class: 'grow' }, h('div', { class: 'bold' }, 'AI 連線設定'), h('div', { class: 'muted small' }, '選擇 AI 服務、輸入 API key（需管理密碼）')),
    icon('chevron'));
}

// ---------- 示範資料 ----------
function demoCard() {
  return h('div', { class: 'card row between' },
    h('div', {}, h('div', { class: 'bold' }, '載入示範資料'), h('div', { class: 'muted small' }, '產生過去 14 天的紀錄，方便展示。')),
    h('button', { class: 'btn ghost', onclick: () => {
      if (!confirm('載入示範資料？過去 14 天的紀錄會被取代（今天的不受影響）。')) return;
      loadDemo(); toast('已載入示範資料'); draw();
    } }, '載入'),
  );
}

// 產生合理的假資料：體重慢慢下降一點點、每天 3～4 餐、1～3 次運動
function loadDemo() {
  let p = getProfile();
  if (!p) { p = { name: '示範使用者', age: 35, sex: 'M', heightCm: 172, weightKg: 74.5, goal: 'lose', activity: 'mid' }; setProfile(p); }
  const pickFood = (group) => { const list = FOODS.filter((f) => f.group === group); return list[Math.floor(Math.random() * list.length)]; };
  const meal = (time, foods) => ({
    id: time + Math.random().toString(36).slice(2, 7), time, photo: false,
    name: foods.map((f) => f.name).join('、'), kcal: foods.reduce((s, f) => s + f.kcal, 0),
    groups: [...new Set(foods.map((f) => f.group))],
  });
  const rewards = getRewards(); rewards.awarded ||= {};
  let kg = p.weightKg + 0.8;
  for (let i = 14; i >= 1; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const date = todayKey(d);
    kg = Math.round((kg - 0.06 + (Math.random() - 0.5) * 0.2) * 10) / 10;
    const day = { date, meals: [], workouts: [] };
    if (i % 2 === 0 || Math.random() < 0.4) { day.weightKg = kg; addWeight(kg, date); }
    day.meals.push(meal('07:20', [pickFood('全穀'), FOODS.find((f) => f.name === '牛奶')]));
    day.meals.push(meal('12:10', [pickFood('全穀'), pickFood('豆魚蛋肉'), pickFood('蔬菜')]));
    day.meals.push(meal('18:30', [pickFood('全穀'), pickFood('豆魚蛋肉'), pickFood('蔬菜'), ...(Math.random() < 0.6 ? [pickFood('水果')] : [])]));
    if (Math.random() < 0.35) day.meals.push(meal('16:00', [pickFood('點心')]));
    const n = Math.random() < 0.15 ? 0 : 1 + Math.floor(Math.random() * 2.5);
    for (let k = 0; k < n; k++) {
      const ex = EXERCISES[Math.floor(Math.random() * EXERCISES.length)];
      const reps = Math.round(ex.goal * (0.6 + Math.random() * 0.8));
      day.workouts.push({ id: date + k, time: `17:${10 + k * 15}`, exerciseId: ex.id, reps,
        quality: 80 + Math.floor(Math.random() * 18), stars: 3 + Math.floor(Math.random() * 3), kcal: Math.round(reps * ex.kcalPerRep * 10) / 10 });
    }
    setDay(day);
    if (scoreDay(day, p).passed && !rewards.awarded[date]) { rewards.awarded[date] = true; rewards.points += 1; }
  }
  setRewards(rewards);
}

// ---------- 關於 ----------
function aboutCard() {
  return h('div', { class: 'about' },
    h('p', {}, 'AI 健康教練提供的建議僅供參考，不能取代醫師或營養師的診斷。身體不適請就醫。'),
    h('p', {}, '熱量與 BMI 為公式估算值。所有資料只存在這支手機，不會上傳。'),
  );
}

// ---------- 清除資料 ----------
function dangerCard() {
  return h('div', { class: 'card row between' },
    h('div', {}, h('div', { class: 'bold' }, '清除個人資料'), h('div', { class: 'muted small' }, '刪除身體、飲食、運動與點數紀錄。')),
    h('button', { class: 'btn danger', onclick: () => {
      if (!confirm('確定要清除所有個人紀錄嗎？此動作無法復原。\n（AI 連線設定與 API key 不會被刪除）')) return;
      clearAll(); applyFont(1); toast('已清除'); location.hash = '#body';
    } }, '清除'),
  );
}
