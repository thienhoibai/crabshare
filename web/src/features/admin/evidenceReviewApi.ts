import { http } from '../../shared/api/http'

export const evidenceStatuses: Record<string, string> = { Flagged: 'Chờ thẩm định', Accepted: 'Đã chấp nhận', Watch: 'Theo dõi', Rejected: 'Đã từ chối' }
export const evidenceVerdicts = { Pass: 'Chấp nhận', Fail: 'Từ chối', NeedMoreEvidence: 'Yêu cầu bổ sung' } as const
export type EvidenceVerdict = keyof typeof evidenceVerdicts
export interface ReviewEvidence {
  id: number; batchCode: string; batchTitle: string; farmName: string; slotCode: string | null
  mediaType: string; reviewStatus: string; riskScore: number | null; receivedAt: string
}
export interface EvidenceDetail {
  evidence: ReviewEvidence; source: string; capturedAt: string | null; latitude: number | null; longitude: number | null
  sha256: string; perceptualHash: string | null; explanation: string | null; explainedAt: string | null; canReview: boolean
  detections: { modelVersion: string; crabDetected: boolean | null; confidence: number | null; bboxJson: string | null; detectedAt: string }[]
  reviews: { id: number; reviewerId: number; reviewerName: string; verdict: EvidenceVerdict; note: string | null; reviewedAt: string }[]
}
export interface EvidencePage { items: ReviewEvidence[]; total: number; page: number; pageSize: number }
export async function reviewEvidence(status: string, q: string, page: number, signal?: AbortSignal) {
  return (await http.get<EvidencePage>('/api/review/evidence', { params: { status, q: q || undefined, page, pageSize: 10 }, signal })).data
}
export async function evidenceDetail(id: number, signal?: AbortSignal) {
  return (await http.get<EvidenceDetail>(`/api/review/evidence/${id}`, { signal })).data
}
export async function evidenceImage(id: number, signal?: AbortSignal) {
  return (await http.get<Blob>(`/api/review/evidence/${id}/image`, { responseType: 'blob', signal })).data
}
export async function submitEvidenceVerdict(id: number, verdict: EvidenceVerdict, note: string) {
  return (await http.post<EvidenceDetail>(`/api/review/evidence/${id}/verdict`, { verdict, note })).data
}
