import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import type { TransferProgress } from '../types'

export function useTransfers() {
  const [transfers, setTransfers] = useState<TransferProgress[]>([])
  const [sessionInfo, setSessionInfo] = useState<{ active: number; max: number }>({ active: 0, max: 6 })

  useEffect(() => {
    const unsub = api.onTransferUpdate((data) => {
      setTransfers(prev => {
        const idx = prev.findIndex(t => t.id === data.id)
        if (idx === -1) return [...prev, data]
        const updated = [...prev]
        updated[idx] = data
        return updated
      })
    })

    return () => { unsub() }
  }, [])

  useEffect(() => {
    const unsub = api.onTransferSessionInfo((info) => {
      setSessionInfo(info)
    })

    return () => { unsub() }
  }, [])

  const download = useCallback(async (remotePath: string, localPath: string, filename: string, skipFiles?: string[]) => {
    return api.transferDownload(remotePath, localPath, filename, skipFiles)
  }, [])

  const upload = useCallback(async (localPath: string, remotePath: string, filename: string, skipFiles?: string[]) => {
    return api.transferUpload(localPath, remotePath, filename, skipFiles)
  }, [])

  const cancel = useCallback(async (id: string) => {
    await api.transferCancel(id)
  }, [])

  const clearCompleted = useCallback(() => {
    setTransfers(prev => prev.filter(t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled'))
  }, [])

  const activeCount = transfers.filter(t => t.status === 'active' || t.status === 'queued').length

  return {
    transfers,
    download,
    upload,
    cancel,
    clearCompleted,
    activeCount,
    sessionInfo
  }
}
