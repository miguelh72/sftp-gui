import type { TransferProgress } from '../sftp/types'

export class TransferItem implements TransferProgress {
  id: string
  filename: string
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

  updateProgress(data: Partial<TransferProgress>): void {
    if (data.percent !== undefined) this.percent = data.percent
    if (data.speed !== undefined) this.speed = data.speed
    if (data.eta !== undefined) this.eta = data.eta
    if (data.transferred !== undefined) this.transferred = data.transferred
    if (data.total !== undefined) this.total = data.total
  }

  toJSON(): TransferProgress {
    return {
      id: this.id,
      filename: this.filename,
      direction: this.direction,
      percent: this.percent,
      transferred: this.transferred,
      total: this.total,
      speed: this.speed,
      eta: this.eta,
      status: this.status,
      error: this.error
    }
  }
}
