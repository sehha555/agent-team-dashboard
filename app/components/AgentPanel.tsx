'use client'

import { useDashboardStore } from '@/app/store/useDashboardStore'
import type { Agent } from '@/app/lib/types'

// Agent 狀態燈號（純 CSS，無 emoji）
function StatusLight({ status }: { status: Agent['status'] }) {
  if (status === 'working') {
    return (
      <span className="relative flex h-2.5 w-2.5" title="工作中">
        {/* 脈動綠色光環 */}
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-60" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#22c55e]" />
      </span>
    )
  }

  if (status === 'idle') {
    return (
      <span className="relative flex h-2.5 w-2.5" title="閒置中">
        {/* 靜態黃色圓點 */}
        <span className="inline-flex rounded-full h-2.5 w-2.5 bg-[#eab308]" />
      </span>
    )
  }

  // done
  return (
    <span className="relative flex h-2.5 w-2.5" title="已結束">
      <span className="inline-flex rounded-full h-2.5 w-2.5 bg-[#6b7280]" />
    </span>
  )
}

// 狀態標籤文字
function statusLabel(status: Agent['status']): string {
  if (status === 'working') return '工作中'
  if (status === 'idle') return '閒置'
  return '已結束'
}

// 狀態文字顏色
function statusTextClass(status: Agent['status']): string {
  if (status === 'working') return 'text-[#22c55e]'
  if (status === 'idle') return 'text-[#eab308]'
  return 'text-[#6b7280]'
}

// 單一 Agent 卡片
function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div
      className={[
        'rounded-lg border bg-[#141414] p-3 transition-colors',
        agent.status === 'working'
          ? 'border-[#22c55e]/30 hover:border-[#22c55e]/50'
          : agent.status === 'idle'
            ? 'border-[#eab308]/20 hover:border-[#eab308]/40'
            : 'border-[#2a2a2a]',
      ].join(' ')}
    >
      {/* 頂部：狀態燈號 + 名稱 + 完成數 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusLight status={agent.status} />
          <span className="text-sm font-semibold text-[#e5e5e5] truncate">
            {agent.name}
          </span>
        </div>
        {/* 完成數量徽章 */}
        <span className="shrink-0 text-xs bg-[#1e1e1e] border border-[#2a2a2a] text-[#9ca3af] rounded px-1.5 py-0.5">
          &#10003; {agent.completedCount}
        </span>
      </div>

      {/* Agent 類型 + 狀態 */}
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className="text-[#6b7280] bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5">
          {agent.agentType}
        </span>
        <span className={statusTextClass(agent.status)}>
          {statusLabel(agent.status)}
        </span>
      </div>

      {/* 目前執行的任務 */}
      {agent.currentTask && agent.status === 'working' && (
        <div className="mt-2 border-t border-[#1e1e1e] pt-2">
          <p className="text-xs text-[#6b7280]">目前任務</p>
          <p className="text-xs text-[#9ca3af] truncate mt-0.5" title={agent.currentTask}>
            {agent.currentTask}
          </p>
        </div>
      )}
    </div>
  )
}

export default function AgentPanel() {
  const { agents, selectedTeamId, isLoading } = useDashboardStore()

  // 依狀態排序：working > idle > done
  const sortedAgents = [...agents].sort((a, b) => {
    const order = { working: 0, idle: 1, done: 2 }
    return order[a.status] - order[b.status]
  })

  if (!selectedTeamId) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-6 text-center">
        <p className="text-sm text-[#6b7280]">請先選擇一個 Team</p>
      </div>
    )
  }

  if (isLoading && agents.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-6 text-center">
        <p className="text-sm text-[#6b7280]">載入 Agent 資料中...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 面板標題 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e5e5e5] uppercase tracking-wider">
          Agent 狀態
        </h2>
        <div className="flex items-center gap-3 text-xs text-[#6b7280]">
          {/* 工作中數量 */}
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
            {agents.filter((a) => a.status === 'working').length} 工作中
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#eab308]" />
            {agents.filter((a) => a.status === 'idle').length} 閒置
          </span>
        </div>
      </div>

      {/* Agent 卡片列表 */}
      {sortedAgents.length === 0 ? (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-6 text-center">
          <p className="text-sm text-[#6b7280]">目前無 Agent</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sortedAgents.map((agent) => (
            <AgentCard key={agent.agentId} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}
