/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  /** "true" lúc build thì bản build có các nút công cụ demo (shared/demoTools.ts). */
  readonly VITE_DEMO_TOOLS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
