import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import SSHConfig from 'ssh-config'
import type { HostInfo } from './types'

export function readSshConfig(): HostInfo[] {
  const hosts: HostInfo[] = []
  const configPath = join(homedir(), '.ssh', 'config')

  if (!existsSync(configPath)) return hosts

  try {
    const content = readFileSync(configPath, 'utf-8')
    const config = SSHConfig.parse(content)

    for (const section of config) {
      if (section.type !== SSHConfig.DIRECTIVE || section.param !== 'Host') continue
      const name = String(section.value)

      // Skip wildcards
      if (name.includes('*') || name.includes('?')) continue

      const hostname = findDirective(section, 'HostName') || name
      const port = parseInt(findDirective(section, 'Port') || '22', 10)
      if (!Number.isInteger(port) || port < 1 || port > 65535) continue
      const user = findDirective(section, 'User') || undefined
      const identityFile = findDirective(section, 'IdentityFile') || undefined

      hosts.push({
        name,
        hostname,
        port,
        user,
        identityFile,
        source: 'ssh-config'
      })
    }
  } catch {
    // Malformed config — skip
  }

  return hosts
}

function findDirective(section: SSHConfig.Line, param: string): string | null {
  if (!('config' in section) || !Array.isArray(section.config)) return null
  for (const line of section.config) {
    if (line.type === SSHConfig.DIRECTIVE && line.param === param) {
      return String(line.value)
    }
  }
  return null
}

export function readKnownHosts(): HostInfo[] {
  const hosts: HostInfo[] = []
  const knownHostsPath = join(homedir(), '.ssh', 'known_hosts')

  if (!existsSync(knownHostsPath)) return hosts

  try {
    const content = readFileSync(knownHostsPath, 'utf-8')
    const seen = new Set<string>()

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      // Skip hashed entries (start with |1|)
      if (trimmed.startsWith('|')) continue

      const hostPart = trimmed.split(/\s+/)[0]
      if (!hostPart) continue

      // Can be comma-separated (e.g., "host,ip")
      for (const entry of hostPart.split(',')) {
        if (entry.startsWith('[')) continue // bracketed IP:port

        const key = entry.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)

        let hostname = entry
        let port = 22

        // Handle [host]:port format
        const bracketMatch = entry.match(/^\[(.+)\]:(\d+)$/)
        if (bracketMatch) {
          hostname = bracketMatch[1]
          port = parseInt(bracketMatch[2], 10)
        }

        hosts.push({
          name: hostname,
          hostname,
          port,
          source: 'known-hosts'
        })
      }
    }
  } catch {
    // Can't read known_hosts — skip
  }

  return hosts
}

export function getAllHosts(): HostInfo[] {
  const configHosts = readSshConfig()
  const knownHosts = readKnownHosts()

  // Merge: ssh-config entries take priority
  const byName = new Map<string, HostInfo>()

  for (const h of configHosts) {
    byName.set(h.name.toLowerCase(), h)
  }

  for (const h of knownHosts) {
    const key = h.name.toLowerCase()
    if (!byName.has(key)) {
      byName.set(key, h)
    }
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
}
