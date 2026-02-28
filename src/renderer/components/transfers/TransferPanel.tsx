import { TransferControls } from './TransferControls'
import { TransferRow } from './TransferRow'
import type { TransferProgress } from '../../types'

interface Props {
  transfers: TransferProgress[]
  onCancel: (id: string) => void
  onClearCompleted: () => void
  onClose: () => void
}

export function TransferPanel({ transfers, onCancel, onClearCompleted, onClose }: Props) {
  const activeCount = transfers.filter(t => t.status === 'active' || t.status === 'queued').length

  return (
    <div className="border-t border-border max-h-48 flex flex-col">
      <TransferControls
        activeCount={activeCount}
        totalCount={transfers.length}
        onClearCompleted={onClearCompleted}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto">
        {transfers.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            No transfers
          </div>
        ) : (
          transfers.map(t => (
            <TransferRow key={t.id} transfer={t} onCancel={() => onCancel(t.id)} />
          ))
        )}
      </div>
    </div>
  )
}
