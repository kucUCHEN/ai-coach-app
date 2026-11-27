// 所有資料只存在這支手機的瀏覽器（localStorage），不會上傳。
const PREFIX = 'aicoach.';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* 私密模式可能失敗 */ }
  emit(key);
}

const listeners = new Set();
function emit(key) { listeners.forEach((fn) => fn(key)); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---- 個人資料 ----
// { name, age, sex:'M'|'F', heightCm, weightKg, goal:'keep'|'lose'|'gain', activity:'low'|'mid'|'high' }
export const getProfile = () => read('profile', null);
export const setProfile = (p) => write('profile', p);

// ---- 每日紀錄 ----
// day = { date, weightKg?, meals:[{id,time,name,kcal,items?,photo?:false}], workouts:[{id,time,exerciseId,reps,quality,stars,kcal}], water? }
export function getDay(date = todayKey()) {
  return read('day.' + date, { date, meals: [], workouts: [] });
}
export function setDay(day) { write('day.' + day.date, day); }
export function updateDay(fn, date = todayKey()) {
  const d = getDay(date); fn(d); setDay(d); return d;
}
export function listDays() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX + 'day.')) out.push(k.slice((PREFIX + 'day.').length));
  }
  return out.sort();
}

// ---- 體重歷史 [{date, kg}] ----
export const getWeights = () => read('weights', []);
export function addWeight(kg, date = todayKey()) {
  const w = getWeights().filter((x) => x.date !== date);
  w.push({ date, kg }); w.sort((a, b) => a.date.localeCompare(b.date));
  write('weights', w);
}

// ---- 點數與獎勵 ----
// { points, reward:{name, cost}, awarded:{ 'YYYY-MM-DD': true } }
// 沒自訂過（reward.custom 不是 true）時，獎勵依年齡給預設值
export function defaultReward(p = getProfile()) {
  const a = Number(p?.age) || 0;
  const name = a && a < 18 ? '一顆新籃球' : a >= 65 ? '一次按摩' : '一雙新運動鞋';
  return { name, cost: 5, custom: false };
}
export function getRewards() {
  const r = read('rewards', { points: 0, awarded: {} });
  r.awarded ||= {}; r.points = Number(r.points) || 0;
  if (!r.reward?.custom) r.reward = { ...defaultReward(), cost: Number(r.reward?.cost) || 5 };
  return r;
}
export const setRewards = (r) => write('rewards', r);

// ---- AI 教練對話 [{role, content, time}] ----
export const getChat = () => read('chat', []);
export const setChat = (c) => write('chat', c.slice(-60));

// ---- 設定 ----
// 提醒時間：未成年沒有「07:00 量體重」，改成吃早餐／午餐／運動／早點睡（時間相同，顯示文字依年齡）
export const getSettings = () => read('settings', { remindTimes: ['07:00', '12:00', '17:30', '21:00'], fontScale: 1 });

// ---- 管理密碼（與 AI 連線頁同一組：teacher.pass = {salt, hash}，hash = SHA-256(salt + ':' + pw)；沒設過時為 0000）----
export async function verifyAdmin(pw) {
  pw = String(pw ?? '');
  const pass = read('teacher.pass', null);
  if (!pass?.salt || !pass?.hash) return pw === '0000';
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pass.salt + ':' + pw));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    let diff = hex.length ^ pass.hash.length;
    for (let i = 0; i < Math.min(hex.length, pass.hash.length); i++) diff |= hex.charCodeAt(i) ^ pass.hash.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}
export const setSettings = (s) => write('settings', s);

// ---- 通用（給 AI 層、老師設定用）----
export const getItem = read;
export const setItem = write;
export function removeItem(key) { try { localStorage.removeItem(PREFIX + key); } catch {} emit(key); }

// 清除全部資料（設定頁「重新開始」用）
export function clearAll({ keepTeacher = true } = {}) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX) && !(keepTeacher && k.startsWith(PREFIX + 'teacher.'))) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
  emit('*');
}
