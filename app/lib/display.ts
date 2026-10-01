// 顯示用的小工具：機器名稱、session 主題、白話狀態、相對時間
import type { AgentEvent, AgentSession } from './types'

// 機器顯示名稱：桌機 / Mac，其他照原名
export function machineLabel(machine: string): string {
  if (machine.toLowerCase().startsWith('sehha555pc')) return '桌機'
  if (machine.includes('MacBook')) return 'Mac'
  return machine
}

// 欄位順序：桌機在左、Mac 在右，其他排後面
export function machineOrder(machine: string): number {
  const label = machineLabel(machine)
  if (label === '桌機') return 0
  if (label === 'Mac') return 1
  return 2
}

// 主題：只取第一行、去掉 markdown 符號、約 20 字截斷
const TOPIC_MAX = 20

export function topicText(text: string | undefined): string | undefined {
  if (!text) return undefined
  const line = (text.split('\n').find((l) => l.trim()) ?? '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [文字](網址) → 文字
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/, '') // 標題、引用、清單開頭
    .replace(/[*_`~]+/g, '') // 粗體、斜體、程式碼、刪除線
    .trim()
  if (!line) return undefined
  const chars = [...line]
  return chars.length > TOPIC_MAX ? chars.slice(0, TOPIC_MAX).join('') + '…' : line
}

// 路徑最後一段（Windows 和 Mac 都能處理）
function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}

// 單筆事件的白話說明（不出現 hook 事件名稱）
export function eventPhrase(e: AgentEvent): string {
  if (e.event === 'UserPromptSubmit') return '你下了指令'
  if (e.event === 'Stop') return '這輪做完了'
  if (e.event === 'SessionStart') return '開啟'
  if (e.event === 'SessionEnd') return '結束'
  if (e.event === 'Notification') return '等你確認'
  if (e.event === 'PostToolUseFailure') return `${toolPhrase(e.tool)}失敗`
  if (e.event === 'PostToolUse') return `${toolPhrase(e.tool)}完成`
  return toolPhrase(e.tool)
}

// 工具的白話名稱
function toolPhrase(tool: string | undefined): string {
  if (!tool) return '工作'
  if (tool === 'Bash' || tool === 'PowerShell') return '執行指令'
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') return '編輯檔案'
  if (tool === 'Read' || tool === 'Grep' || tool === 'Glob') return '查看程式碼'
  if (tool === 'Agent' || tool === 'Task') return '派 subagent 做事'
  if (tool === 'WebSearch' || tool === 'WebFetch') return '查資料'
  if (tool.startsWith('mcp__')) return `使用工具 ${tool.split('__').pop()}`
  return '工作'
}

// 工作中的白話說明：看最新一筆事件的工具；工具跑完（或剛下指令）就是 Claude 在想下一步
function workingPhrase(session: AgentSession, now: number): string {
  const e = session.events[0]
  if (!e || ['UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure'].includes(e.event)) return '正在：思考'
  const phrase = toolPhrase(e.tool)
  let text = `正在：${phrase === '工作' ? '工作中' : phrase}`
  if (phrase === '執行指令' && e.detail) text = `正在：執行指令 ${[...e.detail].slice(0, 30).join('')}`
  if (phrase === '編輯檔案' && e.detail) text = `正在：編輯 ${baseName(e.detail)}`
  // 工具還在跑：標出已經跑多久
  const min = now > 0 && e.event === 'PreToolUse' ? Math.floor((now - e.ts) / 60000) : 0
  return min >= 1 ? `${text}（已跑 ${min} 分鐘）` : text
}

// 閒置多久（白話）
function idlePhrase(ts: number, now: number): string {
  if (now === 0) return '閒置'
  const min = Math.floor((now - ts) / 60000)
  if (min < 1) return '閒置中'
  if (min < 60) return `閒置 ${min} 分鐘`
  if (min < 1440) return `閒置 ${Math.floor(min / 60)} 小時`
  return `閒置 ${Math.floor(min / 1440)} 天`
}

// session 狀態的白話說明
export function statusPhrase(session: AgentSession, now: number): string {
  if (session.status === 'waiting') {
    return session.lastDetail ? `等你確認：${session.lastDetail}` : '等你確認'
  }
  if (session.status === 'working') return workingPhrase(session, now)
  if (session.status === 'idle') return idlePhrase(session.lastTs, now)
  return '已結束'
}

// 白話相對時間（now 為 0 表示尚未在瀏覽器端取得時間）
export function relativeTime(ts: number, now: number): string {
  if (now === 0) return '—'
  const sec = Math.max(0, Math.floor((now - ts) / 1000))
  if (sec < 60) return '剛剛'
  if (sec < 3600) return `${Math.floor(sec / 60)} 分鐘前`
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小時前`
  return `${Math.floor(sec / 86400)} 天前`
}
