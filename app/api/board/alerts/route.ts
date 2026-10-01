// GET   /api/board/alerts — 列出未處理的警示
// PATCH /api/board/alerts — {id} 標成已處理
import { NextResponse } from 'next/server'
import { listAlerts, resolveAlert } from '@/app/lib/board-store'

export async function GET() {
  return NextResponse.json({ alerts: listAlerts() })
}

export async function PATCH(request: Request) {
  let id = NaN
  try {
    id = Number((await request.json())?.id)
  } catch {
    // body 不是 JSON，下面一起回 400
  }
  if (!Number.isInteger(id)) return NextResponse.json({ error: '需要 id' }, { status: 400 })

  const alert = resolveAlert(id)
  if (!alert) return NextResponse.json({ error: `找不到警示 #${id}` }, { status: 404 })
  return NextResponse.json({ ok: true, alert })
}
