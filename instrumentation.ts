// Next.js 伺服器啟動時執行一次：啟動卡住偵測（只在 Node.js runtime，build 時不會跑）
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWatchdog } = await import('./app/lib/watchdog')
    startWatchdog()
  }
}
