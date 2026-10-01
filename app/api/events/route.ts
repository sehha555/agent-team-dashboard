// POST /api/events — 接收各機器 Claude Code hook 回報的事件
// GET  /api/events — 回傳目前所有 session 狀態
import { NextResponse } from 'next/server'
import { getSessions, recordEvent } from '@/app/lib/agents-store'
import { addTurnSummary, raiseAlert } from '@/app/lib/board-store'

// 必填欄位：非空字串
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

// 選填欄位：只接受字串，其他型別當作沒有
function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'body 不是合法 JSON' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'body 必須是物件' }, { status: 400 })
  }

  const { machine, sessionId, event } = body
  if (!isNonEmptyString(machine) || !isNonEmptyString(sessionId) || !isNonEmptyString(event)) {
    return NextResponse.json(
      { error: '缺少必填欄位：machine、sessionId、event' },
      { status: 400 }
    )
  }

  // ts 可以是毫秒數字或可解析的時間字串，都不合格就用 Hub 收到的時間
  const parsedTs = typeof body.ts === 'number' ? body.ts : Date.parse(String(body.ts))
  const ts = Number.isFinite(parsedTs) ? parsedTs : Date.now()

  const summary = optionalString(body.summary)
  const session = recordEvent({
    machine,
    sessionId,
    cwd: optionalString(body.cwd) ?? '',
    event,
    tool: optionalString(body.tool),
    // Stop 沒有 detail 時用這輪的總結當「最後動作」
    detail: optionalString(body.detail) ?? (event === 'Stop' ? summary : undefined),
    summary,
    ts,
  })

  // 事件帶出的看板變化：每輪總結、等你確認、指令失敗
  const who = { machine, sessionId, project: session.project }
  if (event === 'Stop' && summary) {
    addTurnSummary(machine, sessionId, session.project, summary)
  } else if (event === 'Notification') {
    raiseAlert({ ...who, kind: 'needs_input', text: session.lastDetail ?? 'Claude 在等你回應' })
  } else if (event === 'PostToolUseFailure') {
    const tool = optionalString(body.tool) ?? '工具'
    raiseAlert({ ...who, kind: 'failure', text: `${tool} 失敗：${session.lastDetail ?? ''}`, file: tool })
  }

  return NextResponse.json({ ok: true, session })
}

export async function GET() {
  return NextResponse.json({ sessions: getSessions() })
}
