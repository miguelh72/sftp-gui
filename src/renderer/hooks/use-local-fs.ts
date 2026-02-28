import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import type { LocalFileEntry } from '../types'

export function useLocalFs() {
  const [localCwd, setLocalCwd] = useState('')
  const [localEntries, setLocalEntries] = useState<LocalFileEntry[]>([])
  const [localLoading, setLocalLoading] = useState(false)
  const [drives, setDrives] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const cwdRef = useRef('')
  const pollingRef = useRef(false)

  useEffect(() => {
    api.localDrives().then((d) => {
      setDrives(d)
      const initial = d.includes('C:\\') ? 'C:\\' : d[0] || 'C:\\'
      navigateLocal(initial)
    })
  }, [])

  // Auto-refresh every 1s
  useEffect(() => {
    if (!cwdRef.current) return

    const interval = setInterval(async () => {
      if (pollingRef.current || !cwdRef.current) return
      pollingRef.current = true
      try {
        const entries = await api.localLs(cwdRef.current)
        setLocalEntries(entries)
      } catch {
        // Silent fail on polling — don't spam errors
      } finally {
        pollingRef.current = false
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [localCwd])

  const navigateLocal = useCallback(async (path: string) => {
    setLocalLoading(true)
    setError(null)
    try {
      const entries = await api.localLs(path)
      setLocalEntries(entries)
      setLocalCwd(path)
      cwdRef.current = path
    } catch (err) {
      setError(String(err))
    } finally {
      setLocalLoading(false)
    }
  }, [])

  const refreshLocal = useCallback(async () => {
    if (cwdRef.current) await navigateLocal(cwdRef.current)
  }, [navigateLocal])

  return {
    localCwd,
    localEntries,
    localLoading,
    drives,
    error,
    setError,
    navigateLocal,
    refreshLocal
  }
}
