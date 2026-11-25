# AI健康教練 App 架構（給開發者／子代理看）

## 原則
- 純 HTML + CSS + JavaScript（ES modules），**不用框架、不用打包工具、不用 npm 套件**。
  理由：Mac / Windows 都只要 Node.js（跑本機伺服器）和 VS Code；程式碼不會因套件改版壞掉；學生看得懂。
- PWA：`manifest.webmanifest` + `sw.js`（快取所有檔案，離線可用）。
- 以 iPhone（Safari、寬 390px 左右）為主設計，安全區域用 `env(safe-area-inset-*)`。
- 全部繁體中文、國小生用語、字大（內文 ≥ 18px）、按鈕大（高 ≥ 48px）。
- 資料只存在手機：全部用 `js/store.js`（localStorage），不送到任何伺服器（AI 呼叫除外，只送當次對話／照片）。

## 檔案分工
```
index.html            App 外殼：頂部標題、內容區 #view、底部分頁列
css/app.css           全部樣式（顏色變數在 :root）
js/main.js            啟動、路由（#coach #body #food #exercise #score #teacher）
js/store.js           本機資料（profile、每日紀錄、點數、對話）
js/health.js          BMI、兒童 BMI 標準、每日熱量（BMR/TDEE）、評分計算
js/foods.js           常見食物熱量表
js/ui.js              共用小工具：h() 建元素、toast()、模擬來電畫面
js/sensor/            感測器層（見下）
js/ai/                AI 轉接層（見下）
js/pages/*.js         每頁一個檔，export function render(root) 
```

## 頁面介面
每個 `js/pages/xxx.js`：
```js
export function render(root) { /* 把畫面放進 root */ }
export function leave() { /* 可選：離開頁面時清理（停止計時器、斷感測器） */ }
```

## 感測器層 js/sensor/
```js
import { getSensor } from './sensor/index.js';
const s = getSensor();             // 依設定回傳 MockSensor（之後加 BleSensor、ReplaySensor）
s.on('count',   ({reps, quality, stars}) => {});   // 由 "C,次數,完整度%,節奏星數" 解析
s.on('battery', ({pct}) => {});                    // 由 "B,電量%" 解析
s.on('status',  ({connected, name}) => {});
await s.connect();
await s.start(exerciseId);   // 送 "S,編號"
await s.stop();              // 送 "P"
await s.queryBattery();      // 送 "B"
```
運動編號與韌體 motion_chip.ino 的 EX 表一致（從 0 開始）：0 跳繩、1 開合跳、2 深蹲、3 啞鈴彎舉、4 仰臥起坐。定義在 js/sensor/exercises.js。
所有來源都產生**文字行**再交給 `parseLine()`，確保模擬資料和真的感測器格式一模一樣。

## AI 轉接層 js/ai/
```js
import * as ai from './ai/index.js';
ai.isDemo()                                   // 沒有 key → true
await ai.chat(messages, {mode})               // messages: [{role:'user'|'assistant', content}]，回傳字串
await ai.estimateFood(imageDataUrl)           // 回傳 {items:[{name, grams, kcal}], totalKcal, advice}
ai.coachNudge(context)                        // 依今日資料產生主動提醒文字（可用示範規則）
```
供應商：claude / openai / gemini，各一個檔，瀏覽器直接 fetch 官方 API。key 存 localStorage，只在「老師設定」頁輸入。
