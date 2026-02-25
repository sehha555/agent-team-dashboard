// GET /api/sse — SSE 即時推送，監聽 tasks/teams 目錄變更
// 支援 query param ?teamId=xxx 過濾特定 team
import path from 'node:path'
import os from 'node:os'
import { watch } from 'chokidar'
import type { SSEEvent } from '@/app/lib/types'

const TEAMS_DIR = path.join(os.homedir(), '.claude', 'teams')
const TASKS_DIR = path.join(os.homedir(), '.claude', 'tasks')

// SSE 格式化：將事件物件轉成符合 SSE 規範的字串
function formatSSE(event: SSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const teamIdFilter = searchParams.get('teamId') ?? null

  // 建立 ReadableStream，在 start 內啟動 chokidar watcher
  const stream = new ReadableStream({
    start(controller) {
      // 送出初始連線確認訊息
      const pingEvent: SSEEvent = { type: 'full_refresh', data: { message: '連線建立' } }
      controller.enqueue(new TextEncoder().encode(formatSSE(pingEvent)))

      // 建立 chokidar watcher，同時監聽 tasks 和 teams 目錄
      const watchPaths: string[] = [TASKS_DIR, TEAMS_DIR]
      const watcher = watch(watchPaths, {
        ignoreInitial: true,     // 不觸發初始掃描事件
        persistent: true,
        depth: 2,                // 只監聽兩層深（teams/{name}/config.json, tasks/{id}/*.json）
        awaitWriteFinish: {
          stabilityThreshold: 200, // 等檔案寫入穩定後才觸發
          pollInterval: 100,
        },
      })

      // 判斷路徑屬於哪個目錄，回傳對應事件類型
      function resolveEventType(filePath: string): SSEEvent['type'] {
        if (filePath.startsWith(TEAMS_DIR)) return 'team_update'
        return 'task_update'
      }

      // 從路徑中解析 teamId（tasks/{teamId}/... 的第一層目錄名）
      function extractTeamId(filePath: string): string | null {
        if (!filePath.startsWith(TASKS_DIR)) return null
        const relative = path.relative(TASKS_DIR, filePath)
        const parts = relative.split(path.sep)
        return parts[0] ?? null
      }

      // 統一處理所有檔案變更事件
      const handleChange = (eventName: string, changedPath: string) => {
        try {
          // 如果有 teamId 過濾，只推送屬於該 team 的 tasks 變更
          if (teamIdFilter && changedPath.startsWith(TASKS_DIR)) {
            const changedTeamId = extractTeamId(changedPath)
            if (changedTeamId !== teamIdFilter) return
          }

          const sseEvent: SSEEvent = {
            type: resolveEventType(changedPath),
            data: {
              event: eventName,
              path: changedPath,
              timestamp: new Date().toISOString(),
            },
          }

          controller.enqueue(new TextEncoder().encode(formatSSE(sseEvent)))
        } catch {
          // controller 已關閉時靜默忽略（client 已斷線）
        }
      }

      // 監聽 add、change、unlink 三種事件
      watcher.on('add', (p) => handleChange('add', p))
      watcher.on('change', (p) => handleChange('change', p))
      watcher.on('unlink', (p) => handleChange('unlink', p))

      watcher.on('error', (error) => {
        console.error('[SSE] chokidar 監聽錯誤:', error)
      })

      // 請求取消時（client 斷線）關閉 watcher
      request.signal.addEventListener('abort', () => {
        watcher.close().catch(() => {})
        try {
          controller.close()
        } catch {
          // 已關閉，忽略
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // 允許跨來源（開發時 frontend 可能跑在不同 port）
      'Access-Control-Allow-Origin': '*',
    },
  })
}
