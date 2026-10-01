'use client'

import { useState } from 'react'
import { useDashboardStore } from '@/app/store/useDashboardStore'
import type { AgentEvent, TimelineItem } from '@/app/lib/types'
import { eventPhrase, machineLabel } from '@/app/lib/display'

// 一次顯示幾筆粗紀錄
const PAGE_SIZE = 30
// 「展開」看的細事件範圍：這筆紀錄前 15 分鐘到後 1 分鐘
const BEFORE_MS = 15 * 60 * 1000
const AFTER_MS = 60 * 1000

const KIND_STYLE: Record<TimelineItem['kind'], { label: string; className: string }> = {
  handoff: { label: '交接', className: 'text-[#3b82f6] border-[#3b82f6]/40' },
  task_done: { label: '完成任務', className: 'text-[#22c55e] border-[#22c55e]/30' },
  turn_summary: { label: '總結', className: 'text-[#9ca3af] border-[#2a2a2a]' },
}

// 月/日 時:分
function shortTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-TW', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 時:分:秒
function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-TW', { hour12: false })
}

// 單筆粗紀錄，點「展開」列出該 session 在那段時間的細事件
function TimelineRow({ item }: { item: TimelineItem }) {
  const { sessions } = useDashboardStore()
  const [expanded, setExpanded] = useState(false)
  const style = KIND_STYLE[item.kind]

  const session = sessions.find((s) => s.machine === item.machine && s.sessionId === item.sessionId)
  const events: AgentEvent[] = (session?.events ?? [])
    .filter((e) => e.ts >= item.ts - BEFORE_MS && e.ts <= item.ts + AFTER_MS)
    .sort((a, b) => a.ts - b.ts)

  return (
    <li className="border-b border-[#1e1e1e] last:border-0 py-2">
      <div className="flex items-start gap-2 text-xs min-w-0">
        <span className="shrink-0 text-[#404040] tabular-nums">{shortTime(item.ts)}</span>
        <span className={`shrink-0 border rounded px-1.5 ${style.className}`}>{style.label}</span>
        <span className="shrink-0 text-[#e5e5e5]">
          {machineLabel(item.machine)}
          {item.project ? ` ${item.project}` : ''}
        </span>
        <span className="text-[#9ca3af] break-all flex-1">{item.text}</span>
        {item.sessionId && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[#6b7280] hover:text-[#e5e5e5]"
          >
            {expanded ? '[收合]' : '[展開]'}
          </button>
        )}
      </div>

      {expanded && (
        <ul className="mt-2 ml-4 border-l border-[#2a2a2a] pl-3 flex flex-col gap-1">
          {events.length === 0 ? (
            <li className="text-xs text-[#404040]">這段時間沒有留下細事件（Hub 每個 session 只保留最近 50 筆）</li>
          ) : (
            events.map((e, i) => (
              <li key={`${e.ts}-${i}`} className="flex gap-2 text-xs min-w-0">
                <span className="shrink-0 text-[#404040] tabular-nums">{clockTime(e.ts)}</span>
                <span className="shrink-0 text-[#6b7280]">{eventPhrase(e)}</span>
                {e.detail && (
                  <span className="text-[#9ca3af] truncate" title={e.detail}>
                    {e.detail}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </li>
  )
}

export default function Timeline() {
  const { board } = useDashboardStore()
  const [limit, setLimit] = useState(PAGE_SIZE)
  const items = board.timeline.slice(0, limit)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e5e5e5] uppercase tracking-wider">紀錄</h2>
        <span className="text-xs text-[#6b7280]">交接、完成任務、每輪總結</span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-[#404040]">還沒有紀錄</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <TimelineRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {board.timeline.length > limit && (
        <button
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
          className="self-center text-xs text-[#6b7280] hover:text-[#e5e5e5]"
        >
          [顯示更多]
        </button>
      )}
    </div>
  )
}
