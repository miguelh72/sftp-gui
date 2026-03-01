import { ipcMain, BrowserWindow } from 'electron'
import { homedir } from 'os'
import { SftpSession } from './sftp/session'
import { getAllHosts } from './sftp/ssh-config-reader'
import { findSftpBinary, getSftpVersion } from './sftp/binary-finder'
import { loadConfig, setRememberedUser, getRememberedUser, getSettings, setSettings } from './config-store'
import { listLocalDirectory, listDrives, deleteLocalEntry, findLocalFiles, localExists } from './local-fs'
import { join } from 'path'
import { TransferManager } from './transfers/transfer-manager'
import type { ConnectionConfig, TransferProgress } from './sftp/types'

// --- Input Validation ---

function validateString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${name}: must be a non-empty string`)
  }
  return value
}

function validatePath(value: unknown, name: string): string {
  const p = validateString(value, name)
  if (/[\x00-\x1f\x7f]/.test(p)) {
    throw new Error(`Invalid ${name}: contains control characters`)
  }
  return p
}

function validateConnectionConfig(config: unknown): ConnectionConfig {
  if (!config || typeof config !== 'object') throw new Error('Invalid connection config')
  const c = config as Record<string, unknown>
  const host = validateString(c.host, 'host')
  const username = validateString(c.username, 'username')
  const port = typeof c.port === 'number' ? c.port : NaN
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port')
  if (!/^[a-zA-Z0-9._\-:[\]]+$/.test(host)) throw new Error('Invalid hostname characters')
  if (!/^[a-zA-Z0-9._\-]+$/.test(username)) throw new Error('Invalid username characters')
  return { host, port, username }
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
    return getRememberedUser(validateString(host, 'host'))
  })

  ipcMain.handle('connect', async (_e, rawConfig: unknown) => {
    const config = validateConnectionConfig(rawConfig)

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
    lastConnectionConfig = null
  })

  // --- Remote FS ---

  ipcMain.handle('remote-ls', async (_e, path: unknown) => {
    if (!session?.isConnected) return null
    try {
      return await session.listDirectory(validatePath(path, 'remote path'))
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
    await session.mkdir(validatePath(path, 'remote path'))
  })

  ipcMain.handle('remote-rm', async (_e, path: unknown) => {
    if (!session?.isConnected) throw new Error('Not connected')
    await session.rm(validatePath(path, 'remote path'))
  })

  ipcMain.handle('remote-rmdir', async (_e, path: unknown) => {
    if (!session?.isConnected) throw new Error('Not connected')
    await session.rmdir(validatePath(path, 'remote path'))
  })

  ipcMain.handle('remote-rename', async (_e, oldPath: unknown, newPath: unknown) => {
    if (!session?.isConnected) throw new Error('Not connected')
    await session.rename(validatePath(oldPath, 'old path'), validatePath(newPath, 'new path'))
  })

  // --- Local FS ---

  ipcMain.handle('local-ls', async (_e, path: unknown) => {
    return listLocalDirectory(validatePath(path, 'local path'))
  })

  ipcMain.handle('local-drives', () => {
    return listDrives()
  })

  ipcMain.handle('local-home', () => {
    return homedir()
  })

  ipcMain.handle('local-delete', async (_e, path: unknown) => {
    await deleteLocalEntry(validatePath(path, 'local path'))
  })

  // --- Transfer Conflict Check ---

  ipcMain.handle('check-transfer-conflicts', async (_e, direction: unknown, sourcePath: unknown, destDir: unknown, filename: unknown) => {
    const dir = validateString(direction as string, 'direction')
    const src = validatePath(sourcePath, 'source path')
    const dest = validatePath(destDir, 'dest dir')
    const name = validateString(filename as string, 'filename')

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
            const remoteTarget = dest.endsWith('/')
              ? dest + relPath.replace(/\\/g, '/')
              : dest + '/' + relPath.replace(/\\/g, '/')
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
  })

  // --- Transfers ---

  ipcMain.handle('transfer-download', (_e, remotePath: unknown, localPath: unknown, filename: unknown) => {
    if (!transferManager) throw new Error('Not connected')
    return transferManager.enqueueDownload(
      validatePath(remotePath, 'remote path'),
      validatePath(localPath, 'local path'),
      validateString(filename, 'filename')
    )
  })

  ipcMain.handle('transfer-upload', (_e, localPath: unknown, remotePath: unknown, filename: unknown) => {
    if (!transferManager) throw new Error('Not connected')
    return transferManager.enqueueUpload(
      validatePath(localPath, 'local path'),
      validatePath(remotePath, 'remote path'),
      validateString(filename, 'filename')
    )
  })

  ipcMain.handle('transfer-cancel', async (_e, id: unknown) => {
    await transferManager?.cancel(validateString(id, 'transfer id'))
  })

  ipcMain.handle('transfer-list', () => {
    return transferManager?.getAll() ?? []
  })

  // --- Settings ---

  ipcMain.handle('get-settings', () => {
    return getSettings()
  })

  ipcMain.handle('set-settings', (_e, rawSettings: unknown) => {
    if (!rawSettings || typeof rawSettings !== 'object') throw new Error('Invalid settings')
    const s = rawSettings as Record<string, unknown>
    const maxConcurrent = Number(s.maxConcurrentTransfers)
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 10) {
      throw new Error('maxConcurrentTransfers must be an integer between 1 and 10')
    }
    const cancelCleanup = s.cancelCleanup
    if (cancelCleanup !== 'remove-partial' && cancelCleanup !== 'remove-all') {
      throw new Error('cancelCleanup must be "remove-partial" or "remove-all"')
    }
    const settings = { maxConcurrentTransfers: maxConcurrent, cancelCleanup }
    setSettings(settings)
    if (transferManager) {
      transferManager.setMaxConcurrent(maxConcurrent)
      transferManager.setCancelCleanup(cancelCleanup)
    }
    return settings
  })
}
