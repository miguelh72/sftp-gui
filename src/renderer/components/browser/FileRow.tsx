import { Folder, File, FileText, FileCode, FileImage, FileArchive, Film } from 'lucide-react'
import { formatFileSize, formatDate } from '../../lib/format'
import type { DragEvent } from 'react'

interface Props {
  name: string
  isDirectory: boolean
  size: number
  modified: string
  onDoubleClick: () => void
  onDragStart?: (e: DragEvent) => void
  draggable?: boolean
}

function getFileIcon(name: string, isDirectory: boolean) {
  if (isDirectory) return <Folder className="h-4 w-4 text-blue-400" />

  const ext = name.split('.').pop()?.toLowerCase() || ''
  const iconMap: Record<string, JSX.Element> = {
    txt: <FileText className="h-4 w-4 text-zinc-400" />,
    md: <FileText className="h-4 w-4 text-zinc-400" />,
    log: <FileText className="h-4 w-4 text-zinc-400" />,
    js: <FileCode className="h-4 w-4 text-yellow-400" />,
    ts: <FileCode className="h-4 w-4 text-blue-400" />,
    tsx: <FileCode className="h-4 w-4 text-blue-400" />,
    jsx: <FileCode className="h-4 w-4 text-yellow-400" />,
    py: <FileCode className="h-4 w-4 text-green-400" />,
    rs: <FileCode className="h-4 w-4 text-orange-400" />,
    go: <FileCode className="h-4 w-4 text-cyan-400" />,
    json: <FileCode className="h-4 w-4 text-yellow-300" />,
    yaml: <FileCode className="h-4 w-4 text-red-300" />,
    yml: <FileCode className="h-4 w-4 text-red-300" />,
    png: <FileImage className="h-4 w-4 text-purple-400" />,
    jpg: <FileImage className="h-4 w-4 text-purple-400" />,
    jpeg: <FileImage className="h-4 w-4 text-purple-400" />,
    gif: <FileImage className="h-4 w-4 text-purple-400" />,
    svg: <FileImage className="h-4 w-4 text-purple-400" />,
    zip: <FileArchive className="h-4 w-4 text-amber-400" />,
    tar: <FileArchive className="h-4 w-4 text-amber-400" />,
    gz: <FileArchive className="h-4 w-4 text-amber-400" />,
    '7z': <FileArchive className="h-4 w-4 text-amber-400" />,
    mp4: <Film className="h-4 w-4 text-pink-400" />,
    mkv: <Film className="h-4 w-4 text-pink-400" />,
    avi: <Film className="h-4 w-4 text-pink-400" />
  }

  return iconMap[ext] || <File className="h-4 w-4 text-zinc-500" />
}

export function FileRow({ name, isDirectory, size, modified, onDoubleClick, onDragStart, draggable }: Props) {
  return (
    <div
      className="grid grid-cols-[1fr_80px_140px] gap-2 px-3 py-1.5 text-sm hover:bg-accent cursor-default select-none transition-colors"
      onDoubleClick={onDoubleClick}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="flex items-center gap-2 min-w-0">
        {getFileIcon(name, isDirectory)}
        <span className="truncate">{name}</span>
      </div>
      <div className="text-right text-muted-foreground text-xs tabular-nums self-center">
        {isDirectory ? '--' : formatFileSize(size)}
      </div>
      <div className="text-right text-muted-foreground text-xs self-center">
        {formatDate(modified)}
      </div>
    </div>
  )
}
