// 「我的身體」：第一次填基本資料；之後看身高、體重、BMI、每天需要的熱量，並記錄今天體重。
import { h, toast } from '../ui.js';
import { getProfile, setProfile, addWeight, updateDay, getWeights, todayKey } from '../store.js';
import { calcBMI, bmiLevel, calcBMR, calcTDEE, dailyTarget, ACTIVITY, GOALS } from '../health.js';

let root = null;

export function render(r) {
  root = r;
  const p = getProfile();
  if (!p) showForm(null); else showInfo(p);
}

// ---------- 顯示資料 ----------
function showInfo(p) {
  const bmi = calcBMI(p.weightKg, p.heightCm);
  const lv = bmiLevel(bmi, p.age, p.sex);
  const bmr = calcBMR(p), tdee = calcTDEE(p), target = dailyTarget(p);
  const goal = GOALS[p.goal] || GOALS.keep;
  const last = getWeights().slice(-1)[0];

  const weightInput = h('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '10', max: '200',
    placeholder: '例如 36.5', 'aria-label': '今天的體重（公斤）' });

  root.replaceChildren(
    h('div', { class: 'card hello' },
      h('div', { class: 'hello-name' }, '嗨，', p.name || '小朋友', '！'),
      h('div', { class: 'muted small' }, `${p.age} 歲・${p.sex === 'F' ? '女生' : '男生'}・目標：${goal.emoji} ${goal.label}`),
    ),
    h('div', { class: 'stat-grid' },
      stat('身高', p.heightCm, 'cm', 'blue'),
      stat('體重', p.weightKg, 'kg', 'blue'),
      h('div', { class: `stat ${lv?.color || 'green'}` },
        h('div', { class: 'stat-label' }, 'BMI'),
        h('div', { class: 'stat-num' }, bmi ?? '—', ' ',
          lv ? h('span', { class: `tag ${lv.color}` }, lv.label) : null),
      ),
      stat('基礎代謝', bmr ?? '—', '大卡', 'orange'),
    ),
    h('div', { class: 'card' },
      h('h2', {}, '🍽️ 每天需要多少熱量？'),
      h('p', { class: 'big-line' }, '每天大約需要 ', h('b', { class: 'num-green' }, target ?? '—'), ' 大卡'),
      h('p', { class: 'muted small' },
        `身體自己用掉約 ${bmr} 大卡，加上活動（${(ACTIVITY[p.activity] || ACTIVITY.mid).label}）大約 ${tdee} 大卡。`,
        p.goal === 'lose' ? '想減脂，所以少吃一點點就好。小朋友還在長大，每週只建議減一點點，不要餓肚子喔！' : '',
        p.goal === 'gain' ? '想增肌，所以多吃一點點，記得多吃豆魚蛋肉和喝牛奶，再加上運動。' : '',
      ),
      lv ? h('p', { class: 'small' }, bmiTip(lv)) : null,
      h('p', { class: 'muted tiny' }, '這是用公式算出來的「大約」數字，AI教練不是醫生喔。'),
    ),
    h('div', { class: 'card' },
      h('h2', {}, '⚖️ 今天量體重了嗎？'),
      last ? h('p', { class: 'muted small' }, `上次記錄：${last.date.slice(5).replace('-', '/')}　${last.kg} 公斤`) : null,
      h('div', { class: 'row' }, weightInput, h('span', { class: 'unit' }, '公斤')),
      h('button', { class: 'btn block mt', onclick: () => saveWeight(p, weightInput.value) }, '記下來'),
      h('a', { class: 'link-btn', href: '#coach' }, '🤖 沒有體重計？直接跟教練說也可以'),
    ),
    h('button', { class: 'btn ghost block', onclick: () => showForm(p) }, '✏️ 修改我的資料'),
  );
}

function stat(label, num, unit, color) {
  return h('div', { class: `stat ${color}` },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-num' }, String(num), h('span', { class: 'stat-unit' }, unit)),
  );
}

function bmiTip(lv) {
  return {
    under: `你的 BMI 有一點偏低（正常是 ${lv.cut.under} 到 ${lv.cut.over}），要吃飽、多喝牛奶喔！`,
    normal: `很棒！你的 BMI 在正常範圍（${lv.cut.under} 到 ${lv.cut.over}），繼續保持！`,
    over: `BMI 有一點高（正常是 ${lv.cut.under} 到 ${lv.cut.over}），少喝含糖飲料、多動一動就好。`,
    obese: `BMI 比較高（正常是 ${lv.cut.under} 到 ${lv.cut.over}），可以請爸爸媽媽一起陪你慢慢調整。`,
  }[lv.level];
}

function saveWeight(p, val) {
  const kg = Math.round(Number(val) * 10) / 10;
  if (!(kg >= 10 && kg <= 200)) { toast('體重好像怪怪的，再輸入一次'); return; }
  addWeight(kg);
  updateDay((d) => { d.weightKg = kg; }, todayKey());
  setProfile({ ...p, weightKg: kg });
  toast(`記好了！今天 ${kg} 公斤 👍`);
  showInfo(getProfile());
}

// ---------- 填資料表單 ----------
function showForm(old) {
  const v = old || { goal: 'keep', activity: 'mid', sex: 'M' };
  const state = { sex: v.sex || 'M', goal: v.goal || 'keep', activity: v.activity || 'mid' };

  const name = h('input', { type: 'text', maxlength: '12', placeholder: '例如 小安', value: v.name || '' });
  const age = h('input', { type: 'number', inputmode: 'numeric', min: '2', max: '99', placeholder: '例如 10', value: v.age ?? '' });
  const height = h('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '50', max: '230', placeholder: '例如 140', value: v.heightCm ?? '' });
  const weight = h('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '10', max: '200', placeholder: '例如 35', value: v.weightKg ?? '' });

  const choice = (key, options) => h('div', { class: 'choice-row' },
    Object.entries(options).map(([val, text]) => {
      const b = h('button', { type: 'button', class: 'chip' + (state[key] === val ? ' on' : ''), onclick: () => {
        state[key] = val;
        b.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      } }, text);
      return b;
    }));

  const form = h('form', { class: 'card', onsubmit: (e) => {
    e.preventDefault();
    const p = {
      name: name.value.trim() || '小朋友',
      age: Number(age.value), sex: state.sex,
      heightCm: Math.round(Number(height.value) * 10) / 10,
      weightKg: Math.round(Number(weight.value) * 10) / 10,
      goal: state.goal, activity: state.activity,
    };
    if (!(p.age >= 2 && p.age <= 99)) return toast('請填年齡');
    if (!(p.heightCm >= 50 && p.heightCm <= 230)) return toast('請填身高（公分）');
    if (!(p.weightKg >= 10 && p.weightKg <= 200)) return toast('請填體重（公斤）');
    setProfile(p);
    if (!old || old.weightKg !== p.weightKg) {
      addWeight(p.weightKg);
      updateDay((d) => { d.weightKg = p.weightKg; });
    }
    toast(old ? '資料更新好了！' : '歡迎！教練認識你了 🎉');
    showInfo(p);
  } },
    h('h2', {}, old ? '✏️ 修改我的資料' : '👋 先讓教練認識你'),
    !old ? h('p', { class: 'muted small' }, '資料只會存在這支手機裡。') : null,
    h('label', {}, '暱稱'), name,
    h('div', { class: 'grid2' },
      h('div', {}, h('label', {}, '年齡（歲）'), age),
      h('div', {}, h('label', {}, '性別'), choice('sex', { M: '👦 男生', F: '👧 女生' })),
    ),
    h('div', { class: 'grid2' },
      h('div', {}, h('label', {}, '身高（公分）'), height),
      h('div', {}, h('label', {}, '體重（公斤）'), weight),
    ),
    h('label', {}, '我的目標'),
    choice('goal', Object.fromEntries(Object.entries(GOALS).map(([k, g]) => [k, `${g.emoji} ${g.label}`]))),
    h('label', {}, '平常的活動量'),
    h('div', { class: 'choice-col' },
      Object.entries(ACTIVITY).map(([k, a]) => {
        const b = h('button', { type: 'button', class: 'option' + (state.activity === k ? ' on' : ''), onclick: () => {
          state.activity = k;
          b.parentElement.querySelectorAll('.option').forEach((c) => c.classList.toggle('on', c === b));
        } }, h('b', {}, a.label), h('span', { class: 'muted small' }, a.hint));
        return b;
      })),
    h('button', { class: 'btn block mt', type: 'submit' }, old ? '儲存' : '好了，開始！'),
    old ? h('button', { class: 'btn ghost block mt', type: 'button', onclick: () => showInfo(old) }, '取消') : null,
  );
  root.replaceChildren(form);
}
