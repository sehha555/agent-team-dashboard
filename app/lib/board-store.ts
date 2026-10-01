// 分工看板：tasks、handoffs、alerts、timeline（記憶體 + data/board.json 持久化）
// 用 globalThis 單例，第一次使用才讀檔（build 時 import 模組不會碰磁碟）
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { notify } from './notify'
import type {
  Alert,
  AlertKind,
  BoardSnapshot,
  BoardTask,
  ClaimInfo,
  Handoff,
  TimelineItem,
} from './types'

// AGENT_HUB_DATA_DIR 讓測試用的 Hub 跟正式 Hub 分開存
const DATA_FILE = path.join(process.env.AGENT_HUB_DATA_DIR || path.join(process.cwd(), 'data'), 'board.json')
const MAX_TIMELINE = 500
const MAX_ALERTS = 300

interface Board {
  nextId: number          // tasks、handoffs、alerts、timeline 共用的遞增編號
  tasks: BoardTask[]
  handoffs: Handoff[]
  alerts: Alert[]
  timeline: TimelineItem[]  // 新的在前
}

interface BoardHub {
  board: Board
  emitter: EventEmitter
}

const globalForBoard = globalThis as unknown as { __agentBoard?: BoardHub }

function getHub(): BoardHub {
  if (globalForBoard.__agentBoard) return globalForBoard.__agentBoard

  let board: Board = { nextId: 1, tasks: [], handoffs: [], alerts: [], timeline: [] }
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as Partial<Board>
    board = { ...board, ...saved }
  } catch {
    // 檔案不存在或格式有誤，從空白開始
  }

  const emitter = new EventEmitter()
  emitter.setMaxListeners(0) // 每個瀏覽器分頁一個 SSE 訂閱者，不設上限

  globalForBoard.__agentBoard = { board, emitter }
  return globalForBoard.__agentBoard
}

function nextId(board: Board): number {
  return board.nextId++
}

/**
 * 寫檔 + 通知 SSE 訂閱者（每次變更後呼叫）
 */
function commit() {
  const { board, emitter } = getHub()
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
    fs.writeFileSync(DATA_FILE, JSON.stringify(board, null, 2), 'utf-8')
  } catch (error) {
    console.error('[board-store] 寫入 board.json 失敗:', error)
  }
  emitter.emit('update', getSnapshot())
}

/**
 * 前端用的快照：alerts 只給未處理的
 */
export function getSnapshot(): BoardSnapshot {
  const { board } = getHub()
  return {
    tasks: board.tasks,
    handoffs: board.handoffs,
    alerts: board.alerts.filter((a) => !a.resolvedAt),
    timeline: board.timeline,
  }
}

export function subscribeBoard(listener: (snapshot: BoardSnapshot) => void): () => void {
  const { emitter } = getHub()
  emitter.on('update', listener)
  return () => {
    emitter.off('update', listener)
  }
}

// ---------- timeline ----------

function pushTimeline(board: Board, item: Omit<TimelineItem, 'id'>) {
  board.timeline = [{ id: nextId(board), ...item }, ...board.timeline].slice(0, MAX_TIMELINE)
}

/**
 * 每輪總結（Stop 事件帶 summary 時呼叫）
 */
export function addTurnSummary(machine: string, sessionId: string, project: string, text: string) {
  pushTimeline(getHub().board, { kind: 'turn_summary', machine, sessionId, project, text, ts: Date.now() })
  commit()
}

// ---------- alerts ----------

export interface RaiseAlertInput {
  kind: AlertKind
  text: string
  machine: string
  sessionId: string
  project: string
  file?: string   // 只用在去重
}

/**
 * 發警示 + Discord 通知；10 分鐘內同一件事已發過就略過，回傳 null
 * （不 commit，讓呼叫端把多筆變更合成一次寫檔）
 */
function pushAlert(board: Board, input: RaiseAlertInput): Alert | null {
  if (!notify(input)) return null
  const alert: Alert = {
    id: nextId(board),
    kind: input.kind,
    text: input.text,
    machine: input.machine,
    sessionId: input.sessionId,
    project: input.project,
    ts: Date.now(),
  }
  board.alerts = [alert, ...board.alerts].slice(0, MAX_ALERTS)
  return alert
}

export function raiseAlert(input: RaiseAlertInput): Alert | null {
  const alert = pushAlert(getHub().board, input)
  if (alert) commit()
  return alert
}

export function listAlerts(): Alert[] {
  return getHub().board.alerts.filter((a) => !a.resolvedAt)
}

export function resolveAlert(id: number): Alert | null {
  const alert = getHub().board.alerts.find((a) => a.id === id)
  if (!alert) return null
  alert.resolvedAt ??= Date.now()
  commit()
  return alert
}

/**
 * 這個 session 在 since 之後是否已經發過 stale 警示（watchdog 用來避免重複發）
 */
export function hasStaleAlertSince(machine: string, sessionId: string, since: number): boolean {
  return getHub().board.alerts.some(
    (a) => a.kind === 'stale' && a.machine === machine && a.sessionId === sessionId && a.ts >= since
  )
}

/**
 * 把這個 session 還沒處理的 stale 警示標成已處理（有新事件、或推定已關閉時呼叫）
 */
export function resolveStaleAlerts(machine: string, sessionId: string) {
  const now = Date.now()
  let changed = false
  for (const a of getHub().board.alerts) {
    if (a.kind === 'stale' && !a.resolvedAt && a.machine === machine && a.sessionId === sessionId) {
      a.resolvedAt = now
      changed = true
    }
  }
  if (changed) commit()
}

// ---------- tasks ----------

export function listTasks(): BoardTask[] {
  return getHub().board.tasks
}

export function createTask(title: string, detail: string | undefined, createdBy: string): BoardTask {
  const { board } = getHub()
  const now = Date.now()
  const task: BoardTask = {
    id: nextId(board),
    title,
    detail,
    status: 'open',
    createdBy,
    createdAt: now,
    updatedAt: now,
  }
  board.tasks.push(task)
  commit()
  return task
}

export type TaskAction = 'claim' | 'done' | 'reopen'

/**
 * 認領 / 完成 / 重開；by 是 'user'（網頁）或 ClaimInfo（agent）
 * 回傳 error 時 task 不變
 */
export function updateTask(
  id: number,
  action: TaskAction,
  by: ClaimInfo | 'user',
  summary?: string
): { task: BoardTask } | { error: string; status: number } {
  const { board } = getHub()
  const task = board.tasks.find((t) => t.id === id)
  if (!task) return { error: `找不到任務 #${id}`, status: 404 }

  const now = Date.now()
  if (action === 'claim') {
    if (by === 'user') return { error: '認領需要 machine、sessionId、project', status: 400 }
    if (task.status !== 'open') {
      const owner = task.claimedBy ? `${task.claimedBy.machine}/${task.claimedBy.project}` : ''
      return { error: `任務 #${id} 目前是 ${task.status}${owner ? `（${owner}）` : ''}，不能認領`, status: 409 }
    }
    task.status = 'claimed'
    task.claimedBy = by
    task.claimedAt = now
  } else if (action === 'done') {
    task.status = 'done'
    task.doneAt = now
    task.doneSummary = summary
    // 完成者：agent 用自己的身分，網頁按完成則沿用認領者（沒人認領就記成使用者）
    const who = by === 'user' ? task.claimedBy : by
    const machine = who?.machine ?? 'user'
    const project = who?.project ?? ''
    const text = `#${task.id} ${task.title}${summary ? `：${summary}` : ''}`
    pushTimeline(board, { kind: 'task_done', machine, sessionId: who?.sessionId ?? '', project, text, ts: now })
    pushAlert(board, {
      kind: 'task_done',
      text,
      machine,
      sessionId: who?.sessionId ?? '',
      project,
      file: `task-${task.id}`, // 每個任務各自通知，不被去重吃掉
    })
  } else {
    task.status = 'open'
    task.claimedBy = undefined
    task.claimedAt = undefined
    task.doneAt = undefined
    task.doneSummary = undefined
  }
  task.updatedAt = now
  commit()
  return { task }
}

// ---------- handoffs ----------

/**
 * to 有值時只列寄給該機器或 'any' 的交接（收件匣），否則全部列出
 */
export function listHandoffs(to?: string): Handoff[] {
  const all = getHub().board.handoffs
  if (!to) return all
  return all.filter((h) => h.to === to || h.to === 'any')
}

export function createHandoff(input: Omit<Handoff, 'id' | 'ts' | 'readAt'>): Handoff {
  const { board } = getHub()
  const handoff: Handoff = { id: nextId(board), ...input, ts: Date.now() }
  board.handoffs.push(handoff)

  const target = input.to === 'any' ? '任何一台' : input.to
  const task = input.taskId ? `（任務 #${input.taskId}）` : ''
  const text = `交給 ${target}${task}：做完 ${input.summary}；還剩 ${input.remaining}`
  pushTimeline(board, {
    kind: 'handoff',
    machine: input.from,
    sessionId: input.fromSessionId ?? '',
    project: input.project,
    text,
    ts: handoff.ts,
  })
  pushAlert(board, {
    kind: 'handoff',
    text,
    machine: input.from,
    sessionId: input.fromSessionId ?? '',
    project: input.project,
    file: String(handoff.id), // 每筆交接各自通知，不被去重吃掉
  })
  commit()
  return handoff
}

export function markHandoffRead(id: number): Handoff | null {
  const handoff = getHub().board.handoffs.find((h) => h.id === id)
  if (!handoff) return null
  handoff.readAt ??= Date.now()
  commit()
  return handoff
}
