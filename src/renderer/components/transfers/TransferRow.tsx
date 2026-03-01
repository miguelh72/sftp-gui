import { Download, Upload, X, Check, AlertCircle } from 'lucide-react'
import type { TransferProgress } from '../../types'

interface Props {
  transfer: TransferProgress
  onCancel: () => void
}

export function TransferRow({ transfer, onCancel }: Props) {
  const isActive = transfer.status === 'active' || transfer.status === 'queued'
  const isFolderTransfer = !!transfer.isFolder

  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/50 transition-colors">
      {/* Direction icon */}
      {transfer.direction === 'download'
        ? <Download className="h-3.5 w-3.5 text-green-400 shrink-0" />
        : <Upload className="h-3.5 w-3.5 text-blue-400 shrink-0" />
      }

      {/* Source path + current file */}
      <div className="truncate flex-1 min-w-0">
        <span title={transfer.sourcePath}>{transfer.sourcePath ?? transfer.filename}</span>
        {transfer.currentFile && isActive && (
          <span className="text-xs text-muted-foreground ml-2">({transfer.currentFile})</span>
        )}
      </div>

      {/* Progress bar + percent */}
      {isActive && (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${transfer.percent}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{transfer.percent}%</span>
        </div>
      )}

      {/* Status (non-active) */}
      {!isActive && (
        <span className="text-xs text-muted-foreground shrink-0 text-right">
          {transfer.status === 'queued' && 'Queued'}
          {transfer.status === 'completed' && <Check className="h-3.5 w-3.5 text-green-400 inline" />}
          {transfer.status === 'failed' && <AlertCircle className="h-3.5 w-3.5 text-red-400 inline" />}
          {transfer.status === 'cancelled' && 'Cancelled'}
        </span>
      )}

      {/* Speed + ETA */}
      {transfer.status === 'active' && transfer.speed && (
        <span className="text-xs text-muted-foreground shrink-0 text-right tabular-nums">
          {transfer.speed}
          {transfer.eta && ` · ${transfer.eta} left`}
        </span>
      )}

      {/* Cancel */}
      {isActive && (
        <button onClick={onCancel} className="text-muted-foreground hover:text-red-400 transition-colors shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
