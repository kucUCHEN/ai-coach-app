# AI健康教練（網頁 App）

住在手機裡的 AI 健康教練，給國小學生用。

**線上網址：https://kucuchen.github.io/ai-coach-app/**（用 iPhone Safari 打開）
可以記錄身高體重、吃了什麼、做了什麼運動，每天打分數、集點換獎勵，也可以跟 AI 教練聊天。

- 用 iPhone 的 Safari 或 Android 的 Chrome 打開就能用，可以「加到主畫面」像 App 一樣。
- 資料只存在這支手機裡，不會上傳。
- 沒有 AI 的 key 或沒有網路時，會自動用「示範模式」，照樣可以展示。

## 最快開始（3 步）

1. 安裝 Node.js（從 https://nodejs.org 下載 LTS 版）。
2. 在這個資料夾打開終端機，輸入 `node server.js`。
3. 用 Chrome 打開 http://localhost:8080 。

詳細步驟（Mac、Windows 分開寫）請看 [docs/安裝與執行.md](docs/安裝與執行.md)。

## 文件在哪裡

| 文件 | 給誰看 | 內容 |
|---|---|---|
| [docs/安裝與執行.md](docs/安裝與執行.md) | 老師、學生 | 安裝 VS Code、Node.js、Git，在電腦上執行 |
| [docs/上線步驟.md](docs/上線步驟.md) | 老師 | 免費放到 GitHub Pages，讓手機用 https 網址打開 |
| [docs/老師使用說明.md](docs/老師使用說明.md) | 老師 | 每頁怎麼用、AI 連線設定、安全提醒、比賽當天流程 |
| [docs/學生說明.md](docs/學生說明.md) | 學生 | App 有哪五頁、怎麼跟評審介紹 |
| [docs/測試清單.md](docs/測試清單.md) | 老師 | 要測哪些功能、哪些已經測過 |
| [docs/AI比較表.md](docs/AI比較表.md) | 老師 | 三家 AI 公司的價格、規定比較 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 寫程式的人 | 程式架構 |

## 資料夾裡有什麼

```
index.html             App 的主畫面
manifest.webmanifest   「加到主畫面」用的設定（名稱、圖示）
sw.js                  離線快取（沒網路也能打開）
server.js              在電腦上測試用的小伺服器
css/                   畫面樣式
js/                    程式（每一頁一個檔在 js/pages/）
js/ai/                 連到三家 AI 公司（Claude、ChatGPT、Gemini）
js/sensor/             運動感測器（目前是「模擬感測器」）
icons/                 App 圖示
docs/                  說明文件
```

## 重要提醒

- **絕對不要把 AI 的 key 寫進程式或放上 GitHub。** key 只在手機上的「AI 連線設定」頁輸入。
- AI 教練不是醫生。熱量和 BMI 都是大約的數字。
