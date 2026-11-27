// 設定：提醒、字體大小、AI 連線入口、示範資料、清除資料、關於。
import { h, toast, incomingCall, askAdmin } from '../ui.js';
import { icon } from '../icons.js';
import { getSettings, setSettings, getProfile, setProfile, setDay, setRewards, setChat, setItem, clearAll, todayKey } from '../store.js';
import { FOODS } from '../foods.js';
import { EXERCISES } from '../sensor/exercises.js';
import { scoreDay, isMinor } from '../health.js';
import { activityKcal } from '../activities.js';

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
  if (isMinor(getProfile())) return hh < 10 ? '吃早餐' : hh < 14 ? '記錄午餐' : hh < 20 ? '運動' : '早點睡';
  return hh < 10 ? '量體重' : hh < 14 ? '記錄午餐' : hh < 20 ? '運動' : '查看今日紀錄';
}

// ---------- 教練來電 ----------
function callCard() {
  return h('div', { class: 'card row between' },
    h('div', {}, h('div', { class: 'bold' }, '教練來電'), h('div', { class: 'muted small' }, '到了運動時間，以來電畫面提醒。')),
    h('button', { class: 'btn ghost', onclick: () => {
      import('../ai/index.js').then((ai) => setTimeout(() => incomingCall({
        ...ai.callOptions(),
        onAccept: () => toast('通話結束'),
      }), 600));
    } }, '試用'),
  );
}

// ---------- 字體大小 ----------
function fontCard() {
  const s = getSettings();
  const big = (s.fontScale || 1) > 1;
  const set = (scale) => { const ss = getSettings(); ss.fontScale = scale; setSettings(ss); applyFont(scale); draw(); };
  return h('div', { class: 'card row between' },
    h('div', {}, h('div', { class: 'bold' }, '字體大小'), h('div', { class: 'muted small' }, big ? '目前：大' : '目前：標準')),
    h('div', { class: 'segment small-seg font-seg', role: 'radiogroup', 'aria-label': '字體大小' },
      h('button', { class: big ? '' : 'on', role: 'radio', 'aria-checked': String(!big), onclick: () => set(1) }, '標準'),
      h('button', { class: big ? 'on' : '', role: 'radio', 'aria-checked': String(big), onclick: () => set(1.2) }, '大')),
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
    h('div', {}, h('div', { class: 'bold' }, '載入示範資料'), h('div', { class: 'muted small' }, '示範人物「小安」（10 歲）過去 14 天與今天的紀錄。')),
    h('button', { class: 'btn ghost', onclick: () => {
      if (!confirm('載入示範資料？個人資料會換成示範人物「小安」，過去 14 天與今天的紀錄、點數、聊天紀錄會被取代。')) return;
      loadDemo(); toast('已載入示範資料'); draw();
    } }, '載入'),
  );
}

// 國小組展示用：小安 10 歲男生，14 天裡約 5 天達標，體重隨成長小幅上升；今天也有早餐、午餐、跳繩與聊天紀錄。
// 用固定的資料（不用亂數），每次展示結果都一樣。
function loadDemo() {
  const p = { name: '小安', age: 10, sex: 'M', heightCm: 140, weightKg: 38, goal: 'keep', activity: 'mid' };
  setProfile(p);
  const F = (n) => FOODS.find((f) => f.name === n);
  let seq = 0;
  const meal = (date, time, names) => {
    const foods = names.map(F).filter(Boolean);
    return { id: `${date}-${time}-${seq++}`, time, photo: false,
      name: foods.map((f) => f.name).join('、'), kcal: foods.reduce((s, f) => s + f.kcal, 0),
      protein: foods.reduce((s, f) => s + (f.protein || 0), 0),
      items: foods.map((f) => ({ name: f.name, kcal: f.kcal, qty: 1 })),
      groups: [...new Set(foods.map((f) => f.group))] };
  };
  const rope = EXERCISES.find((e) => e.key === 'jump_rope') || EXERCISES[0];
  const ropeLog = (id, time, reps) => ({ id, time, exerciseId: rope.id, reps, quality: 88, stars: 4, kcal: Math.round(reps * rope.kcalPerRep * 10) / 10 });
  const act = (id, time, activity, minutes) => ({ id, time, activity, minutes, kcal: activityKcal(activity, minutes, p.weightKg), manual: true });

  const breakfasts = [['蛋餅', '豆漿'], ['吐司', '荷包蛋', '牛奶'], ['饅頭', '豆漿'], ['御飯糰', '牛奶']];
  const lunches = [['雞腿便當'], ['滷肉飯', '燙青菜', '滷蛋'], ['水餃', '燙青菜'], ['排骨便當']];
  const dinners = [['白飯', '煎魚', '炒高麗菜'], ['白飯', '雞腿', '花椰菜'], ['陽春麵', '豆腐', '燙青菜'], ['糙米飯', '滷排骨', '番茄']];
  const passDays = new Set([13, 10, 7, 5, 2]);   // 這幾天有好好運動 → 達標
  const weights = [];
  const rewards = { points: 0, awarded: {} };
  for (let i = 14; i >= 1; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const date = todayKey(d);
    const day = { date, meals: [], workouts: [] };
    day.meals.push(meal(date, '07:20', breakfasts[i % 4]));
    day.meals.push(meal(date, '12:10', lunches[i % 4]));
    day.meals.push(meal(date, '16:00', i % 3 === 0 ? ['半糖珍奶'] : ['香蕉', '牛奶']));
    day.meals.push(meal(date, '18:30', dinners[i % 4]));
    if (passDays.has(i)) {
      day.workouts.push(i % 2 ? act(`${date}-w1`, '16:30', 'basketball', 30) : ropeLog(`${date}-w1`, '17:00', 400));
      day.workouts.push(act(`${date}-w2`, '19:30', 'walk', 20));
    } else if (i % 4 === 1) {
      day.workouts.push(ropeLog(`${date}-w1`, '17:00', 100));
    }
    if (i % 2 === 0) { day.weightKg = Math.round((37.4 + (14 - i) * 0.04) * 10) / 10; weights.push({ date, kg: day.weightKg }); }
    setDay(day);
    if (scoreDay(day, p).passed) { rewards.awarded[date] = true; rewards.points += 1; }   // 依達標天數給點
  }
  // 今天：早餐、午餐、跳繩 300 下（今天的點數保留給使用者自己領）
  const today = todayKey();
  weights.push({ date: today, kg: p.weightKg });
  setItem('weights', weights);
  setDay({ date: today, weightKg: p.weightKg,
    meals: [meal(today, '07:15', ['蛋餅', '豆漿']), meal(today, '12:10', ['雞腿便當'])],
    workouts: [ropeLog(`${today}-w1`, '10:20', 300)] });
  setRewards(rewards);
  const t0 = Date.now() - 60 * 60 * 1000;
  setChat([
    { role: 'user', content: '午餐吃了雞腿便當', time: t0 },
    { role: 'assistant', content: '收到！已經幫你記下午餐「雞腿便當」，大約 800 大卡 🍱。有雞腿、有飯也有青菜，很棒！便當的炸物和滷汁比較油，晚餐可以多吃一點青菜，飯後喝白開水就好，不用喝含糖飲料喔。', time: t0 + 20000 },
    { role: 'user', content: '我想長高', time: t0 + 600000 },
    { role: 'assistant', content: '想長高有三個好方法 🌱\n1. 睡飽：每天晚上 9 點半前上床，睡 9–10 小時，身體在睡覺時長最快。\n2. 吃夠蛋白質和鈣：每餐有蛋、豆腐、魚或肉，每天喝 1.5–2 杯牛奶。\n3. 多跳多跑：跳繩、打籃球、跑步都很好，每天動 60 分鐘。\n今天你已經跳繩 300 下了，放學再去打一場球吧 🏀', time: t0 + 620000 },
  ]);
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
    h('button', { class: 'btn danger', onclick: async () => {
      if (isMinor(getProfile()) && !(await askAdmin('清除未成年使用者的資料前，請家長或老師輸入管理密碼確認。'))) return;
      if (!confirm('確定要清除所有個人紀錄嗎？此動作無法復原。\n（AI 連線設定與 API key 不會被刪除）')) return;
      clearAll(); applyFont(1); toast('已清除'); location.hash = '#body';
    } }, '清除'),
  );
}
