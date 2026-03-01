export interface RemoteFileEntry {
  name: string
  isDirectory: boolean
  size: number
  modified: string
  permissions: string
  owner: string
  group: string
}

export interface LocalFileEntry {
  name: string
  isDirectory: boolean
  size: number
  modified: string
  path: string
}

export interface HostInfo {
  name: string
  hostname: string
  port: number
  user?: string
  identityFile?: string
  source: 'ssh-config' | 'known-hosts' | 'remembered'
}

export interface ConnectionConfig {
  host: string
  port: number
  username: string
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
}

export interface SftpInfo {
  found: boolean
  path: string | null
  version: string | null
}

export interface AppSettings {
  maxConcurrentTransfers: number
}
