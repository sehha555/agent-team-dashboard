# Agent Team Dashboard

Claude Code Agent Team 即時監控面板 — 在瀏覽器中觀察 agent 協作狀態。

當你使用 Claude Code 的 [Agent Teams](https://docs.anthropic.com/en/docs/claude-code) 功能時，這個 dashboard 能即時顯示所有 team 的任務進度和成員狀態。

## 截圖

> 啟動後開啟 http://localhost:3100

```
┌─────────────────────────────────────────────────────┐
│  Agent Team Dashboard                    Phase 1    │
├─────────────────────────────────────────────────────┤
│  [Team A]  [Team B]  [Team C]                       │
├──────────────────┬──────────────────────────────────┤
│                  │  Agent Panel                     │
│  Task Panel      │  ┌──────┐ ┌──────┐ ┌──────┐     │
│                  │  │ Lead │ │Writer│ │Tester│     │
│  #1 完成  ✓      │  └──────┘ └──────┘ └──────┘     │
│  #2 進行中 ●     ├──────────────────────────────────┤
│  #3 等待中       │  Stats Panel                     │
│  #4 等待中       │  ████████░░░░ 42%                │
│                  │  3 完成 · 2 進行中 · 4 等待中     │
└──────────────────┴──────────────────────────────────┘
```

## 功能

- **Team 切換** — 多 team 並存時可自由切換檢視
- **Task 面板** — 即時顯示任務狀態（完成/進行中/等待中）、負責人、依賴關係
- **Agent 面板** — 顯示每位成員的角色、狀態、當前任務
- **Stats 面板** — 進度條 + 完成率 + 各狀態統計
- **SSE 即時更新** — 透過 chokidar 監聽檔案變更，自動推送更新到瀏覽器

## 資料來源

直接讀取 Claude Code 在本機產生的檔案：

| 路徑 | 內容 |
|------|------|
| `~/.claude/teams/{name}/config.json` | Team 設定、成員列表 |
| `~/.claude/tasks/{teamId}/*.json` | 任務資料（狀態、負責人、描述） |

不需要額外設定或 API key，開箱即用。

## 安裝

```bash
git clone https://github.com/sehha555/agent-team-dashboard.git ~/.claude/tools/dashboard
cd ~/.claude/tools/dashboard
npm install
```

## 使用

### 手動啟動

```bash
cd ~/.claude/tools/dashboard
npm run dev -- -p 3100
```

開啟 http://localhost:3100

### 搭配 Claude Code Skill（推薦）

將 skill 檔案放到 `~/.claude/skills/dashboard/SKILL.md`，之後只需在 Claude Code 中輸入：

```
/dashboard
```

即可一鍵啟動。

## 跨機器 Session 即時狀態（Hub）

頁面頂部的「Claude Sessions」面板會依機器分組，顯示每台電腦上所有 Claude Code session 正在做什麼。
做法：各台電腦的 Claude Code 用 hook 執行 `hooks/report.mjs`，把事件 POST 給 Hub；網頁透過 SSE 即時更新。

### 啟動 Hub（桌機）

```bash
cd ~/.claude/tools/dashboard
npm run hub
```

`hub` 會先 `next build` 再 `next start -p 3100 -H 0.0.0.0`，監聽所有網卡，其他機器可透過 Tailscale IP 連線。
用 production 模式而非 `next dev`，是因為 dev 模式會擋非 localhost 來源的開發資源請求，且有重新編譯、模組重載的不穩定。
Session 資料存在 `data/agents.json`（不進版本控制），重啟後會讀回。

### 設定 hook（每台電腦）

需要 Node 18 以上。在 `~/.claude/settings.json` 的 `hooks` 加上 SessionStart、UserPromptSubmit、PreToolUse、Stop、SessionEnd 五個事件，命令都是：

```
node "<dashboard 路徑>/hooks/report.mjs"
```

- Hub 位址預設 `http://100.66.71.62:3100/api/events`，可用環境變數 `AGENT_HUB_URL` 覆寫
- 腳本 timeout 1 秒，Hub 沒開或網路斷都會靜默結束（exit 0），不會擋住 Claude
- 建議 hook 設 `"async": true`，完全不影響 Claude 的回應速度

## 第二階段：分工、交接、防撞、通知

頁面由上到下：需要你處理（警示）→ 兩台電腦的 session（每台一欄）→ 任務看板 → 紀錄 → 舊的 Agent Team 面板（收成一行，點開才顯示）。

- **任務**：網頁按「+ 新增任務」，或 agent 用 MCP 工具開任務、認領、完成。狀態分待認領 / 進行中 / 完成，標示建立者（你或哪台電腦）
- **交接**：agent 用 MCP 的 `handoff` 寫「做完什麼、還剩什麼」，對方用 `inbox` 收
- **紀錄**：交接、完成任務、每輪總結（Stop 時取最後一則回覆前 300 字）；點「展開」看該 session 那段時間的細事件（每個 session 保留最近 50 筆）
- **防撞**：`hooks/guard.mjs` 在 Edit / Write / MultiEdit / NotebookEdit 前問 Hub，另一個 session（含同一台的其他 session）30 分鐘內改過同一個檔，就讓 Claude 停下來問你
- **卡住偵測**：working 狀態超過 5 分鐘沒事件，發一次「可能卡住」，恢復活動前不重發
- **通知**：等你確認、撞檔、完成任務、交接、可能卡住、指令失敗，都會送到 Discord（同類同 session 同檔案 10 分鐘內只送一次）

資料存在 `data/board.json`（任務、交接、警示、紀錄），防撞紀錄只放記憶體，Hub 重啟就清空。

### hook 設定（每台電腦的 `~/.claude/settings.json`）

在第一階段的五個事件之外，再加：

| 事件 | matcher | 命令 | 設定 |
|------|---------|------|------|
| PreToolUse | `Edit\|Write\|MultiEdit\|NotebookEdit` | `node "<dashboard 路徑>/hooks/guard.mjs"` | 同步（不要 async），`"timeout": 3` |
| Notification | （不填） | `node "<dashboard 路徑>/hooks/report.mjs"` | `"async": true` |
| PostToolUseFailure | （不填） | `node "<dashboard 路徑>/hooks/report.mjs"` | `"async": true` |

- guard 沒衝突、Hub 沒開、逾時（800 毫秒）、任何錯誤都直接放行，不會擋住 Claude
- Notification 只回報需要你處理的類型（權限確認、問答對話框等），登入成功、額度提醒之類不回報
- `AGENT_HUB_URL` 填 Hub 根網址（例如 `http://100.66.71.62:3100`），舊寫法填到 `/api/events` 也相容

### MCP 工具（讓 Claude 自己開任務、交接）

```bash
npm install
claude mcp add --scope user agent-hub -- node <dashboard 絕對路徑>/mcp/server.mjs
```

工具：`hub_status`、`task_list`、`task_create`、`task_claim`、`task_done`、`handoff`、`inbox`。
本機身分用電腦名稱（hostname），session 用 Claude Code 傳下來的 `CLAUDE_CODE_SESSION_ID`。

### Discord 通知

在 Discord 頻道設定 → 整合 → Webhook 建一個 webhook，把網址寫進 Hub 那台電腦的 `.env.local`：

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

`.env.local` 不進版本控制。改完要重啟 Hub 才會生效；沒設就只顯示在網頁上，不送通知。

### API

| 路徑 | 方法 | 用途 |
|------|------|------|
| `/api/board/tasks` | GET / POST / PATCH | 列出、新增、`{id, action: claim\|done\|reopen, by}` |
| `/api/board/handoffs` | GET `?to=機器` / POST / PATCH | 收件匣、新增交接、`{id}` 標已讀 |
| `/api/board/alerts` | GET / PATCH | 未處理的警示、`{id}` 標已處理 |
| `/api/check-edit` | POST | guard 用：`{machine, sessionId, project, relPath}` |

### 測試用 Hub（不影響正式 Hub）

`AGENT_HUB_DATA_DIR` 換資料夾、`NEXT_DIST_DIR` 換 build 輸出資料夾，就能在同一個目錄另開一個 Hub：

```bash
NEXT_DIST_DIR=data/next-test npx next build
AGENT_HUB_DATA_DIR=$PWD/data/test NEXT_DIST_DIR=data/next-test npx next start -p 3101
```

## 技術棧

- [Next.js 16](https://nextjs.org/) (App Router)
- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Zustand 5](https://zustand.docs.pmnd.rs/)
- [chokidar v5](https://github.com/paulmillr/chokidar) (檔案監聽 + SSE)

## 專案結構

```
app/
├── api/
│   ├── teams/route.ts          # GET /api/teams — 所有 team 列表
│   ├── tasks/[teamId]/route.ts # GET /api/tasks/:id — 任務 + agent 資料
│   └── sse/route.ts            # SSE 端點（chokidar 即時推送）
├── components/
│   ├── TeamSelector.tsx        # Team tab 切換器
│   ├── TaskPanel.tsx           # 任務列表面板
│   ├── AgentPanel.tsx          # Agent 狀態卡片
│   └── StatsPanel.tsx          # 進度統計面板
├── lib/
│   ├── types.ts                # TypeScript 型別定義
│   ├── parser.ts               # 檔案解析 + agent 狀態推導
│   ├── agents-store.ts         # 跨機器 session 狀態（data/agents.json）
│   ├── board-store.ts          # 任務、交接、警示、紀錄（data/board.json）
│   ├── conflict.ts             # 防撞：誰最近改過哪個檔
│   ├── watchdog.ts             # 卡住偵測（instrumentation.ts 啟動）
│   └── notify.ts               # Discord 通知
├── store/
│   └── useDashboardStore.ts    # Zustand 全域狀態
├── page.tsx                    # Bento Grid 主頁面 + SSE hook
├── layout.tsx                  # Dark theme layout
└── globals.css                 # 深色主題 + 自訂捲軸
```

## 設計決策

- **獨立部署** — 不綁定任何特定專案，放在 `~/.claude/tools/` 下全域可用
- **檔案系統驅動** — 直接讀本機 JSON，零外部依賴
- **SSE 而非 WebSocket** — 單向資料流足夠，實作更簡單
- **深色主題** — 為長時間開發設計，`#0a0a0a` 純黑底 + monospace 字型
- **Agent 狀態推導** — 從 task ownership + status 自動推導 agent 是 working / idle / done

## Roadmap

- [x] Phase 1 — Task + Agent + Stats 面板
- [ ] Phase 2 — Discussion + Summary 面板（agent 對話摘要）
- [x] 通知系統（任務完成、agent 卡住）— 第二階段，送 Discord
- [ ] 歷史紀錄（team session 回放）

## License

MIT
