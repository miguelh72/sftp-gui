import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import type { RemoteFileEntry, HostInfo, ConnectionConfig, SftpInfo } from '../types'

export function useSftp() {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [remoteCwd, setRemoteCwd] = useState('/')
  const [remoteEntries, setRemoteEntries] = useState<RemoteFileEntry[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hostKeyPrompt, setHostKeyPrompt] = useState<string | null>(null)
  const [hosts, setHosts] = useState<HostInfo[]>([])
  const [sftpInfo, setSftpInfo] = useState<SftpInfo | null>(null)
  const [disconnectedUnexpectedly, setDisconnectedUnexpectedly] = useState(false)
  const [lastConfig, setLastConfig] = useState<ConnectionConfig | null>(null)
  const cwdRef = useRef('/')
  const connectedRef = useRef(false)
  const pollingRef = useRef(false)
  const intentionalDisconnectRef = useRef(false)

  useEffect(() => {
    api.getHosts().then(setHosts)
    api.getSftpInfo().then(setSftpInfo)

    const unsubHostKey = api.onHostKeyPrompt((prompt) => {
      setHostKeyPrompt(prompt)
    })

    const unsubDisconnect = api.onDisconnected(() => {
      const wasIntentional = intentionalDisconnectRef.current
      intentionalDisconnectRef.current = false
      setConnected(false)
      connectedRef.current = false
      setRemoteEntries([])
      setRemoteCwd('/')
      cwdRef.current = '/'
      if (!wasIntentional) {
        setDisconnectedUnexpectedly(true)
      }
    })

    return () => {
      unsubHostKey()
      unsubDisconnect()
    }
  }, [])

  // Auto-refresh remote pane every 1s while connected
  useEffect(() => {
    if (!connected) return

    const interval = setInterval(async () => {
      if (pollingRef.current || !connectedRef.current || !cwdRef.current) return
      pollingRef.current = true
      try {
        const entries = await api.remoteLs(cwdRef.current)
        if (entries) setRemoteEntries(entries)
      } catch {
        // Silent fail on polling
      } finally {
        pollingRef.current = false
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [connected])

  const connect = useCallback(async (config: ConnectionConfig) => {
    setConnecting(true)
    setError(null)
    setDisconnectedUnexpectedly(false)
    try {
      const result = await api.connect(config)
      setConnected(true)
      connectedRef.current = true
      setLastConfig(config)
      setRemoteCwd(result.cwd)
      cwdRef.current = result.cwd
      await refreshRemoteInner(result.cwd)
    } catch (err) {
      setError(String(err))
    } finally {
      setConnecting(false)
    }
  }, [])

  const respondHostKey = useCallback(async (accept: boolean) => {
    setHostKeyPrompt(null)
    await api.respondHostKey(accept)
  }, [])

  const disconnect = useCallback(async () => {
    intentionalDisconnectRef.current = true
    await api.disconnect()
    setConnected(false)
    connectedRef.current = false
    setRemoteEntries([])
    setRemoteCwd('/')
    cwdRef.current = '/'
    setDisconnectedUnexpectedly(false)
  }, [])

  const dismissReconnect = useCallback(() => {
    setDisconnectedUnexpectedly(false)
    setLastConfig(null)
  }, [])

  const reconnect = useCallback(async () => {
    if (lastConfig) {
      await connect(lastConfig)
    }
  }, [lastConfig, connect])

  const refreshRemoteInner = useCallback(async (path: string) => {
    setRemoteLoading(true)
    try {
      const entries = await api.remoteLs(path)
      if (entries) {
        setRemoteEntries(entries)
        setRemoteCwd(path)
        cwdRef.current = path
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setRemoteLoading(false)
    }
  }, [])

  const refreshRemote = useCallback(async (path?: string) => {
    await refreshRemoteInner(path ?? cwdRef.current)
  }, [refreshRemoteInner])

  const navigateRemote = useCallback(async (path: string) => {
    setRemoteLoading(true)
    setRemoteEntries([])
    setRemoteCwd(path)
    cwdRef.current = path
    try {
      const entries = await api.remoteLs(path)
      if (entries) setRemoteEntries(entries)
    } catch (err) {
      setError(String(err))
    } finally {
      setRemoteLoading(false)
    }
  }, [])

  return {
    connected,
    connecting,
    remoteCwd,
    remoteEntries,
    remoteLoading,
    error,
    setError,
    hostKeyPrompt,
    hosts,
    sftpInfo,
    connect,
    respondHostKey,
    disconnect,
    refreshRemote,
    navigateRemote,
    disconnectedUnexpectedly,
    lastConfig,
    reconnect,
    dismissReconnect
  }
}
