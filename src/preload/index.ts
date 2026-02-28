import { contextBridge, ipcRenderer } from 'electron'
import type { ConnectionConfig, HostInfo, RemoteFileEntry, TransferProgress } from '../main/sftp/types'
import type { LocalFileEntry } from '../main/local-fs'

const api = {
  // Connection
  getHosts: (): Promise<HostInfo[]> => ipcRenderer.invoke('get-hosts'),
  getSftpInfo: (): Promise<{ found: boolean; path: string | null; version: string | null }> =>
    ipcRenderer.invoke('get-sftp-info'),
  getRememberedUser: (host: string): Promise<string | undefined> =>
    ipcRenderer.invoke('get-remembered-user', host),
  connect: (config: ConnectionConfig): Promise<{ connected: boolean; cwd: string }> =>
    ipcRenderer.invoke('connect', config),
  respondHostKey: (accept: boolean): Promise<void> =>
    ipcRenderer.invoke('respond-host-key', accept),
  disconnect: (): Promise<void> => ipcRenderer.invoke('disconnect'),

  // Remote FS
  remoteLs: (path: string): Promise<RemoteFileEntry[]> => ipcRenderer.invoke('remote-ls', path),
  remotePwd: (): Promise<string> => ipcRenderer.invoke('remote-pwd'),
  remoteMkdir: (path: string): Promise<void> => ipcRenderer.invoke('remote-mkdir', path),
  remoteRm: (path: string): Promise<void> => ipcRenderer.invoke('remote-rm', path),
  remoteRmdir: (path: string): Promise<void> => ipcRenderer.invoke('remote-rmdir', path),
  remoteRename: (oldPath: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke('remote-rename', oldPath, newPath),

  // Local FS
  localLs: (path: string): Promise<LocalFileEntry[]> => ipcRenderer.invoke('local-ls', path),
  localDrives: (): Promise<string[]> => ipcRenderer.invoke('local-drives'),
  localHome: (): Promise<string> => ipcRenderer.invoke('local-home'),
  localDelete: (path: string): Promise<void> => ipcRenderer.invoke('local-delete', path),

  // Transfers
  transferDownload: (remotePath: string, localPath: string, filename: string): Promise<string> =>
    ipcRenderer.invoke('transfer-download', remotePath, localPath, filename),
  transferUpload: (localPath: string, remotePath: string, filename: string): Promise<string> =>
    ipcRenderer.invoke('transfer-upload', localPath, remotePath, filename),
  transferCancel: (id: string): Promise<void> => ipcRenderer.invoke('transfer-cancel', id),
  transferList: (): Promise<TransferProgress[]> => ipcRenderer.invoke('transfer-list'),

  // Events from main
  onHostKeyPrompt: (cb: (prompt: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, prompt: string) => cb(prompt)
    ipcRenderer.on('host-key-prompt', handler)
    return () => ipcRenderer.removeListener('host-key-prompt', handler)
  },
  onDisconnected: (cb: (code: number) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, code: number) => cb(code)
    ipcRenderer.on('disconnected', handler)
    return () => ipcRenderer.removeListener('disconnected', handler)
  },
  onTransferUpdate: (cb: (data: TransferProgress) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: TransferProgress) => cb(data)
    ipcRenderer.on('transfer-update', handler)
    return () => ipcRenderer.removeListener('transfer-update', handler)
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
