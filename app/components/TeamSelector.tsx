'use client'

import { useEffect } from 'react'
import { useDashboardStore } from '@/app/store/useDashboardStore'

export default function TeamSelector() {
  const { teams, selectedTeamId, tasks, agents, isLoading, fetchTeams, selectTeam } =
    useDashboardStore()

  // 初始化時載入 team 列表
  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 pb-2 border-b border-[#2a2a2a]">
        <span className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">
          Agent Team
        </span>
        {isLoading && (
          <span className="text-xs text-[#404040]">載入中...</span>
        )}
      </div>

      {/* Tab Bar 形式的 team 選擇器 */}
      <div className="flex gap-1 flex-wrap">
        {teams.length === 0 && !isLoading ? (
          <span className="text-sm text-[#6b7280] py-1">尚無可用 Team</span>
        ) : (
          teams.map((teamId) => {
            const isSelected = selectedTeamId === teamId
            // 選中 team 時顯示當前任務數和成員數
            const memberCount = isSelected ? agents.length : null
            const taskCount = isSelected ? tasks.length : null

            return (
              <button
                key={teamId}
                onClick={() => selectTeam(teamId)}
                className={[
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150',
                  'border focus:outline-none focus:ring-1 focus:ring-[#22c55e]/50',
                  isSelected
                    ? 'bg-[#1e2d1e] border-[#22c55e]/40 text-[#22c55e]'
                    : 'bg-[#141414] border-[#2a2a2a] text-[#9ca3af] hover:border-[#404040] hover:text-[#e5e5e5]',
                ].join(' ')}
              >
                <span>{teamId}</span>
                {/* 選中 team 顯示成員數和任務數 */}
                {isSelected && memberCount !== null && taskCount !== null && (
                  <span className="ml-2 text-xs text-[#22c55e]/70">
                    {memberCount} 名成員 · {taskCount} 項任務
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>

      {/* 選中 Team 的詳細資訊列 */}
      {selectedTeamId && (
        <div className="flex items-center gap-4 mt-1 text-xs text-[#6b7280]">
          <span>
            目前選中：
            <span className="text-[#e5e5e5] ml-1">{selectedTeamId}</span>
          </span>
          <span className="text-[#2a2a2a]">|</span>
          <span>
            成員：<span className="text-[#e5e5e5]">{agents.length}</span>
          </span>
          <span className="text-[#2a2a2a]">|</span>
          <span>
            任務：<span className="text-[#e5e5e5]">{tasks.length}</span>
          </span>
        </div>
      )}
    </div>
  )
}
