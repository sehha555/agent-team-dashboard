// GET /api/tasks/[teamId] — 回傳指定 team 的 tasks + agents
import { NextResponse } from 'next/server'
import { getTeamTasks, getTeamAgents } from '@/app/lib/parser'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params

    if (!teamId) {
      return NextResponse.json({ error: '缺少 teamId 參數' }, { status: 400 })
    }

    const tasks = getTeamTasks(teamId)
    const agents = getTeamAgents(teamId)

    return NextResponse.json({ tasks, agents })
  } catch (error) {
    console.error('[/api/tasks/[teamId]] 讀取 tasks 失敗:', error)
    return NextResponse.json({ error: '無法讀取 tasks 資料' }, { status: 500 })
  }
}
