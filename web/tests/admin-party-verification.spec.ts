import type { PartyDocumentResponse, PartyDossierResponse, PartyResponse } from '../src/shared/api/api.gen'
import { expect, file, PNG, signIn, test } from './support/app'
import { mockAdmin } from './support/admin'

test('admin chỉ có thể xác minh tổ chức có tài khoản sau khi tổ chức gửi giấy tờ', async ({ page, api }) => {
  mockAdmin(api)
  await signIn(page, 'PlatformAdmin')
  const party: PartyResponse = {
    partyId: 23, partyCode: 'DT00000023', legalName: 'Doanh nghiệp Hải Sản', partyType: 'Company',
    registrationNo: '0300000023', representative: 'Nguyễn An', phone: null, verificationStatus: 'Unverified',
    rejectReason: null, isPlatform: false, roles: [], sites: [], legalDossierVerified: false,
  }
  const document: PartyDocumentResponse = {
    documentId: 5, docType: 'BusinessRegistration', contentType: 'image/png', note: null, uploadedAt: '2026-11-18T03:00:00Z',
  }
  const dossier: PartyDossierResponse = {
    accounts: [{
      userId: 3, fullName: 'Nguyễn An', email: 'dai-dien@example.test', phone: null, status: 'Active',
      roles: ['Investor'], investorVerification: 'Verified', ekycResult: 'Passed', ekycCheckedAt: null, ekycFailureReason: null,
    }],
    documents: [],
  }
  const endpoint = '/api/admin/parties/23'
  api.get(endpoint, () => party)
  api.get(`${endpoint}/dossier`, () => dossier)
  api.get(`${endpoint}/documents/5/file`, file(PNG, 'image/png'))
  api.post(`${endpoint}/verify`, () => {
    party.verificationStatus = 'Verified'
    party.legalDossierVerified = true
    return party
  })

  await page.goto('/admin/parties/23')
  const verify = page.getByRole('button', { name: 'Xác minh', exact: true })
  await expect(page.getByText(/Đối tác chưa gửi giấy tờ pháp lý/)).toBeVisible()
  await expect(verify).toBeDisabled()

  dossier.documents = [document]
  await page.reload()
  await page.getByRole('button', { name: 'Xem lớn: Giấy chứng nhận đăng ký' }).click()
  const preview = page.getByRole('dialog', { name: 'Giấy chứng nhận đăng ký' })
  await expect(preview.getByRole('img', { name: 'Giấy chứng nhận đăng ký' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(preview).toBeHidden()

  await verify.click()
  await page.getByRole('dialog', { name: 'Xác minh đối tác' }).getByRole('button', { name: 'Xác minh' }).click()
  await expect(verify).toHaveCount(0)
  expect(api.sent('POST', `${endpoint}/verify`)).toHaveLength(1)
})
