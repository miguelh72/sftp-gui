import { Trash2 } from 'lucide-react'
import { Modal } from './Modal'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }: Props) {
  return (
    <Modal open={open} onClose={onCancel}>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Trash2 className="h-5 w-5 text-red-400 shrink-0" />
          <h3 className="font-semibold text-red-300">{title}</h3>
        </div>

        <p className="text-sm text-muted-foreground">{message}</p>

        <div className="flex gap-3 justify-end pt-1">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
