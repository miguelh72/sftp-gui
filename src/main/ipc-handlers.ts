import { ipcMain, BrowserWindow } from 'electron'
import { homedir } from 'os'
import { SftpSession } from './sftp/session'
import { getAllHosts } from './sftp/ssh-config-reader'
import { findSftpBinary, getSftpVersion } from './sftp/binary-finder'
import { loadConfig, setRememberedUser, getRememberedUser } from './config-store'
import { listLocalDirectory, listDrives, deleteLocalEntry } from './local-fs'
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
      transferManager = null
    })

    await session.connect(config)
    setRememberedUser(config.host, config.username)

    transferManager = new TransferManager(session)

    const progressEvents = ['queued', 'started', 'progress', 'completed', 'failed', 'cancelled'] as const
    for (const event of progressEvents) {
      transferManager.on(event, (data: TransferProgress) => {
        sendToRenderer('transfer-update', data)
      })
    }

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
    transferManager = null
  })

  // --- Remote FS ---

  ipcMain.handle('remote-ls', async (_e, path: unknown) => {
    if (!session?.isConnected) throw new Error('Not connected')
    return session.listDirectory(validatePath(path, 'remote path'))
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

  ipcMain.handle('transfer-cancel', (_e, id: unknown) => {
    transferManager?.cancel(validateString(id, 'transfer id'))
  })

  ipcMain.handle('transfer-list', () => {
    return transferManager?.getAll() ?? []
  })
}
