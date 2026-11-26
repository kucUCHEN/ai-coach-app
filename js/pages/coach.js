// 首頁「AI教練」：打開就看到教練，主動問候 + 聊天
import { h, toast, go, speak, incomingCall } from '../ui.js';
import * as store from '../store.js';
import * as ai from '../ai/index.js';
import { icon } from '../icons.js';
import { mascot, moodOf } from '../mascot.js';
import { scoreDay } from '../health.js';
import { parseLog, applyLog } from '../quicklog.js';

const QUICK = ['🍱 我午餐吃了雞腿便當', '🪢 跳繩 200 下', '🍽️ 晚餐怎麼吃比較好？', '📊 我今天的表現如何？'];

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
  const am = /(\d{1,3})\s*歲/.exec(text);
  if (hm) { const v = Number(hm[1]); if (v >= 90 && v <= 230) out.heightCm = v; }
  if (wm) { const v = Number(wm[1]); if (v >= 12 && v <= 250) out.weightKg = v; }
  if (am) { const v = Number(am[1]); if (v >= 2 && v <= 110) out.age = v; }
  if (/(我是|我)\s*(\d+\s*歲\s*(的)?)?\s*男(生|孩)|^\s*男(生|孩)|\s男(生|孩)/.test(text)) out.sex = 'M';
  if (/(我是|我)\s*(\d+\s*歲\s*(的)?)?\s*女(生|孩)|^\s*女(生|孩)|\s女(生|孩)/.test(text)) out.sex = 'F';
  return out;
}

function speakerBtn(text) {
  return h('button', { class: 'coach-speak', type: 'button', 'aria-label': '朗讀', onclick: () => speak(text) }, icon('speaker'));
}

function bubble(m) {
  const isCoach = m.role === 'assistant';
  const textEl = h('div', { class: 'bubble-text' });
  textEl.textContent = m.content; // 一律用 textContent，不用 innerHTML
  return h('div', { class: 'msg ' + (isCoach ? 'from-coach' : 'from-me') },
    isCoach ? mascot('good', 'msg-avatar') : null,
    h('div', { class: 'bubble' },
      textEl,
      h('div', { class: 'msg-meta' }, h('span', {}, timeStr(m.time)), isCoach ? speakerBtn(m.content) : null),
    ),
  );
}

function todayMood(profile) {
  const day = store.getDay();
  if (!profile || !(day.meals.length || day.workouts.length)) return 'cheer';
  return moodOf(scoreDay(day, profile).total).mood;
}

export function render(root) {
  const profile = store.getProfile();
  const greet = ai.coachNudge({ profile, day: store.getDay() });
  const greetText = h('p', { class: 'coach-greet-text' });
  greetText.textContent = greet;

  const badge = h('span', { class: 'demo-badge', hidden: !ai.isDemo() }, '示範模式');
  const list = h('div', { class: 'chat-list', 'aria-live': 'polite' });
  const input = h('input', { type: 'text', class: 'chat-input', placeholder: '例如：午餐吃了滷肉飯', enterkeyhint: 'send', 'aria-label': '輸入訊息', maxlength: '300' });
  const sendBtn = h('button', { class: 'chat-send', type: 'submit', 'aria-label': '送出' }, icon('send'));
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = h('button', { class: 'chat-mic', type: 'button', 'aria-label': '語音輸入', onclick: toggleMic }, icon('mic'));

  function refreshBadge() { badge.hidden = !(ai.isDemo() || ai.lastStatus().demo); }
  badge.hidden = !ai.isDemo();

  function drawChat(scroll = true) {
    const chat = store.getChat();
    list.replaceChildren(...chat.map(bubble));
    if (!profile && chat.length === 0) {
      list.append(h('div', { class: 'coach-tip card' },
        h('p', {}, '建立基本資料後，教練能給你更準確的建議。'),
        h('button', { class: 'btn block', type: 'button', onclick: () => go('body') }, '建立基本資料'),
        h('p', { class: 'small muted' }, '也可以直接輸入，例如：「我 35 歲，身高 170、體重 65」'),
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
      if (found.sex) bits.push(found.sex === 'M' ? '男' : '女');
      localReply = `已更新你的資料：${bits.join('、')}。`;
      if (!p.heightCm || !p.weightKg) localReply += p.heightCm ? ' 也請告訴我你的體重。' : ' 也請告訴我你的身高。';
    }

    // 一句話記錄飲食或運動
    const logged = applyLog(parseLog(text));
    if (logged) localReply = (localReply ? localReply + '\n' : '') + logged;

    drawChat();
    const typing = h('div', { class: 'msg from-coach typing' },
      mascot('ok', 'msg-avatar'),
      h('div', { class: 'bubble' }, h('span', { class: 'dots', 'aria-label': '正在回覆' }, '・・・')));
    list.append(typing);
    { const v = root.closest('.view') || root; v.scrollTop = v.scrollHeight; }
    sendBtn.disabled = true;

    controller = new AbortController();
    let reply = '';
    try {
      if (localReply && ai.isDemo()) reply = localReply + (logged ? '\n' + ai.coachNudge({ profile: store.getProfile(), day: store.getDay() }) : ' 我會依照這些資料給你建議。');
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
    if (!SR) { toast('此瀏覽器不支援語音輸入，請使用鍵盤上的麥克風', 3200); input.focus(); return; }
    if (recog) { recog.stop(); return; }
    try {
      recog = new SR();
      recog.lang = 'zh-TW';
      recog.interimResults = true;
      recog.maxAlternatives = 1;
      micBtn.classList.add('listening');
      micBtn.setAttribute('aria-label', '停止');
      let finalText = '';
      recog.onresult = (e) => {
        let t = '';
        for (const r of e.results) { t += r[0].transcript; if (r.isFinal) finalText = t; }
        input.value = t;
      };
      recog.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('請允許使用麥克風，或使用鍵盤上的麥克風', 3200);
        else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('沒有聽清楚，請再說一次');
      };
      recog.onend = () => {
        micBtn.classList.remove('listening');
        micBtn.setAttribute('aria-label', '語音輸入');
        recog = null;
        if (finalText.trim()) send(finalText);
      };
      recog.start();
    } catch {
      recog = null;
      micBtn.classList.remove('listening');
      toast('請使用鍵盤上的麥克風', 3000);
    }
  }

  const form = h('form', { class: 'chat-composer', onsubmit: (e) => { e.preventDefault(); send(input.value); } },
    micBtn, input, sendBtn);

  root.append(
    h('div', { class: 'coach-page' },
      
      h('section', { class: 'coach-hero card' },
        h('div', { class: 'coach-hero-top' },
          mascot(todayMood(profile), 'coach-face'),
          h('div', { class: 'coach-name' }, h('strong', {}, '教練小健'), ' ', badge,
            h('div', { class: 'coach-ai-note' }, 'AI 健康教練（非真人）')),
          speakerBtn(greet),
        ),
        greetText,
        h('button', { class: 'btn ghost block coach-call', type: 'button', onclick: () => incomingCall({
          title: 'AI 教練', message: ai.coachNudge({ profile: store.getProfile(), day: store.getDay() }),
          onAccept: (msg) => { addMsg('assistant', msg); drawChat(); },
        }) }, icon('phone'), '模擬來電提醒'),
      ),
      list,
      h('p', { class: 'fine center' }, 'AI 建議僅供參考，不能取代醫療診斷。身體不適請就醫。'),
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
