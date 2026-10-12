import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'
import type { OperatorProfile, OperatorApplication } from '../operator/operatorsApi'

export type OperatorStatus = OperatorApplication['status']
export type AdminOperator = OperatorProfile & {
  operatorId: number; status: OperatorStatus; approvedSlotCapacity: number
  submittedAt: string | null; approvedAt: string | null; approvedBy: number | null
}
export type OperatorDecision = { operatorId: number } & (
  { action: 'approve'; approvedSlotCapacity: number } | { action: 'reject' | 'suspend'; reason: string }
)
type OperatorPage = { items: AdminOperator[]; page: number; pageSize: number; total: number }

export function useAdminOperators(status: OperatorStatus | '', page: number) {
  const userId = useAuthStore(s => s.user?.userId)
  return useQuery({
    queryKey: ['admin', 'operators', userId, status, page], retry: false,
    queryFn: async () => (await http.get<OperatorPage>('/api/admin/operators', { params: { status: status || undefined, page, pageSize: 10 } })).data,
  })
}

export function useOperatorDecision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (decision: OperatorDecision) => {
      const { operatorId, action, ...body } = decision
      return (await http.post<AdminOperator>(`/api/admin/operators/${operatorId}/${action}`, body)).data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'operators'] })
      void qc.invalidateQueries({ queryKey: ['operators', 'me'] })
    },
  })
}
