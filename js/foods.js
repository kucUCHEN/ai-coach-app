// 台灣小學生常見食物熱量表（一份的大約熱量，參考食品營養成分資料庫與常見包裝標示的估計值）
// group 是「我的餐盤」六大類；炸物、甜飲料、零食放在「點心」。
export const GROUPS = [
  { key: '全穀',     emoji: '🍚', color: 'orange' },
  { key: '蔬菜',     emoji: '🥦', color: 'green' },
  { key: '水果',     emoji: '🍎', color: 'red' },
  { key: '豆魚蛋肉', emoji: '🍗', color: 'purple' },
  { key: '乳品',     emoji: '🥛', color: 'blue' },
  { key: '點心',     emoji: '🍪', color: 'orange' },
];

export const FOODS = [
  // 全穀
  { name: '白飯',     emoji: '🍚', unit: '一碗',   kcal: 280, group: '全穀' },
  { name: '糙米飯',   emoji: '🍚', unit: '一碗',   kcal: 260, group: '全穀' },
  { name: '滷肉飯',   emoji: '🍛', unit: '一碗',   kcal: 450, group: '全穀' },
  { name: '雞腿便當', emoji: '🍱', unit: '一個',   kcal: 800, group: '全穀' },
  { name: '炒飯',     emoji: '🍳', unit: '一盤',   kcal: 650, group: '全穀' },
  { name: '水餃',     emoji: '🥟', unit: '10 顆',  kcal: 500, group: '全穀' },
  { name: '陽春麵',   emoji: '🍜', unit: '一碗',   kcal: 350, group: '全穀' },
  { name: '吐司',     emoji: '🍞', unit: '一片',   kcal: 90,  group: '全穀' },
  { name: '菠蘿麵包', emoji: '🥐', unit: '一個',   kcal: 350, group: '全穀' },
  { name: '饅頭',     emoji: '🥯', unit: '一個',   kcal: 280, group: '全穀' },
  { name: '御飯糰',   emoji: '🍙', unit: '一個',   kcal: 200, group: '全穀' },
  { name: '地瓜',     emoji: '🍠', unit: '一條',   kcal: 180, group: '全穀' },
  { name: '玉米',     emoji: '🌽', unit: '一根',   kcal: 150, group: '全穀' },
  // 蔬菜
  { name: '燙青菜',   emoji: '🥬', unit: '一盤',   kcal: 60,  group: '蔬菜' },
  { name: '炒高麗菜', emoji: '🥬', unit: '一盤',   kcal: 90,  group: '蔬菜' },
  { name: '花椰菜',   emoji: '🥦', unit: '一碗',   kcal: 40,  group: '蔬菜' },
  { name: '番茄',     emoji: '🍅', unit: '一顆',   kcal: 30,  group: '蔬菜' },
  { name: '紅蘿蔔',   emoji: '🥕', unit: '半碗',   kcal: 30,  group: '蔬菜' },
  // 水果
  { name: '蘋果',     emoji: '🍎', unit: '一顆',   kcal: 100, group: '水果' },
  { name: '香蕉',     emoji: '🍌', unit: '一根',   kcal: 105, group: '水果' },
  { name: '橘子',     emoji: '🍊', unit: '一顆',   kcal: 60,  group: '水果' },
  { name: '芭樂',     emoji: '🍐', unit: '一顆',   kcal: 90,  group: '水果' },
  { name: '西瓜',     emoji: '🍉', unit: '一片',   kcal: 80,  group: '水果' },
  { name: '葡萄',     emoji: '🍇', unit: '一碗',   kcal: 90,  group: '水果' },
  // 豆魚蛋肉
  { name: '雞腿',     emoji: '🍗', unit: '一隻',   kcal: 250, group: '豆魚蛋肉' },
  { name: '荷包蛋',   emoji: '🍳', unit: '一顆',   kcal: 100, group: '豆魚蛋肉' },
  { name: '水煮蛋',   emoji: '🥚', unit: '一顆',   kcal: 75,  group: '豆魚蛋肉' },
  { name: '煎魚',     emoji: '🐟', unit: '一片',   kcal: 180, group: '豆魚蛋肉' },
  { name: '豆腐',     emoji: '⬜', unit: '半盒',   kcal: 110, group: '豆魚蛋肉' },
  { name: '豆漿',     emoji: '🥤', unit: '一杯',   kcal: 130, group: '豆魚蛋肉' },
  { name: '滷排骨',   emoji: '🥩', unit: '一塊',   kcal: 300, group: '豆魚蛋肉' },
  // 乳品
  { name: '牛奶',     emoji: '🥛', unit: '一杯',   kcal: 150, group: '乳品' },
  { name: '優酪乳',   emoji: '🥛', unit: '一瓶',   kcal: 160, group: '乳品' },
  { name: '起司片',   emoji: '🧀', unit: '一片',   kcal: 60,  group: '乳品' },
  // 點心（偶爾吃就好）
  { name: '全糖珍奶', emoji: '🧋', unit: '一杯',   kcal: 650, group: '點心' },
  { name: '炸雞',     emoji: '🍗', unit: '一塊',   kcal: 350, group: '點心' },
  { name: '薯條',     emoji: '🍟', unit: '中份',   kcal: 330, group: '點心' },
  { name: '雞排',     emoji: '🍖', unit: '一片',   kcal: 600, group: '點心' },
  { name: '可樂',     emoji: '🥤', unit: '一罐',   kcal: 140, group: '點心' },
  { name: '洋芋片',   emoji: '🥔', unit: '一小包', kcal: 180, group: '點心' },
  { name: '巧克力',   emoji: '🍫', unit: '一條',   kcal: 230, group: '點心' },
  { name: '冰淇淋',   emoji: '🍦', unit: '一支',   kcal: 200, group: '點心' },
];

export const foodsIn = (group) => FOODS.filter((f) => f.group === group);

// 從食物名稱猜它屬於哪些類（給 AI 拍照結果用，不一定準）
const HINTS = {
  '全穀': ['飯', '麵', '粥', '吐司', '麵包', '饅頭', '餃', '地瓜', '玉米', '漢堡', '披薩', '燕麥', '便當', '飯糰', '米粉', '冬粉'],
  '蔬菜': ['菜', '花椰', '番茄', '蘿蔔', '菇', '瓜', '豆芽', '沙拉', '茄子', '青椒'],
  '水果': ['蘋果', '香蕉', '橘', '柳丁', '芭樂', '西瓜', '葡萄', '奇異果', '芒果', '草莓', '鳳梨', '木瓜', '水果'],
  '豆魚蛋肉': ['雞', '豬', '牛肉', '魚', '蛋', '豆腐', '豆漿', '排骨', '蝦', '肉', '便當'],
  '乳品': ['牛奶', '鮮奶', '優格', '優酪', '起司', '乳酪'],
  '點心': ['珍奶', '奶茶', '炸', '薯條', '可樂', '汽水', '洋芋片', '巧克力', '冰淇淋', '蛋糕', '餅乾', '糖'],
};
export function guessGroups(name) {
  const exact = FOODS.find((f) => f.name === name);
  if (exact) return [exact.group];
  const s = String(name || '');
  return Object.keys(HINTS).filter((g) => HINTS[g].some((k) => s.includes(k)));
}
