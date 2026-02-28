import { Trash2, ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  activeCount: number
  totalCount: number
  onClearCompleted: () => void
  onClose: () => void
}

export function TransferControls({ activeCount, totalCount, onClearCompleted, onClose }: Props) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-border">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Transfers {activeCount > 0 && `(${activeCount} active)`}
      </span>
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
