import type { TransferProgress } from '../sftp/types'

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
  /** Map of filename → size for folder transfers (files may share names across subdirs) */
  private fileSizes: Array<{ name: string; size: number }> = []
  private completedBytes = 0
  private currentFileName = ''
  private currentFileCompleted = false

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
    if (data.eta !== undefined) this.eta = data.eta

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
      isFolder: this.isFolder || undefined
    }
  }
}
