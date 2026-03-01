import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle, type DragEvent, type MouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Loader2, FolderUp, Trash2 } from 'lucide-react'
import { PathBreadcrumb, type PathBreadcrumbHandle } from './PathBreadcrumb'
import { ColumnHeader } from './ColumnHeader'
import { FileRow } from './FileRow'
import { sortEntries, type SortConfig, type SortField } from '../../lib/sort'
import { useDragDrop, type DropData } from '../../hooks/use-drag-drop'
import { useRubberBand } from '../../hooks/use-rubber-band'

interface FileEntry {
  name: string
  isDirectory: boolean
  size: number
  modified: string
  path?: string
}

interface Props {
  title: string
  type: 'local' | 'remote'
  cwd: string
  entries: FileEntry[]
  loading: boolean
  onNavigate: (path: string) => void
  onRefresh: () => void
  onDelete?: (items: Array<{ path: string; name: string; isDirectory: boolean }>) => void
  onDrop?: (data: DropData[]) => void
  getItemPath: (entry: FileEntry) => string
  getParentPath: (cwd: string) => string
  selectedNames: Set<string>
  onSelect: (name: string, ctrlKey: boolean) => void
  onClearSelection: () => void
  onSetAllSelection: (names: Set<string>) => void
}

export interface FilePaneHandle {
  focusPathInput: () => void
}

export const FilePane = forwardRef<FilePaneHandle, Props>(
  function FilePane({
    title,
    type,
    cwd,
    entries,
    loading,
    onNavigate,
    onRefresh,
    onDelete,
    onDrop,
    getItemPath,
    getParentPath,
    selectedNames,
    onSelect,
    onClearSelection,
    onSetAllSelection
  }, ref) {
    const [sort, setSort] = useState<SortConfig>({ field: 'name', direction: 'asc' })
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entries: FileEntry[] } | null>(null)
    const { isDragOver, handleDragStart, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(type)
    const breadcrumbRef = useRef<PathBreadcrumbHandle>(null)
    const contextMenuRef = useRef<HTMLDivElement>(null)
    const fileListRef = useRef<HTMLDivElement>(null)
    const { isActive: rubberBandActive, style: rubberBandStyle, onMouseDown: rubberBandMouseDown } = useRubberBand(fileListRef, selectedNames, onSetAllSelection)

    // Close context menu on click outside or scroll
    useEffect(() => {
      if (!contextMenu) return
      const close = () => setContextMenu(null)
      window.addEventListener('click', close)
      window.addEventListener('scroll', close, true)
      return () => {
        window.removeEventListener('click', close)
        window.removeEventListener('scroll', close, true)
      }
    }, [contextMenu])

    useImperativeHandle(ref, () => ({
      focusPathInput() {
        breadcrumbRef.current?.focusInput()
      }
    }))

    const sorted = sortEntries(entries, sort)

    const toggleSort = useCallback((field: SortField) => {
      setSort(prev => ({
        field,
        direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
      }))
    }, [])

    const handlePaneDrop = useCallback((e: DragEvent) => {
      const data = handleDrop(e)
      if (data && onDrop) onDrop(data)
    }, [handleDrop, onDrop])

    const handleContextMenu = useCallback((e: MouseEvent, entry: FileEntry) => {
      e.preventDefault()
      if (selectedNames.has(entry.name)) {
        // Right-clicked a selected item — context menu applies to all selected
        const selected = sorted.filter(ent => selectedNames.has(ent.name))
        setContextMenu({ x: e.clientX, y: e.clientY, entries: selected })
      } else {
        // Right-clicked an unselected item — clear selection, target just this one
        onClearSelection()
        setContextMenu({ x: e.clientX, y: e.clientY, entries: [entry] })
      }
    }, [selectedNames, sorted, onClearSelection])

    const handleDelete = useCallback(() => {
      if (!contextMenu || !onDelete) return
      onDelete(contextMenu.entries.map(entry => ({
        path: getItemPath(entry),
        name: entry.name,
        isDirectory: entry.isDirectory
      })))
      setContextMenu(null)
    }, [contextMenu, onDelete, getItemPath])

    const handleRowDragStart = useCallback((e: DragEvent, entry: FileEntry) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); return }
      let items: DropData[]

      if (selectedNames.has(entry.name)) {
        // Dragging a selected file — include all selected entries
        items = sorted
          .filter(ent => selectedNames.has(ent.name))
          .map(ent => ({
            type,
            path: getItemPath(ent),
            name: ent.name,
            isDirectory: ent.isDirectory
          }))
      } else {
        // Dragging an unselected file — clear selection, drag only this one
        onClearSelection()
        items = [{
          type,
          path: getItemPath(entry),
          name: entry.name,
          isDirectory: entry.isDirectory
        }]
      }

      handleDragStart(e, items)

      // Custom drag image badge for multi-selection
      if (items.length > 1) {
        const badge = document.createElement('div')
        badge.textContent = `${items.length} items`
        badge.style.cssText = 'position:fixed;top:-1000px;left:-1000px;background:#3b82f6;color:#fff;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:500;white-space:nowrap;'
        document.body.appendChild(badge)
        e.dataTransfer.setDragImage(badge, badge.offsetWidth / 2, badge.offsetHeight / 2)
        requestAnimationFrame(() => document.body.removeChild(badge))
      }
    }, [selectedNames, sorted, type, getItemPath, handleDragStart, onClearSelection])

    const handleRowClick = useCallback((e: MouseEvent, entry: FileEntry) => {
      if (e.ctrlKey || e.metaKey) {
        onSelect(entry.name, true)
      } else {
        onClearSelection()
      }
    }, [onSelect, onClearSelection])

    const handleListClick = useCallback((e: MouseEvent) => {
      // Click on the empty area of the file list clears selection
      if (e.target === e.currentTarget) {
        onClearSelection()
      }
    }, [onClearSelection])

    const parentPath = getParentPath(cwd)

    return (
      <div
        className={`flex flex-col h-full border-border ${isDragOver ? 'ring-2 ring-primary ring-inset' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handlePaneDrop}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-border">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Breadcrumb */}
        <PathBreadcrumb
          ref={breadcrumbRef}
          path={cwd}
          separator={type === 'local' ? '\\' : '/'}
          onNavigate={onNavigate}
        />

        {/* Column Headers */}
        <div className="grid grid-cols-[1fr_80px_140px] gap-2 px-3 py-1.5 border-b border-border bg-zinc-900/50">
          <ColumnHeader label="Name" field="name" sort={sort} onSort={toggleSort} />
          <ColumnHeader label="Size" field="size" sort={sort} onSort={toggleSort} className="justify-end" />
          <ColumnHeader label="Modified" field="modified" sort={sort} onSort={toggleSort} className="justify-end" />
        </div>

        {/* File List */}
        <div ref={fileListRef} className="flex-1 overflow-y-auto relative" onClick={handleListClick} onMouseDown={rubberBandMouseDown}>
          {/* Go up */}
          {parentPath !== cwd && (
            <div
              className="grid grid-cols-[1fr_80px_140px] gap-2 px-3 py-1.5 text-sm hover:bg-accent cursor-default transition-colors"
              onDoubleClick={() => onNavigate(parentPath)}
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <FolderUp className="h-4 w-4" />
                <span>..</span>
              </div>
              <div />
              <div />
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {sorted.map((entry) => (
              <motion.div
                key={entry.name}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
              >
                <FileRow
                  name={entry.name}
                  isDirectory={entry.isDirectory}
                  size={entry.size}
                  modified={entry.modified}
                  selected={selectedNames.has(entry.name)}
                  draggable
                  onDragStart={(e) => handleRowDragStart(e, entry)}
                  onClick={(e) => handleRowClick(e, entry)}
                  onContextMenu={(e) => handleContextMenu(e, entry)}
                  onDoubleClick={() => {
                    onClearSelection()
                    if (entry.isDirectory) {
                      onNavigate(getItemPath(entry))
                    }
                  }}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && sorted.length === 0 && (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && sorted.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Empty directory
            </div>
          )}

          {rubberBandActive && rubberBandStyle && <div style={rubberBandStyle} />}
        </div>

        {/* Context Menu */}
        {contextMenu && onDelete && (
          <div
            ref={contextMenuRef}
            className="fixed z-50 min-w-[160px] rounded-md border border-border bg-zinc-900 py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-accent transition-colors"
              onClick={handleDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {contextMenu.entries.length > 1
                ? `Delete ${contextMenu.entries.length} items`
                : `Delete ${contextMenu.entries[0].isDirectory ? 'folder' : 'file'}`}
            </button>
          </div>
        )}
      </div>
    )
  }
)
