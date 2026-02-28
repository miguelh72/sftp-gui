import { motion } from 'framer-motion'
import { WifiOff, RefreshCw, X, Loader2 } from 'lucide-react'

interface Props {
  host: string
  reconnecting: boolean
  onReconnect: () => void
  onDismiss: () => void
}

export function ReconnectBanner({ host, reconnecting, onReconnect, onDismiss }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border-b border-red-500/20 text-sm"
    >
      <WifiOff className="h-4 w-4 text-red-400 shrink-0" />
      <span className="flex-1 text-red-300">
        Connection to <span className="font-medium text-red-200">{host}</span> was lost.
      </span>
      <button
        onClick={onReconnect}
        disabled={reconnecting}
        className="flex items-center gap-1.5 rounded-md bg-red-500/20 px-3 py-1 text-xs font-medium text-red-200 hover:bg-red-500/30 transition-colors disabled:opacity-50"
      >
        {reconnecting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="h-3 w-3" />
        )}
        Reconnect
      </button>
      <button
        onClick={onDismiss}
        className="text-red-400 hover:text-red-300 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}
