import { icon } from './icons.js';
import { mascot } from './mascot.js';
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

export function toast(msg, ms = 2200) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

export function go(route) { location.hash = '#' + route; }

// 模擬來電：網頁 App 不能真的打電話，所以做一個「教練來電」畫面
export function incomingCall({ title = '教練小健', message = '運動時間到了。', onAccept } = {}) {
  const close = () => overlay.remove();
  const overlay = h('div', { class: 'call-overlay', role: 'dialog', 'aria-label': title },
    mascot('cheer', 'call-avatar'),
    h('div', { class: 'call-title' }, title),
    h('div', { class: 'call-sub' }, '來電提醒'),
    h('div', { class: 'call-actions' },
      h('button', { class: 'call-btn decline', onclick: close, 'aria-label': '拒絕' }, icon('close')),
      h('button', { class: 'call-btn accept', 'aria-label': '接聽', onclick: () => {
        close();
        speak(message);
        onAccept?.(message);
      } }, icon('phone')),
    ),
  );
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
