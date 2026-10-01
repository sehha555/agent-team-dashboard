'use client'

import { useEffect, useState } from 'react'
import { useDashboardStore } from '@/app/store/useDashboardStore'
import type { AgentSession } from '@/app/lib/types'

// 超過 10 分鐘沒有事件視為 stale
const STALE_MS = 10 * 60 * 1000
// 展開時顯示的事件筆數
const EXPANDED_EVENTS = 10

// 顯示用狀態：在 session.status 之外多一個 stale
type DisplayStatus = AgentSession['status'] | 'stale'

function displayStatus(session: AgentSession, now: number): DisplayStatus {
  if (session.status === 'ended') return 'ended'
  if (now > 0 && now - session.lastTs > STALE_MS) return 'stale'
  return session.status
}

// 狀態燈號（沿用 AgentPanel 的風格，無 emoji）
function StatusLight({ status }: { status: DisplayStatus }) {
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
        <span className="inline-flex rounded-full h-2.5 w-2.5 bg-[#eab308]" />
      </span>
    )
  }

  if (status === 'stale') {
    return (
      <span className="relative flex h-2.5 w-2.5" title="無回應">
        {/* 空心灰圈：可能已關閉但沒收到 SessionEnd */}
        <span className="inline-flex rounded-full h-2.5 w-2.5 border border-[#6b7280]" />
      </span>
    )
  }

  // ended
  return (
    <span className="relative flex h-2.5 w-2.5" title="已結束">
      <span className="inline-flex rounded-full h-2.5 w-2.5 bg-[#6b7280]" />
    </span>
  )
}

// 狀態標籤文字
function statusLabel(status: DisplayStatus): string {
  if (status === 'working') return '工作中'
  if (status === 'idle') return '閒置'
  if (status === 'stale') return '無回應'
  return '已結束'
}

// 狀態文字顏色
function statusTextClass(status: DisplayStatus): string {
  if (status === 'working') return 'text-[#22c55e]'
  if (status === 'idle') return 'text-[#eab308]'
  return 'text-[#6b7280]'
}

// 相對時間（now 為 0 表示尚未在瀏覽器端取得時間）
function relativeTime(ts: number, now: number): string {
  if (now === 0) return '—'
  const sec = Math.max(0, Math.floor((now - ts) / 1000))
  if (sec < 60) return `${sec} 秒前`
  if (sec < 3600) return `${Math.floor(sec / 60)} 分鐘前`
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小時前`
  return `${Math.floor(sec / 86400)} 天前`
}

// 時:分:秒
function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-TW', { hour12: false })
}

// 單一 session 卡片，點擊展開最近事件
function SessionCard({ session, now }: { session: AgentSession; now: number }) {
  const [expanded, setExpanded] = useState(false)
  const status = displayStatus(session, now)

  return (
    <div
      className={[
        'rounded-lg border bg-[#141414] p-3 transition-colors',
        status === 'working'
          ? 'border-[#22c55e]/30 hover:border-[#22c55e]/50'
          : status === 'idle'
            ? 'border-[#eab308]/20 hover:border-[#eab308]/40'
            : 'border-[#2a2a2a]',
      ].join(' ')}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left focus:outline-none"
      >
        {/* 頂部：狀態燈號 + 專案名 + 相對時間 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusLight status={status} />
            <span className="text-sm font-semibold text-[#e5e5e5] truncate" title={session.cwd}>
              {session.project || '(未知專案)'}
            </span>
          </div>
          <span className="shrink-0 text-xs text-[#6b7280]">
            {relativeTime(session.lastTs, now)}
          </span>
        </div>

        {/* 最後動作 + 狀態 */}
        <div className="mt-2 flex items-center gap-2 text-xs min-w-0">
          <span className="shrink-0 text-[#6b7280] bg-[#1a1a1a] border border-[#2a2a2a] rounded px-1.5 py-0.5">
            {session.lastEvent}
          </span>
          <span className={`shrink-0 ${statusTextClass(status)}`}>
            {statusLabel(status)}
          </span>
        </div>
        {session.lastDetail && (
          <p className="mt-1.5 text-xs text-[#9ca3af] truncate" title={session.lastDetail}>
            {session.lastDetail}
          </p>
        )}
      </button>

      {/* 展開：最近幾筆事件 */}
      {expanded && (
        <ul className="mt-2 border-t border-[#1e1e1e] pt-2 flex flex-col gap-1">
          {session.events.slice(0, EXPANDED_EVENTS).map((e, i) => (
            <li key={`${e.ts}-${i}`} className="flex gap-2 text-xs min-w-0">
              <span className="shrink-0 text-[#404040] tabular-nums">{clockTime(e.ts)}</span>
              <span className="shrink-0 text-[#6b7280]">{e.tool ?? e.event}</span>
              {e.detail && (
                <span className="text-[#9ca3af] truncate" title={e.detail}>
                  {e.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function MachinePanel() {
  const { sessions, fetchSessions } = useDashboardStore()
  // 每 15 秒更新一次「現在時間」，讓相對時間和 stale 判斷自動前進
  const [now, setNow] = useState(0)

  // 初始化時載入 session 列表
  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, 15000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [])

  // 依機器分組，組內依最後事件時間排序（新的在前）
  const machines = new Map<string, AgentSession[]>()
  for (const s of sessions) {
    machines.set(s.machine, [...(machines.get(s.machine) ?? []), s])
  }
  const groups = [...machines.entries()].sort(([a], [b]) => a.localeCompare(b))

  const statuses = sessions.map((s) => displayStatus(s, now))

  return (
    <div className="flex flex-col gap-3">
      {/* 面板標題 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e5e5e5] uppercase tracking-wider">
          Claude Sessions
        </h2>
        <div className="flex items-center gap-3 text-xs text-[#6b7280]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
            {statuses.filter((s) => s === 'working').length} 工作中
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#eab308]" />
            {statuses.filter((s) => s === 'idle').length} 閒置
          </span>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-6 text-center">
          <p className="text-sm text-[#6b7280]">尚未收到任何機器的事件</p>
        </div>
      ) : (
        groups.map(([machine, list]) => (
          <div key={machine} className="flex flex-col gap-2">
            {/* 機器名稱 */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#e5e5e5]">{machine}</span>
              <span className="text-[#404040]">{list.length} 個 session</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[...list]
                .sort((a, b) => b.lastTs - a.lastTs)
                .map((s) => (
                  <SessionCard key={s.sessionId} session={s} now={now} />
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
