import { http } from '../../shared/api/http'

export type TagStatus = 'Printed' | 'Active' | 'Void'
export type TagListItem = { tagId: number; tagCode: string; status: TagStatus; batchCode: string; itemUuid: string; printedAt: string }
export type TagPage = { items: TagListItem[]; total: number; page: number; pageSize: number }
export type TagLabel = { tagCode: string; traceUrl: string }
export type VoidTagResult = { voidedTag: { tagId: number; tagCode: string; status: string; activationEvidenceId: number | null; activatedAt: string | null }; replacementTag: TagListItem }

export const tagsApi = {
  list: async (status: TagStatus, page: number, signal?: AbortSignal) =>
    (await http.get<TagPage>('/api/tags', { params: { status, page, pageSize: 20 }, signal })).data,
  label: async (tagCode: string, signal?: AbortSignal) =>
    (await http.get<TagLabel>(`/api/tags/${encodeURIComponent(tagCode)}/label`, { signal })).data,
  voidAndReplace: async (tagCode: string, reason: string) =>
    (await http.post<VoidTagResult>(`/api/tags/${encodeURIComponent(tagCode)}/void`, { reason })).data,
}
