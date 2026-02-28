import { existsSync } from 'fs'
import { execFileSync } from 'child_process'

const KNOWN_LOCATIONS = [
  'C:\\Program Files\\OpenSSH\\sftp.exe',
  'C:\\Windows\\System32\\OpenSSH\\sftp.exe',
  'C:\\Program Files (x86)\\OpenSSH\\sftp.exe'
]

export function findSftpBinary(): string | null {
  // Prefer C:\Program Files\OpenSSH (likely post-quantum OpenSSH 10.0+)
  for (const loc of KNOWN_LOCATIONS) {
    if (existsSync(loc)) return loc
  }

  // Try PATH via `where` (no shell interpretation with execFileSync)
  try {
    const result = execFileSync('where', ['sftp.exe'], { encoding: 'utf-8', timeout: 5000 })
    const first = result.trim().split('\n')[0]?.trim()
    if (first && existsSync(first)) return first
  } catch {
    // not on PATH
  }

  return null
}

export function getSftpVersion(binaryPath: string): string | null {
  try {
    // sftp -V writes to stderr and may exit non-zero
    const result = execFileSync(binaryPath, ['-V'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return result.trim()
  } catch (err: unknown) {
    // sftp -V often exits non-zero but writes version to stderr
    if (err && typeof err === 'object' && 'stderr' in err) {
      const stderr = (err as { stderr: string }).stderr
      if (stderr) return stderr.trim()
    }
    return null
  }
}

export function findSshBinary(): string | null {
  const sshLocations = [
    'C:\\Program Files\\OpenSSH\\ssh.exe',
    'C:\\Windows\\System32\\OpenSSH\\ssh.exe'
  ]

  for (const loc of sshLocations) {
    if (existsSync(loc)) return loc
  }

  try {
    const result = execFileSync('where', ['ssh.exe'], { encoding: 'utf-8', timeout: 5000 })
    const first = result.trim().split('\n')[0]?.trim()
    if (first && existsSync(first)) return first
  } catch {
    // not on PATH
  }

  return null
}
