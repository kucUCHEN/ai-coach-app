// 「飲食」：今日熱量與均衡度、新增餐點（拍照／手動）、今日餐點、熱量換算。
import { h, toast } from '../ui.js';
import { icon } from '../icons.js';
import { getProfile, getDay, updateDay } from '../store.js';
import { dailyTarget, sumMealKcal, repsToBurn } from '../health.js';
import { FOODS, GROUPS, foodsIn, guessGroups } from '../foods.js';
import { EXERCISES } from '../sensor/exercises.js';

let root = null;
let alive = false;
let manualGroup = null; // 記住手動選擇的分類，重畫時不會跳回第一類
let manualOpen = false;

let aiMod = null;
async function loadAI() {
  if (aiMod) return aiMod;
  try { aiMod = await import('../ai/index.js'); } catch (e) { console.warn('AI 模組載入失敗', e); aiMod = null; }
  return aiMod;
}

export async function render(r) {
  root = r; alive = true;
  const p = getProfile();
  if (!p) { root.replaceChildren(needProfile()); return; }
  await loadAI();
  if (!alive) return;
  draw(p);
}
export function leave() { alive = false; }

export function needProfile(text = '先建立基本資料，才能計算每日建議熱量。') {
  return h('div', { class: 'card empty' },
    h('p', {}, text),
    h('a', { class: 'btn block', href: '#body' }, '建立基本資料'));
}
function safeDemo() { try { return !!aiMod?.isDemo?.(); } catch { return false; } }

function draw(p) {
  const day = getDay();
  root.replaceChildren(
    summaryCard(p, day),
    addCard(),
    mealList(day),
    swapCard(),
  );
}

// ---------- 今日摘要（熱量＋均衡） ----------
function summaryCard(p, day) {
  const target = dailyTarget(p);
  const eaten = sumMealKcal(day);
  const pct = target ? Math.min(100, Math.round((eaten / target) * 100)) : 0;
  const over = eaten > target * 1.1;
  const got = new Set(day.meals.flatMap((m) => m.groups || guessGroups(m.name)));
  const main = GROUPS.filter((g) => g.key !== '點心');
  const missing = main.filter((g) => !got.has(g.key));

  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('span', { class: 'muted small' }, '今日攝取'),
      h('span', { class: 'muted small' }, `建議 ${target} 大卡`)),
    h('div', { class: 'hero-num' }, h('b', { class: over ? 'warn-text' : '' }, eaten), h('span', {}, ' 大卡')),
    h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('div', { class: 'progress-bar' + (over ? ' warn' : ''), style: { width: pct + '%' } })),
    h('p', { class: 'muted small' }, over ? `已超過建議量 ${eaten - target} 大卡。`
      : eaten === 0 ? '尚未記錄。' : `還可攝取約 ${Math.max(0, target - eaten)} 大卡。`),
    h('div', { class: 'divider' }),
    h('div', { class: 'row between' }, h('span', { class: 'small bold' }, '飲食均衡'),
      h('span', { class: 'muted small' }, `${main.length - missing.length} / ${main.length} 類`)),
    h('div', { class: 'group-row' }, main.map((g) =>
      h('span', { class: 'group-pill' + (got.has(g.key) ? ' on' : '') }, got.has(g.key) ? icon('check') : '', g.key))),
    day.meals.length && missing.length ? h('p', { class: 'muted small' }, `今天還缺少：${missing.map((g) => g.key).join('、')}`) : '',
  );
}

// ---------- 新增餐點 ----------
function addCard() {
  const result = h('div', { class: 'photo-result' });
  const manual = h('div', { class: 'manual', hidden: !manualOpen });
  const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden', id: 'food-photo',
    onchange: async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      manual.hidden = true; manualOpen = false;
      result.replaceChildren(h('p', { class: 'loading' }, '正在分析照片…'));
      try {
        const dataUrl = await shrinkImage(file, 1024, 0.8);
        const ai = await loadAI();
        if (!ai?.estimateFood) throw new Error('AI 尚未就緒');
        const res = await ai.estimateFood(dataUrl);
        if (!alive) return;
        result.replaceChildren(editResult(res, dataUrl));
      } catch (e) {
        console.warn(e);
        result.replaceChildren(h('p', { class: 'error-text' }, '無法辨識這張照片，請重拍，或改用手動選擇。'));
      }
    } });
  fillManual(manual);
  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, '新增餐點'), safeDemo() ? h('span', { class: 'demo-badge' }, '示範模式') : ''),
    input,
    h('div', { class: 'grid2' },
      h('label', { for: 'food-photo', class: 'btn action-btn' }, icon('camera'), '拍照估算'),
      h('button', { class: 'btn ghost action-btn', onclick: () => { manualOpen = manual.hidden; manual.hidden = !manual.hidden; result.replaceChildren(); } }, icon('plus'), '手動選擇'),
    ),
    h('p', { class: 'fine' }, 'AI 會估算份量與熱量，結果可以修改。照片不會儲存。'),
    result,
    manual,
  );
}

function addMeal(meal) {
  const time = new Date().toTimeString().slice(0, 5);
  updateDay((d) => { d.meals.push({ id: Date.now() + Math.random().toString(36).slice(2, 6), time, photo: false, ...meal }); });
  manualOpen = false;
  toast(`已記錄 ${meal.kcal} 大卡`);
  draw(getProfile());
}

// 把照片縮到最長邊 maxSide，轉成 JPEG dataURL（照片不存進手機，只拿來問 AI）
function shrinkImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('讀不到照片')); };
    img.src = url;
  });
}

// AI 結果：可以改名稱、克數、熱量，再儲存
function editResult(res, dataUrl) {
  const items = (res?.items || []).map((it) => ({ name: String(it.name || '食物'), grams: Number(it.grams) || 0, kcal: Math.round(Number(it.kcal) || 0) }));
  if (!items.length) items.push({ name: '食物', grams: 0, kcal: Math.round(Number(res?.totalKcal) || 0) });
  const totalEl = h('b');
  const update = () => { totalEl.textContent = items.reduce((s, x) => s + (Number(x.kcal) || 0), 0); };

  const rows = items.map((it) => {
    const n = h('input', { type: 'text', value: it.name, 'aria-label': '食物名稱', oninput: () => { it.name = n.value; } });
    const g = h('input', { type: 'number', inputmode: 'numeric', value: it.grams, 'aria-label': '克數', oninput: () => { it.grams = Number(g.value) || 0; } });
    const k = h('input', { type: 'number', inputmode: 'numeric', value: it.kcal, 'aria-label': '熱量', oninput: () => { it.kcal = Math.round(Number(k.value) || 0); update(); } });
    return h('div', { class: 'ai-item' }, n,
      h('div', { class: 'ai-item-nums' }, g, h('span', {}, '克'), k, h('span', {}, '大卡')));
  });
  update();
  return h('div', { class: 'ai-box' },
    h('img', { class: 'ai-thumb', src: dataUrl, alt: '拍攝的餐點' }),
    h('div', { class: 'row between' }, h('span', { class: 'small bold' }, 'AI 估算結果'), h('span', { class: 'small' }, '合計 ', totalEl, ' 大卡')),
    rows,
    res?.advice ? h('p', { class: 'advice' }, String(res.advice)) : '',
    h('button', { class: 'btn block', onclick: () => {
      const ok = items.filter((x) => x.name.trim());
      const kcal = ok.reduce((s, x) => s + (Number(x.kcal) || 0), 0);
      if (!ok.length) return toast('至少需要一項食物');
      addMeal({
        name: ok.map((x) => x.name.trim()).join('、'), kcal,
        items: ok.map((x) => ({ name: x.name.trim(), grams: x.grams, kcal: x.kcal })),
        groups: [...new Set(ok.flatMap((x) => guessGroups(x.name)))],
      });
    } }, '儲存這一餐'),
  );
}

// ---------- 手動選擇 ----------
function fillManual(box) {
  let group = manualGroup || GROUPS[0].key;
  const tabs = h('div', { class: 'chip-scroll' });
  const list = h('div', { class: 'food-list' });
  const picker = h('div');

  const drawTabs = () => tabs.replaceChildren(...GROUPS.map((g) =>
    h('button', { class: 'chip' + (g.key === group ? ' on' : ''), onclick: () => { group = manualGroup = g.key; drawTabs(); drawList(); picker.replaceChildren(); } }, g.key)));
  const drawList = () => list.replaceChildren(...foodsIn(group).map((f) =>
    h('button', { class: 'food-row', onclick: () => pick(f) },
      h('span', { class: 'grow' }, f.name, h('span', { class: 'muted small' }, `　${f.unit}`)),
      h('span', { class: 'muted small' }, `${f.kcal} 大卡`))));

  const pick = (f) => {
    let qty = 1;
    const qtyEl = h('b', { class: 'qty' });
    const kcalEl = h('span', { class: 'muted' });
    const upd = () => { qtyEl.textContent = qty; kcalEl.textContent = `${Math.round(f.kcal * qty)} 大卡`; };
    upd();
    picker.replaceChildren(h('div', { class: 'pick-box' },
      h('div', { class: 'row between' }, h('b', {}, `${f.name}（${f.unit}）`), kcalEl),
      h('div', { class: 'row stepper' },
        h('button', { class: 'round-btn', 'aria-label': '減少', onclick: () => { qty = Math.max(0.5, qty - 0.5); upd(); } }, icon('minus')),
        qtyEl, h('span', { class: 'muted' }, '份'),
        h('button', { class: 'round-btn', 'aria-label': '增加', onclick: () => { qty = Math.min(5, qty + 0.5); upd(); } }, icon('plus')),
        h('button', { class: 'btn grow', onclick: () => addMeal({
          name: qty === 1 ? `${f.name} ${f.unit}` : `${f.name} ${f.unit} ×${qty}`,
          kcal: Math.round(f.kcal * qty), groups: [f.group],
        }) }, '加入'),
      ),
    ));
    picker.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  };
  drawTabs(); drawList();
  box.replaceChildren(tabs, list, picker);
}

// ---------- 今日餐點 ----------
function mealList(day) {
  return h('div', { class: 'card' },
    h('h2', {}, '今日餐點'),
    day.meals.length ? h('ul', { class: 'list' }, day.meals.map((m) =>
      h('li', { class: 'list-item' },
        h('span', { class: 'muted small time' }, m.time || ''),
        h('span', { class: 'grow' }, m.name),
        h('span', { class: 'small' }, `${m.kcal} 大卡`),
        h('button', { class: 'del-btn', 'aria-label': `刪除 ${m.name}`, onclick: () => {
          if (!confirm(`刪除「${m.name}」？`)) return;
          updateDay((d) => { d.meals = d.meals.filter((x) => x.id !== m.id); });
          draw(getProfile());
        } }, icon('close')),
      ))) : h('p', { class: 'muted small' }, '尚未記錄。'),
  );
}

// ---------- 熱量換算 ----------
function swapCard() {
  const tempting = FOODS.filter((f) => f.group === '點心' || f.kcal >= 400);
  const foodSel = h('select', { 'aria-label': '食物' }, tempting.map((f) => h('option', { value: f.name }, `${f.name}（${f.unit}）`)));
  const exSel = h('select', { 'aria-label': '運動' }, EXERCISES.map((e) => h('option', { value: e.id }, e.name)));
  const out = h('p', { class: 'swap-out' });
  const upd = () => {
    const f = tempting.find((x) => x.name === foodSel.value) || tempting[0];
    const ex = EXERCISES.find((e) => String(e.id) === exSel.value) || EXERCISES[0];
    out.replaceChildren(`${f.kcal} 大卡 ≈ ${ex.name} `, h('b', {}, repsToBurn(f.kcal, ex.id).toLocaleString()), ' 次');
  };
  foodSel.addEventListener('change', upd); exSel.addEventListener('change', upd);
  foodSel.value = '全糖珍奶';
  upd();
  return h('div', { class: 'card' }, h('h2', {}, '熱量換算'),
    h('div', { class: 'grid2' }, foodSel, exSel), out,
    h('p', { class: 'fine' }, '估算值，實際消耗會因體重與強度不同。'));
}
