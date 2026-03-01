import { useCallback, useRef, useState, useEffect, type CSSProperties, type RefObject, type MouseEvent as ReactMouseEvent } from 'react'

interface RubberBandResult {
  isActive: boolean
  style: CSSProperties | null
  onMouseDown: (e: ReactMouseEvent) => void
}

export function useRubberBand(
  containerRef: RefObject<HTMLDivElement | null>,
  selectedNames: Set<string>,
  onSelectionChange: (names: Set<string>) => void
): RubberBandResult {
  const [isActive, setIsActive] = useState(false)
  const [style, setStyle] = useState<CSSProperties | null>(null)

  const startPointRef = useRef({ x: 0, y: 0 })
  const currentPointRef = useRef({ x: 0, y: 0 })
  const baseSelectionRef = useRef<Set<string>>(new Set())
  const activeRef = useRef(false)

  const hitTest = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const startY = startPointRef.current.y
    const currentY = currentPointRef.current.y
    const top = Math.min(startY, currentY)
    const bottom = Math.max(startY, currentY)

    const containerRect = container.getBoundingClientRect()
    const scrollTop = container.scrollTop
    const rows = container.querySelectorAll<HTMLElement>('[data-name]')
    const boxNames = new Set<string>()

    for (const row of rows) {
      const rowRect = row.getBoundingClientRect()
      // Convert row position to container-scroll-space coordinates
      const rowTop = rowRect.top - containerRect.top + scrollTop
      const rowBottom = rowTop + rowRect.height
      if (rowTop < bottom && rowBottom > top) {
        const name = row.getAttribute('data-name')
        if (name) boxNames.add(name)
      }
    }

    const merged = new Set(baseSelectionRef.current)
    for (const name of boxNames) merged.add(name)
    onSelectionChange(merged)
  }, [containerRef, onSelectionChange])

  const updateStyle = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const scrollTop = container.scrollTop
    const startY = startPointRef.current.y - scrollTop
    const currentY = currentPointRef.current.y - scrollTop
    const startX = startPointRef.current.x
    const currentX = currentPointRef.current.x

    setStyle({
      position: 'absolute',
      left: Math.min(startX, currentX),
      top: Math.min(startY, currentY),
      width: Math.abs(currentX - startX),
      height: Math.abs(currentY - startY),
      backgroundColor: 'rgba(59, 130, 246, 0.15)',
      border: '1px solid rgba(59, 130, 246, 0.4)',
      pointerEvents: 'none',
      zIndex: 10
    })
  }, [containerRef])

  const onMouseMove = useCallback((e: globalThis.MouseEvent) => {
    const container = containerRef.current
    if (!container || !activeRef.current) return

    const rect = container.getBoundingClientRect()
    currentPointRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top + container.scrollTop
    }
    updateStyle()
    hitTest()
  }, [containerRef, updateStyle, hitTest])

  const onMouseUp = useCallback(() => {
    const wasDragging = startPointRef.current.x !== currentPointRef.current.x ||
      startPointRef.current.y !== currentPointRef.current.y
    activeRef.current = false
    setIsActive(false)
    setStyle(null)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)

    // Suppress the click event that follows mouseup so it doesn't
    // clear/toggle the selection we just built
    if (wasDragging) {
      const suppress = (e: Event) => { e.stopPropagation(); e.preventDefault() }
      window.addEventListener('click', suppress, { capture: true, once: true })
    }
  }, [onMouseMove])

  const onScroll = useCallback(() => {
    if (!activeRef.current) return
    updateStyle()
    hitTest()
  }, [updateStyle, hitTest])

  // Attach/detach scroll listener
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener('scroll', onScroll)
    return () => container.removeEventListener('scroll', onScroll)
  }, [containerRef, onScroll])

  const onMouseDown = useCallback((e: ReactMouseEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return

    const container = containerRef.current
    if (!container) return

    e.preventDefault()

    const rect = container.getBoundingClientRect()
    const point = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top + container.scrollTop
    }

    startPointRef.current = point
    currentPointRef.current = point
    baseSelectionRef.current = new Set(selectedNames)
    activeRef.current = true
    setIsActive(true)

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [containerRef, selectedNames, onMouseMove, onMouseUp])

  return { isActive, style, onMouseDown }
}
