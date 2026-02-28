import type { RemoteFileEntry, TransferProgress } from './types'

/**
 * Parse `ls -la` output from sftp into structured entries.
 * Expected format per line:
 *   -rw-r--r--    1 user     group        1234 Jan  1 12:00 filename
 *   drwxr-xr-x    2 user     group        4096 Jan  1 12:00 dirname
 */
export function parseLsOutput(raw: string): RemoteFileEntry[] {
  const entries: RemoteFileEntry[] = []
  const lines = raw.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Match ls -la output format
    const match = trimmed.match(
      /^([drwxlsStT\-@+.*]{10,})\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\w{3}\s+\d{1,2}\s+[\d:]+)\s+(.+)$/
    )
    if (!match) continue

    const [, permissions, , owner, group, sizeStr, modified, name] = match

    // Skip . and ..
    if (name === '.' || name === '..') continue

    entries.push({
      name,
      isDirectory: permissions.startsWith('d'),
      size: parseInt(sizeStr, 10),
      modified,
      permissions,
      owner,
      group
    })
  }

  return entries
}

/**
 * Detect host key confirmation prompt in sftp output.
 * Returns the fingerprint info if detected, null otherwise.
 */
export function detectHostKeyPrompt(output: string): string | null {
  // OpenSSH outputs something like:
  // The authenticity of host 'example.com (1.2.3.4)' can't be established.
  // ED25519 key fingerprint is SHA256:abc123...
  // Are you sure you want to continue connecting (yes/no/[fingerprint])?
  if (/are you sure you want to continue connecting/i.test(output)) {
    return output
  }
  return null
}

/**
 * Detect password/passphrase prompts (we don't support these — key-only auth).
 */
export function detectAuthPrompt(output: string): boolean {
  return /password:|passphrase for key/i.test(output)
}

/**
 * Detect sftp ready prompt (sftp>)
 */
export function detectSftpPrompt(output: string): boolean {
  return /sftp>\s*$/.test(output)
}

/**
 * Parse transfer progress from sftp output.
 * sftp uses \r to overwrite progress lines:
 *   filename.txt  45%   12MB   3.2MB/s   00:05
 */
export function parseTransferProgress(line: string): Partial<TransferProgress> | null {
  const match = line.match(
    /^(.+?)\s+(\d+)%\s+(\S+)\s+(\S+\/s)\s+(\S+)\s*$/
  )
  if (!match) return null

  const [, filename, percentStr, transferred, speed, eta] = match

  return {
    filename: filename.trim(),
    percent: parseInt(percentStr, 10),
    speed,
    eta
  }
}

/**
 * Detect connection errors in sftp output.
 */
export function detectConnectionError(output: string): string | null {
  const errorPatterns = [
    /Connection refused/i,
    /Connection timed out/i,
    /No route to host/i,
    /Could not resolve hostname/i,
    /Permission denied/i,
    /Connection closed/i,
    /Connection reset/i,
    /Host key verification failed/i
  ]

  for (const pattern of errorPatterns) {
    const match = output.match(pattern)
    if (match) return match[0]
  }

  return null
}
