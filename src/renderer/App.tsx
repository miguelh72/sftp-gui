import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from './lib/api'
import { ConnectionScreen } from './components/connection/ConnectionScreen'
import { FileBrowser } from './components/browser/FileBrowser'
import { ToastContainer } from './components/ui/ToastContainer'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { OverwriteDialog } from './components/ui/OverwriteDialog'
import { FailedFilesModal } from './components/transfers/FailedFilesModal'
import { useSftp } from './hooks/use-sftp'
import { useLocalFs } from './hooks/use-local-fs'
import { useTransfers } from './hooks/use-transfers'
import { useToasts } from './hooks/use-toasts'
import type { TransferProgress } from './types'

interface DeleteItem {
  path: string
  name: string
  isDirectory: boolean
}

interface PendingDelete {
  items: DeleteItem[]
  side: 'local' | 'remote'
}

interface PendingTransfer {
  direction: 'upload' | 'download'
  sourcePath: string
  destDir: string
  filename: string
  conflicts: string[]
}

interface MultiTransferItem {
  sourcePath: string
  destDir: string
  filename: string
  isDirectory: boolean
}

interface PendingMultiTransfer {
  direction: 'upload' | 'download'
  items: MultiTransferItem[]
  conflicts: Array<{ filename: string; conflicts: string[] }>
}

function isDuplicateTransfer(
  sourcePath: string,
  direction: 'upload' | 'download',
  transfers: Array<{ sourcePath?: string; direction: string; status: string }>
): boolean {
  return transfers.some(
    t => t.sourcePath === sourcePath && t.direction === direction && (t.status === 'active' || t.status === 'queued')
  )
}

export default function App() {
  const sftp = useSftp()
  const local = useLocalFs()
  const xfer = useTransfers()
  const { toasts, addToast, dismissToast } = useToasts()

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null)
  const [pendingMultiTransfer, setPendingMultiTransfer] = useState<PendingMultiTransfer | null>(null)
  const [failureModalTransfer, setFailureModalTransfer] = useState<TransferProgress | null>(null)

  // Track which transfer IDs we've already shown failure toasts for
  const shownFailureToasts = useRef<Set<string>>(new Set())

  // Show toasts for transfer failures
  useEffect(() => {
    for (const t of xfer.transfers) {
      if (shownFailureToasts.current.has(t.id)) continue

      if (t.status === 'completed' && t.failedFiles && t.failedFiles.length > 0) {
        // Folder transfer with some files failed
        shownFailureToasts.current.add(t.id)
        addToast(`${t.failedFiles.length} file(s) failed in "${t.filename}" — click the transfer for details`, 'error', true)
      } else if (t.status === 'failed' && t.isFolder && t.failedFiles && t.failedFiles.length > 0) {
        // Folder transfer where ALL files failed
        shownFailureToasts.current.add(t.id)
        addToast(`All files failed in "${t.filename}" — click the transfer for details`, 'error', true)
      } else if (t.status === 'failed' && !t.isFolder && t.error) {
        // Single file transfer failed
        shownFailureToasts.current.add(t.id)
        addToast(`Transfer failed: ${t.error}`, 'error')
      }
    }
  }, [xfer.transfers, addToast])

  const handleViewFailures = useCallback((id: string) => {
    const transfer = xfer.transfers.find(t => t.id === id)
    if (transfer?.failedFiles && transfer.failedFiles.length > 0) {
      setFailureModalTransfer(transfer)
    }
  }, [xfer.transfers])

  const handleRetryFailed = useCallback((transfer: TransferProgress) => {
    if (!transfer.failedFiles || transfer.failedFiles.length === 0) return
    api.transferRetryFailed(transfer.id)
  }, [])

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

  const handleDeleteLocal = useCallback((items: DeleteItem[]) => {
    setPendingDelete({ items, side: 'local' })
  }, [])

  const handleDeleteRemote = useCallback((items: DeleteItem[]) => {
    setPendingDelete({ items, side: 'remote' })
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return
    const { items, side } = pendingDelete
    setPendingDelete(null)
    const errors: string[] = []
    for (const item of items) {
      try {
        if (side === 'local') {
          await api.localDelete(item.path)
        } else {
          if (item.isDirectory) {
            await api.remoteRmdir(item.path)
          } else {
            await api.remoteRm(item.path)
          }
        }
      } catch (err) {
        errors.push(`${item.name}: ${err}`)
      }
    }
    if (side === 'local') local.refreshLocal()
    else sftp.refreshRemote()
    if (errors.length > 0) {
      addToast(errors.join('\n'), 'error')
    }
  }, [pendingDelete, local.refreshLocal, sftp.refreshRemote, addToast])

  // --- Single Transfer handlers (overwrite check) ---

  const handleDownload = useCallback(async (remotePath: string, localPath: string, filename: string) => {
    if (isDuplicateTransfer(remotePath, 'download', xfer.transfers)) {
      addToast('1 file already transferring, skipped', 'info')
      return
    }
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
  }, [xfer.download, xfer.activeCount, xfer.transfers, addToast])

  const handleUpload = useCallback(async (localPath: string, remotePath: string, filename: string) => {
    if (isDuplicateTransfer(localPath, 'upload', xfer.transfers)) {
      addToast('1 file already transferring, skipped', 'info')
      return
    }
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
  }, [xfer.upload, xfer.activeCount, xfer.transfers, addToast])

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

  // --- Multi Transfer handlers ---

  const handleDownloadMulti = useCallback(async (items: MultiTransferItem[]) => {
    // Dedup: filter out items already transferring
    const toEnqueue: MultiTransferItem[] = []
    let skippedCount = 0
    for (const item of items) {
      if (isDuplicateTransfer(item.sourcePath, 'download', xfer.transfers)) {
        skippedCount++
      } else {
        toEnqueue.push(item)
      }
    }
    if (skippedCount > 0) {
      addToast(`${skippedCount} file${skippedCount > 1 ? 's' : ''} already transferring, skipped`, 'info')
    }
    if (toEnqueue.length === 0) return

    // Batch conflict check
    try {
      const results = await api.checkTransferConflictsBatch(
        'download',
        toEnqueue.map(i => ({ sourcePath: i.sourcePath, destDir: i.destDir, filename: i.filename }))
      )
      const allConflicts = results.filter(r => r.conflicts.length > 0)
      if (allConflicts.length > 0) {
        setPendingMultiTransfer({ direction: 'download', items: toEnqueue, conflicts: allConflicts })
      } else {
        for (const item of toEnqueue) {
          xfer.download(item.sourcePath, item.destDir, item.filename)
        }
      }
    } catch {
      // Conflict check failed — enqueue anyway
      for (const item of toEnqueue) {
        xfer.download(item.sourcePath, item.destDir, item.filename)
      }
    }
  }, [xfer.transfers, xfer.download, addToast])

  const handleUploadMulti = useCallback(async (items: MultiTransferItem[]) => {
    const toEnqueue: MultiTransferItem[] = []
    let skippedCount = 0
    for (const item of items) {
      if (isDuplicateTransfer(item.sourcePath, 'upload', xfer.transfers)) {
        skippedCount++
      } else {
        toEnqueue.push(item)
      }
    }
    if (skippedCount > 0) {
      addToast(`${skippedCount} file${skippedCount > 1 ? 's' : ''} already transferring, skipped`, 'info')
    }
    if (toEnqueue.length === 0) return

    try {
      const results = await api.checkTransferConflictsBatch(
        'upload',
        toEnqueue.map(i => ({ sourcePath: i.sourcePath, destDir: i.destDir, filename: i.filename }))
      )
      const allConflicts = results.filter(r => r.conflicts.length > 0)
      if (allConflicts.length > 0) {
        setPendingMultiTransfer({ direction: 'upload', items: toEnqueue, conflicts: allConflicts })
      } else {
        for (const item of toEnqueue) {
          xfer.upload(item.sourcePath, item.destDir, item.filename)
        }
      }
    } catch {
      for (const item of toEnqueue) {
        xfer.upload(item.sourcePath, item.destDir, item.filename)
      }
    }
  }, [xfer.transfers, xfer.upload, addToast])

  const confirmMultiTransfer = useCallback(() => {
    if (!pendingMultiTransfer) return
    const { direction, items } = pendingMultiTransfer
    setPendingMultiTransfer(null)
    for (const item of items) {
      if (direction === 'download') {
        xfer.download(item.sourcePath, item.destDir, item.filename)
      } else {
        xfer.upload(item.sourcePath, item.destDir, item.filename)
      }
    }
  }, [pendingMultiTransfer, xfer.download, xfer.upload])

  const skipMultiTransfer = useCallback(() => {
    if (!pendingMultiTransfer) return
    const { direction, items, conflicts } = pendingMultiTransfer
    setPendingMultiTransfer(null)

    // Build a set of filenames that are fully conflicting (single-file conflicts)
    const conflictMap = new Map(conflicts.map(c => [c.filename, c.conflicts]))

    for (const item of items) {
      const itemConflicts = conflictMap.get(item.filename)
      if (!itemConflicts || itemConflicts.length === 0) {
        // No conflicts — enqueue normally
        if (direction === 'download') {
          xfer.download(item.sourcePath, item.destDir, item.filename)
        } else {
          xfer.upload(item.sourcePath, item.destDir, item.filename)
        }
      } else {
        // Has conflicts — check if it's a single-file conflict (skip entirely) or directory with partial conflicts (pass skipFiles)
        const isSingleFile = itemConflicts.length === 1 && !itemConflicts[0].includes('/')
        if (isSingleFile) {
          // Skip entirely — don't transfer this item
          continue
        }
        // Directory with conflicts — pass skipFiles
        if (direction === 'download') {
          xfer.download(item.sourcePath, item.destDir, item.filename, itemConflicts)
        } else {
          xfer.upload(item.sourcePath, item.destDir, item.filename, itemConflicts)
        }
      }
    }
  }, [pendingMultiTransfer, xfer.download, xfer.upload])

  // Determine which overwrite dialog to show
  const showingSingleOverwrite = !!pendingTransfer && !pendingMultiTransfer
  const showingMultiOverwrite = !!pendingMultiTransfer

  const aggregatedMultiConflicts = pendingMultiTransfer
    ? pendingMultiTransfer.conflicts.flatMap(c => c.conflicts)
    : []

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
        onDownloadMulti={handleDownloadMulti}
        onUploadMulti={handleUploadMulti}
        onCancelTransfer={xfer.cancel}
        onClearCompleted={xfer.clearCompleted}
        onViewFailures={handleViewFailures}
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
        message={pendingDelete
          ? pendingDelete.items.length === 1
            ? `Delete "${pendingDelete.items[0].name}"? This cannot be undone.`
            : `Delete ${pendingDelete.items.length} items? This cannot be undone.`
          : ''}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* Single Transfer Overwrite Confirmation */}
      <OverwriteDialog
        open={showingSingleOverwrite}
        filename={pendingTransfer?.filename ?? ''}
        conflicts={pendingTransfer?.conflicts ?? []}
        onConfirm={confirmTransfer}
        onSkip={skipTransfer}
        onCancel={() => setPendingTransfer(null)}
      />

      {/* Multi Transfer Overwrite Confirmation */}
      <OverwriteDialog
        open={showingMultiOverwrite}
        filename={pendingMultiTransfer?.items[0]?.filename ?? ''}
        itemCount={pendingMultiTransfer?.items.length}
        conflicts={aggregatedMultiConflicts}
        onConfirm={confirmMultiTransfer}
        onSkip={skipMultiTransfer}
        onCancel={() => setPendingMultiTransfer(null)}
      />

      <FailedFilesModal
        open={!!failureModalTransfer}
        transfer={failureModalTransfer}
        onRetry={handleRetryFailed}
        onClose={() => setFailureModalTransfer(null)}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
