/* Một điểm nhập cho bộ giao diện khu điều hành: import { OpPanel, Field, useGet … } from '../../shared/ui/console'. */
export * from './ui'
export * from './parts'
export * from './toast'
export { label, tone, options, specName, type StatusKind } from './status'
export { AREAS, areasFor, type Area } from './nav'
export { useGet, useSend, useBlobUrl, fetchBlob, openFile, toFormData } from '../../api/hooks'
export { errorMessage, http, API_URL } from '../../api/http'
export { formatVnd, formatDate, formatDateTime, moneyToWords } from '../../lib/format'
