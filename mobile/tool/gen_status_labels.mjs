// Sinh lib/shared/status_labels.dart từ bảng nhãn của web (web/src/shared/ui/console/status.ts),
// để web và app dùng cùng một bộ nhãn tiếng Việt cho mã trạng thái của backend.
// Chạy: node tool/gen_status_labels.mjs   (từ thư mục mobile/)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', '..', 'web', 'src', 'shared', 'ui', 'console', 'status.ts'), 'utf8')
const start = source.indexOf('const MAPS = {') + 'const MAPS = '.length
const end = source.indexOf('} satisfies')
const maps = new Function(`return ${source.slice(start, end + 1)}`)()

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
let out = `// TỆP TỰ SINH bằng tool/gen_status_labels.mjs từ web/src/shared/ui/console/status.ts. Không sửa tay.
// Nhãn tiếng Việt và sắc thái cho các mã trạng thái backend trả về (BR v1.5).
import 'package:material_ui/material_ui.dart';

import '../app/theme/app_theme.dart';

/// Sắc thái của một trạng thái, đổi sang màu bằng [toneColor].
enum Tone { ok, warn, info, mute, gold, danger }

Color toneColor(Tone tone) => switch (tone) {
  Tone.ok => AppColors.success,
  Tone.warn => AppColors.warning,
  Tone.info => AppColors.info,
  Tone.gold => AppColors.accentText,
  Tone.danger => AppColors.danger,
  Tone.mute => AppColors.inkMuted,
};

const Map<String, Map<String, (String, Tone)>> _maps = {
`
for (const [kind, entries] of Object.entries(maps)) {
  out += `  ${q(kind)}: {\n`
  for (const [code, [label, tone]] of Object.entries(entries)) out += `    ${q(code)}: (${q(label)}, Tone.${tone}),\n`
  out += `  },\n`
}
out += `};

/// Nhãn tiếng Việt của một mã trạng thái; mã chưa có trong bảng thì trả nguyên mã.
/// Ví dụ: statusLabel('batch', 'Funding') → 'Đang gọi vốn'.
String statusLabel(String kind, String? value) => value == null ? '' : _maps[kind]?[value]?.$1 ?? value;

/// Sắc thái của một mã trạng thái; mã lạ thì trung tính.
Tone statusTone(String kind, String? value) => _maps[kind]?[value]?.$2 ?? Tone.mute;

/// Các mã của một nhóm kèm nhãn, để dựng ô chọn.
List<(String, String)> statusOptions(String kind) => [
  for (final e in (_maps[kind] ?? const <String, (String, Tone)>{}).entries) (e.key, e.value.$1),
];

/// Tên quy cách dễ đọc: "Cua gạch · Size XL · Cấp 1".
String specName(String? crabType, String? sizeCode, String? gradeCode) => [
  if (crabType != null && crabType.isNotEmpty) statusLabel('crabType', crabType),
  if (sizeCode != null && sizeCode.isNotEmpty) statusLabel('sizeCode', sizeCode),
  if (gradeCode != null && gradeCode.isNotEmpty) statusLabel('gradeCode', gradeCode),
].join(' · ');
`
writeFileSync(join(here, '..', 'lib', 'shared', 'status_labels.dart'), out)
console.log(`Đã sinh ${Object.keys(maps).length} nhóm nhãn.`)
