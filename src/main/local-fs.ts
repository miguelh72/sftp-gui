import { readdir, stat, rm, unlink } from 'fs/promises'
import { join } from 'path'
import { execSync } from 'child_process'

export interface LocalFileEntry {
  name: string
  isDirectory: boolean
  size: number
  modified: string
  path: string
}

export async function listLocalDirectory(dirPath: string): Promise<LocalFileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const results: LocalFileEntry[] = []

  for (const entry of entries) {
    try {
      const fullPath = join(dirPath, entry.name)
      const stats = await stat(fullPath)
      results.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modified: stats.mtime.toISOString(),
        path: fullPath
      })
    } catch {
      // Skip entries we can't stat (permission issues)
    }
  }

  return results
}

export async function deleteLocalEntry(filePath: string): Promise<void> {
  const stats = await stat(filePath)
  if (stats.isDirectory()) {
    await rm(filePath, { recursive: true })
  } else {
    await unlink(filePath)
  }
}

export async function findLocalFiles(dirPath: string, prefix: string): Promise<string[]> {
  const results: string[] = []
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      const relativePath = prefix ? prefix + '/' + entry.name : entry.name
      if (entry.isDirectory()) {
        results.push(...await findLocalFiles(fullPath, relativePath))
      } else {
        results.push(relativePath)
      }
    }
  } catch {
    // Permission errors — skip
  }
  return results
}

export async function localExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

export function listDrives(): string[] {
  try {
    const result = execSync(
      'powershell.exe -NoProfile -Command "[string]::Join(\',\',(Get-PSDrive -PSProvider FileSystem).Root)"',
      { encoding: 'utf-8', timeout: 5000 }
    )
    const drives = result.trim().split(',').filter(d => /^[A-Z]:\\$/i.test(d))
    return drives.length > 0 ? drives : ['C:\\']
  } catch {
    return ['C:\\']
  }
}
