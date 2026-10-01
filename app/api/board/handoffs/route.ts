// GET   /api/board/handoffs?to=machine — 收件匣（寄給該機器或 any）；不帶 to 則全部列出
// POST  /api/board/handoffs — 新增交接 {from, to, project, summary, remaining, taskId?, fromSessionId?}
// PATCH /api/board/handoffs — {id} 標成已讀
import { NextResponse } from 'next/server'
import { createHandoff, listHandoffs, markHandoffRead } from '@/app/lib/board-store'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body : null
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const to = new URL(request.url).searchParams.get('to') ?? undefined
  return NextResponse.json({ handoffs: listHandoffs(to) })
}

export async function POST(request: Request) {
  const body = await readBody(request)
  if (!body) return NextResponse.json({ error: 'body 必須是 JSON 物件' }, { status: 400 })

  const { from, to, project, summary, remaining } = body
  if (
    !isNonEmptyString(from) ||
    !isNonEmptyString(to) ||
    !isNonEmptyString(summary) ||
    !isNonEmptyString(remaining)
  ) {
    return NextResponse.json(
      { error: '缺少必填欄位：from、to、summary、remaining' },
      { status: 400 }
    )
  }

  const taskId = Number(body.taskId)
  const handoff = createHandoff({
    from,
    fromSessionId: isNonEmptyString(body.fromSessionId) ? body.fromSessionId : undefined,
    to,
    project: typeof project === 'string' ? project : '',
    summary: summary.trim(),
    remaining: remaining.trim(),
    taskId: Number.isInteger(taskId) && taskId > 0 ? taskId : undefined,
  })
  return NextResponse.json({ ok: true, handoff })
}

export async function PATCH(request: Request) {
  const body = await readBody(request)
  const id = Number(body?.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: '需要 id' }, { status: 400 })

  const handoff = markHandoffRead(id)
  if (!handoff) return NextResponse.json({ error: `找不到交接 #${id}` }, { status: 404 })
  return NextResponse.json({ ok: true, handoff })
}
