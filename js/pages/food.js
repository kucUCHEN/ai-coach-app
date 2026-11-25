// 「飲食」：今天吃了多少、拍照估熱量、手動選食物、我的餐盤、吃的⇄動的。
import { h, toast } from '../ui.js';
import { getProfile, getDay, updateDay } from '../store.js';
import { dailyTarget, sumMealKcal, repsToBurn } from '../health.js';
import { FOODS, GROUPS, foodsIn, guessGroups } from '../foods.js';
import { EXERCISES } from '../sensor/exercises.js';

let root = null;
let alive = false;
let manualGroup = null; // 記住「手動選食物」目前的分類，重畫時不會跳回第一類

// AI 層由另一個模組提供；載入失敗時頁面照樣能用（手動選食物）
let aiMod = null;
async function loadAI() {
  if (aiMod) return aiMod;
  try { aiMod = await import('../ai/index.js'); } catch (e) { console.warn('AI 模組還沒準備好', e); aiMod = null; }
  return aiMod;
}

export async function render(r) {
  root = r; alive = true;
  const p = getProfile();
  if (!p) { root.replaceChildren(needProfile()); return; }
  const ai = await loadAI();
  if (!alive) return;
  let demo = false;
  try { demo = !!ai?.isDemo?.(); } catch {}
  draw(p, demo);
}

export function leave() { alive = false; }

function needProfile() {
  return h('div', { class: 'card center' },
    h('div', { class: 'big-emoji' }, '⚖️'),
    h('p', {}, '先到「身體」頁填好你的資料，教練才知道你每天要吃多少喔！'),
    h('a', { class: 'btn block', href: '#body' }, '去填資料'));
}

function draw(p, demo) {
  const day = getDay();
  const target = dailyTarget(p);
  const eaten = sumMealKcal(day);
  const pct = target ? Math.min(100, Math.round((eaten / target) * 100)) : 0;
  const over = eaten > target * 1.1;

  root.replaceChildren(
    // 今日進度
    h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', {}, '今天吃了'), demo ? h('span', { class: 'demo-badge' }, '示範模式') : null),
      h('div', { class: 'big-line' }, h('b', { class: over ? 'num-orange' : 'num-green' }, eaten), ` / ${target} 大卡`),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('div', { class: 'progress-bar' + (over ? ' warn' : ''), style: { width: pct + '%' } })),
      h('p', { class: 'muted small' }, over ? '今天吃得有點多囉，下一餐清淡一點、多動一動！'
        : eaten === 0 ? '還沒有記錄，吃東西前先拍張照吧！'
        : `還可以吃大約 ${Math.max(0, target - eaten)} 大卡`),
    ),
    photoCard(),
    manualCard(),
    mealList(day),
    plateCard(day),
    swapCard(),
  );
}

function addMeal(meal) {
  const time = new Date().toTimeString().slice(0, 5);
  updateDay((d) => { d.meals.push({ id: Date.now() + Math.random().toString(36).slice(2, 6), time, photo: false, ...meal }); });
  toast(`記下來了！${meal.kcal} 大卡 🍽️`);
  draw(getProfile(), !!safeDemo());
}
function safeDemo() { try { return aiMod?.isDemo?.(); } catch { return false; } }

// ---------- 拍照估熱量 ----------
function photoCard() {
  const result = h('div', { class: 'photo-result' });
  const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden', id: 'food-photo',
    onchange: async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      result.replaceChildren(h('p', { class: 'loading' }, '🔍 教練正在看你的照片…'));
      try {
        const dataUrl = await shrinkImage(file, 1024, 0.8);
        const ai = await loadAI();
        if (!ai?.estimateFood) throw new Error('AI 還沒準備好');
        const res = await ai.estimateFood(dataUrl);
        if (!alive) return;
        result.replaceChildren(editResult(res, dataUrl));
      } catch (e) {
        console.warn(e);
        result.replaceChildren(h('p', { class: 'error-text' }, '教練看不太清楚，再拍一次，或用下面的「手動選食物」。'));
      }
    } });
  return h('div', { class: 'card' },
    h('h2', {}, '📷 拍照估熱量'),
    h('p', { class: 'muted small' }, '拍下你要吃的東西，教練會估算大約幾克、多少大卡。'),
    input,
    h('label', { for: 'food-photo', class: 'btn block photo-btn' }, '📷 拍照估熱量'),
    result,
  );
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

// AI 結果：可以改名稱、克數、熱量，再按「記下來」
function editResult(res, dataUrl) {
  const items = (res?.items || []).map((it) => ({ name: String(it.name || '食物'), grams: Number(it.grams) || 0, kcal: Math.round(Number(it.kcal) || 0) }));
  if (!items.length) items.push({ name: '食物', grams: 0, kcal: Math.round(Number(res?.totalKcal) || 0) });
  const totalEl = h('b', { class: 'num-green' });
  const update = () => { totalEl.textContent = items.reduce((s, x) => s + (Number(x.kcal) || 0), 0); };

  const rows = items.map((it) => {
    const n = h('input', { type: 'text', value: it.name, 'aria-label': '食物名稱', oninput: () => { it.name = n.value; } });
    const g = h('input', { type: 'number', inputmode: 'numeric', value: it.grams, 'aria-label': '大約幾克', oninput: () => { it.grams = Number(g.value) || 0; } });
    const k = h('input', { type: 'number', inputmode: 'numeric', value: it.kcal, 'aria-label': '熱量', oninput: () => { it.kcal = Math.round(Number(k.value) || 0); update(); } });
    return h('div', { class: 'ai-item' }, n,
      h('div', { class: 'ai-item-nums' }, h('span', {}, '約'), g, h('span', {}, '克'), k, h('span', {}, '大卡')));
  });
  update();
  const box = h('div', { class: 'ai-box' },
    h('img', { class: 'ai-thumb', src: dataUrl, alt: '你拍的照片' }),
    h('div', { class: 'small muted' }, '教練估計（可以修改）：'),
    rows,
    h('div', { class: 'big-line' }, '一共 ', totalEl, ' 大卡'),
    res?.advice ? h('p', { class: 'advice' }, '💡 ', String(res.advice)) : null,
    h('button', { class: 'btn block', onclick: () => {
      const ok = items.filter((x) => x.name.trim());
      const kcal = ok.reduce((s, x) => s + (Number(x.kcal) || 0), 0);
      if (!ok.length) return toast('至少要有一樣食物');
      addMeal({
        name: ok.map((x) => x.name.trim()).join('、'), kcal,
        items: ok.map((x) => ({ name: x.name.trim(), grams: x.grams, kcal: x.kcal })),
        groups: [...new Set(ok.flatMap((x) => guessGroups(x.name)))],
      });
    } }, '記下來'),
  );
  return box;
}

// ---------- 手動選食物 ----------
function manualCard() {
  let group = manualGroup || GROUPS[0].key;
  const tabs = h('div', { class: 'chip-scroll' });
  const grid = h('div', { class: 'food-grid' });
  const picker = h('div');

  const drawTabs = () => tabs.replaceChildren(...GROUPS.map((g) =>
    h('button', { class: 'chip' + (g.key === group ? ' on' : ''), onclick: () => { group = manualGroup = g.key; drawTabs(); drawGrid(); picker.replaceChildren(); } },
      `${g.emoji} ${g.key}`)));
  const drawGrid = () => grid.replaceChildren(...foodsIn(group).map((f) =>
    h('button', { class: 'food-btn', onclick: () => pick(f) },
      h('span', { class: 'food-emoji' }, f.emoji), h('span', { class: 'food-name' }, f.name),
      h('span', { class: 'food-kcal' }, `${f.unit} ${f.kcal}`))));

  const pick = (f) => {
    let qty = 1;
    const qtyEl = h('b', { class: 'qty' });
    const kcalEl = h('span');
    const upd = () => { qtyEl.textContent = qty; kcalEl.textContent = `= ${Math.round(f.kcal * qty)} 大卡`; };
    upd();
    picker.replaceChildren(h('div', { class: 'pick-box' },
      h('div', { class: 'pick-title' }, `${f.emoji} ${f.name}（${f.unit}）`),
      h('div', { class: 'row center-row' },
        h('button', { class: 'round-btn', 'aria-label': '少一點', onclick: () => { qty = Math.max(0.5, qty - 0.5); upd(); } }, '−'),
        qtyEl, h('span', {}, '份'),
        h('button', { class: 'round-btn', 'aria-label': '多一點', onclick: () => { qty = Math.min(5, qty + 0.5); upd(); } }, '+'),
      ),
      h('div', { class: 'center muted' }, kcalEl),
      h('button', { class: 'btn block mt', onclick: () => addMeal({
        name: qty === 1 ? `${f.name} ${f.unit}` : `${f.name} ${f.unit} ×${qty}`,
        kcal: Math.round(f.kcal * qty), groups: [f.group],
      }) }, '記下來'),
    ));
    picker.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  };
  drawTabs(); drawGrid();
  return h('div', { class: 'card' }, h('h2', {}, '👆 手動選食物'), tabs, grid, picker);
}

// ---------- 今日餐點 ----------
function mealList(day) {
  return h('div', { class: 'card' },
    h('h2', {}, '📝 今天的餐點'),
    day.meals.length ? h('ul', { class: 'list' }, day.meals.map((m) =>
      h('li', { class: 'list-item' },
        h('span', { class: 'muted small' }, m.time || ''),
        h('span', { class: 'grow' }, m.name),
        h('b', {}, `${m.kcal}`), h('span', { class: 'small muted' }, '大卡'),
        h('button', { class: 'del-btn', 'aria-label': `刪除 ${m.name}`, onclick: () => {
          if (!confirm(`要刪掉「${m.name}」嗎？`)) return;
          updateDay((d) => { d.meals = d.meals.filter((x) => x.id !== m.id); });
          draw(getProfile(), !!safeDemo());
        } }, '🗑️'),
      ))) : h('p', { class: 'muted' }, '還沒有記錄喔。'),
  );
}

// ---------- 我的餐盤 ----------
function plateCard(day) {
  const got = new Set(day.meals.flatMap((m) => m.groups || guessGroups(m.name)));
  const main = GROUPS.filter((g) => g.key !== '點心');
  const missing = main.filter((g) => !got.has(g.key));
  return h('div', { class: 'card' },
    h('h2', {}, '🍽️ 我的餐盤'),
    h('div', { class: 'plate' }, GROUPS.map((g) =>
      h('div', { class: 'plate-cell' + (got.has(g.key) ? ' on' : '') + (g.key === '點心' ? ' snack' : '') },
        h('span', { class: 'plate-emoji' }, g.emoji), h('span', {}, g.key),
        h('span', { class: 'plate-mark' }, got.has(g.key) ? (g.key === '點心' ? '吃了' : '✔') : '—')))),
    h('p', { class: 'small' }, !day.meals.length ? '吃了什麼，這裡就會亮起來。'
      : missing.length ? `今天還少：${missing.map((g) => g.key).join('、')}，下一餐補回來吧！`
      : '五大類都吃到了，好棒！🎉'),
  );
}

// ---------- 吃的 ⇄ 動的 ----------
function swapCard() {
  const tempting = FOODS.filter((f) => f.group === '點心' || f.kcal >= 400);
  const foodSel = h('select', { 'aria-label': '選一種食物' }, tempting.map((f) => h('option', { value: f.name }, `${f.emoji} ${f.unit}${f.name}`)));
  const exSel = h('select', { 'aria-label': '選一種運動' }, EXERCISES.map((e) => h('option', { value: e.id }, `${e.emoji} ${e.name}`)));
  const out = h('div', { class: 'swap-out' });
  const upd = () => {
    const f = tempting.find((x) => x.name === foodSel.value) || tempting[0];
    const ex = EXERCISES.find((e) => String(e.id) === exSel.value) || EXERCISES[0];
    out.replaceChildren(
      `${f.emoji} ${f.unit}${f.name}（${f.kcal} 大卡）≈ ${ex.name}約 `,
      h('b', {}, repsToBurn(f.kcal, ex.id).toLocaleString()), ' 下');
  };
  foodSel.addEventListener('change', upd); exSel.addEventListener('change', upd);
  foodSel.value = '全糖珍奶';
  upd();
  return h('div', { class: 'card swap' }, h('h2', {}, '吃的 ⇄ 動的'), h('div', { class: 'grid2' }, foodSel, exSel), out,
    h('p', { class: 'muted tiny' }, '數字是大約的，讓你知道一杯飲料要動多久才消耗得掉。'));
}
