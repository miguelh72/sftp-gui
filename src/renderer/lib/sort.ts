export type SortField = 'name' | 'size' | 'modified'
export type SortDirection = 'asc' | 'desc'

export interface SortConfig {
  field: SortField
  direction: SortDirection
}

export function sortEntries<T extends { name: string; isDirectory: boolean; size: number; modified: string }>(
  entries: T[],
  sort: SortConfig
): T[] {
  const sorted = [...entries].sort((a, b) => {
    // Directories always first
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1
    }

    let cmp = 0
    switch (sort.field) {
      case 'name':
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        break
      case 'size':
        cmp = a.size - b.size
        break
      case 'modified':
        cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime()
        break
    }

    return sort.direction === 'asc' ? cmp : -cmp
  })

  return sorted
}
