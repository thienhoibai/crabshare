import { expect, paged, signIn, test } from './support/app'
import { CODE, decisionOf, deviceOf, measurementsOf, mockOperator, sessionOf } from './support/operator'

for (const mode of ['draft', 'held', 'approved', 'mismatch', 'no-decision'] as const) {
  test(`đánh giá lượt cân: ${mode}`, async ({ api, page }) => {
    mockOperator(api)
    await signIn(page, 'OperatorMember')
    const session = sessionOf({ sessionNo: 'SAVED', crabCode: 'C-000101', gradeAiTag: 'LA-001', status: 'Measured', weightG: 452 })
    const open = sessionOf({ sessionNo: 'NEXT', crabCode: 'C-000102', gradeAiTag: 'LA-002' })
    const decision = decisionOf({ sessionNo: session.sessionNo, proposedSize: 'OUT', proposedCLevel: 'G1', cIndex: 0.5442,
      ...(mode === 'held' ? { status: 'Hold', holdReasons: ['ImageQuality', 'CaliperRequired'], proposedCLevel: null, cIndex: null } : {}),
      ...(mode === 'approved' ? { status: 'Approved', finalGrade: 'SPECIAL', finalSize: 'XL' } : {}),
      ...(mode === 'mismatch' ? { crabCode: 'OTHER-CRAB' } : {}),
    })
    api.get('/api/operators/me/devices', [deviceOf()])
    api.get('/api/operators/me/devices/ST-01/station-state', { fresh: false, receivedAt: null, state: null })
    api.get('/api/operators/me/devices/ST-01/wifi', null)
    api.get('/api/operators/me/devices/ST-01/measurement-sessions/NEXT/start', null)
    api.get(`/api/batches/${CODE}/measurement-sessions`, call => paged(call.query.status === 'Open' ? [open] : [open, session]))
    api.get('/api/measurement-sessions/SAVED/measurements', measurementsOf(session, { decision: mode === 'no-decision' ? null : decision }))

    await page.goto(`/operator/devices?batch=${CODE}`)
    const assessment = page.getByRole('region', { name: 'Đánh giá phân hạng cua' })
    await expect(assessment).toContainText('Lượt SAVED')
    await expect(assessment).toContainText('Đây là kết quả lượt trước. Lượt đang mở: LA-002')
    await expect(assessment).toContainText('chưa xác nhận độ chắc thịt hoặc phần trăm thịt')
    if (mode === 'draft') {
      await expect(assessment).toContainText('Đề xuất · Chờ QC')
      await expect(assessment).toContainText('Chỉ số C: 0,5442')
      await expect(assessment).toContainText('Cấp 1')
      await expect(assessment).toContainText('Bộ quy tắc v2')
      await expect(assessment).toContainText('Khối lượng ngoài quy cách của lô')
    } else if (mode === 'held') {
      await expect(assessment).toContainText('Cần kiểm tra lại')
      await expect(assessment).toContainText('Ảnh chưa đạt')
      await expect(assessment).toContainText('Cần đo thước kẹp')
      await expect(assessment).not.toContainText('Cấp 1')
    } else if (mode === 'approved') {
      await expect(assessment).toContainText('QC đã duyệt')
      await expect(assessment).toContainText('Đặc cấp')
      await expect(assessment).toContainText('Cỡ XL')
    } else {
      await expect(assessment).toContainText('Chưa có đề xuất')
      await expect(assessment).not.toContainText('Cấp 1')
    }
    expect(api.writes()).toEqual([])
  })
}
