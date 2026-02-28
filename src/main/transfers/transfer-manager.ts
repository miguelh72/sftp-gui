import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { SftpSession } from '../sftp/session'
import { TransferItem } from './transfer-item'
import type { TransferProgress } from '../sftp/types'

export class TransferManager extends EventEmitter {
  private queue: TransferItem[] = []
  private active: TransferItem | null = null
  private session: SftpSession

  constructor(session: SftpSession) {
    super()
    this.session = session

    this.session.on('transfer-progress', (progress: Partial<TransferProgress>) => {
      if (this.active) {
        this.active.updateProgress(progress)
        this.emit('progress', this.active.toJSON())
      }
    })
  }

  enqueueDownload(remotePath: string, localPath: string, filename: string): string {
    const item = new TransferItem({
      id: uuidv4(),
      filename,
      direction: 'download',
      localPath,
      remotePath
    })
    this.queue.push(item)
    this.emit('queued', item.toJSON())
    this.processNext()
    return item.id
  }

  enqueueUpload(localPath: string, remotePath: string, filename: string): string {
    const item = new TransferItem({
      id: uuidv4(),
      filename,
      direction: 'upload',
      localPath,
      remotePath
    })
    this.queue.push(item)
    this.emit('queued', item.toJSON())
    this.processNext()
    return item.id
  }

  cancel(id: string): void {
    const inQueue = this.queue.findIndex(t => t.id === id)
    if (inQueue !== -1) {
      this.queue[inQueue].status = 'cancelled'
      this.emit('cancelled', this.queue[inQueue].toJSON())
      this.queue.splice(inQueue, 1)
      return
    }
    // Can't cancel active sftp transfer easily — would need to kill the session
  }

  getAll(): TransferProgress[] {
    const all: TransferProgress[] = []
    if (this.active) all.push(this.active.toJSON())
    all.push(...this.queue.map(t => t.toJSON()))
    return all
  }

  private async processNext(): Promise<void> {
    if (this.active || this.queue.length === 0) return

    this.active = this.queue.shift()!
    this.active.status = 'active'
    this.emit('started', this.active.toJSON())

    try {
      if (this.active.direction === 'download') {
        await this.session.download(this.active.remotePath, this.active.localPath)
      } else {
        await this.session.upload(this.active.localPath, this.active.remotePath)
      }
      this.active.status = 'completed'
      this.active.percent = 100
      this.emit('completed', this.active.toJSON())
    } catch (err) {
      this.active.status = 'failed'
      this.active.error = String(err)
      this.emit('failed', this.active.toJSON())
    }

    this.active = null
    this.processNext()
  }
}
