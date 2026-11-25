// 首頁「AI教練」：打開就看到教練，主動問候 + 聊天
import { h, toast, go, speak, incomingCall } from '../ui.js';
import * as store from '../store.js';
import * as ai from '../ai/index.js';

const QUICK = ['我要怎麼長高？', '晚餐吃什麼？', '我今天表現怎樣？'];

let controller = null;
let recog = null;
let unsub = null;

const timeStr = (t) => {
  const d = new Date(t || Date.now());
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 從一句話抓身高、體重、年齡、性別，例如「我身高145 體重38」「我10歲 男生」
export function parseProfileText(text) {
  const out = {};
  const hm = /身高\s*(?:是|有)?\s*(\d{2,3}(?:\.\d+)?)\s*(?:公分|cm|㎝)?/i.exec(text);
  const wm = /體重\s*(?:是|有)?\s*(\d{2,3}(?:\.\d+)?)\s*(?:公斤|kg|㎏)?/i.exec(text);
  const am = /(\d{1,2})\s*歲/.exec(text);
  if (hm) { const v = Number(hm[1]); if (v >= 90 && v <= 200) out.heightCm = v; }
  if (wm) { const v = Number(wm[1]); if (v >= 12 && v <= 150) out.weightKg = v; }
  if (am) { const v = Number(am[1]); if (v >= 5 && v <= 15) out.age = v; }
  if (/(我是|我)\s*(\d+\s*歲\s*(的)?)?\s*男(生|孩)|^\s*男(生|孩)|\s男(生|孩)/.test(text)) out.sex = 'M';
  if (/(我是|我)\s*(\d+\s*歲\s*(的)?)?\s*女(生|孩)|^\s*女(生|孩)|\s女(生|孩)/.test(text)) out.sex = 'F';
  return out;
}

function speakerBtn(text) {
  return h('button', { class: 'coach-speak', type: 'button', 'aria-label': '念出來', onclick: () => speak(text) }, '🔊');
}

function bubble(m) {
  const isCoach = m.role === 'assistant';
  const textEl = h('div', { class: 'bubble-text' });
  textEl.textContent = m.content; // 一律用 textContent，不用 innerHTML
  return h('div', { class: 'msg ' + (isCoach ? 'from-coach' : 'from-me') },
    isCoach ? h('div', { class: 'msg-avatar', 'aria-hidden': 'true' }, '🤖') : null,
    h('div', { class: 'bubble' },
      textEl,
      h('div', { class: 'msg-meta' }, h('span', {}, timeStr(m.time)), isCoach ? speakerBtn(m.content) : null),
    ),
  );
}

export function render(root) {
  const profile = store.getProfile();
  const greet = ai.coachNudge({ profile, day: store.getDay() });
  const greetText = h('p', { class: 'coach-greet-text' });
  greetText.textContent = greet;

  const badge = h('span', { class: 'demo-badge', hidden: !ai.isDemo() }, '示範模式');
  const list = h('div', { class: 'chat-list', 'aria-live': 'polite' });
  const input = h('input', { type: 'text', class: 'chat-input', placeholder: '跟教練說說話…', enterkeyhint: 'send', 'aria-label': '輸入訊息', maxlength: '300' });
  const sendBtn = h('button', { class: 'btn chat-send', type: 'submit', 'aria-label': '送出' }, '送出');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = h('button', { class: 'chat-mic', type: 'button', 'aria-label': '用說的', onclick: toggleMic }, '🎤');

  function refreshBadge() { badge.hidden = !(ai.isDemo() || ai.lastStatus().demo); }
  badge.hidden = !ai.isDemo();

  function drawChat(scroll = true) {
    const chat = store.getChat();
    list.replaceChildren(...chat.map(bubble));
    if (!profile && chat.length === 0) {
      list.append(h('div', { class: 'coach-tip card' },
        h('p', {}, '還不認識你喔！你可以：'),
        h('button', { class: 'btn block', type: 'button', onclick: () => go('body') }, '⚖️ 去「身體」頁填資料'),
        h('p', { class: 'small muted' }, '或直接在下面打字：「我身高145 體重38」'),
      ));
    }
    if (scroll) requestAnimationFrame(() => { const v = root.closest('.view') || root; v.scrollTop = v.scrollHeight; });
  }

  function addMsg(role, content) {
    const chat = store.getChat();
    chat.push({ role, content, time: Date.now() });
    store.setChat(chat);
    return chat;
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || controller) return;
    input.value = '';
    let chat = addMsg('user', text);

    // 對話裡說了身高體重 → 寫進個人資料
    const found = parseProfileText(text);
    let localReply = '';
    if (Object.keys(found).length) {
      const p = { goal: 'keep', activity: 'mid', ...(store.getProfile() || {}), ...found };
      store.setProfile(p);
      const bits = [];
      if (found.heightCm) bits.push(`身高 ${found.heightCm} 公分`);
      if (found.weightKg) { bits.push(`體重 ${found.weightKg} 公斤`); try { store.addWeight(found.weightKg); } catch {} }
      if (found.age) bits.push(`${found.age} 歲`);
      if (found.sex) bits.push(found.sex === 'M' ? '男生' : '女生');
      localReply = `好的，教練記下來了：${bits.join('、')} 📝`;
      if (!p.heightCm || !p.weightKg) localReply += p.heightCm ? ' 再告訴我你的體重吧！' : ' 再告訴我你的身高吧！';
    }

    drawChat();
    const typing = h('div', { class: 'msg from-coach typing' },
      h('div', { class: 'msg-avatar', 'aria-hidden': 'true' }, '🤖'),
      h('div', { class: 'bubble' }, h('span', { class: 'dots', 'aria-label': '教練正在想' }, '・・・')));
    list.append(typing);
    { const v = root.closest('.view') || root; v.scrollTop = v.scrollHeight; }
    sendBtn.disabled = true;

    controller = new AbortController();
    let reply = '';
    try {
      if (localReply && ai.isDemo()) reply = localReply + ' 我們一起加油吧！💪';
      else {
        reply = await ai.chat(chat.map((m) => ({ role: m.role, content: m.content })), { signal: controller.signal });
        if (localReply) reply = localReply + '\n' + reply;
      }
    } catch {
      reply = ai.demoReply(text);
    } finally {
      controller = null;
      sendBtn.disabled = false;
    }
    if (!list.isConnected) return; // 已經換頁
    if (reply) addMsg('assistant', reply);
    refreshBadge();
    drawChat();
  }

  function toggleMic() {
    if (!SR) { toast('這支手機不能直接聽喔，請按鍵盤上的 🎤 麥克風說話', 3200); input.focus(); return; }
    if (recog) { recog.stop(); return; }
    try {
      recog = new SR();
      recog.lang = 'zh-TW';
      recog.interimResults = true;
      recog.maxAlternatives = 1;
      micBtn.classList.add('listening');
      micBtn.setAttribute('aria-label', '停止聽');
      let finalText = '';
      recog.onresult = (e) => {
        let t = '';
        for (const r of e.results) { t += r[0].transcript; if (r.isFinal) finalText = t; }
        input.value = t;
      };
      recog.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('需要允許使用麥克風喔，或用鍵盤上的 🎤', 3200);
        else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('沒聽清楚，再說一次好嗎？');
      };
      recog.onend = () => {
        micBtn.classList.remove('listening');
        micBtn.setAttribute('aria-label', '用說的');
        recog = null;
        if (finalText.trim()) send(finalText);
      };
      recog.start();
    } catch {
      recog = null;
      micBtn.classList.remove('listening');
      toast('請按鍵盤上的 🎤 麥克風說話', 3000);
    }
  }

  const form = h('form', { class: 'chat-composer', onsubmit: (e) => { e.preventDefault(); send(input.value); } },
    micBtn, input, sendBtn);

  root.append(
    h('div', { class: 'coach-page' },
      h('div', { class: 'coach-notice', role: 'note' }, 'AI教練不是醫生，身體不舒服要告訴大人喔'),
      h('section', { class: 'coach-hero card' },
        h('div', { class: 'coach-hero-top' },
          h('div', { class: 'coach-face', 'aria-hidden': 'true' }, '🤖'),
          h('div', { class: 'coach-name' }, h('strong', {}, 'AI 教練'), ' ', badge,
            h('div', { class: 'coach-ai-note' }, '我是 AI 教練（電腦程式），不是真人')),
          speakerBtn(greet),
        ),
        greetText,
        h('button', { class: 'btn secondary block coach-call', type: 'button', onclick: () => incomingCall({
          title: 'AI教練來電', message: ai.coachNudge({ profile: store.getProfile(), day: store.getDay() }),
          onAccept: (msg) => { addMsg('assistant', '📞 ' + msg); drawChat(); },
        }) }, '📞 教練來電（示範）'),
      ),
      list,
      h('div', { class: 'quick-row' }, QUICK.map((q) => h('button', { class: 'chip', type: 'button', onclick: () => send(q) }, q))),
      form,
    ),
  );
  drawChat(false); // 打開時停在上面，先看到教練的問候

  unsub = store.subscribe((k) => { if (k === 'teacher.ai') refreshBadge(); });
}

export function leave() {
  try { controller?.abort(); } catch {}
  controller = null;
  try { recog?.abort(); } catch {}
  recog = null;
  try { speechSynthesis.cancel(); } catch {}
  unsub?.(); unsub = null;
}
