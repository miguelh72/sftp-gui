import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import * as pty from 'node-pty'
import stripAnsi from 'strip-ansi'
import { findSftpBinary } from './binary-finder'
import {
  detectHostKeyPrompt,
  detectAuthPrompt,
  detectSftpPrompt,
  detectConnectionError,
  parseLsOutput,
  parseTransferProgress
} from './output-parser'
import type { ConnectionConfig, RemoteFileEntry, SftpCommand, TransferProgress } from './types'

// In a pty, Enter sends \r on Windows (conpty) and \n on Unix
const EOL = process.platform === 'win32' ? '\r' : '\n'

export class SftpSession extends EventEmitter {
  private ptyProcess: pty.IPty | null = null
  private buffer = ''
  private commandQueue: SftpCommand[] = []
  private currentCommand: SftpCommand | null = null
  private connected = false
  private connecting = false
  private binaryPath: string

  constructor() {
    super()
    const binary = findSftpBinary()
    if (!binary) throw new Error('sftp.exe not found on system')
    this.binaryPath = binary
  }

  get isConnected(): boolean {
    return this.connected
  }

  private static readonly SAFE_HOST = /^[a-zA-Z0-9._\-:[\]]+$/
  private static readonly SAFE_USER = /^[a-zA-Z0-9._\-]+$/

  async connect(config: ConnectionConfig): Promise<void> {
    if (this.connected || this.connecting) {
      throw new Error('Already connected or connecting')
    }

    // Validate host and username to prevent argument injection
    if (!SftpSession.SAFE_HOST.test(config.host)) {
      throw new Error('Invalid hostname: contains disallowed characters')
    }
    if (!SftpSession.SAFE_USER.test(config.username)) {
      throw new Error('Invalid username: contains disallowed characters')
    }
    if (config.port < 1 || config.port > 65535) {
      throw new Error('Invalid port number')
    }

    this.connecting = true
    this.buffer = ''

    const args: string[] = []
    if (config.port !== 22) {
      args.push('-P', String(config.port))
    }
    args.push(`${config.username}@${config.host}`)

    return new Promise<void>((resolve, reject) => {
      try {
        this.ptyProcess = pty.spawn(this.binaryPath, args, {
          name: 'xterm',
          cols: 500,
          rows: 30,
          env: {
            ...process.env,
            LC_ALL: 'C',
            LANG: 'C'
          } as Record<string, string>
        })
      } catch (err) {
        this.connecting = false
        reject(new Error(`Failed to spawn sftp: ${err}`))
        return
      }

      let connectTimeout = setTimeout(() => {
        this.connecting = false
        this.kill()
        reject(new Error('Connection timed out'))
      }, 30000)

      // Store the disposable so we can remove this listener once connected
      let settled = false
      const connectDisposable = this.ptyProcess.onData((data: string): void => {
        const clean = stripAnsi(data)
        this.buffer += clean

        // Check for host key prompt
        const hostKeyPrompt = detectHostKeyPrompt(this.buffer)
        if (hostKeyPrompt) {
          this.emit('host-key-prompt', hostKeyPrompt)
          return
        }

        // Check for auth prompt (unsupported)
        if (detectAuthPrompt(this.buffer)) {
          if (settled) return
          settled = true
          clearTimeout(connectTimeout)
          this.connecting = false
          this.kill()
          reject(new Error('Password authentication not supported. Use SSH key-based auth via ssh-agent.'))
          return
        }

        // Check for connection errors
        const error = detectConnectionError(this.buffer)
        if (error) {
          if (settled) return
          settled = true
          clearTimeout(connectTimeout)
          this.connecting = false
          this.kill()
          reject(new Error(error))
          return
        }

        // Check for sftp prompt (connected!)
        if (detectSftpPrompt(this.buffer)) {
          if (settled) return
          settled = true
          clearTimeout(connectTimeout)
          this.connecting = false
          this.connected = true
          this.buffer = ''

          // Dispose the connection listener BEFORE registering handleData
          connectDisposable.dispose()

          this.emit('connected')
          resolve()

          // Set up ongoing data handling (now the only listener)
          this.ptyProcess!.onData(this.handleData.bind(this))
          return
        }
      })

      this.ptyProcess.onExit(({ exitCode }) => {
        clearTimeout(connectTimeout)
        this.connected = false
        this.connecting = false
        this.ptyProcess = null

        // Reject pending commands
        if (this.currentCommand) {
          this.currentCommand.reject(new Error('Connection closed'))
          this.currentCommand = null
        }
        for (const cmd of this.commandQueue) {
          cmd.reject(new Error('Connection closed'))
        }
        this.commandQueue = []

        this.emit('disconnected', exitCode)
      })
    })
  }

  respondToHostKey(accept: boolean): void {
    if (!this.ptyProcess) return
    this.ptyProcess.write(accept ? `yes${EOL}` : `no${EOL}`)
    if (!accept) {
      this.kill()
    }
    this.buffer = ''
  }

  private handleData(data: string): void {
    const clean = stripAnsi(data)

    // Check for transfer progress (\r-overwritten lines)
    if (data.includes('\r') && !data.includes('\n')) {
      const progress = parseTransferProgress(clean.trim())
      if (progress) {
        this.emit('transfer-progress', progress)
        return
      }
    }

    // Normalize \r\n to \n (conpty on Windows produces \r\n)
    this.buffer += clean.replace(/\r\n/g, '\n').replace(/\r/g, '')

    // Check if current command's sentinel appeared in the command output.
    // The sentinel appears twice in the buffer:
    //   1. Input echo: "!echo __DONE_xxx__" (part of the command we typed)
    //   2. Command output: "__DONE_xxx__" (the actual echo result)
    // We find the output occurrence: sentinel preceded by \n (start of line).
    if (this.currentCommand) {
      const sentinel = this.currentCommand.sentinel
      const outputMarker = '\n' + sentinel
      const markerIdx = this.buffer.indexOf(outputMarker)
      if (markerIdx !== -1) {
        const output = this.buffer.substring(0, markerIdx)
        this.buffer = this.buffer.substring(markerIdx + 1 + sentinel.length)

        const cleanOutput = this.cleanCommandOutput(output, this.currentCommand.command)
        this.currentCommand.resolve(cleanOutput)
        this.currentCommand = null
        this.processQueue()
      }
    }

    // Check for disconnection
    if (detectConnectionError(clean)) {
      this.connected = false
      this.emit('disconnected', -1)
    }
  }

  private cleanCommandOutput(output: string, command: string): string {
    const lines = output.split('\n')
    const cleaned: string[] = []

    for (const line of lines) {
      // Strip any stray \r from conpty
      const trimmed = line.replace(/\r/g, '').trim()
      // Strip leading sftp prompt for comparison
      const stripped = trimmed.replace(/^(sftp>\s*)+/, '')
      // Skip any line containing a sentinel echo command
      if (/!echo .*__DONE_/.test(trimmed)) continue
      // Skip command echo (with or without sftp prompt prefix)
      if (stripped === command) continue
      // Skip bare sftp prompt lines
      if (stripped === '') continue
      cleaned.push(trimmed)
    }

    return cleaned.join('\n').trim()
  }

  async execute(command: string): Promise<string> {
    if (!this.connected || !this.ptyProcess) {
      throw new Error('Not connected')
    }

    return new Promise<string>((resolve, reject) => {
      const sentinel = `__DONE_${uuidv4()}__`
      this.commandQueue.push({ command, resolve, reject, sentinel })
      this.processQueue()
    })
  }

  private processQueue(): void {
    if (this.currentCommand || this.commandQueue.length === 0) return
    if (!this.ptyProcess) return

    this.currentCommand = this.commandQueue.shift()!
    this.buffer = ''

    // Send command then sentinel — use EOL (\r on Windows, \n on Unix)
    this.ptyProcess.write(`${this.currentCommand.command}${EOL}`)
    this.ptyProcess.write(`!echo ${this.currentCommand.sentinel}${EOL}`)
  }

  async listDirectory(remotePath: string): Promise<RemoteFileEntry[]> {
    const output = await this.execute(`ls -la ${this.escapePath(remotePath)}`)
    return parseLsOutput(output)
  }

  async pwd(): Promise<string> {
    const output = await this.execute('pwd')
    return output.trim().replace(/^Remote working directory:\s*/, '')
  }

  async cd(remotePath: string): Promise<void> {
    await this.execute(`cd ${this.escapePath(remotePath)}`)
  }

  async mkdir(remotePath: string): Promise<void> {
    await this.execute(`mkdir ${this.escapePath(remotePath)}`)
  }

  async rm(remotePath: string): Promise<void> {
    await this.execute(`rm ${this.escapePath(remotePath)}`)
  }

  async rmdir(remotePath: string): Promise<void> {
    // sftp has no recursive delete — manually recurse
    const entries = await this.listDirectory(remotePath)
    for (const entry of entries) {
      const childPath = remotePath.endsWith('/')
        ? remotePath + entry.name
        : remotePath + '/' + entry.name
      if (entry.isDirectory) {
        await this.rmdir(childPath)
      } else {
        await this.rm(childPath)
      }
    }
    await this.execute(`rmdir ${this.escapePath(remotePath)}`)
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.execute(`rename ${this.escapePath(oldPath)} ${this.escapePath(newPath)}`)
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    await this.execute(`get -r ${this.escapePath(remotePath)} ${this.escapePath(localPath)}`)
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    await this.execute(`put -r ${this.escapePath(localPath)} ${this.escapePath(remotePath)}`)
  }

  private escapePath(p: string): string {
    // Reject paths with control characters (newlines, null bytes, etc.)
    // to prevent command injection via crafted filenames
    if (/[\x00-\x1f\x7f]/.test(p)) {
      throw new Error(`Path contains invalid control characters: ${JSON.stringify(p)}`)
    }
    // Escape backslashes and double quotes, then always wrap in double quotes
    const escaped = p.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return `"${escaped}"`
  }

  disconnect(): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(`exit${EOL}`)
    }
  }

  kill(): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill()
      this.ptyProcess = null
    }
    this.connected = false
    this.connecting = false
  }
}
