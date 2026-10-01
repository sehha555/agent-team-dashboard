// Claude Code hook：把事件精簡後 POST 給 Hub（零相依，Node 18+）
// 任何錯誤都靜默、一律 exit 0；stdout/stderr 不輸出任何東西，避免被 Claude Code 當成 hook 回應
import os from 'node:os'

const HUB_URL = process.env.AGENT_HUB_URL || 'http://100.66.71.62:3100/api/events'

// 保險：不管卡在哪裡，1.5 秒後一定結束
setTimeout(() => process.exit(0), 1500)
process.on('uncaughtException', () => process.exit(0))
process.on('unhandledRejection', () => process.exit(0))

// 壓成一行再截斷
function oneLine(value, max) {
  if (typeof value !== 'string') return undefined
  const line = value.replace(/\s+/g, ' ').trim()
  return line ? line.slice(0, max) : undefined
}

// 依事件和工具整理一行摘要
function summarize(input) {
  if (input.hook_event_name === 'UserPromptSubmit') return oneLine(input.prompt, 80)
  const toolInput = input.tool_input ?? {}
  if (input.tool_name === 'Bash' || input.tool_name === 'PowerShell') {
    return oneLine(toolInput.command, 120)
  }
  if (['Edit', 'Write', 'Read'].includes(input.tool_name)) return oneLine(toolInput.file_path, 300)
  return undefined
}

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  const input = JSON.parse(raw)

  const event = {
    machine: os.hostname(),
    sessionId: input.session_id,
    cwd: input.cwd,
    event: input.hook_event_name,
    tool: input.tool_name,
    detail: summarize(input),
    ts: Date.now(),
  }

  await fetch(HUB_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(1000),
  })
}

main()
  .catch(() => {})
  .finally(() => process.exit(0))
