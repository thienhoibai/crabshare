/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_TEAM_CONTACT_EMAIL?: string
  /** Địa chỉ bản mô hình 3D (CrabShare Twin) nhúng ở mục Công nghệ của trang chủ. */
  readonly VITE_TWIN_URL?: string
  /** "true" lúc build thì bản build có các nút công cụ demo (shared/demoTools.ts). */
  readonly VITE_DEMO_TOOLS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
