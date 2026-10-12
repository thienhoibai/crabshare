import PayoutAccountForm from '../accounts/PayoutAccountForm'
import OperatorLayout from './OperatorLayout'
import { OpHeading, OpPanel } from './operatorUi'

export default function OperatorPayoutAccount() {
  return <OperatorLayout activeTab="payout"><OpHeading eyebrow="Tài khoản hộ nuôi" title="Tài khoản nhận tiền" description="Đăng ký tài khoản ngân hàng mang tên pháp lý của hộ nuôi." /><OpPanel title="Thông tin ngân hàng"><PayoutAccountForm owner="Operator" /></OpPanel></OperatorLayout>
}
