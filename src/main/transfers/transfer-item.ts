import type { TransferProgress, FailedFile } from '../sftp/types'

export class TransferItem implements TransferProgress {
  id: string
  filename: string
  currentFile?: string
  direction: 'upload' | 'download'
  percent = 0
  transferred = 0
  total = 0
  speed = ''
  eta = ''
  status: TransferProgress['status'] = 'queued'
  error?: string
  localPath: string
  remotePath: string
  isFolder = false
  failedFiles: FailedFile[] = []
  /** Map of filename → size for folder transfers (files may share names across subdirs) */
  private fileSizes: Array<{ name: string; size: number }> = []
  private completedBytes = 0
  private currentFileName = ''
  private currentFileCompleted = false
  /** Moving window of byte samples for ETA calculation (capped to 30s) */
  private speedSamples: Array<{ time: number; bytes: number }> = []
  private readonly SPEED_WINDOW_MS = 30_000

  constructor(opts: {
    id: string
    filename: string
    direction: 'upload' | 'download'
    localPath: string
    remotePath: string
  }) {
    this.id = opts.id
    this.filename = opts.filename
    this.direction = opts.direction
    this.localPath = opts.localPath
    this.remotePath = opts.remotePath
  }

  setFileSizes(sizes: Array<{ name: string; size: number }>, totalBytes: number): void {
    this.fileSizes = [...sizes]
    this.total = totalBytes
    this.isFolder = true
  }

  updateProgress(data: Partial<TransferProgress>): void {
    if (data.speed !== undefined) this.speed = data.speed

    if (this.isFolder && this.total > 0) {
      const progressFilename = data.filename || ''

      // New file started
      if (progressFilename && progressFilename !== this.currentFileName) {
        // Mark previous file as completed and add its bytes
        if (this.currentFileName && !this.currentFileCompleted) {
          this.markCurrentFileCompleted()
        }
        this.currentFileName = progressFilename
        this.currentFile = progressFilename
        this.currentFileCompleted = false
      }

      // Current file hit 100%
      if (data.percent === 100 && !this.currentFileCompleted) {
        this.markCurrentFileCompleted()
      }

      // Overall percent
      this.transferred = this.completedBytes
      this.percent = this.total > 0
        ? Math.min(Math.round((this.completedBytes / this.total) * 100), 99)
        : 0
    } else {
      // Single file
      if (data.percent !== undefined) this.percent = data.percent
      if (data.transferred !== undefined) this.transferred = data.transferred
    }

    this.computeEta()
  }

  private computeEta(): void {
    if (this.total <= 0) return

    const now = Date.now()
    const effectiveBytes = this.isFolder
      ? this.completedBytes
      : Math.round((this.percent / 100) * this.total)

    this.speedSamples.push({ time: now, bytes: effectiveBytes })

    // Prune samples older than the window
    const cutoff = now - this.SPEED_WINDOW_MS
    let pruneIdx = 0
    while (pruneIdx < this.speedSamples.length && this.speedSamples[pruneIdx].time < cutoff) {
      pruneIdx++
    }
    // Keep one sample before the cutoff as the window start reference
    if (pruneIdx > 1) {
      this.speedSamples.splice(0, pruneIdx - 1)
    }

    if (this.speedSamples.length < 2) return

    const oldest = this.speedSamples[0]
    const newest = this.speedSamples[this.speedSamples.length - 1]
    const elapsed = (newest.time - oldest.time) / 1000
    if (elapsed < 0.5) return

    const bytesPerSec = (newest.bytes - oldest.bytes) / elapsed
    if (bytesPerSec <= 0) return

    const remaining = this.total - effectiveBytes
    const seconds = Math.ceil(remaining / bytesPerSec)
    this.eta = TransferItem.formatEta(seconds)
  }

  private static formatEta(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
    const h = Math.floor(m / 60)
    const rm = m % 60
    return rm > 0 ? `${h}h ${rm}m` : `${h}h`
  }

  private markCurrentFileCompleted(): void {
    // Find and consume the first matching file size entry
    const idx = this.fileSizes.findIndex(f => f.name === this.currentFileName)
    if (idx !== -1) {
      this.completedBytes += this.fileSizes[idx].size
      this.fileSizes.splice(idx, 1)
    }
    this.currentFileCompleted = true
  }

  toJSON(): TransferProgress {
    return {
      id: this.id,
      filename: this.filename,
      currentFile: this.currentFile,
      direction: this.direction,
      percent: this.percent,
      transferred: this.transferred,
      total: this.total,
      speed: this.speed,
      eta: this.eta,
      status: this.status,
      error: this.error,
      isFolder: this.isFolder || undefined,
      sourcePath: this.direction === 'upload' ? this.localPath : this.remotePath,
      failedFiles: this.failedFiles.length > 0 ? [...this.failedFiles] : undefined
    }
  }
}
