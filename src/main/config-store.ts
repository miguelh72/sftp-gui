import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface AppSettings {
  maxConcurrentTransfers: number
  cancelCleanup: 'remove-partial' | 'remove-all'
}

const DEFAULT_SETTINGS: AppSettings = {
  maxConcurrentTransfers: 6,
  cancelCleanup: 'remove-partial'
}

interface AppConfig {
  rememberedUsers: Record<string, string> // host -> username
  windowState?: {
    width: number
    height: number
    x?: number
    y?: number
    maximized?: boolean
  }
  settings?: AppSettings
}

const DEFAULT_CONFIG: AppConfig = {
  rememberedUsers: {}
}

function getConfigPath(): string {
  const dir = join(app.getPath('appData'), 'sftp-gui')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'config.json')
}

export function loadConfig(): AppConfig {
  try {
    const data = readFileSync(getConfigPath(), 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: AppConfig): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}

export function getRememberedUser(host: string): string | undefined {
  return loadConfig().rememberedUsers[host]
}

export function setRememberedUser(host: string, username: string): void {
  const config = loadConfig()
  config.rememberedUsers[host] = username
  saveConfig(config)
}

export function getWindowState(): AppConfig['windowState'] {
  return loadConfig().windowState
}

export function setWindowState(state: NonNullable<AppConfig['windowState']>): void {
  const config = loadConfig()
  config.windowState = state
  saveConfig(config)
}

export function getSettings(): AppSettings {
  const config = loadConfig()
  return { ...DEFAULT_SETTINGS, ...config.settings }
}

export function setSettings(settings: AppSettings): void {
  const config = loadConfig()
  config.settings = settings
  saveConfig(config)
}
