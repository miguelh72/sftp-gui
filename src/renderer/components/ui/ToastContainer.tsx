import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertCircle, Info, CheckCircle } from 'lucide-react'
import type { Toast } from '../../hooks/use-toasts'

interface Props {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

const icons = {
  error: <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />,
  info: <Info className="h-4 w-4 text-blue-400 shrink-0" />,
  success: <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
}

const borders = {
  error: 'border-red-500/30 bg-red-500/5',
  info: 'border-blue-500/30 bg-blue-500/5',
  success: 'border-green-500/30 bg-green-500/5'
}

export function ToastContainer({ toasts, onDismiss }: Props) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${borders[toast.type]}`}
          >
            {icons[toast.type]}
            <span className="flex-1 text-foreground">{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
