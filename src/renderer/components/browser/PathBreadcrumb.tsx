import { useState, useRef, useImperativeHandle, forwardRef, type KeyboardEvent } from 'react'
import { ChevronRight, HardDrive } from 'lucide-react'

interface Props {
  path: string
  separator?: string
  onNavigate: (path: string) => void
}

export interface PathBreadcrumbHandle {
  focusInput: () => void
}

export const PathBreadcrumb = forwardRef<PathBreadcrumbHandle, Props>(
  function PathBreadcrumb({ path, separator = '/', onNavigate }, ref) {
    const [editing, setEditing] = useState(false)
    const [editValue, setEditValue] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(ref, () => ({
      focusInput() {
        setEditing(true)
        setEditValue(path)
        requestAnimationFrame(() => inputRef.current?.select())
      }
    }))

    const handleSubmit = () => {
      setEditing(false)
      const trimmed = editValue.trim()
      if (trimmed && trimmed !== path) {
        onNavigate(trimmed)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') handleSubmit()
      if (e.key === 'Escape') setEditing(false)
    }

    if (editing) {
      return (
        <div className="flex items-center px-3 py-1.5 bg-card border-b border-border">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={handleKeyDown}
            className="w-full rounded border border-ring bg-zinc-900 px-2 py-1 text-sm text-foreground focus:outline-none"
            autoFocus
          />
        </div>
      )
    }

    const parts = path.split(/[/\\]/).filter(Boolean)
    const isWindowsPath = /^[A-Z]:/i.test(path)
    const root = isWindowsPath ? parts[0] + '\\' : '/'
    const crumbs = isWindowsPath ? parts.slice(1) : parts

    return (
      <div
        className="flex items-center gap-1 text-sm overflow-x-auto whitespace-nowrap px-3 py-2 bg-card border-b border-border cursor-text"
        onClick={() => {
          setEditing(true)
          setEditValue(path)
          requestAnimationFrame(() => inputRef.current?.select())
        }}
      >
        <button
          onClick={e => { e.stopPropagation(); onNavigate(root) }}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <HardDrive className="h-3.5 w-3.5" />
          <span>{root}</span>
        </button>

        {crumbs.map((part, i) => {
          const fullPath = isWindowsPath
            ? root + crumbs.slice(0, i + 1).join('\\')
            : '/' + crumbs.slice(0, i + 1).join('/')

          return (
            <span key={i} className="flex items-center gap-1 shrink-0">
              <ChevronRight className="h-3 w-3 text-zinc-600" />
              <button
                onClick={e => { e.stopPropagation(); onNavigate(fullPath) }}
                className={`hover:text-foreground transition-colors ${
                  i === crumbs.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'
                }`}
              >
                {part}
              </button>
            </span>
          )
        })}
      </div>
    )
  }
)
