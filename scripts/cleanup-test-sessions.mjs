// 一次性清理：刪掉測試留下的假 session（sessionId 含 test，例如 mac-test）和它們的警示
// Hub 會把記憶體裡的資料寫回檔案，所以一定要先停掉 Hub 再跑，跑完再啟動
//
// 用法（在 dashboard 資料夾）：
//   node scripts/cleanup-test-sessions.mjs           只列出會刪什麼，不改檔
//   node scripts/cleanup-test-sessions.mjs --apply   真的刪（會先備份成 .bak）
// 環境變數：AGENT_HUB_DATA_DIR 指定資料夾（預設 data/）；AGENT_HUB_URL 指定要確認已停止的 Hub（預設 http://127.0.0.1:3100）
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = process.env.AGENT_HUB_DATA_DIR || path.join(process.cwd(), 'data')
const HUB_URL = (process.env.AGENT_HUB_URL || 'http://127.0.0.1:3100').replace(/\/+$/, '').replace(/\/api\/events$/, '')
const apply = process.argv.includes('--apply')

const isTestSession = (sessionId) => typeof sessionId === 'string' && sessionId.toLowerCase().includes('test')

// Hub 還開著就不動檔案（不然 Hub 下次寫檔會把刪掉的資料寫回去）
const hubRunning = await fetch(`${HUB_URL}/api/events`, { signal: AbortSignal.timeout(1500) })
  .then(() => true)
  .catch(() => false)
if (hubRunning && apply) {
  console.error(`Hub（${HUB_URL}）還在執行，請先停掉 Hub 再加 --apply`)
  process.exit(1)
}

const agentsFile = path.join(DATA_DIR, 'agents.json')
const boardFile = path.join(DATA_DIR, 'board.json')
const sessions = JSON.parse(fs.readFileSync(agentsFile, 'utf-8'))
const board = JSON.parse(fs.readFileSync(boardFile, 'utf-8'))

const removed = sessions.filter((s) => isTestSession(s.sessionId))
const keys = new Set(removed.map((s) => `${s.machine}:${s.sessionId}`))
const removedAlerts = (board.alerts ?? []).filter((a) => keys.has(`${a.machine}:${a.sessionId}`))

console.log(`資料夾：${DATA_DIR}`)
console.log(`要刪的 session ${removed.length} 個：`)
for (const s of removed) console.log(`  ${s.machine}  ${s.sessionId}  ${s.cwd}`)
console.log(`要刪的警示 ${removedAlerts.length} 則`)

if (!apply) {
  console.log('（只列出，沒有改檔；確認後加 --apply）')
  process.exit(0)
}
if (removed.length === 0) process.exit(0)

fs.copyFileSync(agentsFile, `${agentsFile}.bak`)
fs.copyFileSync(boardFile, `${boardFile}.bak`)
fs.writeFileSync(agentsFile, JSON.stringify(sessions.filter((s) => !isTestSession(s.sessionId)), null, 2), 'utf-8')
board.alerts = board.alerts.filter((a) => !keys.has(`${a.machine}:${a.sessionId}`))
fs.writeFileSync(boardFile, JSON.stringify(board, null, 2), 'utf-8')
console.log('已刪除，備份在 agents.json.bak、board.json.bak')
