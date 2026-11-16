/* Hợp đồng góp vốn (Features/Contracts, UC14–UC15): lập từ mẫu đang hiệu lực, người nuôi ký trước, nhà đầu tư ký sau trên cùng một file PDF.
   Kiểu dữ liệu lấy từ api.gen.ts; các mã trạng thái được thu hẹp để tra nhãn. Sau mỗi lần ghi mọi truy vấn đang hiển thị được tải lại. */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ContractResponse, ContractSignatureResponse, ContractSummary as ContractSummaryDto } from '../api/api.gen'
import { fetchBlob } from '../api/hooks'
import { http } from '../api/http'

export type ContractStatus = 'Draft' | 'OperatorSigned' | 'FullySigned' | 'Void'
export type SignerRole = 'Operator' | 'Investor'

export type ContractSignature = Omit<ContractSignatureResponse, 'role'> & { role: SignerRole }

export type Contract = Omit<ContractResponse, 'status' | 'signatures' | 'nextSigner'> & {
  status: ContractStatus
  signatures: ContractSignature[]
  nextSigner: SignerRole | null
}

export type ContractSummary = Omit<ContractSummaryDto, 'status' | 'nextSigner'> & { status: ContractStatus; nextSigner: SignerRole | null }

export const contractStatuses: Record<ContractStatus, string> = {
  Draft: 'Chờ người nuôi ký',
  OperatorSigned: 'Chờ nhà đầu tư ký',
  FullySigned: 'Đã đủ hai chữ ký',
  Void: 'Đã huỷ',
}

export const contractKeys = {
  root: ['contracts'] as const,
  one: (id: number) => ['contracts', 'one', id] as const,
  operator: ['contracts', 'operator'] as const,
}

/** `pollWhileWaitingFor`: hỏi lại 5 giây một lần khi đang chờ bên này ký (ví dụ nhà đầu tư chờ người nuôi ký trước). */
export function useContract(id: number | null, pollWhileWaitingFor?: SignerRole) {
  return useQuery({
    queryKey: contractKeys.one(id ?? 0),
    queryFn: async () => (await http.get<Contract>(`/api/contracts/${id}`)).data,
    enabled: id !== null,
    retry: false,
    refetchInterval: (q) => (pollWhileWaitingFor && q.state.data?.nextSigner === pollWhileWaitingFor ? 5000 : false),
  })
}

/** Một thao tác ghi trên hợp đồng: cập nhật ngay hợp đồng đó rồi tải lại mọi danh sách đang hiển thị. */
function useContractAction<TArgs>(call: (args: TArgs) => Promise<Contract>) {
  const queryClient = useQueryClient()
  return useMutation({
    retry: false,
    mutationFn: call,
    onSuccess: async (contract) => {
      queryClient.setQueryData(contractKeys.one(contract.contractId), contract)
      await queryClient.invalidateQueries()
    },
  })
}

/** Lập (hoặc lấy lại) hợp đồng của một khoản góp đang giữ chỗ hoặc đã xác nhận. */
export const useCreateContract = () =>
  useContractAction(async (contributionId: number) => (await http.post<Contract>(`/api/contributions/${contributionId}/contract`)).data)

/** Ký phần của tôi. Sai thứ tự ký thì API trả 422 contract.wrong_signing_order. */
export const useSignContract = () =>
  useContractAction(async (contractId: number) => (await http.post<Contract>(`/api/contracts/${contractId}/sign`)).data)

export function useOperatorContracts() {
  return useQuery({ queryKey: contractKeys.operator, queryFn: async () => (await http.get<ContractSummary[]>('/api/operator/contracts')).data })
}

/** Hợp đồng của các khoản góp của tôi (cổng nhà đầu tư). */
export function useMyContracts() {
  return useQuery({ queryKey: [...contractKeys.root, 'mine'], queryFn: async () => (await http.get<ContractSummary[]>('/api/me/contracts')).data })
}

/** Kho hợp đồng của một Lô cho Admin. */
export function useBatchContracts(batchCode: string) {
  return useQuery({
    queryKey: [...contractKeys.root, 'batch', batchCode],
    queryFn: async () => (await http.get<ContractSummary[]>(`/api/admin/batches/${encodeURIComponent(batchCode)}/contracts`)).data,
    enabled: batchCode.length > 0,
  })
}

/** UC15: Admin tải bản đã ký ngoài hệ thống (PDF) sau khi xác nhận đã đối chiếu đủ chữ ký hai bên. */
export const useUploadOfflineContract = () =>
  useContractAction(async ({ contractId, file }: { contractId: number; file: File }) => {
    const form = new FormData()
    form.append('file', file)
    form.append('confirmedBothSigned', 'true')
    return (await http.post<Contract>(`/api/contracts/${contractId}/offline-upload`, form)).data
  })

/**
 * File PDF hiện hành dưới dạng blob URL (cần gửi kèm JWT nên không mở thẳng đường dẫn API).
 * Tải lại khi mã băm đổi (sau mỗi chữ ký); thu hồi URL cũ để không rò bộ nhớ.
 */
export function useContractPdf(contractId: number | null, hash: string | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (contractId === null || !hash) return
    const controller = new AbortController()
    let created: string | null = null
    setUrl(null)
    setError(false)
    fetchBlob(`/api/contracts/${contractId}/file`, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return
        created = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
        setUrl(created)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => {
      controller.abort()
      if (created) URL.revokeObjectURL(created)
    }
  }, [contractId, hash])
  return { url, error }
}
