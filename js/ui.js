import { icon } from './icons.js';
import { mascot } from './mascot.js';
import { verifyAdmin } from './store.js';
export { verifyAdmin };
// 共用小工具
// h('div', {class:'card', onclick: fn}, '文字', child, [children])
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v; // 只用在我們自己寫的固定字串
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// toast(msg, ms)；可選 action：toast(msg, 4000, { label: '復原', onClick })
export function toast(msg, ms = 2200, action = null) {
  const t = h('div', { class: 'toast' + (action ? ' has-action' : ''), role: 'status' }, h('span', {}, msg));
  let timer;
  const hide = () => { clearTimeout(timer); t.classList.remove('show'); setTimeout(() => t.remove(), 300); };
  if (action?.label) t.append(h('button', { class: 'toast-action', type: 'button', onclick: () => { hide(); action.onClick?.(); } }, action.label));
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  timer = setTimeout(hide, action ? Math.max(ms, 4000) : ms);
}

export function go(route) { location.hash = '#' + route; }

// 家長／老師確認：輸入管理密碼（與 AI 連線頁同一組）。回傳 Promise<boolean>
export function askAdmin(reason = '這個動作需要家長或老師確認。') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', placeholder: '管理密碼', 'aria-label': '管理密碼' });
    const err = h('p', { class: 'fine warn-text', hidden: true }, '密碼不正確，請再試一次。');
    const done = (ok) => { overlay.remove(); resolve(ok); };
    const submit = async (e) => {
      e?.preventDefault();
      if (await verifyAdmin(input.value)) done(true);
      else { err.hidden = false; input.value = ''; input.focus(); }
    };
    const overlay = h('div', { class: 'modal-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': '家長確認' },
      h('form', { class: 'modal card', onsubmit: submit },
        h('h2', {}, '🔒 家長確認'),
        h('p', { class: 'small muted' }, reason),
        input, err,
        h('div', { class: 'grid2 mt' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => done(false) }, '取消'),
          h('button', { class: 'btn', type: 'submit' }, '確認')),
      ));
    document.body.append(overlay);
    setTimeout(() => input.focus(), 50);
  });
}

// 模擬來電：網頁 App 不能真的打電話，所以做一個「教練來電」畫面。接聽後進入「通話中」，掛斷才呼叫 onAccept。
export function incomingCall({ title = '教練小健', message = '運動時間到了。', onAccept } = {}) {
  let timer = null;
  const close = () => { clearInterval(timer); try { speechSynthesis.cancel(); } catch {} overlay.remove(); };
  const ringing = [
    mascot('cheer', 'call-avatar'),
    h('div', { class: 'call-title' }, title),
    h('div', { class: 'call-sub' }, '來電提醒'),
    h('div', { class: 'call-actions' },
      h('button', { class: 'call-btn decline', onclick: close, 'aria-label': '拒絕' }, icon('close')),
      h('button', { class: 'call-btn accept', 'aria-label': '接聽', onclick: () => answer() }, icon('phone')),
    ),
  ];
  const overlay = h('div', { class: 'call-overlay', role: 'dialog', 'aria-label': title }, ringing);
  function answer() {
    let sec = 0;
    const clock = h('div', { class: 'call-sub call-timer' }, '00:00');
    timer = setInterval(() => { sec++; clock.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }, 1000);
    overlay.classList.add('in-call');
    overlay.replaceChildren(
      mascot('cheer', 'call-avatar still'),
      h('div', { class: 'call-title' }, title),
      clock,
      h('div', { class: 'call-message' }, message),
      h('button', { class: 'call-end', type: 'button', onclick: () => { close(); onAccept?.(message); } }, icon('phone'), h('span', {}, '結束通話')),
    );
    speak(message);
  }
  document.body.append(overlay);
  try { navigator.vibrate?.([400, 200, 400]); } catch {}
}

// 用手機內建的語音念出來（不需要網路）
export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ''));
    u.lang = 'zh-TW';
    u.rate = 1;
    speechSynthesis.speak(u);
  } catch {}
}
