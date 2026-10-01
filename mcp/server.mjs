// Agent Hub MCP server（stdio）：讓 Claude 用工具看兩台電腦的狀態、開/認領/完成任務、交接
// 註冊：claude mcp add --scope user agent-hub -- node <絕對路徑>/mcp/server.mjs
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// AGENT_HUB_URL 填 Hub 根網址；填到 /api/events 也相容（跟 hooks 一致）
const HUB_BASE = (process.env.AGENT_HUB_URL || 'http://100.66.71.62:3100')
  .replace(/\/+$/, '')
  .replace(/\/api\/events$/, '')

// 本機身分：machine 跟 hooks 一樣用 hostname；sessionId 取 Claude Code 傳下來的環境變數
const MACHINE = os.hostname()
const SESSION_ID = process.env.CLAUDE_CODE_SESSION_ID || process.env.CLAUDE_SESSION_ID || 'mcp'

// 專案名稱：git 根目錄的資料夾名，不是 git repo 就用 cwd
function currentProject() {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim()
    if (root) return path.basename(root)
  } catch {
    // 不是 git repo
  }
  return path.basename(process.cwd())
}

const me = () => ({ machine: MACHINE, sessionId: SESSION_ID, project: currentProject() })

// 呼叫 Hub API，非 2xx 時把 Hub 回的錯誤訊息丟出來
async function hub(method, apiPath, body) {
  const res = await fetch(`${HUB_BASE}${apiPath}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Hub 回應 ${res.status}`)
  return data
}

// 工具回傳格式：一段文字；出錯時標成 isError，讓 Claude 知道沒成功
function text(value) {
  return { content: [{ type: 'text', text: value }] }
}

function wrap(fn) {
  return async (args) => {
    try {
      return text(await fn(args ?? {}))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ...text(`Agent Hub 連不上或操作失敗（${HUB_BASE}）：${message}`), isError: true }
    }
  }
}

const clock = (ts) => new Date(ts).toLocaleTimeString('zh-TW', { hour12: false })

function formatTask(t) {
  const owner = t.claimedBy ? `，${t.claimedBy.machine}/${t.claimedBy.project} 認領` : ''
  const creator = t.createdBy === 'user' ? '使用者' : t.createdBy.split('/')[0]
  const status = { open: '待認領', claimed: '進行中', done: '完成' }[t.status] ?? t.status
  const detail = t.detail ? `\n    說明：${t.detail}` : ''
  return `#${t.id} [${status}] ${t.title}（${creator} 建立${owner}）${detail}`
}

function formatHandoff(h) {
  const task = h.taskId ? `（任務 #${h.taskId}）` : ''
  return `#${h.id} ${clock(h.ts)} ${h.from}/${h.project} → ${h.to}${task}\n    做完：${h.summary}\n    還剩：${h.remaining}`
}

const server = new McpServer({ name: 'agent-hub', version: '0.2.0' })

server.registerTool(
  'hub_status',
  {
    description:
      '看兩台電腦（桌機、Mac）上所有 Claude session 的狀態、進行中的任務、寄給本機的未讀交接筆數。' +
      '開始改程式前先用這個看另一台有沒有在改同一個專案；接手工作前也先看一下。',
  },
  wrap(async () => {
    const [{ sessions }, { tasks }, { handoffs }] = await Promise.all([
      hub('GET', '/api/events'),
      hub('GET', '/api/board/tasks'),
      hub('GET', `/api/board/handoffs?to=${encodeURIComponent(MACHINE)}`),
    ])
    const STATUS = { working: '進行中', idle: '閒置', waiting: '等使用者確認', ended: '已結束' }
    // 已結束、或 12 小時沒動靜（多半是關掉但沒收到 SessionEnd）的不列
    const active = sessions.filter((s) => s.status !== 'ended' && Date.now() - s.lastTs < 12 * 3600 * 1000)
    const lines = [`本機：${MACHINE}（session ${SESSION_ID}）`, '', 'Session：']
    if (active.length === 0) lines.push('  （沒有進行中的 session）')
    for (const s of active) {
      const self = s.machine === MACHINE && s.sessionId === SESSION_ID ? '（我）' : ''
      const last = s.lastDetail ? `，最後：${s.lastDetail.slice(0, 80)}` : ''
      lines.push(`  ${s.machine}/${s.project}${self} ${STATUS[s.status] ?? s.status}，${clock(s.lastTs)}${last}`)
    }
    const claimed = tasks.filter((t) => t.status === 'claimed')
    lines.push('', '進行中的任務：')
    if (claimed.length === 0) lines.push('  （沒有）')
    for (const t of claimed) lines.push(`  ${formatTask(t)}`)
    const openCount = tasks.filter((t) => t.status === 'open').length
    const unread = handoffs.filter((h) => !h.readAt).length
    lines.push('', `待認領任務：${openCount} 項`, `收件匣未讀交接：${unread} 筆${unread ? '（用 inbox 讀取）' : ''}`)
    return lines.join('\n')
  })
)

server.registerTool(
  'task_list',
  {
    description: '列出分工看板上的所有任務（待認領 / 進行中 / 完成）。想找事做或確認任務編號時用。',
  },
  wrap(async () => {
    const { tasks } = await hub('GET', '/api/board/tasks')
    if (tasks.length === 0) return '看板上還沒有任務'
    const order = { claimed: 0, open: 1, done: 2 }
    return [...tasks].sort((a, b) => order[a.status] - order[b.status] || a.id - b.id).map(formatTask).join('\n')
  })
)

server.registerTool(
  'task_create',
  {
    description: '在分工看板開一個新任務。要把一件事拆出來給另一台做，或記下待辦讓之後認領時用。',
    inputSchema: {
      title: z.string().min(1).describe('任務標題，一句話'),
      detail: z.string().optional().describe('細節：要做什麼、做到哪算完成'),
    },
  },
  wrap(async ({ title, detail }) => {
    const { task } = await hub('POST', '/api/board/tasks', {
      title,
      detail,
      createdBy: `${MACHINE}/${SESSION_ID}`,
    })
    return `已建立任務 #${task.id}：${task.title}`
  })
)

server.registerTool(
  'task_claim',
  {
    description: '認領一個待認領的任務，表示「這件我來做」。開始做看板上的任務前先認領，避免兩台做同一件事。',
    inputSchema: { id: z.number().int().describe('任務編號') },
  },
  wrap(async ({ id }) => {
    const { task } = await hub('PATCH', '/api/board/tasks', { id, action: 'claim', by: me() })
    return `已認領任務 #${task.id}：${task.title}`
  })
)

server.registerTool(
  'task_done',
  {
    description: '把任務標成完成，並寫一句做了什麼。做完認領的任務時用（會通知使用者）。',
    inputSchema: {
      id: z.number().int().describe('任務編號'),
      summary: z.string().min(1).describe('做了什麼、結果如何'),
    },
  },
  wrap(async ({ id, summary }) => {
    const { task } = await hub('PATCH', '/api/board/tasks', { id, action: 'done', by: me(), summary })
    return `任務 #${task.id} 已完成`
  })
)

server.registerTool(
  'handoff',
  {
    description:
      '做完一段、要交給另一台電腦（或任何一台）接手時用：寫清楚做完什麼、還剩什麼。' +
      '對方會在 inbox 收到，使用者也會收到通知。',
    inputSchema: {
      to: z.string().min(1).describe('交給哪台電腦（機器名稱，可從 hub_status 看到），或 any'),
      summary: z.string().min(1).describe('做完什麼'),
      remaining: z.string().min(1).describe('還剩什麼、接手的人要注意什麼'),
      taskId: z.number().int().optional().describe('相關的任務編號（選填）'),
    },
  },
  wrap(async ({ to, summary, remaining, taskId }) => {
    const { handoff } = await hub('POST', '/api/board/handoffs', {
      from: MACHINE,
      fromSessionId: SESSION_ID,
      to,
      project: currentProject(),
      summary,
      remaining,
      taskId,
    })
    return `已交接 #${handoff.id} 給 ${handoff.to}`
  })
)

server.registerTool(
  'inbox',
  {
    description: '讀取寄給本機（或寄給 any）的未讀交接，讀完自動標成已讀。session 剛開始、或 hub_status 顯示有未讀交接時用。',
  },
  wrap(async () => {
    const { handoffs } = await hub('GET', `/api/board/handoffs?to=${encodeURIComponent(MACHINE)}`)
    const unread = handoffs.filter((h) => !h.readAt)
    if (unread.length === 0) return '收件匣沒有未讀交接'
    await Promise.all(unread.map((h) => hub('PATCH', '/api/board/handoffs', { id: h.id })))
    return [`${unread.length} 筆未讀交接（已標成已讀）：`, ...unread.map(formatHandoff)].join('\n')
  })
)

await server.connect(new StdioServerTransport())
