// 「AI 連線設定」：要管理密碼才能進入。選 AI 公司、模型、貼上 key、測試連線、清除 key。
// 密碼只存「加鹽的 SHA-256 雜湊」，不存明碼；key 只存在這支手機的瀏覽器。
import { h, toast } from '../ui.js';
import * as store from '../store.js';
import * as ai from '../ai/index.js';
import { icon } from '../icons.js';

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
    eye.classList.toggle('on', show);
    eye.setAttribute('aria-label', show ? '隱藏' : '顯示');
  } }, icon('eye'));
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
    root.append(h('div', { class: 'card' }, h('h2', {}, 'AI 連線設定'),
      h('p', {}, '目前網址不是 https，無法使用密碼加密。請改用正式的 https 網址或 localhost 開啟。')));
    return;
  }
  const pass = store.getItem(PASS_KEY, null);
  if (!pass?.hash) return drawSetup(root);
  if (!unlocked) return drawLogin(root, pass);
  drawSettings(root);
}

function drawSetup(root) {
  const a = pwField('設定管理密碼（至少 4 碼）', { id: 'tp-new', inputmode: 'text' });
  const b = pwField('再輸入一次', { id: 'tp-new2' });
  const msg = h('p', { class: 'teacher-msg', role: 'alert' });
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const p1 = a.input.value; const p2 = b.input.value;
    if (p1.length < 4) { msg.textContent = '密碼至少需要 4 碼'; return; }
    if (p1 !== p2) { msg.textContent = '兩次輸入的密碼不一致'; return; }
    const salt = newSalt();
    store.setItem(PASS_KEY, { salt, hash: await hashPass(salt, p1) });
    unlocked = true;
    toast('已設定管理密碼');
    draw(root);
  } },
    h('h2', {}, '設定管理密碼'),
    h('p', { class: 'small muted' }, 'API key 會產生費用，請設定密碼保護這個頁面，避免他人修改。'),
    a.wrap, b.wrap, msg,
    h('button', { class: 'btn block mt', type: 'submit' }, '設定密碼'),
  );
  root.append(form);
}

function drawLogin(root, pass) {
  const a = pwField('管理密碼', { id: 'tp-pass' });
  const msg = h('p', { class: 'teacher-msg', role: 'alert' });
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    const hv = await hashPass(pass.salt, a.input.value);
    if (safeEqual(hv, pass.hash)) { unlocked = true; draw(root); }
    else { msg.textContent = '密碼錯誤'; a.input.value = ''; a.input.focus(); }
  } },
    h('h2', {}, 'AI 連線設定'),
    h('p', { class: 'small muted' }, '請輸入管理密碼。'),
    a.wrap, msg,
    h('button', { class: 'btn block mt', type: 'submit' }, '解鎖'),
  );
  const reset = h('div', { class: 'card' },
    h('p', { class: 'small muted' }, '忘記密碼時可以重設，但為了安全，所有已儲存的 API key 會一併清除。'),
    h('button', { class: 'btn ghost block', type: 'button', onclick: () => {
      if (!confirm('重設密碼會同時清除所有 API key，確定嗎？')) return;
      ai.clearKeys();
      store.removeItem(PASS_KEY);
      unlocked = false;
      toast('已重設，API key 已清除');
      draw(root);
    } }, '忘記密碼'),
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
  const key = pwField('API key', { id: 'tp-key', placeholder: '貼上 API key', autocomplete: 'off' });
  const testOut = h('p', { class: 'teacher-msg', role: 'status' });
  const geminiWarn = h('p', { class: 'teacher-warn', role: 'alert', hidden: true },
    'Gemini API 的使用條款不允許用於可能有未滿 18 歲使用者的服務。若使用者包含未成年人，建議改用 Claude。');
  const testBtn = h('button', { class: 'btn ghost block', type: 'button', onclick: doTest }, '測試連線');

  function updateStatus() {
    const c = ai.getConfig();
    const has = Object.entries(c.keys).filter(([, v]) => v).map(([k]) => ai.PROVIDERS[k].NAME);
    status.textContent = ai.isDemo()
      ? `目前：示範模式（${c.keys[c.provider] ? '沒有網路' : ai.PROVIDERS[c.provider].NAME + ' 尚未設定 API key'}）`
      : `目前使用：${ai.PROVIDERS[c.provider].NAME}／${c.model}`;
    if (has.length) status.textContent += `。已儲存：${has.join('、')}`;
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
    if (!quiet) toast(k ? '已儲存' : '已儲存（未設定 API key，將使用示範模式）');
  }

  async function doTest() {
    const k = key.input.value.trim();
    if (!k) { testOut.textContent = '請先輸入 API key'; testOut.className = 'teacher-msg bad'; return; }
    save(true);
    testBtn.disabled = true;
    testOut.className = 'teacher-msg';
    testOut.textContent = '測試中…';
    testCtrl = new AbortController();
    const timer = setTimeout(() => testCtrl?.abort(), 20000);
    try {
      const r = await ai.testConnection({ provider, model: modelSel.value, key: k, signal: testCtrl.signal });
      if (!testOut.isConnected) return;
      if (r.ok) { testOut.className = 'teacher-msg good'; testOut.textContent = '連線成功。AI 回覆：' + r.text; }
      else { testOut.className = 'teacher-msg bad'; testOut.textContent = `連線失敗：${r.reason}${r.status ? `（代碼 ${r.status}）` : ''}`; }
    } catch {
      testOut.className = 'teacher-msg bad'; testOut.textContent = '連線失敗';
    } finally {
      clearTimeout(timer); testCtrl = null; testBtn.disabled = false;
    }
  }

  root.append(
    h('div', { class: 'card' },
      h('div', { class: 'row teacher-head' }, h('h2', {}, 'AI 服務'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { unlocked = false; draw(root); } }, icon('lock'), '鎖定')),
      status,
      h('label', {}, '服務商'), provRow, geminiWarn,
      h('label', { for: 'tp-model' }, '模型'), modelSel,
      key.wrap,
      h('p', { class: 'fine' }, 'API key 只存在這支手機的瀏覽器，只會直接傳送給你選擇的 AI 服務商。'),
      h('div', { class: 'teacher-actions' },
        h('button', { class: 'btn block', type: 'button', onclick: () => save(false) }, '儲存'),
        testBtn),
      testOut,
    ),
    h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('div', {}, h('div', { class: 'bold' }, '清除所有 API key'), h('div', { class: 'muted small' }, '刪除這支手機上儲存的全部 key。')),
      h('button', { class: 'btn danger', type: 'button', onclick: () => {
        if (!confirm('確定要清除這支手機上所有的 API key 嗎？')) return;
        ai.clearKeys(); drawProvider(); updateStatus(); toast('API key 已清除');
      } }, '清除')),
    ),
    h('div', { class: 'card teacher-tips' },
      h('h2', {}, '使用須知'),
      h('ul', {},
        h('li', {}, '請在 AI 服務商後台設定每月花費上限。'),
        h('li', {}, '已輸入 key 的手機請勿借給他人。'),
        h('li', {}, '不再使用時，請到服務商後台撤銷（刪除）這把 key。'),
        
        h('li', {}, '服務商建議不要把 key 放在網頁中，請建立專用的 key，不要與其他用途共用。'),
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
