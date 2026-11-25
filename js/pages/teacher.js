// 「老師設定」：要密碼才能進入。選 AI 公司、模型、貼上 key、測試連線、清除 key。
// 密碼只存「加鹽的 SHA-256 雜湊」，不存明碼；key 只存在這支手機的瀏覽器。
import { h, toast } from '../ui.js';
import * as store from '../store.js';
import * as ai from '../ai/index.js';

const PASS_KEY = 'teacher.pass';
let unlocked = false; // 只記在記憶體；離開這一頁就上鎖
let testCtrl = null;

function toHex(buf) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function hashPass(salt, pw) {
  const data = new TextEncoder().encode(salt + ':' + pw);
  return toHex(await crypto.subtle.digest('SHA-256', data));
}
function newSalt() { const a = new Uint8Array(16); crypto.getRandomValues(a); return toHex(a); }
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function pwField(label, attrs = {}) {
  const input = h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', ...attrs });
  const eye = h('button', { class: 'eye-btn', type: 'button', 'aria-label': '顯示', onclick: () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.textContent = show ? '🙈' : '👁️';
    eye.setAttribute('aria-label', show ? '隱藏' : '顯示');
  } }, '👁️');
  const wrap = h('div', {}, h('label', { for: attrs.id }, label), h('div', { class: 'pw-wrap' }, input, eye));
  return { wrap, input };
}

export function render(root) {
  root.classList.add('teacher-root');
  draw(root);
}

function draw(root) {
  root.replaceChildren();
  if (!globalThis.crypto?.subtle) {
    root.append(h('div', { class: 'card' }, h('h2', {}, '🔒 老師設定'),
      h('p', {}, '這個網址不安全（不是 https），手機不能做密碼加密。請用正式的 https 網址或 localhost 打開。')));
    return;
  }
  const pass = store.getItem(PASS_KEY, null);
  if (!pass?.hash) return drawSetup(root);
  if (!unlocked) return drawLogin(root, pass);
  drawSettings(root);
}

function drawSetup(root) {
  const a = pwField('設定老師密碼（至少 4 碼）', { id: 'tp-new', inputmode: 'text' });
  const b = pwField('再輸入一次', { id: 'tp-new2' });
  const msg = h('p', { class: 'teacher-msg', role: 'alert' });
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const p1 = a.input.value; const p2 = b.input.value;
    if (p1.length < 4) { msg.textContent = '密碼至少要 4 碼喔'; return; }
    if (p1 !== p2) { msg.textContent = '兩次輸入的密碼不一樣'; return; }
    const salt = newSalt();
    store.setItem(PASS_KEY, { salt, hash: await hashPass(salt, p1) });
    unlocked = true;
    toast('密碼設定好了');
    draw(root);
  } },
    h('h2', {}, '🔒 第一次使用：設定老師密碼'),
    h('p', { class: 'small muted' }, '這一頁給老師或家長設定 AI。學生不用進來喔！'),
    a.wrap, b.wrap, msg,
    h('button', { class: 'btn block', type: 'submit' }, '設定密碼'),
  );
  root.append(form);
}

function drawLogin(root, pass) {
  const a = pwField('老師密碼', { id: 'tp-pass' });
  const msg = h('p', { class: 'teacher-msg', role: 'alert' });
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const hv = await hashPass(pass.salt, a.input.value);
    if (safeEqual(hv, pass.hash)) { unlocked = true; draw(root); }
    else { msg.textContent = '密碼不對喔'; a.input.value = ''; a.input.focus(); }
  } },
    h('h2', {}, '🔒 老師設定'),
    h('p', { class: 'small muted' }, '請輸入老師密碼才能進入。'),
    a.wrap, msg,
    h('button', { class: 'btn block', type: 'submit' }, '進入'),
  );
  const reset = h('div', { class: 'card' },
    h('p', { class: 'small' }, '忘記密碼？可以重設，但為了安全，所有 AI 的 key 也會一起清除。'),
    h('button', { class: 'btn ghost block', type: 'button', onclick: () => {
      if (!confirm('重設密碼會同時清除所有 AI 的 key，確定嗎？')) return;
      ai.clearKeys();
      store.removeItem(PASS_KEY);
      unlocked = false;
      toast('已重設，所有 key 都清除了');
      draw(root);
    } }, '忘記密碼，重設'),
  );
  root.append(form, reset);
  setTimeout(() => a.input.focus(), 50);
}

function drawSettings(root) {
  let cfg = ai.getConfig();
  let provider = cfg.provider;

  const status = h('p', { class: 'teacher-status' });
  const provRow = h('div', { class: 'prov-row', role: 'radiogroup', 'aria-label': 'AI 公司' });
  const modelSel = h('select', { id: 'tp-model' });
  const key = pwField('API key（貼上）', { id: 'tp-key', placeholder: '貼上 key', autocomplete: 'off' });
  const testOut = h('p', { class: 'teacher-msg', role: 'status' });
  const geminiWarn = h('p', { class: 'teacher-warn', role: 'alert', hidden: true },
    '⚠️ Gemini 的使用規定不允許給未滿 18 歲的人用，建議選 Claude。');
  const testBtn = h('button', { class: 'btn secondary block', type: 'button', onclick: doTest }, '🔌 測試連線');

  function updateStatus() {
    const c = ai.getConfig();
    const has = Object.entries(c.keys).filter(([, v]) => v).map(([k]) => ai.PROVIDERS[k].NAME);
    status.textContent = ai.isDemo()
      ? `目前：示範模式（${c.keys[c.provider] ? '沒有網路' : '「' + ai.PROVIDERS[c.provider].NAME + '」還沒有 key'}）`
      : `目前使用：${ai.PROVIDERS[c.provider].NAME}／${c.model}`;
    if (has.length) status.textContent += `。已存 key：${has.join('、')}`;
  }

  function drawProvider() {
    const P = ai.PROVIDERS[provider];
    provRow.replaceChildren(...Object.entries(ai.PROVIDERS).map(([id, mod]) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(id === provider), class: 'chip' + (id === provider ? ' on' : ''),
        onclick: () => { provider = id; drawProvider(); } }, mod.NAME)));
    geminiWarn.hidden = provider !== 'gemini';
    const curModel = provider === cfg.provider ? cfg.model : P.DEFAULT_MODEL;
    modelSel.replaceChildren(...P.MODELS.map((m) => h('option', { value: m.id, selected: m.id === curModel }, m.label)));
    key.input.value = ai.getConfig().keys[provider] || '';
    key.input.type = 'password';
    testOut.textContent = '';
  }

  function save(quiet) {
    const k = key.input.value.trim();
    cfg = ai.setConfig({ provider, model: modelSel.value, keys: { [provider]: k } });
    updateStatus();
    if (!quiet) toast(k ? '已儲存' : '已儲存（這家沒有 key，會用示範模式）');
  }

  async function doTest() {
    const k = key.input.value.trim();
    if (!k) { testOut.textContent = '請先貼上 key'; testOut.className = 'teacher-msg bad'; return; }
    save(true);
    testBtn.disabled = true;
    testOut.className = 'teacher-msg';
    testOut.textContent = '測試中…';
    testCtrl = new AbortController();
    const timer = setTimeout(() => testCtrl?.abort(), 20000);
    try {
      const r = await ai.testConnection({ provider, model: modelSel.value, key: k, signal: testCtrl.signal });
      if (!testOut.isConnected) return;
      if (r.ok) { testOut.className = 'teacher-msg good'; testOut.textContent = '✅ 連線成功！AI 回答：' + r.text; }
      else { testOut.className = 'teacher-msg bad'; testOut.textContent = `❌ 連線失敗：${r.reason}${r.status ? `（代碼 ${r.status}）` : ''}`; }
    } catch {
      testOut.className = 'teacher-msg bad'; testOut.textContent = '❌ 連線失敗';
    } finally {
      clearTimeout(timer); testCtrl = null; testBtn.disabled = false;
    }
  }

  root.append(
    h('div', { class: 'card' },
      h('div', { class: 'row teacher-head' }, h('h2', {}, '🤖 AI 設定'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { unlocked = false; draw(root); } }, '🔒 上鎖')),
      status,
      h('label', {}, '1. 選 AI 公司'), provRow, geminiWarn,
      h('label', { for: 'tp-model' }, '2. 選模型'), modelSel,
      key.wrap,
      h('p', { class: 'small muted' }, 'key 只存在這支手機的瀏覽器，不會上傳到我們的伺服器（只會直接送給你選的 AI 公司）。'),
      h('div', { class: 'teacher-actions' },
        h('button', { class: 'btn block', type: 'button', onclick: () => save(false) }, '💾 儲存'),
        testBtn),
      testOut,
    ),
    h('div', { class: 'card' },
      h('h2', {}, '🧹 清除'),
      h('button', { class: 'btn danger block', type: 'button', onclick: () => {
        if (!confirm('確定要清除這支手機上所有 AI 的 key 嗎？')) return;
        ai.clearKeys(); drawProvider(); updateStatus(); toast('所有 key 都清除了');
      } }, '一鍵清除所有 key'),
    ),
    h('div', { class: 'card teacher-tips' },
      h('h2', {}, '⚠️ 老師請注意'),
      h('ul', {},
        h('li', {}, '請到 AI 公司的後台設定「每月花費上限」，避免花太多錢。'),
        h('li', {}, '展示用的手機不要借給不認識的人。'),
        h('li', {}, '比賽結束後，請到 AI 公司後台把這把 key 作廢（刪除）。'),
        h('li', {}, 'key 只存在這支手機的瀏覽器；按上面「一鍵清除」就會刪掉。'),
        h('li', {}, 'AI 公司官方都建議 key 不要放在網頁裡，所以請用「專門給這次展示」的 key。'),
      ),
    ),
  );
  modelSel.addEventListener('change', () => { testOut.textContent = ''; });
  drawProvider();
  updateStatus();
}

export function leave() {
  unlocked = false; // 離開就上鎖
  try { testCtrl?.abort(); } catch {}
  testCtrl = null;
  document.getElementById('view')?.classList.remove('teacher-root');
}
