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
│   └── parser.ts               # 檔案解析 + agent 狀態推導
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
- [ ] 通知系統（任務完成、agent 卡住）
- [ ] 歷史紀錄（team session 回放）

## License

MIT
