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
    energyCard(p, bmr, tdee, target),
    goalCard(p, lv, tdee, target),
    nutrientCard(p, target),
    h('div', { class: 'card' },
      h('h2', {}, '⚖️ 記錄今天體重'),
      last ? h('p', { class: 'muted small' }, `上次：${last.date.slice(5).replace('-', '/')}　${last.kg} 公斤`) : '',
      h('div', { class: 'row' }, weightInput, h('span', { class: 'unit' }, '公斤'),
        h('button', { class: 'btn', onclick: () => saveWeight(p, weightInput.value) }, '儲存')),
      h('a', { class: 'link-btn', href: '#coach' }, '沒有體重計？也可以直接告訴 AI 教練', icon('chevron')),
    ),
  );
}

// ---------- 熱量：BMR → TDEE → 每日建議 ----------
function energyCard(p, bmr, tdee, target) {
  const act = ACTIVITY[p.activity] || ACTIVITY.mid;
  const adj = (GOALS[p.goal] || GOALS.keep).adjust;
  const step = (emoji, label, val, note) => h('div', { class: 'flow-step' },
    h('div', { class: 'flow-e' }, emoji),
    h('div', { class: 'grow' }, h('div', { class: 'small bold' }, label), h('div', { class: 'fine' }, note)),
    h('div', { class: 'flow-v' }, h('b', {}, val ?? '—'), h('span', { class: 'muted small' }, ' 大卡')));
  return h('div', { class: 'card' },
    h('h2', {}, '🔥 每天需要多少熱量？'),
    step('🛌', '基礎代謝 BMR', bmr, '躺著不動，身體一天也會消耗的熱量'),
    step('🚶', '每日總消耗 TDEE', tdee, `BMR × 活動量「${act.label}」(${act.factor})`),
    step('🎯', '每日建議攝取', target, adj < 0 ? '減脂：TDEE 減少約 10%' : adj > 0 ? '增肌：TDEE 增加約 10%' : '維持：與 TDEE 相同'),
    p.age < 18 ? h('p', { class: 'muted small' }, '🌱 未滿 18 歲仍在成長，不建議以節食控制體重。') : '',
    h('p', { class: 'fine' }, '以上為 Mifflin-St Jeor 公式估算，僅供參考，不能取代醫師或營養師的建議。'),
  );
}

// ---------- 健康體重範圍與目標體重 ----------
function healthyRange(p, lv) {
  const m2 = (p.heightCm / 100) ** 2;
  const lo = lv?.cut?.under ?? 18.5, hi = lv?.cut?.over ?? 24;
  return [Math.round(lo * m2 * 10) / 10, Math.round(hi * m2 * 10) / 10];
}
function goalCard(p, lv, tdee, target) {
  const [lo, hi] = healthyRange(p, lv);
  const minor = p.age < 18;
  const goal = Number(p.goalWeightKg) || null;
  const input = h('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '10', max: '250', value: goal ?? '', placeholder: '目標體重', 'aria-label': '目標體重（公斤）' });
  let plan = '';
  if (goal && !minor) {
    const diff = Math.round((goal - p.weightKg) * 10) / 10;
    const dailyGap = Math.abs((target ?? tdee) - tdee);       // 每天多吃或少吃的熱量
    const perWeek = Math.min(0.5, (dailyGap * 7) / 7700);     // 每公斤脂肪約 7700 大卡，每週上限 0.5 公斤
    const weeks = Math.abs(diff) < 0.1 ? 0 : perWeek > 0 ? Math.ceil(Math.abs(diff) / perWeek) : null;
    const done = new Date(); if (weeks) done.setDate(done.getDate() + weeks * 7);
    plan = h('div', { class: 'goal-plan' },
      h('div', { class: 'row between' }, h('span', {}, diff === 0 ? '🎉 已達到目標' : `${diff < 0 ? '還要減' : '還要增加'} ${Math.abs(diff)} 公斤`),
        weeks ? h('span', { class: 'muted small' }, `約 ${weeks} 週`) : ''),
      weeks ? h('div', { class: 'fine' }, `照目前的每日建議攝取，每週約 ${Math.round(perWeek * 10) / 10} 公斤，預計 ${done.getFullYear()}/${done.getMonth() + 1} 達成。`) : '',
      weeks === null ? h('div', { class: 'fine' }, '目前目標是「維持健康」，若要改變體重，請到「編輯」選擇減脂或增肌。') : '',
      goal < lo || goal > hi ? h('div', { class: 'fine warn-text' }, '⚠️ 這個目標不在健康體重範圍內，建議調整。') : '',
    );
  }
  // 範圍條：把目前體重與目標標在健康範圍上
  const min = Math.min(lo * 0.85, p.weightKg, goal ?? Infinity), max = Math.max(hi * 1.15, p.weightKg, goal ?? 0);
  const pos = (v) => `${((v - min) / (max - min)) * 100}%`;
  return h('div', { class: 'card' },
    h('h2', {}, '🎯 健康體重與目標'),
    h('div', { class: 'range' },
      h('div', { class: 'range-ok', style: { left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` } }),
      h('div', { class: 'range-pin now', style: { left: pos(p.weightKg) } }, h('span', {}, `現在 ${p.weightKg}`)),
      goal ? h('div', { class: 'range-pin goal', style: { left: pos(goal) } }, h('span', {}, `目標 ${goal}`)) : '',
    ),
    h('p', { class: 'small' }, `健康體重範圍：${lo}–${hi} 公斤`, h('span', { class: 'muted' }, minor ? '（兒童及青少年標準）' : '（BMI 18.5–24）')),
    minor ? h('p', { class: 'muted small' }, '🌱 成長期身高還會增加，建議以「維持體重、慢慢長高」為目標，不設減重時程。')
      : h('div', { class: 'row' }, input, h('span', { class: 'unit' }, '公斤'),
        h('button', { class: 'btn ghost', onclick: () => {
          const v = Math.round(Number(input.value) * 10) / 10;
          if (!(v >= 10 && v <= 250)) return toast('請輸入正確的目標體重');
          setProfile({ ...getProfile(), goalWeightKg: v }); toast('🎯 已設定目標體重'); showInfo(getProfile());
        } }, '設定')),
    plan,
  );
}

// ---------- 每日營養參考 ----------
function nutrientCard(p, target) {
  const proteinPerKg = p.goal === 'gain' ? 1.6 : p.age < 18 ? 1.0 : 1.2;
  const protein = Math.round(p.weightKg * proteinPerKg);
  const water = Math.round((p.weightKg * 30) / 50) * 50;
  const fat = Math.round((target * 0.3) / 9);
  const carb = Math.round((target - protein * 4 - fat * 9) / 4);
  const cell = (e, label, val, unit, note) => h('div', { class: 'nut' },
    h('div', { class: 'nut-e' }, e), h('div', { class: 'muted small' }, label),
    h('div', {}, h('b', { class: 'nut-v' }, val), h('span', { class: 'muted small' }, ' ' + unit)), h('div', { class: 'fine' }, note));
  return h('div', { class: 'card' },
    h('h2', {}, '🥗 每日營養參考'),
    h('div', { class: 'nut-grid' },
      cell('💧', '喝水', water, '毫升', `體重 × 30 毫升，約 ${Math.round(water / 250)} 杯`),
      cell('🍗', '蛋白質', protein, '克', `每公斤 ${proteinPerKg} 克`),
      cell('🍚', '醣類', carb, '克', '其餘熱量'),
      cell('🥑', '脂肪', fat, '克', '約 30% 熱量'),
    ),
    h('p', { class: 'fine' }, '一般健康成人的參考值；有慢性病、懷孕或特殊需求請諮詢專業人員。'),
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
      ...(old || {}),
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
