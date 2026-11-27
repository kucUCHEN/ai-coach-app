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
export function incomingCall({ title = '教練小健', message = '運動時間到了。', onAccept, live = false, opener, converse } = {}) {
  let timer = null, recog = null, ended = false;
  const transcript = [];   // [{role, content}]
  const close = () => { ended = true; clearInterval(timer); try { recog?.abort(); } catch {} try { speechSynthesis.cancel(); } catch {} overlay.remove(); };
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
    const msgEl = h('div', { class: 'call-message' }, live ? '接通中…' : message);
    const status = h('div', { class: 'call-status' });
    const endCall = () => {
      const said = transcript.length ? transcript.map((m) => (m.role === 'user' ? '你：' : '小健：') + m.content).join('\n') : message;
      close(); onAccept?.(live && transcript.length ? `📞 通話紀錄\n${said}` : message);
    };
    const parts = [mascot('cheer', 'call-avatar still'), h('div', { class: 'call-title' }, title), clock, msgEl, status];
    // 真的對話：說話按鈕＋打字備案
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const talkBtn = h('button', { class: 'call-talk', type: 'button', onclick: () => listen() }, icon('mic'), h('span', {}, '按一下說話'));
    const typeIn = h('input', { type: 'text', class: 'call-type', placeholder: '也可以打字回覆', enterkeyhint: 'send', maxlength: '200' });
    const typeForm = h('form', { class: 'call-type-row', onsubmit: (e) => { e.preventDefault(); const t = typeIn.value.trim(); typeIn.value = ''; if (t) userSaid(t); } }, typeIn);
    if (live) parts.push(SR ? talkBtn : '', typeForm);
    parts.push(h('button', { class: 'call-end', type: 'button', onclick: endCall }, icon('phone'), h('span', {}, '結束通話')));
    overlay.replaceChildren(...parts);

    async function coachSays(text) {
      if (ended) return;
      transcript.push({ role: 'assistant', content: text });
      msgEl.textContent = text;
      status.textContent = '';
      await speakAsync(text);
      if (!ended && live && SR) listen();   // 說完自動聽使用者回答
    }
    async function userSaid(text) {
      if (ended) return;
      transcript.push({ role: 'user', content: text });
      msgEl.textContent = '你：' + text;
      status.textContent = '小健正在想…';
      if (/掛了|再見|拜拜|先這樣|bye/i.test(text) && transcript.length > 2) { await coachSays('好，那我們下次再聊，記得照計畫動一動喔，再見！'); setTimeout(endCall, 400); return; }
      try { await coachSays(await converse(transcript)); } catch { status.textContent = '連線不穩，請再說一次'; }
    }
    function listen() {
      if (!SR || ended || recog) return;
      try {
        recog = new SR(); recog.lang = 'zh-TW'; recog.interimResults = false;
        status.textContent = '🎙️ 請說話…';
        talkBtn.classList.add('listening');
        let got = '';
        recog.onresult = (e) => { got = e.results[0][0].transcript; };
        recog.onerror = () => { status.textContent = '沒聽清楚，按「說話」再試一次，或用打字'; };
        recog.onend = () => { recog = null; talkBtn.classList.remove('listening'); if (got.trim()) userSaid(got.trim()); else if (!ended && status.textContent === '🎙️ 請說話…') status.textContent = '按「說話」回答小健，或用打字'; };
        recog.start();
      } catch { recog = null; status.textContent = '這支手機不能用語音，請用打字回覆'; }
    }
    if (live) {
      opener().then((t) => coachSays(t || message)).catch(() => coachSays(message));
    } else speak(message);
  }
  document.body.append(overlay);
  try { navigator.vibrate?.([400, 200, 400]); } catch {}
}

// 念完才繼續（通話用）
export function speakAsync(text) {
  return new Promise((resolve) => {
    try {
      if (!('speechSynthesis' in window)) return resolve();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ''));
      u.lang = 'zh-TW'; u.rate = 1;
      u.onend = u.onerror = () => resolve();
      speechSynthesis.speak(u);
      setTimeout(resolve, 20000); // 保險：最多等 20 秒
    } catch { resolve(); }
  });
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
