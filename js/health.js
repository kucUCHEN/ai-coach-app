// 健康計算：BMI、兒童 BMI 判讀、每日熱量、今日評分。
// 這裡全部是「純函式」：只用傳進來的資料算出答案，不讀寫 localStorage、不碰畫面。
import { EXERCISES, byId } from './sensor/exercises.js';
import { guessGroups } from './foods.js';

// ---------- BMI ----------
// BMI = 體重(公斤) ÷ 身高(公尺)²，回傳到小數第 1 位
export function calcBMI(weightKg, heightCm) {
  const w = Number(weightKg), hM = Number(heightCm) / 100;
  if (!(w > 0) || !(hM > 0)) return null;
  return Math.round((w / (hM * hM)) * 10) / 10;
}

// 兒童及青少年生長身體質量指數（BMI）建議值
// 來源：衛生福利部 102 年 6 月 11 日公布（國民健康署沿用），依陳偉德、張美惠醫師 2010 年研究制定。
// 每一列：[年齡, 過輕 BMI<, 過重 BMI≥, 肥胖 BMI≥]；正常範圍 = 過輕值 ≤ BMI < 過重值
// 表格是半歲一格，從 2 歲到 17.5 歲。
const CHILD_BMI = {
  M: [
    [2.0, 14.2, 17.4, 18.3], [2.5, 13.9, 17.2, 18.0], [3.0, 13.7, 17.0, 17.8], [3.5, 13.6, 16.8, 17.7],
    [4.0, 13.4, 16.7, 17.6], [4.5, 13.3, 16.7, 17.6], [5.0, 13.3, 16.7, 17.7], [5.5, 13.4, 16.7, 18.0],
    [6.0, 13.5, 16.9, 18.5], [6.5, 13.6, 17.3, 19.2], [7.0, 13.8, 17.9, 20.3], [7.5, 14.0, 18.6, 21.2],
    [8.0, 14.1, 19.0, 21.6], [8.5, 14.2, 19.3, 22.0], [9.0, 14.3, 19.5, 22.3], [9.5, 14.4, 19.7, 22.5],
    [10.0, 14.5, 20.0, 22.7], [10.5, 14.6, 20.3, 22.9], [11.0, 14.8, 20.7, 23.2], [11.5, 15.0, 21.0, 23.5],
    [12.0, 15.2, 21.3, 23.9], [12.5, 15.4, 21.5, 24.2], [13.0, 15.7, 21.9, 24.5], [13.5, 16.0, 22.2, 24.8],
    [14.0, 16.3, 22.5, 25.0], [14.5, 16.6, 22.7, 25.2], [15.0, 16.9, 22.9, 25.4], [15.5, 17.2, 23.1, 25.5],
    [16.0, 17.4, 23.3, 25.6], [16.5, 17.6, 23.4, 25.6], [17.0, 17.8, 23.5, 25.6], [17.5, 18.0, 23.6, 25.6],
  ],
  F: [
    [2.0, 13.7, 17.2, 18.1], [2.5, 13.6, 17.0, 17.9], [3.0, 13.5, 16.9, 17.8], [3.5, 13.3, 16.8, 17.8],
    [4.0, 13.2, 16.8, 17.9], [4.5, 13.1, 16.9, 18.0], [5.0, 13.1, 17.0, 18.1], [5.5, 13.1, 17.0, 18.3],
    [6.0, 13.1, 17.2, 18.8], [6.5, 13.2, 17.5, 19.2], [7.0, 13.4, 17.7, 19.6], [7.5, 13.7, 18.0, 20.3],
    [8.0, 13.8, 18.4, 20.7], [8.5, 13.9, 18.8, 21.0], [9.0, 14.0, 19.1, 21.3], [9.5, 14.1, 19.3, 21.6],
    [10.0, 14.3, 19.7, 22.0], [10.5, 14.4, 20.1, 22.3], [11.0, 14.7, 20.5, 22.7], [11.5, 14.9, 20.9, 23.1],
    [12.0, 15.2, 21.3, 23.5], [12.5, 15.4, 21.6, 23.9], [13.0, 15.7, 21.9, 24.3], [13.5, 16.0, 22.2, 24.6],
    [14.0, 16.3, 22.5, 24.9], [14.5, 16.5, 22.7, 25.1], [15.0, 16.7, 22.7, 25.2], [15.5, 16.9, 22.7, 25.3],
    [16.0, 17.1, 22.7, 25.3], [16.5, 17.2, 22.7, 25.3], [17.0, 17.3, 22.7, 25.3], [17.5, 17.3, 22.7, 25.3],
  ],
};
// 18 歲以上：成人標準（國健署）
const ADULT_BMI = [18.5, 24, 27];
// 65 歲以上：國健署建議長者 BMI 維持在 22–27 之間較合適（過瘦風險較高）；肥胖切點沿用 30
const SENIOR_BMI = [22, 27, 30];

// 依年齡、性別找出這個人的切點 {under, over, obese, source}
// age 可以有小數（例如 10.5 歲）；只填整歲時就用整歲那一列。
export function bmiCutoffs(age, sex) {
  const a = Number(age);
  if (a >= 65) return { under: SENIOR_BMI[0], over: SENIOR_BMI[1], obese: SENIOR_BMI[2], source: 'senior' };
  if (a >= 18) return { under: ADULT_BMI[0], over: ADULT_BMI[1], obese: ADULT_BMI[2], source: 'adult' };
  const table = CHILD_BMI[sex === 'F' ? 'F' : 'M'];
  const half = Math.max(2, Math.floor((a || 2) * 2) / 2); // 往下取到半歲，最小 2 歲
  const row = table.find((r) => r[0] === half) || table[table.length - 1];
  return { under: row[1], over: row[2], obese: row[3], source: 'child' };
}

// BMI 判讀：回傳 {level:'under'|'normal'|'over'|'obese', label, color, cut}
export function bmiLevel(bmi, age, sex) {
  if (bmi == null) return null;
  const cut = bmiCutoffs(age, sex);
  let level = 'normal';
  if (bmi < cut.under) level = 'under';
  else if (bmi >= cut.obese) level = 'obese';
  else if (bmi >= cut.over) level = 'over';
  const map = {
    under:  { label: '過輕', color: 'blue' },
    normal: { label: '正常', color: 'green' },
    over:   { label: '過重', color: 'orange' },
    obese:  { label: '肥胖', color: 'red' },
  };
  return { level, ...map[level], cut };
}

// ---------- 每日熱量 ----------
// 基礎代謝率 BMR（Mifflin-St Jeor 公式）。原本是給大人用的，
// 小朋友用它算出來是「大約」的數字，畫面上要寫「大約」。
export function calcBMR({ weightKg, heightCm, age, sex }) {
  const w = Number(weightKg), hc = Number(heightCm), a = Number(age);
  if (!(w > 0 && hc > 0 && a > 0)) return null;
  const base = 10 * w + 6.25 * hc - 5 * a;
  return Math.round(sex === 'F' ? base - 161 : base + 5);
}

// 活動係數
export const ACTIVITY = {
  low:  { factor: 1.3, label: '低',   hint: '大多時間坐著，很少運動' },
  mid:  { factor: 1.5, label: '中等', hint: '常走路，或每週運動 1–3 次' },
  high: { factor: 1.7, label: '高',   hint: '每週運動 4 次以上，或工作需要勞動' },
};
export const GOALS = {
  keep: { label: '維持健康', adjust: 0 },
  lose: { label: '減脂',     adjust: -0.10 },
  gain: { label: '增肌',     adjust: +0.10 },
};

// ---------- 年齡模式 ----------
// child：未滿 13 歲（兒童模式：不扣熱量、不顯示剩餘熱量、用簡單說法）
// teen：13–17 歲（不提供減脂；增肌只小幅增加）
// adult：18–64 歲；senior：65 歲以上
export function ageMode(p) {
  const a = Number(p?.age);
  if (!a) return 'adult';
  if (a < 13) return 'child';
  if (a < 18) return 'teen';
  if (a >= 65) return 'senior';
  return 'adult';
}
export const isMinor = (p) => Number(p?.age) > 0 && Number(p.age) < 18;

// 這個人可以選的目標（未成年不能選減脂；兒童只有維持／健康成長）
export function goalsFor(p) {
  const m = ageMode(p);
  if (m === 'child') return { keep: { label: '健康成長', adjust: 0 } };
  if (m === 'teen') return { keep: { label: '健康成長', adjust: 0 }, gain: { label: '增肌（成長期）', adjust: +0.05 } };
  return GOALS;
}
// 實際生效的目標（舊資料裡未成年若選了減脂，一律當成維持）
export function effectiveGoal(p) {
  const g = goalsFor(p);
  return g[p?.goal] ? p.goal : 'keep';
}

// 減脂速度（只給成人）：gentle 溫和（TDEE −10%）、standard 標準（每週約 0.5 公斤，約 −550 大卡）
export const PACES = {
  gentle:   { label: '溫和', hint: '每天少吃約 10%，比較容易持續' },
  standard: { label: '標準', hint: '每週約 0.5 公斤（每天約少 550 大卡）' },
};

// 慢性病／注意事項（給教練與建議用）
export const CONDITIONS = {
  hypertension: { label: '高血壓', emoji: '🩺' },
  diabetes:     { label: '血糖偏高／糖尿病', emoji: '🍬' },
  joint:        { label: '膝蓋／關節不適', emoji: '🦵' },
};

// 每日總熱量消耗 TDEE = BMR × 活動係數
export function calcTDEE(profile) {
  const bmr = calcBMR(profile || {});
  if (!bmr) return null;
  const f = (ACTIVITY[profile.activity] || ACTIVITY.mid).factor;
  return Math.round(bmr * f);
}

// 依目標調整的「每天建議吃多少」：減脂 −10%、增肌 +10%，四捨五入到 10 大卡。
// 小朋友正在長大，不可以大幅節食；−10% 已經是很溫和的量（每週只會減一點點）。
export function dailyTarget(profile) {
  const tdee = calcTDEE(profile);
  if (!tdee) return null;
  const goal = effectiveGoal(profile);
  let t = tdee * (1 + (goalsFor(profile)[goal]?.adjust || 0));
  if (goal === 'lose' && profile.pace === 'standard') {
    // 每週約 0.5 公斤 ≈ 每天少 550 大卡，但不低於基礎代謝，也不低於 1200（女）／1500（男）
    const floor = Math.max(calcBMR(profile) || 0, profile.sex === 'F' ? 1200 : 1500);
    t = Math.max(tdee - 550, floor);
  }
  return Math.round(t / 10) * 10;
}

// 每日蛋白質目標（克）
export function proteinTarget(p) {
  const kg = Number(p?.weightKg) || 0;
  const m = ageMode(p), goal = effectiveGoal(p);
  const perKg = m === 'child' ? 1.0 : m === 'teen' ? (goal === 'gain' ? 1.4 : 1.1) : m === 'senior' ? 1.1 : goal === 'gain' ? 1.6 : 1.2;
  return { grams: Math.round(kg * perKg), perKg };
}

// ---------- 今日評分 ----------
export const PASS_SCORE = 70;

export const sumMealKcal = (day) => (day?.meals || []).reduce((s, m) => s + (Number(m.kcal) || 0), 0);
export const sumWorkoutKcal = (day) => (day?.workouts || []).reduce((s, w) => s + (Number(w.kcal) || 0), 0);
export const workoutMinutes = (w) => Number(w.minutes) || Math.round((Number(w.reps) || 0) / 20); // 次數型約 20 次 ≈ 1 分鐘

// 這個時間點，一天的飲食應該吃到幾成（過去的日子 = 1）
function expectedShare(date, now = new Date()) {
  const isToday = !date || date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (!isToday) return 1;
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < 10) return 0.3;
  if (h < 14) return 0.6;
  if (h < 19) return 0.75;
  return 1;
}

// 飲食分（0–100）：
// - 吃太多：超過目標 10% 以後每多 1% 扣分（減脂目標扣得比較重）
// - 吃太少：只和「這個時間應該吃到的量」比，所以中午不會因為還沒吃晚餐被扣分
// 沒有記錄 → null（不計分）
export function dietScore(day, target, profile) {
  if (!day?.meals?.length || !target) return null;
  const eaten = sumMealKcal(day);
  const goal = profile ? effectiveGoal(profile) : 'keep';
  const overPct = eaten / target - 1;
  const overW = goal === 'lose' ? 4 : goal === 'gain' ? 1.5 : 2.5;
  const over = Math.max(0, overPct - 0.05) * 100 * overW;
  const share = expectedShare(day.date);
  const underPct = 1 - eaten / (target * share);
  const underW = goal === 'gain' ? 2.5 : 1.5;
  const under = share < 1 ? Math.max(0, underPct - 0.35) * 100 * underW : Math.max(0, underPct - 0.15) * 100 * underW;
  // 餐盤均衡：五大類（全穀、蔬菜、水果、豆魚蛋肉、乳品）每缺一類扣分；白天扣得少，一天結束時扣得多
  const got = new Set(day.meals.flatMap((m) => m.groups || guessGroups(m.name)));
  const missing = MAIN_GROUPS.filter((g) => !got.has(g)).length;
  const balance = missing * (share < 1 ? 3 : 5);
  return clamp(Math.round(100 - over - under - balance));
}
export const MAIN_GROUPS = ['全穀', '蔬菜', '水果', '豆魚蛋肉', '乳品'];

// 每天的運動目標：一共約 30 分鐘（次數型以 20 次 ≈ 1 分鐘換算），至少 1 項
export function exerciseGoal(p) {
  const m = ageMode(p);
  return { minutes: m === 'child' || m === 'teen' ? 60 : 30 };   // 兒少：每天 60 分鐘（WHO 建議）
}
export function exerciseScore(day, profile) {
  const list = day?.workouts || [];
  if (!list.length) return 0;
  const mins = list.reduce((s, w) => s + workoutMinutes(w), 0);
  return clamp(Math.round(30 + 70 * Math.min(1, mins / exerciseGoal(profile).minutes)));
}

// 總分：飲食、運動各占一半（飲食沒記錄就當 0 分）
export function totalScore(diet, exercise) {
  return clamp(Math.round(((diet ?? 0) + (exercise ?? 0)) / 2));
}

// 一次算好今天全部分數
export function scoreDay(day, profile) {
  const target = profile ? dailyTarget(profile) : null;
  const diet = dietScore(day, target, profile);
  const exercise = exerciseScore(day, profile);
  const total = totalScore(diet, exercise);
  const eaten = sumMealKcal(day);
  const minutes = (day?.workouts || []).reduce((s, w) => s + workoutMinutes(w), 0);
  return {
    diet, exercise, total, passed: total >= PASS_SCORE, target, eaten, burned: sumWorkoutKcal(day), minutes,
    over: target ? eaten > target * 1.1 : false,                       // 吃超過
    under: target ? eaten < target * expectedShare(day?.date) * 0.65 : false, // 到這個時間吃得偏少
  };
}

// 分數 → 顏色名稱（對應 app.css 的 --green / --orange / --red）
export const scoreColor = (s) => (s == null ? 'muted' : s >= PASS_SCORE ? 'green' : s >= 50 ? 'orange' : 'red');

// 吃的 ⇄ 動的：kcal 要做幾下這個運動才消耗得掉
export function repsToBurn(kcal, exerciseId = 0) {
  const ex = byId(exerciseId) || EXERCISES[0];
  return Math.round(kcal / ex.kcalPerRep);
}

function clamp(n) { return Math.max(0, Math.min(100, n)); }
