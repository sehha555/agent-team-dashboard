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

// SSE 事件型別
export interface SSEEvent {
  type: 'task_update' | 'team_update' | 'full_refresh'
  data: unknown
}
