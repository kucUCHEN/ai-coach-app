// 首頁「AI教練」：打開就看到教練，主動問候 + 聊天
import { h, toast, go, speak, incomingCall } from '../ui.js';
import * as store from '../store.js';
import * as ai from '../ai/index.js';
import { icon } from '../icons.js';
import { mascot, moodOf } from '../mascot.js';
import { scoreDay, ageMode } from '../health.js';
import { parseLog, applyLog, undoLog, goalChange } from '../quicklog.js';

const QUICK = {
  child: ['🏀 打籃球 30 分鐘', '🥛 怎麼長高？', '🍱 午餐吃了雞腿便當', '📊 我今天的表現如何？'],
  teen: ['🏀 打籃球 30 分鐘', '💪 一天要吃多少蛋白質？', '🍱 午餐吃了雞腿便當', '📊 我今天的表現如何？'],
  senior: ['🚶 今天散步 30 分鐘', '🩺 高血壓怎麼吃？', '🦵 膝蓋不好可以做什麼運動？', '📊 我今天的表現如何？'],
  adult: ['🍱 午餐吃了雞腿便當', '🎯 多久可以達成目標？', '🍽️ 還能吃多少？', '📊 我今天的表現如何？'],
};

let controller = null;
let recog = null;
let unsub = null;

const timeStr = (t) => {
  const d = new Date(t || Date.now());
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 從一句話抓身高、體重、年齡、性別，例如「我身高145 體重38」「我10歲 男生」
// 回傳 {found:{...合理的值}, errors:[不合理的說明]}
export function parseProfileInput(text) {
  const found = {}, errors = [];
  const num = (re) => { const m = re.exec(text); return m ? Number(m[1]) : null; };
  const hv = num(/身高\s*(?:是|有)?\s*(-?\d+(?:\.\d+)?)/);
  const wv = num(/體重\s*(?:是|有)?\s*(-?\d+(?:\.\d+)?)/);
  const av = num(/(-?\d{1,3})\s*歲/);
  if (hv != null) { if (hv >= 90 && hv <= 230) found.heightCm = hv; else errors.push(`身高 ${hv} 公分看起來不太對（請輸入 90–230 公分）`); }
  if (wv != null) { if (wv >= 12 && wv <= 250) found.weightKg = wv; else errors.push(`體重 ${wv} 公斤看起來不太對（請輸入 12–250 公斤）`); }
  if (av != null) { if (av >= 2 && av <= 110) found.age = av; else errors.push(`${av} 歲看起來不太對（請輸入 2–110 歲）`); }
  if (/(^|[我是，,、\s歲的])男(生|孩|性|的)?(?!朋友|同學|生們)/.test(text) && !/男朋友|男同學/.test(text)) found.sex = 'M';
  else if (/(^|[我是，,、\s歲的])女(生|孩|性|的)?(?!朋友|同學|生們)/.test(text) && !/女朋友|女同學/.test(text)) found.sex = 'F';
  return { found, errors };
}
export const parseProfileText = (text) => parseProfileInput(text).found;

function speakerBtn(text) {
  return h('button', { class: 'coach-speak', type: 'button', 'aria-label': '朗讀', onclick: () => speak(text) }, icon('speaker'));
}

function bubble(m, onUndo) {
  const isCoach = m.role === 'assistant';
  const textEl = h('div', { class: 'bubble-text' });
  textEl.textContent = m.content; // 一律用 textContent，不用 innerHTML
  return h('div', { class: 'msg ' + (isCoach ? 'from-coach' : 'from-me') },
    isCoach ? mascot('good', 'msg-avatar') : null,
    h('div', { class: 'bubble' },
      textEl,
      m.undo && !m.undone ? h('button', { class: 'undo-btn', type: 'button', onclick: () => onUndo(m) }, '↩︎ 復原') : null,
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
  let profile = store.getProfile();
  const greetText = h('p', { class: 'coach-greet-text' });
  let greet = '';
  const greetSpeak = h('span', {});
  const faceSlot = h('span', { class: 'coach-face-slot' });
  function refreshGreet() {
    profile = store.getProfile();
    greet = ai.coachNudge({ profile, day: store.getDay() });
    greetText.textContent = greet;
    greetSpeak.replaceChildren(speakerBtn(greet));
    faceSlot.replaceChildren(mascot(todayMood(profile), 'coach-face'));
  }

  const badge = h('span', { class: 'demo-badge', hidden: !ai.isDemo() }, '示範模式');
  const list = h('div', { class: 'chat-list', 'aria-live': 'polite' });
  const input = h('input', { type: 'text', class: 'chat-input', placeholder: '例如：午餐吃了滷肉飯', enterkeyhint: 'send', 'aria-label': '輸入訊息', maxlength: '300' });
  const sendBtn = h('button', { class: 'chat-send', type: 'submit', 'aria-label': '送出' }, icon('send'));
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = h('button', { class: 'chat-mic', type: 'button', 'aria-label': '語音輸入', onclick: toggleMic }, icon('mic'));
  const micStatus = h('p', { class: 'mic-status', role: 'status', hidden: true });
  let micTimer = null, hideTimer = null;
  function micSay(text, ms = 0) {
    clearTimeout(hideTimer);
    micStatus.textContent = text; micStatus.hidden = !text;
    if (ms) hideTimer = setTimeout(() => { micStatus.hidden = true; }, ms);
  }

  function refreshBadge() { badge.hidden = !(ai.isDemo() || ai.lastStatus().demo); }

  function onUndo(m) {
    undoLog(m.undo);
    const chat = store.getChat();
    const t = chat.find((x) => x.time === m.time && x.content === m.content);
    if (t) { t.undone = true; t.content += '\n（↩︎ 已復原，這次的紀錄刪除了）'; }
    store.setChat(chat);
    toast('已復原剛剛的紀錄');
    refreshGreet();
    drawChat(false);
  }

  function drawChat(scroll = true) {
    const chat = store.getChat();
    list.replaceChildren(...chat.map((m) => bubble(m, onUndo)));
    if (!profile && chat.length === 0) {
      list.append(h('div', { class: 'coach-tip card' },
        h('p', {}, '建立基本資料後，教練能給你更準確的建議。'),
        h('button', { class: 'btn block', type: 'button', onclick: () => go('body') }, '建立基本資料'),
        h('p', { class: 'small muted' }, '也可以直接輸入，例如：「我 35 歲女生，身高 160、體重 55」'),
      ));
    }
    if (scroll) requestAnimationFrame(() => { const v = root.closest('.view') || root; v.scrollTop = v.scrollHeight; });
  }

  function addMsg(role, content, extra = {}) {
    const chat = store.getChat();
    chat.push({ role, content, time: Date.now(), ...extra });
    store.setChat(chat);
    return chat;
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || controller) return;
    input.value = '';
    micSay('');
    let chat = addMsg('user', text);

    // 危機（示範模式）：固定回覆；有 API key 時交給 AI 回答，再附上求助專線
    const crisis = ai.isCrisis(text);
    if (crisis && ai.isDemo()) {
      addMsg('assistant', ai.crisisReply(store.getProfile()));
      drawChat();
      return;
    }

    // 對話裡說了身高體重 → 寫進個人資料（不合理的數字說明哪裡不對；沒講性別要問）
    const { found, errors } = parseProfileInput(text);
    const pre = [];
    if (errors.length) pre.push('⚠️ ' + errors.join('；') + '，這些先不記錄。');
    if (Object.keys(found).length) {
      const p = { goal: 'keep', activity: 'mid', ...(store.getProfile() || {}), ...found };
      store.setProfile(p);
      const bits = [];
      if (found.heightCm) bits.push(`身高 ${found.heightCm} 公分`);
      if (found.weightKg) { bits.push(`體重 ${found.weightKg} 公斤`); try { store.addWeight(found.weightKg); } catch {} }
      if (found.age) bits.push(`${found.age} 歲`);
      if (found.sex) bits.push(found.sex === 'M' ? '男' : '女');
      let r = `已更新你的資料：${bits.join('、')}。`;
      const miss = [];
      if (!p.heightCm) miss.push('身高'); if (!p.weightKg) miss.push('體重'); if (!p.age) miss.push('年齡');
      if (miss.length) r += ` 也請告訴我你的${miss.join('、')}。`;
      if (!p.sex) r += ' 請再告訴我你是「男」還是「女」，熱量才算得準。';
      pre.push(r);
    }

    // 目標：「我想增肌」
    const parsed = parseLog(text);
    if (parsed.goal && store.getProfile()) {
      const gc = goalChange(parsed.goal, store.getProfile());
      store.setProfile(gc.profile);
      if (gc.text) pre.push(gc.text);
    }

    // 一句話記錄飲食或運動（問句不記錄）
    const log = applyLog(parsed, store.getProfile());
    if (log.text) pre.push(log.text);
    const localReply = pre.join('\n');
    profile = store.getProfile();

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
      const local = ai.localAnswer(text, profile, store.getDay());
      if (ai.isDemo()) {
        if (local) reply = [localReply, local].filter(Boolean).join('\n');
        else if (log.logged) reply = localReply + '\n' + ai.logTip(log.topics, profile, store.getDay());
        else if (localReply) reply = localReply + (Object.keys(found).length ? ' 我會依照這些資料給你建議。' : '');
        else reply = ai.demoReply(text);
      } else {
        const r = await ai.chat(chat.map((m) => ({ role: m.role, content: m.content })), { signal: controller.signal });
        reply = [crisis ? '' : localReply, r, crisis ? ai.HOTLINE : ''].filter(Boolean).join('\n');
      }
    } catch {
      reply = [localReply, ai.demoReply(text)].filter(Boolean).join('\n');
    } finally {
      controller = null;
      sendBtn.disabled = false;
    }
    if (!list.isConnected) return; // 已經換頁
    if (reply) addMsg('assistant', reply, log.undo ? { undo: log.undo } : {});
    refreshBadge();
    refreshGreet();
    drawChat();
  }

  function stopMic() { clearTimeout(micTimer); try { recog?.stop(); } catch {} }
  function toggleMic() {
    if (!SR) { micSay('這支手機不能用語音，請改用鍵盤上的麥克風', 5000); input.focus(); return; }
    if (recog) { stopMic(); return; }
    try {
      recog = new SR();
      recog.lang = 'zh-TW';
      recog.interimResults = true;
      recog.maxAlternatives = 1;
      micBtn.classList.add('listening');
      micBtn.setAttribute('aria-label', '停止');
      micSay('🎙️ 正在聽，請說話…');
      let finalText = '', heard = false, errored = false;
      const arm = () => { clearTimeout(micTimer); micTimer = setTimeout(() => { if (!finalText.trim()) { errored = true; micSay('沒有聽清楚，請再說一次', 4000); } stopMic(); }, 8000); };
      arm();
      recog.onresult = (e) => {
        let t = '';
        for (const r of e.results) { t += r[0].transcript; if (r.isFinal) finalText = t; }
        heard = true; input.value = t; arm();
      };
      recog.onerror = (e) => {
        errored = true;
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') micSay('請允許使用麥克風，或改用鍵盤上的麥克風', 5000);
        else if (e.error !== 'aborted') micSay('沒有聽清楚，請再說一次', 4000);
      };
      recog.onend = () => {
        clearTimeout(micTimer);
        micBtn.classList.remove('listening');
        micBtn.setAttribute('aria-label', '語音輸入');
        recog = null;
        if (finalText.trim()) send(finalText);
        else if (!errored) micSay(heard ? '沒有聽清楚，請再說一次' : '沒有聽到聲音，請再按一次麥克風', 4000);
      };
      recog.start();
    } catch {
      recog = null;
      micBtn.classList.remove('listening');
      micSay('這支手機不能用語音，請改用鍵盤上的麥克風', 5000);
    }
  }

  const form = h('form', { class: 'chat-composer', onsubmit: (e) => { e.preventDefault(); send(input.value); } },
    micBtn, input, sendBtn);
  const quick = QUICK[ageMode(profile)] || QUICK.adult;

  refreshGreet();
  root.append(
    h('div', { class: 'coach-page' },
      h('section', { class: 'coach-hero card' },
        h('div', { class: 'coach-hero-top' },
          faceSlot,
          h('div', { class: 'coach-name' }, h('strong', {}, '教練小健'), ' ', badge,
            h('div', { class: 'coach-ai-note' }, 'AI 健康教練（非真人）')),
          greetSpeak,
        ),
        greetText,
        h('button', { class: 'btn ghost block coach-call', type: 'button', onclick: () => incomingCall({
          title: '教練小健', message: ai.callScript(store.getProfile(), store.getDay()),
          onAccept: (msg) => { addMsg('assistant', msg); drawChat(); },
        }) }, icon('phone'), '模擬來電提醒'),
      ),
      list,
      h('p', { class: 'fine center' }, 'AI 建議僅供參考，不能取代醫療診斷。身體不適請就醫。'),
      h('div', { class: 'quick-row' }, quick.map((q) => h('button', { class: 'chip', type: 'button', onclick: () => send(q.replace(/^\S+\s/, '')) }, q))),
      micStatus,
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
