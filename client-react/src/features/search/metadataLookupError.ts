import { ApiError } from '@/api/http'

export type MetadataLookupFailureKind =
  | 'source_not_configured'
  | 'no_metadata'
  | 'source_unavailable'

export type MetadataLookupFailure = {
  kind: MetadataLookupFailureKind
  unconfiguredSources: string[]
  sourcesTried: string[]
  failedSources: string[]
}

const FAILURE_KINDS: ReadonlySet<MetadataLookupFailureKind> = new Set([
  'source_not_configured',
  'no_metadata',
  'source_unavailable',
])

function sourceNames(body: Record<string, unknown>, key: string): string[] {
  const values = body[key]
  if (!Array.isArray(values)) return []
  return values.filter(
    (value): value is string => typeof value === 'string' && value !== ''
  )
}

/** Read the structured failure returned by POST /book/isbn/:isbn. */
export function metadataLookupFailure(error: unknown): MetadataLookupFailure | null {
  if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 502)) {
    return null
  }
  if (typeof error.body !== 'object' || error.body === null) return null

  const body = error.body as Record<string, unknown>
  const kind = body.error
  if (
    typeof kind !== 'string' ||
    !FAILURE_KINDS.has(kind as MetadataLookupFailureKind)
  ) {
    return null
  }
  if (
    (kind === 'source_not_configured' || kind === 'no_metadata') &&
    error.status !== 404
  ) {
    return null
  }
  if (kind === 'source_unavailable' && error.status !== 502) return null

  return {
    kind: kind as MetadataLookupFailureKind,
    unconfiguredSources: sourceNames(body, 'unconfiguredSources'),
    sourcesTried: sourceNames(body, 'sourcesTried'),
    failedSources: sourceNames(body, 'failedSources'),
  }
}

/** User-facing copy for the two 404 outcomes. It names only server-reported sources. */
export function metadataLookupFailureMessage(failure: MetadataLookupFailure): string {
  switch (failure.kind) {
    case 'source_not_configured': {
      const sources = failure.unconfiguredSources
      const configured =
        sources.length > 0
          ? `${sources.join(', ')} ${sources.length === 1 ? 'is' : 'are'} not configured on this server. `
          : 'A metadata source is not configured on this server. '
      return `Metadata source unavailable: ${configured}Ask an administrator to configure it, or add the book manually.`
    }
    case 'no_metadata':
      return 'This ISBN was checked, but no catalogue returned metadata. Add it manually instead.'
    case 'source_unavailable':
      return 'The metadata sources were unavailable. Try again later.'
  }
}

export function metadataLookupFailureTitle(
  kind: MetadataLookupFailureKind | undefined
): string {
  return kind === 'source_not_configured'
    ? 'Metadata source unavailable'
    : 'No metadata for this ISBN'
}
