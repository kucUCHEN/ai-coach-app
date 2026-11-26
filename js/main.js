// App 啟動與換頁
const ROUTES = {
  coach:    { title: 'AI 教練',   load: () => import('./pages/coach.js') },
  body:     { title: '身體',      load: () => import('./pages/body.js') },
  food:     { title: '飲食',      load: () => import('./pages/food.js') },
  exercise: { title: '運動',      load: () => import('./pages/exercise.js') },
  score:    { title: '健康紀錄',  load: () => import('./pages/score.js') },
  settings: { title: '設定',      load: () => import('./pages/settings.js') },
  ai:       { title: 'AI 連線',   load: () => import('./pages/teacher.js') },
};
const DEFAULT = 'coach';

let currentPage = null;
let navToken = 0;

async function navigate() {
  const name = (location.hash.slice(1).split('?')[0]) || DEFAULT;
  const route = ROUTES[name] || ROUTES[DEFAULT];
  // 頂部右上角：設定頁、AI 連線頁不顯示設定鈕
  document.querySelector('.topbar .icon-btn').hidden = name === 'settings' || name === 'ai';
  const token = ++navToken;
  try { currentPage?.leave?.(); } catch (e) { console.error(e); }
  currentPage = null;

  document.getElementById('page-title').textContent = route.title;
  document.querySelectorAll('.tabbar a').forEach((a) =>
    a.classList.toggle('active', a.dataset.route === name));

  const view = document.getElementById('view');
  view.replaceChildren();
  view.scrollTop = 0;
  try {
    const mod = await route.load();
    if (token !== navToken) return; // 使用者已經又換頁了
    currentPage = mod;
    await mod.render(view);
  } catch (e) {
    console.error(e);
    view.innerHTML = '<div class="card"><p>這一頁出了點問題，請重新整理。</p></div>';
  }
}

// 啟動時套用使用者選的字體大小
import('./pages/settings.js').then((m) => m.applyFont?.()).catch(() => {});

window.addEventListener('hashchange', navigate);
navigate();

// 離線快取（PWA）。本機開發時 (localhost) 也啟用，方便測試離線。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW 註冊失敗', e));
  });
}
