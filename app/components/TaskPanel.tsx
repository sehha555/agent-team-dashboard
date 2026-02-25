'use client'

import { useMemo } from 'react'
import { useDashboardStore } from '@/app/store/useDashboardStore'
import type { Task } from '@/app/lib/types'

// 狀態優先順序：in_progress > pending > completed
const STATUS_ORDER: Record<Task['status'], number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
}

// 狀態 Badge 元件（純 CSS，無 emoji）
function StatusBadge({ status }: { status: Task['status'] }) {
  if (status === 'in_progress') {
    return (
      <span className="flex items-center gap-1.5" title="進行中">
        {/* 脈動藍色圓點 */}
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
        </span>
        <span className="text-xs text-blue-400 font-medium">進行中</span>
      </span>
    )
  }

  if (status === 'pending') {
    return (
      <span className="flex items-center gap-1.5" title="等待中">
        <span className="inline-flex rounded-full h-2 w-2 bg-[#404040]" />
        <span className="text-xs text-[#6b7280] font-medium">等待中</span>
      </span>
    )
  }

  // completed
  return (
    <span className="flex items-center gap-1.5" title="已完成">
      {/* 綠色勾號（用 CSS 字符） */}
      <span
        className="text-[#22c55e] text-xs leading-none"
        style={{ fontWeight: 700 }}
      >
        &#10003;
      </span>
      <span className="text-xs text-[#22c55e]/70 font-medium">已完成</span>
    </span>
  )
}

// 單一 Task 卡片
function TaskCard({ task }: { task: Task }) {
  const isBlocked = task.blockedBy.length > 0
  const isCompleted = task.status === 'completed'

  return (
    <div
      className={[
        'rounded-lg border p-3 transition-colors',
        isCompleted
          ? 'bg-[#0d0d0d] border-[#1e1e1e] opacity-60'
          : isBlocked
            ? 'bg-[#1a1010] border-[#3a1e1e]'
            : 'bg-[#141414] border-[#2a2a2a] hover:border-[#3a3a3a]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        {/* 左側：狀態 + 主題 */}
        <div className="flex flex-col gap-1 min-w-0">
          <StatusBadge status={task.status} />
          <p
            className={[
              'text-sm font-medium leading-tight truncate',
              isCompleted ? 'text-[#6b7280] line-through' : 'text-[#e5e5e5]',
            ].join(' ')}
            title={task.subject}
          >
            {task.subject}
          </p>

          {/* 進行中：顯示 activeForm */}
          {task.status === 'in_progress' && task.activeForm && (
            <p className="text-xs text-blue-400/70 mt-0.5 truncate">
              執行中：{task.activeForm}
            </p>
          )}
        </div>

        {/* 右側：owner */}
        {task.owner && (
          <span className="shrink-0 text-xs text-[#6b7280] bg-[#1e1e1e] rounded px-1.5 py-0.5 border border-[#2a2a2a]">
            {task.owner}
          </span>
        )}
      </div>

      {/* 阻塞標記 */}
      {isBlocked && (
        <div className="mt-2 flex flex-wrap gap-1 items-center">
          <span className="text-xs text-[#c45c5c] font-medium">阻塞於：</span>
          {task.blockedBy.map((blockerId) => (
            <span
              key={blockerId}
              className="text-xs bg-[#2a1010] border border-[#5c2a2a] text-[#c45c5c]/80 rounded px-1.5 py-0.5"
            >
              {blockerId}
            </span>
          ))}
        </div>
      )}

      {/* 此 task 阻塞的其他 task */}
      {task.blocks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 items-center">
          <span className="text-xs text-[#6b7280]">阻塞：</span>
          {task.blocks.map((blockedId) => (
            <span
              key={blockedId}
              className="text-xs bg-[#1e1e1e] border border-[#2a2a2a] text-[#6b7280] rounded px-1.5 py-0.5"
            >
              {blockedId}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TaskPanel() {
  const { tasks, selectedTeamId, isLoading } = useDashboardStore()

  // 依狀態優先順序排序
  const sortedTasks = useMemo(() => {
    return [...tasks].sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    )
  }, [tasks])

  if (!selectedTeamId) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-6 text-center">
        <p className="text-sm text-[#6b7280]">請先選擇一個 Team</p>
      </div>
    )
  }

  if (isLoading && tasks.length === 0) {
    return (
      <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-6 text-center">
        <p className="text-sm text-[#6b7280]">載入任務中...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 面板標題 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e5e5e5] uppercase tracking-wider">
          任務列表
        </h2>
        <span className="text-xs text-[#6b7280]">{tasks.length} 項</span>
      </div>

      {/* 任務卡片列表 */}
      {sortedTasks.length === 0 ? (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-6 text-center">
          <p className="text-sm text-[#6b7280]">目前無任務</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  )
}
