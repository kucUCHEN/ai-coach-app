// 用一句話記錄：「我午餐吃了雞腿便當和珍奶」「晚餐吃了牛肉麵加兩顆滷蛋」「散步30分鐘」「深蹲 5 組」「麻辣燙 600大卡」
// 原則：寧可不記，也不要亂記。問句只回答不記錄；認不出的食物請使用者補充。
import { FOODS, guessGroups, foodGroups } from './foods.js';
import { EXERCISES } from './sensor/exercises.js';
import { ACTIVITIES, activityByKey, activityKcal } from './activities.js';
import { goalsFor, isMinor, ageMode } from './health.js';
import { updateDay } from './store.js';

// 珍奶沒有寫甜度時用全糖（回覆會註明可以修改）；無糖珍奶清單沒有，補一筆估計值
const EXTRA = [{ name: '無糖珍奶', emoji: '🧋', unit: '一杯', kcal: 350, group: '點心', protein: 4 }];
const ALL = [...FOODS, ...EXTRA];
// 安全別名：只在「整段就是這個詞」時才對應（不會把「蛋白質」當成蛋、「炒飯」當成飯）
const ALIAS = {
  '珍珠奶茶': '全糖珍奶', '珍奶': '全糖珍奶', '飯糰': '御飯糰', '青菜': '燙青菜', '高麗菜': '炒高麗菜',
  '白飯': '白飯', '飯': '白飯', '蛋': '水煮蛋', '雞蛋': '水煮蛋', '鮮奶': '牛奶', '優格': '無糖優格',
  '紅茶拿鐵': '奶茶', '綠茶': '無糖茶', '無糖綠茶': '無糖茶', '烏龍茶': '無糖茶', '粥': '稀飯', '乳清': '乳清蛋白', '高蛋白': '乳清蛋白', '蛋白粉': '乳清蛋白', '高蛋白飲': '乳清蛋白',
};
const SWEET = { '全糖': '全糖珍奶', '半糖': '半糖珍奶', '少糖': '半糖珍奶', '微糖': '微糖珍奶', '無糖': '無糖珍奶' };
export const DIET_TALK = /不吃|沒吃飯|減肥|瘦|節食|斷食|減重藥|減肥藥|瀉藥|催吐|吐掉|代餐/;
const EX_ALIAS = { '跳繩': 0, '開合跳': 1, '深蹲': 2, '啞鈴': 3, '彎舉': 3, '仰臥起坐': 4 };
const CN = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5 };
const UNIT = '顆|碗|杯|個|份|片|塊|盤|條|根|隻|盒|罐|包|支|碟|匙|串|瓶|粒';
const NUM = '\\d+(?:\\.\\d+)?|[一二兩三四五六七八九十]+半?|半';

const now = () => new Date().toTimeString().slice(0, 5);
const newId = () => Date.now() + Math.random().toString(36).slice(2, 6);

export function cnNum(s) {
  if (s == null) return null;
  s = String(s);
  if (/^\d/.test(s)) return Number(s);
  let half = 0;
  if (s.length > 1 && s.endsWith('半')) { half = 0.5; s = s.slice(0, -1); }
  if (s === '半') return 0.5;
  if (s === '十') return 10 + half;
  if (s.startsWith('十')) return 10 + (CN[s[1]] || 0) + half;
  if (s.includes('十')) { const [a, b] = s.split('十'); return (CN[a] || 1) * 10 + (CN[b] || 0) + half; }
  return (CN[s] ?? NaN) + half;
}

// 問句：只回答、不記錄（但「我吃了…可以嗎」這種有陳述的照記）
export function isQuestion(t) {
  t = String(t || '');
  const ask = /[？?]|嗎|可以|能不能|要不要|會不會|怎麼|多少|是不是|好嗎|該|如何|什麼|為什麼|幾/.test(t);
  const stated = /(吃了|喝了|剛吃|剛喝|吃過|喝過|已經吃|已經喝)/.test(t);
  return ask && !stated;
}

function findFood(name) {
  name = name.trim();
  if (!name) return null;
  const sw = /^(全糖|半糖|少糖|微糖|無糖)?(珍珠奶茶|珍奶)$/.exec(name);
  if (sw) return { food: ALL.find((f) => f.name === SWEET[sw[1] || '全糖']), defaultSweet: !sw[1] };
  const exact = ALL.find((f) => f.name === name) || ALL.find((f) => f.name === ALIAS[name]);
  if (exact) return { food: exact };
  // 「大碗牛肉麵」「炸雞排」：包含完整食物名，且多出來的字不多
  const hit = ALL.filter((f) => f.name.length >= 2 && name.includes(f.name)).sort((a, b) => b.name.length - a.name.length)[0];
  if (hit && name.length - hit.name.length <= 2) return { food: hit };
  return null;
}

// 把食物那一段切開：「雞腿便當和珍奶」→ ['雞腿便當', '珍奶']
function foodSegments(clause) {
  return clause.split(/和|加上|加|跟|、|，|,|。|還有|以及|及|配|\s+/).map((s) => s.trim()).filter(Boolean);
}
const looksLikeExercise = (s) => /\d\s*(分鐘|分|小時|下|次|組)|小時|分鐘/.test(s)
  || ACTIVITIES.some((a) => a.words.some((w) => s.includes(w))) || Object.keys(EX_ALIAS).some((w) => s.includes(w));

function parseSegment(seg) {
  seg = seg.replace(/^(我|今天|早上|中午|晚上|剛剛|剛才|剛|有|了|一共)+/, '').replace(/(了|喔|啦|囉|呢|耶|！|!|～|~)+$/, '').trim();
  if (!seg) return null;
  let qty = 1, unit = '';
  const q = new RegExp(`^(${NUM})\\s*(${UNIT})?`).exec(seg);
  if (q && (q[2] || /^\d/.test(q[1]))) { qty = cnNum(q[1]); unit = q[2] || ''; seg = seg.slice(q[0].length).trim(); }
  if (!seg && unit === '碗') seg = '飯';
  if (!seg) return null;
  const r = findFood(seg);
  if (!r) return { unknown: seg };
  return { food: r.food, qty: qty > 0 && qty <= 20 ? qty : 1, defaultSweet: r.defaultSweet };
}

// 解析一句話：回傳 {foods:[{food,qty,defaultSweet}], custom:[{name,kcal}], unknown:[], workouts:[], goal, question}
export function parseLog(text) {
  const t = String(text || '').trim();
  const out = { foods: [], custom: [], unknown: [], workouts: [], goal: null, question: isQuestion(t) };

  // 目標：「我想增肌」「想減脂」「想維持」
  const g = /想(要)?(增肌|增重|減脂|減重|維持)/.exec(t);
  if (g) out.goal = { 增肌: 'gain', 增重: 'gain', 減脂: 'lose', 減重: 'lose', 維持: 'keep' }[g[2]];

  if (out.question) return out;
  // 「不吃晚餐快速瘦」「減肥藥」這類句子不是在報告吃了什麼，不記錄
  if (DIET_TALK.test(t)) { out.dietTalk = true; return out; }

  // ---- 運動 ----
  let rest = t;
  for (const [name, exId] of Object.entries(EX_ALIAS)) {
    if (out.workouts.some((w) => w.exerciseId === exId) || !t.includes(name)) continue;
    const sets = new RegExp(`${name}\\D{0,3}?(${NUM})\\s*組`).exec(t) || new RegExp(`(${NUM})\\s*組\\s*${name}`).exec(t);
    const per = /每組\s*(\d{1,3})\s*(下|次|個)/.exec(t);
    const reps = new RegExp(`${name}\\D{0,4}?(\\d{1,4})\\s*(下|次|個)`).exec(t) || new RegExp(`(\\d{1,4})\\s*(下|次|個)\\s*${name}`).exec(t);
    if (sets) {
      const n = Math.round(cnNum(sets[1]));
      if (n > 0 && n <= 30) out.workouts.push({ exerciseId: exId, sets: n, reps: n * (per ? Number(per[1]) : 10), estimated: !per });
    } else if (reps) out.workouts.push({ exerciseId: exId, reps: Number(reps[1]) });
    else continue;
  }
  const DUR = new RegExp(`(${NUM}|\\d+)\\s*(個)?\\s*(分鐘|分|小時|鐘頭)`);
  for (const a of ACTIVITIES) {
    const w = a.words.find((x) => t.includes(x));
    if (!w || out.workouts.some((x) => x.activity === a.key)) continue;
    if ((a.key === 'rope' && out.workouts.some((x) => x.exerciseId === 0)) || (a.key === 'jack' && out.workouts.some((x) => x.exerciseId === 1))) continue;
    const i = t.indexOf(w);
    const m = DUR.exec(t.slice(i)) || DUR.exec(t.slice(0, i));
    if (!m) continue;
    let mins = cnNum(m[1]);
    if (/小時|鐘頭/.test(m[3])) mins *= 60;
    mins = Math.round(mins);
    if (mins > 0 && mins <= 600) out.workouts.push({ activity: a.key, minutes: mins });
  }
  // 不在清單裡的運動：「去爬山 2 小時」「打網球 40 分鐘」「做了皮拉提斯半小時」→ 記成自訂運動，熱量交給 AI 估算
  if (!out.workouts.length) {
    const cm = new RegExp(`(?:去|做了?|練了?|玩了?|打了?|騎了?|爬了?|跑了?|跳了?|上了?)?\\s*([\\u4e00-\\u9fa5A-Za-z]{1,8}?)\\s*(?:了|課)?\\s*(${NUM}|\\d+|半)\\s*(個)?\\s*(分鐘|分|小時|鐘頭)`).exec(t);
    const half = /半小時|半個小時/.test(t);
    if (cm || half) {
      const name = (cm ? cm[1] : t.replace(/半個?小時.*$/, '')).replace(/^(我|今天|剛剛|剛才|剛|早上|下午|晚上|有|去|做|練|玩)+/, '').replace(/^打(?=..)/, '').trim();
      let mins = cm ? cnNum(cm[2]) : 30;
      if (cm && /小時|鐘頭/.test(cm[4])) mins *= 60;
      mins = Math.round(mins);
      if (name && name.length <= 8 && !/吃|喝|睡|看|滑|讀書|上班|工作|開車|搭/.test(name) && mins > 0 && mins <= 600) out.workouts.push({ custom: name, minutes: mins });
    }
  }
  // 「快走」也含「走」，「打籃球」含「打球」→ 同一段時間不要記兩次
  if (out.workouts.some((w) => w.activity === 'brisk')) out.workouts = out.workouts.filter((w) => w.activity !== 'walk');

  // ---- 自訂熱量：「麻辣燙 600大卡」「吃了麻辣燙600卡」 ----
  const ck = /(?:吃了|喝了|吃|喝)?\s*([^\d\s，,。、]{1,12}?)\s*(?:大約|約)?\s*(\d{2,4})\s*(?:大卡|千卡|卡|kcal)/i.exec(t);
  if (ck) {
    const name = ck[1].replace(/^(我|今天|早餐|午餐|晚餐|宵夜|點心|了|吃|喝)+/, '');
    const kcal = Number(ck[2]);
    if (name && kcal > 0 && kcal <= 3000) { out.custom.push({ name, kcal }); rest = t.replace(ck[0], ' '); }
  }

  // ---- 食物 ----
  const verb = /(吃了|喝了|剛吃|剛喝|吃|喝)/.exec(rest);
  const meal = /(早餐|午餐|晚餐|宵夜|點心|下午茶)/.exec(rest);
  let clause = verb ? rest.slice(verb.index + verb[0].length) : meal ? rest.slice(meal.index + meal[0].length) : rest;
  const strict = !!(verb || meal); // 有說「吃／喝」才回報認不出的東西
  for (const seg of foodSegments(clause)) {
    if (looksLikeExercise(seg)) continue;
    const r = parseSegment(seg);
    if (!r) continue;
    if (r.unknown) { if (strict && r.unknown.length <= 12 && !/^(早餐|午餐|晚餐|東西|很多|一點|什麼)$/.test(r.unknown)) out.unknown.push(r.unknown); continue; }
    const same = out.foods.find((x) => x.food === r.food);
    if (same) same.qty += r.qty; else out.foods.push(r);
  }
  return out;
}

const fmtQty = (q) => (q === 1 ? '' : q === 0.5 ? '半份' : `×${q}`);

// 寫進今天的紀錄。回傳 {text, undo:{date, meals:[id], workouts:[id]}, topics:[...] }（沒有東西時 text 是空字串）
export function applyLog(parsed, profile = null) {
  const { foods = [], custom = [], unknown = [], workouts = [] } = parsed || {};
  const bits = [], notes = [], topics = new Set();
  const undo = { meals: [], workouts: [] };
  const kg = Number(profile?.weightKg) || 60;
  let day = null;

  if (foods.length || custom.length) {
    const items = [
      ...foods.map(({ food, qty }) => ({ name: food.name + fmtQty(qty), emoji: food.emoji, kcal: Math.round(food.kcal * qty), protein: Math.round((food.protein || 0) * qty), groups: foodGroups(food), src: food.name })),
      ...custom.map((c) => ({ name: c.name, emoji: '🍽️', kcal: c.kcal, protein: undefined, groups: guessGroups(c.name), src: c.name })),
    ];
    const kcal = items.reduce((s, x) => s + x.kcal, 0);
    const known = items.filter((x) => Number.isFinite(x.protein));
    const meal = { id: newId(), time: now(), photo: false, manual: true, name: items.map((x) => x.name).join('、'), kcal, groups: [...new Set(items.flatMap((x) => x.groups))] };
    if (known.length === items.length) meal.protein = known.reduce((s, x) => s + x.protein, 0);
    day = updateDay((d) => d.meals.push(meal));
    undo.meals.push(meal.id);
    bits.push(`${items.map((x) => x.emoji + x.name).join('、')}（約 ${kcal} 大卡）`);
    if (foods.some((f) => f.defaultSweet)) notes.push('珍奶沒有說甜度，先記成全糖，可以到飲食頁修改。');
    if (custom.length) notes.push(`「${custom.map((c) => c.name).join('、')}」用你說的熱量記成自訂食物。`);
    for (const x of items) {
      if (/珍奶|奶茶|冰奶|可樂|蛋糕|冰淇淋|巧克力/.test(x.src)) topics.add('sugar');
      if (/炸|雞排|薯條|鹽酥雞/.test(x.src)) topics.add('fried');
      if (/便當|牛肉麵|滷肉飯|炒飯|醬菜/.test(x.src)) topics.add('salty');
      if (/青菜|高麗菜|花椰菜|沙拉|番茄|紅蘿蔔/.test(x.src)) topics.add('veg');
      if (/雞胸|蛋|乳清|豆腐|豆漿|牛奶|鮭魚|魚|優格/.test(x.src)) topics.add('protein');
    }
  }
  for (const w of workouts) {
    let rec;
    if (w.custom) {
      // 先用中等強度暫估，教練頁會再請 AI 估算並更新
      rec = { id: newId(), time: now(), activity: 'custom', name: w.custom, emoji: '🏃', minutes: w.minutes, kcal: Math.round(4 * kg * (w.minutes / 60) * 10) / 10, manual: true, estimating: true };
      bits.push(`🏃 ${w.custom} ${w.minutes} 分鐘`);
    } else if (w.activity) {
      const a = activityByKey(w.activity);
      rec = { id: newId(), time: now(), activity: a.key, minutes: w.minutes, kcal: activityKcal(a, w.minutes, kg), manual: true };
      bits.push(`${a.emoji} ${a.name} ${w.minutes} 分鐘`);
    } else {
      const ex = EXERCISES.find((e) => e.id === w.exerciseId);
      rec = { id: newId(), time: now(), exerciseId: ex.id, reps: w.reps, quality: null, stars: 0, kcal: Math.round(w.reps * ex.kcalPerRep * 10) / 10, manual: true };
      if (w.sets) rec.sets = w.sets;
      bits.push(`${ex.emoji} ${ex.name} ${w.reps} 次${w.sets ? `（${w.sets} 組）` : ''}`);
      if (w.estimated) notes.push(`${ex.name}以每組 10 次估算，可以說「每組 15 下」讓我記得更準。`);
    }
    day = updateDay((d) => d.workouts.push(rec));
    undo.workouts.push(rec.id);
    topics.add('move');
  }
  const lines = [];
  if (bits.length) lines.push(`✅ 幫你記下來了：${bits.join('、')}`);
  lines.push(...notes);
  for (const u of unknown) lines.push(`我還不認識「${u}」，這一項沒有記錄。可以到飲食頁拍照或手動選擇，或直接告訴我熱量，例如「${u} ○○ 大卡」。`);
  return { text: lines.join('\n'), logged: bits.length > 0, pending: undo.workouts.length ? workouts.filter((w) => w.custom).length : 0, undo: bits.length ? { date: day?.date, ...undo } : null, topics: [...topics] };
}

// 復原剛剛那次自動記錄（用 id 刪）
export function undoLog(undo) {
  if (!undo) return;
  const m = new Set(undo.meals || []), w = new Set(undo.workouts || []);
  updateDay((d) => {
    d.meals = (d.meals || []).filter((x) => !m.has(x.id));
    d.workouts = (d.workouts || []).filter((x) => !w.has(x.id));
  }, undo.date);
}

// 「我想增肌」→ 更新目標；回傳要說的話（未成年說減脂會改成健康成長）
export function goalChange(goal, profile) {
  if (!goal || !profile) return { profile, text: '' };
  const allowed = goalsFor(profile);
  if (allowed[goal]) {
    return { profile: { ...profile, goal }, text: `🎯 已把目標改成「${allowed[goal].label}」。` };
  }
  const p = { ...profile, goal: 'keep' };
  if (goal === 'lose' && isMinor(profile)) return { profile: p, text: '🌱 你還在長大，目標先設成「健康成長」：三餐吃飽、多運動、睡飽，身體會自己調整到適合的樣子。' };
  if (goal === 'gain' && ageMode(profile) === 'child') return { profile: p, text: '🌱 小學階段目標是「健康成長」：多跑多跳、喝牛奶、吃蛋豆魚肉，就是最好的「長肌肉」方法。' };
  return { profile: p, text: '' };
}
