'use client'

import { create } from 'zustand'
import type { Task, Agent, AgentSession, BoardSnapshot } from '@/app/lib/types'

// 統計資訊型別
interface Stats {
  total: number
  completed: number
  inProgress: number
  pending: number
  completionPercent: number
}

// Store 狀態和 Action 定義
interface DashboardState {
  teams: string[]                   // team 名稱列表
  selectedTeamId: string | null     // 目前選中的 team
  tasks: Task[]
  agents: Agent[]
  stats: Stats
  isLoading: boolean
  error: string | null
  sessions: AgentSession[]          // 跨機器 Claude Code session（不分 team）
  board: BoardSnapshot              // 分工看板（SSE board_update 整包更新）

  // Actions
  fetchTeams: () => Promise<void>
  fetchTasks: (teamId: string) => Promise<void>
  selectTeam: (teamId: string) => void
  updateTask: (task: Task) => void
  setError: (error: string | null) => void
  fetchSessions: () => Promise<void>
  updateSession: (session: AgentSession) => void
  setBoard: (board: BoardSnapshot) => void
  createTask: (title: string, detail?: string) => Promise<boolean>
  taskAction: (id: number, action: 'done' | 'reopen') => Promise<void>  // 網頁只能完成或重開，認領由 agent 做
  resolveAlert: (id: number) => Promise<void>
}

// 看板寫入：成功後畫面靠 SSE board_update 更新，失敗才把錯誤顯示出來
async function boardRequest(url: string, method: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) return null
    const data = await res.json().catch(() => ({}))
    return data.error ?? `操作失敗：${res.status}`
  } catch {
    return '連不上 Hub'
  }
}

// 計算統計資訊的輔助函式
function calcStats(tasks: Task[]): Stats {
  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'completed').length
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length
  const pending = tasks.filter((t) => t.status === 'pending').length
  const completionPercent = total > 0 ? Math.round((completed / total) * 100) : 0
  return { total, completed, inProgress, pending, completionPercent }
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  // 初始狀態
  teams: [],
  selectedTeamId: null,
  tasks: [],
  agents: [],
  stats: { total: 0, completed: 0, inProgress: 0, pending: 0, completionPercent: 0 },
  isLoading: false,
  error: null,
  sessions: [],
  board: { tasks: [], handoffs: [], alerts: [], timeline: [] },

  // 取得所有 team 列表
  fetchTeams: async () => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch('/api/teams')
      if (!res.ok) throw new Error(`取得 teams 失敗：${res.status}`)
      const json = await res.json()
      // API 回傳 { teams: [{ name, teamId, memberCount, taskCount }] }
      const teamIds: string[] = (json.teams ?? []).map((t: { teamId: string }) => t.teamId)
      set({ teams: teamIds, isLoading: false })

      // 若尚未選擇 team 且有可用 team，自動選第一個
      const { selectedTeamId } = get()
      if (!selectedTeamId && teamIds.length > 0) {
        get().selectTeam(teamIds[0])
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知錯誤'
      set({ error: message, isLoading: false })
    }
  },

  // 取得指定 team 的任務和 agent 資訊
  fetchTasks: async (teamId: string) => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch(`/api/tasks/${teamId}`)
      if (!res.ok) throw new Error(`取得 tasks 失敗：${res.status}`)
      const data: { tasks: Task[]; agents: Agent[] } = await res.json()
      const tasks = data.tasks ?? []
      const agents = data.agents ?? []
      set({
        tasks,
        agents,
        stats: calcStats(tasks),
        isLoading: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知錯誤'
      set({ error: message, isLoading: false })
    }
  },

  // 切換選中的 team 並自動載入資料
  selectTeam: (teamId: string) => {
    set({ selectedTeamId: teamId })
    get().fetchTasks(teamId)
  },

  // 從 SSE 接收到 task 更新時，更新單一 task（元件端呼叫）
  updateTask: (task: Task) => {
    set((state) => {
      const exists = state.tasks.find((t) => t.id === task.id)
      const tasks = exists
        ? state.tasks.map((t) => (t.id === task.id ? task : t))
        : [...state.tasks, task]
      return { tasks, stats: calcStats(tasks) }
    })
  },

  // 設定錯誤訊息（供外部清除用）
  setError: (error: string | null) => set({ error }),

  // 取得所有跨機器 session（不動共用的 isLoading/error，避免干擾 team 面板）
  fetchSessions: async () => {
    try {
      const res = await fetch('/api/events')
      if (!res.ok) return
      const data: { sessions: AgentSession[] } = await res.json()
      set({ sessions: data.sessions ?? [] })
    } catch {
      // Hub 暫時連不上，保留現有資料
    }
  },

  // 從 SSE 接收到 agent_update 時，更新單一 session
  updateSession: (session: AgentSession) => {
    set((state) => {
      const isSame = (s: AgentSession) =>
        s.machine === session.machine && s.sessionId === session.sessionId
      const exists = state.sessions.some(isSame)
      const sessions = exists
        ? state.sessions.map((s) => (isSame(s) ? session : s))
        : [session, ...state.sessions]
      return { sessions }
    })
  },

  setBoard: (board: BoardSnapshot) => set({ board }),

  // 網頁上開的任務，建立者一律是使用者
  createTask: async (title: string, detail?: string) => {
    const error = await boardRequest('/api/board/tasks', 'POST', { title, detail, createdBy: 'user' })
    if (error) set({ error })
    return error === null
  },

  taskAction: async (id: number, action: 'done' | 'reopen') => {
    const error = await boardRequest('/api/board/tasks', 'PATCH', { id, action, by: 'user' })
    if (error) set({ error })
  },

  resolveAlert: async (id: number) => {
    const error = await boardRequest('/api/board/alerts', 'PATCH', { id })
    if (error) set({ error })
  },
}))
