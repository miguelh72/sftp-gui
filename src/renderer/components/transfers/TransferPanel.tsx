import { TransferControls } from './TransferControls'
import { TransferRow } from './TransferRow'
import type { TransferProgress } from '../../types'

interface Props {
  transfers: TransferProgress[]
  onCancel: (id: string) => void
  onClearCompleted: () => void
  onClose: () => void
  sessionInfo: { active: number; max: number }
}

export function TransferPanel({ transfers, onCancel, onClearCompleted, onClose, sessionInfo }: Props) {
  const activeCount = transfers.filter(t => t.status === 'active' || t.status === 'queued').length

  return (
    <div className="border-t border-border flex flex-col">
      <TransferControls
        activeCount={activeCount}
        totalCount={transfers.length}
        sessionInfo={sessionInfo}
        onClearCompleted={onClearCompleted}
        onClose={onClose}
      />
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(5 * 2.25rem)' }}>
        {transfers.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
            No transfers
          </div>
        ) : (
          [...transfers].reverse().map(t => (
            <TransferRow key={t.id} transfer={t} onCancel={() => onCancel(t.id)} />
          ))
        )}
      </div>
    </div>
  )
}
