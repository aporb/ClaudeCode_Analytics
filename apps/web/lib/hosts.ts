export function parseHosts(input: {
  searchParams: { host?: string | string[] }
  cookieValue: string | null
}): string[] | null {
  const param = Array.isArray(input.searchParams.host)
    ? input.searchParams.host[0]
    : input.searchParams.host
  const raw = (param ?? input.cookieValue ?? '').trim()
  if (!raw) return null
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
