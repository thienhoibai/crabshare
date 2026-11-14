import '../../../core/api/json.dart';

/// Nhật ký chăm sóc của một ngày.
class TimelineLog {
  TimelineLog(Json j)
    : ph = doubleOrNull(j, 'ph'),
      waterTempC = doubleOrNull(j, 'waterTempC'),
      salinityPpt = doubleOrNull(j, 'salinityPpt'),
      feedKg = doubleOrNull(j, 'feedKg'),
      plausibilityFlag = str(j, 'plausibilityFlag', 'Ok'),
      note = strOrNull(j, 'note');
  final double? ph, waterTempC, salinityPpt, feedKg;
  final String plausibilityFlag;
  final String? note;
}

/// Sự kiện theo hộp nuôi (dữ liệu của các Lô trước v1.5).
class TimelineSlot {
  TimelineSlot(Json j)
    : eventType = str(j, 'eventType'),
      slotCode = str(j, 'slotCode'),
      destinationSlotCode = strOrNull(j, 'destinationSlotCode'),
      quantity = intOf(j, 'quantity'),
      note = strOrNull(j, 'note');
  final String eventType, slotCode;
  final String? destinationSlotCode, note;
  final int quantity;
}

/// Bằng chứng đã được chấp nhận.
class TimelineEvidence {
  TimelineEvidence(Json j)
    : mediaType = str(j, 'mediaType'),
      reviewStatus = str(j, 'reviewStatus'),
      slotCode = strOrNull(j, 'slotCode');
  final String mediaType, reviewStatus;
  final String? slotCode;

  bool get isPhoto => mediaType == 'Photo';
}

class TimelineAlert {
  TimelineAlert(Json j)
    : type = str(j, 'type'),
      severity = str(j, 'severity'),
      message = str(j, 'message'),
      status = str(j, 'status');
  final String type, severity, message, status;
}

/// Sự kiện của một con cua: nhận, xếp hộp, chết, lột, phân hạng, giao, bán.
class TimelineCrabEvent {
  TimelineCrabEvent(Json j)
    : eventType = str(j, 'eventType'),
      crabCode = str(j, 'crabCode'),
      slotCode = strOrNull(j, 'slotCode'),
      source = str(j, 'source'),
      reason = strOrNull(j, 'reason');
  final String eventType, crabCode, source;
  final String? slotCode, reason;
}

class TimelineItem {
  TimelineItem.fromJson(Json j)
    : id = str(j, 'id'),
      type = str(j, 'type'),
      sourceId = str(j, 'sourceId'),
      occurredAt = dateOrNull(j, 'occurredAt'),
      productionLog = _part(j, 'productionLog', TimelineLog.new),
      slotEvent = _part(j, 'slotEvent', TimelineSlot.new),
      evidence = _part(j, 'evidence', TimelineEvidence.new),
      alert = _part(j, 'alert', TimelineAlert.new),
      crabEvent = _part(j, 'crabEvent', TimelineCrabEvent.new);
  final String id, type, sourceId;
  final DateTime? occurredAt;
  final TimelineLog? productionLog;
  final TimelineSlot? slotEvent;
  final TimelineEvidence? evidence;
  final TimelineAlert? alert;
  final TimelineCrabEvent? crabEvent;

  /// Loại ghi nhận để gom các ghi nhận giống nhau trong một ngày (ví dụ 288 lần thả cua vào hộp).
  String get groupKey => switch (this) {
    TimelineItem(:final crabEvent?) => 'CrabEvent:${crabEvent.eventType}',
    TimelineItem(:final slotEvent?) => 'SlotEvent:${slotEvent.eventType}',
    TimelineItem(:final evidence?) => 'Evidence:${evidence.mediaType}',
    TimelineItem(:final alert?) => 'Alert:${alert.type}',
    _ => type,
  };

  static T? _part<T>(Json j, String key, T Function(Json) build) {
    final value = asJsonOrNull(j[key]);
    return value == null ? null : build(value);
  }
}

class TimelineDay {
  const TimelineDay(this.date, this.items);
  factory TimelineDay.fromJson(Json j) => TimelineDay(
    str(j, 'date'),
    [for (final item in asJsonList(j['items'])) TimelineItem.fromJson(item)],
  );

  /// Ngày theo giờ Việt Nam, dạng yyyy-MM-dd.
  final String date;
  final List<TimelineItem> items;
}

class TimelinePage {
  TimelinePage.fromJson(Json j)
    : batchCode = str(j, 'batchCode'),
      groups = [for (final g in asJsonList(j['groups'])) TimelineDay.fromJson(g)],
      nextBefore = strOrNull(j, 'nextBefore'),
      hasMore = boolOf(j, 'hasMore');
  final String batchCode;
  final List<TimelineDay> groups;
  final String? nextBefore;
  final bool hasMore;
}

/// Gộp các trang đã tải thành nhóm ngày, ngày mới nhất ở trên, bỏ ghi nhận trùng.
List<TimelineDay> mergeTimelineDays(List<TimelineDay> previous, List<TimelineDay> incoming) {
  final seen = <String>{};
  final byDate = <String, List<TimelineItem>>{};
  for (final group in [...previous, ...incoming]) {
    for (final item in group.items) {
      if (seen.add(item.id)) (byDate[group.date] ??= []).add(item);
    }
  }
  final dates = byDate.keys.toList()..sort((a, b) => b.compareTo(a));
  return [for (final date in dates) TimelineDay(date, byDate[date]!)];
}

/// Giờ Việt Nam (UTC+7) của một ghi nhận, không phụ thuộc múi giờ của máy.
String timelineTime(DateTime value) {
  final vietnam = value.toUtc().add(const Duration(hours: 7));
  return '${vietnam.hour.toString().padLeft(2, '0')}:${vietnam.minute.toString().padLeft(2, '0')}';
}

/// "2026-10-20" → "20/10/2026".
String timelineDate(String date) =>
    date.length < 10 ? date : '${date.substring(8, 10)}/${date.substring(5, 7)}/${date.substring(0, 4)}';

/// Nhãn của các mã chỉ xuất hiện trong nhật trình (status_labels.dart chưa có nhóm tương ứng).
const timelineSlotLabels = {
  'Stocked': 'Thả cua vào hộp',
  'Molted': 'Cua lột xác',
  'Mortality': 'Ghi nhận cua chết',
  'Restocked': 'Thả bù',
  'Harvested': 'Thu hoạch',
  'Relocated': 'Chuyển hộp',
};

const timelineCrabEventLabels = {
  'Received': 'Nhận cua về trại',
  'Boxed': 'Xếp vào hộp',
  'Moved': 'Chuyển hộp',
  'AbnormalFeeding': 'Ăn bất thường',
  'Inspected': 'Kiểm tra',
  'Died': 'Cua chết',
  'Molted': 'Lột xác',
  'Graded': 'Đã phân hạng',
  'Downgraded': 'Hạ hạng',
  'Shipped': 'Xuất hàng',
  'Delivered': 'Đã giao',
  'Sold': 'Đã bán',
  'Destroyed': 'Loại bỏ',
  'Returned': 'Trả về tồn',
};

const timelineMediaLabels = {'Photo': 'Ảnh bằng chứng', 'Video': 'Video bằng chứng', 'Invoice': 'Chứng từ'};
