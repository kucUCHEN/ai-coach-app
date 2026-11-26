// 「身體」：第一次填基本資料；之後看身高、體重、BMI、每日建議熱量，並記錄今天體重。
import { h, toast } from '../ui.js';
import { icon } from '../icons.js';
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

  const weightInput = h('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '10', max: '250',
    placeholder: '輸入體重', 'aria-label': '今天的體重（公斤）' });

  root.replaceChildren(
    h('div', { class: 'card profile-head' },
      h('div', {},
        h('div', { class: 'profile-name' }, p.name || '我的資料'),
        h('div', { class: 'muted small' }, `${p.age} 歲・${p.sex === 'F' ? '女' : '男'}・目標：${goal.label}`)),
      h('button', { class: 'btn ghost', onclick: () => showForm(p) }, '編輯'),
    ),
    h('div', { class: 'card' },
      h('div', { class: 'metric-grid' },
        metric('身高', p.heightCm, '公分'),
        metric('體重', p.weightKg, '公斤'),
        h('div', { class: 'metric' },
          h('div', { class: 'metric-label' }, 'BMI'),
          h('div', { class: 'metric-num' }, bmi ?? '—'),
          lv ? h('span', { class: `status ${lv.level}` }, lv.label) : ''),
        metric('基礎代謝', bmr ?? '—', '大卡'),
      ),
      lv ? h('p', { class: 'small muted note' }, bmiTip(lv, p.age)) : '',
    ),
    h('div', { class: 'card' },
      h('h2', {}, '每日建議熱量'),
      h('div', { class: 'hero-num' }, h('b', {}, target ?? '—'), h('span', {}, ' 大卡')),
      h('p', { class: 'muted small' },
        `基礎代謝約 ${bmr} 大卡 × 活動量「${(ACTIVITY[p.activity] || ACTIVITY.mid).label}」≈ 每日消耗 ${tdee} 大卡。`,
        p.goal === 'lose' ? ' 減脂目標已減少約 10%；建議每週慢慢調整，不要過度節食。' : '',
        p.goal === 'gain' ? ' 增肌目標已增加約 10%；搭配蛋白質與肌力訓練效果較好。' : '',
      ),
      p.age < 18 ? h('p', { class: 'muted small' }, '未滿 18 歲仍在成長，不建議以節食控制體重。') : '',
      h('p', { class: 'fine' }, '以上為公式估算，僅供參考，不能取代醫師或營養師的建議。'),
    ),
    h('div', { class: 'card' },
      h('h2', {}, '記錄今天體重'),
      last ? h('p', { class: 'muted small' }, `上次：${last.date.slice(5).replace('-', '/')}　${last.kg} 公斤`) : '',
      h('div', { class: 'row' }, weightInput, h('span', { class: 'unit' }, '公斤'),
        h('button', { class: 'btn', onclick: () => saveWeight(p, weightInput.value) }, '儲存')),
      h('a', { class: 'link-btn', href: '#coach' }, '沒有體重計？也可以直接告訴 AI 教練', icon('chevron')),
    ),
  );
}

function metric(label, num, unit) {
  return h('div', { class: 'metric' },
    h('div', { class: 'metric-label' }, label),
    h('div', { class: 'metric-num' }, String(num), unit ? h('span', { class: 'metric-unit' }, unit) : ''));
}

function bmiTip(lv, age) {
  const range = `${lv.cut.under}–${lv.cut.over}`;
  const std = age < 18 ? `（依 ${age} 歲兒童及青少年標準，正常範圍 ${range}）` : `（成人正常範圍 ${range}）`;
  return {
    under: `BMI 偏低${std}。建議均衡飲食、吃足熱量。`,
    normal: `BMI 在正常範圍${std}，請繼續保持。`,
    over: `BMI 略高${std}。減少含糖飲料與油炸食物、增加活動量會有幫助。`,
    obese: `BMI 偏高${std}。建議諮詢醫師或營養師，訂定合適的計畫。`,
  }[lv.level];
}

function saveWeight(p, val) {
  const kg = Math.round(Number(val) * 10) / 10;
  if (!(kg >= 10 && kg <= 250)) { toast('請輸入正確的體重'); return; }
  addWeight(kg);
  updateDay((d) => { d.weightKg = kg; }, todayKey());
  setProfile({ ...p, weightKg: kg });
  toast(`已記錄 ${kg} 公斤`);
  showInfo(getProfile());
}

// ---------- 填資料表單 ----------
function showForm(old) {
  const v = old || { goal: 'keep', activity: 'mid', sex: 'M' };
  const state = { sex: v.sex || 'M', goal: v.goal || 'keep', activity: v.activity || 'mid' };

  const name = h('input', { type: 'text', maxlength: '12', placeholder: '選填', value: v.name || '' });
  const age = h('input', { type: 'number', inputmode: 'numeric', min: '2', max: '110', placeholder: '歲', value: v.age ?? '' });
  const height = h('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '50', max: '230', placeholder: '公分', value: v.heightCm ?? '' });
  const weight = h('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '10', max: '250', placeholder: '公斤', value: v.weightKg ?? '' });

  const segment = (key, options) => h('div', { class: 'segment', role: 'radiogroup' },
    Object.entries(options).map(([val, text]) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(state[key] === val),
        class: state[key] === val ? 'on' : '', onclick: () => {
          state[key] = val;
          b.parentElement.querySelectorAll('button').forEach((c) => { c.classList.toggle('on', c === b); c.setAttribute('aria-checked', String(c === b)); });
        } }, text);
      return b;
    }));

  const form = h('form', { class: 'card', onsubmit: (e) => {
    e.preventDefault();
    const p = {
      name: name.value.trim(),
      age: Number(age.value), sex: state.sex,
      heightCm: Math.round(Number(height.value) * 10) / 10,
      weightKg: Math.round(Number(weight.value) * 10) / 10,
      goal: state.goal, activity: state.activity,
    };
    if (!(p.age >= 2 && p.age <= 110)) return toast('請輸入年齡');
    if (!(p.heightCm >= 50 && p.heightCm <= 230)) return toast('請輸入身高（公分）');
    if (!(p.weightKg >= 10 && p.weightKg <= 250)) return toast('請輸入體重（公斤）');
    setProfile(p);
    if (!old || old.weightKg !== p.weightKg) {
      addWeight(p.weightKg);
      updateDay((d) => { d.weightKg = p.weightKg; });
    }
    toast(old ? '資料已更新' : '資料已建立');
    showInfo(p);
  } },
    h('h2', {}, old ? '編輯基本資料' : '建立基本資料'),
    !old ? h('p', { class: 'muted small' }, '用來計算 BMI 與每日建議熱量。資料只存在這支手機。') : '',
    h('label', {}, '暱稱'), name,
    h('div', { class: 'grid2' },
      h('div', {}, h('label', {}, '年齡'), age),
      h('div', {}, h('label', {}, '性別'), segment('sex', { M: '男', F: '女' })),
    ),
    h('div', { class: 'grid2' },
      h('div', {}, h('label', {}, '身高（公分）'), height),
      h('div', {}, h('label', {}, '體重（公斤）'), weight),
    ),
    h('label', {}, '目標'),
    segment('goal', Object.fromEntries(Object.entries(GOALS).map(([k, g]) => [k, g.label]))),
    h('label', {}, '平常活動量'),
    h('div', { class: 'option-list' },
      Object.entries(ACTIVITY).map(([k, a]) => {
        const b = h('button', { type: 'button', class: 'option' + (state.activity === k ? ' on' : ''), onclick: () => {
          state.activity = k;
          b.parentElement.querySelectorAll('.option').forEach((c) => c.classList.toggle('on', c === b));
        } }, h('span', { class: 'option-text' }, h('b', {}, a.label), h('span', { class: 'muted small' }, a.hint)), icon('check', 'option-check'));
        return b;
      })),
    h('button', { class: 'btn block mt-lg', type: 'submit' }, old ? '儲存' : '完成'),
    old ? h('button', { class: 'btn ghost block mt', type: 'button', onclick: () => showInfo(old) }, '取消') : '',
  );
  root.replaceChildren(form);
}
