/* Hộp thoại hiện khoá thiết bị đúng một lần sau khi đăng ký hoặc đổi khoá (BR-116, BR-230). Máy chủ chỉ lưu mã băm của khoá. */
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Checkbox, Field, Input, OpBtn, OpModal, OpNote, toast } from '../../../shared/ui/console'

export default function DeviceKeyDialog({ deviceCode, deviceKey, rotated, onClose }: {
  deviceCode: string
  deviceKey: string
  /** true: khoá mới sau khi đổi khoá; false: khoá của thiết bị vừa đăng ký. */
  rotated: boolean
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [stored, setStored] = useState(false)

  // Bấm ra ngoài, phím Esc hay nút X đều không đóng khi chưa xác nhận đã lưu, để không lỡ tay làm mất khoá.
  const guardedClose = () => {
    if (stored) onClose()
    else toast('Chép khoá và đánh dấu đã lưu trước khi đóng. Khoá không hiện lại được.', 'info')
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(deviceKey)
      setCopied(true)
      toast('Đã chép khoá thiết bị.')
    } catch {
      toast('Trình duyệt không cho chép tự động. Bấm vào ô khoá rồi chép tay.', 'danger')
    }
  }

  return (
    <OpModal
      title={rotated ? `Khoá mới của ${deviceCode}` : `Đã đăng ký ${deviceCode}`}
      onClose={guardedClose}
    >
      <OpNote tone="danger"><b>Khoá chỉ hiện một lần.</b> Chưa lưu mà đóng thì phải đổi khoá mới.</OpNote>
      <Field label="Khoá thiết bị" hint="Gửi kèm ở header X-Device-Key.">
        <Input className="op-mono" readOnly value={deviceKey} onFocus={(e) => e.currentTarget.select()} />
      </Field>
      <OpBtn full onClick={() => void copy()}>
        {copied ? <Check size={17} /> : <Copy size={17} />} {copied ? 'Đã chép' : 'Chép khoá'}
      </OpBtn>
      <Checkbox checked={stored} onChange={setStored}>Tôi đã lưu khoá.</Checkbox>
      <div className="op-modal__foot">
        <OpBtn variant="ghost" disabled={!stored} onClick={onClose}>Đóng</OpBtn>
      </div>
    </OpModal>
  )
}
