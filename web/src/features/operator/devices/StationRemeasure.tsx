import type { SessionResponse } from '../../../shared/api/api.gen'
import { errorMessage, OpBtn, OpModal, OpNote, useSend } from '../../../shared/ui/console'

export function StationRemeasure({ session, stationCode, disabled, onClose, onOpened }: {
  session: SessionResponse; stationCode: string; disabled: boolean
  onClose: () => void; onOpened: (no: string) => void
}) {
  const open = useSend<SessionResponse, { stationCode: string }>('post',
    `/api/measurement-sessions/${encodeURIComponent(session.sessionNo)}/remeasure`, {
      quietError: true,
      onSuccess: result => { onOpened(result.sessionNo); onClose() },
    })
  return <OpModal title={`Cân lại · ${session.gradeAiTag ?? session.crabCode}`} sub={`Lô ${session.batchCode} · Trạm ${stationCode}`} onClose={onClose}>
    <p>Tạo lượt đo mới cho chính con cua này. Số cân và ảnh cũ được giữ trong lịch sử; kết quả mới vẫn chờ QC duyệt.</p>
    <p>Lượt cũ: <strong>{session.sessionNo}</strong>{session.weightG != null && <> · {session.weightG.toLocaleString('vi-VN')} g</>}</p>
    <OpNote>Sau khi mở lượt, đặt đúng con cua vào khay, đóng cửa và bấm “Bắt đầu cân” trên web hoặc nút trên trạm.</OpNote>
    {disabled && <OpNote>Trạm đang bận hoặc có lượt đang mở. Hoàn thành hoặc hủy lượt đó trước.</OpNote>}
    {open.isError && <OpNote tone="danger">{errorMessage(open.error)}</OpNote>}
    <OpBtn disabled={disabled || open.isPending} onClick={() => open.mutate({ stationCode })}>
      {open.isPending ? 'Đang mở lượt…' : 'Mở lượt cân lại'}
    </OpBtn>
  </OpModal>
}
