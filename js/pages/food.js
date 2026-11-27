// 「飲食」：今日熱量與均衡度、新增餐點（拍照／手動）、今日餐點、熱量換算。
import { h, toast } from '../ui.js';
import { icon } from '../icons.js';
import { getProfile, getDay, updateDay, listDays } from '../store.js';
import { dailyTarget, sumMealKcal, ageMode, proteinTarget, effectiveGoal } from '../health.js';
import { FOODS, GROUPS, foodsIn, guessGroups, mealProtein } from '../foods.js';
import { ACTIVITIES, activityKcal } from '../activities.js';

let root = null;
let alive = false;
let manualGroup = null; // 記住手動選擇的分類
let manualOpen = false;
// 各區塊容器：只重畫需要的部分，未儲存的拍照結果不會被清掉
let summaryEl, recentEl, mealEl, swapEl, undoBar = null;
let editingId = null;

let aiMod = null;
async function loadAI() {
  if (aiMod) return aiMod;
  try { aiMod = await import('../ai/index.js'); } catch (e) { console.warn('AI 模組載入失敗', e); aiMod = null; }
  return aiMod;
}

export async function render(r) {
  root = r; alive = true; editingId = null;
  const p = getProfile();
  if (!p) { root.replaceChildren(needProfile()); return; }
  await loadAI();
  if (!alive) return;
  summaryEl = h('div'); recentEl = h('div'); mealEl = h('div'); swapEl = h('div');
  root.replaceChildren(summaryEl, addCard(), mealEl, swapEl);
  refresh();
}
export function leave() { alive = false; undoBar?.remove(); undoBar = null; }

export function needProfile(text = '先建立基本資料，才能計算每日建議熱量。') {
  return h('div', { class: 'card empty' },
    h('p', {}, text),
    h('a', { class: 'btn block', href: '#body' }, '建立基本資料'));
}
function safeDemo() { try { return !!aiMod?.isDemo?.(); } catch { return false; } }

function refresh() {
  if (!alive || !summaryEl) return;
  const p = getProfile(); const day = getDay();
  summaryEl.replaceChildren(summaryCard(p, day));
  recentEl.replaceChildren(recentRow());
  mealEl.replaceChildren(mealList(day));
  swapEl.replaceChildren(ageMode(p) === 'child' ? '' : swapCard(p));
}

const round1 = (x) => Math.round(x * 10) / 10;
const findFood = (name) => FOODS.find((f) => f.name === name) || FOODS.find((f) => name && (name.startsWith(f.name) || f.name.startsWith(name)));

// ---------- 今日摘要 ----------
function summaryCard(p, day) {
  const mode = ageMode(p);
  const target = dailyTarget(p) || 0;
  const eaten = sumMealKcal(day);
  const pct = target ? Math.min(100, Math.round((eaten / target) * 100)) : 0;
  const over = eaten > target * 1.1;
  const got = new Set(day.meals.flatMap((m) => m.groups || guessGroups(m.name)));
  const main = GROUPS.filter((g) => g.key !== '點心');
  const missing = main.filter((g) => !got.has(g.key));
  const n = main.length - missing.length;

  const pt = proteinTarget(p).grams;
  const pe = Math.round(day.meals.reduce((s, m) => s + (Number(mealProtein(m)) || 0), 0));
  const gain = effectiveGoal(p) === 'gain';
  const ppct = pt ? Math.min(100, Math.round((pe / pt) * 100)) : 0;
  const protein = h('div', { class: 'protein-box' + (gain ? ' strong' : '') },
    h('div', { class: 'row between' },
      h('span', { class: 'small bold' }, mode === 'child' ? '💪 蛋白質（豆魚蛋肉）' : gain ? '💪 蛋白質（增肌重點）' : '💪 蛋白質'),
      h('span', { class: 'small' }, '已吃 ', h('b', {}, pe), ` / 目標 ${pt} 克`)),
    h('div', { class: 'progress thin' }, h('div', { class: 'progress-bar', style: { width: ppct + '%' } })));

  const plate = [
    h('div', { class: 'row between' }, h('span', { class: 'small bold' }, '🍽️ 我的餐盤'),
      h('span', { class: 'muted small' }, `${n} / ${main.length} 類`)),
    h('div', { class: 'group-row' }, main.map((g) =>
      h('span', { class: 'group-pill' + (got.has(g.key) ? ' on' : '') }, g.emoji, ' ', g.key))),
  ];

  if (mode === 'child') {
    const msg = !day.meals.length ? '今天還沒有記錄，吃完記一下吧。'
      : missing.length ? `今天吃到 ${n} 類，還差${missing.map((g) => g.key).join('、')}。` : '🎉 五大類都吃到了，很棒！';
    return h('div', { class: 'card' }, ...plate, h('p', { class: 'plate-msg' }, msg), h('div', { class: 'divider' }), protein);
  }

  const note = eaten === 0 ? '尚未記錄。'
    : mode === 'teen' ? (over ? '今天吃得比建議量多一些，下一餐清淡一點就好。' : `已吃到建議量的 ${pct}%。`)
    : over ? `已超過建議量 ${eaten - target} 大卡。` : `還可攝取約 ${Math.max(0, target - eaten)} 大卡。`;
  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('span', { class: 'muted small' }, '今日攝取'),
      h('span', { class: 'muted small' }, `建議 ${target} 大卡`)),
    h('div', { class: 'hero-num' }, h('b', { class: over && mode !== 'teen' ? 'warn-text' : '' }, eaten), h('span', {}, ' 大卡')),
    h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('div', { class: 'progress-bar' + (over && mode !== 'teen' ? ' warn' : ''), style: { width: pct + '%' } })),
    h('p', { class: 'muted small' }, note),
    protein,
    h('div', { class: 'divider' }),
    ...plate,
    day.meals.length ? h('p', { class: 'muted small' }, missing.length ? `今天還缺少：${missing.map((g) => g.key).join('、')}` : '🎉 五大類都吃到了！') : '',
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
        result.replaceChildren(editResult(res, dataUrl, () => result.replaceChildren()));
        requestAnimationFrame(() => result.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
      } catch (e) {
        console.warn(e);
        result.replaceChildren(h('p', { class: 'error-text' }, '無法辨識這張照片，請重拍，或改用手動選擇。'));
      }
    } });
  fillManual(manual);
  return h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, '🍱 新增餐點'), safeDemo() ? h('span', { class: 'demo-badge' }, '示範模式') : ''),
    input,
    h('div', { class: 'grid2' },
      h('label', { for: 'food-photo', class: 'btn action-btn' }, icon('camera'), '拍照估算'),
      h('button', { class: 'btn ghost action-btn', onclick: () => {
        manual.hidden = !manual.hidden; manualOpen = !manual.hidden; result.replaceChildren();
        if (manualOpen) requestAnimationFrame(() => manual.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
      } }, icon('plus'), '手動選擇'),
    ),
    recentEl,
    h('p', { class: 'fine' }, 'AI 會估算份量與熱量，結果可以修改。照片不會儲存。也可以直接跟教練說「午餐吃了滷肉飯」。'),
    result,
    manual,
  );
}

function addMeal(meal, { undo = false } = {}) {
  const time = new Date().toTimeString().slice(0, 5);
  const id = Date.now() + Math.random().toString(36).slice(2, 6);
  updateDay((d) => { d.meals.push({ id, time, photo: false, ...meal }); });
  if (undo) showUndo(`已記錄 ${meal.name}`, id); else toast(`已記錄 ${meal.kcal} 大卡`);
  refresh();
  return id;
}

// 畫面上方的小提示列，含「復原」
function showUndo(msg, id) {
  undoBar?.remove();
  const bar = h('div', { class: 'undo-bar', role: 'status' },
    h('span', { class: 'grow' }, msg),
    h('button', { class: 'undo-btn', onclick: () => {
      updateDay((d) => { d.meals = d.meals.filter((x) => x.id !== id); });
      bar.remove(); undoBar = null; refresh(); toast('已復原');
    } }, '復原'));
  undoBar = bar;
  document.body.append(bar);
  setTimeout(() => { if (undoBar === bar) { bar.remove(); undoBar = null; } }, 4500);
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

// 粗估蛋白質：同名食物 protein ×（克數 ÷ 估計一份克數）；一份克數用熱量比例推（kcal/f.kcal）
function estProtein(it) {
  const f = findFood(it.name.trim());
  if (!f || !f.protein) return 0;
  const ratio = f.kcal ? it.kcal / f.kcal : 1;
  return round1(f.protein * Math.max(0, ratio));
}

// AI 結果：可以改名稱、克數、熱量，再儲存
function editResult(res, dataUrl, onDone) {
  const items = (res?.items || []).map((it) => ({ name: String(it.name || '食物'), grams: Math.max(0, Number(it.grams) || 0), kcal: Math.max(0, Math.round(Number(it.kcal) || 0)) }));
  if (!items.length) items.push({ name: '食物', grams: 0, kcal: Math.round(Number(res?.totalKcal) || 0) });
  items.forEach((it) => { it.rate = it.grams > 0 ? it.kcal / it.grams : null; }); // 每克熱量，改克數時用
  const totalEl = h('b');
  const msgEl = h('p', { class: 'error-text small', hidden: true });
  const saveBtn = h('button', { class: 'btn block' }, '儲存這一餐');

  const problems = () => {
    const out = [];
    items.forEach((it, i) => {
      const label = it.name.trim() || `第 ${i + 1} 項`;
      if (!it.name.trim()) out.push(`第 ${i + 1} 項沒有名稱，請填寫或按 ✕ 移除`);
      if (!Number.isFinite(it.kcal) || it.kcal < 0 || it.kcal > 3000) out.push(`${label} 的熱量請填 0–3000`);
      if (!Number.isFinite(it.grams) || it.grams < 0 || it.grams > 2000) out.push(`${label} 的克數請填 0–2000`);
    });
    if (!items.length) out.push('至少需要一項食物');
    return out;
  };
  const update = () => {
    totalEl.textContent = items.reduce((s, x) => s + (Number.isFinite(x.kcal) ? x.kcal : 0), 0);
    const pr = problems();
    msgEl.hidden = !pr.length; msgEl.textContent = pr.join('；');
    saveBtn.disabled = pr.length > 0;
  };
  const list = h('div', { class: 'ai-items' });
  const drawRows = () => list.replaceChildren(...items.map((it) => {
    const num = (v) => (v === '' ? NaN : Number(v));
    const n = h('input', { type: 'text', value: it.name, 'aria-label': '食物名稱', oninput: () => { it.name = n.value; update(); } });
    const k = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 3000, value: it.kcal, 'aria-label': '熱量',
      oninput: () => { it.kcal = Math.round(num(k.value)); update(); } });
    const g = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 2000, value: it.grams, 'aria-label': '克數',
      oninput: () => {
        it.grams = num(g.value);
        if (it.rate != null && Number.isFinite(it.grams) && it.grams >= 0) { it.kcal = Math.round(it.grams * it.rate); k.value = it.kcal; }
        update();
      } });
    const del = h('button', { class: 'del-btn', 'aria-label': `移除 ${it.name}`, onclick: () => { items.splice(items.indexOf(it), 1); drawRows(); update(); } }, icon('close'));
    return h('div', { class: 'ai-item' }, h('div', { class: 'row' }, n, del),
      h('div', { class: 'ai-item-nums' }, g, h('span', {}, '克'), k, h('span', {}, '大卡')));
  }));
  drawRows(); update();
  saveBtn.onclick = () => {
    if (problems().length) return update();
    const ok = items.map((x) => ({ name: x.name.trim(), grams: x.grams, kcal: x.kcal, protein: estProtein(x) }));
    addMeal({
      name: ok.map((x) => x.name).join('、'), kcal: ok.reduce((s, x) => s + x.kcal, 0),
      protein: round1(ok.reduce((s, x) => s + x.protein, 0)),
      items: ok, groups: [...new Set(ok.flatMap((x) => guessGroups(x.name)))],
    });
    onDone?.();
  };
  return h('div', { class: 'ai-box' },
    res?.demo ? h('div', { class: 'demo-note' }, '示範估算：目前沒有連線 AI，數字僅供參考，請依實際份量修改。') : '',
    h('img', { class: 'ai-thumb', src: dataUrl, alt: '拍攝的餐點' }),
    h('div', { class: 'row between' }, h('span', { class: 'small bold' }, 'AI 估算結果'), h('span', { class: 'small' }, '合計 ', totalEl, ' 大卡')),
    h('p', { class: 'fine' }, '改克數時熱量會照比例自動調整。'),
    list,
    res?.advice ? h('p', { class: 'advice' }, String(res.advice)) : '',
    msgEl,
    saveBtn,
  );
}

// ---------- 最近吃過：一鍵再記一次 ----------
const lastTap = new Map();
function chipLabel(m) {
  const name = m.name.length > 9 ? m.name.slice(0, 9) + '…' : m.name;
  return `${name}・${m.kcal} 大卡`;
}
function recentRow() {
  const seen = new Map();
  for (const k of listDays().sort().reverse().slice(0, 14)) {
    for (const m of [...getDay(k).meals].reverse()) if (!seen.has(m.name) && seen.size < 8) seen.set(m.name, m);
  }
  if (!seen.size) return '';
  return h('div', { class: 'recent' }, h('div', { class: 'muted small' }, '⚡ 最近吃過，點一下再記一次'),
    h('div', { class: 'chip-scroll' }, [...seen.values()].map((m) => {
      const b = h('button', { class: 'chip', title: m.name, onclick: () => {
        const now = Date.now();
        if (now - (lastTap.get(m.name) || 0) < 1500) return;
        lastTap.set(m.name, now);
        b.disabled = true;
        addMeal({ name: m.name, kcal: m.kcal, protein: Number.isFinite(m.protein) ? m.protein : undefined, items: m.items, groups: m.groups }, { undo: true });
      } }, chipLabel(m));
      if (Date.now() - (lastTap.get(m.name) || 0) < 1500) {
        b.disabled = true; setTimeout(() => { b.disabled = false; }, 1500 - (Date.now() - lastTap.get(m.name)));
      }
      return b;
    })));
}

// ---------- 手動選擇 ----------
function fillManual(box) {
  let group = manualGroup || GROUPS[0].key;
  let query = '';
  let selected = null;
  const tabs = h('div', { class: 'chip-scroll' });
  const list = h('div', { class: 'food-list' });
  const picker = h('div', { class: 'picker' });
  const search = h('input', { type: 'search', class: 'food-search', placeholder: '🔍 搜尋食物（例如：珍奶、便當）', 'aria-label': '搜尋食物',
    oninput: () => { query = search.value.trim(); selected = null; picker.replaceChildren(); drawTabs(); drawList(); } });

  const drawTabs = () => tabs.replaceChildren(...GROUPS.map((g) =>
    h('button', { class: 'chip' + (!query && g.key === group ? ' on' : ''), onclick: () => {
      group = manualGroup = g.key; query = ''; search.value = ''; selected = null; drawTabs(); drawList(); picker.replaceChildren();
    } }, `${g.emoji} ${g.key}${g.key === '點心' ? '／飲料' : ''}`)));
  const drawList = () => {
    const foods = query ? FOODS.filter((f) => f.name.includes(query)) : foodsIn(group);
    list.replaceChildren(...(foods.length ? foods.map((f) =>
      h('button', { class: 'food-row' + (selected === f ? ' selected' : ''), onclick: () => pick(f) },
        h('span', { class: 'grow' }, `${f.emoji} ${f.name}`, h('span', { class: 'muted small' }, `　${f.unit}`)),
        h('span', { class: 'muted small' }, `${f.kcal} 大卡`)))
      : [h('p', { class: 'muted small' }, `找不到「${query}」，可以用下方「自訂食物」加入。`)]));
  };

  const pick = (f) => {
    selected = f; drawList();
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
        h('button', { class: 'btn grow', onclick: () => {
          addMeal({
            name: qty === 1 ? `${f.name} ${f.unit}` : `${f.name} ${f.unit} ×${qty}`,
            kcal: Math.round(f.kcal * qty), protein: round1((f.protein || 0) * qty), groups: [f.group],
          });
          selected = null; picker.replaceChildren(); drawList();
        } }, '加入'),
      ),
    ));
    requestAnimationFrame(() => picker.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }));
  };

  // 自訂食物
  const cName = h('input', { type: 'text', placeholder: '名稱', 'aria-label': '自訂食物名稱' });
  const cKcal = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 5000, placeholder: '熱量', 'aria-label': '自訂熱量' });
  const cPro = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 300, placeholder: '蛋白質(選填)', 'aria-label': '自訂蛋白質' });
  const cMsg = h('p', { class: 'error-text small', hidden: true });
  const custom = h('details', { class: 'custom-food' }, h('summary', {}, '✏️ 自訂食物（清單裡沒有的）'),
    h('div', { class: 'custom-grid' }, cName, cKcal, cPro),
    cMsg,
    h('button', { class: 'btn block', onclick: () => {
      const name = cName.value.trim(); const kcal = Math.round(Number(cKcal.value));
      const pro = cPro.value === '' ? null : Number(cPro.value);
      const err = !name ? '請輸入名稱' : (cKcal.value === '' || !(kcal >= 0 && kcal <= 5000)) ? '熱量請填 0–5000'
        : pro != null && !(pro >= 0 && pro <= 300) ? '蛋白質請填 0–300 克' : '';
      cMsg.hidden = !err; cMsg.textContent = err;
      if (err) return;
      const groups = guessGroups(name);
      addMeal({ name, kcal, protein: pro != null ? round1(pro) : estProtein({ name, kcal }), groups });
      cName.value = cKcal.value = cPro.value = '';
    } }, '加入自訂食物'));

  drawTabs(); drawList();
  box.replaceChildren(search, tabs, list, picker, custom);
}

// ---------- 今日餐點 ----------
function mealList(day) {
  return h('div', { class: 'card' },
    h('h2', {}, '📝 今日餐點'),
    day.meals.length ? h('p', { class: 'fine' }, '點一筆可以修改。') : '',
    day.meals.length ? h('ul', { class: 'list' }, day.meals.map((m) => m.id === editingId ? mealEditor(m) :
      h('li', { class: 'list-item meal-item' },
        h('button', { class: 'meal-open grow', 'aria-label': `修改 ${m.name}`, onclick: () => { editingId = m.id; refresh(); } },
          h('span', { class: 'muted small time' }, m.time || ''),
          h('span', { class: 'grow' }, m.name),
          h('span', { class: 'small' }, `${m.kcal} 大卡`)),
        h('button', { class: 'del-btn', 'aria-label': `刪除 ${m.name}`, onclick: () => delMeal(m) }, icon('close')),
      ))) : h('p', { class: 'muted small' }, '尚未記錄。'),
  );
}
function delMeal(m) {
  if (!confirm(`刪除「${m.name}」？`)) return;
  updateDay((d) => { d.meals = d.meals.filter((x) => x.id !== m.id); });
  if (editingId === m.id) editingId = null;
  refresh();
}
function mealEditor(m) {
  const n = h('input', { type: 'text', value: m.name, 'aria-label': '餐點名稱' });
  const k = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 5000, value: m.kcal, 'aria-label': '熱量' });
  let mult = 1;
  const multEl = h('b', { class: 'qty' });
  const hint = h('span', { class: 'muted small' });
  const msg = h('p', { class: 'error-text small', hidden: true });
  const upd = () => { multEl.textContent = `×${mult}`; const kc = Number(k.value); hint.textContent = Number.isFinite(kc) ? `＝ ${Math.round(kc * mult)} 大卡` : ''; };
  k.addEventListener('input', upd); upd();
  return h('li', { class: 'meal-edit' },
    h('label', { class: 'small muted' }, '名稱'), n,
    h('label', { class: 'small muted' }, '熱量（大卡）'), k,
    h('div', { class: 'row stepper' }, h('span', { class: 'small muted' }, '份數'),
      h('button', { class: 'round-btn', 'aria-label': '減少份數', onclick: () => { mult = Math.max(0.5, mult - 0.5); upd(); } }, icon('minus')),
      multEl,
      h('button', { class: 'round-btn', 'aria-label': '增加份數', onclick: () => { mult = Math.min(5, mult + 0.5); upd(); } }, icon('plus')),
      hint),
    msg,
    h('div', { class: 'grid2' },
      h('button', { class: 'btn ghost', onclick: () => { editingId = null; refresh(); } }, '取消'),
      h('button', { class: 'btn', onclick: () => {
        const name = n.value.trim(); const kc = Number(k.value);
        const total = Math.round(kc * mult);
        const err = !name ? '請輸入名稱' : (k.value === '' || !(kc >= 0) || total > 5000) ? '熱量請填 0–5000' : '';
        msg.hidden = !err; msg.textContent = err;
        if (err) return;
        updateDay((d) => {
          const x = d.meals.find((y) => y.id === m.id); if (!x) return;
          const oldP = Number(mealProtein(x)) || 0;
          if (x.name !== name) { delete x.items; x.groups = guessGroups(name); }
          x.name = name;
          x.protein = round1(m.kcal ? oldP * (total / m.kcal) : oldP * mult);
          x.kcal = total;
        });
        editingId = null; refresh(); toast('已更新');
      } }, '儲存')),
    h('button', { class: 'link-btn danger', onclick: () => delMeal(m) }, '刪除這筆'),
  );
}

// ---------- 吃的 ⇄ 動的（分鐘） ----------
function swapCard(p) {
  const gentle = ageMode(p) === 'senior' || (p.conditions || []).includes('joint');
  const acts = gentle ? ACTIVITIES.filter((a) => ['walk', 'brisk', 'taichi'].includes(a.key))
    : ACTIVITIES.filter((a) => a.key !== 'stretch');
  const kg = Number(p.weightKg) || 60;
  const tempting = FOODS.filter((f) => f.group === '點心' || f.kcal >= 400).filter((f) => f.kcal > 0);
  const foodSel = h('select', { 'aria-label': '食物' }, tempting.map((f) => h('option', { value: f.name }, `${f.name}（${f.unit}）`)));
  const exSel = h('select', { 'aria-label': '運動' }, acts.map((a) => h('option', { value: a.key }, `${a.emoji} ${a.name}`)));
  const out = h('p', { class: 'swap-out' });
  const upd = () => {
    const f = tempting.find((x) => x.name === foodSel.value) || tempting[0];
    const a = acts.find((x) => x.key === exSel.value) || acts[0];
    const perMin = activityKcal(a, 1, kg) || 1;
    out.replaceChildren(`${f.kcal} 大卡 ≈ ${a.name} 約 `, h('b', {}, Math.round(f.kcal / perMin)), ' 分鐘');
  };
  foodSel.addEventListener('change', upd); exSel.addEventListener('change', upd);
  if (tempting.some((f) => f.name === '全糖珍奶')) foodSel.value = '全糖珍奶';
  upd();
  return h('div', { class: 'card' }, h('h2', {}, '⚖️ 吃的 ⇄ 動的'),
    h('div', { class: 'grid2' }, foodSel, exSel), out,
    h('p', { class: 'fine' }, `依體重 ${kg} 公斤估算，實際消耗會因強度不同。`));
}
