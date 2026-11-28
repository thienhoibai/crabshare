/* Bộ chọn địa chỉ 2 cấp Việt Nam sau sáp nhập (34 Tỉnh/Thành phố → Phường/Xã/Đặc khu + Số nhà/đường).
   Tự phân giải toạ độ (latitude, longitude) ở hậu trường để tính bán kính giao hàng (BR-084) mà người dùng không phải nhập tay. */
import { useEffect, useState } from 'react'
import { Field, Input, Select } from '../ui/console'

export interface VnProvince {
  code: number
  name: string
  lat: number
  lng: number
  wards: string[]
}

export interface VnAddressValue {
  provinceName: string
  wardName: string
  streetLine: string
}

let cachedProvinces: VnProvince[] | null = null
let loadingProvinces: Promise<VnProvince[]> | null = null

export function loadVnProvinces(): Promise<VnProvince[]> {
  if (cachedProvinces) return Promise.resolve(cachedProvinces)
  if (!loadingProvinces) {
    loadingProvinces = fetch('/vn-admin-2025.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load vn-admin-2025.json')
        return res.json() as Promise<VnProvince[]>
      })
      .then((list) => {
        cachedProvinces = list
        return list
      })
      .catch(() => [])
  }
  return loadingProvinces
}

function normalize(text: string) {
  return text.trim().toLowerCase()
}

const stripPrefix = (text: string) => text.replace(/^(?:tỉnh|thành phố|tp\.?)\s+/u, '')

export function findVnProvince(provinces: VnProvince[], rawProvince?: string | null): VnProvince | undefined {
  if (!rawProvince) return undefined
  const q = stripPrefix(normalize(rawProvince))
  return provinces.find((p) => {
    const full = normalize(p.name)
    return full === normalize(rawProvince) || stripPrefix(full) === q
  })
}

/** Tách địa chỉ cũ (addressLine + province) thành Tỉnh/Thành phố, Phường/Xã và số nhà/đường khi mở form sửa. */
export function parseVnAddress(provinces: VnProvince[], addressLine?: string | null, province?: string | null): VnAddressValue {
  const matched = findVnProvince(provinces, province)
  const rawLine = (addressLine ?? '').trim()
  if (!matched) {
    return { provinceName: province?.trim() ?? '', wardName: '', streetLine: rawLine }
  }
  for (const ward of matched.wards) {
    const suffix = `, ${ward}`
    if (normalize(rawLine).endsWith(normalize(suffix))) {
      return {
        provinceName: matched.name,
        wardName: ward,
        streetLine: rawLine.slice(0, rawLine.length - suffix.length).trim(),
      }
    }
  }
  return { provinceName: matched.name, wardName: '', streetLine: rawLine }
}

/** Ghép phần số nhà/đường và Phường/Xã thành addressLine lưu trong DB. */
export function composeVnAddress(streetLine: string, wardName: string): string {
  const s = streetLine.trim()
  const w = wardName.trim()
  if (!w) return s
  if (!s) return w
  return normalize(s).endsWith(normalize(w)) ? s : `${s}, ${w}`
}

async function geocodeNominatim(query: string): Promise<{ latitude: number; longitude: number } | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 2500)
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=vn&q=${encodeURIComponent(query)}`
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const hits = (await res.json()) as Array<{ lat?: string; lon?: string }>
    const first = hits[0]
    if (!first?.lat || !first?.lon) return null
    const latitude = Number(Number(first.lat).toFixed(6))
    const longitude = Number(Number(first.lon).toFixed(6))
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null
    return { latitude, longitude }
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

/** Tự phân giải toạ độ ở hậu trường: ưu tiên geocode theo phường/xã + tỉnh; offline dùng ngay toạ độ tỉnh/thành chuẩn. */
export async function resolveVnCoordinates(
  provinces: VnProvince[],
  value: VnAddressValue,
  existing?: { latitude: number | null; longitude: number | null; addressLine: string; province: string | null },
): Promise<{ latitude: number | null; longitude: number | null }> {
  const nextLine = composeVnAddress(value.streetLine, value.wardName)
  const nextProvince = value.provinceName.trim()
  const matched = findVnProvince(provinces, nextProvince)
  const sameProvince =
    (existing?.province ?? '') === nextProvince ||
    (!!existing?.province && !!matched && findVnProvince(provinces, existing.province)?.code === matched.code)
  if (
    existing &&
    existing.latitude !== null &&
    existing.longitude !== null &&
    existing.addressLine === nextLine &&
    sameProvince
  ) {
    return { latitude: existing.latitude, longitude: existing.longitude }
  }

  if (nextProvince) {
    const specificQuery = [value.wardName, nextProvince, 'Việt Nam'].filter(Boolean).join(', ')
    const hit = await geocodeNominatim(specificQuery)
    if (hit) return hit
  }
  if (matched) {
    return { latitude: matched.lat, longitude: matched.lng }
  }
  return existing ? { latitude: existing.latitude, longitude: existing.longitude } : { latitude: null, longitude: null }
}

export function VnAddressPicker({
  value,
  onChange,
  provinces,
  streetPlaceholder = 'Số nhà, tên đường / ấp, khóm…',
  streetLabel = 'Số nhà, đường / ấp, khóm',
}: {
  value: VnAddressValue
  onChange: (next: VnAddressValue) => void
  provinces: VnProvince[]
  streetPlaceholder?: string
  streetLabel?: string
}) {
  const [wardFilter, setWardFilter] = useState('')
  const matchedProvince = findVnProvince(provinces, value.provinceName)
  const wards = matchedProvince?.wards ?? []
  const filteredWards = wardFilter.trim()
    ? wards.filter((w) => normalize(w).includes(normalize(wardFilter)))
    : wards
  const legacyProvince = !!value.provinceName && !matchedProvince

  return (
    <>
      <div className="op-form__row">
        <Field label="Tỉnh / Thành phố" required>
          <Select
            value={matchedProvince?.name ?? value.provinceName}
            onChange={(e) => {
              setWardFilter('')
              onChange({ ...value, provinceName: e.target.value, wardName: '' })
            }}
          >
            <option value="">Chọn Tỉnh / Thành phố</option>
            {legacyProvince && <option value={value.provinceName}>{value.provinceName}</option>}
            {provinces.map((p) => <option key={p.code} value={p.name}>{p.name}</option>)}
          </Select>
        </Field>

        <Field label="Phường / Xã / Đặc khu" required={wards.length > 0}>
          <Select
            value={value.wardName}
            disabled={!matchedProvince}
            onChange={(e) => onChange({ ...value, wardName: e.target.value })}
          >
            <option value="">{matchedProvince ? 'Chọn Phường / Xã' : 'Chọn Tỉnh / Thành phố trước'}</option>
            {value.wardName && !filteredWards.includes(value.wardName) && (
              <option value={value.wardName}>{value.wardName}</option>
            )}
            {filteredWards.map((w) => <option key={w} value={w}>{w}</option>)}
          </Select>
        </Field>
      </div>

      {matchedProvince && wards.length > 20 && (
        <Field label="Tìm nhanh Phường / Xã" hint="Gõ tên xã, phường hoặc đặc khu để thu gọn danh sách phía trên.">
          <Input
            sm
            type="search"
            value={wardFilter}
            onChange={(e) => setWardFilter(e.target.value)}
            placeholder="Ví dụ: Hàng Vịnh, Bạc Liêu, Sài Gòn…"
          />
        </Field>
      )}

      <Field label={streetLabel} required>
        <Input
          value={value.streetLine}
          maxLength={220}
          autoComplete="street-address"
          placeholder={streetPlaceholder}
          onChange={(e) => onChange({ ...value, streetLine: e.target.value })}
        />
      </Field>
    </>
  )
}

export function useVnProvinces() {
  const [provinces, setProvinces] = useState<VnProvince[]>(cachedProvinces ?? [])
  useEffect(() => {
    if (cachedProvinces) return
    let active = true
    void loadVnProvinces().then((list) => {
      if (active) setProvinces(list)
    })
    return () => { active = false }
  }, [])
  return provinces
}
