class ProductionThresholdVersion {
  const ProductionThresholdVersion({
    required this.id,
    required this.versionNo,
    required this.phMin,
    required this.phMax,
    required this.waterTempMinC,
    required this.waterTempMaxC,
    required this.salinityMinPpt,
    required this.salinityMaxPpt,
    required this.createdBy,
    required this.createdAt,
  });

  final int id;
  final int versionNo;
  final double phMin;
  final double phMax;
  final double waterTempMinC;
  final double waterTempMaxC;
  final double salinityMinPpt;
  final double salinityMaxPpt;
  final int createdBy;
  final DateTime createdAt;

  factory ProductionThresholdVersion.fromJson(Map<String, dynamic> json) =>
      ProductionThresholdVersion(
        id: json['id'] as int,
        versionNo: json['versionNo'] as int,
        phMin: (json['phMin'] as num).toDouble(),
        phMax: (json['phMax'] as num).toDouble(),
        waterTempMinC: (json['waterTempMinC'] as num).toDouble(),
        waterTempMaxC: (json['waterTempMaxC'] as num).toDouble(),
        salinityMinPpt: (json['salinityMinPpt'] as num).toDouble(),
        salinityMaxPpt: (json['salinityMaxPpt'] as num).toDouble(),
        createdBy: json['createdBy'] as int,
        createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      );
}

class ProductionThresholds {
  const ProductionThresholds({
    required this.businessDate,
    required this.canConfigure,
    required this.canRecord,
    required this.current,
  });

  final DateTime businessDate;
  final bool canConfigure;
  final bool canRecord;
  final ProductionThresholdVersion? current;

  factory ProductionThresholds.fromJson(Map<String, dynamic> json) =>
      ProductionThresholds(
        businessDate: DateTime.parse(json['businessDate'] as String),
        canConfigure: json['canConfigure'] as bool,
        canRecord: json['canRecord'] as bool,
        current: json['current'] == null
            ? null
            : ProductionThresholdVersion.fromJson(
                Map<String, dynamic>.from(json['current'] as Map),
              ),
      );
}

class ProductionThresholdInput {
  const ProductionThresholdInput({
    required this.expectedVersionNo,
    required this.phMin,
    required this.phMax,
    required this.waterTempMinC,
    required this.waterTempMaxC,
    required this.salinityMinPpt,
    required this.salinityMaxPpt,
  });

  final int expectedVersionNo;
  final double phMin;
  final double phMax;
  final double waterTempMinC;
  final double waterTempMaxC;
  final double salinityMinPpt;
  final double salinityMaxPpt;

  Map<String, dynamic> toJson() => {
    'expectedVersionNo': expectedVersionNo,
    'phMin': phMin,
    'phMax': phMax,
    'waterTempMinC': waterTempMinC,
    'waterTempMaxC': waterTempMaxC,
    'salinityMinPpt': salinityMinPpt,
    'salinityMaxPpt': salinityMaxPpt,
  };
}
