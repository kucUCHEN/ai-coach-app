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

// 最近一次呼叫的狀態：{ demo:boolean, reason?:string }，給頁面顯示「示範模式」用
let last = { demo: false };
export const lastStatus = () => last;

const REASON = {
  nokey: '還沒有設定 AI 的鑰匙（key）',
  offline: '手機沒有連上網路',
  network: '連不上 AI 公司（網路或瀏覽器擋住了）',
  auth: 'AI 的鑰匙（key）不對或已經作廢',
  quota: 'AI 的額度用完了或請求太多次',
  server: 'AI 公司那邊暫時有問題',
  bad: 'AI 公司看不懂這次的請求（模型名稱或格式不對）',
  refusal: 'AI 不想回答這個問題',
  empty: 'AI 沒有回答',
  abort: '已經取消',
};
export function reasonText(kind) { return REASON[kind] || '發生了小問題'; }

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
const GOAL = { keep: '保持現在的體重', lose: '慢慢減一點體重', gain: '長高長壯' };
const EX = ['跳繩', '開合跳', '深蹲', '啞鈴彎舉', '仰臥起坐'];

export function summary() {
  const p = store.getProfile();
  const day = store.getDay();
  const lines = [];
  if (p && p.heightCm && p.weightKg) {
    const bmi = bmiOf(p);
    const st = statusOf(p);
    lines.push(`孩子資料：${p.age ? p.age + '歲' : '年齡不知道'}、${p.sex === 'F' ? '女生' : p.sex === 'M' ? '男生' : '性別不知道'}、身高 ${p.heightCm} 公分、體重 ${p.weightKg} 公斤、BMI ${bmi ?? '?'}${st ? '（' + st + '）' : ''}。`);
    if (p.goal) lines.push(`目標：${GOAL[p.goal] || p.goal}。`);
    const t = kcalTarget(p);
    if (t) lines.push(`建議每天吃約 ${t} 大卡。`);
  } else {
    lines.push('孩子還沒有填身高體重。可以請他到「身體」頁填，或直接跟你說。');
  }
  const meals = day.meals || [];
  const eaten = meals.reduce((s, m) => s + (Number(m.kcal) || 0), 0);
  lines.push(meals.length ? `今天吃了：${meals.map((m) => m.name).join('、')}，共約 ${Math.round(eaten)} 大卡。` : '今天還沒有記錄吃了什麼。');
  const w = day.workouts || [];
  lines.push(w.length ? `今天運動：${w.map((x) => `${EX[x.exerciseId] || '運動'} ${x.reps || 0} 下`).join('、')}。` : '今天還沒有運動。');
  return lines.join('\n');
}

function systemPrompt() {
  return [
    '你是「AI健康教練」，住在小朋友手機裡的健康教練，對象是台灣的國小學生。',
    '個性：像媽媽一樣會叮嚀（例如「炸雞今天吃過囉，明天換烤雞腿好不好？」），也很會鼓勵、稱讚，說話溫暖有趣。',
    '你是電腦程式，不是真人；如果孩子問，要老實說你是 AI。',
    '規則：',
    '1. 一律用繁體中文、國小生聽得懂的簡單句子，每次只回答 2 到 4 句，可以用 1～2 個 emoji。',
    '2. 你不是醫生。身體不舒服、受傷、頭暈、肚子痛等，一定要叫他告訴爸媽或老師，必要時去看醫生。',
    '3. 不給節食、不吃飯、吃藥減肥的建議。小朋友正在長大，要吃飽、吃均衡；體重目標每週只建議改變一點點，主要靠多運動、少喝含糖飲料、少吃炸的。',
    '3b. 絕對不評論或嘲笑身材、外表，不用「胖」「瘦」「小胖子」等字眼形容孩子；叮嚀只針對食物和習慣（例如「飲料換成白開水」）。',
    '4. 不要問、也不要記下真實姓名、住址、學校、電話等個人資料；如果他說了，提醒他不用告訴你這些。',
    '5. 建議要具體可做到（例如「晚餐多一份青菜」「跳繩 100 下」），多稱讚做到的事。',
    '6. 不要談和健康、運動、飲食、生活習慣無關的危險話題。',
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
  const c = getConfig();
  // 只送最近 12 句，並確保第一句是 user（Claude 要求）
  let msgs = messages.filter((m) => m.content).slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) msgs = [{ role: 'user', content: '嗨，教練！' }];
  try {
    const text = await PROVIDERS[c.provider].call({
      key: c.keys[c.provider], model: c.model, system: systemPrompt(), messages: msgs, maxTokens: 600, signal,
    });
    last = { demo: false };
    return text.trim();
  } catch (e) {
    const kind = friendlyKind(e, signal);
    last = { demo: true, reason: reasonText(kind), kind };
    if (kind === 'abort') return '';
    return demoReply(lastText) + `\n（這是示範回答：${reasonText(kind)}）`;
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
  advice: '這個便當有肉、有菜、有蛋，很不錯喔！👍 飯可以少吃幾口，青菜多吃一點，就更棒了。',
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
    advice: String(obj.advice || '吃得均衡最重要喔！').slice(0, 200),
  };
}

export async function estimateFood(dataUrl, { signal } = {}) {
  if (isDemo()) {
    last = { demo: true, reason: reasonText(demoReasonKind()) };
    return { ...structuredClone(DEMO_FOOD), demo: true, reason: last.reason };
  }
  const c = getConfig();
  const prompt = [
    '這是一位國小學生吃的食物照片。請估計每樣食物的名稱（繁體中文）、大約幾克、大約幾大卡，再加總熱量，',
    '並用 1～2 句像媽媽一樣溫柔的話給建議（例如炸的少吃、多吃青菜），可以用 emoji。',
    '只回 JSON，不要其他文字，格式：{"items":[{"name":"白飯","grams":200,"kcal":280}],"totalKcal":280,"advice":"..."}',
    '如果照片裡沒有食物，items 給空陣列，advice 請他再拍一次食物。',
    '只看食物；照片裡如果有人臉、名字或其他個人資料，不要描述、不要寫出來。不要評論身材。',
  ].join('\n');
  try {
    const text = await PROVIDERS[c.provider].call({
      key: c.keys[c.provider], model: c.model,
      system: '你是幫國小學生估算食物熱量的 AI 健康教練。你不是醫生，估計值只是大約。只輸出 JSON。',
      messages: [{ role: 'user', content: [{ type: 'image', dataUrl }, { type: 'text', text: prompt }] }],
      schema: FOOD_SCHEMA, maxTokens: 800, signal,
    });
    const r = parseFoodJson(text);
    if (!r) throw Object.assign(new Error('parse'), { kind: 'empty' });
    last = { demo: false };
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
    return pick([
      '嗨！我是你的 AI 健康教練 🤖（我是電腦程式，不是真人喔）先告訴我你的身高和體重好嗎？例如「我身高145 體重38」。',
      '你好呀！我是住在你手機裡的 AI 教練，是電腦程式，不是真人 😊 跟我說說你的身高體重，我就能幫你安排喔！',
    ]);
  }
  if (Number.isFinite(total) && total >= 80) {
    return pick([
      `今天得了 ${Math.round(total)} 分！太厲害了，教練以你為榮 🎉`,
      `哇～今天 ${Math.round(total)} 分，吃得好又有運動，給你一個大大的讚 👍`,
    ]);
  }
  if (/炸雞|雞排|鹽酥雞|炸|薯條|漢堡/.test(names)) {
    return pick([
      '炸雞今天吃過囉！🍗 明天換成烤雞腿或滷的好不好？',
      '炸的東西好好吃對不對？可是油好多喔～今天多跳繩 100 下把它消掉吧！🪢',
      '教練看到你吃了炸的 👀 下一餐要多吃青菜，跟教練打勾勾！',
    ]);
  }
  if (/珍奶|珍珠|奶茶|手搖|可樂|汽水|含糖|飲料/.test(names)) {
    return pick([
      '又喝珍奶了喔？一杯差不多是一碗飯的熱量耶！🧋 下次改喝白開水好嗎？',
      '甜甜的飲料糖好多，牙齒和身體都會累喔～多喝白開水，身體會謝謝你 💧',
    ]);
  }
  if (target && eaten > target * 1.15) {
    return pick([
      `今天吃了大約 ${Math.round(eaten)} 大卡，有點超過囉～晚上就不要再吃宵夜了 🌙`,
      '今天吃得有點多喔！去跳跳繩、動一動，肚子會比較舒服 😊',
    ]);
  }
  if (reps === 0) {
    if (hour >= 16) return pick([
      '今天還沒運動喔！現在去跳繩 100 下，教練幫你數 🪢',
      '動一動時間到了！做 20 下深蹲就好，很快就做完了 💪',
      '一整天都坐著嗎？起來做 30 下開合跳，讓身體醒過來吧 🤸',
    ]);
    if (hour >= 11) return pick([
      '下午好！放學後記得動一動，跳繩或開合跳都可以喔 😄',
      '今天還沒運動，等一下找個時間做 20 下深蹲吧 💪',
      '記得多喝水喔！喝完水再去動一動 💧',
    ]);
    return pick([
      '早安！今天也要記得運動和多喝水喔 ☀️',
      '新的一天開始囉！今天想做什麼運動呢？跳繩還是開合跳？😄',
      '記得吃早餐喔！有吃早餐上課才有精神 🍳',
    ]);
  }
  if (meals.length === 0 && hour >= 9) {
    return pick([
      `今天已經運動 ${reps} 下了，好棒！記得拍照告訴我你吃了什麼喔 📸`,
      '有運動很棒！吃飯的時候也拍給教練看看吧 🍱',
    ]);
  }
  return pick([
    `今天運動了 ${reps} 下，吃得也不錯，繼續保持喔！🌟`,
    '你今天表現很好！教練一直在幫你加油 💪',
    '做得好！每天進步一點點，就會越來越健康 😊',
  ]);
}

// ---------- 示範模式的關鍵字回答 ----------
const DEMO = [
  [/肚子痛|頭痛|頭暈|不舒服|生病|發燒|受傷|流血/, ['身體不舒服要馬上告訴爸爸媽媽或老師喔！教練不是醫生，需要的話要去看醫生 🏥 今天先好好休息。']],
  [/長高|變高|身高|長不高/, [
    '想長高有三個祕訣：睡飽（晚上 9 點半前睡）、喝牛奶吃蛋豆魚肉、多跳繩和打籃球！🏀 每天跳繩 200 下，骨頭會越來越強壯喔。',
    '長高靠睡覺、吃飯和運動喔！今天晚上早點睡，教練跟你約定 😴']],
  [/減肥|變瘦|太胖|瘦一點|減重|小胖/, [
    '不能不吃飯喔！你正在長大，要吃飽。把含糖飲料換成白開水、少吃炸的，再每天運動 30 分鐘，身體就會越來越有力氣 👍 想知道適合的體重，可以請爸媽帶你問醫生。',
    '教練不建議餓肚子喔！把飲料換成白開水、每天跳繩，身體會越來越健康 😊']],
  [/晚餐|晚飯|吃什麼|要吃/, [
    '晚餐可以吃「一拳飯、一掌肉、兩拳青菜」🥦 例如白飯、烤魚和炒青菜，再喝一碗湯，又營養又不會太多喔！',
    '今天晚餐多吃一份青菜好不好？青菜會幫肚子大掃除喔 🥬']],
  [/早餐/, ['早餐很重要喔！可以吃蛋餅配無糖豆漿，或是吐司加蛋和牛奶 🍳 有吃早餐上課才有精神！']],
  [/手痠|手酸|腳痠|腳酸|肌肉痠|好累|酸痛|痠痛/, [
    '手痠是肌肉在變強壯的訊號喔 💪 今天先休息一下，轉轉手腕、拉拉筋。如果很痛或腫起來，一定要告訴爸爸媽媽喔！',
    '辛苦了！痠痠的時候先休息、多喝水。很痛的話要跟大人說，教練不是醫生喔 🙏']],
  [/跳繩/, ['跳繩超棒的！可以先跳 50 下休息一下，再跳 50 下 🪢 慢慢加到每天 200 下，你一定做得到！']],
  [/表現|今天怎樣|今天如何|評分|分數|這週|這周|一週|一周/, [
    '你最近很認真喔！有運動、有記錄吃東西，教練都看到了 🌟 再多喝一點水就更完美了！',
    '這週你進步了！記得每天運動一下，週末就能集點換獎勵囉 🎁']],
  [/炸雞|雞排|薯條|鹽酥雞/, ['想吃炸雞嗎？🍗 偶爾吃一次可以，吃的時候配青菜、不要配汽水；下次試試烤雞腿，一樣好吃喔～']],
  [/珍奶|奶茶|飲料|可樂|汽水/, ['一杯珍奶的糖好多好多喔 🧋 想喝的時候先喝一杯白開水，真的想喝就選微糖、小杯的，跟教練約定一週最多一次！']],
  [/喝水|口渴|喝多少水/, ['每天要喝大約 6～8 杯水喔 💧 下課就喝幾口，不要等到口渴才喝！']],
  [/睡|熬夜|晚睡/, ['睡飽才會長高、上課有精神喔 😴 晚上 9 點半前上床，睡前不要看手機！']],
  [/運動|做什麼|要動/, ['今天可以試試：跳繩 100 下、開合跳 30 下、深蹲 15 下 💪 做完記得喝水，教練幫你記錄！']],
  [/蔬菜|青菜|不想吃菜|挑食/, ['青菜是身體的清潔隊喔 🥦 先從你喜歡的開始，像玉米、紅蘿蔔，每餐吃一點點就好！']],
  [/零食|餅乾|糖果|洋芋片|甜點/, ['零食可以偷偷吃一點點，但不要邊看電視邊吃喔 🍪 肚子餓的時候改吃水果或無糖優格更棒！']],
  [/謝謝|你好|嗨|哈囉|hi|hello/i, ['不客氣！教練一直都在這裡陪你 😊 有什麼想問的都可以跟我說喔！', '嗨～今天過得好嗎？有沒有運動呀？😄']],
];
const GENERIC = [
  '教練聽到了！每天吃得均衡、動一動、早點睡，就是最棒的健康祕訣喔 🌟',
  '好問題！你可以問我「怎麼長高」「晚餐吃什麼」，或告訴我今天做了什麼運動 😊',
  '你願意跟教練聊天，就是很好的開始！今天也要記得多喝水喔 💧',
];

export function demoReply(text = '') {
  for (const [re, answers] of DEMO) if (re.test(text)) return pick(answers);
  return pick(GENERIC);
}
