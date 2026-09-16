import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * 极简日志文件（零依赖）。
 * 主进程 console.log/warn/error 落盘到 logs/yinghai.log（UTF-8），超 2MB 轮转为 .1。
 * 解决「启动无反应/崩溃无诊断」问题：日志文件始终可追溯。
 */
const MAX_BYTES = 2 * 1024 * 1024
let logFile = ''

/** 初始化日志文件路径（app 未 ready 时 getPath('logs') 也可用） */
export function initLogger(): string {
  try {
    const dir = app.getPath('logs')
    mkdirSync(dir, { recursive: true })
    logFile = path.join(dir, 'yinghai.log')
  } catch {
    logFile = ''
  }
  return logFile
}

function fmt(args: unknown[]): string {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const parts = args.map((a) => {
    if (typeof a === 'string') return a
    try {
      return JSON.stringify(a)
    } catch {
      return String(a)
    }
  })
  return `[${ts}] ${parts.join(' ')}`
}

function write(level: string, args: unknown[]): void {
  const line = `${fmt(args)}\n`
  if (logFile) {
    try {
      // 简单轮转：超限把旧文件改名 .1 再写新文件
      if (existsSync(logFile) && statSync(logFile).size > MAX_BYTES) {
        renameSync(logFile, `${logFile}.1`)
      }
      appendFileSync(logFile, line, 'utf8')
    } catch {
      process.stdout.write(line)
    }
  } else {
    process.stdout.write(line)
  }
}

/** 用日志文件接管 console（保留终端输出），必须在 main 最早处调用一次 */
export function installLogger(): void {
  initLogger()
  const orig = { log: console.log, warn: console.warn, error: console.error }
  console.log = (...a: unknown[]) => {
    write('INFO', a)
    orig.log(...a)
  }
  console.warn = (...a: unknown[]) => {
    write('WARN', a)
    orig.warn(...a)
  }
  console.error = (...a: unknown[]) => {
    write('ERROR', a)
    orig.error(...a)
  }
}
