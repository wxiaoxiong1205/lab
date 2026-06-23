export function normalizeArchiveEntryPaths(entryPaths: string[], archiveFileName?: string): string[] {
  const normalizedPaths = entryPaths
    .map(path => path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/'))
    .filter(Boolean)

  if (!normalizedPaths.length) {
    return []
  }

  const roots = Array.from(new Set(normalizedPaths.map(path => path.split('/')[0]).filter(Boolean)))
  const archiveRoot = archiveFileName?.replace(/\.[^.]+$/, '')

  if (roots.length !== 1 || !archiveRoot || roots[0] !== archiveRoot) {
    return normalizedPaths
  }

  const prefix = `${archiveRoot}/`
  const strippedPaths = normalizedPaths
    .map(path => (path === archiveRoot ? '' : path.startsWith(prefix) ? path.slice(prefix.length) : path))
    .filter(Boolean)

  return strippedPaths.length ? strippedPaths : normalizedPaths
}
