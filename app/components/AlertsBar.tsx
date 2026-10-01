'use client'

import { useDashboardStore } from '@/app/store/useDashboardStore'
import type { Alert } from '@/app/lib/types'
import { machineLabel } from '@/app/lib/display'

// 警示類型的文字和顏色（無 emoji）
const KIND_STYLE: Record<Alert['kind'], { label: string; className: string }> = {
  needs_input: { label: '等你確認', className: 'text-[#f97316] border-[#f97316]/40' },
  conflict: { label: '撞檔', className: 'text-[#f97316] border-[#f97316]/40' },
  stale: { label: '可能卡住', className: 'text-[#eab308] border-[#eab308]/40' },
  failure: { label: '指令失敗', className: 'text-[#c45c5c] border-[#5c2a2a]' },
  task_done: { label: '完成任務', className: 'text-[#22c55e] border-[#22c55e]/30' },
  handoff: { label: '交接', className: 'text-[#3b82f6] border-[#3b82f6]/40' },
}

// 時:分
function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

export default function AlertsBar() {
  const { board, resolveAlert } = useDashboardStore()
  const alerts = [...board.alerts].sort((a, b) => b.ts - a.ts)

  // 沒有未處理的警示就整列隱藏
  if (alerts.length === 0) return null

  return (
    <div className="rounded-lg border border-[#f97316]/30 bg-[#140f0a] p-3 flex flex-col gap-1.5 max-h-60 overflow-y-auto">
      {alerts.map((a) => {
        const style = KIND_STYLE[a.kind]
        return (
          <div key={a.id} className="flex items-start gap-2 text-sm min-w-0">
            <span className="shrink-0 text-[#f97316] font-bold">!</span>
            <span className="shrink-0 text-[#9ca3af] tabular-nums">{clockTime(a.ts)}</span>
            <span className={`shrink-0 border rounded px-1.5 ${style.className}`}>{style.label}</span>
            <span className="shrink-0 text-[#f5f5f5]">
              {machineLabel(a.machine)} {a.project || '(未知專案)'}
            </span>
            <span className="text-[#d4d4d4] break-all flex-1">{a.text}</span>
            <button
              onClick={() => resolveAlert(a.id)}
              className="shrink-0 text-[#9ca3af] hover:text-[#f5f5f5]"
            >
              [已處理]
            </button>
          </div>
        )
      })}
    </div>
  )
}
