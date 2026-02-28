import { useEffect } from 'react'
import { ConnectionScreen } from './components/connection/ConnectionScreen'
import { FileBrowser } from './components/browser/FileBrowser'
import { ToastContainer } from './components/ui/ToastContainer'
import { useSftp } from './hooks/use-sftp'
import { useLocalFs } from './hooks/use-local-fs'
import { useTransfers } from './hooks/use-transfers'
import { useToasts } from './hooks/use-toasts'

export default function App() {
  const sftp = useSftp()
  const local = useLocalFs()
  const xfer = useTransfers()
  const { toasts, addToast, dismissToast } = useToasts()

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
        transfers={xfer.transfers}
        onDownload={xfer.download}
        onUpload={xfer.upload}
        onCancelTransfer={xfer.cancel}
        onClearCompleted={xfer.clearCompleted}
        activeTransferCount={xfer.activeCount}
        disconnectedUnexpectedly={sftp.disconnectedUnexpectedly}
        lastHost={sftp.lastConfig?.host ?? null}
        reconnecting={sftp.connecting}
        onReconnect={sftp.reconnect}
        onDismissReconnect={sftp.dismissReconnect}
      />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
