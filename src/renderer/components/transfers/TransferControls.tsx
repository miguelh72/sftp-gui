import { Trash2, ChevronDown } from 'lucide-react'

interface Props {
  activeCount: number
  totalCount: number
  sessionInfo: { active: number; max: number }
  onClearCompleted: () => void
  onClose: () => void
}

export function TransferControls({ activeCount, totalCount, sessionInfo, onClearCompleted, onClose }: Props) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-border">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Transfers {activeCount > 0 && `(${activeCount} active)`}
        </span>
        {sessionInfo.active > 0 && (
          <span className="text-xs text-zinc-500">
            Sessions: {sessionInfo.active}/{sessionInfo.max}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {totalCount > activeCount && (
          <button
            onClick={onClearCompleted}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Clear completed"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
