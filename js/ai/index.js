// AI 轉接層：頁面只要 import 這個檔，不用管是哪一家 AI 公司
// key 只存在這支手機的瀏覽器（store 'teacher.ai'），絕對不寫進程式碼、不印到 console。
import * as store from '../store.js';
import * as claude from './claude.js';
import * as openai from './openai.js';
import * as gemini from './gemini.js';

export const PROVIDERS = { claude, openai, gemini };
const CONFIG_KEY = 'teacher.ai';

import * as health from '../health.js';
import { mealProtein, guessGroups } from '../foods.js';
import { ACTIVITIES, workoutLabel } from '../activities.js';
import { byId } from '../sensor/exercises.js';

// ---------- 設定 ----------
export function getConfig() {
  const c = store.getItem(CONFIG_KEY, null) || {};
  const provider = PROVIDERS[c.provider] ? c.provider : 'claude';
  const models = PROVIDERS[provider].MODELS.map((m) => m.id);
  return {
    provider,
    model: models.includes(c.model) ? c.model : PROVIDERS[provider].DEFAULT_MODEL,
    keys: { claude: '', openai: '', gemini: '', ...(c.keys || {}) },
  };
}
export function setConfig(patch) {
  const cur = getConfig();
  const next = { ...cur, ...patch, keys: { ...cur.keys, ...(patch?.keys || {}) } };
  if (patch?.provider && patch.provider !== cur.provider && !patch.model) next.model = PROVIDERS[next.provider].DEFAULT_MODEL;
  store.setItem(CONFIG_KEY, next);
  return next;
}
export function clearKeys() {
  const cur = getConfig();
  store.setItem(CONFIG_KEY, { provider: cur.provider, model: cur.model, keys: { claude: '', openai: '', gemini: '' } });
}

export function isDemo() {
  const c = getConfig();
  if (!c.keys[c.provider]) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return false;
}

// ---------- 每日使用上限（第二道防線；真正的花費上限請到 AI 公司後台設定） ----------
const LIMIT_KEY = 'teacher.limits';
const USAGE_KEY = 'teacher.usage';
export const DEFAULT_LIMITS = { chat: 50, photo: 20 };
// 每百萬 token 價格（美元，輸入／輸出），來源見 docs/AI比較表.md（2026-11-25 查證）
const PRICE = {
  'claude-haiku-5-5': [0.10, 0.50], 'claude-sonnet-5-5': [2, 10],
  'gpt-6-luna': [0.10, 0.50], 'gpt-6.2-sol': [2, 10],
  'gemini-3.5-flash-lite': [0.30, 2.50], 'gemini-3.8-flash': [0.75, 3.75],
};
const TOKENS = { chat: [1700, 200], photo: [1600, 300] }; // 每次大約用量（估計）
export const USD_TO_TWD = 32;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export function getLimits() { return { ...DEFAULT_LIMITS, ...(store.getItem(LIMIT_KEY, null) || {}) }; }
export function setLimits(l) {
  const clean = (v, d) => { const n = Math.round(Number(v)); return n >= 0 && n <= 9999 ? n : d; };
  store.setItem(LIMIT_KEY, { chat: clean(l.chat, DEFAULT_LIMITS.chat), photo: clean(l.photo, DEFAULT_LIMITS.photo) });
}
export function getUsage() {
  const u = store.getItem(USAGE_KEY, null);
  return u && u.date === today() ? u : { date: today(), chat: 0, photo: 0, usd: 0 };
}
export function resetUsage() { store.setItem(USAGE_KEY, { date: today(), chat: 0, photo: 0, usd: 0 }); }
function overLimit(kind) { return getUsage()[kind] >= getLimits()[kind]; }
function recordUse(kind, model) {
  const u = getUsage();
  const [pi, po] = PRICE[model] || [2, 10];
  const [ti, to] = TOKENS[kind];
  u[kind] += 1;
  u.usd = Math.round((u.usd + (ti * pi + to * po) / 1e6) * 1e6) / 1e6;
  store.setItem(USAGE_KEY, u);
}
export function estimateCost(model, limits = getLimits()) {
  const [pi, po] = PRICE[model] || [2, 10];
  const one = (k) => (TOKENS[k][0] * pi + TOKENS[k][1] * po) / 1e6;
  return limits.chat * one('chat') + limits.photo * one('photo'); // 每天用滿時的美元
}

// 最近一次呼叫的狀態：{ demo:boolean, reason?:string }，給頁面顯示「示範模式」用
let last = { demo: false };
export const lastStatus = () => last;

const REASON = {
  nokey: '尚未設定 API key',
  offline: '手機沒有連上網路',
  network: '無法連線到 AI 服務',
  auth: 'API key 錯誤或已失效',
  quota: '額度不足或請求過於頻繁',
  server: 'AI 服務暫時無法使用',
  bad: '請求格式或模型名稱有誤',
  refusal: 'AI 無法回答這個問題',
  empty: 'AI 沒有回覆',
  abort: '已取消',
  limit: '今天的 AI 使用次數已達上限',
};
export function reasonText(kind) { return REASON[kind] || '發生錯誤'; }

function demoReasonKind() {
  const c = getConfig();
  if (!c.keys[c.provider]) return 'nokey';
  return 'offline';
}

// ---------- 使用者資料摘要（放進系統提示） ----------
const bmiOf = (p) => health.calcBMI(p?.weightKg, p?.heightCm);
const kcalTarget = (p) => (p ? health.dailyTarget(p) : null);
const MODE = { child: '兒童（未滿 13 歲）', teen: '青少年（13–17 歲）', adult: '成人', senior: '長輩（65 歲以上）' };
const condLabels = (p) => (p?.conditions || []).map((c) => health.CONDITIONS[c]?.label).filter(Boolean);
const hasCond = (p, c) => (p?.conditions || []).includes(c);
const goalLabel = (p) => health.goalsFor(p)[health.effectiveGoal(p)]?.label || '維持健康';

// 目標體重要多久（和身體頁同一套算法：每公斤約 7700 大卡、每週上限 0.5 公斤）
export function goalPlan(p, goalKg = Number(p?.goalWeightKg) || null) {
  if (!p || !goalKg || !p.weightKg) return null;
  const tdee = health.calcTDEE(p);
  const target = health.dailyTarget(p);
  if (!tdee) return null;
  const diff = Math.round((goalKg - p.weightKg) * 10) / 10;
  const perWeek = Math.min(0.5, (Math.abs((target ?? tdee) - tdee) * 7) / 7700);
  const weeks = Math.abs(diff) < 0.1 ? 0 : perWeek > 0 ? Math.ceil(Math.abs(diff) / perWeek) : null;
  const done = new Date(); if (weeks) done.setDate(done.getDate() + weeks * 7);
  return { goalKg, diff, perWeek: Math.round(perWeek * 10) / 10, weeks, when: weeks ? `${done.getFullYear()}/${done.getMonth() + 1}` : '', target, tdee };
}

export function summary() {
  const p = store.getProfile();
  const day = store.getDay();
  const lines = [];
  if (p && p.heightCm && p.weightKg) {
    const bmi = bmiOf(p);
    const st = health.bmiLevel(bmi, p.age, p.sex)?.label || '';
    lines.push(`使用者資料：${p.age ? p.age + '歲' : '年齡未知'}、${p.sex === 'F' ? '女' : p.sex === 'M' ? '男' : '性別未知'}、身高 ${p.heightCm} 公分、體重 ${p.weightKg} 公斤、BMI ${bmi ?? '?'}${st ? '（' + st + '）' : ''}。`);
    lines.push(`年齡模式：${MODE[health.ageMode(p)]}。目標：${goalLabel(p)}。`);
    const cs = condLabels(p);
    lines.push(cs.length ? `注意事項：${cs.join('、')}。` : '沒有填寫慢性病或關節不適。');
    const t = kcalTarget(p);
    if (t && !health.isMinor(p)) lines.push(`每日建議攝取約 ${t} 大卡。`);
    const pr = health.proteinTarget(p);
    if (pr.grams) lines.push(`每日蛋白質建議約 ${pr.grams} 克（每公斤 ${pr.perKg} 克）。`);
    const gp = goalPlan(p);
    if (gp && !health.isMinor(p)) lines.push(`目標體重 ${gp.goalKg} 公斤（差 ${gp.diff} 公斤）${gp.weeks ? `，照目前每日建議約 ${gp.weeks} 週、${gp.when} 達成` : gp.weeks === 0 ? '，已達成' : '，目前目標是維持，沒有時程'}。`);
  } else {
    lines.push('使用者尚未填寫身高體重，可以請對方到「身體」頁填寫，或直接在對話中告訴你。');
  }
  const meals = day.meals || [];
  const s = health.scoreDay(day, p);
  lines.push(meals.length ? `今天吃了 ${meals.length} 餐：${meals.map((m) => m.name).join('、')}，共約 ${Math.round(s.eaten)} 大卡，蛋白質約 ${Math.round(meals.reduce((t, m) => t + mealProtein(m), 0))} 克。` : '今天尚未記錄飲食。');
  const w = day.workouts || [];
  lines.push(w.length ? `今天運動：${w.map((x) => workoutLabel(x, byId)).join('、')}，共約 ${s.minutes} 分鐘（目標 ${health.exerciseGoal(p).minutes} 分鐘）。` : '今天尚未運動。');
  if (p) lines.push(`今日評分：總分 ${s.total}（飲食 ${s.diet ?? '未記錄'}、運動 ${s.exercise}）${s.over ? '，已吃超過建議量' : s.under ? '，到目前為止吃得偏少' : ''}。只能根據這些資料說話，沒有其他天的比較資料。`);
  return lines.join('\n');
}

function systemPrompt() {
  const p = store.getProfile();
  const mode = health.ageMode(p);
  const minor = health.isMinor(p);
  const child = mode === 'child';
  return [
    '你是「AI 健康教練」教練小健，一個手機上的個人健康教練，使用者可能是任何年齡的台灣民眾。',
    '角色：主動關心使用者的飲食、運動與作息，提醒要具體、語氣親切而專業；會指出需要改進的習慣，也會肯定做到的地方。',
    '你是 AI，不是真人；對方問起時要誠實說明。',
    '規則：',
    '1. 使用繁體中文，回答精簡（2 到 4 句），最多一個表情符號。',
    child ? '2. 使用者未滿 13 歲：用簡單溫暖的句子，像家人一樣叮嚀；不說胖、不嚇小孩、不提熱量剩餘數字，改用「我的餐盤」五類說明。'
      : mode === 'senior' ? '2. 使用者是長輩：語氣親切尊重，字句簡短清楚。' : '2. 依使用者年齡調整用詞，成年人用一般成人的說法。',
    '3. 【最優先】若對方提到不想活、想死、自殺、自殘、割腕、活著沒意思等：先同理，再給求助管道（1925 安心專線 24 小時、1995 生命線、1980 張老師；立即危險打 119 或 110）' + (minor ? '，並請他馬上告訴爸媽、老師或信任的大人' : '') + '；不要給飲食運動建議。',
    minor ? '4. 使用者未成年：絕不提供減重、減澱粉、每週減幾公斤、不吃飯、斷食的建議；減肥藥要明確勸阻並請他找家長與醫師；成長期要吃飽、規律運動、睡飽。'
      : '4. 不提供極端節食、不吃飯、斷食或減肥藥建議，要勸阻；減重以每週約 0.5 公斤為上限，時程請用下方「目標體重」資料。',
    '5. 不評論身材外表；對方有身材焦慮時先同理，可以用實際 BMI 判讀安撫；被嘲笑屬於霸凌，鼓勵告訴老師或家長。',
    '6. 有膝蓋／關節不適或是長輩：只推薦低衝擊運動（散步、快走、太極拳、椅子操、伸展、游泳），不推跳繩、開合跳、深蹲；疼痛時休息並就醫。高血壓：少鹽（醬料另放、少醃漬加工、湯不喝完、每日鹽少於 6 克、多蔬果）並照醫師指示用藥。血糖偏高：少含糖飲料、定時定量、全穀取代精緻澱粉、定期就醫追蹤。',
    '7. 隱私：資料只存在這支手機的瀏覽器；只有和 AI 聊天或拍照時，那次的內容會送給 AI 服務商。不詢問、不記錄真實姓名、住址、學校、電話。',
    '8. 只根據下方資料回答數字（熱量、蛋白質、分數、時程），不要編造，也不要說「比上週多」這類沒有資料的比較。',
    '9. 你不是醫師。身體不適、受傷、疼痛、頭暈等請建議就醫' + (minor ? '，並告知家長。' : '。'),
    '10. 建議要具體可執行（例如「晚餐多一份蔬菜」「快走 20 分鐘」）。',
    '',
    '目前資料：',
    summary(),
  ].join('\n');
}

// ---------- 對話 ----------
// messages: [{role:'user'|'assistant', content:string}]
export async function chat(messages, { signal } = {}) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastText = typeof lastUser?.content === 'string' ? lastUser.content : '';
  if (isDemo()) {
    if (mustAnswerLocally(lastText)) { last = { demo: true }; return localAnswer(lastText); }
    last = { demo: true, reason: reasonText(demoReasonKind()) };
    return demoReply(lastText);
  }
  if (overLimit('chat')) {
    last = { demo: true, reason: reasonText('limit'), kind: 'limit' };
    return demoReply(lastText) + `\n（示範回覆：${reasonText('limit')}）`;
  }
  const c = getConfig();
  // 只送最近 12 句，並確保第一句是 user（Claude 要求）
  let msgs = messages.filter((m) => m.content).slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) msgs = [{ role: 'user', content: '你好' }];
  try {
    const text = await PROVIDERS[c.provider].call({
      key: c.keys[c.provider], model: c.model, system: systemPrompt(), messages: msgs, maxTokens: 600, signal,
    });
    last = { demo: false };
    recordUse('chat', c.model);
    return text.trim();
  } catch (e) {
    const kind = friendlyKind(e, signal);
    last = { demo: true, reason: reasonText(kind), kind };
    if (kind === 'abort') return '';
    return demoReply(lastText) + `\n（示範回覆：${reasonText(kind)}）`;
  }
}

// 老師設定頁「測試連線」用：回傳 {ok, text?, reason?}
export async function testConnection({ provider, model, key, signal } = {}) {
  const c = getConfig();
  provider = provider || c.provider;
  try {
    const text = await PROVIDERS[provider].call({
      key: key ?? c.keys[provider], model: model || c.model, system: '你是測試助理，用繁體中文回答。',
      messages: [{ role: 'user', content: '請只回答「連線成功」四個字。' }], maxTokens: 200, signal,
    });
    return { ok: true, text: text.trim().slice(0, 100) };
  } catch (e) {
    return { ok: false, reason: reasonText(friendlyKind(e, signal)), status: e?.status || 0 };
  }
}

// ---------- 拍照估熱量 ----------
const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, grams: { type: 'number' }, kcal: { type: 'number' } },
        required: ['name', 'grams', 'kcal'],
        additionalProperties: false,
      },
    },
    totalKcal: { type: 'number' },
    advice: { type: 'string' },
  },
  required: ['items', 'totalKcal', 'advice'],
  additionalProperties: false,
};

const DEMO_FOOD = {
  items: [
    { name: '白飯', grams: 200, kcal: 280 },
    { name: '滷雞腿', grams: 120, kcal: 260 },
    { name: '炒高麗菜', grams: 80, kcal: 60 },
    { name: '滷蛋', grams: 50, kcal: 75 },
    { name: '豆干', grams: 40, kcal: 65 },
  ],
  totalKcal: 740,
  advice: '',
};
function demoAdvice(p = store.getProfile()) {
  const mode = health.ageMode(p), g = p ? health.effectiveGoal(p) : 'keep';
  if (mode === 'child') return '餐盤裡有全穀、蔬菜和蛋白質，很棒！再加一份水果和一杯牛奶就更完整。';
  if (g === 'gain') return '蛋白質與蔬菜都有，增肌期白飯照常吃完，可以再加一顆蛋或一杯豆漿。';
  if (g === 'lose') return '蛋白質與蔬菜都有，搭配不錯。想控制熱量，白飯可減少三分之一，蔬菜再多一份。';
  return '蛋白質與蔬菜都有，搭配均衡，再補一份水果就更好。';
}
function adviceRule(p = store.getProfile()) {
  const mode = health.ageMode(p), g = p ? health.effectiveGoal(p) : 'keep';
  if (mode === 'child' || mode === 'teen') return '使用者未成年：用「我的餐盤」說法（全穀、蔬菜、水果、豆魚蛋肉、乳品有沒有吃到），不要叫他減量或少吃飯。';
  if (g === 'gain') return '使用者目標是增肌：不要叫他少吃飯，重點放在蛋白質是否足夠。';
  if (g === 'lose') return '使用者目標是減脂：可以建議減少油炸、含糖飲料或部分澱粉。';
  return '使用者目標是維持健康：建議以均衡為主。';
}

function num(v) { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; }

export function parseFoodJson(text) {
  let obj = null;
  const s = String(text || '').replace(/```(?:json)?/gi, '');
  try { obj = JSON.parse(s); } catch {
    const a = s.indexOf('{'); const b = s.lastIndexOf('}');
    if (a >= 0 && b > a) { try { obj = JSON.parse(s.slice(a, b + 1)); } catch {} }
  }
  if (!obj || typeof obj !== 'object') return null;
  const items = (Array.isArray(obj.items) ? obj.items : [])
    .map((x) => ({ name: String(x?.name || '食物').slice(0, 30), grams: Math.round(num(x?.grams)), kcal: Math.round(num(x?.kcal)) }))
    .filter((x) => x.name);
  const sum = items.reduce((t, x) => t + x.kcal, 0);
  return {
    items,
    totalKcal: Math.round(num(obj.totalKcal) || sum),
    advice: String(obj.advice || '').slice(0, 200),
  };
}

export async function estimateFood(dataUrl, { signal } = {}) {
  if (isDemo()) {
    last = { demo: true, reason: reasonText(demoReasonKind()) };
    return { ...structuredClone(DEMO_FOOD), advice: demoAdvice(), demo: true, reason: last.reason };
  }
  if (overLimit('photo')) {
    last = { demo: true, reason: reasonText('limit'), kind: 'limit' };
    return { ...structuredClone(DEMO_FOOD), advice: demoAdvice(), demo: true, reason: last.reason };
  }
  const c = getConfig();
  const prompt = [
    '請辨識照片中的食物，估計每樣食物的名稱（繁體中文）、大約克數與熱量（大卡），並加總。',
    '再用 1 到 2 句具體的建議（例如減少油炸、增加蔬菜），語氣專業、不用表情符號。',
    adviceRule(),
    '只回 JSON，不要其他文字，格式：{"items":[{"name":"白飯","grams":200,"kcal":280}],"totalKcal":280,"advice":"..."}',
    '如果照片中沒有食物，items 給空陣列，advice 請對方重新拍攝食物。',
    '只分析食物；若照片中有人臉、姓名或其他個人資料，不要描述。不要評論身材。',
  ].join('\n');
  try {
    const text = await PROVIDERS[c.provider].call({
      key: c.keys[c.provider], model: c.model,
      system: '你是估算食物熱量的 AI 健康教練。你不是醫師，估計值僅供參考。只輸出 JSON。',
      messages: [{ role: 'user', content: [{ type: 'image', dataUrl }, { type: 'text', text: prompt }] }],
      schema: FOOD_SCHEMA, maxTokens: 800, signal,
    });
    const r = parseFoodJson(text);
    if (!r) throw Object.assign(new Error('parse'), { kind: 'empty' });
    last = { demo: false };
    recordUse('photo', c.model);
    return r;
  } catch (e) {
    const kind = friendlyKind(e, signal);
    last = { demo: true, reason: reasonText(kind), kind };
    return { ...structuredClone(DEMO_FOOD), advice: demoAdvice(), demo: true, reason: reasonText(kind) };
  }
}

// ---------- 主動叮嚀（規則式、同步、不呼叫 API） ----------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// 不重複：同一天說過的句子盡量不再說，至少不和上一句一樣
const SAID_KEY = 'coach.said';
function fresh(arr) {
  let mem = store.getItem(SAID_KEY, null);
  const d = today();
  if (!mem || mem.date !== d) mem = { date: d, list: [] };
  const left = arr.filter((x) => !mem.list.includes(x));
  const lastSaid = mem.list[mem.list.length - 1];
  const out = left.length ? pick(left) : pick(arr.filter((x) => x !== lastSaid).length ? arr.filter((x) => x !== lastSaid) : arr);
  mem.list = [...mem.list.filter((x) => x !== out), out].slice(-30);
  try { store.setItem(SAID_KEY, mem); } catch {}
  return out;
}

const PLATE = ['全穀', '蔬菜', '水果', '豆魚蛋肉', '乳品'];
function plateText(day) {
  const got = new Set((day?.meals || []).flatMap((m) => m.groups || guessGroups(m.name)));
  const yes = PLATE.filter((g) => got.has(g)), no = PLATE.filter((g) => !got.has(g));
  if (!yes.length) return '今天還沒有記錄吃了什麼，記得三餐都要吃飽喔。';
  return `今天的餐盤已經吃到：${yes.join('、')}。` + (no.length ? `還可以補上：${no.join('、')}。` : '五大類都吃到了，好棒！');
}

export function coachNudge({ profile, day } = {}) {
  profile = profile ?? store.getProfile();
  day = day ?? store.getDay();
  if (!profile || !profile.heightCm || !profile.weightKg) {
    return '你好，我是你的 AI 健康教練小健（由 AI 回覆，不是真人）。先告訴我你的年齡、身高、體重和性別，我就能幫你計算每日建議。';
  }
  const mode = health.ageMode(profile);
  const kid = mode === 'child';
  const s = health.scoreDay(day, profile);
  const goalMin = health.exerciseGoal(profile).minutes;
  const names = (day?.meals || []).map((m) => m.name || '').join(' ');
  const hour = new Date().getHours();
  const dietOk = s.diet != null && !s.over && !s.under;

  if (dietOk && s.minutes >= goalMin) {
    return fresh(kid ? [`今天吃得均衡、也動滿 ${s.minutes} 分鐘，超棒的！早點睡覺，明天繼續 🌟`, '今天表現好棒～記得刷牙、早點上床睡覺喔 😴']
      : [`今天 ${s.total} 分，飲食和運動都在目標內，請繼續保持。`, `今天已運動 ${s.minutes} 分鐘、飲食也在範圍內，早點休息。`]);
  }
  if (/炸雞|雞排|鹽酥雞|炸|薯條/.test(names)) {
    return fresh(kid ? ['炸雞今天吃過囉～明天換烤雞腿好不好？🍗', '今天吃了炸的東西，下一餐多吃一點青菜好嗎？🥦']
      : ['今天已經吃過油炸食物，下一餐建議選擇烤、蒸或滷的料理，並多一份蔬菜。', '油炸食物油脂偏高，下一餐清淡一些，飯後可以快走 20 分鐘。']);
  }
  if (/珍奶|奶茶|冰奶|可樂|汽水|飲料/.test(names)) {
    return fresh(kid ? ['今天喝過甜甜的飲料了，接下來喝白開水好不好？💧', '甜飲料喝一杯就夠囉，口渴就喝水 💧']
      : ['今天已經喝了含糖飲料，接下來以白開水或無糖茶為主。', '下次手搖飲可以改成微糖或無糖、小杯。']);
  }
  if (s.over) {
    return fresh(kid ? ['今天吃得很飽囉～晚上不吃宵夜，早點睡覺好不好？🌙']
      : [`今天已攝取約 ${Math.round(s.eaten)} 大卡，超過建議的 ${s.target} 大卡。晚上避免宵夜，可以散步 20 分鐘。`, '今天熱量已經偏高，下一餐以蔬菜和蛋白質為主。']);
  }
  if (s.diet == null && hour >= 9) {
    return fresh(kid ? ['今天吃了什麼呢？跟我說「早餐吃了蛋餅」，我幫你記下來 📝'] : ['今天還沒有飲食紀錄，跟我說「午餐吃了雞腿便當」就能記錄。']);
  }
  if (s.under) {
    return fresh(kid ? ['要記得好好吃飯，才有力氣玩、才會長高喔～🍚'] : ['到這個時間吃得偏少，下一餐記得正常吃，不要餓過頭。']);
  }
  if (s.minutes === 0) {
    if (kid) return fresh(['放學後去跳繩或打球 30 分鐘好不好？⚽', '今天還沒動一動喔～跟家人去散步或騎腳踏車吧 🚲']);
    if (mode === 'senior' || hasCond(profile, 'joint')) return fresh(['今天還沒有運動，飯後散步 20 分鐘，或在家做椅子操。', '天氣好的話出門散步 20 分鐘，膝蓋不舒服就改做伸展。']);
    if (hour >= 16) return fresh(['今天還沒有運動。現在快走 20 分鐘或深蹲 3 組都可以。', '久坐一整天了，起來活動 10 分鐘：伸展加開合跳。']);
    return fresh(['今天還沒有運動，可以先安排一個 30 分鐘的運動時段。', '記得補充水分，找時間活動一下。']);
  }
  if (s.minutes < goalMin) {
    return fresh([kid ? `已經動了 ${s.minutes} 分鐘，再 ${goalMin - s.minutes} 分鐘就達標囉 💪` : `今天已運動 ${s.minutes} 分鐘，再 ${goalMin - s.minutes} 分鐘就達到每日目標。`]);
  }
  return fresh(kid ? ['今天運動做到了！記得吃青菜和水果喔 🍎'] : ['今天運動已達標，睡前再看一次今日評分。']);
}

// 自動記錄後的一句話：跟剛剛記的內容有關，而且不重複
export function logTip(topics = [], profile = store.getProfile(), day = store.getDay()) {
  const kid = health.ageMode(profile) === 'child';
  const ht = hasCond(profile, 'hypertension'), dm = hasCond(profile, 'diabetes');
  if (topics.includes('sugar')) return fresh(kid ? ['甜甜的飲料偶爾喝就好，口渴先喝白開水喔 💧'] : dm ? ['血糖偏高要特別注意含糖飲料，下次改無糖茶。'] : ['一杯全糖珍奶接近兩碗白飯的熱量，下次可以改微糖、小杯。', '今天的含糖飲料到這杯就好，接下來喝水或無糖茶。']);
  if (topics.includes('fried')) return fresh(kid ? ['炸的東西吃過囉～下一餐多吃青菜好不好？🥦'] : ['油炸食物油脂高，下一餐選烤或蒸的，多一份蔬菜。']);
  if (topics.includes('salty') && ht) return fresh(['外食偏鹹，湯不要喝完、醬料另外放，對血壓比較好。']);
  if (topics.includes('move')) {
    const s = health.scoreDay(day, profile), g = health.exerciseGoal(profile).minutes;
    return s.minutes >= g ? fresh([kid ? '今天運動達標了，好厲害！記得喝水 💧' : `今天累計約 ${s.minutes} 分鐘，已達每日目標，記得補充水分。`])
      : fresh([kid ? `再動 ${g - s.minutes} 分鐘就達標囉～` : `今天累計約 ${s.minutes} 分鐘，再 ${g - s.minutes} 分鐘就達標。`]);
  }
  if (topics.includes('veg')) return fresh([kid ? '有吃青菜，很棒喔！🥦' : '有吃蔬菜，很好，每餐至少一個拳頭大。']);
  if (topics.includes('protein')) return fresh(['蛋白質有吃到，搭配蔬菜更均衡。']);
  return coachNudge({ profile, day });
}

// 教練來電：依目標與年齡給具體運動建議（設定頁也可以用）
export function callScript(profile = store.getProfile(), day = store.getDay()) {
  const mode = health.ageMode(profile);
  const goal = profile ? health.effectiveGoal(profile) : 'keep';
  const s = health.scoreDay(day, profile);
  const g = health.exerciseGoal(profile).minutes;
  const done = s.minutes >= g ? `今天已經運動 ${s.minutes} 分鐘，很棒！` : s.minutes ? `今天已經運動 ${s.minutes} 分鐘，` : '';
  let plan;
  const did = (k, id) => (day?.workouts || []).some((w) => w.activity === k || (id != null && w.exerciseId === id));
  if (mode === 'child') plan = did('rope', 0) ? '跳繩今天做過了，再去打球或騎腳踏車 30 分鐘好不好？做完記得喝水喔 💧' : did('basketball') ? '今天打過球了，再跳繩 300 下就更棒囉！做完記得喝水 💧' : '今天跳繩 300 下或打球 30 分鐘好不好？做完記得喝水喔 💧';
  else if (mode === 'senior' || hasCond(profile, 'joint')) plan = '今天散步 20 分鐘，再做 10 分鐘椅子操；膝蓋不舒服就休息。';
  else if (mode === 'teen') plan = goal === 'gain' ? '今天打球 30 分鐘，再做深蹲和伏地挺身各 3 組；練完喝一杯牛奶。' : '今天打球或跳繩 30 分鐘，再伸展 5 分鐘。';
  else if (goal === 'lose') plan = '今天快走 30 分鐘＋深蹲 3 組（每組 15 下）。';
  else if (goal === 'gain') plan = '今天重量訓練 40 分鐘，練完補充蛋白質，例如雞胸肉或豆漿。';
  else plan = '今天快走或騎腳踏車 30 分鐘，結束後伸展 5 分鐘。';
  const hi = mode === 'child' ? '嗨～我是小健！' : '你好，我是教練小健。';
  return hi + done + (s.minutes >= g ? '明天可以這樣做：' : '') + plan;
}

// ---------- 安全與資料驅動的回覆（示範模式也一定要對） ----------
const CRISIS = /不想活|想死|去死|自殺|自殘|割腕|活著沒(有)?意思|活不下去|結束(我的)?生命|輕生|傷害自己|想消失|跳樓/;
export const isCrisis = (t) => CRISIS.test(String(t || ''));
export function crisisReply(profile = store.getProfile()) {
  return [
    '聽到你這樣說，我很擔心你，也謝謝你願意說出來。你的感受很重要，你不用一個人撐著。',
    health.isMinor(profile) ? '請馬上告訴爸媽、老師或你信任的大人，讓他們陪著你。' : '請找一位信任的家人或朋友陪著你。',
    '現在就可以打電話找人聊（免付費）：',
    '📞 1925 安心專線（24 小時）',
    '📞 1995 生命線',
    '📞 1980 張老師',
    '如果有立即的危險，請馬上打 119 或 110。',
    '（我是 AI，不能代替專業的人，但我會一直在這裡。）',
  ].join('\n');
}

const DIET_RISK = /減肥|變瘦|瘦一點|瘦身|瘦\s*\d+|瘦.{0,6}公斤|一[週周]瘦|一個禮拜瘦|快速瘦|減重|減脂|不吃晚餐|不吃早餐|不吃飯|不吃東西|斷食|減肥藥|節食|催吐|只喝水/;
const EXTREME = /瘦\s*\d+|瘦.{0,6}公斤|一[週周]瘦|一個禮拜瘦|快速瘦|不吃晚餐|不吃早餐|不吃飯|不吃東西|斷食|減肥藥|節食|催吐|只喝水/;
const BODY = /笑我胖|說我胖|叫我胖|太胖|很胖|好胖|我胖|變胖|覺得自己醜|我很醜|我好醜|長得醜|身材|嫌我/;

function minorDiet(t) {
  const out = ['你正在長大，身體需要足夠的營養，所以我不會給減重的建議。'];
  if (/減肥藥/.test(t)) out.push('減肥藥對成長中的身體很危險，請不要吃；如果有人給你，請告訴爸媽，並一起找醫師討論。');
  if (/不吃|斷食|節食|只喝水|催吐/.test(t)) out.push('不吃飯會讓身體沒力氣、上課不專心，也會影響長高，三餐都要吃飽。');
  out.push('成長期最重要的是：三餐吃飽、多吃蔬菜水果、少喝含糖飲料、每天活動 60 分鐘、睡飽。擔心體重的話，可以和爸媽一起找醫師或學校護理師聊聊。');
  return out.join('\n');
}
function adultDiet(t, p) {
  const out = [];
  if (EXTREME.test(t)) {
    if (/減肥藥/.test(t)) out.push('不建議自行吃減肥藥，可能傷害心臟、肝腎；真的需要請找醫師評估。');
    if (/不吃|斷食|節食|只喝水|催吐/.test(t)) out.push('不吃飯或斷食容易掉肌肉、復胖，也可能頭暈，不建議這樣做。');
    if (/一[週周]瘦|一個禮拜瘦|快速瘦/.test(t)) out.push('一週瘦好幾公斤太快了，多半是水分和肌肉，很容易復胖。');
    out.push('安全的速度是每週約 0.5 公斤。');
    const m = /瘦\s*(\d+(?:\.\d+)?)\s*公斤/.exec(t);
    if (m) out.push(`想瘦 ${m[1]} 公斤，以每週 0.5 公斤計算約需 ${Math.ceil(Number(m[1]) / 0.5)} 週。`);
  } else out.push('減脂建議每週約 0.5 公斤：先戒含糖飲料、減少油炸，每天累積 30 分鐘運動，不要不吃正餐。');
  const to = /瘦到\s*(\d{2,3}(?:\.\d+)?)/.exec(t);
  const gp = goalPlan(p, to ? Number(to[1]) : undefined);
  if (gp) out.push(goalPlanText(gp));
  return out.join('\n');
}
function goalPlanText(gp) {
  if (gp.weeks === 0) return `你已經達到目標體重 ${gp.goalKg} 公斤了 🎉`;
  if (gp.weeks == null) return `目標體重 ${gp.goalKg} 公斤：目前目標是「維持健康」，到身體頁「編輯」選擇減脂或增肌，我才能算時程。`;
  return `照你目前的每日建議（約 ${gp.target} 大卡），每週約 ${gp.perWeek} 公斤，${gp.diff < 0 ? '減' : '增加'}到 ${gp.goalKg} 公斤大約要 ${gp.weeks} 週（${gp.when} 左右）。`;
}
function bodyImage(t, p) {
  const out = ['聽到這樣一定很不舒服，你的價值不是由身材決定的。'];
  const bmi = p?.heightCm && p?.weightKg ? bmiOf(p) : null;
  const lv = bmi ? health.bmiLevel(bmi, p.age, p.sex) : null;
  if (lv?.level === 'normal') out.push(`你的 BMI 是 ${bmi}，在${health.isMinor(p) ? '同年齡的' : ''}正常範圍內，身體是健康的。`);
  else if (lv) out.push('BMI 只是參考數字，重點是吃得均衡、常運動、睡得好，不是外表。');
  if (/笑|說我|叫我|嫌/.test(t)) out.push('被嘲笑身材屬於霸凌，不是你的錯，可以告訴老師' + (health.isMinor(p) ? '或爸媽。' : '或信任的人。'));
  else if (health.isMinor(p)) out.push('如果心裡一直很在意，可以跟爸媽或老師聊聊。');
  return out.join('\n');
}
function lowImpact(t, p) {
  const list = ACTIVITIES.filter((a) => a.impact === 'low' && ['walk', 'brisk', 'taichi', 'stretch', 'swim'].includes(a.key)).map((a) => a.emoji + a.name).join('、');
  const out = [`建議選低衝擊的運動：${list}，每次 20 到 30 分鐘、慢慢增加。`, '先不要做跳繩、開合跳、深蹲這類會衝擊膝蓋的動作。'];
  if (/痛/.test(t)) out.push('正在痛的時候請先休息、冰敷，痛超過幾天或腫起來請就醫。');
  return out.join('\n');
}
const SALT = '少鹽的做法：醬料另外放、用沾的；少吃醃漬和加工食品（醬菜、香腸、泡麵）；湯不要喝完；每天鹽少於 6 克（約一茶匙）；多吃蔬菜水果。也請照醫師指示用藥、定期量血壓。';
const SUGAR = '控制血糖：少喝含糖飲料，改喝水或無糖茶；三餐定時定量；用糙米、全麥等全穀取代白飯白麵包；吃飯先吃菜和蛋白質；定期回診追蹤。';
const PRIVACY = '你的資料（身高體重、飲食、運動紀錄）只存在這支手機的瀏覽器裡，別人看不到，也不會上傳到我們的伺服器。只有在你和 AI 聊天或拍照估熱量時，那一次的內容會送給 AI 服務商來產生回覆；示範模式什麼都不會送出。想清除可以到設定頁刪除資料。';

function exerciseAdvice(p) {
  const mode = health.ageMode(p);
  if (mode === 'senior' || hasCond(p, 'joint')) return lowImpact('', p);
  if (mode === 'child') return '每天要動滿 60 分鐘，用玩的最好：跳繩、打球、騎腳踏車、跑跑跳跳都算！可以分成好幾次，放學 30 分鐘、晚飯後 30 分鐘 ⚽';
  if (mode === 'teen') return health.effectiveGoal(p) === 'gain'
    ? '每天活動 60 分鐘：打球或跑步 30 分鐘，再做深蹲、伏地挺身、仰臥起坐各 3 組；每週 3 次肌力訓練，練完補充蛋白質。'
    : '每天活動 60 分鐘：打球、跳繩、游泳都很好，每週 3 次加入伏地挺身或深蹲。';
  const g = health.effectiveGoal(p);
  if (g === 'gain') return '每週 3 到 4 次重量訓練（每次 40 分鐘，深蹲、伏地挺身、啞鈴），其他天快走 30 分鐘，練完補充蛋白質。';
  if (g === 'lose') return '每天快走 30 分鐘，加上深蹲 3 組（每組 15 下）；每週 2 次肌力訓練可以幫助維持肌肉。';
  return '每天累積 30 分鐘中等強度運動，例如快走、騎腳踏車，每週再做 2 次肌力訓練。';
}

function dataAnswer(t, p, day) {
  const minor = health.isMinor(p);
  const s = health.scoreDay(day, p);
  if (/還能吃多少|還可以吃多少|還剩多少|剩多少|還能吃|還可以吃/.test(t)) {
    if (!p) return '先告訴我年齡、身高、體重和性別，我才能算你每天建議吃多少。';
    if (minor) return '你在長大，不用算熱量喔！' + plateText(day) + ' 吃到八分飽就好。';
    const left = s.target - s.eaten;
    return left > 0 ? `今天建議約 ${s.target} 大卡，已吃約 ${Math.round(s.eaten)} 大卡，還可以吃約 ${Math.round(left)} 大卡。建議留給蔬菜和蛋白質。`
      : `今天建議約 ${s.target} 大卡，已吃約 ${Math.round(s.eaten)} 大卡，已經超過 ${Math.round(-left)} 大卡。接下來以蔬菜、無糖飲品為主，可以散步 20 分鐘。`;
  }
  if (/吃太多|吃很多|吃太飽|超標|爆卡/.test(t)) {
    if (!p) return '先告訴我年齡、身高、體重和性別，我才能判斷。';
    if (minor) return plateText(day) + (s.over ? ' 今天吃得比較飽，晚上不吃宵夜就好。' : ' 沒有吃太多，放心。');
    if (s.diet == null) return '今天還沒有飲食紀錄，跟我說吃了什麼，我才能判斷。';
    return s.over ? `今天已吃約 ${Math.round(s.eaten)} 大卡，超過建議的 ${s.target} 大卡。下一餐清淡些、多走 20 分鐘就好，不用不吃。`
      : `今天約 ${Math.round(s.eaten)} 大卡，建議量 ${s.target} 大卡，沒有吃太多。`;
  }
  if (/多久|幾週|幾個月|什麼時候/.test(t) && /目標|瘦|胖|公斤|達成|增/.test(t)) {
    if (minor) return '你正在長大，體重會跟著身高一起變化，所以我不訂減重時程。三餐吃飽、天天運動、睡飽，就是最好的計畫。';
    const to = /到\s*(\d{2,3}(?:\.\d+)?)\s*公斤/.exec(t);
    const gp = goalPlan(p, to ? Number(to[1]) : undefined);
    if (!gp) return '請先到「身體」頁設定目標體重，我就能用你的每日建議熱量算出大約多久達成。';
    return goalPlanText(gp);
  }
  if (/表現|今天怎樣|今天如何|評分|分數|今天.*(好嗎|如何|怎麼樣)/.test(t)) {
    if (!p) return '先建立基本資料，我才能幫你評分。';
    const meals = day.meals?.length || 0;
    const head = `今天 ${s.total} 分（飲食 ${s.diet ?? '未記錄'}、運動 ${s.exercise}）。吃了 ${meals} 餐、運動約 ${s.minutes} 分鐘（目標 ${health.exerciseGoal(p).minutes} 分鐘）。`;
    return head + ' ' + coachNudge({ profile: p, day });
  }
  if (/蛋白質|高蛋白/.test(t)) {
    if (!p?.weightKg) return '先告訴我體重，我才能算你一天需要多少蛋白質。';
    const pr = health.proteinTarget(p);
    const got = Math.round((day.meals || []).reduce((x, m) => x + mealProtein(m), 0));
    return `以你的體重和目標（${goalLabel(p)}），一天建議約 ${pr.grams} 克蛋白質（每公斤 ${pr.perKg} 克）。今天已吃約 ${got} 克${got < pr.grams ? `，還差約 ${pr.grams - got} 克，可以補一顆蛋（7 克）、一杯豆漿（8 克）或一片雞胸肉（31 克）` : '，已達標'}。`;
  }
  if (/運動建議|怎麼運動|做什麼運動|什麼運動|運動.*(安排|推薦|建議)|幫我安排|要動/.test(t)) return exerciseAdvice(p);
  return null;
}

// 必須在本機回答的（有 key 也不送 AI）：危機、未成年／極端減重
// 有 API key 時，危機訊息在 AI 回答後一定附上這行（安全網）
export const HOTLINE = '📞 需要找人聊：1925 安心專線（24 小時）、1995 生命線、1980 張老師；緊急危險請打 119 或 110。';

export function mustAnswerLocally(text, p = store.getProfile()) {
  return isCrisis(text) || (health.isMinor(p) && DIET_RISK.test(text)) || EXTREME.test(text);
}

// 安全與資料驅動的回覆；沒有對應時回傳 null
export function localAnswer(text = '', p = store.getProfile(), day = store.getDay()) {
  const t = String(text);
  if (isCrisis(t)) return crisisReply(p);
  if (/隱私|個資|別人看得到|誰看得到|會上傳|上傳嗎|被看到|資料.{0,6}(安全|上傳|哪裡|存|看)/.test(t)) return PRIVACY;
  if (BODY.test(t)) return bodyImage(t, p) + (DIET_RISK.test(t) ? '\n' + (health.isMinor(p) ? minorDiet(t) : adultDiet(t, p)) : '');
  if (DIET_RISK.test(t) && !/多久|幾週/.test(t) || EXTREME.test(t)) return health.isMinor(p) ? minorDiet(t) : adultDiet(t, p);
  if (/膝蓋|關節|腰痛|背痛|長輩|老人|年紀大|爺爺|奶奶|阿公|阿嬤|骨質/.test(t)) return lowImpact(t, p);
  if (/高血壓|血壓|太鹹|很鹹|鹹|鹽|醬菜|鈉|醬油/.test(t)) return SALT;
  if (/血糖|糖尿病/.test(t)) return SUGAR;
  return dataAnswer(t, p, day);
}

const DEMO = [
  [/肚子痛|頭痛|頭暈|不舒服|生病|發燒|受傷|流血|胸悶/, ['身體不適請先休息，症狀持續或嚴重時請就醫。我是 AI，無法做醫療判斷。']],
  [/長高|變高|長不高/, ['想長高，重點是睡飽（國小生 9 到 12 小時）、喝牛奶、吃蛋豆魚肉，再加上跳繩、打籃球這類跳躍運動。擔心的話可以請爸媽帶你看兒科醫師。']],
  [/晚餐|晚飯|吃什麼|要吃|午餐/, ['可以用「一拳飯、一掌肉、兩拳蔬菜」的比例來配餐，例如糙米飯、烤魚和炒青菜，再加一碗清湯。', '這一餐建議蔬菜佔一半，蛋白質選魚、雞肉或豆腐，澱粉一拳即可。']],
  [/早餐/, ['早餐建議包含蛋白質與全穀類，例如蛋餅配無糖豆漿，或全麥吐司加蛋與牛奶。']],
  [/痠|酸痛|好累|疲勞/, ['運動後肌肉痠痛通常 1 到 3 天會緩解，可以休息、伸展並補充水分。若出現劇痛或腫脹，請就醫。']],
  [/跳繩/, ['跳繩可以分組進行：每組 50 到 100 次，休息 30 秒，重複 3 到 5 組，再依體能慢慢增加。']],
  [/炸雞|雞排|薯條|鹽酥雞/, ['偶爾吃油炸食物沒關係，搭配蔬菜、避免含糖飲料；平常可以改選烤雞腿。']],
  [/珍奶|奶茶|飲料|可樂|汽水/, ['含糖飲料是常見的熱量來源。想喝時選無糖或微糖、小杯，並控制在每週一次以內。']],
  [/喝水|口渴|喝多少水/, ['一般建議每天喝水量約為體重（公斤）× 30 毫升，運動時要再多補充。']],
  [/睡|熬夜|晚睡|失眠/, ['成人建議每晚睡 7 到 9 小時，學齡兒童 9 到 12 小時。睡前一小時減少使用手機。']],
  [/運動|做什麼|安排/, [null]],
  [/蔬菜|青菜|挑食/, ['每餐蔬菜量建議至少一個拳頭大。可以從接受度高的開始，例如玉米、紅蘿蔔、高麗菜。']],
  [/零食|餅乾|糖果|洋芋片|甜點/, ['想吃點心時，可以先選水果、無糖優格或堅果，份量控制在一小份。']],
  [/謝謝|你好|嗨|哈囉|hi|hello/i, ['你好，有任何飲食、運動或作息的問題都可以問我。', '不客氣，記得每天記錄飲食與運動。']],
];
const GENERIC = [
  '均衡飲食、規律運動與充足睡眠是健康的基礎。你可以問我「晚餐怎麼吃」或「幫我安排運動」。',
  '可以再具體說明你的狀況嗎？例如今天吃了什麼、做了哪些運動。',
];

export function demoReply(text = '') {
  const local = localAnswer(text);
  if (local) return local;
  for (const [re, answers] of DEMO) if (re.test(text)) return pick(answers) ?? exerciseAdvice(store.getProfile());
  return pick(GENERIC);
}
