// 用「分鐘」記錄的運動（不需要感測器）。MET = 運動強度，消耗大卡 ≈ MET × 體重(kg) × 小時
// MET 參考 2024 Compendium of Physical Activities 的常見值（估計）。
// impact: 'low' 低衝擊（適合長輩、關節不適）／'high' 高衝擊
export const ACTIVITIES = [
  { key: 'walk',      name: '散步',       emoji: '🚶', met: 3.0, impact: 'low',  words: ['散步', '走路', '走了'] },
  { key: 'brisk',     name: '快走',       emoji: '🚶‍♂️', met: 4.3, impact: 'low',  words: ['快走', '健走'] },
  { key: 'run',       name: '慢跑',       emoji: '🏃', met: 7.0, impact: 'high', words: ['慢跑', '跑步', '跑了'] },
  { key: 'bike',      name: '騎腳踏車',   emoji: '🚴', met: 6.0, impact: 'low',  words: ['騎腳踏車', '騎車', '單車', '飛輪'] },
  { key: 'swim',      name: '游泳',       emoji: '🏊', met: 6.0, impact: 'low',  words: ['游泳'] },
  { key: 'taichi',    name: '太極拳',     emoji: '🧘', met: 3.0, impact: 'low',  words: ['太極'] },
  { key: 'stretch',   name: '伸展／椅子操', emoji: '🪑', met: 2.3, impact: 'low',  words: ['伸展', '拉筋', '椅子操', '瑜珈', '瑜伽'] },
  { key: 'dance',     name: '跳舞／韻律操', emoji: '💃', met: 5.0, impact: 'low',  words: ['跳舞', '韻律', '土風舞', '有氧'] },
  { key: 'basketball',name: '籃球',       emoji: '🏀', met: 6.5, impact: 'high', words: ['籃球', '打球'] },
  { key: 'badminton', name: '羽球',       emoji: '🏸', met: 5.5, impact: 'high', words: ['羽球', '羽毛球'] },
  { key: 'weights',   name: '重量訓練',   emoji: '🏋️', met: 5.0, impact: 'low',  words: ['重訓', '重量訓練', '健身'] },
];
export const activityByKey = (k) => ACTIVITIES.find((a) => a.key === k);

// 消耗熱量（大卡），四捨五入到 1 位
export function activityKcal(a, minutes, weightKg = 60) {
  const act = typeof a === 'string' ? activityByKey(a) : a;
  if (!act) return 0;
  return Math.round(act.met * (Number(weightKg) || 60) * (minutes / 60) * 10) / 10;
}

// 一筆運動紀錄的顯示文字：感測器／次數型 → 「跳繩 200 次」，分鐘型 → 「散步 30 分鐘」
export function workoutLabel(w, byIdFn) {
  if (w.activity) { const a = activityByKey(w.activity); return `${a?.emoji || '🏃'} ${a?.name || '運動'} ${w.minutes} 分鐘`; }
  const ex = byIdFn?.(w.exerciseId);
  return `${ex?.emoji || '🏃'} ${ex?.name || '運動'} ${w.reps} 次${w.sets ? `（${w.sets} 組）` : ''}`;
}
