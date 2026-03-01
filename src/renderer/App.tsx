import { useState, useEffect, useCallback } from 'react'
import { api } from './lib/api'
import { ConnectionScreen } from './components/connection/ConnectionScreen'
import { FileBrowser } from './components/browser/FileBrowser'
import { ToastContainer } from './components/ui/ToastContainer'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { OverwriteDialog } from './components/ui/OverwriteDialog'
import { useSftp } from './hooks/use-sftp'
import { useLocalFs } from './hooks/use-local-fs'
import { useTransfers } from './hooks/use-transfers'
import { useToasts } from './hooks/use-toasts'

interface PendingDelete {
  path: string
  name: string
  isDirectory: boolean
  side: 'local' | 'remote'
}

interface PendingTransfer {
  direction: 'upload' | 'download'
  sourcePath: string
  destDir: string
  filename: string
  conflicts: string[]
}

export default function App() {
  const sftp = useSftp()
  const local = useLocalFs()
  const xfer = useTransfers()
  const { toasts, addToast, dismissToast } = useToasts()

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null)

  // Route errors to toasts
  useEffect(() => {
    if (sftp.error) {
      addToast(sftp.error, 'error')
      sftp.setError(null)
    }
  }, [sftp.error])

  useEffect(() => {
    if (local.error) {
      addToast(local.error, 'error')
      local.setError(null)
    }
  }, [local.error])

  // --- Delete handlers (styled modal instead of native confirm) ---

  const handleDeleteLocal = useCallback((_path: string, name: string, isDirectory: boolean) => {
    setPendingDelete({ path: _path, name, isDirectory, side: 'local' })
  }, [])

  const handleDeleteRemote = useCallback((path: string, name: string, isDirectory: boolean) => {
    setPendingDelete({ path, name, isDirectory, side: 'remote' })
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return
    const { path, name, isDirectory, side } = pendingDelete
    setPendingDelete(null)
    try {
      if (side === 'local') {
        await api.localDelete(path)
        local.refreshLocal()
      } else {
        if (isDirectory) {
          await api.remoteRmdir(path)
        } else {
          await api.remoteRm(path)
        }
        sftp.refreshRemote()
      }
    } catch (err) {
      addToast(String(err), 'error')
    }
  }, [pendingDelete, local.refreshLocal, sftp.refreshRemote, addToast])

  // --- Transfer handlers (overwrite check) ---

  const handleDownload = useCallback(async (remotePath: string, localPath: string, filename: string) => {
    // Skip conflict check when a transfer is already active — the sftp command queue
    // is busy, so the check would block until the current transfer finishes
    if (xfer.activeCount > 0) {
      xfer.download(remotePath, localPath, filename)
      return
    }
    try {
      const conflicts = await api.checkTransferConflicts('download', remotePath, localPath, filename)
      if (conflicts.length > 0) {
        setPendingTransfer({ direction: 'download', sourcePath: remotePath, destDir: localPath, filename, conflicts })
      } else {
        xfer.download(remotePath, localPath, filename)
      }
    } catch {
      xfer.download(remotePath, localPath, filename)
    }
  }, [xfer.download, xfer.activeCount])

  const handleUpload = useCallback(async (localPath: string, remotePath: string, filename: string) => {
    if (xfer.activeCount > 0) {
      xfer.upload(localPath, remotePath, filename)
      return
    }
    try {
      const conflicts = await api.checkTransferConflicts('upload', localPath, remotePath, filename)
      if (conflicts.length > 0) {
        setPendingTransfer({ direction: 'upload', sourcePath: localPath, destDir: remotePath, filename, conflicts })
      } else {
        xfer.upload(localPath, remotePath, filename)
      }
    } catch {
      xfer.upload(localPath, remotePath, filename)
    }
  }, [xfer.upload, xfer.activeCount])

  const confirmTransfer = useCallback(() => {
    if (!pendingTransfer) return
    const { direction, sourcePath, destDir, filename } = pendingTransfer
    setPendingTransfer(null)
    if (direction === 'download') {
      xfer.download(sourcePath, destDir, filename)
    } else {
      xfer.upload(sourcePath, destDir, filename)
    }
  }, [pendingTransfer, xfer.download, xfer.upload])

  const skipTransfer = useCallback(() => {
    if (!pendingTransfer) return
    const { direction, sourcePath, destDir, filename, conflicts } = pendingTransfer
    setPendingTransfer(null)
    // For single-file conflicts, skip is the same as cancel — just don't transfer
    const isSingleFile = conflicts.length === 1 && !conflicts[0].includes('/')
    if (isSingleFile) return
    if (direction === 'download') {
      xfer.download(sourcePath, destDir, filename, conflicts)
    } else {
      xfer.upload(sourcePath, destDir, filename, conflicts)
    }
  }, [pendingTransfer, xfer.download, xfer.upload])

  if (!sftp.connected && !sftp.disconnectedUnexpectedly) {
    return (
      <>
        <ConnectionScreen
          hosts={sftp.hosts}
          sftpInfo={sftp.sftpInfo}
          connecting={sftp.connecting}
          error={null}
          hostKeyPrompt={sftp.hostKeyPrompt}
          onConnect={sftp.connect}
          onRespondHostKey={sftp.respondHostKey}
          onClearError={() => {}}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    )
  }

  return (
    <>
      <FileBrowser
        localCwd={local.localCwd}
        localEntries={local.localEntries}
        localLoading={local.localLoading}
        drives={local.drives}
        onNavigateLocal={local.navigateLocal}
        onRefreshLocal={local.refreshLocal}
        remoteCwd={sftp.remoteCwd}
        remoteEntries={sftp.remoteEntries}
        remoteLoading={sftp.remoteLoading}
        onNavigateRemote={sftp.navigateRemote}
        onRefreshRemote={() => sftp.refreshRemote()}
        onDisconnect={sftp.disconnect}
        onDeleteLocal={handleDeleteLocal}
        onDeleteRemote={handleDeleteRemote}
        transfers={xfer.transfers}
        onDownload={handleDownload}
        onUpload={handleUpload}
        onCancelTransfer={xfer.cancel}
        onClearCompleted={xfer.clearCompleted}
        activeTransferCount={xfer.activeCount}
        sessionInfo={xfer.sessionInfo}
        disconnectedUnexpectedly={sftp.disconnectedUnexpectedly}
        lastHost={sftp.lastConfig?.host ?? null}
        reconnecting={sftp.connecting}
        onReconnect={sftp.reconnect}
        onDismissReconnect={sftp.dismissReconnect}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete"
        message={pendingDelete ? `Delete "${pendingDelete.name}"? This cannot be undone.` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* Transfer Overwrite Confirmation */}
      <OverwriteDialog
        open={!!pendingTransfer}
        filename={pendingTransfer?.filename ?? ''}
        conflicts={pendingTransfer?.conflicts ?? []}
        onConfirm={confirmTransfer}
        onSkip={skipTransfer}
        onCancel={() => setPendingTransfer(null)}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
