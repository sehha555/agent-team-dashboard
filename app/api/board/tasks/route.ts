// GET   /api/board/tasks — 列出分工看板的任務
// POST  /api/board/tasks — 新增任務 {title, detail?, createdBy?}
// PATCH /api/board/tasks — {id, action: claim|done|reopen, by, summary?}
//   by 是 'user'（網頁）或 {machine, sessionId, project}（agent）
import { NextResponse } from 'next/server'
import { createTask, listTasks, updateTask, type TaskAction } from '@/app/lib/board-store'
import type { ClaimInfo } from '@/app/lib/types'

const ACTIONS: TaskAction[] = ['claim', 'done', 'reopen']

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body : null
  } catch {
    return null
  }
}

// by 欄位：'user' 或完整的 ClaimInfo，其他都不合格
function parseBy(value: unknown): ClaimInfo | 'user' | null {
  if (value === 'user') return 'user'
  if (!value || typeof value !== 'object') return null
  const { machine, sessionId, project } = value as Record<string, unknown>
  if (!isNonEmptyString(machine) || !isNonEmptyString(sessionId)) return null
  return { machine, sessionId, project: typeof project === 'string' ? project : '' }
}

export async function GET() {
  return NextResponse.json({ tasks: listTasks() })
}

export async function POST(request: Request) {
  const body = await readBody(request)
  if (!body) return NextResponse.json({ error: 'body 必須是 JSON 物件' }, { status: 400 })
  if (!isNonEmptyString(body.title)) {
    return NextResponse.json({ error: '缺少必填欄位：title' }, { status: 400 })
  }

  const task = createTask(
    body.title.trim(),
    optionalString(body.detail),
    optionalString(body.createdBy) ?? 'user'
  )
  return NextResponse.json({ ok: true, task })
}

export async function PATCH(request: Request) {
  const body = await readBody(request)
  if (!body) return NextResponse.json({ error: 'body 必須是 JSON 物件' }, { status: 400 })

  const id = Number(body.id)
  const action = body.action as TaskAction
  const by = parseBy(body.by)
  if (!Number.isInteger(id) || !ACTIONS.includes(action) || !by) {
    return NextResponse.json(
      { error: '需要 id、action（claim/done/reopen）、by（"user" 或 {machine, sessionId, project}）' },
      { status: 400 }
    )
  }

  const result = updateTask(id, action, by, optionalString(body.summary))
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, task: result.task })
}
