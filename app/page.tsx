'use client'

import { useEffect, useRef } from 'react'
import TeamSelector from '@/app/components/TeamSelector'
import TaskPanel from '@/app/components/TaskPanel'
import AgentPanel from '@/app/components/AgentPanel'
import StatsPanel from '@/app/components/StatsPanel'
import MachinePanel from '@/app/components/MachinePanel'
import { useDashboardStore } from '@/app/store/useDashboardStore'

// SSE 連線管理（agent_update 不依賴 team 選擇，所以一律連線）
function useSSE() {
  const { selectedTeamId, fetchTasks, fetchSessions, updateSession } = useDashboardStore()
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    // 關閉先前的連線
    eventSourceRef.current?.close()

    const url = selectedTeamId
      ? `/api/sse?teamId=${encodeURIComponent(selectedTeamId)}`
      : '/api/sse'
    const es = new EventSource(url)
    eventSourceRef.current = es

    // 收到更新時重新拉取（簡單可靠）
    es.addEventListener('task_update', () => {
      if (selectedTeamId) fetchTasks(selectedTeamId)
    })

    es.addEventListener('team_update', () => {
      if (selectedTeamId) fetchTasks(selectedTeamId)
    })

    // 每次（重新）連線都會收到，順便補抓斷線期間漏掉的 session 更新
    es.addEventListener('full_refresh', () => {
      if (selectedTeamId) fetchTasks(selectedTeamId)
      fetchSessions()
    })

    es.addEventListener('agent_update', (e) => {
      updateSession(JSON.parse((e as MessageEvent).data))
    })

    es.onerror = () => {
      // SSE 斷線會自動重連，不需特別處理
    }

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [selectedTeamId, fetchTasks, fetchSessions, updateSession])
}

export default function DashboardPage() {
  const { error, setError } = useDashboardStore()

  // 啟動 SSE
  useSSE()

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-4 flex flex-col gap-4 max-w-7xl mx-auto">
      {/* 頂部標題列 */}
      <header className="flex items-center justify-between border-b border-[#2a2a2a] pb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-[#e5e5e5] tracking-tight">
            Agent Team Dashboard
          </h1>
          <span className="text-xs text-[#404040] border border-[#2a2a2a] rounded px-1.5 py-0.5">
            Phase 1
          </span>
        </div>
        <span className="text-xs text-[#404040]">
          localhost:3100
        </span>
      </header>

      {/* 錯誤提示 */}
      {error && (
        <div className="bg-[#1a1010] border border-[#5c2a2a] text-[#c45c5c] text-sm rounded-lg px-4 py-2 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-[#c45c5c]/60 hover:text-[#c45c5c] text-xs ml-4"
          >
            [關閉]
          </button>
        </div>
      )}

      {/* 跨機器 Claude Code session（不分 team，一律顯示） */}
      <div className="rounded-lg border border-[#2a2a2a] bg-[#111111] p-4">
        <MachinePanel />
      </div>

      {/* Team 選擇器 */}
      <TeamSelector />

      {/* Bento Grid 主面板 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-4 flex-1">
        {/* 左側：Task 面板（tall card） */}
        <div className="lg:row-span-2 rounded-lg border border-[#2a2a2a] bg-[#111111] p-4 overflow-y-auto max-h-[calc(100vh-220px)]">
          <TaskPanel />
        </div>

        {/* 右上：Agent 面板 */}
        <div className="rounded-lg border border-[#2a2a2a] bg-[#111111] p-4">
          <AgentPanel />
        </div>

        {/* 右下：Stats 面板 */}
        <div>
          <StatsPanel />
        </div>
      </div>

      {/* Phase 2 預留區：Discussion + Summary */}
      <div className="rounded-lg border border-[#1e1e1e] bg-[#0d0d0d] p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#404040] uppercase tracking-wider">
            Discussion + Summary
          </span>
          <span className="text-xs text-[#2a2a2a]">Phase 2</span>
        </div>
      </div>
    </div>
  )
}
