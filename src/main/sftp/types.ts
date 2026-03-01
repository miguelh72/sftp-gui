export interface RemoteFileEntry {
  name: string
  isDirectory: boolean
  size: number
  modified: string
  permissions: string
  owner: string
  group: string
}

export type { ConnectionConfig } from '../schemas'

export interface HostInfo {
  name: string
  hostname: string
  port: number
  user?: string
  identityFile?: string
  source: 'ssh-config' | 'known-hosts' | 'remembered'
}

export interface TransferProgress {
  id: string
  filename: string
  currentFile?: string
  direction: 'upload' | 'download'
  percent: number
  transferred: number
  total: number
  speed: string
  eta: string
  status: 'queued' | 'active' | 'completed' | 'failed' | 'cancelled'
  error?: string
  isFolder?: boolean
  sourcePath?: string
}

export interface SftpCommand {
  command: string
  resolve: (output: string) => void
  reject: (error: Error) => void
  sentinel: string
}
