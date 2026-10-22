enum ShellCondition {
  hardShell('HardShell', 'Vỏ cứng'),
  softShell('SoftShell', 'Vỏ mềm');

  const ShellCondition(this.apiValue, this.label);
  final String apiValue, label;
}

class HarvestInput {
  const HarvestInput({
    required this.harvestId,
    required this.requestId,
    required this.slotCode,
    required this.expectedCrabItemId,
    required this.weightG,
    required this.shellCondition,
  });
  final int harvestId, expectedCrabItemId, weightG;
  final String requestId, slotCode;
  final ShellCondition shellCondition;
  Map<String, dynamic> toJson() => {
    'requestId': requestId,
    'slotCode': slotCode,
    'expectedCrabItemId': expectedCrabItemId,
    'weightG': weightG,
    'shellCondition': shellCondition.apiValue,
  };
}

class HarvestSession {
  HarvestSession.fromJson(Map<String, dynamic> json)
    : id = json['id'] as int,
      batchCode = json['batchCode'] as String,
      name = json['name'] as String?,
      note = json['note'] as String?,
      status = json['status'] as String,
      startedAt = _date(json['startedAt']),
      completedAt = _date(json['completedAt']),
      declaredBy = json['declaredBy'] as int?,
      completedBy = json['completedBy'] as int?,
      harvestedCount = json['harvestedCount'] as int,
      totalWeightKg = (json['totalWeightKg'] as num).toDouble(),
      gradeSummaries = (json['gradeSummaries'] as List? ?? const [])
          .map((item) => HarvestGradeSummary.fromJson(Map<String, dynamic>.from(item as Map)))
          .toList(),
      revision = json['revision'] as int,
      canRecord = json['canRecord'] as bool,
      canComplete = json['canComplete'] as bool;
  final int id, harvestedCount, revision;
  final int? declaredBy, completedBy;
  final String batchCode, status;
  final String? name, note;
  final DateTime? startedAt, completedAt;
  final double totalWeightKg;
  final List<HarvestGradeSummary> gradeSummaries;
  final bool canRecord, canComplete;
  String get displayName => name?.isNotEmpty == true ? name! : 'Đợt #$id';
  String get statusLabel => switch (status) {
    'Open' => 'Đang mở',
    'Completed' => 'Đã chốt',
    _ => 'Lịch sử chưa xác định',
  };
}

class HarvestGradeSummary {
  HarvestGradeSummary.fromJson(Map<String, dynamic> json)
    : gradeCode = json['gradeCode'] as String,
      gradeName = json['gradeName'] as String,
      crabCount = json['crabCount'] as int,
      totalWeightKg = (json['totalWeightKg'] as num).toDouble();
  final String gradeCode, gradeName;
  final int crabCount;
  final double totalWeightKg;
}

class HarvestCrab {
  HarvestCrab.fromJson(Map<String, dynamic> json)
    : id = json['id'] as int,
      itemUuid = json['itemUuid'] as String,
      allocationId = json['allocationId'] as int;
  final int id, allocationId;
  final String itemUuid;
}

class HarvestContext {
  HarvestContext.fromJson(Map<String, dynamic> json)
    : batchCode = json['batchCode'] as String,
      batchStatus = json['batchStatus'] as String,
      activeHarvest = json['activeHarvest'] == null
          ? null
          : HarvestSession.fromJson(
              Map<String, dynamic>.from(json['activeHarvest'] as Map),
            ),
      canStart = json['canStart'] as bool,
      canRecord = json['canRecord'] as bool,
      canComplete = json['canComplete'] as bool,
      remainingGrowingCount = json['remainingGrowingCount'] as int,
      harvestedCount = json['harvestedCount'] as int,
      totalWeightKg = (json['totalWeightKg'] as num).toDouble(),
      slotStatus = json['slotStatus'] as String?,
      currentCrab = json['currentCrab'] == null
          ? null
          : HarvestCrab.fromJson(
              Map<String, dynamic>.from(json['currentCrab'] as Map),
            ),
      latestMoltedAt = _date(json['latestMoltedAt']);
  final String batchCode, batchStatus;
  final HarvestSession? activeHarvest;
  final bool canStart, canRecord, canComplete;
  final int remainingGrowingCount, harvestedCount;
  final double totalWeightKg;
  final String? slotStatus;
  final HarvestCrab? currentCrab;
  final DateTime? latestMoltedAt;
}

/// Snapshot returned by the server. Legacy rows may lack event-time fields.
class HarvestedCrab {
  HarvestedCrab.fromJson(Map<String, dynamic> json)
    : crabItemId = json['crabItemId'] as int,
      itemUuid = json['itemUuid'] as String,
      harvestId = json['harvestId'] as int,
      batchCode = json['batchCode'] as String,
      slotCode = json['slotCode'] as String?,
      weightG = json['weightG'] as int?,
      shellCondition = json['shellCondition'] as String?,
      gradeCode = json['gradeCode'] as String?,
      gradeName = json['gradeName'] as String?,
      tagCode = json['tagCode'] as String?,
      tagStatus = json['tagStatus'] as String?,
      tracePath = json['tracePath'] as String?,
      recordedAt = _date(json['recordedAt']),
      harvestedCount = json['harvestedCount'] as int?,
      totalWeightKg = (json['totalWeightKg'] as num?)?.toDouble(),
      remainingGrowingCount = json['remainingGrowingCount'] as int?;
  final int crabItemId, harvestId;
  final String itemUuid, batchCode;
  final String? slotCode,
      shellCondition,
      gradeCode,
      gradeName,
      tagCode,
      tagStatus,
      tracePath;
  final int? weightG, harvestedCount, remainingGrowingCount;
  final double? totalWeightKg;
  final DateTime? recordedAt;
}

class HarvestPageResult<T> {
  HarvestPageResult.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) decode,
  ) : items = (json['items'] as List)
          .map((item) => decode(Map<String, dynamic>.from(item as Map)))
          .toList(),
      total = json['total'] as int,
      page = json['page'] as int,
      pageSize = json['pageSize'] as int;
  final List<T> items;
  final int total, page, pageSize;
  bool get hasNext => page * pageSize < total;
}

DateTime? _date(Object? value) =>
    value == null ? null : DateTime.parse(value as String);
