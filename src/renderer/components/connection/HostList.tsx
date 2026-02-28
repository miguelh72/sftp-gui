import { motion } from 'framer-motion'
import { HostEntry } from './HostEntry'
import type { HostInfo } from '../../types'

interface Props {
  hosts: HostInfo[]
  selectedHost: HostInfo | null
  onSelect: (host: HostInfo) => void
}

export function HostList({ hosts, selectedHost, onSelect }: Props) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
      {hosts.map((host, i) => (
        <motion.div
          key={`${host.name}-${host.source}`}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.02 }}
        >
          <HostEntry
            host={host}
            selected={selectedHost?.name === host.name}
            onClick={() => onSelect(host)}
          />
        </motion.div>
      ))}
    </div>
  )
}
