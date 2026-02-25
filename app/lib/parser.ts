// 解析 ~/.claude/teams/ 和 ~/.claude/tasks/ 目錄的工具函式
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { Task, Agent, Team } from './types'

// 基礎路徑定義
const TEAMS_DIR = path.join(os.homedir(), '.claude', 'teams')
const TASKS_DIR = path.join(os.homedir(), '.claude', 'tasks')

// team config 的 member 結構（對應 config.json）
interface MemberConfig {
  name: string
  agentId: string
  agentType: string
}

// team config.json 結構
interface TeamConfig {
  teamId?: string
  members: MemberConfig[]
}

/**
 * 安全讀取 JSON 檔案，失敗時回傳 null
 */
function readJsonSafe<T>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    // 檔案不存在或 JSON 格式有誤，靜默回傳 null
    return null
  }
}

/**
 * 取得所有 team 名稱列表（掃描 ~/.claude/teams/ 目錄）
 */
export function getTeams(): string[] {
  try {
    if (!fs.existsSync(TEAMS_DIR)) return []
    return fs
      .readdirSync(TEAMS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

/**
 * 讀取指定 team 的 config.json，回傳 members 列表
 */
export function getTeamConfig(teamName: string): TeamConfig | null {
  const configPath = path.join(TEAMS_DIR, teamName, 'config.json')
  return readJsonSafe<TeamConfig>(configPath)
}

/**
 * 讀取指定 teamId 下的所有 task JSON 檔案
 * tasks 目錄名稱是 UUID（teamId）
 */
export function getTeamTasks(teamId: string): Task[] {
  const teamTasksDir = path.join(TASKS_DIR, teamId)
  try {
    if (!fs.existsSync(teamTasksDir)) return []

    return fs
      .readdirSync(teamTasksDir)
      .filter((file) => file.endsWith('.json'))
      .flatMap((file) => {
        const filePath = path.join(teamTasksDir, file)
        const data = readJsonSafe<Task | Task[]>(filePath)
        if (!data) return []
        // 支援單筆或陣列格式的 task JSON
        return Array.isArray(data) ? data : [data]
      })
  } catch {
    return []
  }
}

/**
 * 推導單一 agent 的狀態
 * - 有 in_progress task 且 owner 是自己 → working
 * - 有 task 但全是 pending → idle
 * - 所有 owned task 都 completed → done
 * - 沒有任何 task assigned → idle
 */
function deriveAgentStatus(
  agentId: string,
  tasks: Task[]
): Pick<Agent, 'status' | 'currentTask' | 'completedCount'> {
  // 找出屬於此 agent 的所有 tasks
  const ownedTasks = tasks.filter((t) => t.owner === agentId)

  if (ownedTasks.length === 0) {
    return { status: 'idle', completedCount: 0 }
  }

  const completedCount = ownedTasks.filter((t) => t.status === 'completed').length
  const inProgressTask = ownedTasks.find((t) => t.status === 'in_progress')

  if (inProgressTask) {
    // 有進行中的 task → working，記錄當前任務
    return {
      status: 'working',
      currentTask: inProgressTask.subject,
      completedCount,
    }
  }

  if (completedCount === ownedTasks.length) {
    // 全部完成 → done
    return { status: 'done', completedCount }
  }

  // 其餘（全 pending 或混合 pending/completed 但無 in_progress）→ idle
  return { status: 'idle', completedCount }
}

/**
 * 計算 task 統計資料
 */
function calcTaskStats(tasks: Task[]): Team['taskStats'] {
  const total = tasks.length
  const completed = tasks.filter((t) => t.status === 'completed').length
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length
  const pending = tasks.filter((t) => t.status === 'pending').length
  const completionPercent = total > 0 ? Math.round((completed / total) * 100) : 0

  return { total, completed, inProgress, pending, completionPercent }
}

/**
 * 根據 teamId 反查 teamName（遍歷所有 team config）
 * 若 config 中沒設定 teamId，fallback 為 teamName === teamId
 */
export function findTeamNameByTeamId(teamId: string): string | null {
  const teamNames = getTeams()
  for (const name of teamNames) {
    const config = getTeamConfig(name)
    const configTeamId = config?.teamId ?? name
    if (configTeamId === teamId) return name
  }
  return null
}

/**
 * 根據 teamId 取得 agent 列表（從 team config + task 狀態推導）
 */
export function getTeamAgents(teamId: string): Agent[] {
  const teamName = findTeamNameByTeamId(teamId)
  if (!teamName) return []

  const config = getTeamConfig(teamName)
  const members: MemberConfig[] = config?.members ?? []
  const tasks = getTeamTasks(teamId)

  return members.map((m) => ({
    name: m.name,
    agentId: m.agentId,
    agentType: m.agentType,
    ...deriveAgentStatus(m.name, tasks),
  }))
}

/**
 * 組合 config + tasks，建立完整的 Team 物件
 * @param teamName teams 目錄下的子目錄名稱
 * @param teamId   tasks 目錄下對應的 UUID 子目錄名稱
 */
export function buildTeam(teamName: string, teamId: string): Team | null {
  const config = getTeamConfig(teamName)
  // config 不存在時仍嘗試建立空成員的 team（tasks 可能還存在）
  const members: MemberConfig[] = config?.members ?? []
  const tasks = getTeamTasks(teamId)

  // 將 config members 與 tasks 狀態結合
  const agents: Agent[] = members.map((m) => ({
    name: m.name,
    agentId: m.agentId,
    agentType: m.agentType,
    ...deriveAgentStatus(m.name, tasks),
  }))

  return {
    name: teamName,
    members: agents,
    tasks,
    taskStats: calcTaskStats(tasks),
  }
}
