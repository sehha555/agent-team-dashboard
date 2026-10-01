'use client'

import { useState } from 'react'
import { useDashboardStore } from '@/app/store/useDashboardStore'
import type { BoardTask } from '@/app/lib/types'
import { machineLabel } from '@/app/lib/display'

// 三欄：待認領 / 進行中 / 完成
const COLUMNS: { status: BoardTask['status']; label: string; dot: string }[] = [
  { status: 'open', label: '待認領', dot: 'bg-[#404040]' },
  { status: 'claimed', label: '進行中', dot: 'bg-[#3b82f6]' },
  { status: 'done', label: '完成', dot: 'bg-[#22c55e]' },
]

// 完成欄只顯示最近幾筆，避免越拉越長
const DONE_LIMIT = 20

// 建立者：使用者顯示「你」，agent 顯示機器名
function creatorLabel(createdBy: string): string {
  return createdBy === 'user' ? '你' : machineLabel(createdBy.split('/')[0])
}

// 新增任務表單（收合時只是一顆按鈕）
function NewTaskForm({ onClose }: { onClose: () => void }) {
  const { createTask } = useDashboardStore()
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || submitting) return
    setSubmitting(true)
    const ok = await createTask(title.trim(), detail.trim() || undefined)
    setSubmitting(false)
    if (ok) onClose()
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-3 flex flex-col gap-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="任務標題，例如：跑試穿基準"
        className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1.5 text-sm text-[#e5e5e5] placeholder:text-[#404040] focus:outline-none focus:border-[#404040]"
      />
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="細節（選填）：要做什麼、做到哪算完成"
        rows={2}
        className="bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1.5 text-xs text-[#e5e5e5] placeholder:text-[#404040] focus:outline-none focus:border-[#404040] resize-y"
      />
      <div className="flex justify-end gap-2 text-xs">
        <button type="button" onClick={onClose} className="text-[#6b7280] hover:text-[#e5e5e5] px-2 py-1">
          取消
        </button>
        <button
          type="submit"
          disabled={!title.trim() || submitting}
          className="border border-[#22c55e]/40 text-[#22c55e] rounded px-3 py-1 hover:bg-[#1e2d1e] disabled:opacity-40"
        >
          新增
        </button>
      </div>
    </form>
  )
}

// 單一任務卡片
function TaskCard({ task }: { task: BoardTask }) {
  const { taskAction } = useDashboardStore()
  const isDone = task.status === 'done'

  return (
    <div
      className={[
        'rounded-lg border p-2.5 text-xs flex flex-col gap-1',
        isDone ? 'bg-[#0d0d0d] border-[#1e1e1e] opacity-60' : 'bg-[#141414] border-[#2a2a2a]',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm leading-tight ${isDone ? 'text-[#6b7280]' : 'text-[#e5e5e5]'}`}>
          <span className="text-[#6b7280]">#{task.id}</span> {task.title}
        </p>
        <span className="shrink-0 text-[#6b7280] bg-[#1e1e1e] border border-[#2a2a2a] rounded px-1.5 py-0.5">
          {creatorLabel(task.createdBy)} 建立
        </span>
      </div>
      {task.detail && <p className="text-[#9ca3af] whitespace-pre-wrap">{task.detail}</p>}
      {task.claimedBy && (
        <p className="text-[#3b82f6]/80">
          認領：{machineLabel(task.claimedBy.machine)} {task.claimedBy.project || '(未知專案)'}
        </p>
      )}
      {task.doneSummary && <p className="text-[#22c55e]/70">結果：{task.doneSummary}</p>}
      <div className="flex justify-end gap-2 text-[#6b7280]">
        {!isDone && (
          <button onClick={() => taskAction(task.id, 'done')} className="hover:text-[#22c55e]">
            [標成完成]
          </button>
        )}
        {task.status !== 'open' && (
          <button onClick={() => taskAction(task.id, 'reopen')} className="hover:text-[#e5e5e5]">
            [重開]
          </button>
        )}
      </div>
    </div>
  )
}

export default function TaskBoard() {
  const { board } = useDashboardStore()
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      {/* 面板標題 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e5e5e5] uppercase tracking-wider">任務</h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs border border-[#2a2a2a] text-[#9ca3af] rounded px-2 py-1 hover:border-[#404040] hover:text-[#e5e5e5]"
          >
            + 新增任務
          </button>
        )}
      </div>

      {adding && <NewTaskForm onClose={() => setAdding(false)} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {COLUMNS.map((col) => {
          // 未完成的舊的在前（先開先做），完成的新的在前
          const list = board.tasks
            .filter((t) => t.status === col.status)
            .sort((a, b) => (col.status === 'done' ? b.updatedAt - a.updatedAt : a.id - b.id))
            .slice(0, col.status === 'done' ? DONE_LIMIT : undefined)
          return (
            <div key={col.status} className="flex flex-col gap-2 min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-[#6b7280]">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${col.dot}`} />
                {col.label}
                <span className="text-[#404040]">
                  {board.tasks.filter((t) => t.status === col.status).length}
                </span>
              </div>
              {list.length === 0 ? (
                <p className="text-xs text-[#404040] px-1">（無）</p>
              ) : (
                list.map((t) => <TaskCard key={t.id} task={t} />)
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
