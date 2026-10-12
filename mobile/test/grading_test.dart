import 'package:crabshare_mobile/features/operator/harvest/grading.dart';
import 'package:crabshare_mobile/shared/models/batch_enums.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('gradeFor — khớp bảng product_grade (V002)', () {
    Grade g(int w) => gradeFor(weightG: w, crabType: CrabType.fattening);

    test('biên của từng hạng', () {
      expect(g(500), Grade.l1);
      expect(g(499), Grade.l2);
      expect(g(350), Grade.l2);
      expect(g(349), Grade.l3);
      expect(g(250), Grade.l3);
      expect(g(249), Grade.l4);
      expect(g(1), Grade.l4);
    });

    test('cua lột luôn là SOFT', () {
      expect(gradeFor(weightG: 600, crabType: CrabType.softShell), Grade.soft);
    });
  });
}
