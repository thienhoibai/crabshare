import { Building2, ContactRound, Crop, ScanLine, Store, Sun, UsersRound } from 'lucide-react'

const individual = {
  label: 'Cá nhân',
  icon: ContactRound,
  document: 'Thẻ căn cước',
  example: 'Người mua đứng tên mình khi đặt cua cho quán.',
}

export const organizationGuides = {
  Household: {
    label: 'Hộ kinh doanh',
    icon: Store,
    sample: 'household.jpg',
    document: 'Giấy chứng nhận đăng ký hộ kinh doanh',
    example: 'Một vựa cua gia đình đã đăng ký dưới tên hộ kinh doanh.',
  },
  Company: {
    label: 'Doanh nghiệp',
    icon: Building2,
    sample: 'company.jpg',
    document: 'Giấy chứng nhận đăng ký doanh nghiệp',
    example: 'Người đại diện đăng ký cho một công ty TNHH kinh doanh hải sản.',
  },
  Cooperative: {
    label: 'Hợp tác xã',
    icon: UsersRound,
    sample: 'cooperative.jpg',
    document: 'Giấy chứng nhận đăng ký hợp tác xã',
    example: 'Nhiều hộ nuôi cùng bán cua dưới tên một HTX đã đăng ký. Chọn mục này khi giao dịch đứng tên HTX và tài khoản do người đại diện đứng tên.',
  },
}

export default function PartyVerificationGuide({ type, investor }: { type: string; investor: boolean }) {
  const organization = organizationGuides[type as keyof typeof organizationGuides]
  const guide = organization ?? individual
  const Icon = guide.icon

  return (
    <aside className="setup-card setup-party-guide">
      <div className="setup-guide-heading">
        <Icon aria-hidden="true" />
        <div>
          <span>{guide.label}</span>
          <h3>{organization ? guide.document : investor ? 'Xác minh danh tính' : 'Đăng ký bằng tên của bạn'}</h3>
        </div>
      </div>
      <p>{guide.example}</p>
      <figure className="setup-guide-figure">
        {organization ? (
          <img className="setup-guide-certificate" src={'/profile-samples/' + organization.sample}
            alt={organization.document + ', ảnh mẫu'} />
        ) : <div className="setup-guide-art" aria-hidden="true">
          <div className="setup-guide-paper">
            <Icon />
            <div><b>{guide.label}</b><i /><i /><i /></div>
          </div>
          {investor && <ScanLine className="setup-guide-scan" />}
        </div>}
        <figcaption>{organization ? 'Ảnh mẫu giấy chứng nhận' : 'Minh họa thẻ căn cước'}</figcaption>
      </figure>
      {organization && <div className="setup-guide-photo-tips">
        <span><Crop aria-hidden="true" /> Đủ bốn góc</span>
        <span><ScanLine aria-hidden="true" /> Rõ chữ</span>
        <span><Sun aria-hidden="true" /> Tránh lóa</span>
      </div>}
      {organization ? <ul>
        <li>Dùng tên pháp lý và số đăng ký (nếu có) trên giấy chứng nhận. Điền thông tin người đại diện.</li>
        <li>Chụp hoặc quét đủ các trang. Gửi tệp PDF, JPEG, PNG hoặc WebP, tối đa 5 MB mỗi tệp.</li>
        <li>Gửi giấy tờ để quản trị viên đối chiếu hồ sơ.</li>
      </ul> : investor ? <ul>
        <li>Chuẩn bị bản gốc thẻ căn cước và chụp ở nơi đủ sáng.</li>
        <li>Chụp hai mặt thẻ và ảnh khuôn mặt theo hướng dẫn. Nhà đầu tư cá nhân cần xác minh đạt trước khi giữ chỗ góp vốn.</li>
      </ul> : <p>Khách hàng B2B đứng tên cá nhân có thể tiếp tục mà không cần eKYC.</p>}
    </aside>
  )
}
