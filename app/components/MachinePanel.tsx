'use client'

import { useEffect, useState } from 'react'
import { useDashboardStore } from '@/app/store/useDashboardStore'
import type { AgentSession, BoardTask } from '@/app/lib/types'
import { eventPhrase, machineLabel, machineOrder, relativeTime, statusPhrase, topicText } from '@/app/lib/display'

// 超過 10 分鐘沒有事件視為 stale（燈號變空心灰圈）
const STALE_MS = 10 * 60 * 1000
// 超過 30 分鐘沒有事件就收進「已結束」（等你確認、指令還在跑的不收）
const COLLAPSE_MS = 30 * 60 * 1000
// 任何狀態超過 60 分鐘沒有事件：推定已關閉，一律收合（和 watchdog 的規則一致）
const GONE_MS = 60 * 60 * 1000
// 展開時顯示的事件筆數
const EXPANDED_EVENTS = 10

// 顯示用狀態：在 session.status 之外多一個 stale
type DisplayStatus = AgentSession['status'] | 'stale'

// 工具還在跑（最後一筆是 PreToolUse）：久沒事件也不算無回應
function toolRunning(session: AgentSession): boolean {
  return session.status === 'working' && session.lastEvent === 'PreToolUse'
}

function displayStatus(session: AgentSession, now: number): DisplayStatus {
  if (session.status === 'ended') return 'ended'
  if (now > 0 && now - session.lastTs > STALE_MS && !toolRunning(session)) return 'stale'
  return session.status
}

// 收合規則：已結束、超過 60 分鐘沒事件（多半是沒收到 SessionEnd），
// 或超過 30 分鐘沒事件（等你確認、指令還在跑的除外）
function isCollapsed(session: AgentSession, now: number): boolean {
  if (session.status === 'ended') return true
  if (now === 0) return false
  const idleMs = now - session.lastTs
  if (idleMs > GONE_MS) return true
  if (session.status === 'waiting' || toolRunning(session)) return false
  return idleMs > COLLAPSE_MS
}

// 排序：等你確認 > 工作中 > 閒置，同一級最新的在前
const STATUS_RANK: Record<AgentSession['status'], number> = { waiting: 0, working: 1, idle: 2, ended: 3 }

function bySessionPriority(a: AgentSession, b: AgentSession): number {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.lastTs - a.lastTs
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

  if (status === 'waiting') {
    return (
      <span className="relative flex h-2.5 w-2.5" title="等你確認">
        {/* 脈動橘色光環：Claude 停下來等使用者 */}
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f97316] opacity-60" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#f97316]" />
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

// 狀態文字顏色
function statusTextClass(status: AgentSession['status']): string {
  if (status === 'working') return 'text-[#22c55e]'
  if (status === 'waiting') return 'text-[#f97316]'
  return 'text-[#9ca3af]'
}

// 時:分:秒
function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-TW', { hour12: false })
}

// 單一 session 卡片，點擊展開最近事件；topic 是任務標題或第一句指令
function SessionCard({ session, now, topic }: { session: AgentSession; now: number; topic?: string }) {
  const [expanded, setExpanded] = useState(false)
  const status = displayStatus(session, now)

  return (
    <div
      className={[
        'rounded-lg border bg-[#141414] p-3 transition-colors',
        status === 'working'
          ? 'border-[#22c55e]/30 hover:border-[#22c55e]/50'
          : status === 'waiting'
            ? 'border-[#f97316]/50 hover:border-[#f97316]/70'
            : status === 'idle'
              ? 'border-[#eab308]/20 hover:border-[#eab308]/40'
              : 'border-[#2a2a2a]',
      ].join(' ')}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left focus:outline-none flex flex-col gap-1"
      >
        {/* 頂部：狀態燈號 + 專案名 + 相對時間 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusLight status={status} />
            <span className="text-base font-semibold text-[#f5f5f5] truncate" title={session.cwd}>
              {session.project || '(未知專案)'}
            </span>
          </div>
          {session.status !== 'idle' && (
            <span className="shrink-0 text-sm text-[#9ca3af]">{relativeTime(session.lastTs, now)}</span>
          )}
        </div>

        {/* 主題 */}
        {topic && <p className="text-sm text-[#d4d4d4] truncate">「{topic}」</p>}

        {/* 白話狀態 */}
        <p
          className={`text-sm truncate ${statusTextClass(session.status)}`}
          title={statusPhrase(session, now)}
        >
          {statusPhrase(session, now)}
        </p>
      </button>

      {/* 展開：最近幾筆事件 */}
      {expanded && (
        <ul className="mt-2 border-t border-[#2a2a2a] pt-2 flex flex-col gap-1">
          {session.events.slice(0, EXPANDED_EVENTS).map((e, i) => (
            <li key={`${e.ts}-${i}`} className="flex gap-2 text-xs min-w-0">
              <span className="shrink-0 text-[#9ca3af] tabular-nums">{clockTime(e.ts)}</span>
              <span className="shrink-0 text-[#d4d4d4]">{eventPhrase(e)}</span>
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

// 收合區的精簡一行
function CompactRow({ session, now, topic }: { session: AgentSession; now: number; topic?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm min-w-0 px-1 py-1">
      <StatusLight status={displayStatus(session, now)} />
      <span className="shrink-0 text-[#d4d4d4]">{session.project || '(未知專案)'}</span>
      {topic && <span className="text-[#9ca3af] truncate">「{topic}」</span>}
      <span className="ml-auto shrink-0 text-[#9ca3af]">{relativeTime(session.lastTs, now)}</span>
    </div>
  )
}

// 一台電腦一欄：上面是活躍的 session，底部收合已結束的
function MachineColumn({
  machine,
  list,
  now,
  topicOf,
}: {
  machine: string
  list: AgentSession[]
  now: number
  topicOf: (s: AgentSession) => string | undefined
}) {
  const [showEnded, setShowEnded] = useState(false)
  const active = list.filter((s) => !isCollapsed(s, now)).sort(bySessionPriority)
  const ended = list.filter((s) => isCollapsed(s, now)).sort((a, b) => b.lastTs - a.lastTs)

  return (
    <div className="flex flex-col gap-2 min-w-0">
      {/* 機器名稱 */}
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold text-[#f5f5f5]" title={machine}>
          {machineLabel(machine)}
        </span>
        <span className="text-sm text-[#9ca3af]">{active.length} 個進行中</span>
      </div>

      {active.length === 0 && <p className="text-sm text-[#9ca3af] px-1">目前沒有進行中的 session</p>}
      {active.map((s) => (
        <SessionCard key={s.sessionId} session={s} now={now} topic={topicOf(s)} />
      ))}

      {ended.length > 0 && (
        <div className="flex flex-col">
          <button
            onClick={() => setShowEnded((v) => !v)}
            className="self-start text-sm text-[#9ca3af] hover:text-[#f5f5f5] px-1 py-1 focus:outline-none"
          >
            {showEnded ? '▾' : '▸'} 已結束 {ended.length} 個
          </button>
          {showEnded &&
            ended.map((s) => <CompactRow key={s.sessionId} session={s} now={now} topic={topicOf(s)} />)}
        </div>
      )}
    </div>
  )
}

export default function MachinePanel() {
  const { sessions, fetchSessions, board } = useDashboardStore()
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

  // 依機器分組，桌機在左、Mac 在右
  const machines = new Map<string, AgentSession[]>()
  for (const s of sessions) {
    machines.set(s.machine, [...(machines.get(s.machine) ?? []), s])
  }
  const groups = [...machines.entries()].sort(
    ([a], [b]) => machineOrder(a) - machineOrder(b) || a.localeCompare(b)
  )

  const visible = sessions.filter((s) => !isCollapsed(s, now))

  // session 認領中的任務：同機器同 session；MCP 取不到 sessionId 時退而比對同機器同專案
  const claimedTasks = (s: AgentSession): BoardTask[] =>
    board.tasks.filter(
      (t) =>
        t.status === 'claimed' &&
        t.claimedBy?.machine === s.machine &&
        (t.claimedBy.sessionId === s.sessionId ||
          (t.claimedBy.sessionId === 'mcp' && t.claimedBy.project === s.project))
    )

  // 主題：優先用認領中的任務標題，沒有就用第一句指令
  const topicOf = (s: AgentSession) => topicText(claimedTasks(s)[0]?.title ?? s.firstPrompt)

  return (
    <div className="flex flex-col gap-3">
      {/* 面板標題 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#f5f5f5] uppercase tracking-wider">
          Claude Sessions
        </h2>
        <div className="flex items-center gap-3 text-sm text-[#9ca3af]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#f97316]" />
            {visible.filter((s) => s.status === 'waiting').length} 等你確認
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
            {visible.filter((s) => s.status === 'working').length} 工作中
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#eab308]" />
            {visible.filter((s) => s.status === 'idle').length} 閒置
          </span>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-6 text-center">
          <p className="text-sm text-[#9ca3af]">尚未收到任何機器的事件</p>
        </div>
      ) : (
        // 每台機器一欄，兩台並排
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {groups.map(([machine, list]) => (
            <MachineColumn key={machine} machine={machine} list={list} now={now} topicOf={topicOf} />
          ))}
        </div>
      )}
    </div>
  )
}
