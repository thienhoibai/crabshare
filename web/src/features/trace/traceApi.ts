import { useQuery } from '@tanstack/react-query'
import { http } from '../../shared/api/http'

export type TraceEvent = {
  eventType: string
  occurredAt: string
}

/** Public fields returned for an Active tag. This deliberately excludes evidence and media data. */
export type TraceResponse = {
  tagCode: string
  batchCode: string
  crabType: string
  itemStatus: string
  weightG: number | null
  gradeCode: string | null
  gradeName: string | null
  stockedAt: string
  harvestedAt: string | null
  slotCode: string
  events: TraceEvent[]
}

export async function getTrace(tagCode: string, signal?: AbortSignal): Promise<TraceResponse> {
  const { data } = await http.get<TraceResponse>(`/api/trace/${encodeURIComponent(tagCode)}`, { signal })
  return data
}

export function useTrace(tagCode: string | undefined) {
  return useQuery({
    queryKey: ['public-trace', tagCode],
    queryFn: ({ signal }) => getTrace(tagCode!, signal),
    enabled: !!tagCode,
    retry: false,
  })
}
