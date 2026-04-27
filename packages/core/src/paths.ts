// CC flattens real paths into its projects dir by mapping:
//   '/' -> '-'
//   actual '-' in the path is preserved as a single '-' (and cannot be recovered)
//   '_' in the path -> '--' (so '/_' at a component boundary becomes '--')
// The reverse is a best-effort heuristic: '--' -> '_', single '-' -> '/'.
// This is LOSSY for paths where directory names contain '-' or where '_' appears
// mid-name (not at a component boundary). We accept the lossiness because:
//   (a) The round-trip is used for DISPLAY, not for filesystem navigation.
//   (b) Most real paths in the user's environment have unambiguous names
//       (e.g., '_Projects' at a component boundary round-trips correctly).

export function flatToRealPath(flat: string): string {
  // Leading '-' marks absolute root.
  let s = flat
  if (s.startsWith('-')) s = s.slice(1)
  // Replace '--' with a placeholder, then single '-' with '/', then placeholder with '_'.
  const placeholder = '\u0000'
  s = s.replaceAll('--', placeholder).replaceAll('-', '/').replaceAll(placeholder, '_')
  return `/${s}`
}

export function realToFlatPath(real: string): string {
  let s = real
  if (s.startsWith('/')) s = s.slice(1)
  s = s.replaceAll('_', '--').replaceAll('/', '-')
  return `-${s}`
}

// Pull the project dir name out of a full transcript file path under ~/.claude/projects/
export function projectPathFromFile(file: string): string | null {
  const match = file.match(/\/\.claude\/projects\/([^\/]+)\//)
  if (!match) return null
  return flatToRealPath(match[1]!)
}
