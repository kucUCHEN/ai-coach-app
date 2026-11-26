// 教練角色「小健」：戴綠色運動頭帶、掛哨子。表情會跟著今天的狀態改變。
// mood: 'great' | 'good' | 'ok' | 'low' | 'cheer'
const MOUTH = {
  great: '<path d="M38 60 Q50 74 62 60 Z" fill="#7a3b2e"/><path d="M42 62 Q50 67 58 62" fill="#f28b82"/>',
  cheer: '<path d="M38 59 Q50 72 62 59 Z" fill="#7a3b2e"/>',
  good:  '<path d="M39 61 Q50 69 61 61" fill="none" stroke="#7a3b2e" stroke-width="3.2" stroke-linecap="round"/>',
  ok:    '<path d="M41 64 H59" fill="none" stroke="#7a3b2e" stroke-width="3.2" stroke-linecap="round"/>',
  low:   '<path d="M40 67 Q50 59 60 67" fill="none" stroke="#7a3b2e" stroke-width="3.2" stroke-linecap="round"/>',
};
const EYES = {
  great: '<path d="M33 47 Q38 41 43 47M57 47 Q62 41 67 47" fill="none" stroke="#2b2b2b" stroke-width="3.2" stroke-linecap="round"/>',
  cheer: '<circle cx="38" cy="46" r="4" fill="#2b2b2b"/><path d="M57 47 Q62 41 67 47" fill="none" stroke="#2b2b2b" stroke-width="3.2" stroke-linecap="round"/>',
  good:  '<circle cx="38" cy="46" r="4" fill="#2b2b2b"/><circle cx="62" cy="46" r="4" fill="#2b2b2b"/><circle cx="39.3" cy="44.6" r="1.2" fill="#fff"/><circle cx="63.3" cy="44.6" r="1.2" fill="#fff"/>',
  ok:    '<circle cx="38" cy="47" r="3.6" fill="#2b2b2b"/><circle cx="62" cy="47" r="3.6" fill="#2b2b2b"/>',
  low:   '<circle cx="38" cy="48" r="3.6" fill="#2b2b2b"/><circle cx="62" cy="48" r="3.6" fill="#2b2b2b"/><path d="M31 43 L43 39M69 43 L57 39" stroke="#2b2b2b" stroke-width="2.6" stroke-linecap="round"/>',
};
const EXTRA = {
  great: '<text x="78" y="26" font-size="16">✨</text>',
  low:   '<path d="M70 52 q3 6 0 9 q-3 -3 0 -9z" fill="#7cc4f2"/>',
  cheer: '<text x="76" y="28" font-size="16">💪</text>',
};

export function mascotSVG(mood = 'good') {
  return `<svg viewBox="0 0 100 100" class="mascot" role="img" aria-label="教練小健">
  <circle cx="50" cy="54" r="34" fill="#ffd9b8"/>
  <path d="M18 44 Q50 22 82 44 L82 34 Q50 12 18 34 Z" fill="#1f9d6a"/>
  <path d="M82 38 l10 -6 l-2 10 z" fill="#1f9d6a"/>
  <path d="M22 38 Q30 18 50 16 Q70 18 78 38 Q64 26 50 26 Q36 26 22 38z" fill="#3a2a22"/>
  <circle cx="30" cy="58" r="5" fill="#ffb3a7" opacity=".7"/><circle cx="70" cy="58" r="5" fill="#ffb3a7" opacity=".7"/>
  ${EYES[mood] || EYES.good}${MOUTH[mood] || MOUTH.good}${EXTRA[mood] || ''}
  <path d="M50 88 v6" stroke="#9aa1a8" stroke-width="2"/><rect x="44" y="92" width="12" height="7" rx="3" fill="#f2b705"/>
</svg>`;
}

export function mascot(mood = 'good', cls = '') {
  const d = document.createElement('div');
  d.className = ('mascot-wrap ' + cls).trim();
  d.innerHTML = mascotSVG(mood);
  return d;
}

// 分數 → 表情與一句話
export function moodOf(score, hasData = true) {
  if (!hasData) return { mood: 'cheer', emoji: '🙂', label: '還沒開始記錄' };
  if (score >= 85) return { mood: 'great', emoji: '😄', label: '狀態超好' };
  if (score >= 70) return { mood: 'good', emoji: '🙂', label: '表現不錯' };
  if (score >= 50) return { mood: 'ok', emoji: '😐', label: '還可以更好' };
  return { mood: 'low', emoji: '😟', label: '今天要加油' };
}
