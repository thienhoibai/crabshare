import 'package:dio/dio.dart';

/// Các hàm đọc JSON gọn cho model viết tay. Backend trả camelCase; tiền là số nguyên đồng; ngày giờ là chuỗi ISO 8601.
/// Dùng trong `fromJson` của từng model: `code: str(j, 'batchCode'), amount: intOf(j, 'amount')`.
typedef Json = Map<String, dynamic>;

Json asJson(Object? value) => Map<String, dynamic>.from(value as Map);

Json? asJsonOrNull(Object? value) => value is Map ? Map<String, dynamic>.from(value) : null;

List<Json> asJsonList(Object? value) => [
  for (final item in (value as List?) ?? const []) asJson(item),
];

String str(Json j, String key, [String fallback = '']) => j[key]?.toString() ?? fallback;

String? strOrNull(Json j, String key) => j[key]?.toString();

int intOf(Json j, String key, [int fallback = 0]) => (j[key] as num?)?.round() ?? fallback;

int? intOrNull(Json j, String key) => (j[key] as num?)?.round();

double doubleOf(Json j, String key, [double fallback = 0]) => (j[key] as num?)?.toDouble() ?? fallback;

double? doubleOrNull(Json j, String key) => (j[key] as num?)?.toDouble();

bool boolOf(Json j, String key, [bool fallback = false]) => j[key] as bool? ?? fallback;

DateTime? dateOrNull(Json j, String key) => j[key] is String ? DateTime.tryParse(j[key] as String) : null;

DateTime dateOf(Json j, String key) => dateOrNull(j, key) ?? DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);

/// Trang kết quả phân trang của backend: `{items, page, pageSize, total}`.
class Paged<T> {
  const Paged({required this.items, required this.total, this.page = 1, this.pageSize = 20});
  final List<T> items;
  final int total;
  final int page;
  final int pageSize;

  factory Paged.fromJson(Json j, T Function(Json) item) => Paged(
    items: [for (final e in asJsonList(j['items'])) item(e)],
    total: intOf(j, 'total'),
    page: intOf(j, 'page', 1),
    pageSize: intOf(j, 'pageSize', 20),
  );
}

/// Gọi API trả JSON mà không phải lặp lại kiểu của Dio ở mỗi repository.
extension DioJson on Dio {
  Future<Json> getJson(String path, {Map<String, dynamic>? query}) async =>
      asJson((await get<dynamic>(path, queryParameters: _clean(query))).data);

  Future<List<Json>> getList(String path, {Map<String, dynamic>? query}) async =>
      asJsonList((await get<dynamic>(path, queryParameters: _clean(query))).data);

  /// POST trả về object; API trả 204 hoặc thân rỗng thì nhận map rỗng.
  Future<Json> postJson(String path, {Object? data}) async =>
      asJsonOrNull((await post<dynamic>(path, data: data)).data) ?? <String, dynamic>{};

  Future<Json> putJson(String path, {Object? data}) async =>
      asJsonOrNull((await put<dynamic>(path, data: data)).data) ?? <String, dynamic>{};
}

Map<String, dynamic>? _clean(Map<String, dynamic>? query) {
  if (query == null) return null;
  return {
    for (final e in query.entries)
      if (e.value != null && e.value.toString().isNotEmpty) e.key: e.value,
  };
}
