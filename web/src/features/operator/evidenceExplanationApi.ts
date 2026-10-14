import { http } from '../../shared/api/http'

export interface OperatorEvidence {
  id: number; batchCode: string; slotCode: string | null; mediaType: string; reviewStatus: string
  riskScore: number | null; capturedAt: string | null; receivedAt: string; latitude: number | null; longitude: number | null
  explanation: string | null; explainedAt: string | null; canExplain: boolean
  latestReview: { verdict: string; note: string | null; reviewedAt: string } | null
}
export interface OperatorEvidencePage { items: OperatorEvidence[]; total: number; page: number; pageSize: number }
export async function operatorEvidence(status: string, q: string, page: number, signal?: AbortSignal) {
  return (await http.get<OperatorEvidencePage>('/api/operators/me/evidence', { params: { status, q: q || undefined, page, pageSize: 10 }, signal })).data
}
export async function operatorEvidenceDetail(id: number, signal?: AbortSignal) {
  return (await http.get<OperatorEvidence>(`/api/operators/me/evidence/${id}`, { signal })).data
}
export async function operatorEvidenceImage(id: number, signal?: AbortSignal) {
  return (await http.get<Blob>(`/api/operators/me/evidence/${id}/image`, { responseType: 'blob', signal })).data
}
export async function explainEvidence(id: number, text: string) {
  return (await http.post<OperatorEvidence>(`/api/evidence/${id}/explanation`, { text })).data
}
