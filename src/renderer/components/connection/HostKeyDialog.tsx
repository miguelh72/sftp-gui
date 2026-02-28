import { motion } from 'framer-motion'
import { ShieldAlert } from 'lucide-react'

interface Props {
  prompt: string
  onAccept: () => void
  onReject: () => void
}

export function HostKeyDialog({ prompt, onAccept, onReject }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-5 space-y-4"
    >
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 text-yellow-500 shrink-0" />
        <h3 className="font-semibold text-yellow-400">Host Key Verification</h3>
      </div>

      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-zinc-900 rounded p-3 max-h-40 overflow-y-auto">
        {prompt}
      </pre>

      <div className="flex gap-3 justify-end">
        <button
          onClick={onReject}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
        >
          Reject
        </button>
        <button
          onClick={onAccept}
          className="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-500 transition-colors"
        >
          Accept & Connect
        </button>
      </div>
    </motion.div>
  )
}
