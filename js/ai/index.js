// AI 轉接層：頁面只要 import 這個檔，不用管是哪一家 AI 公司
// key 只存在這支手機的瀏覽器（store 'teacher.ai'），絕對不寫進程式碼、不印到 console。
import * as store from '../store.js';
import * as claude from './claude.js';
import * as openai from './openai.js';
import * as gemini from './gemini.js';

export const PROVIDERS = { claude, openai, gemini };
const CONFIG_KEY = 'teacher.ai';

// health.js 由另一位寫，可能還不存在 → 先試著載入，失敗就用自己的簡單算法
let health = null;
import('../health.js').then((m) => { health = m; }).catch(() => {});

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
function bmiOf(p) {
  try { if (health?.calcBMI) return health.calcBMI(p.weightKg, p.heightCm); } catch {}
  const m = p.heightCm / 100;
  return m > 0 && p.weightKg > 0 ? Math.round((p.weightKg / (m * m)) * 10) / 10 : null;
}
function statusOf(p) {
  try { if (health?.bmiLevel) return health.bmiLevel(bmiOf(p), p.age, p.sex)?.label || ''; } catch {}
  return '';
}
function kcalTarget(p) {
  try { if (health?.dailyTarget) return Math.round(health.dailyTarget(p)); } catch {}
  return null;
}
const GOAL = { keep: '維持健康', lose: '減脂', gain: '增肌' };
const EX = ['跳繩', '開合跳', '深蹲', '啞鈴彎舉', '仰臥起坐'];

export function summary() {
  const p = store.getProfile();
  const day = store.getDay();
  const lines = [];
  if (p && p.heightCm && p.weightKg) {
    const bmi = bmiOf(p);
    const st = statusOf(p);
    lines.push(`使用者資料：${p.age ? p.age + '歲' : '年齡未知'}、${p.sex === 'F' ? '女' : p.sex === 'M' ? '男' : '性別未知'}、身高 ${p.heightCm} 公分、體重 ${p.weightKg} 公斤、BMI ${bmi ?? '?'}${st ? '（' + st + '）' : ''}。`);
    if (p.goal) lines.push(`目標：${GOAL[p.goal] || p.goal}。`);
    const t = kcalTarget(p);
    if (t) lines.push(`每日建議攝取約 ${t} 大卡。`);
  } else {
    lines.push('使用者尚未填寫身高體重，可以請對方到「身體」頁填寫，或直接在對話中告訴你。');
  }
  const meals = day.meals || [];
  const eaten = meals.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
  lines.push(meals.length ? `今天吃了：${meals.map((m) => m.name).join('、')}，共約 ${Math.round(eaten)} 大卡。` : '今天尚未記錄飲食。');
  const w = day.workouts || [];
  lines.push(w.length ? `今天運動：${w.map((x) => `${EX[x.exerciseId] || '運動'} ${x.reps || 0} 次`).join('、')}。` : '今天尚未運動。');
  return lines.join('\n');
}

function systemPrompt() {
  const age = Number(store.getProfile()?.age) || null;
  const minor = age != null && age < 18;
  const child = age != null && age < 13;
  return [
    '你是「AI 健康教練」，一個手機上的個人健康教練，使用者可能是任何年齡的台灣民眾。',
    '角色：主動關心使用者的飲食、運動與作息，提醒要具體、語氣親切而專業，像一位可靠的私人教練；會指出需要改進的習慣，也會肯定做到的地方。',
    '你是 AI，不是真人；對方問起時要誠實說明。',
    '規則：',
    '1. 使用繁體中文，回答精簡（2 到 4 句），不用表情符號。',
    child ? '2. 使用者未滿 13 歲：用簡單易懂的句子，但不要用幼稚的語氣。' : '2. 依使用者年齡調整用詞，成年人用一般成人的說法。',
    '3. 你不是醫師。遇到身體不適、受傷、疼痛、頭暈等情況，建議就醫' + (minor ? '，並告知家長或監護人。' : '。'),
    minor ? '4. 使用者未成年：不提供節食、斷食、減肥藥等建議；以均衡飲食、充足睡眠與規律運動為主，體重目標要緩慢。'
          : '4. 不提供極端節食、斷食或藥物減重建議；減重以每週約 0.5 公斤為上限。',
    '5. 不評論或嘲笑身材外表，不用貶低身材的字眼；建議只針對飲食與生活習慣。',
    '6. 不詢問、不記錄真實姓名、住址、學校、公司、電話等個人資料。',
    '7. 建議要具體可執行（例如「晚餐多一份蔬菜」「快走 20 分鐘」）。',
    '8. 不討論與健康、運動、飲食、作息無關的危險話題。',
    '',
    '目前資料：',
    summary(),
  ].join('\n');
}

function friendlyKind(e, signal) {
  if (signal?.aborted || e?.name === 'AbortError') return 'abort';
  return e?.kind || 'network';
}

// ---------- 對話 ----------
// messages: [{role:'user'|'assistant', content:string}]
export async function chat(messages, { signal } = {}) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastText = typeof lastUser?.content === 'string' ? lastUser.content : '';
  if (isDemo()) {
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
  advice: '蛋白質與蔬菜都有，搭配不錯。若想控制熱量，白飯可減少三分之一，蔬菜再多一份。',
};

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
    return { ...structuredClone(DEMO_FOOD), demo: true, reason: last.reason };
  }
  if (overLimit('photo')) {
    last = { demo: true, reason: reasonText('limit'), kind: 'limit' };
    return { ...structuredClone(DEMO_FOOD), demo: true, reason: last.reason };
  }
  const c = getConfig();
  const prompt = [
    '請辨識照片中的食物，估計每樣食物的名稱（繁體中文）、大約克數與熱量（大卡），並加總。',
    '再用 1 到 2 句具體的建議（例如減少油炸、增加蔬菜），語氣專業、不用表情符號。',
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
    return { ...structuredClone(DEMO_FOOD), demo: true, reason: reasonText(kind) };
  }
}

// ---------- 主動叮嚀（規則式、同步、不呼叫 API） ----------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function coachNudge({ profile, day, scores } = {}) {
  profile = profile ?? store.getProfile();
  day = day ?? store.getDay();
  const meals = day?.meals || [];
  const workouts = day?.workouts || [];
  const names = meals.map((m) => m.name || '').join(' ');
  const eaten = meals.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
  const reps = workouts.reduce((s, w) => s + (Number(w.reps) || 0), 0);
  const hour = new Date().getHours();
  const target = profile ? kcalTarget(profile) : null;
  const total = Number(scores?.total ?? scores?.score ?? NaN);

  if (!profile || !profile.heightCm || !profile.weightKg) {
    return '你好，我是你的 AI 健康教練（由 AI 回覆，不是真人）。先告訴我你的年齡、身高和體重，我就能幫你計算每日建議熱量。';
  }
  if (Number.isFinite(total) && total >= 80) {
    return pick([
      `今天 ${Math.round(total)} 分，飲食和運動都在目標內，請繼續保持。`,
      `今天表現很好（${Math.round(total)} 分）。早點休息，明天維持同樣的節奏。`,
    ]);
  }
  if (/炸雞|雞排|鹽酥雞|炸|薯條|漢堡/.test(names)) {
    return pick([
      '今天已經吃過油炸食物，下一餐建議選擇烤、蒸或滷的料理，並多一份蔬菜。',
      '油炸食物的油脂偏高。今天可以多走 20 分鐘，下一餐清淡一些。',
    ]);
  }
  if (/珍奶|珍珠|奶茶|手搖|可樂|汽水|含糖|飲料/.test(names)) {
    return pick([
      '一杯全糖珍奶的熱量接近一碗半白飯。下次可以改成無糖或微糖、小杯。',
      '今天已經喝了含糖飲料，接下來以白開水或無糖茶為主。',
    ]);
  }
  if (target && eaten > target * 1.15) {
    return pick([
      `今天已攝取約 ${Math.round(eaten)} 大卡，超過建議量。晚上避免宵夜，可以安排 20 分鐘的運動。`,
      '今天的熱量已經偏高，下一餐以蔬菜和蛋白質為主，減少澱粉與甜食。',
    ]);
  }
  if (reps === 0) {
    if (hour >= 16) return pick([
      '今天還沒有運動。現在做 10 分鐘就好：跳繩、開合跳或深蹲都可以。',
      '久坐一整天了，起來活動一下：30 下開合跳或 15 下深蹲。',
    ]);
    if (hour >= 11) return pick([
      '今天還沒有運動，可以先在行事曆排一個 20 分鐘的運動時段。',
      '記得補充水分，下午找時間活動一下。',
    ]);
    return pick([
      '早安。記得量體重、吃早餐，今天也安排一點運動時間。',
      '新的一天開始了。早餐建議有蛋白質，例如蛋、豆漿或牛奶。',
    ]);
  }
  if (meals.length === 0 && hour >= 9) {
    return pick([
      `今天已經運動 ${reps} 次，很好。用餐時記得拍照記錄。`,
      '運動已完成，記得記錄今天吃了什麼，評分才會完整。',
    ]);
  }
  return pick([
    `今天運動 ${reps} 次，飲食也在範圍內，請繼續保持。`,
    '今天的進度不錯，睡前再看一次今日評分。',
  ]);
}

const DEMO = [
  [/肚子痛|頭痛|頭暈|不舒服|生病|發燒|受傷|流血|胸悶/, ['身體不適請先休息，症狀持續或嚴重時請就醫。我是 AI，無法做醫療判斷。']],
  [/長高|變高|長不高/, ['成長期想長高，重點是充足睡眠、足夠的蛋白質與鈣質，以及規律的跳躍類運動，例如跳繩或籃球。若擔心生長狀況，建議諮詢兒科醫師。']],
  [/減肥|變瘦|瘦一點|減重|減脂/, [
    '減脂建議每週約減 0.5 公斤：先戒含糖飲料、減少油炸，每天累積 30 分鐘運動。不建議不吃正餐。',
    '從最容易的開始：飲料改無糖、晚餐減少三分之一的澱粉、每天快走 20 分鐘。']],
  [/晚餐|晚飯|吃什麼|要吃|午餐/, [
    '可以用「一拳飯、一掌肉、兩拳蔬菜」的比例來配餐，例如糙米飯、烤魚和炒青菜，再加一碗清湯。',
    '這一餐建議蔬菜佔一半，蛋白質選魚、雞肉或豆腐，澱粉一拳即可。']],
  [/早餐/, ['早餐建議包含蛋白質與全穀類，例如蛋餅配無糖豆漿，或全麥吐司加蛋與牛奶。']],
  [/痠|酸痛|好累|疲勞/, ['運動後肌肉痠痛通常 1 到 3 天會緩解，可以休息、伸展並補充水分。若出現劇痛或腫脹，請就醫。']],
  [/跳繩/, ['跳繩可以分組進行：每組 50 到 100 次，休息 30 秒，重複 3 到 5 組，再依體能慢慢增加。']],
  [/表現|今天怎樣|今天如何|評分|分數|這週|這周|一週|一周/, [
    '最近運動和飲食都有持續記錄，這很重要。接下來可以把蔬菜量再提高一些。',
    '本週的達標天數比上週多，請維持目前的節奏。']],
  [/炸雞|雞排|薯條|鹽酥雞/, ['偶爾吃油炸食物沒關係，搭配蔬菜、避免含糖飲料；平常可以改選烤雞腿。']],
  [/珍奶|奶茶|飲料|可樂|汽水/, ['含糖飲料是常見的熱量來源。想喝時選無糖或微糖、小杯，並控制在每週一次以內。']],
  [/喝水|口渴|喝多少水/, ['一般建議每天喝水量約為體重（公斤）× 30 毫升，運動時要再多補充。']],
  [/睡|熬夜|晚睡|失眠/, ['成人建議每晚睡 7 到 9 小時，學齡兒童 9 到 12 小時。睡前一小時減少使用手機。']],
  [/運動|做什麼|要動|安排/, ['今天可以這樣安排：跳繩 3 組各 100 次、深蹲 3 組各 15 次、開合跳 30 次，結束後伸展 5 分鐘。']],
  [/蔬菜|青菜|挑食/, ['每餐蔬菜量建議至少一個拳頭大。可以從接受度高的開始，例如玉米、紅蘿蔔、高麗菜。']],
  [/零食|餅乾|糖果|洋芋片|甜點/, ['想吃點心時，可以先選水果、無糖優格或堅果，份量控制在一小份。']],
  [/謝謝|你好|嗨|哈囉|hi|hello/i, ['你好，有任何飲食、運動或作息的問題都可以問我。', '不客氣，記得每天記錄飲食與運動。']],
];
const GENERIC = [
  '均衡飲食、規律運動與充足睡眠是健康的基礎。你可以問我「晚餐怎麼吃」或「幫我安排運動」。',
  '可以再具體說明你的狀況嗎？例如今天吃了什麼、做了哪些運動。',
];

export function demoReply(text = '') {
  for (const [re, answers] of DEMO) if (re.test(text)) return pick(answers);
  return pick(GENERIC);
}
