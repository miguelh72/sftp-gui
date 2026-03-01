import { useState, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { Modal } from './Modal'
import { api } from '../../lib/api'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  const [maxConcurrent, setMaxConcurrent] = useState(6)
  const [cancelCleanup, setCancelCleanup] = useState<'remove-partial' | 'remove-all'>('remove-partial')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    api.getSettings().then(s => {
      setMaxConcurrent(s.maxConcurrentTransfers)
      setCancelCleanup(s.cancelCleanup)
    })
  }, [open])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.setSettings({ maxConcurrentTransfers: maxConcurrent, cancelCleanup })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-primary shrink-0" />
          <h3 className="font-semibold">Settings</h3>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">
            Max concurrent transfers
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={maxConcurrent}
            onChange={e => {
              const v = parseInt(e.target.value, 10)
              if (v >= 1 && v <= 10) setMaxConcurrent(v)
            }}
            className="w-full rounded-lg border border-border bg-zinc-800 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="text-xs text-zinc-500">
            Number of simultaneous sftp sessions for file transfers (1–10)
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">
            On cancel
          </label>
          <select
            value={cancelCleanup}
            onChange={e => {
              const v = e.target.value
              if (v === 'remove-partial' || v === 'remove-all') setCancelCleanup(v)
            }}
            className="w-full rounded-lg border border-border bg-zinc-800 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="remove-partial">Keep completed files</option>
            <option value="remove-all">Remove all files</option>
          </select>
          <p className="text-xs text-zinc-500">
            When cancelling a folder transfer, keep already-completed files or remove everything
          </p>
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}
