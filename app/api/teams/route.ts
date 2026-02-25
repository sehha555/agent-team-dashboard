// GET /api/teams — 回傳所有 team 名稱列表 + 基本資訊
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { NextResponse } from 'next/server'
import { getTeams, getTeamConfig, getTeamTasks } from '@/app/lib/parser'

const TEAMS_DIR = path.join(os.homedir(), '.claude', 'teams')

export async function GET() {
  try {
    const teamNames = getTeams()

    const teams = teamNames.map((name) => {
      // 讀取 config 取得 member 數量
      const config = getTeamConfig(name)
      const memberCount = config?.members?.length ?? 0

      // 嘗試找對應的 teamId（從 config 或以目錄名作為 fallback）
      const teamId = config?.teamId ?? name

      // 統計 task 數量
      const tasks = getTeamTasks(teamId)

      return {
        name,
        teamId,
        memberCount,
        taskCount: tasks.length,
      }
    })

    return NextResponse.json({ teams })
  } catch (error) {
    console.error('[/api/teams] 讀取 teams 失敗:', error)
    return NextResponse.json({ error: '無法讀取 teams 資料' }, { status: 500 })
  }
}
