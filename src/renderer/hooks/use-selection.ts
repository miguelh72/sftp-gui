import { useState, useCallback, useRef } from 'react'

export function useSelection() {
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const cwdRef = useRef<string>('')

  const toggle = useCallback((name: string) => {
    setSelectedNames(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setSelectedNames(prev => prev.size === 0 ? prev : new Set())
  }, [])

  const isSelected = useCallback((name: string) => {
    return selectedNames.has(name)
  }, [selectedNames])

  const setCwd = useCallback((newCwd: string) => {
    if (cwdRef.current !== newCwd) {
      cwdRef.current = newCwd
      setSelectedNames(prev => prev.size === 0 ? prev : new Set())
    }
  }, [])

  const setAll = useCallback((names: Set<string>) => {
    setSelectedNames(names)
  }, [])

  return { selectedNames, toggle, clear, isSelected, setCwd, setAll }
}
