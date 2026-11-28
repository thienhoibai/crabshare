/* /dieu-khoan — Điều khoản sử dụng CrabShare. Nội dung bám Business Rule v1.5 và Phiếu FA26SE229 v1.7.
   Đây là bản cho đồ án SEP490; chưa qua rà soát pháp lý và tích hợp thanh toán là môi trường thử nghiệm. */
import SiteShell from '../../shared/layout/SiteShell'

const UPDATED = '28/11/2026'

const SECTIONS: { title: string; body: (string | string[])[] }[] = [
  {
    title: '1. Giới thiệu và chấp thuận',
    body: [
      'CrabShare là nền tảng giao dịch cua B2B và chia sẻ doanh thu theo từng lô thương mại, vận hành theo mô hình nuôi cua trong hộp bằng hệ thống lọc nước tuần hoàn (RAS). Khi tạo tài khoản và đánh dấu "Tôi đồng ý điều khoản sử dụng", bạn xác nhận đã đọc, hiểu và đồng ý bị ràng buộc bởi Điều khoản này cùng Chính sách dữ liệu ở mục 9.',
      'Nếu không đồng ý, vui lòng không tạo tài khoản hoặc sử dụng dịch vụ. Một số giao dịch (góp vốn, đặt hàng) còn có hợp đồng hoặc điều khoản riêng của từng lô; khi có mâu thuẫn, hợp đồng của lô được ưu tiên cho phần giao dịch đó.',
    ],
  },
  {
    title: '2. Tài khoản và vai trò',
    body: [
      'Bạn đăng ký là Khách hàng (đặt trước cua) hoặc Nhà đầu tư (góp vốn vào lô). Vai trò Hộ nuôi, Kiểm phẩm viên và Quản trị viên do CrabShare cấp sau khi xét duyệt, không tự đăng ký.',
      [
        'Cung cấp thông tin trung thực, chính xác, đầy đủ và cập nhật khi có thay đổi.',
        'Mỗi tài khoản do một người dùng; bạn tự bảo mật mật khẩu và chịu trách nhiệm cho hoạt động dưới tài khoản của mình. Hãy báo ngay cho chúng tôi nếu nghi ngờ bị lộ.',
        'Không mạo danh, không dùng tài khoản của người khác, không tạo nhiều tài khoản để lách quy tắc của hệ thống.',
        'CrabShare có quyền tạm khóa hoặc chấm dứt tài khoản vi phạm điều khoản, có dấu hiệu gian lận hoặc không hoàn thành xác minh theo yêu cầu.',
      ],
    ],
  },
  {
    title: '3. Xác minh danh tính',
    body: [
      [
        'Nhà đầu tư là cá nhân phải xác minh eKYC thành công trước khi đặt giữ vốn. Nhà đầu tư là tổ chức được Quản trị viên xét hồ sơ pháp lý.',
        'Khách hàng là cá nhân xác minh căn cước công dân; hộ kinh doanh, doanh nghiệp và hợp tác xã tải hồ sơ pháp lý theo hướng dẫn.',
        'CrabShare chỉ lưu kết quả eKYC đã mã hóa, thời điểm và mã tham chiếu xác minh; không lưu ảnh giấy tờ định danh.',
      ],
    ],
  },
  {
    title: '4. Mô hình giao dịch theo lô',
    body: [
      'Mỗi Lô thương mại (CommercialBatch) là một thương vụ độc lập, có tiền, nguồn hàng, đơn hàng và quyết toán riêng; tiền và rủi ro không chuyển giữa các lô. Chế độ của lô (hợp tác lô, CrabShare mua bán, kết nối đại lý) được cố định từ khi duyệt và hiển thị công khai.',
      'Trang chuẩn phân hạng và thông tin truy xuất là tham chiếu nội bộ phục vụ minh bạch, không phải chứng nhận của cơ quan nhà nước. Mã định danh từng con cua chỉ dùng nội bộ để truy xuất, đo và phân bổ.',
    ],
  },
  {
    title: '5. Điều khoản dành cho Nhà đầu tư',
    body: [
      [
        'Góp vốn có rủi ro, kể cả mất một phần hoặc toàn bộ vốn góp. CrabShare không cam kết hay công bố mức sinh lời kỳ vọng; hệ thống chỉ hiển thị số liệu thực: vốn, chi phí chuẩn, doanh thu thực thu và quyết toán.',
        'Khoản góp chỉ được xác nhận khi bạn thanh toán đủ và hoàn tất ký thỏa thuận theo thứ tự. Nếu đến hạn mà thiếu thanh toán hoặc chữ ký, khoản góp bị loại và số tiền đã nộp được hoàn lại.',
        'Sau khi được xác nhận, bạn không thể tự rút vốn. Nếu lô không đủ điều kiện mở (vốn tối thiểu, tỷ lệ đặt trước tối thiểu), toàn bộ khoản góp được hoàn tự động theo quy tắc của lô. Phần vốn không đủ mua trọn một con cua được hoàn theo tỷ lệ.',
        'Vốn được giải ngân cho Hộ nuôi theo mốc có kiểm chứng và được Quản trị viên duyệt; bạn xem được số vốn đã góp, đã giải ngân và đang giữ.',
        'Lợi nhuận chia sẻ được tính từ Quỹ doanh thu sau khi trừ phí nền tảng và chi phí khấu trừ đã chọn trong thỏa thuận trước khi mở góp vốn. Nếu lỗ, bạn chịu lỗ tối đa bằng số vốn đã góp, không phải góp thêm vốn và lỗ không chuyển sang lô khác.',
        'Bạn có 7 ngày để phản hồi bản quyết toán được công bố. Bản quyết toán sau khi được duyệt là bất biến.',
        'Thanh lý sớm chỉ được thực hiện khi có quyết định tập thể theo tỷ trọng vốn góp, loại trừ phiếu của bên có xung đột lợi ích.',
      ],
    ],
  },
  {
    title: '6. Điều khoản dành cho Khách hàng',
    body: [
      [
        'Bạn đặt trước theo quy cách (loại, kích cỡ, hạng, tình trạng), không chọn hộp hay từng con cua. Đơn có thể chia thành nhiều đợt giao; tổng các đợt bằng đúng số lượng của dòng hàng.',
        'Đơn chỉ được giữ chỗ khi đã đặt cọc đúng hạn. Tiền cọc là tiền giữ hộ, không phải doanh thu; đơn quá hạn chưa cọc sẽ bị hủy và hàng được nhả lại, khoản cọc đến muộn được hoàn.',
        'Giá khóa theo từng quy cách và khối lượng thực tế được cân hai lần (khi xuất và khi nhận). Số dư mỗi đợt bằng giá trị hàng được chấp nhận trừ phần cọc tương ứng; nếu âm, phần dư được hoàn.',
        'Từ chối nhận hàng hoặc không thanh toán số dư có thể dẫn tới mất cọc và hàng được bán lại theo hóa đơn.',
        'Khiếu nại phải gửi trong mặc định 72 giờ kể từ khi nhận, kèm bằng chứng chụp trong ứng dụng. Hộ nuôi phản hồi trong 48 giờ; quá hạn vụ việc chuyển Quản trị viên quyết định.',
        'Hộ nuôi và các bên liên quan không được đặt hàng chính lô của mình. Nhà đầu tư có thể mua với tư cách Khách hàng; tiền cọc luôn tách biệt với vốn góp.',
      ],
    ],
  },
  {
    title: '7. Thanh toán và đối soát',
    body: [
      [
        'Thanh toán thực hiện qua chuyển khoản/VietQR vào tài khoản của từng lô do tổ chức trung gian thanh toán giữ; CrabShare phát lệnh và đối soát, không tự giữ tiền cá nhân của bạn.',
        'Mọi số tiền tính bằng đồng Việt Nam, số nguyên. Giao dịch trùng mã tham chiếu chỉ được ghi nhận một lần; giao dịch không khớp được Quản trị viên đối soát thủ công.',
        'Phí nền tảng được tính theo tỷ lệ cố định của lô trên doanh thu thực thu, thu một lần khi quyết toán và không trừ vào vốn huy động.',
        'Trong phạm vi đồ án SEP490, tích hợp thanh toán và eKYC là môi trường mô phỏng, chưa chuyển tiền thật. Bạn không nên chuyển tiền thật qua nền tảng ở giai đoạn này.',
      ],
    ],
  },
  {
    title: '8. Hành vi bị cấm',
    body: [
      [
        'Cung cấp thông tin sai sự thật, làm giả giấy tờ, bằng chứng hoặc hình ảnh (kể cả tải ảnh từ thư viện thay cho ảnh chụp trực tiếp khi hệ thống yêu cầu).',
        'Gian lận thanh toán, rửa tiền, hoặc dùng nền tảng cho mục đích trái pháp luật.',
        'Can thiệp trái phép vào hệ thống, thiết bị đo, dữ liệu cảm biến, API; dò quét lỗ hổng; tấn công hoặc làm gián đoạn dịch vụ.',
        'Thao túng đặt hàng, giữ chỗ hàng loạt nhằm cản trở người dùng khác; dùng bot hoặc công cụ tự động ngoài cho phép.',
        'Công bố dữ liệu cá nhân của người khác hoặc đưa thông tin sai lệch về mức sinh lời, kết quả của lô.',
      ],
    ],
  },
  {
    title: '9. Dữ liệu cá nhân và nhật ký hệ thống',
    body: [
      [
        'Chúng tôi thu thập thông tin bạn cung cấp (họ tên, email, số điện thoại, địa chỉ, hồ sơ pháp lý, tài khoản nhận tiền) và dữ liệu giao dịch để vận hành dịch vụ, xác minh, thanh toán, đối soát, giải quyết khiếu nại và tuân thủ quy định.',
        'Trang công khai chỉ hiển thị dữ liệu tổng hợp hoặc truy xuất được phép, không lộ dữ liệu cá nhân của khách hàng hay nhà đầu tư. Nhà đầu tư chỉ thấy dòng quyết toán của chính mình cùng tổng của lô.',
        'Các thay đổi về tiền, hợp đồng, chi phí, phân hạng và trạng thái được ghi vào nhật ký kiểm toán chỉ thêm, có chuỗi băm, nên không thể xóa; yêu cầu xóa dữ liệu không áp dụng cho các bản ghi này trong thời gian cần lưu giữ theo quy định.',
        'Ảnh bằng chứng được chụp trong ứng dụng kèm thời gian máy chủ, vị trí và mã băm. Ảnh từ thiết bị đo là dữ liệu giám sát, không phải bằng chứng.',
        'Chúng tôi áp dụng biện pháp bảo mật hợp lý, không bán dữ liệu cá nhân của bạn và chỉ chia sẻ với bên xử lý thanh toán, xác minh hoặc cơ quan có thẩm quyền khi cần thiết.',
      ],
    ],
  },
  {
    title: '10. Trí tuệ nhân tạo và thiết bị đo',
    body: [
      'Kết quả đo và đề xuất phân hạng từ trạm GradeAI chỉ mang tính đề xuất; nhân viên kiểm phẩm được phân công ngẫu nhiên là người xác nhận hoặc từ chối. Chỉ số C là chỉ số hình thái, không phải tỷ lệ thịt. Dữ liệu cảm biến nước chỉ để theo dõi, hệ thống không cam kết cảnh báo mọi biến động.',
    ],
  },
  {
    title: '11. Giới hạn trách nhiệm',
    body: [
      [
        'Dịch vụ được cung cấp "như hiện có". Chúng tôi nỗ lực duy trì hoạt động liên tục nhưng không bảo đảm không gián đoạn hoặc không có lỗi.',
        'CrabShare không chịu trách nhiệm về tổn thất do rủi ro vốn có của nuôi trồng (cua chết, dịch bệnh, thời tiết), biến động giá thị trường, sự kiện bất khả kháng, hoặc do bạn cung cấp sai thông tin, để lộ mật khẩu.',
        'Trong phạm vi pháp luật cho phép, trách nhiệm của CrabShare đối với một sự kiện không vượt quá giá trị giao dịch liên quan trực tiếp tới sự kiện đó.',
      ],
    ],
  },
  {
    title: '12. Thay đổi, chấm dứt và giải quyết tranh chấp',
    body: [
      [
        'Chúng tôi có thể cập nhật Điều khoản; bản mới được đăng tại trang này kèm ngày cập nhật và thông báo trong ứng dụng khi thay đổi quan trọng. Tiếp tục sử dụng sau ngày hiệu lực nghĩa là bạn chấp nhận bản mới. Thay đổi không làm thay đổi các giao dịch đã khóa điều khoản của lô.',
        'Bạn có thể ngừng sử dụng bất cứ lúc nào, nhưng vẫn phải hoàn thành nghĩa vụ phát sinh đối với lô đang tham gia.',
        'Tranh chấp được ưu tiên giải quyết thương lượng qua kênh khiếu nại trong ứng dụng; nếu không thành, áp dụng pháp luật Việt Nam và giải quyết tại Tòa án có thẩm quyền tại Việt Nam.',
      ],
    ],
  },
  {
    title: '13. Liên hệ',
    body: ['Mọi thắc mắc về Điều khoản vui lòng gửi qua mục hỗ trợ trong ứng dụng hoặc liên hệ nhóm dự án CrabShare (SEP490 · FA26SE229).'],
  },
]

export function TermsBody() {
  return (
    <>
      {SECTIONS.map((s) => (
        <section key={s.title} className="op-stack" style={{ gap: 8 }}>
          <h2 style={{ fontSize: 18 }}>{s.title}</h2>
          {s.body.map((b, i) =>
            Array.isArray(b)
              ? <ul key={i} style={{ paddingLeft: 20, display: 'grid', gap: 6 }}>{b.map((li) => <li key={li}>{li}</li>)}</ul>
              : <p key={i}>{b}</p>,
          )}
        </section>
      ))}
    </>
  )
}

export const TERMS_UPDATED = UPDATED

export default function TermsPage() {
  return (
    <SiteShell narrow>
      <article className="op-stack" style={{ gap: 20 }}>
        <header>
          <p className="rd-eyebrow">Pháp lý</p>
          <h1 className="rd-h2">Điều khoản sử dụng</h1>
          <p className="rd-muted" style={{ fontSize: 14 }}>Cập nhật lần cuối: {UPDATED}. Bản đồ án SEP490, chưa qua rà soát pháp lý chính thức.</p>
        </header>
        <TermsBody />
      </article>
    </SiteShell>
  )
}

