// 編號必須和 motion_chip.ino 的 EX 表一致（從 0 開始）
export const EXERCISES = [
  { id: 0, key: 'jump_rope',     name: '跳繩',     emoji: '🪢', kcalPerRep: 0.1,  where: '手腕', goal: 200, avgGapMs: 450 },
  { id: 1, key: 'jumping_jack',  name: '開合跳',   emoji: '🤸', kcalPerRep: 0.2,  where: '手腕', goal: 50,  avgGapMs: 800 },
  { id: 2, key: 'squat',         name: '深蹲',     emoji: '🦵', kcalPerRep: 0.32, where: '腰間（褲頭）', goal: 20,  avgGapMs: 1800 },
  { id: 3, key: 'dumbbell_curl', name: '啞鈴彎舉', emoji: '💪', kcalPerRep: 0.25, where: '啞鈴上', goal: 20,  avgGapMs: 1600 },
  { id: 4, key: 'sit_up',        name: '仰臥起坐', emoji: '🧘', kcalPerRep: 0.3,  where: '胸前', goal: 20,  avgGapMs: 2200 },
];
export const byId = (id) => EXERCISES.find((e) => e.id === Number(id));
