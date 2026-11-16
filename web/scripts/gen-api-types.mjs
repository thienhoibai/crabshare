// Sinh kiểu TypeScript và bảng endpoint từ OpenAPI của backend.
// Dùng: node scripts/gen-api-types.mjs [http://localhost:5233/openapi/v1.json | đường dẫn file json]
// Kết quả: src/shared/api/api.gen.ts (kiểu dữ liệu) và src/shared/api/endpoints.gen.md (bảng endpoint để tra cứu).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = process.argv[2] ?? 'http://localhost:5233/openapi/v1.json'
const doc = source.startsWith('http') ? await (await fetch(source)).json() : JSON.parse(readFileSync(source, 'utf8'))
const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'shared', 'api')

const refName = (ref) => ref.split('/').pop()
const ident = (name) => name.replace(/[^A-Za-z0-9_]/g, '_')

function tsType(schema) {
  if (!schema) return 'unknown'
  if (schema.$ref) return ident(refName(schema.$ref))
  if (schema.oneOf || schema.anyOf) {
    const parts = [...new Set((schema.oneOf ?? schema.anyOf).flatMap((s) => tsType(s).split(' | ')))]
    const known = parts.filter((p) => p !== 'unknown')
    const nonNull = known.filter((p) => p !== 'null')
    return [...nonNull, ...(known.includes('null') ? ['null'] : [])].join(' | ') || 'unknown'
  }
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ')
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  const nullable = types.includes('null')
  const rest = types.filter((t) => t !== 'null')
  let base
  if (rest.includes('integer') || rest.includes('number')) base = 'number'
  else if (rest.includes('boolean')) base = 'boolean'
  else if (rest.includes('array')) base = `${wrap(tsType(schema.items))}[]`
  else if (rest.includes('object') || schema.properties) base = objectType(schema)
  else if (rest.includes('string')) base = schema.format === 'binary' ? 'File' : 'string'
  else if (nullable && rest.length === 0) return 'null'
  else base = 'unknown'
  return nullable ? `${base} | null` : base
}
const wrap = (t) => (t.includes('|') ? `(${t})` : t)

function objectType(schema) {
  if (!schema.properties) {
    return schema.additionalProperties && schema.additionalProperties !== true ? `Record<string, ${tsType(schema.additionalProperties)}>` : 'Record<string, unknown>'
  }
  const required = new Set(schema.required ?? [])
  const lines = Object.entries(schema.properties).map(([name, prop]) => {
    const doc = prop.description ? `  /** ${prop.description.replace(/\s+/g, ' ').replace(/\*\//g, '* /')} */\n` : ''
    return `${doc}  ${/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${tsType(prop)}`
  })
  return `{\n${lines.join('\n')}\n}`
}

let out = `/* TỆP TỰ SINH từ OpenAPI của backend (node scripts/gen-api-types.mjs). Không sửa tay.\n   Tiền là số nguyên đồng; ngày giờ là chuỗi ISO 8601. */\n/* eslint-disable */\n\n`
for (const [name, schema] of Object.entries(doc.components?.schemas ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
  const doc0 = schema.description ? `/** ${schema.description.replace(/\s+/g, ' ').replace(/\*\//g, '* /')} */\n` : ''
  const isObject = schema.properties || (Array.isArray(schema.type) ? schema.type.includes('object') : schema.type === 'object')
  out += isObject && schema.properties ? `${doc0}export interface ${ident(name)} ${objectType(schema)}\n\n` : `${doc0}export type ${ident(name)} = ${tsType(schema)}\n\n`
}
writeFileSync(join(outDir, 'api.gen.ts'), out)

const pick = (content) => content?.['application/json']?.schema ?? content?.['multipart/form-data']?.schema ?? Object.values(content ?? {})[0]?.schema
let md = `# Bảng endpoint (tự sinh từ OpenAPI, không sửa tay)\n\nKiểu dữ liệu ở \`api.gen.ts\`. \`[form]\` là multipart/form-data.\n`
const byTag = {}
for (const [path, item] of Object.entries(doc.paths)) {
  for (const [method, op] of Object.entries(item)) {
    if (!op || typeof op !== 'object' || !op.responses) continue
    const tag = op.tags?.[0] ?? 'Khác'
    const body = op.requestBody?.content
    const form = body && body['multipart/form-data'] ? ' [form]' : ''
    const req = body ? tsType(pick(body)) : ''
    const ok = Object.entries(op.responses).find(([code]) => code.startsWith('2'))
    const res = ok?.[1]?.content ? tsType(pick(ok[1].content)) : ''
    const query = (op.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name).join(', ')
    ;(byTag[tag] ??= []).push(`| ${method.toUpperCase()} | \`${path}\` | ${query} | ${req.replace(/\n\s*/g, ' ')}${form} | ${res.replace(/\n\s*/g, ' ')} | ${(op.summary ?? '').replace(/\|/g, '/')} |`)
  }
}
for (const tag of Object.keys(byTag).sort()) {
  md += `\n## ${tag}\n\n| Method | Path | Query | Body | Trả về | Ghi chú |\n|---|---|---|---|---|---|\n${byTag[tag].sort().join('\n')}\n`
}
writeFileSync(join(outDir, 'endpoints.gen.md'), md)
console.log(`Đã sinh ${Object.keys(doc.components?.schemas ?? {}).length} kiểu và ${Object.values(byTag).flat().length} endpoint.`)
