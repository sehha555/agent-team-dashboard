// Claude Code hook：把事件精簡後 POST 給 Hub（零相依，Node 18+）
// 任何錯誤都靜默、一律 exit 0；stdout/stderr 不輸出任何東西，避免被 Claude Code 當成 hook 回應
import fs from 'node:fs'
import os from 'node:os'

// AGENT_HUB_URL 填 Hub 根網址；舊設定填到 /api/events 也相容
const HUB_BASE = (process.env.AGENT_HUB_URL || 'http://100.66.71.62:3100')
  .replace(/\/+$/, '')
  .replace(/\/api\/events$/, '')
const HUB_URL = `${HUB_BASE}/api/events`

// 只有這幾種 Notification 代表 Claude 在等使用者確認或回答（其餘如登入成功、額度提醒不回報）
const NEEDS_INPUT_TYPES = [
  'permission_prompt',
  'elicitation_dialog',
  'elicitation_url_dialog',
  'agent_needs_input',
]

// transcript 可能很大，只讀檔尾這麼多位元組找最後一則回覆
const TRANSCRIPT_TAIL_BYTES = 256 * 1024

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

// 從 transcript JSONL 檔尾找最後一則有文字的 assistant 訊息
function lastAssistantText(transcriptPath) {
  if (typeof transcriptPath !== 'string' || !transcriptPath) return undefined
  const fd = fs.openSync(transcriptPath, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const start = Math.max(0, size - TRANSCRIPT_TAIL_BYTES)
    const buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    const lines = buf.toString('utf-8').split('\n')

    for (let i = lines.length - 1; i >= 0; i--) {
      let entry
      try {
        entry = JSON.parse(lines[i])
      } catch {
        continue // 空行或被切到一半的第一行
      }
      if (entry?.type !== 'assistant') continue
      const content = entry.message?.content
      const text = typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content.filter((c) => c?.type === 'text').map((c) => c.text).join('\n')
          : ''
      if (text.trim()) return text
    }
    return undefined
  } finally {
    fs.closeSync(fd)
  }
}

// Stop：優先用官方欄位 last_assistant_message，沒有再讀 transcript
function stopSummary(input) {
  try {
    return oneLine(input.last_assistant_message || lastAssistantText(input.transcript_path), 300)
  } catch {
    return undefined
  }
}

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  const input = JSON.parse(raw)
  const eventName = input.hook_event_name

  // 不需要使用者處理的 Notification、使用者自己中斷造成的失敗，都不回報
  if (eventName === 'Notification' && input.notification_type
    && !NEEDS_INPUT_TYPES.includes(input.notification_type)) return
  if (eventName === 'PostToolUseFailure' && input.is_interrupt) return

  const event = {
    machine: os.hostname(),
    sessionId: input.session_id,
    cwd: input.cwd,
    event: eventName,
    tool: input.tool_name,
    detail: summarize(input),
    ts: Date.now(),
  }

  if (eventName === 'Stop') {
    event.summary = stopSummary(input)
  } else if (eventName === 'Notification') {
    event.detail = oneLine(input.message, 200)
  } else if (eventName === 'PostToolUseFailure') {
    // 「指令摘要｜錯誤摘要」
    const error = oneLine(input.error, 160)
    event.detail = [event.detail, error].filter(Boolean).join('｜') || undefined
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
