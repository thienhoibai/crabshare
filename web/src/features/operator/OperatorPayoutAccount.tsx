/* /operator/payout-account — Tài khoản nhận tiền của hộ nuôi (GET/PUT /api/me/payout-account?ownerType=Operator).
   Form dùng chung với cổng nhà đầu tư (features/accounts/PayoutAccountForm). */
import PayoutAccountForm from '../accounts/PayoutAccountForm'
import { OpHeading, OpPanel } from '../../shared/ui/console'

export default function OperatorPayoutAccount() {
  return (
    <>
      <OpHeading eyebrow="Tiền" title="Tài khoản nhận tiền" description="Nơi nhận tiền giải ngân và quyết toán." />
      <OpPanel title="Thông tin ngân hàng" action={<a className="op-link" href="/operator/disbursements">Mốc giải ngân</a>}>
        <PayoutAccountForm owner="Operator" />
      </OpPanel>
    </>
  )
}
