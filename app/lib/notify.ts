// Discord 通知：讀 DISCORD_WEBHOOK_URL，POST {content}
// 網址屬於機密，任何 log 都不能印出來
import type { AlertKind } from './types'

// 同 kind + 同 session + 同檔案，10 分鐘內只送一次
const DEDUPE_MS = 10 * 60 * 1000

const KIND_LABEL: Record<AlertKind, string> = {
  needs_input: '等你確認',
  conflict: '撞檔',
  stale: '可能卡住',
  failure: '指令失敗',
  task_done: '完成任務',
  handoff: '交接',
}

export interface NotifyInput {
  kind: AlertKind
  machine: string
  project: string
  sessionId: string
  text: string
  file?: string
}

// 去重紀錄放 globalThis，避免模組重複載入時各自一份
const globalForNotify = globalThis as unknown as { __agentNotifySent?: Map<string, number> }

function sentMap(): Map<string, number> {
  globalForNotify.__agentNotifySent ??= new Map()
  return globalForNotify.__agentNotifySent
}

/**
 * 送一則通知；回傳 false 表示 10 分鐘內送過同一件事（呼叫端可據此略過重複警示）
 * 實際送出是背景進行，失敗只記 console.error，不會丟錯
 */
export function notify(input: NotifyInput): boolean {
  const now = Date.now()
  const sent = sentMap()
  const key = `${input.kind}|${input.machine}:${input.sessionId}|${(input.file ?? '').toLowerCase()}`
  const last = sent.get(key)
  if (last !== undefined && now - last < DEDUPE_MS) return false
  sent.set(key, now)

  // 順手清掉過期的去重紀錄
  for (const [k, ts] of sent) {
    if (now - ts >= DEDUPE_MS) sent.delete(k)
  }

  const url = process.env.DISCORD_WEBHOOK_URL
  if (!url) return true

  const project = input.project || '(未知專案)'
  const content = `[${KIND_LABEL[input.kind]}] ${input.machine}/${project}：${input.text}`.slice(0, 1900)

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(5000),
  })
    .then((res) => {
      if (!res.ok) console.error(`[notify] Discord 回應 ${res.status}`)
    })
    .catch((error: unknown) => {
      // 只印錯誤類型，避免錯誤訊息裡夾帶 webhook 網址
      console.error('[notify] Discord 通知送出失敗:', error instanceof Error ? error.name : 'unknown')
    })

  return true
}
