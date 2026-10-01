// POST /api/check-edit — guard hook 改檔前來問：另一個 session 最近有沒有改過同一個檔
// body {machine, sessionId, project, relPath}
// 沒衝突 → 記下這次修改，回 {conflict:false}；有衝突 → 回 {conflict:true, reason}，同時發警示和通知
import { NextResponse } from 'next/server'
import { check, editKey, normalizeRelPath, record } from '@/app/lib/conflict'
import { raiseAlert } from '@/app/lib/board-store'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

// 「在 12 分鐘前」，不到 1 分鐘顯示「剛剛」
function ago(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000)
  return min < 1 ? '剛剛' : `在 ${min} 分鐘前`
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'body 不是合法 JSON' }, { status: 400 })
  }

  const { machine, sessionId, project, relPath } = body ?? {}
  if (
    !isNonEmptyString(machine) ||
    !isNonEmptyString(sessionId) ||
    !isNonEmptyString(project) ||
    !isNonEmptyString(relPath)
  ) {
    return NextResponse.json(
      { error: '缺少必填欄位：machine、sessionId、project、relPath' },
      { status: 400 }
    )
  }

  const hit = check(machine, sessionId, editKey(project, relPath))
  if (!hit) {
    record(machine, sessionId, project, relPath)
    return NextResponse.json({ conflict: false })
  }

  // 同一台電腦的另一個 session 也要講清楚
  const other = hit.machine === machine ? `${hit.machine}（另一個 session）` : hit.machine
  const file = normalizeRelPath(relPath)
  const reason = `${other}/${hit.project} ${ago(hit.ts)}也改過 ${hit.relPath}，確定要改嗎？`
  raiseAlert({
    kind: 'conflict',
    text: `要改 ${file}，但 ${other}/${hit.project} ${ago(hit.ts)}也改過這個檔`,
    machine,
    sessionId,
    project,
    file: file.toLowerCase(),
  })
  return NextResponse.json({ conflict: true, reason })
}
