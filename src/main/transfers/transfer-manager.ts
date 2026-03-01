import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { stat, readdir } from 'fs/promises'
import { join } from 'path'
import { SftpSession } from '../sftp/session'
import { TransferItem } from './transfer-item'
import { deleteLocalEntry } from '../local-fs'
import type { TransferProgress } from '../sftp/types'

async function collectLocalFileSizes(dirPath: string): Promise<Array<{ name: string; size: number }>> {
  const results: Array<{ name: string; size: number }> = []
  const entries = await readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...await collectLocalFileSizes(fullPath))
    } else {
      const stats = await stat(fullPath)
      results.push({ name: entry.name, size: stats.size })
    }
  }
  return results
}

async function collectRemoteFileSizes(session: SftpSession, remotePath: string): Promise<Array<{ name: string; size: number }>> {
  const results: Array<{ name: string; size: number }> = []
  const entries = await session.listDirectory(remotePath)
  for (const entry of entries) {
    const childPath = remotePath.endsWith('/')
      ? remotePath + entry.name
      : remotePath + '/' + entry.name
    if (entry.isDirectory) {
      results.push(...await collectRemoteFileSizes(session, childPath))
    } else {
      results.push({ name: entry.name, size: entry.size })
    }
  }
  return results
}

export class TransferManager extends EventEmitter {
  private queue: TransferItem[] = []
  private active: TransferItem | null = null
  private session: SftpSession
  private abortingTransferId: string | null = null

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

  async cancel(id: string): Promise<void> {
    // Case 1: Queued (not yet started)
    const inQueue = this.queue.findIndex(t => t.id === id)
    if (inQueue !== -1) {
      this.queue[inQueue].status = 'cancelled'
      this.emit('cancelled', this.queue[inQueue].toJSON())
      this.queue.splice(inQueue, 1)
      return
    }

    // Case 2: Active transfer
    if (!this.active || this.active.id !== id) return

    const cancelled = this.active
    this.abortingTransferId = id

    // Abort the sftp command (sends Ctrl+C, rejects promise, resyncs)
    try {
      await this.session.abort()
    } catch {
      // Session may have died — transfer is still cancelled
    }

    // Best-effort cleanup of partial files
    await this.cleanupPartialTransfer(cancelled)
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

    // Check if this is a folder transfer and pre-calculate file sizes
    try {
      if (this.active.direction === 'upload') {
        const stats = await stat(this.active.localPath)
        if (stats.isDirectory()) {
          const sizes = await collectLocalFileSizes(this.active.localPath)
          const total = sizes.reduce((sum, f) => sum + f.size, 0)
          this.active.setFileSizes(sizes, total)
        } else {
          this.active.total = stats.size
        }
      } else {
        // Download — check if remote path is a directory
        const parentPath = this.active.remotePath.substring(0, this.active.remotePath.lastIndexOf('/')) || '/'
        const dirName = this.active.remotePath.substring(this.active.remotePath.lastIndexOf('/') + 1)
        const parentEntries = await this.session.listDirectory(parentPath)
        const entry = parentEntries.find(e => e.name === dirName)
        if (entry?.isDirectory) {
          const sizes = await collectRemoteFileSizes(this.session, this.active.remotePath)
          const total = sizes.reduce((sum, f) => sum + f.size, 0)
          this.active.setFileSizes(sizes, total)
        } else if (entry) {
          this.active.total = entry.size
        }
      }
    } catch {
      // Size calculation failed — proceed without folder progress tracking
    }

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
      if (this.abortingTransferId === this.active.id) {
        this.active.status = 'cancelled'
        this.emit('cancelled', this.active.toJSON())
        this.abortingTransferId = null
      } else {
        this.active.status = 'failed'
        this.active.error = String(err)
        this.emit('failed', this.active.toJSON())
      }
    }

    this.active = null
    this.processNext()
  }

  private async cleanupPartialTransfer(item: TransferItem): Promise<void> {
    try {
      if (item.direction === 'download') {
        // sftp "get -r <remote> <localDir>" creates <localDir>/<filename>
        const target = join(item.localPath, item.filename)
        await deleteLocalEntry(target)
      } else {
        // sftp "put -r <local> <remoteDir>" creates <remoteDir>/<filename>
        if (!this.session.isConnected) return
        const target = item.remotePath.endsWith('/')
          ? item.remotePath + item.filename
          : item.remotePath + '/' + item.filename
        if (item.isFolder) {
          await this.session.rmdir(target)
        } else {
          await this.session.rm(target)
        }
      }
    } catch {
      // Best-effort — don't fail if cleanup fails
    }
  }
}
