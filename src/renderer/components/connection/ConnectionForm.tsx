import { useState, useEffect } from 'react'
import { Loader2, ArrowRight } from 'lucide-react'
import { api } from '../../lib/api'
import type { HostInfo, ConnectionConfig } from '../../types'

interface Props {
  selectedHost: HostInfo | null
  connecting: boolean
  disabled: boolean
  onConnect: (config: ConnectionConfig) => void
}

export function ConnectionForm({ selectedHost, connecting, disabled, onConnect }: Props) {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')

  useEffect(() => {
    if (selectedHost) {
      setHost(selectedHost.hostname)
      setPort(String(selectedHost.port))
      if (selectedHost.user) {
        setUsername(selectedHost.user)
      } else {
        api.getRememberedUser(selectedHost.hostname).then(u => {
          if (u) setUsername(u)
        })
      }
    }
  }, [selectedHost])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!host || !username) return
    onConnect({ host, port: parseInt(port, 10) || 22, username })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-[1fr_80px] gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Host</label>
          <input
            type="text"
            value={host}
            onChange={e => setHost(e.target.value)}
            placeholder="hostname or IP"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Port</label>
          <input
            type="text"
            value={port}
            onChange={e => setPort(e.target.value)}
            placeholder="22"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Username</label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="username"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <button
        type="submit"
        disabled={disabled || connecting || !host || !username}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {connecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            Connect
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  )
}
