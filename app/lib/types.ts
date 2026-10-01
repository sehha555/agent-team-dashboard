// 任務型別定義
export interface Task {
  id: string
  subject: string
  description: string
  activeForm?: string
  status: 'pending' | 'in_progress' | 'completed'
  owner?: string
  blocks: string[]
  blockedBy: string[]
}

// Agent 狀態型別
export interface Agent {
  name: string
  agentId: string
  agentType: string
  status: 'working' | 'idle' | 'done'
  currentTask?: string
  completedCount: number
}

// Team 整合型別（config + tasks + 推導狀態）
export interface Team {
  name: string
  members: Agent[]
  tasks: Task[]
  taskStats: {
    total: number
    completed: number
    inProgress: number
    pending: number
    completionPercent: number
  }
}

// 跨機器 hook 回報的單筆事件（hooks/report.mjs 送來的格式）
export interface AgentEvent {
  machine: string
  sessionId: string
  cwd: string
  event: string
  tool?: string
  detail?: string
  summary?: string       // Stop 事件才有：這輪最後一則回覆的摘要
  ts: number
}

// 單一 Claude Code session 的即時狀態（stale 由前端依 lastTs 判斷）
// waiting = Claude 在等使用者確認或回答（Notification 事件）
export interface AgentSession {
  machine: string
  sessionId: string
  cwd: string
  project: string
  status: 'working' | 'idle' | 'waiting' | 'ended'
  lastEvent: string
  lastDetail?: string
  lastTs: number
  firstPrompt?: string   // 第一次 UserPromptSubmit 的文字（舊資料沒有）
  events: AgentEvent[]   // 最近 50 筆，新的在前
}

// 認領者：哪台電腦的哪個 session、在哪個專案
export interface ClaimInfo {
  machine: string
  sessionId: string
  project: string
}

// 分工看板的任務（跟上面 Agent Team 的 Task 是兩回事）
export interface BoardTask {
  id: number
  title: string
  detail?: string
  status: 'open' | 'claimed' | 'done'
  createdBy: string          // 'user' 或 'machine/sessionId'
  claimedBy?: ClaimInfo
  doneSummary?: string
  createdAt: number
  updatedAt: number
  claimedAt?: number
  doneAt?: number
}

// 交接：from 交給 to（機器名稱或 'any'）
export interface Handoff {
  id: number
  from: string
  fromSessionId?: string
  to: string
  project: string
  summary: string            // 做完什麼
  remaining: string          // 還剩什麼
  taskId?: number
  ts: number
  readAt?: number
}

// 需要使用者處理的警示
export type AlertKind = 'needs_input' | 'conflict' | 'stale' | 'failure' | 'task_done' | 'handoff'

export interface Alert {
  id: number
  kind: AlertKind
  text: string
  machine: string
  sessionId: string
  project: string
  ts: number
  resolvedAt?: number
}

// 粗紀錄（交接、完成任務、每輪總結）
export interface TimelineItem {
  id: number
  kind: 'handoff' | 'task_done' | 'turn_summary'
  machine: string
  sessionId: string
  project: string
  text: string
  ts: number
}

// board_update 推給前端的快照（alerts 只含未處理的）
export interface BoardSnapshot {
  tasks: BoardTask[]
  handoffs: Handoff[]
  alerts: Alert[]
  timeline: TimelineItem[]
}

// SSE 事件型別
export interface SSEEvent {
  type: 'task_update' | 'team_update' | 'full_refresh' | 'agent_update' | 'board_update'
  data: unknown
}
