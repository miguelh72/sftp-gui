import { ipcMain, BrowserWindow } from 'electron'
import { homedir } from 'os'
import { SftpSession } from './sftp/session'
import { getAllHosts } from './sftp/ssh-config-reader'
import { findSftpBinary, getSftpVersion } from './sftp/binary-finder'
import { loadConfig, setRememberedUser, getRememberedUser, getSettings, setSettings } from './config-store'
import { listLocalDirectory, listDrives, deleteLocalEntry, findLocalFiles, localExists } from './local-fs'
import { join } from 'path'
import { TransferManager } from './transfers/transfer-manager'
import * as z from 'zod'
import {
  safePathSchema,
  connectionConfigSchema,
  appSettingsSchema,
  directionSchema,
  conflictBatchInputSchema,
  skipFilesSchema
} from './schemas'
import type { TransferProgress } from './sftp/types'

/** Convert ZodError to a plain Error with a human-readable message. */
function formatZodError(err: z.ZodError): Error {
  const msg = err.issues.map(i => {
    const path = i.path.length > 0 ? `${i.path.join('.')}: ` : ''
    return `${path}${i.message}`
  }).join('; ')
  return new Error(msg)
}

/** Rethrow ZodErrors as plain Errors with readable messages for IPC. */
function parseOrThrow<T>(schema: { parse: (v: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value)
  } catch (err) {
    if (err instanceof z.ZodError) throw formatZodError(err)
    throw err
  }
}

// ---

let session: SftpSession | null = null
let transferManager: TransferManager | null = null

function getWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows[0] ?? null
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  getWindow()?.webContents.send(channel, ...args)
}

export function registerIpcHandlers(): void {
  // --- Connection ---

  ipcMain.handle('get-hosts', () => {
    return getAllHosts()
  })

  ipcMain.handle('get-sftp-info', () => {
    const binary = findSftpBinary()
    if (!binary) return { found: false, path: null, version: null }
    const version = getSftpVersion(binary)
    return { found: true, path: binary, version }
  })

  ipcMain.handle('get-remembered-user', (_e, host: unknown) => {
    return getRememberedUser(parseOrThrow(safePathSchema,host))
  })

  ipcMain.handle('connect', async (_e, rawConfig: unknown) => {
    const config = parseOrThrow(connectionConfigSchema, rawConfig)

    if (session?.isConnected) {
      session.disconnect()
    }

    session = new SftpSession()

    session.on('host-key-prompt', (prompt: string) => {
      sendToRenderer('host-key-prompt', prompt)
    })

    session.on('disconnected', (code: number) => {
      sendToRenderer('disconnected', code)
      session = null
      if (transferManager) {
        transferManager.destroy()
        transferManager = null
      }
    })

    await session.connect(config)
    setRememberedUser(config.host, config.username)

    const settings = getSettings()
    transferManager = new TransferManager(session, config, settings.maxConcurrentTransfers, settings.cancelCleanup)

    const progressEvents = ['queued', 'started', 'progress', 'completed', 'failed', 'cancelled'] as const
    for (const event of progressEvents) {
      transferManager.on(event, (data: TransferProgress) => {
        sendToRenderer('transfer-update', data)
      })
    }

    transferManager.on('session-info', (info: { active: number; max: number }) => {
      sendToRenderer('transfer-session-info', info)
    })

    const cwd = await session.pwd()
    return { connected: true, cwd }
  })

  ipcMain.handle('respond-host-key', (_e, accept: unknown) => {
    if (typeof accept !== 'boolean') throw new Error('Invalid accept value')
    session?.respondToHostKey(accept)
  })

  ipcMain.handle('disconnect', () => {
    session?.disconnect()
    session = null
    if (transferManager) {
      transferManager.destroy()
      transferManager = null
    }
  })

  // --- Remote FS ---

  ipcMain.handle('remote-ls', async (_e, path: unknown) => {
    if (!session?.isConnected) return null
    try {
      return await session.listDirectory(parseOrThrow(safePathSchema,path))
    } catch {
      // Transient errors during abort/reconnect — return null so polling ignores
      return null
    }
  })

  ipcMain.handle('remote-pwd', async () => {
    if (!session?.isConnected) throw new Error('Not connected')
    return session.pwd()
  })

  ipcMain.handle('remote-mkdir', async (_e, path: unknown) => {
    if (!session?.isConnected) throw new Error('Not connected')
    await session.mkdir(parseOrThrow(safePathSchema,path))
  })

  ipcMain.handle('remote-rm', async (_e, path: unknown) => {
    if (!session?.isConnected) throw new Error('Not connected')
    await session.rm(parseOrThrow(safePathSchema,path))
  })

  ipcMain.handle('remote-rmdir', async (_e, path: unknown) => {
    if (!session?.isConnected) throw new Error('Not connected')
    await session.rmdir(parseOrThrow(safePathSchema,path))
  })

  ipcMain.handle('remote-rename', async (_e, oldPath: unknown, newPath: unknown) => {
    if (!session?.isConnected) throw new Error('Not connected')
    await session.rename(parseOrThrow(safePathSchema,oldPath), parseOrThrow(safePathSchema,newPath))
  })

  // --- Local FS ---

  ipcMain.handle('local-ls', async (_e, path: unknown) => {
    return listLocalDirectory(parseOrThrow(safePathSchema,path))
  })

  ipcMain.handle('local-drives', () => {
    return listDrives()
  })

  ipcMain.handle('local-home', () => {
    return homedir()
  })

  ipcMain.handle('local-delete', async (_e, path: unknown) => {
    await deleteLocalEntry(parseOrThrow(safePathSchema,path))
  })

  // --- Transfer Conflict Check ---

  async function checkConflictsForItem(
    dir: string,
    src: string,
    dest: string,
    name: string
  ): Promise<string[]> {
    if (dir === 'download') {
      // Downloading remote → local: check what exists locally at dest/filename
      const destPath = join(dest, name)
      if (!await localExists(destPath)) return []
      // It exists — check if it's a directory (deep scan) or a file
      const { stat } = await import('fs/promises')
      const stats = await stat(destPath)
      if (stats.isDirectory()) {
        // Deep scan: find all files inside remote source that also exist locally
        if (!session?.isConnected) return [name]
        const remoteFiles = await session.listDirectoryRecursive(src, name)
        const conflicts: string[] = []
        for (const relPath of remoteFiles) {
          const localTarget = join(dest, relPath.replace(/\//g, process.platform === 'win32' ? '\\' : '/'))
          if (await localExists(localTarget)) {
            conflicts.push(relPath)
          }
        }
        return conflicts.length > 0 ? conflicts : [name + '/']
      }
      return [name]
    } else {
      // Uploading local → remote: check what exists remotely at dest/filename
      if (!session?.isConnected) return []
      try {
        const entries = await session.listDirectory(dest)
        const existing = entries.find(e => e.name === name)
        if (!existing) return []
        if (existing.isDirectory) {
          // Deep scan: find all files inside local source that also exist remotely
          const localFiles = await findLocalFiles(src, name)
          const conflicts: string[] = []
          for (const relPath of localFiles) {
            try {
              // Check if file exists by listing parent and finding the name
              const parts = relPath.replace(/\\/g, '/').split('/')
              const fname = parts.pop()!
              const parentPath = dest.endsWith('/')
                ? dest + parts.join('/')
                : dest + '/' + parts.join('/')
              const parentEntries = await session.listDirectory(parentPath)
              if (parentEntries.some(e => e.name === fname)) {
                conflicts.push(relPath.replace(/\\/g, '/'))
              }
            } catch {
              // Remote path doesn't exist — no conflict
            }
          }
          return conflicts.length > 0 ? conflicts : [name + '/']
        }
        return [name]
      } catch {
        return []
      }
    }
  }

  ipcMain.handle('check-transfer-conflicts', async (_e, direction: unknown, sourcePath: unknown, destDir: unknown, filename: unknown) => {
    const dir = parseOrThrow(directionSchema, direction)
    const src = parseOrThrow(safePathSchema,sourcePath)
    const dest = parseOrThrow(safePathSchema,destDir)
    const name = parseOrThrow(safePathSchema,filename)
    return checkConflictsForItem(dir, src, dest, name)
  })

  ipcMain.handle('check-transfer-conflicts-batch', async (_e, direction: unknown, items: unknown) => {
    const dir = parseOrThrow(directionSchema, direction)
    const validated = parseOrThrow(conflictBatchInputSchema, items)
    const results: Array<{ filename: string; conflicts: string[] }> = []
    for (const item of validated) {
      const conflicts = await checkConflictsForItem(dir, item.sourcePath, item.destDir, item.filename)
      results.push({ filename: item.filename, conflicts })
    }
    return results
  })

  // --- Transfers ---

  ipcMain.handle('transfer-download', (_e, remotePath: unknown, localPath: unknown, filename: unknown, rawSkipFiles: unknown) => {
    if (!transferManager) throw new Error('Not connected')
    const validatedSkip = parseOrThrow(skipFilesSchema, rawSkipFiles)
    return transferManager.enqueueDownload(
      parseOrThrow(safePathSchema,remotePath),
      parseOrThrow(safePathSchema,localPath),
      parseOrThrow(safePathSchema,filename),
      validatedSkip
    )
  })

  ipcMain.handle('transfer-upload', (_e, localPath: unknown, remotePath: unknown, filename: unknown, rawSkipFiles: unknown) => {
    if (!transferManager) throw new Error('Not connected')
    const validatedSkip = parseOrThrow(skipFilesSchema, rawSkipFiles)
    return transferManager.enqueueUpload(
      parseOrThrow(safePathSchema,localPath),
      parseOrThrow(safePathSchema,remotePath),
      parseOrThrow(safePathSchema,filename),
      validatedSkip
    )
  })

  ipcMain.handle('transfer-cancel', async (_e, id: unknown) => {
    await transferManager?.cancel(parseOrThrow(safePathSchema,id))
  })

  ipcMain.handle('transfer-list', () => {
    return transferManager?.getAll() ?? []
  })

  // --- Settings ---

  ipcMain.handle('get-settings', () => {
    return getSettings()
  })

  ipcMain.handle('set-settings', (_e, rawSettings: unknown) => {
    const settings = parseOrThrow(appSettingsSchema, rawSettings)
    setSettings(settings)
    if (transferManager) {
      transferManager.setMaxConcurrent(settings.maxConcurrentTransfers)
      transferManager.setCancelCleanup(settings.cancelCleanup)
    }
    return settings
  })
}
