// 線條圖示（同一種粗細、同一種顏色），取代彩色 emoji，讓畫面整齊。
const P = {
  coach:    '<path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-4.9A8.5 8.5 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  body:     '<circle cx="12" cy="7" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/>',
  food:     '<path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3"/><path d="M17.5 21V3c-2.2 1-3.5 3.4-3.5 6.5V14h3.5"/>',
  exercise: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  score:    '<path d="M5 20v-8M12 20V5M19 20v-5"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  camera:   '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  minus:    '<path d="M5 12h14"/>',
  close:    '<path d="M6 6l12 12M18 6L6 18"/>',
  mic:      '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  send:     '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  speaker:  '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  phone:    '<path d="M5 4h3.5l1.5 4.5-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2 4.5 1.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>',
  lock:     '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  eye:      '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  check:    '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevron:  '<path d="M9 6l6 6-6 6"/>',
  sensor:   '<rect x="7" y="4" width="10" height="16" rx="5"/><path d="M12 9v3"/>',
};

export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', ('icon ' + cls).trim());
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name] || '';
  return s;
}
export const iconSVG = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;
