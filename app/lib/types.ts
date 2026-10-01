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
  ts: number
}

// 單一 Claude Code session 的即時狀態（stale 由前端依 lastTs 判斷）
export interface AgentSession {
  machine: string
  sessionId: string
  cwd: string
  project: string
  status: 'working' | 'idle' | 'ended'
  lastEvent: string
  lastDetail?: string
  lastTs: number
  events: AgentEvent[]   // 最近 20 筆，新的在前
}

// SSE 事件型別
export interface SSEEvent {
  type: 'task_update' | 'team_update' | 'full_refresh' | 'agent_update'
  data: unknown
}
