// 用一句話記錄：「我中午吃了雞腿便當和珍奶」「跳繩 200 下」「深蹲20次」
import { FOODS } from './foods.js';
import { EXERCISES } from './sensor/exercises.js';
import { updateDay } from './store.js';

const ALIAS = { '珍奶': '全糖珍奶', '珍珠奶茶': '全糖珍奶', '便當': '雞腿便當', '飯糰': '御飯糰', '蛋': '水煮蛋', '青菜': '燙青菜', '高麗菜': '炒高麗菜', '飯': '白飯' };
const EX_ALIAS = { '跳繩': 0, '開合跳': 1, '深蹲': 2, '啞鈴': 3, '彎舉': 3, '仰臥起坐': 4 };
const now = () => new Date().toTimeString().slice(0, 5);
const id = () => Date.now() + Math.random().toString(36).slice(2, 6);

export function parseLog(text) {
  const t = String(text || '');
  const workouts = [];
  for (const [name, exId] of Object.entries(EX_ALIAS)) {
    const m = new RegExp(name + '\\D{0,4}?(\\d{1,4})\\s*(下|次|個)').exec(t) || new RegExp('(\\d{1,4})\\s*(下|次|個)\\s*' + name).exec(t);
    if (m && !workouts.some((w) => w.exerciseId === exId)) workouts.push({ exerciseId: exId, reps: Number(m[1]) });
  }
  const foods = [];
  if (/吃|喝|早餐|午餐|晚餐|點心|宵夜/.test(t)) {
    let rest = t;
    const names = [...FOODS.map((f) => f.name), ...Object.keys(ALIAS)].sort((a, b) => b.length - a.length);
    for (const n of names) {
      if (!rest.includes(n)) continue;
      const f = FOODS.find((x) => x.name === (ALIAS[n] || n));
      if (f && !foods.includes(f)) foods.push(f);
      rest = rest.split(n).join('＿');
    }
  }
  return { foods, workouts };
}

// 寫進今天的紀錄，回傳一句確認文字（沒有東西時回傳空字串）
export function applyLog({ foods, workouts }) {
  const bits = [];
  if (foods.length) {
    const kcal = foods.reduce((s, f) => s + f.kcal, 0);
    updateDay((d) => d.meals.push({ id: id(), time: now(), photo: false, name: foods.map((f) => f.name).join('、'), kcal, groups: [...new Set(foods.map((f) => f.group))] }));
    bits.push(`${foods.map((f) => f.emoji + f.name).join('、')}（約 ${kcal} 大卡）`);
  }
  for (const w of workouts) {
    const ex = EXERCISES.find((e) => e.id === w.exerciseId);
    const kcal = Math.round(w.reps * ex.kcalPerRep * 10) / 10;
    updateDay((d) => d.workouts.push({ id: id(), time: now(), exerciseId: ex.id, reps: w.reps, quality: null, stars: 0, kcal, manual: true }));
    bits.push(`${ex.emoji} ${ex.name} ${w.reps} 次`);
  }
  return bits.length ? `✅ 幫你記下來了：${bits.join('、')}` : '';
}
