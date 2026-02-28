import { Monitor, Globe, Key } from 'lucide-react'
import type { HostInfo } from '../../types'

interface Props {
  host: HostInfo
  selected: boolean
  onClick: () => void
}

export function HostEntry({ host, selected, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={`
        flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors
        border-b border-border last:border-b-0
        hover:bg-accent
        ${selected ? 'bg-accent' : 'bg-card'}
      `}
    >
      <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{host.name}</div>
        {host.hostname !== host.name && (
          <div className="text-xs text-muted-foreground truncate">{host.hostname}</div>
        )}
      </div>
      {host.user && (
        <span className="text-xs text-muted-foreground">{host.user}</span>
      )}
      {host.port !== 22 && (
        <span className="text-xs text-muted-foreground">:{host.port}</span>
      )}
      <span className={`
        text-[10px] px-1.5 py-0.5 rounded
        ${host.source === 'ssh-config'
          ? 'bg-primary/20 text-primary'
          : 'bg-zinc-700 text-zinc-400'}
      `}>
        {host.source === 'ssh-config' ? 'config' : 'known'}
      </span>
    </button>
  )
}
