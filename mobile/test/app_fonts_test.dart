import 'package:crabshare_mobile/app/theme/app_theme.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

import 'helpers/operator_core_fixtures.dart';

/// Bề ngang của một dòng chữ mẫu có đủ dấu tiếng Việt và số tiền.
double _width(TextStyle style) {
  final painter = TextPainter(
    text: TextSpan(text: 'Việc hôm nay 120.200.000 đ', style: style.copyWith(fontSize: 40, letterSpacing: 0)),
    textDirection: TextDirection.ltr,
  )..layout();
  return painter.width;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadAppFonts);

  test('chữ thường: đậm hơn thì rộng hơn, tức là các tệp phông tĩnh được nhận đúng độ đậm', () {
    const regular = TextStyle(fontFamily: AppFonts.text, fontWeight: FontWeight.w400);
    const bold = TextStyle(fontFamily: AppFonts.text, fontWeight: FontWeight.w700);
    const extraBold = TextStyle(fontFamily: AppFonts.text, fontWeight: FontWeight.w800);
    expect(_width(bold), greaterThan(_width(regular)));
    expect(_width(extraBold), greaterThan(_width(bold)));
  });

  test('tiêu đề và con số lớn: phông biến thiên nhận trục độ hẹp và độ đậm', () {
    // Tệp biến thiên mặc định là opsz 96, wght 800; các tệp tĩnh là opsz 14. Vì vậy luôn ghi đủ ba trục.
    TextStyle display(double weight, double stretch, {double optical = 96}) => TextStyle(
      fontFamily: AppFonts.display,
      fontWeight: FontWeight(weight.round()),
      fontVariations: [FontVariation('wght', weight), FontVariation('wdth', stretch), FontVariation('opsz', optical)],
    );
    expect(_width(display(700, 80)), lessThan(_width(display(700, 100))));
    expect(_width(display(700, 100)), greaterThan(_width(display(400, 100))));
    expect(_width(display(700, 100)), lessThan(_width(display(700, 100, optical: 14))));
    // Cùng độ rộng và cỡ quang học, phông biến thiên phải trùng bề ngang với tệp tĩnh cùng độ đậm (không phải đậm giả).
    const regular = TextStyle(fontFamily: AppFonts.text, fontWeight: FontWeight.w400);
    const bold = TextStyle(fontFamily: AppFonts.text, fontWeight: FontWeight.w700);
    expect(_width(display(400, 100, optical: 14)), closeTo(_width(regular), _width(regular) * 0.01));
    expect(_width(display(700, 100, optical: 14)), closeTo(_width(bold), _width(bold) * 0.01));
  });

  test('kiểu tiêu đề và con số của app hẹp hơn chữ thường cùng cỡ', () {
    const bold = TextStyle(fontFamily: AppFonts.text, fontWeight: FontWeight.w700);
    expect(_width(AppFonts.figure(40)), lessThan(_width(bold)));
    expect(_width(AppFonts.heading(40)), lessThan(_width(bold)));
  });
}
