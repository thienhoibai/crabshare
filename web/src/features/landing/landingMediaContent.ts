/** Public files are served from web/public. Each src is its root-relative URL,
 * e.g. public/landing/camera-box.jpg => /landing/camera-box.jpg.
 * Only add actual photos, recordings and measured-data captures; fixture screenshots,
 * renders and AI-generated pictures are not evidence. No extra metadata is required.
 */
export interface ProjectCapture { src: string; alt: string }

export interface LandingMediaContent {
  /** Silent 8–12 second real rack/camera/scales clip; muted loop, reduced-motion aware. */
  heroLoop?: ProjectCapture
  /** Full real film around one minute; opens with sound on request. */
  film?: ProjectCapture
  /** Actual project farm rack photograph. */
  rack?: ProjectCapture
  /** Actual camera capture of one rearing box. */
  box?: ProjectCapture
  /** Screenshot of actual temperature, salinity and pH records. */
  water?: ProjectCapture
  /** White-light photo, red-light photo and result from the same grading session. */
  grading?: { white: ProjectCapture; red: ProjectCapture; result: ProjectCapture }
  /** Hình chibi của ba vai ở mục "Bạn tham gia với vai nào?" (hình vẽ nhóm gửi, PNG nền trong).
   * Đây là hình minh hoạ, không phải bằng chứng; thiếu hình thì thẻ dùng biểu tượng.
   * Ví dụ: roles: { farmer: '/landing/vai/nguoi-nuoi.png' }. */
  roles?: Partial<Record<'farmer' | 'investor' | 'buyer', string>>
}

/** This manifest is consumed by the hero, the evidence section and the role cards automatically.
 * Add the real files to public/landing, fill the relevant property and rebuild.
 * Example shape: rack: { src: '/landing/rack.jpg', alt: 'Dàn hộp tại trại …' }.
 * Leave unavailable slots omitted; the page will not request or show placeholders.
 */
export const LANDING_MEDIA: LandingMediaContent = {
  roles: { farmer: '/landing/vai/nguoi-nuoi.webp', investor: '/landing/vai/nha-dau-tu.webp', buyer: '/landing/vai/khach-mua-si.webp' },
}
