import { useState, useCallback, useRef, useEffect } from 'react'
import { LogOut, GripVertical, Settings } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { FilePane, type FilePaneHandle } from './FilePane'
import { TransferPanel } from '../transfers/TransferPanel'
import { ReconnectBanner } from '../ui/ReconnectBanner'
import { SettingsModal } from '../ui/SettingsModal'
import { useSelection } from '../../hooks/use-selection'
import type { LocalFileEntry, RemoteFileEntry, TransferProgress } from '../../types'
import type { DropData } from '../../hooks/use-drag-drop'

function winJoin(base: string, name: string): string {
  return base.endsWith('\\') ? base + name : base + '\\' + name
}

function winDirname(p: string): string {
  if (/^[A-Z]:\\?$/i.test(p)) return p
  const lastSep = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  if (lastSep <= 0) return p
  if (lastSep <= 2 && p[1] === ':') return p.substring(0, 3)
  return p.substring(0, lastSep)
}

function remoteParent(cwd: string): string {
  if (cwd === '/') return '/'
  const parts = cwd.split('/').filter(Boolean)
  parts.pop()
  return '/' + parts.join('/')
}

interface Props {
  localCwd: string
  localEntries: LocalFileEntry[]
  localLoading: boolean
  drives: string[]
  onNavigateLocal: (path: string) => void
  onRefreshLocal: () => void
  remoteCwd: string
  remoteEntries: RemoteFileEntry[]
  remoteLoading: boolean
  onNavigateRemote: (path: string) => void
  onRefreshRemote: () => void
  onDisconnect: () => void
  transfers: TransferProgress[]
  onDeleteLocal: (items: Array<{ path: string; name: string; isDirectory: boolean }>) => void
  onDeleteRemote: (items: Array<{ path: string; name: string; isDirectory: boolean }>) => void
  onDownload: (remotePath: string, localPath: string, filename: string) => void
  onUpload: (localPath: string, remotePath: string, filename: string) => void
  onDownloadMulti: (items: Array<{ sourcePath: string; destDir: string; filename: string; isDirectory: boolean }>) => void
  onUploadMulti: (items: Array<{ sourcePath: string; destDir: string; filename: string; isDirectory: boolean }>) => void
  onCancelTransfer: (id: string) => void
  onClearCompleted: () => void
  activeTransferCount: number
  sessionInfo: { active: number; max: number }
  disconnectedUnexpectedly: boolean
  lastHost: string | null
  reconnecting: boolean
  onReconnect: () => void
  onDismissReconnect: () => void
}

export function FileBrowser({
  localCwd, localEntries, localLoading, drives,
  onNavigateLocal, onRefreshLocal,
  remoteCwd, remoteEntries, remoteLoading,
  onNavigateRemote, onRefreshRemote,
  onDisconnect,
  onDeleteLocal, onDeleteRemote,
  transfers, onDownload, onUpload, onDownloadMulti, onUploadMulti, onCancelTransfer, onClearCompleted, activeTransferCount, sessionInfo,
  disconnectedUnexpectedly, lastHost, reconnecting, onReconnect, onDismissReconnect
}: Props) {
  const [splitPercent, setSplitPercent] = useState(50)
  const [showTransfers, setShowTransfers] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [activePane, setActivePane] = useState<'local' | 'remote'>('local')
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const localPaneRef = useRef<FilePaneHandle>(null)
  const remotePaneRef = useRef<FilePaneHandle>(null)

  const localSel = useSelection()
  const remoteSel = useSelection()

  // Clear selection when cwd changes
  localSel.setCwd(localCwd)
  remoteSel.setCwd(remoteCwd)

  useEffect(() => {
    if (activeTransferCount > 0) setShowTransfers(true)
  }, [activeTransferCount])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't handle when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'F5') {
        e.preventDefault()
        if (activePane === 'local') onRefreshLocal()
        else onRefreshRemote()
      }

      if (e.key === 'Backspace') {
        e.preventDefault()
        if (activePane === 'local') {
          const parent = winDirname(localCwd)
          if (parent !== localCwd) onNavigateLocal(parent)
        } else {
          const parent = remoteParent(remoteCwd)
          if (parent !== remoteCwd) onNavigateRemote(parent)
        }
      }

      if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault()
        if (activePane === 'local') localPaneRef.current?.focusPathInput()
        else remotePaneRef.current?.focusPathInput()
      }

      // Tab to switch panes
      if (e.key === 'Tab' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault()
        setActivePane(prev => prev === 'local' ? 'remote' : 'local')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activePane, localCwd, remoteCwd, onRefreshLocal, onRefreshRemote, onNavigateLocal, onNavigateRemote])

  const handleSplitterMouseDown = useCallback(() => {
    draggingRef.current = true

    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitPercent(Math.max(20, Math.min(80, pct)))
    }

    const onMouseUp = () => {
      draggingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleLocalDrop = useCallback((items: DropData[]) => {
    if (items.length === 1) {
      onDownload(items[0].path, localCwd, items[0].name)
    } else {
      onDownloadMulti(items.map(item => ({
        sourcePath: item.path,
        destDir: localCwd,
        filename: item.name,
        isDirectory: item.isDirectory
      })))
    }
  }, [localCwd, onDownload, onDownloadMulti])

  const handleRemoteDrop = useCallback((items: DropData[]) => {
    if (items.length === 1) {
      onUpload(items[0].path, remoteCwd, items[0].name)
    } else {
      onUploadMulti(items.map(item => ({
        sourcePath: item.path,
        destDir: remoteCwd,
        filename: item.name,
        isDirectory: item.isDirectory
      })))
    }
  }, [remoteCwd, onUpload, onUploadMulti])

  return (
    <div className="flex h-screen flex-col">
      {/* Reconnect Banner */}
      <AnimatePresence>
        {disconnectedUnexpectedly && lastHost && (
          <ReconnectBanner
            host={lastHost}
            reconnecting={reconnecting}
            onReconnect={onReconnect}
            onDismiss={onDismissReconnect}
          />
        )}
      </AnimatePresence>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-border">
        <span className="text-sm text-muted-foreground">
          Connected to <span className="text-foreground font-medium">{remoteCwd}</span>
          <span className="ml-3 text-xs text-zinc-600">
            F5 refresh &middot; Backspace up &middot; Ctrl+L path &middot; Tab switch pane &middot; Ctrl+Click multi-select
          </span>
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDisconnect}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-400 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </button>
        </div>
      </div>

      {/* Panes */}
      <div ref={containerRef} className="flex flex-1 min-h-0">
        <div
          style={{ width: `${splitPercent}%` }}
          className={`border-r border-border ${activePane === 'local' ? 'ring-1 ring-primary/30 ring-inset' : ''}`}
          onClick={() => setActivePane('local')}
        >
          <FilePane
            ref={localPaneRef}
            title="Local"
            type="local"
            cwd={localCwd}
            entries={localEntries}
            loading={localLoading}
            onNavigate={onNavigateLocal}
            onRefresh={onRefreshLocal}
            onDelete={onDeleteLocal}
            onDrop={handleLocalDrop}
            getItemPath={(entry) => entry.path || winJoin(localCwd, entry.name)}
            getParentPath={(cwd) => {
              const parent = winDirname(cwd)
              return parent === cwd ? cwd : parent
            }}
            selectedNames={localSel.selectedNames}
            onSelect={(name, ctrlKey) => ctrlKey ? localSel.toggle(name) : localSel.clear()}
            onClearSelection={localSel.clear}
            onSetAllSelection={localSel.setAll}
          />
        </div>

        {/* Splitter */}
        <div
          className="w-1 cursor-col-resize bg-border hover:bg-primary/50 transition-colors flex items-center justify-center"
          onMouseDown={handleSplitterMouseDown}
        >
          <GripVertical className="h-4 w-4 text-zinc-600 pointer-events-none" />
        </div>

        <div
          style={{ width: `${100 - splitPercent}%` }}
          className={activePane === 'remote' ? 'ring-1 ring-primary/30 ring-inset' : ''}
          onClick={() => setActivePane('remote')}
        >
          <FilePane
            ref={remotePaneRef}
            title="Remote"
            type="remote"
            cwd={remoteCwd}
            entries={remoteEntries}
            loading={remoteLoading}
            onNavigate={onNavigateRemote}
            onRefresh={onRefreshRemote}
            onDelete={onDeleteRemote}
            onDrop={handleRemoteDrop}
            getItemPath={(entry) => {
              return remoteCwd.endsWith('/')
                ? remoteCwd + entry.name
                : remoteCwd + '/' + entry.name
            }}
            getParentPath={remoteParent}
            selectedNames={remoteSel.selectedNames}
            onSelect={(name, ctrlKey) => ctrlKey ? remoteSel.toggle(name) : remoteSel.clear()}
            onClearSelection={remoteSel.clear}
            onSetAllSelection={remoteSel.setAll}
          />
        </div>
      </div>

      {/* Transfer Panel */}
      {showTransfers && (
        <TransferPanel
          transfers={transfers}
          onCancel={onCancelTransfer}
          onClearCompleted={onClearCompleted}
          onClose={() => setShowTransfers(false)}
          sessionInfo={sessionInfo}
        />
      )}

      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}
