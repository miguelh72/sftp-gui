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
    Promise.all([api.localDrives(), api.localHome()]).then(([d, home]) => {
      setDrives(d)
      navigateLocal(home)
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
    setLocalEntries([])
    setLocalCwd(path)
    cwdRef.current = path
    setError(null)
    try {
      const entries = await api.localLs(path)
      setLocalEntries(entries)
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
