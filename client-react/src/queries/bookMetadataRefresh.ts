import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query'
import { refreshBookMetadata, refreshBooksMetadata } from '@/api/bookMetadataRefresh'
import {
  authorKeys,
  bookKeys,
  categoryKeys,
  dashboardKeys,
  policyKeys,
  searchKeys,
} from './keys'

function invalidateMetadata(client: QueryClient) {
  // A lost response can still have applied changes. Re-read on failure too.
  return Promise.all(
    [
      bookKeys.all,
      searchKeys.all,
      dashboardKeys.all,
      authorKeys.all,
      categoryKeys.all,
      policyKeys.all,
    ].map((queryKey) => client.invalidateQueries({ queryKey }))
  )
}

export function useRefreshBookMetadata(id: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => refreshBookMetadata(id),
    onSettled: () => invalidateMetadata(client),
  })
}

export function useRefreshBooksMetadata() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: refreshBooksMetadata,
    onSettled: () => invalidateMetadata(client),
  })
}
