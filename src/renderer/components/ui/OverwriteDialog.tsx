import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'

interface Props {
  open: boolean
  filename: string
  conflicts: string[]
  itemCount?: number
  onConfirm: () => void
  onSkip: () => void
  onCancel: () => void
}

export function OverwriteDialog({ open, filename, conflicts, itemCount, onConfirm, onSkip, onCancel }: Props) {
  const isMulti = itemCount != null && itemCount > 1

  return (
    <Modal open={open} onClose={onCancel}>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          <h3 className="font-semibold text-amber-300">Overwrite Existing Files?</h3>
        </div>

        <p className="text-sm text-muted-foreground">
          {isMulti ? (
            <>Transferring <span className="text-foreground font-medium">{itemCount} items</span> will overwrite the following {conflicts.length === 1 ? 'file' : `${conflicts.length} files`}:</>
          ) : (
            <>Transferring <span className="text-foreground font-medium">"{filename}"</span> will overwrite the following {conflicts.length === 1 ? 'file' : `${conflicts.length} files`}:</>
          )}
        </p>

        <div className="rounded border border-border bg-zinc-950 max-h-48 overflow-y-auto">
          {conflicts.map((path) => (
            <div key={path} className="px-3 py-1.5 text-xs font-mono text-zinc-400 border-b border-border last:border-b-0">
              {path}
            </div>
          ))}
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSkip}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Skip Existing
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 transition-colors"
          >
            Overwrite
          </button>
        </div>
      </div>
    </Modal>
  )
}
