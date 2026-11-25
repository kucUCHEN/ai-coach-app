// 健康計算：BMI、兒童 BMI 判讀、每日熱量、今日評分。
// 這裡全部是「純函式」：只用傳進來的資料算出答案，不讀寫 localStorage、不碰畫面。
import { EXERCISES, byId } from './sensor/exercises.js';

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

// 依年齡、性別找出這個人的切點 {under, over, obese, source}
// age 可以有小數（例如 10.5 歲）；只填整歲時就用整歲那一列。
export function bmiCutoffs(age, sex) {
  const a = Number(age);
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

// 活動係數：平常很少動 / 每天有下課玩、走路 / 每天都有運動或校隊
export const ACTIVITY = {
  low:  { factor: 1.3, label: '很少動', hint: '大多坐著，很少跑跳' },
  mid:  { factor: 1.5, label: '普通',   hint: '下課會玩、上學走路' },
  high: { factor: 1.7, label: '很愛動', hint: '每天運動或參加校隊' },
};
export const GOALS = {
  keep: { label: '維持健康', emoji: '🙂', adjust: 0 },
  lose: { label: '減脂',     emoji: '🔥', adjust: -0.10 },
  gain: { label: '增肌',     emoji: '💪', adjust: +0.10 },
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
  const adj = (GOALS[profile.goal] || GOALS.keep).adjust;
  return Math.round((tdee * (1 + adj)) / 10) * 10;
}

// ---------- 今日評分 ----------
export const PASS_SCORE = 70;
// 每天的運動目標：做 2 次運動、而且一共消耗 40 大卡（約跳繩 400 下）
export const EXERCISE_GOAL = { sessions: 2, kcal: 40 };

export const sumMealKcal = (day) => (day?.meals || []).reduce((s, m) => s + (Number(m.kcal) || 0), 0);
export const sumWorkoutKcal = (day) => (day?.workouts || []).reduce((s, w) => s + (Number(w.kcal) || 0), 0);

// 飲食分（0–100）：吃的熱量越接近目標越高。
// 差距 10% 以內都算 100 分，之後每多差 1% 扣 2 分。沒有記錄 → null（不計分）。
export function dietScore(day, target) {
  if (!day?.meals?.length || !target) return null;
  const ratio = sumMealKcal(day) / target;
  const off = Math.max(0, Math.abs(1 - ratio) - 0.10);
  return clamp(Math.round(100 - off * 200));
}

// 運動分（0–100）：一半看「做了幾次運動」，一半看「消耗多少熱量」。
export function exerciseScore(day, goal = EXERCISE_GOAL) {
  const list = day?.workouts || [];
  if (!list.length) return 0;
  const a = Math.min(1, list.length / goal.sessions);
  const b = Math.min(1, sumWorkoutKcal(day) / goal.kcal);
  return clamp(Math.round(50 * a + 50 * b));
}

// 總分：飲食、運動各占一半（飲食沒記錄就當 0 分）
export function totalScore(diet, exercise) {
  return clamp(Math.round(((diet ?? 0) + (exercise ?? 0)) / 2));
}

// 一次算好今天全部分數
export function scoreDay(day, profile) {
  const target = profile ? dailyTarget(profile) : null;
  const diet = dietScore(day, target);
  const exercise = exerciseScore(day);
  const total = totalScore(diet, exercise);
  return { diet, exercise, total, passed: total >= PASS_SCORE, target, eaten: sumMealKcal(day), burned: sumWorkoutKcal(day) };
}

// 分數 → 顏色名稱（對應 app.css 的 --green / --orange / --red）
export const scoreColor = (s) => (s == null ? 'muted' : s >= PASS_SCORE ? 'green' : s >= 50 ? 'orange' : 'red');

// 吃的 ⇄ 動的：kcal 要做幾下這個運動才消耗得掉
export function repsToBurn(kcal, exerciseId = 0) {
  const ex = byId(exerciseId) || EXERCISES[0];
  return Math.round(kcal / ex.kcalPerRep);
}

function clamp(n) { return Math.max(0, Math.min(100, n)); }
