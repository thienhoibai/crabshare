/* Tài khoản nhận tiền (UC03). Kiểu lấy từ api.gen.ts. */
import type { PayoutAccountRequest, PayoutProfileResponse } from '../../shared/api/api.gen'
import { useGet, useSend } from '../../shared/api/hooks'

export type PayoutOwner = 'Investor' | 'Operator'
export type PayoutInput = PayoutAccountRequest
export type PayoutProfile = PayoutProfileResponse

export const payoutPath = '/api/me/payout-account'

/** Tài khoản nhận tiền của tôi theo vai trò: nhà đầu tư hoặc hộ nuôi (chỉ chủ hộ; vai trò khác thì API trả lỗi kèm lý do). */
export function usePayoutProfile(owner: PayoutOwner) {
  return useGet<PayoutProfileResponse>(payoutPath, { ownerType: owner }, { retry: false })
}

/** Lưu và đối chiếu tên chủ tài khoản. Tên không khớp vẫn trả 200 với nameMatchStatus = Mismatched. */
export function useSavePayout(owner: PayoutOwner) {
  return useSend<PayoutProfileResponse, PayoutAccountRequest>('put', `${payoutPath}?ownerType=${owner}`, {
    success: (res) => (res.account?.nameMatchStatus === 'Matched' ? 'Đã lưu tài khoản nhận tiền, tên chủ tài khoản khớp.' : 'Đã lưu nhưng tên chủ tài khoản chưa khớp. Kiểm tra lại tên.'),
  })
}
