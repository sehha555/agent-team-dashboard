// 卡住偵測：每 60 秒掃一次，依最後一筆事件判斷
// - 最後是 PreToolUse（工具還在跑）：不算卡住，超過 30 分鐘才發「指令已跑 N 分鐘」
// - 最後是其他事件（工具跑完、剛下指令）：working 超過 5 分鐘沒事件就發「可能卡住」
// - 任何狀態超過 60 分鐘完全沒事件：推定已關閉，不發警示，working 改成 idle，並把它還沒處理的 stale 警示標成已處理
// 同一個 session 在恢復活動之前只發一次（以「上次事件之後是否已發過」判斷，Hub 重啟也不會重發）
import { getSessions, markIdle } from './agents-store'
import { hasStaleAlertSince, raiseAlert, resolveStaleAlerts } from './board-store'

const INTERVAL_MS = 60 * 1000
const STALE_MS = 5 * 60 * 1000
const LONG_TOOL_MS = 30 * 60 * 1000
const GONE_MS = 60 * 60 * 1000

const globalForWatchdog = globalThis as unknown as { __agentWatchdog?: NodeJS.Timeout }

/**
 * 掃一次（匯出給測試或手動觸發用）
 */
export function scanStale(now = Date.now()) {
  for (const s of getSessions()) {
    if (s.status === 'ended') continue
    const idleMs = now - s.lastTs

    if (idleMs > GONE_MS) {
      resolveStaleAlerts(s.machine, s.sessionId)
      markIdle(s.machine, s.sessionId)
      continue
    }
    if (s.status !== 'working') continue

    const toolRunning = s.lastEvent === 'PreToolUse'
    if (idleMs <= (toolRunning ? LONG_TOOL_MS : STALE_MS)) continue
    if (hasStaleAlertSince(s.machine, s.sessionId, s.lastTs)) continue

    const minutes = Math.floor(idleMs / 60000)
    const last = s.lastDetail ? `：${s.lastDetail.slice(0, 80)}` : ''
    raiseAlert({
      kind: 'stale',
      text: toolRunning ? `指令已跑 ${minutes} 分鐘${last}` : `${minutes} 分鐘沒動靜，可能卡住`,
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
