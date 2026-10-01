// Claude Code PreToolUse hook（同步，matcher：Edit|Write|MultiEdit|NotebookEdit）：防撞
// 改檔前問 Hub「另一個 session 最近有沒有改過同一個檔」，有的話讓 Claude 停下來問使用者
// 沒衝突、Hub 沒開、逾時、任何錯誤 → 什麼都不輸出、exit 0（放行）（零相依，Node 18+）
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

// AGENT_HUB_URL 填 Hub 根網址；填到 /api/events 也相容（跟 report.mjs 一致）
const HUB_BASE = (process.env.AGENT_HUB_URL || 'http://100.66.71.62:3100')
  .replace(/\/+$/, '')
  .replace(/\/api\/events$/, '')

// 保險：不管卡在哪裡，950 毫秒後一定放行
setTimeout(() => process.exit(0), 950)
process.on('uncaughtException', () => process.exit(0))
process.on('unhandledRejection', () => process.exit(0))

// 從檔案所在位置往上找到存在的資料夾，再問 git 專案根目錄；不是 git repo 就用 cwd
function projectRoot(filePath, cwd) {
  let dir = path.dirname(filePath)
  while (!fs.existsSync(dir) && path.dirname(dir) !== dir) dir = path.dirname(dir)
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 500,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim()
    if (out) return path.resolve(out)
  } catch {
    // 不是 git repo 或沒裝 git
  }
  return path.resolve(cwd)
}

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  const input = JSON.parse(raw)

  const toolInput = input.tool_input ?? {}
  const file = toolInput.file_path || toolInput.notebook_path
  const cwd = input.cwd || process.cwd()
  if (typeof file !== 'string' || !file || !input.session_id) return

  const absPath = path.resolve(cwd, file)
  const root = projectRoot(absPath, cwd)
  const relPath = path.relative(root, absPath)
  // 檔案不在專案底下（例如改 cwd 外面的檔）就不檢查
  if (!relPath || relPath.startsWith('..') || path.isAbsolute(relPath)) return

  const res = await fetch(`${HUB_BASE}/api/check-edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      machine: os.hostname(),
      sessionId: input.session_id,
      project: path.basename(root),
      relPath: relPath.split(path.sep).join('/'),
    }),
    signal: AbortSignal.timeout(800),
  })
  if (!res.ok) return
  const result = await res.json()
  if (result?.conflict !== true) return

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: String(result.reason || '另一個 session 最近也改過這個檔，確定要改嗎？'),
    },
  }
  await new Promise((resolve) => process.stdout.write(JSON.stringify(output), resolve))
}

main()
  .catch(() => {})
  .finally(() => process.exit(0))
