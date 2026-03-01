import { useState, useCallback, type DragEvent } from 'react'

export interface DropData {
  type: 'local' | 'remote'
  path: string
  name: string
  isDirectory: boolean
}

export function useDragDrop(paneType: 'local' | 'remote') {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragStart = useCallback((e: DragEvent, data: DropData[]) => {
    e.dataTransfer.setData('application/json', JSON.stringify(data))
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: DragEvent): DropData[] | null => {
    e.preventDefault()
    setIsDragOver(false)

    try {
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      // Normalize: accept both single object (backward compat) and array
      const items: DropData[] = Array.isArray(parsed) ? parsed : [parsed]
      // Only accept drops from the opposite pane
      if (items.length === 0 || items[0].type === paneType) return null
      return items
    } catch {
      return null
    }
  }, [paneType])

  return {
    isDragOver,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop
  }
}
