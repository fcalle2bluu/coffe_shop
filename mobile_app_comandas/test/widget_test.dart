import 'package:flutter_test/flutter_test.dart';

import 'package:mobile_app_comandas/main.dart';

void main() {
  testWidgets('App arranca y muestra el splash de verificación de sesión', (WidgetTester tester) async {
    await tester.pumpWidget(const CocinaApp());
    await tester.pump();

    expect(find.byType(CocinaApp), findsOneWidget);
  });
}
