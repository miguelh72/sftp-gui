import { ArrowUp, ArrowDown } from 'lucide-react'
import type { SortField, SortConfig } from '../../lib/sort'

interface Props {
  label: string
  field: SortField
  sort: SortConfig
  onSort: (field: SortField) => void
  className?: string
}

export function ColumnHeader({ label, field, sort, onSort, className = '' }: Props) {
  const active = sort.field === field

  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      {label}
      {active && (
        sort.direction === 'asc'
          ? <ArrowUp className="h-3 w-3" />
          : <ArrowDown className="h-3 w-3" />
      )}
    </button>
  )
}
