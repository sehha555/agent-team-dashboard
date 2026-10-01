'use client'

import { create } from 'zustand'
import type { Task, Agent, AgentSession } from '@/app/lib/types'

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

  // Actions
  fetchTeams: () => Promise<void>
  fetchTasks: (teamId: string) => Promise<void>
  selectTeam: (teamId: string) => void
  updateTask: (task: Task) => void
  setError: (error: string | null) => void
  fetchSessions: () => Promise<void>
  updateSession: (session: AgentSession) => void
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
}))
