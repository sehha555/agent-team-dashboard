// 卡住偵測：每 60 秒掃一次，working 但超過 5 分鐘沒事件的 session 發 stale 警示
// 同一個 session 在恢復活動之前只發一次（以「上次事件之後是否已發過」判斷，Hub 重啟也不會重發）
import { getSessions } from './agents-store'
import { hasStaleAlertSince, raiseAlert } from './board-store'

const INTERVAL_MS = 60 * 1000
const STALE_MS = 5 * 60 * 1000

const globalForWatchdog = globalThis as unknown as { __agentWatchdog?: NodeJS.Timeout }

/**
 * 掃一次（匯出給測試或手動觸發用）
 */
export function scanStale(now = Date.now()) {
  for (const s of getSessions()) {
    if (s.status !== 'working') continue
    if (now - s.lastTs <= STALE_MS) continue
    if (hasStaleAlertSince(s.machine, s.sessionId, s.lastTs)) continue

    const minutes = Math.floor((now - s.lastTs) / 60000)
    const last = s.lastDetail ? `，最後：${s.lastDetail.slice(0, 80)}` : ''
    raiseAlert({
      kind: 'stale',
      text: `${minutes} 分鐘沒動靜，可能卡住${last}`,
      machine: s.machine,
      sessionId: s.sessionId,
      project: s.project,
    })
  }
}

/**
 * 啟動定時掃描（重複呼叫不會開第二個計時器）
 */
export function startWatchdog() {
  if (globalForWatchdog.__agentWatchdog) return
  globalForWatchdog.__agentWatchdog = setInterval(() => {
    try {
      scanStale()
    } catch (error) {
      console.error('[watchdog] 掃描失敗:', error)
    }
  }, INTERVAL_MS)
  // 不要因為這個計時器讓 process 無法結束
  globalForWatchdog.__agentWatchdog.unref()
}
