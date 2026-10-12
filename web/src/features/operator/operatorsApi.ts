import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { http, type ApiProblem } from '../../shared/api/http'
import { useAuthStore } from '../../shared/auth/authStore'

export type OperatorProfile = {
  legalName: string
  taxCode: string
  businessRegNo: string
  farmAddress: string
}

export type OperatorApplication = OperatorProfile & {
  operatorId: number
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Suspended'
  submittedAt: string | null
  memberRole: 'Owner' | 'Staff'
  canEdit: boolean
  canSubmit: boolean
}

export function useOperatorApplication() {
  const userId = useAuthStore((s) => s.user?.userId)
  return useQuery({
    queryKey: ['operators', 'me', userId],
    enabled: !!userId,
    retry: false,
    queryFn: async () => {
      try {
        return (await http.get<OperatorApplication>('/api/operators/me')).data
      } catch (error) {
        if (axios.isAxiosError<ApiProblem>(error) && error.response?.status === 404 && error.response.data.code === 'operator.not_found') return null
        throw error
      }
    },
  })
}

export function useSaveOperatorApplication() {
  const qc = useQueryClient()
  const userId = useAuthStore((s) => s.user?.userId)
  return useMutation({
    mutationFn: async ({ profile, exists }: { profile: OperatorProfile; exists: boolean }) =>
      (exists ? await http.put<OperatorApplication>('/api/operators/me', profile) : await http.post<OperatorApplication>('/api/operators', profile)).data,
    onSuccess: (data) => qc.setQueryData(['operators', 'me', userId], data),
  })
}

export function useSubmitOperatorApplication() {
  const qc = useQueryClient()
  const userId = useAuthStore((s) => s.user?.userId)
  return useMutation({
    mutationFn: async () => (await http.post<OperatorApplication>('/api/operators/me/submit')).data,
    onSuccess: (data) => qc.setQueryData(['operators', 'me', userId], data),
  })
}
