// 設定：提醒時間、教練來電、字體大小、示範資料、清除資料、老師設定、關於。
import { h, toast, incomingCall } from '../ui.js';
import { getSettings, setSettings, getProfile, setProfile, setDay, addWeight, getRewards, setRewards, clearAll, todayKey } from '../store.js';
import { FOODS } from '../foods.js';
import { EXERCISES } from '../sensor/exercises.js';
import { scoreDay } from '../health.js';

let root = null;

// 字體大小：標準 19px／大 22px。main.js 啟動時也可以呼叫 applyFont() 讓設定一打開就生效。
export function applyFont(scale = getSettings().fontScale) {
  document.documentElement.style.setProperty('--font', scale > 1 ? '22px' : '19px');
}

export function render(r) {
  root = r;
  applyFont();
  draw();
}

function draw() {
  root.replaceChildren(remindCard(), callCard(), fontCard(), demoCard(), teacherCard(), aboutCard(), dangerCard());
}

// ---------- 提醒時間 ----------
function remindCard() {
  const s = getSettings();
  const times = [...(s.remindTimes || [])].sort();
  const input = h('input', { type: 'time', value: '18:00', 'aria-label': '新的提醒時間' });
  return h('div', { class: 'card' },
    h('h2', {}, '⏰ 提醒時間'),
    h('p', { class: 'muted small' }, '教練會在這些時間提醒你（次數可以自己決定，不會太煩）。'),
    times.length ? h('ul', { class: 'list' }, times.map((t) => h('li', { class: 'list-item' },
      h('span', { class: 'grow big-time' }, t),
      h('span', { class: 'small muted' }, label(t)),
      h('button', { class: 'del-btn', 'aria-label': `刪除 ${t}`, onclick: () => {
        const ss = getSettings(); ss.remindTimes = (ss.remindTimes || []).filter((x) => x !== t); setSettings(ss); draw();
      } }, '🗑️')))) : h('p', { class: 'muted' }, '目前沒有提醒。'),
    h('div', { class: 'row mt' }, input, h('button', { class: 'btn', onclick: () => {
      const v = input.value; if (!v) return;
      const ss = getSettings(); ss.remindTimes = [...new Set([...(ss.remindTimes || []), v])].sort();
      setSettings(ss); toast(`加好了：${v}`); draw();
    } }, '新增')),
    h('p', { class: 'muted tiny' }, '小提醒：網頁 App 要開著才會提醒；之後做成手機通知。'),
  );
}
function label(t) {
  const hh = Number(t.slice(0, 2));
  return hh < 10 ? '早上・量體重' : hh < 14 ? '中午・拍午餐' : hh < 20 ? '傍晚・運動時間' : '睡前・看評分';
}

// ---------- 教練來電 ----------
function callCard() {
  return h('div', { class: 'card' },
    h('h2', {}, '📞 教練來電'),
    h('p', { class: 'muted small' }, '運動時間到了，教練會「打電話」叫你。'),
    h('button', { class: 'btn block', onclick: () => {
      const name = getProfile()?.name || '小朋友';
      setTimeout(() => incomingCall({
        title: 'AI教練來電',
        message: `${name}，運動時間到囉！今天來跳繩兩百下，跳完記得喝水喔！`,
        onAccept: () => toast('教練：運動時間到囉！🏃'),
      }), 800);
    } }, '📞 試試教練來電'),
  );
}

// ---------- 字體大小 ----------
function fontCard() {
  const s = getSettings();
  const set = (scale) => { const ss = getSettings(); ss.fontScale = scale; setSettings(ss); applyFont(scale); draw(); };
  return h('div', { class: 'card' },
    h('h2', {}, '🔠 字體大小'),
    h('div', { class: 'choice-row' },
      h('button', { class: 'chip' + ((s.fontScale || 1) <= 1 ? ' on' : ''), onclick: () => set(1) }, '標準'),
      h('button', { class: 'chip big-chip' + ((s.fontScale || 1) > 1 ? ' on' : ''), onclick: () => set(1.15) }, '大')),
  );
}

// ---------- 示範資料 ----------
function demoCard() {
  return h('div', { class: 'card' },
    h('h2', {}, '🧪 示範資料'),
    h('p', { class: 'muted small' }, '產生過去 14 天的體重、餐點和運動紀錄，方便展示。'),
    h('button', { class: 'btn secondary block', onclick: () => {
      if (!confirm('要載入示範資料嗎？過去 14 天的紀錄會被換掉（今天的不會）。')) return;
      loadDemo(); toast('示範資料載入好了！去「評分」看看'); draw();
    } }, '載入示範資料'),
  );
}

// 產生合理的假資料：體重慢慢下降一點點、每天 3～4 餐、1～3 次運動
function loadDemo() {
  let p = getProfile();
  if (!p) { p = { name: '小安', age: 10, sex: 'M', heightCm: 140, weightKg: 37.2, goal: 'lose', activity: 'mid' }; setProfile(p); }
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

// ---------- 老師設定 ----------
function teacherCard() {
  return h('div', { class: 'card' },
    h('h2', {}, '👩‍🏫 老師／家長'),
    h('a', { class: 'btn ghost block', href: '#teacher' }, '進入「老師設定」'),
  );
}

// ---------- 關於 ----------
function aboutCard() {
  return h('div', { class: 'card' },
    h('h2', {}, 'ℹ️ 關於 AI健康教練'),
    h('ul', { class: 'about' },
      h('li', {}, 'AI教練不是醫生。身體不舒服，一定要跟爸爸媽媽說、去看醫生。'),
      h('li', {}, '小朋友還在長大，每週只建議減一點點，不要餓肚子。'),
      h('li', {}, '你的資料只存在這支手機裡，不會傳到別的地方。'),
      h('li', {}, '熱量和 BMI 都是「大約」的數字，參考就好。'),
    ),
  );
}

// ---------- 清除資料 ----------
function dangerCard() {
  return h('div', { class: 'card' },
    h('h2', {}, '🧹 重新開始'),
    h('button', { class: 'btn danger block', onclick: () => {
      if (!confirm('真的要清除你的身體、飲食、運動和點數資料嗎？刪掉就找不回來了喔！\n（老師密碼和 AI key 不會刪除，要到「老師設定」清除）')) return;
      clearAll(); applyFont(1); toast('資料清除好了'); location.hash = '#body';
    } }, '清除我的資料'),
  );
}
