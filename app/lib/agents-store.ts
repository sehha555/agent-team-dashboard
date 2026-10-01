// 跨機器 agent session 狀態（記憶體 + data/agents.json 持久化）
// 用 globalThis 單例，避免 Next dev 重複載入模組時產生多份 store
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import type { AgentEvent, AgentSession } from './types'

// AGENT_HUB_DATA_DIR 讓測試用的 Hub 跟正式 Hub 分開存
const DATA_FILE = path.join(process.env.AGENT_HUB_DATA_DIR || path.join(process.cwd(), 'data'), 'agents.json')
// 紀錄「展開」要看細事件，所以比第一階段多留一些
const MAX_EVENTS = 50

interface AgentHub {
  sessions: Map<string, AgentSession>
  emitter: EventEmitter
}

const globalForHub = globalThis as unknown as { __agentHub?: AgentHub }

/**
 * 取得 store 單例（第一次呼叫才讀檔，build 時 import 模組不會碰磁碟）
 */
function getHub(): AgentHub {
  if (globalForHub.__agentHub) return globalForHub.__agentHub

  const sessions = new Map<string, AgentSession>()
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as AgentSession[]
    for (const s of saved) sessions.set(sessionKey(s.machine, s.sessionId), s)
  } catch {
    // 檔案不存在或格式有誤，從空白開始
  }

  const emitter = new EventEmitter()
  emitter.setMaxListeners(0) // 每個瀏覽器分頁一個 SSE 訂閱者，不設上限

  globalForHub.__agentHub = { sessions, emitter }
  return globalForHub.__agentHub
}

function sessionKey(machine: string, sessionId: string): string {
  return `${machine}:${sessionId}`
}

// cwd 最後一層資料夾名（Windows 和 Mac 路徑都要能處理）
function projectName(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd
}

/**
 * 依事件推導狀態，不在規則內的事件維持原狀態
 * - UserPromptSubmit / PreToolUse → working
 * - SessionStart / Stop → idle
 * - SessionEnd → ended
 * - Notification → waiting（等使用者確認）；之後任何其他事件都恢復成 working
 */
function nextStatus(event: string, prev: AgentSession['status']): AgentSession['status'] {
  if (event === 'Notification') return 'waiting'
  if (event === 'UserPromptSubmit' || event === 'PreToolUse') return 'working'
  if (event === 'SessionStart' || event === 'Stop') return 'idle'
  if (event === 'SessionEnd') return 'ended'
  if (prev === 'waiting') return 'working'
  return prev
}

function persist(sessions: Map<string, AgentSession>) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
    fs.writeFileSync(DATA_FILE, JSON.stringify([...sessions.values()], null, 2), 'utf-8')
  } catch (error) {
    console.error('[agents-store] 寫入 agents.json 失敗:', error)
  }
}

/**
 * 取得所有 session（依最後事件時間，新的在前）
 */
export function getSessions(): AgentSession[] {
  return [...getHub().sessions.values()].sort((a, b) => b.lastTs - a.lastTs)
}

/**
 * 收一筆事件：更新 session、寫檔、通知 SSE 訂閱者
 */
export function recordEvent(evt: AgentEvent): AgentSession {
  const { sessions, emitter } = getHub()
  const key = sessionKey(evt.machine, evt.sessionId)
  const prev = sessions.get(key)
  const cwd = evt.cwd || prev?.cwd || ''

  const session: AgentSession = {
    machine: evt.machine,
    sessionId: evt.sessionId,
    cwd,
    project: projectName(cwd),
    status: nextStatus(evt.event, prev?.status ?? 'idle'),
    lastEvent: evt.event,
    lastDetail: evt.detail,
    lastTs: evt.ts,
    events: [evt, ...(prev?.events ?? [])].slice(0, MAX_EVENTS),
  }

  sessions.set(key, session)
  persist(sessions)
  emitter.emit('update', session)
  return session
}

/**
 * 訂閱 session 變更，回傳取消訂閱函式
 */
export function subscribe(listener: (session: AgentSession) => void): () => void {
  const { emitter } = getHub()
  emitter.on('update', listener)
  return () => {
    emitter.off('update', listener)
  }
}
