import { Modal } from '../ui/Modal'
import { api } from '../../lib/api'
import type { TransferProgress } from '../../types'

interface Props {
  open: boolean
  transfer: TransferProgress | null
  onRetry: (transfer: TransferProgress) => void
  onClose: () => void
}

export function FailedFilesModal({ open, transfer, onRetry, onClose }: Props) {
  if (!transfer || !transfer.failedFiles || transfer.failedFiles.length === 0) return null

  const handleSaveLog = async () => {
    const lines = [
      `Transfer: ${transfer.filename}`,
      `Direction: ${transfer.direction}`,
      `Source: ${transfer.sourcePath ?? 'unknown'}`,
      `Failed files: ${transfer.failedFiles!.length}`,
      '',
      ...transfer.failedFiles!.map(f => `  ${f.name}: ${f.error}`)
    ]
    await api.saveErrorLog(lines.join('\n'))
  }

  const handleRetry = () => {
    onRetry(transfer)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-1">Transfer Failures</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {transfer.failedFiles.length} file{transfer.failedFiles.length > 1 ? 's' : ''} failed in <span className="text-foreground">{transfer.filename}</span>
        </p>

        <div className="max-h-64 overflow-y-auto border border-border rounded-md mb-4">
          {transfer.failedFiles.map((f, i) => (
            <div key={i} className="px-3 py-2 border-b border-border last:border-b-0 text-sm">
              <div className="font-medium text-foreground">{f.name}</div>
              <div className="text-xs text-red-400 mt-0.5">{f.error}</div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={handleSaveLog}
            className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Save Log
          </button>
          <button
            onClick={handleRetry}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/80 transition-colors"
          >
            Retry Failed
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
