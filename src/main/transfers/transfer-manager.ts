import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { stat, readdir, mkdir } from 'fs/promises'
import { join } from 'path'
import { SftpSession } from '../sftp/session'
import { TransferItem } from './transfer-item'
import { deleteLocalEntry } from '../local-fs'
import type { ConnectionConfig, TransferProgress } from '../sftp/types'

interface FileWork {
  transferId: string
  sourcePath: string
  destPath: string
  direction: 'upload' | 'download'
  size: number
  filename: string
}

interface ActiveWork {
  session: SftpSession
  work: FileWork
}

interface TransferMeta {
  item: TransferItem
  totalFiles: number
  completedFiles: number
}

async function collectLocalFiles(dirPath: string, basePath: string): Promise<Array<{ relativePath: string; size: number; name: string }>> {
  const results: Array<{ relativePath: string; size: number; name: string }> = []
  const entries = await readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    const relPath = basePath ? basePath + '/' + entry.name : entry.name
    if (entry.isDirectory()) {
      results.push(...await collectLocalFiles(fullPath, relPath))
    } else {
      const stats = await stat(fullPath)
      results.push({ relativePath: relPath, size: stats.size, name: entry.name })
    }
  }
  return results
}

async function collectRemoteFiles(session: SftpSession, remotePath: string, basePath: string): Promise<Array<{ relativePath: string; size: number; name: string }>> {
  const results: Array<{ relativePath: string; size: number; name: string }> = []
  const entries = await session.listDirectory(remotePath)
  for (const entry of entries) {
    const childPath = remotePath.endsWith('/')
      ? remotePath + entry.name
      : remotePath + '/' + entry.name
    const relPath = basePath ? basePath + '/' + entry.name : entry.name
    if (entry.isDirectory) {
      results.push(...await collectRemoteFiles(session, childPath, relPath))
    } else {
      results.push({ relativePath: relPath, size: entry.size, name: entry.name })
    }
  }
  return results
}

async function collectLocalDirs(dirPath: string, basePath: string): Promise<string[]> {
  const results: string[] = []
  const entries = await readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const relPath = basePath ? basePath + '/' + entry.name : entry.name
      results.push(relPath)
      results.push(...await collectLocalDirs(join(dirPath, entry.name), relPath))
    }
  }
  return results
}

async function collectRemoteDirs(session: SftpSession, remotePath: string, basePath: string): Promise<string[]> {
  const results: string[] = []
  const entries = await session.listDirectory(remotePath)
  for (const entry of entries) {
    if (entry.isDirectory) {
      const childPath = remotePath.endsWith('/')
        ? remotePath + entry.name
        : remotePath + '/' + entry.name
      const relPath = basePath ? basePath + '/' + entry.name : entry.name
      results.push(relPath)
      results.push(...await collectRemoteDirs(session, childPath, relPath))
    }
  }
  return results
}

export class TransferManager extends EventEmitter {
  private mainSession: SftpSession
  private connectionConfig: ConnectionConfig
  private maxConcurrent: number
  private cancelCleanup: 'remove-partial' | 'remove-all'

  private sessionPool: SftpSession[] = []
  private activeSessions = new Map<string, ActiveWork>()
  private fileQueue: FileWork[] = []
  private transfers = new Map<string, TransferMeta>()
  private destroying = false

  constructor(mainSession: SftpSession, connectionConfig: ConnectionConfig, maxConcurrent: number, cancelCleanup: 'remove-partial' | 'remove-all' = 'remove-partial') {
    super()
    this.mainSession = mainSession
    this.connectionConfig = connectionConfig
    this.maxConcurrent = maxConcurrent
    this.cancelCleanup = cancelCleanup
  }

  setCancelCleanup(mode: 'remove-partial' | 'remove-all'): void {
    this.cancelCleanup = mode
  }

  async enqueueDownload(remotePath: string, localPath: string, filename: string, skipFiles?: string[]): Promise<string> {
    const id = uuidv4()
    const item = new TransferItem({ id, filename, direction: 'download', localPath, remotePath })

    // Check if remote path is a directory
    try {
      const parentPath = remotePath.substring(0, remotePath.lastIndexOf('/')) || '/'
      const dirName = remotePath.substring(remotePath.lastIndexOf('/') + 1)
      const parentEntries = await this.mainSession.listDirectory(parentPath)
      const entry = parentEntries.find(e => e.name === dirName)

      if (entry?.isDirectory) {
        let files = await collectRemoteFiles(this.mainSession, remotePath, '')

        // Filter out skipped files
        if (skipFiles && skipFiles.length > 0) {
          const skipSet = new Set(skipFiles.map(s => {
            const slashIdx = s.indexOf('/')
            return slashIdx === -1 ? s : s.substring(slashIdx + 1)
          }))
          files = files.filter(f => !skipSet.has(f.relativePath))
        }

        const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
        item.setFileSizes(files.map(f => ({ name: f.name, size: f.size })), totalBytes)

        // Create local directory structure
        const localDestDir = join(localPath, filename)
        await mkdir(localDestDir, { recursive: true })
        const dirs = await collectRemoteDirs(this.mainSession, remotePath, '')
        for (const dir of dirs) {
          await mkdir(join(localDestDir, dir.replace(/\//g, process.platform === 'win32' ? '\\' : '/')), { recursive: true })
        }

        this.transfers.set(id, { item, totalFiles: files.length, completedFiles: 0 })
        this.emit('queued', item.toJSON())

        // Decompose into individual file work items
        for (const file of files) {
          const srcFile = remotePath.endsWith('/')
            ? remotePath + file.relativePath
            : remotePath + '/' + file.relativePath
          // For downloads, sftp "get" writes to <destDir>/<filename>
          // We need to compute the local dest file path
          const destFile = join(localDestDir, file.relativePath.replace(/\//g, process.platform === 'win32' ? '\\' : '/'))
          // destPath for get should be the parent directory of the file
          const destDir2 = destFile.substring(0, destFile.lastIndexOf(process.platform === 'win32' ? '\\' : '/'))
          this.fileQueue.push({
            transferId: id,
            sourcePath: srcFile,
            destPath: destDir2,
            direction: 'download',
            size: file.size,
            filename: file.name
          })
        }

        this.processNext()
        return id
      } else if (entry) {
        item.total = entry.size
      }
    } catch {
      // Size calculation failed — proceed as single file
    }

    // Single file download
    this.transfers.set(id, { item, totalFiles: 1, completedFiles: 0 })
    this.emit('queued', item.toJSON())
    this.fileQueue.push({
      transferId: id,
      sourcePath: remotePath,
      destPath: localPath,
      direction: 'download',
      size: item.total,
      filename
    })
    this.processNext()
    return id
  }

  async enqueueUpload(localPath: string, remotePath: string, filename: string, skipFiles?: string[]): Promise<string> {
    const id = uuidv4()
    const item = new TransferItem({ id, filename, direction: 'upload', localPath, remotePath })

    try {
      const stats = await stat(localPath)
      if (stats.isDirectory()) {
        let files = await collectLocalFiles(localPath, '')

        // Filter out skipped files
        if (skipFiles && skipFiles.length > 0) {
          const skipSet = new Set(skipFiles.map(s => {
            const slashIdx = s.indexOf('/')
            return slashIdx === -1 ? s : s.substring(slashIdx + 1)
          }))
          files = files.filter(f => !skipSet.has(f.relativePath))
        }

        const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
        item.setFileSizes(files.map(f => ({ name: f.name, size: f.size })), totalBytes)

        // Create remote directory structure using a transfer session
        const mkdirSession = await this.getOrCreateSession()
        const remoteDestDir = remotePath.endsWith('/')
          ? remotePath + filename
          : remotePath + '/' + filename
        try {
          await mkdirSession.mkdir(remoteDestDir)
        } catch {
          // Directory may already exist
        }
        const dirs = await collectLocalDirs(localPath, '')
        for (const dir of dirs) {
          try {
            await mkdirSession.mkdir(remoteDestDir + '/' + dir)
          } catch {
            // Subdirectory may already exist
          }
        }
        this.returnSession(mkdirSession)

        this.transfers.set(id, { item, totalFiles: files.length, completedFiles: 0 })
        this.emit('queued', item.toJSON())

        for (const file of files) {
          const srcFile = join(localPath, file.relativePath.replace(/\//g, process.platform === 'win32' ? '\\' : '/'))
          const parentRel = file.relativePath.substring(0, file.relativePath.lastIndexOf('/'))
          const destDir2 = parentRel
            ? remoteDestDir + '/' + parentRel
            : remoteDestDir
          this.fileQueue.push({
            transferId: id,
            sourcePath: srcFile,
            destPath: destDir2,
            direction: 'upload',
            size: file.size,
            filename: file.name
          })
        }

        this.processNext()
        return id
      } else {
        item.total = stats.size
      }
    } catch {
      // Size calculation failed — proceed as single file
    }

    // Single file upload
    this.transfers.set(id, { item, totalFiles: 1, completedFiles: 0 })
    this.emit('queued', item.toJSON())
    this.fileQueue.push({
      transferId: id,
      sourcePath: localPath,
      destPath: remotePath,
      direction: 'upload',
      size: item.total,
      filename
    })
    this.processNext()
    return id
  }

  async cancel(id: string): Promise<void> {
    const meta = this.transfers.get(id)
    if (!meta) return

    // Remove pending work items for this transfer
    this.fileQueue = this.fileQueue.filter(w => w.transferId !== id)

    // Collect in-flight work items before killing sessions
    const inFlightWork: FileWork[] = []
    const sessionsToKill: string[] = []
    for (const [sessionId, active] of this.activeSessions) {
      if (active.work.transferId === id) {
        sessionsToKill.push(sessionId)
        inFlightWork.push(active.work)
      }
    }

    for (const sessionId of sessionsToKill) {
      const active = this.activeSessions.get(sessionId)!
      this.activeSessions.delete(sessionId)

      // Kill the session — don't return to pool
      try {
        active.session.kill()
      } catch {
        // Best-effort
      }
    }

    // Wait for killed PTY processes to fully terminate and release file handles
    // before attempting to delete partial files. kill() signals the process but
    // doesn't wait for exit — without this delay, cleanup races with in-flight I/O.
    if (sessionsToKill.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Clean up based on cancel cleanup mode
    if (!meta.item.isFolder || this.cancelCleanup === 'remove-all') {
      // Single-file transfers or remove-all mode: delete the entire destination
      await this.cleanupTransfer(meta.item)
    } else {
      // Folder transfer with remove-partial: only delete in-flight files
      await this.cleanupPartialFiles(inFlightWork)
    }

    meta.item.status = 'cancelled'
    this.emit('cancelled', meta.item.toJSON())
    this.emitSessionInfo()

    // Don't replenish pool here — processNext will create sessions lazily
    this.processNext()
  }

  retryFailed(originalId: string): string | null {
    const originalMeta = this.transfers.get(originalId)
    if (!originalMeta || !originalMeta.item.failedFiles.length) return null

    const failedFiles = originalMeta.item.failedFiles
    const direction = originalMeta.item.direction
    const id = uuidv4()
    const item = new TransferItem({
      id,
      filename: `${originalMeta.item.filename} (retry)`,
      direction,
      localPath: originalMeta.item.localPath,
      remotePath: originalMeta.item.remotePath
    })

    // Set up as a multi-file transfer with estimated sizes (unknown, use 0)
    if (failedFiles.length > 1) {
      item.setFileSizes(failedFiles.map(f => ({ name: f.name, size: 0 })), 0)
    }

    this.transfers.set(id, { item, totalFiles: failedFiles.length, completedFiles: 0 })
    this.emit('queued', item.toJSON())

    for (const f of failedFiles) {
      this.fileQueue.push({
        transferId: id,
        sourcePath: f.sourcePath,
        destPath: f.destPath,
        direction,
        size: 0,
        filename: f.name
      })
    }

    this.processNext()
    return id
  }

  getAll(): TransferProgress[] {
    const results: TransferProgress[] = []
    for (const meta of this.transfers.values()) {
      results.push(meta.item.toJSON())
    }
    return results
  }

  setMaxConcurrent(n: number): void {
    this.maxConcurrent = n

    // Trim excess idle sessions
    while (this.sessionPool.length > 0 && this.sessionPool.length + this.activeSessions.size > n) {
      const session = this.sessionPool.pop()!
      session.disconnect()
    }

    this.emitSessionInfo()

    // If raised, might be able to start more work
    this.processNext()
  }

  getSessionInfo(): { active: number; max: number } {
    return { active: this.activeSessions.size, max: this.maxConcurrent }
  }

  async destroy(): Promise<void> {
    this.destroying = true
    this.fileQueue = []

    // Kill all active sessions
    for (const [, active] of this.activeSessions) {
      try { active.session.kill() } catch { /* best-effort */ }
    }
    this.activeSessions.clear()

    // Disconnect pooled sessions
    for (const session of this.sessionPool) {
      try { session.disconnect() } catch { /* best-effort */ }
    }
    this.sessionPool = []
  }

  private async processNext(): Promise<void> {
    if (this.destroying) return

    while (this.activeSessions.size < this.maxConcurrent && this.fileQueue.length > 0) {
      const work = this.fileQueue.shift()!
      const meta = this.transfers.get(work.transferId)
      if (!meta || meta.item.status === 'cancelled') continue

      // Mark the parent transfer as active
      if (meta.item.status === 'queued') {
        meta.item.status = 'active'
        this.emit('started', meta.item.toJSON())
      }

      let session: SftpSession
      try {
        session = await this.getOrCreateSession()
      } catch (err) {
        // Can't get a session — fail this work item's parent transfer
        meta.item.status = 'failed'
        meta.item.error = `Session creation failed: ${err}`
        this.emit('failed', meta.item.toJSON())
        // Remove remaining work for this transfer
        this.fileQueue = this.fileQueue.filter(w => w.transferId !== work.transferId)
        continue
      }

      const sessionId = uuidv4()
      this.activeSessions.set(sessionId, { session, work })
      this.emitSessionInfo()

      // Start the transfer in the background
      this.executeWork(sessionId, session, work, meta)
    }
  }

  private async executeWork(sessionId: string, session: SftpSession, work: FileWork, meta: TransferMeta): Promise<void> {
    let fileErrored = false

    // Set up progress listener for this session
    const progressHandler = (progress: Partial<TransferProgress>): void => {
      // Route progress to the parent TransferItem
      meta.item.updateProgress({ ...progress, filename: work.filename })
      this.emit('progress', meta.item.toJSON())
    }
    session.on('transfer-progress', progressHandler)

    try {
      if (work.direction === 'download') {
        await session.download(work.sourcePath, work.destPath)
      } else {
        await session.upload(work.sourcePath, work.destPath)
      }

      // Mark file completed in parent
      meta.completedFiles++
      meta.item.updateProgress({ percent: 100, filename: work.filename })

      if (meta.completedFiles >= meta.totalFiles) {
        meta.item.status = 'completed'
        meta.item.percent = 100
        this.emit('completed', meta.item.toJSON())
      } else {
        this.emit('progress', meta.item.toJSON())
      }
    } catch (err) {
      // Check if this transfer was cancelled (work removed from active)
      if (!this.activeSessions.has(sessionId)) return

      if (meta.item.status !== 'cancelled') {
        fileErrored = true
        if (meta.totalFiles > 1) {
          // Folder transfer: track per-file failure and continue with remaining files
          meta.item.failedFiles.push({ name: work.filename, error: String(err), sourcePath: work.sourcePath, destPath: work.destPath })
          meta.completedFiles++
          meta.item.updateProgress({ percent: 100, filename: work.filename })

          if (meta.completedFiles >= meta.totalFiles) {
            if (meta.item.failedFiles.length >= meta.totalFiles) {
              meta.item.status = 'failed'
              meta.item.error = `All ${meta.totalFiles} files failed`
              this.emit('failed', meta.item.toJSON())
            } else {
              meta.item.status = 'completed'
              meta.item.percent = 100
              this.emit('completed', meta.item.toJSON())
            }
          } else {
            this.emit('progress', meta.item.toJSON())
          }
        } else {
          // Single file: fail the transfer
          meta.item.status = 'failed'
          meta.item.error = String(err)
          this.emit('failed', meta.item.toJSON())
        }
      }
    } finally {
      session.removeListener('transfer-progress', progressHandler)

      if (this.activeSessions.has(sessionId)) {
        this.activeSessions.delete(sessionId)
        // Don't return errored sessions to pool — they may be broken
        if (!fileErrored && session.isConnected && !this.destroying) {
          this.returnSession(session)
        } else if (!this.destroying) {
          try { session.disconnect() } catch { /* best-effort */ }
        }
        this.emitSessionInfo()
      }

      this.processNext()
    }
  }

  private async getOrCreateSession(): Promise<SftpSession> {
    // Try to reuse an idle session from the pool
    while (this.sessionPool.length > 0) {
      const session = this.sessionPool.pop()!
      if (session.isConnected) return session
      // Session died — discard and try next
    }

    // Create a new session
    const session = new SftpSession()
    await session.connect(this.connectionConfig)
    return session
  }

  private returnSession(session: SftpSession): void {
    if (this.destroying) {
      try { session.disconnect() } catch { /* best-effort */ }
      return
    }

    // Only keep up to maxConcurrent sessions in pool
    const totalSessions = this.sessionPool.length + this.activeSessions.size
    if (totalSessions >= this.maxConcurrent) {
      try { session.disconnect() } catch { /* best-effort */ }
      return
    }

    this.sessionPool.push(session)
  }

  private async deleteWithRetry(fn: () => Promise<void>): Promise<void> {
    try {
      await fn()
    } catch {
      // File may still be locked by the dying process — retry once after a short wait
      await new Promise(resolve => setTimeout(resolve, 300))
      try {
        await fn()
      } catch {
        // Best-effort — file handle may still be held by OS
      }
    }
  }

  private async cleanupPartialFiles(inFlightWork: FileWork[]): Promise<void> {
    for (const work of inFlightWork) {
      if (work.direction === 'download') {
        await this.deleteWithRetry(() => deleteLocalEntry(join(work.destPath, work.filename)))
      } else {
        if (!this.mainSession.isConnected) continue
        const target = work.destPath.endsWith('/')
          ? work.destPath + work.filename
          : work.destPath + '/' + work.filename
        await this.deleteWithRetry(() => this.mainSession.rm(target))
      }
    }
  }

  private async cleanupTransfer(item: TransferItem): Promise<void> {
    if (item.direction === 'download') {
      const target = join(item.localPath, item.filename)
      await this.deleteWithRetry(() => deleteLocalEntry(target))
    } else {
      if (!this.mainSession.isConnected) return
      const target = item.remotePath.endsWith('/')
        ? item.remotePath + item.filename
        : item.remotePath + '/' + item.filename
      if (item.isFolder) {
        await this.deleteWithRetry(() => this.mainSession.rmdir(target))
      } else {
        await this.deleteWithRetry(() => this.mainSession.rm(target))
      }
    }
  }

  private emitSessionInfo(): void {
    this.emit('session-info', this.getSessionInfo())
  }
}
