// 防撞：記錄每個 session 最近改過哪些檔案（只放記憶體，Hub 重啟就清空）
// key = 專案名稱 + 專案根目錄底下的相對路徑，一律正斜線、不分大小寫

// 30 分鐘內另一個 session 改過同一個檔就算衝突
const WINDOW_MS = 30 * 60 * 1000

interface EditRecord {
  machine: string
  sessionId: string
  project: string
  relPath: string   // 保留原始寫法，給訊息顯示用
  ts: number
}

// key → 各 session 最後一次修改（同 session 只留最新一筆）
type EditMap = Map<string, Map<string, EditRecord>>

const globalForConflict = globalThis as unknown as { __agentEdits?: EditMap }

function edits(): EditMap {
  globalForConflict.__agentEdits ??= new Map()
  return globalForConflict.__agentEdits
}

// 相對路徑正規化：反斜線轉正斜線、去掉開頭的 ./ 或 /
export function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '')
}

export function editKey(project: string, relPath: string): string {
  return `${project}::${normalizeRelPath(relPath)}`.toLowerCase()
}

export interface ConflictInfo {
  machine: string
  sessionId: string
  project: string
  relPath: string
  ts: number
}

/**
 * 另一個 session（包含同一台電腦上的其他 session）30 分鐘內改過同一個 key 就回傳最近那筆
 */
export function check(machine: string, sessionId: string, key: string): ConflictInfo | null {
  const bySession = edits().get(key)
  if (!bySession) return null

  const now = Date.now()
  let latest: EditRecord | null = null
  for (const rec of bySession.values()) {
    if (rec.machine === machine && rec.sessionId === sessionId) continue
    if (now - rec.ts > WINDOW_MS) continue
    if (!latest || rec.ts > latest.ts) latest = rec
  }
  return latest
}

/**
 * 記下這次修改，順便清掉超過 30 分鐘的紀錄
 */
export function record(machine: string, sessionId: string, project: string, relPath: string) {
  const map = edits()
  const now = Date.now()
  const key = editKey(project, relPath)

  const bySession = map.get(key) ?? new Map<string, EditRecord>()
  bySession.set(`${machine}:${sessionId}`, {
    machine,
    sessionId,
    project,
    relPath: normalizeRelPath(relPath),
    ts: now,
  })
  map.set(key, bySession)

  for (const [k, sessions] of map) {
    for (const [s, rec] of sessions) {
      if (now - rec.ts > WINDOW_MS) sessions.delete(s)
    }
    if (sessions.size === 0) map.delete(k)
  }
}
