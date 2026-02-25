'use client'

import { useDashboardStore } from '@/app/store/useDashboardStore'

// 單一統計數字區塊
function StatBlock({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xl font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="text-xs text-[#6b7280]">{label}</span>
    </div>
  )
}

export default function StatsPanel() {
  const { stats, selectedTeamId } = useDashboardStore()
  const { total, completed, inProgress, pending, completionPercent } = stats

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-4 flex flex-col gap-4">
      {/* 標題列 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e5e5e5] uppercase tracking-wider">
          任務進度
        </h2>
        {selectedTeamId && (
          <span className="text-xs text-[#6b7280]">{selectedTeamId}</span>
        )}
      </div>

      {/* 進度條 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#9ca3af]">完成進度</span>
          <span className="text-[#e5e5e5] font-semibold tabular-nums">
            {completionPercent}%
          </span>
        </div>

        {/* CSS gradient 進度條 */}
        <div className="h-2 w-full rounded-full bg-[#1e1e1e] overflow-hidden border border-[#2a2a2a]">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${completionPercent}%`,
              background:
                completionPercent === 100
                  ? '#22c55e'
                  : 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
              minWidth: completionPercent > 0 ? '0.25rem' : '0',
            }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-[#6b7280]">
          <span>{completed} / {total} 項任務</span>
          {inProgress > 0 && (
            <span className="text-blue-400">{inProgress} 項進行中</span>
          )}
        </div>
      </div>

      {/* 分隔線 */}
      <div className="border-t border-[#1e1e1e]" />

      {/* 三格統計數字 */}
      <div className="grid grid-cols-3 gap-4">
        <StatBlock
          label="已完成"
          value={completed}
          color="#22c55e"
        />
        <StatBlock
          label="進行中"
          value={inProgress}
          color="#3b82f6"
        />
        <StatBlock
          label="等待中"
          value={pending}
          color="#6b7280"
        />
      </div>

      {/* 分段進度條（顯示各狀態比例） */}
      {total > 0 && (
        <div className="flex h-1.5 w-full rounded-full overflow-hidden gap-px">
          {/* 已完成（綠） */}
          {completed > 0 && (
            <div
              className="h-full bg-[#22c55e] transition-all duration-500"
              style={{ width: `${(completed / total) * 100}%` }}
              title={`已完成 ${completed}`}
            />
          )}
          {/* 進行中（藍） */}
          {inProgress > 0 && (
            <div
              className="h-full bg-[#3b82f6] transition-all duration-500"
              style={{ width: `${(inProgress / total) * 100}%` }}
              title={`進行中 ${inProgress}`}
            />
          )}
          {/* 等待中（暗灰） */}
          {pending > 0 && (
            <div
              className="h-full bg-[#2a2a2a] transition-all duration-500"
              style={{ width: `${(pending / total) * 100}%` }}
              title={`等待中 ${pending}`}
            />
          )}
        </div>
      )}
    </div>
  )
}
