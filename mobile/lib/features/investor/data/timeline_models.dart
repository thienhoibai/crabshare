Map<String, dynamic> _map(dynamic value) => Map<String, dynamic>.from(value as Map);
DateTime? _date(dynamic value) => value == null ? null : DateTime.parse(value as String);
double? _number(dynamic value) => (value as num?)?.toDouble();

class TimelineLog {
  TimelineLog(Map<String, dynamic> json)
    : ph = _number(json['ph']), waterTempC = _number(json['waterTempC']),
      salinityPpt = _number(json['salinityPpt']), feedKg = _number(json['feedKg']),
      source = json['source'] as String, plausibilityFlag = json['plausibilityFlag'] as String,
      note = json['note'] as String?;
  final double? ph, waterTempC, salinityPpt, feedKg;
  final String source, plausibilityFlag;
  final String? note;
}

class TimelineSlot {
  TimelineSlot(Map<String, dynamic> json)
    : eventType = json['eventType'] as String, slotCode = json['slotCode'] as String,
      destinationSlotCode = json['destinationSlotCode'] as String?,
      quantity = (json['quantity'] as num).toInt(), note = json['note'] as String?;
  final String eventType, slotCode;
  final String? destinationSlotCode, note;
  final int quantity;
}

class TimelineEvidence {
  TimelineEvidence(Map<String, dynamic> json)
    : mediaType = json['mediaType'] as String, source = json['source'] as String,
      reviewStatus = json['reviewStatus'] as String, fileUrl = json['fileUrl'] as String,
      slotCode = json['slotCode'] as String?;
  final String mediaType, source, reviewStatus, fileUrl;
  final String? slotCode;
}

class TimelineAlert {
  TimelineAlert(Map<String, dynamic> json)
    : type = json['type'] as String, severity = json['severity'] as String,
      message = json['message'] as String, status = json['status'] as String,
      acknowledgedAt = _date(json['acknowledgedAt']), escalatedAt = _date(json['escalatedAt']);
  final String type, severity, message, status;
  final DateTime? acknowledgedAt, escalatedAt;
}

class TimelineItem {
  TimelineItem.fromJson(Map<String, dynamic> json)
    : id = json['id'] as String, type = json['type'] as String,
      sourceId = json['sourceId'] as String, businessDate = json['businessDate'] as String,
      occurredAt = _date(json['occurredAt']), timeBasis = json['timeBasis'] as String,
      productionLog = json['productionLog'] == null ? null : TimelineLog(_map(json['productionLog'])),
      slotEvent = json['slotEvent'] == null ? null : TimelineSlot(_map(json['slotEvent'])),
      evidence = json['evidence'] == null ? null : TimelineEvidence(_map(json['evidence'])),
      alert = json['alert'] == null ? null : TimelineAlert(_map(json['alert']));
  final String id, type, sourceId, businessDate, timeBasis;
  final DateTime? occurredAt;
  final TimelineLog? productionLog;
  final TimelineSlot? slotEvent;
  final TimelineEvidence? evidence;
  final TimelineAlert? alert;
}

class TimelineDay {
  const TimelineDay(this.date, this.items);
  factory TimelineDay.fromJson(Map<String, dynamic> json) => TimelineDay(
    json['date'] as String,
    (json['items'] as List).map((v) => TimelineItem.fromJson(_map(v))).toList(),
  );
  final String date;
  final List<TimelineItem> items;
}

class TimelinePage {
  TimelinePage.fromJson(Map<String, dynamic> json)
    : batchCode = json['batchCode'] as String, timeZone = json['timeZone'] as String,
      groups = (json['groups'] as List).map((v) => TimelineDay.fromJson(_map(v))).toList(),
      nextBefore = json['nextBefore'] as String?, hasMore = json['hasMore'] as bool;
  final String batchCode, timeZone;
  final List<TimelineDay> groups;
  final String? nextBefore;
  final bool hasMore;
}

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

String timelineTime(DateTime value) {
  final vietnam = value.toUtc().add(const Duration(hours: 7));
  return '${vietnam.hour.toString().padLeft(2, '0')}:${vietnam.minute.toString().padLeft(2, '0')}';
}
String timelineDate(String date) => '${date.substring(8, 10)}/${date.substring(5, 7)}/${date.substring(0, 4)}';
const timelineSlotLabels = {'Stocked': 'Thả giống', 'Molted': 'Lột xác', 'Mortality': 'Ghi nhận hao hụt', 'Restocked': 'Thả bù', 'Harvested': 'Thu hoạch', 'Relocated': 'Chuyển hộp'};
const timelineAlertLabels = {'WaterQuality': 'Chất lượng nước', 'Mortality': 'Hao hụt', 'DataSilence': 'Thiếu nhật ký', 'MilestoneDelay': 'Chậm mốc sản xuất', 'LowStock': 'Tồn kho thấp', 'EvidenceFlag': 'Cần kiểm tra bằng chứng'};
const timelineStatusLabels = {'Open': 'Chờ phản hồi', 'Acknowledged': 'Đã phản hồi', 'Escalated': 'Đã chuyển quản trị', 'Resolved': 'Đã xử lý'};
const timelineSeverityLabels = {'Low': 'Thấp', 'Medium': 'Trung bình', 'High': 'Cao', 'Critical': 'Nghiêm trọng'};
