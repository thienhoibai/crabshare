import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '../api/http'

/** Hợp đồng góp vốn (TH-08, TL-19): người nuôi ký trước, nhà đầu tư ký sau trên cùng một file PDF. */
export type ContractStatus = 'Draft' | 'OperatorSigned' | 'FullySigned' | 'Void'
export type SignerRole = 'Operator' | 'Investor'

export type ContractSignature = { role: SignerRole; order: number; signerName: string; signedAt: string; signedHash: string; providerReference: string | null }

export type Contract = {
  contractId: number; contractNo: string; status: ContractStatus; signingMethod: 'DigitalSignature' | 'OfflineUpload'
  batchCode: string; batchTitle: string; operatorName: string; investorName: string
  contributionId: number; amount: number; contributionStatus: string; templateVersion: string
  draftHash: string; currentHash: string; finalHash: string | null; fullySignedAt: string | null; createdAt: string
  signatures: ContractSignature[]; nextSigner: SignerRole | null; canSign: boolean; legalNotice: string
}

export type ContractSummary = {
  contractId: number; contractNo: string; status: ContractStatus; signingMethod: string; batchCode: string; batchTitle: string
  investorName: string; amount: number; contributionStatus: string; nextSigner: SignerRole | null; createdAt: string; fullySignedAt: string | null
}

export const contractStatuses: Record<ContractStatus, string> = {
  Draft: 'Chờ người nuôi ký', OperatorSigned: 'Chờ nhà đầu tư ký', FullySigned: 'Đã đủ hai chữ ký', Void: 'Đã huỷ',
}

export const contractKeys = {
  root: ['contracts'] as const,
  one: (id: number) => ['contracts', 'one', id] as const,
  operator: ['contracts', 'operator'] as const,
}

/** `pollWhileWaitingFor`: hỏi lại 5 giây/lần khi đang chờ bên này ký (ví dụ nhà đầu tư chờ người nuôi ký trước). */
export function useContract(id: number | null, pollWhileWaitingFor?: SignerRole) {
  return useQuery({
    queryKey: contractKeys.one(id ?? 0),
    queryFn: async () => (await http.get<Contract>(`/api/contracts/${id}`)).data,
    enabled: id !== null,
    retry: false,
    refetchInterval: (q) => pollWhileWaitingFor && q.state.data?.nextSigner === pollWhileWaitingFor ? 5000 : false,
  })
}

/** Màn 3 luồng góp vốn: lập (hoặc lấy lại) hợp đồng của khoản đang giữ chỗ. */
export function useCreateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (contributionId: number) => (await http.post<Contract>(`/api/contributions/${contributionId}/contract`)).data,
    onSuccess: (contract) => queryClient.setQueryData(contractKeys.one(contract.contractId), contract),
  })
}

export function useSignContract() {
  const queryClient = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: async (contractId: number) => (await http.post<Contract>(`/api/contracts/${contractId}/sign`)).data,
    onSuccess: async (contract) => {
      queryClient.setQueryData(contractKeys.one(contract.contractId), contract)
      await queryClient.invalidateQueries({ queryKey: contractKeys.root })
    },
  })
}

export function useOperatorContracts() {
  return useQuery({ queryKey: contractKeys.operator, queryFn: async () => (await http.get<ContractSummary[]>('/api/operator/contracts')).data })
}

/**
 * File PDF hiện hành dưới dạng blob URL (cần gửi kèm JWT nên không mở thẳng đường dẫn API).
 * Tải lại khi mã băm đổi (sau mỗi chữ ký); thu hồi URL cũ để không rò bộ nhớ.
 */
export function useContractPdf(contractId: number | null, hash: string | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (contractId === null || !hash) return
    let created: string | null = null
    let cancelled = false
    http.get<Blob>(`/api/contracts/${contractId}/file`, { responseType: 'blob' })
      .then(res => {
        if (cancelled) return
        created = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
        setUrl(created)
        setError(false)
      })
      .catch(() => { if (!cancelled) setError(true) })
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [contractId, hash])
  return { url, error }
}
