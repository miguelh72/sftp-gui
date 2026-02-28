import { useState, useCallback, useRef } from 'react'

export interface Toast {
  id: string
  message: string
  type: 'error' | 'info' | 'success'
}

let nextId = 0

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const addToast = useCallback((message: string, type: Toast['type'] = 'error') => {
    const id = String(++nextId)
    setToasts(prev => [...prev, { id, message, type }])

    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      timersRef.current.delete(id)
    }, 5000)
    timersRef.current.set(id, timer)

    return id
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  return { toasts, addToast, dismissToast }
}
