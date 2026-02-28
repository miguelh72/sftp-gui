import { useState, useCallback, useRef, forwardRef, useImperativeHandle, type DragEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Loader2, FolderUp } from 'lucide-react'
import { PathBreadcrumb, type PathBreadcrumbHandle } from './PathBreadcrumb'
import { ColumnHeader } from './ColumnHeader'
import { FileRow } from './FileRow'
import { sortEntries, type SortConfig, type SortField } from '../../lib/sort'
import { useDragDrop, type DropData } from '../../hooks/use-drag-drop'

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
  onDrop?: (data: DropData) => void
  getItemPath: (entry: FileEntry) => string
  getParentPath: (cwd: string) => string
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
    onDrop,
    getItemPath,
    getParentPath
  }, ref) {
    const [sort, setSort] = useState<SortConfig>({ field: 'name', direction: 'asc' })
    const { isDragOver, handleDragStart, handleDragOver, handleDragLeave, handleDrop } = useDragDrop(type)
    const breadcrumbRef = useRef<PathBreadcrumbHandle>(null)

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
        <div className="flex-1 overflow-y-auto">
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
                  draggable
                  onDragStart={(e) => handleDragStart(e, {
                    type,
                    path: getItemPath(entry),
                    name: entry.name,
                    isDirectory: entry.isDirectory
                  })}
                  onDoubleClick={() => {
                    if (entry.isDirectory) {
                      onNavigate(getItemPath(entry))
                    }
                  }}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {!loading && sorted.length === 0 && (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Empty directory
            </div>
          )}
        </div>
      </div>
    )
  }
)
