import { http } from '../../shared/api/http'
export interface AuditFilter { entityType: string; from: string; to: string }
export interface AuditRow { auditId: number; entityType: string; entityId: number; actionType: string; oldValue: string | null; newValue: string | null; actorUserId: number | null; occurredAt: string; prevHash: string | null; rowHash: string }
export interface AuditPage { items: AuditRow[]; page: number; pageSize: number; total: number; throughAuditId: number; chain: { isValid: boolean; checkedRows: number; brokenAuditId: number | null; problem: string | null } }
function params(filter: AuditFilter, throughAuditId?: number) { return { entityType: filter.entityType || undefined, from: filter.from || undefined, to: filter.to || undefined, throughAuditId } }
export async function auditLog(filter: AuditFilter, page: number, throughAuditId: number | undefined, signal: AbortSignal) {
  const { data } = await http.get<AuditPage>('/api/admin/audit-log', { params: { ...params(filter, throughAuditId), page, pageSize: 20 }, signal })
  if (!Array.isArray(data?.items) || typeof data?.chain?.isValid !== 'boolean') throw new Error('Invalid audit response')
  return data
}
export async function exportAuditLog(filter: AuditFilter, throughAuditId?: number) {
  const response = await http.get<Blob>('/api/admin/audit-log/export', { params: params(filter, throughAuditId), responseType: 'blob' })
  if (!String(response.headers['content-type']).includes('text/csv')) throw new Error('Invalid CSV response')
  const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = `crabshare-audit-${throughAuditId ?? 'latest'}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
