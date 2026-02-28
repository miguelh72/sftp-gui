import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Monitor, AlertCircle, Loader2, Terminal } from 'lucide-react'
import { HostList } from './HostList'
import { ConnectionForm } from './ConnectionForm'
import { HostKeyDialog } from './HostKeyDialog'
import type { HostInfo, ConnectionConfig, SftpInfo } from '../../types'

interface Props {
  hosts: HostInfo[]
  sftpInfo: SftpInfo | null
  connecting: boolean
  error: string | null
  hostKeyPrompt: string | null
  onConnect: (config: ConnectionConfig) => void
  onRespondHostKey: (accept: boolean) => void
  onClearError: () => void
}

export function ConnectionScreen({
  hosts,
  sftpInfo,
  connecting,
  error,
  hostKeyPrompt,
  onConnect,
  onRespondHostKey,
  onClearError
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedHost, setSelectedHost] = useState<HostInfo | null>(null)

  const filteredHosts = hosts.filter(h =>
    h.name.toLowerCase().includes(search.toLowerCase()) ||
    h.hostname.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-screen flex-col items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl space-y-6"
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <Terminal className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">SFTP GUI</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            {sftpInfo?.found
              ? `Using ${sftpInfo.path}`
              : 'sftp.exe not found — install OpenSSH'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-red-400"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={onClearError} className="text-red-400 hover:text-red-300 font-medium">
              Dismiss
            </button>
          </motion.div>
        )}

        {/* Host Key Dialog */}
        {hostKeyPrompt && (
          <HostKeyDialog
            prompt={hostKeyPrompt}
            onAccept={() => onRespondHostKey(true)}
            onReject={() => onRespondHostKey(false)}
          />
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Search hosts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        {/* Host List */}
        {filteredHosts.length > 0 && (
          <HostList
            hosts={filteredHosts}
            selectedHost={selectedHost}
            onSelect={setSelectedHost}
          />
        )}

        {/* Connection Form */}
        <ConnectionForm
          selectedHost={selectedHost}
          connecting={connecting}
          disabled={!sftpInfo?.found}
          onConnect={onConnect}
        />
      </motion.div>
    </div>
  )
}
