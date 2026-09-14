import { BrowserWindow } from 'electron'
import type { PreviewTask, PreviewTaskStats, Settings } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import * as repo from './repo'
import { generatePreviewV2, classifyError, MAX_RETRY, type PreviewCancelToken, generateQuickCover } from './preview-v2'

type QueueEvent =
  | { type: 'stats'; stats: PreviewTaskStats }
  | { type: 'task'; task: PreviewTask }
  | { type: 'completed'; task: PreviewTask; mediaId: string; posterPath?: string; previewPaths: string[] }

let running = false
let paused = false
let playbackActive = false
let pumpTimer: ReturnType<typeof setTimeout> | null = null
const activeTokens = new Map<string, PreviewCancelToken>()

function emit(payload: QueueEvent): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && !w.webContents.getURL().startsWith('devtools://')) {
      w.webContents.send(IPC.previewTaskEvent, payload)
    }
  }
}

function workerLimit(settings: Settings): number {
  const load = settings.previewBackgroundLoad ?? 'standard'
  const base = load === 'high' ? 3 : load === 'low' ? 1 : 2
  return playbackActive ? Math.min(1, base) : base
}

export async function getPreviewTaskStats(): Promise<PreviewTaskStats> {
  const [tasks, settings] = await Promise.all([repo.listPreviewTasks(), repo.getSettings()])
  const active = tasks.find((t) => t.status === 'PROCESSING')
  return {
    active,
    queued: tasks.filter((t) => t.status === 'PENDING').length,
    processing: tasks.filter((t) => t.status === 'PROCESSING').length,
    completed: tasks.filter((t) => t.status === 'COMPLETED').length,
    failed: tasks.filter((t) => t.status === 'FAILED').length,
    cancelled: tasks.filter((t) => t.status === 'CANCELLED').length,
    paused,
    workerLimit: workerLimit(settings)
  }
}

async function emitStats(): Promise<void> {
  emit({ type: 'stats', stats: await getPreviewTaskStats() })
}

async function runTask(task: PreviewTask): Promise<void> {
  const token: PreviewCancelToken = { cancelled: false }
  activeTokens.set(task.id, token)
  emit({ type: 'task', task })
  await emitStats()
  try {
    const video = await repo.getVideo(task.mediaId)
    if (!video) throw new Error('FILE_NOT_FOUND: media record missing')
    const settings = await repo.getSettings()

    // Phase 1: quick cover (progressive preview - get a cover ASAP)
    if (!token.cancelled) {
      const quickCover = await generateQuickCover(video, settings, token).catch(() => null)
      if (quickCover && !token.cancelled) {
        await repo.updateVideo(video.id, {
          posterPath: quickCover,
          posterSource: 'ffmpeg',
          posterPathFfmpeg: quickCover,
          coverVersion: Date.now(),
          previewStatus: 'PROCESSING'
        })
      }
    }

    // Phase 2: full V2 preview generation
    const result = await generatePreviewV2(video, settings, {
      requestedCount: task.requestedCount,
      qualityMode: task.qualityMode,
      token,
      onProgress: (progress, generatedCount) => {
        void repo.updatePreviewTask(
          task.id,
          { progress, generatedCount: generatedCount ?? task.generatedCount },
          { previewStatus: 'PROCESSING', previewGeneratedCount: generatedCount ?? 0 }
        ).then((updated) => {
          if (updated) emit({ type: 'task', task: updated })
        })
      }
    })
    const completed = await repo.completePreviewTask(task.id, result.manifest, result.coverPath)
    if (completed) {
      emit({
        type: 'completed',
        task: completed,
        mediaId: task.mediaId,
        posterPath: result.coverPath,
        previewPaths: result.manifest.frames.map((f) => f.filePath)
      })
      emit({ type: 'task', task: completed })
    }
  } catch (e) {
    const err = classifyError(e)
    const cancelled = err.code === 'CANCELLED' || token.cancelled
    const nextRetry = task.retryCount + 1
    const finalFailed = !cancelled && nextRetry > MAX_RETRY
    const status = cancelled ? 'CANCELLED' : finalFailed ? 'FAILED' : 'PENDING'
    const updated = await repo.updatePreviewTask(
      task.id,
      {
        status,
        progress: 0,
        retryCount: cancelled ? task.retryCount : nextRetry,
        lastError: err.message,
        errorCode: err.code,
        finishedAt: status === 'PENDING' ? undefined : Date.now(),
        startedAt: undefined
      },
      {
        previewStatus: status,
        previewLastError: err.message,
        previewGeneratedCount: 0
      }
    )
    if (updated) emit({ type: 'task', task: updated })
  } finally {
    activeTokens.delete(task.id)
    await emitStats()
    schedulePump()
  }
}

async function pump(): Promise<void> {
  if (!running || paused) {
    await emitStats()
    return
  }
  const settings = await repo.getSettings()
  const limit = workerLimit(settings)
  while (activeTokens.size < limit) {
    const task = await repo.claimNextPreviewTask()
    if (!task) break
    void runTask(task)
  }
  await emitStats()
}

function schedulePump(): void {
  if (pumpTimer) clearTimeout(pumpTimer)
  pumpTimer = setTimeout(() => {
    pumpTimer = null
    void pump()
  }, 150)
}

export async function startPreviewTaskQueue(): Promise<void> {
  if (running) return
  running = true
  await repo.resetProcessingPreviewTasks()
  schedulePump()
}

export function wakePreviewTaskQueue(): void {
  schedulePump()
}

export async function pausePreviewTaskQueue(): Promise<void> {
  paused = true
  await emitStats()
}

export async function resumePreviewTaskQueue(): Promise<void> {
  paused = false
  schedulePump()
}

export async function cancelPreviewTask(taskId: string): Promise<void> {
  const token = activeTokens.get(taskId)
  if (token) {
    token.cancelled = true
    try {
      token.currentProcess?.kill('SIGKILL')
    } catch {}
  } else {
    const task = await repo.updatePreviewTask(taskId, { status: 'CANCELLED', finishedAt: Date.now() }, { previewStatus: 'CANCELLED' })
    if (task) emit({ type: 'task', task })
  }
  await emitStats()
}

export async function retryPreviewTask(taskId: string): Promise<PreviewTask | null> {
  const task = await repo.updatePreviewTask(taskId, {
    status: 'PENDING',
    progress: 0,
    generatedCount: 0,
    lastError: undefined,
    errorCode: undefined,
    finishedAt: undefined,
    startedAt: undefined
  }, { previewStatus: 'PENDING', previewGeneratedCount: 0, previewLastError: undefined })
  if (task) {
    emit({ type: 'task', task })
    schedulePump()
  }
  return task
}

export async function setPreviewPlaybackActive(active: boolean): Promise<void> {
  playbackActive = active
  schedulePump()
  await emitStats()
}

export async function stopPreviewTaskQueue(): Promise<void> {
  running = false
  paused = true
  for (const token of activeTokens.values()) {
    token.cancelled = true
    try {
      token.currentProcess?.kill('SIGKILL')
    } catch {}
  }
  await emitStats()
}
